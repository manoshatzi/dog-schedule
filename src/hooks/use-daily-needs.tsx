import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import { getCalendars } from "expo-localization";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AccountGate, type AccountGateMode } from "@/components/account-gate";
import { hideSplash } from "@/components/splash-overlay";
import { useToast } from "@/components/toast";
import { t } from "@/i18n";
import type {
  Database,
  TransitionAction,
  TransitionError,
  TransitionResult,
} from "@/lib/database.types";
import { unregisterPushToken } from "@/lib/push";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getExpectedActor,
  toDateKey,
  type BookingRepeat,
  type ClaimSeries,
  type DailyNeed,
  type DailyNeedInput,
  type DailyNeedOccurrence,
  type Dog,
  type HouseholdMember,
} from "@/lib/tasks";

export type {
  BookingRepeat,
  ClaimSeries,
  DailyNeed,
  DailyNeedInput,
  DailyNeedOccurrence,
  DailyNeedType,
  Dog,
  HouseholdMember,
  NeedOccurrenceStatus,
} from "@/lib/tasks";

export type Household = { id: string; name: string; inviteCode: string };

export type TransitionOptions = {
  assignedUserId?: string;
  repeatRule?: BookingRepeat;
  reminderEnabled?: boolean;
  releaseScope?: "day" | "series";
};

export type TransitionOutcome =
  | { ok: true; occurrence: DailyNeedOccurrence }
  | { ok: false; error: TransitionError; occurrence: DailyNeedOccurrence };

type DailyNeedRow = Database["public"]["Tables"]["daily_needs"]["Row"];
type OccurrenceRow =
  Database["public"]["Tables"]["daily_need_occurrences"]["Row"];
type ClaimSeriesRow = Database["public"]["Tables"]["claim_series"]["Row"];
type DogRow = Database["public"]["Tables"]["dogs"]["Row"];

type AppStatus =
  | "loading"
  | "signed-out"
  | "check-email"
  | "needs-household"
  | "ready"
  | "error";

type DailyNeedsContextValue = {
  needs: DailyNeed[];
  occurrences: DailyNeedOccurrence[];
  series: ClaimSeries[];
  household: Household;
  dog: Dog;
  members: HouseholdMember[];
  email: string;
  userId: string;
  saveNeed: (input: DailyNeedInput) => Promise<void>;
  archiveNeed: (needId: string) => Promise<void>;
  transition: (
    need: DailyNeed,
    current: DailyNeedOccurrence,
    action: TransitionAction,
    options?: TransitionOptions,
  ) => Promise<TransitionOutcome>;
  loadOccurrences: (from: string, to: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const DailyNeedsContext = createContext<DailyNeedsContextValue | null>(null);

const needColumns =
  "id, household_id, dog_id, title, time, details, required, type, duration_minutes, repeat_days, amount_value, amount_unit, one_off_date, default_assignee_id, reminder_minutes_before, archived_at, created_at";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Something went wrong.";
}

function toDailyNeed(row: DailyNeedRow): DailyNeed {
  return {
    id: row.id,
    dogId: row.dog_id,
    title: row.title,
    time: row.time.slice(0, 5),
    details: row.details,
    required: row.required,
    type: row.type,
    durationMinutes: row.duration_minutes,
    repeatDays: row.repeat_days,
    amountValue: row.amount_value === null ? null : Number(row.amount_value),
    amountUnit: row.amount_unit,
    oneOffDate: row.one_off_date,
    defaultAssigneeId: row.default_assignee_id,
    reminderMinutesBefore: row.reminder_minutes_before,
  };
}

function toOccurrence(row: OccurrenceRow): DailyNeedOccurrence {
  return {
    needId: row.daily_need_id,
    date: row.occurrence_date,
    status: row.status,
    bookedBy: row.booked_by,
    bookedName: row.booked_name,
    assignedUserId: row.assigned_user_id,
    assignedName: row.assigned_name,
    repeatRule: row.repeat_rule,
    reminderEnabled: row.reminder_enabled,
    completedBy: row.completed_by,
    completedName: row.completed_name,
    completedAt: row.completed_at,
    previousStatus: row.previous_status ?? null,
  };
}

function toSeries(row: ClaimSeriesRow): ClaimSeries {
  return {
    id: row.id,
    needId: row.daily_need_id,
    assignedUserId: row.assigned_user_id,
    assignedName: row.assigned_name,
    repeatRule: row.repeat_rule,
    weekday: row.weekday,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reminderEnabled: row.reminder_enabled,
    createdBy: row.created_by,
  };
}

function toDog(
  row: Pick<DogRow, "id" | "name" | "birthday" | "photo_path">,
): Dog {
  return {
    id: row.id,
    name: row.name,
    birthday: row.birthday,
    photoPath: row.photo_path,
  };
}

function sortNeeds(needs: DailyNeed[]) {
  return [...needs].sort((first, second) =>
    first.time.localeCompare(second.time),
  );
}

function upsertOccurrence(
  list: DailyNeedOccurrence[],
  next: DailyNeedOccurrence,
) {
  return [
    ...list.filter(
      (item) => item.needId !== next.needId || item.date !== next.date,
    ),
    next,
  ];
}

/** Reads tokens or a PKCE code from an email link (confirm or recovery). */
function parseAuthUrl(url: string) {
  const params: Record<string, string> = {};
  const parts = url.split(/[?#]/).slice(1);
  for (const part of parts) {
    for (const pair of part.split("&")) {
      const [key, value = ""] = pair.split("=");
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

async function getHousehold(
  userId: string,
): Promise<{ household: Household; dog: Dog } | null> {
  const supabase = getSupabaseClient();
  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return null;

  const [householdResult, dogResult] = await Promise.all([
    supabase
      .from("households")
      .select("id, name, invite_code, timezone")
      .eq("id", membership.household_id)
      .single(),
    supabase
      .from("dogs")
      .select("id, name, birthday, photo_path")
      .eq("household_id", membership.household_id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  if (householdResult.error) throw householdResult.error;
  if (dogResult.error) throw dogResult.error;
  const data = householdResult.data;
  // Reminders and quiet hours run on the family's clock. The first device
  // to open the app after creating (or the push migration) sets it.
  if (!data.timezone) void setFamilyTimezone();
  return {
    household: { id: data.id, name: data.name, inviteCode: data.invite_code },
    // Before the dog row exists (migration not applied) fall back to the
    // family name, which used to be the dog's name.
    dog: dogResult.data
      ? toDog(dogResult.data)
      : { id: "", name: data.name, birthday: null, photoPath: null },
  };
}

function getDeviceTimezone() {
  try {
    return (
      getCalendars()[0]?.timeZone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  } catch {
    return null;
  }
}

async function setFamilyTimezone() {
  const timezone = getDeviceTimezone();
  if (!timezone) return;
  const { error } = await getSupabaseClient().rpc("set_family_timezone", {
    new_timezone: timezone,
  });
  // Older databases without the push migration: nothing to do.
  if (error && __DEV__)
    console.warn("set_family_timezone failed", error.message);
}

function getAuthRedirectUrl() {
  return Linking.createURL("/");
}

export function DailyNeedsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AppStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [dog, setDog] = useState<Dog | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [needs, setNeeds] = useState<DailyNeed[]>([]);
  const [occurrences, setOccurrences] = useState<DailyNeedOccurrence[]>([]);
  const [series, setSeries] = useState<ClaimSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sessionUserIdRef = useRef<string | null>(null);
  const [configurationError] = useState(() => {
    try {
      getSupabaseClient();
      return null;
    } catch (clientError) {
      return getErrorMessage(clientError);
    }
  });
  const userId = session?.user.id ?? null;
  const ageConfirmed = session?.user.user_metadata?.age_confirmed === true;

  useEffect(() => {
    let active = true;
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setStatus("error");
        return;
      }
      sessionUserIdRef.current = data.session?.user.id ?? null;
      setSession(data.session);
      if (!data.session) setStatus("signed-out");
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      const previousUserId = sessionUserIdRef.current;
      sessionUserIdRef.current = nextSession?.user.id ?? null;
      setSession(nextSession);
      // Token refreshes and profile updates keep the app mounted; only a
      // different user (or sign-out) resets the data.
      if (previousUserId === (nextSession?.user.id ?? null)) return;
      setError(null);
      setNotice(null);
      if (nextSession) {
        setStatus("loading");
      } else {
        setHousehold(null);
        setDog(null);
        setMembers([]);
        setNeeds([]);
        setOccurrences([]);
        setSeries([]);
        setRecovering(false);
        setStatus((current) =>
          current === "check-email" ? current : "signed-out",
        );
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configurationError]);

  // Email confirmation and password-reset links open the app with tokens.
  useEffect(() => {
    if (configurationError) return;
    let active = true;

    async function handleUrl(url: string | null) {
      if (!url || !active) return;
      const params = parseAuthUrl(url);
      const supabase = getSupabaseClient();
      if (params.error_description) {
        setError(params.error_description.replace(/\+/g, " "));
        return;
      }
      if (params.type === "recovery") setRecovering(true);
      if (params.access_token && params.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (sessionError) setError(sessionError.message);
      } else if (params.code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) setError(exchangeError.message);
      }
    }

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [configurationError]);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    getHousehold(userId)
      .then((current) => {
        if (!active) return;
        setHousehold(current?.household ?? null);
        setDog(current?.dog ?? null);
        setStatus(current ? "ready" : "needs-household");
      })
      .catch((householdError: unknown) => {
        if (!active) return;
        setError(getErrorMessage(householdError));
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  const householdId = household?.id ?? null;

  const loadSeries = useCallback(async () => {
    if (!householdId) return;
    const { data, error: seriesError } = await getSupabaseClient()
      .from("claim_series")
      .select("*")
      .eq("household_id", householdId);
    if (seriesError) throw seriesError;
    setSeries(data.map(toSeries));
  }, [householdId]);

  useEffect(() => {
    if (!householdId || !userId) return;
    let active = true;
    const occurrenceDate = toDateKey(new Date());

    const loadAll = async () => {
      const supabase = getSupabaseClient();
      const [needResult, memberResult, occurrenceResult] = await Promise.all([
        supabase
          .from("daily_needs")
          .select(needColumns)
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("time"),
        supabase.rpc("get_family_members"),
        supabase
          .from("daily_need_occurrences")
          .select("*")
          .eq("household_id", householdId)
          .eq("occurrence_date", occurrenceDate),
      ]);

      if (needResult.error) throw needResult.error;
      if (memberResult.error) throw memberResult.error;
      if (occurrenceResult.error) throw occurrenceResult.error;
      if (!active) return;
      setNeeds(sortNeeds(needResult.data.map(toDailyNeed)));
      setMembers(
        memberResult.data.map((member, index) => ({
          userId: member.user_id,
          name: member.display_name,
          role: member.role,
          colorIndex: index,
        })),
      );
      setOccurrences(occurrenceResult.data.map(toOccurrence));
      await loadSeries();
    };

    loadAll().catch((loadError: unknown) => {
      if (!active) return;
      setError(getErrorMessage(loadError));
      setStatus("error");
    });

    const channel = getSupabaseClient()
      .channel(`household-${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_needs",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as Partial<DailyNeedRow>).id;
            if (deletedId)
              setNeeds((current) =>
                current.filter((need) => need.id !== deletedId),
              );
            return;
          }

          const row = payload.new as DailyNeedRow;
          if (row.household_id !== householdId) return;
          if (row.archived_at) {
            setNeeds((current) => current.filter((need) => need.id !== row.id));
            return;
          }
          const updated = toDailyNeed(row);
          setNeeds((current) =>
            sortNeeds([
              ...current.filter((need) => need.id !== updated.id),
              updated,
            ]),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_need_occurrences",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as Partial<OccurrenceRow>;
            if (deleted.daily_need_id && deleted.occurrence_date) {
              setOccurrences((current) =>
                current.filter(
                  (item) =>
                    item.needId !== deleted.daily_need_id ||
                    item.date !== deleted.occurrence_date,
                ),
              );
            }
            return;
          }

          const row = payload.new as OccurrenceRow;
          if (row.household_id !== householdId) return;
          setOccurrences((current) =>
            upsertOccurrence(current, toOccurrence(row)),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "claim_series",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as Partial<ClaimSeriesRow>).id;
            if (deletedId)
              setSeries((current) =>
                current.filter((item) => item.id !== deletedId),
              );
            return;
          }
          const row = payload.new as ClaimSeriesRow;
          if (row.household_id !== householdId) return;
          const updated = toSeries(row);
          setSeries((current) => [
            ...current.filter((item) => item.id !== updated.id),
            updated,
          ]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dogs",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const row = payload.new as DogRow;
          setDog((current) =>
            current && current.id === row.id ? toDog(row) : current,
          );
        },
      )
      .subscribe((channelStatus) => {
        if (channelStatus === "CHANNEL_ERROR" && active) {
          showToast({ message: t("error.realtime"), tone: "error" });
        }
      });

    return () => {
      active = false;
      void getSupabaseClient().removeChannel(channel);
    };
  }, [householdId, userId, loadSeries, showToast]);

  async function signIn(email: string, password: string) {
    setError(null);
    setNotice(null);
    const { error: signInError } =
      await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
    if (signInError) throw signInError;
  }

  async function signUp(email: string, password: string) {
    setError(null);
    setNotice(null);
    const { data, error: signUpError } = await getSupabaseClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          age_confirmed: true,
          age_confirmed_at: new Date().toISOString(),
        },
      },
    });
    if (signUpError) throw signUpError;
    if (!data.session) {
      setPendingEmail(email.trim());
      setStatus("check-email");
    }
  }

  async function resendConfirmation() {
    const { error: resendError } = await getSupabaseClient().auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (resendError) throw resendError;
    setNotice(t("auth.resent"));
  }

  async function signInWithApple(confirmAge: boolean) {
    setError(null);
    setNotice(null);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (appleError) {
      if (
        appleError &&
        typeof appleError === "object" &&
        "code" in appleError &&
        appleError.code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      throw new Error(t("auth.appleFailed"));
    }
    if (!credential.identityToken) throw new Error(t("auth.appleFailed"));

    const supabase = getSupabaseClient();
    const { error: idTokenError } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (idTokenError) throw idTokenError;

    // Apple shares the name only on the first sign-in, so keep it.
    const fullName = [
      credential.fullName?.givenName,
      credential.fullName?.familyName,
    ]
      .filter(Boolean)
      .join(" ");
    const metadata: Record<string, unknown> = {};
    if (fullName) metadata.full_name = fullName;
    if (confirmAge) {
      metadata.age_confirmed = true;
      metadata.age_confirmed_at = new Date().toISOString();
    }
    if (Object.keys(metadata).length > 0) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: metadata,
      });
      if (updateError) throw updateError;
    }
  }

  async function confirmAge() {
    const { error: updateError } = await getSupabaseClient().auth.updateUser({
      data: { age_confirmed: true, age_confirmed_at: new Date().toISOString() },
    });
    if (updateError) throw updateError;
  }

  async function requestPasswordReset(email: string) {
    setError(null);
    const { error: resetError } =
      await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl(),
      });
    if (resetError) throw resetError;
    setNotice(t("auth.resetSent"));
  }

  async function updatePassword(password: string) {
    const { error: updateError } = await getSupabaseClient().auth.updateUser({
      password,
    });
    if (updateError) throw updateError;
    setRecovering(false);
  }

  async function signOut() {
    // Stop pushes to this device for this account (needs the session).
    await unregisterPushToken().catch(() => undefined);
    const { error: signOutError } = await getSupabaseClient().auth.signOut({
      scope: "local",
    });
    if (signOutError) {
      showToast({ message: signOutError.message, tone: "error" });
    }
    setStatus("signed-out");
  }

  async function createFamily(dogName: string) {
    setError(null);
    const name = dogName.trim();
    const { error: createError } = await getSupabaseClient().rpc(
      "create_family",
      { dog_name: name, family_name: t("family.defaultName", { dog: name }) },
    );
    if (createError) throw createError;
    setStatus("loading");
    setReloadKey((current) => current + 1);
  }

  async function joinFamily(inviteCode: string) {
    setError(null);
    const { error: joinError } = await getSupabaseClient().rpc(
      "join_household",
      { invite_code: inviteCode.replace(/\s+/g, "") },
    );
    if (joinError) throw joinError;
    setStatus("loading");
    setReloadKey((current) => current + 1);
  }

  async function saveNeed(input: DailyNeedInput) {
    if (!household) throw new Error("Join a family before saving tasks.");
    const values = {
      title: input.title,
      time: input.time,
      details: input.details,
      required: input.required,
      type: input.type,
      duration_minutes: input.durationMinutes,
      repeat_days: input.repeatDays,
      amount_value: input.amountValue,
      amount_unit: input.amountUnit,
      one_off_date: input.oneOffDate,
      default_assignee_id: input.defaultAssigneeId,
      reminder_minutes_before: input.reminderMinutesBefore,
    };

    const result = input.id
      ? await getSupabaseClient()
          .from("daily_needs")
          .update(values)
          .eq("id", input.id)
          .eq("household_id", household.id)
          .select(needColumns)
          .single()
      : await getSupabaseClient()
          .from("daily_needs")
          .insert({ ...values, household_id: household.id })
          .select(needColumns)
          .single();

    if (result.error) throw result.error;
    // Push: a time change while someone has claimed today's occurrence
    // notifies them from the push_on_need_change trigger (server side).
    const saved = toDailyNeed(result.data);
    setNeeds((current) =>
      sortNeeds([...current.filter((need) => need.id !== saved.id), saved]),
    );
  }

  async function archiveNeed(needId: string) {
    if (!household) return;
    // Soft delete keeps occurrences for History.
    const { error: archiveError } = await getSupabaseClient()
      .from("daily_needs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", needId)
      .eq("household_id", household.id);
    if (archiveError) throw archiveError;
    // Push: today's claimer is notified by the push_on_need_change trigger.
    setNeeds((current) => current.filter((need) => need.id !== needId));
  }

  async function transition(
    need: DailyNeed,
    current: DailyNeedOccurrence,
    action: TransitionAction,
    options: TransitionOptions = {},
  ): Promise<TransitionOutcome> {
    if (!session) throw new Error("Sign in before updating a task.");
    const me = session.user.id;
    const myName =
      members.find((member) => member.userId === me)?.name ??
      t("common.familyMember");
    const assignee =
      members.find(
        (member) => member.userId === (options.assignedUserId ?? me),
      ) ?? null;
    const stored = occurrences.find(
      (item) => item.needId === current.needId && item.date === current.date,
    );

    // Optimistic state, rolled back on failure.
    let optimistic: DailyNeedOccurrence = { ...current, virtual: false };
    if (action === "claim" || action === "take_over") {
      optimistic = {
        ...optimistic,
        status: "booked",
        bookedBy: me,
        bookedName: myName,
        assignedUserId: assignee?.userId ?? me,
        assignedName: assignee?.name ?? myName,
        repeatRule: options.repeatRule ?? "today",
        reminderEnabled: options.reminderEnabled ?? true,
      };
    } else if (action === "release") {
      optimistic = {
        ...optimistic,
        status: "open",
        bookedBy: null,
        bookedName: null,
        assignedUserId: null,
        assignedName: null,
        repeatRule: "today",
        reminderEnabled: false,
      };
    } else if (action === "complete") {
      optimistic = {
        ...optimistic,
        status: "done",
        previousStatus: current.status === "booked" ? "booked" : "open",
        completedBy: me,
        completedName: myName,
        completedAt: new Date().toISOString(),
      };
    } else {
      const restored = current.previousStatus ?? "open";
      optimistic = {
        ...optimistic,
        status: restored,
        previousStatus: null,
        completedBy: null,
        completedName: null,
        completedAt: null,
        ...(restored === "open"
          ? {
              bookedBy: null,
              bookedName: null,
              assignedUserId: null,
              assignedName: null,
            }
          : {}),
      };
    }
    setOccurrences((list) => upsertOccurrence(list, optimistic));

    const rollback = () =>
      setOccurrences((list) =>
        stored
          ? upsertOccurrence(list, stored)
          : list.filter(
              (item) =>
                item.needId !== current.needId || item.date !== current.date,
            ),
      );

    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "transition_occurrence",
      {
        target_need_id: need.id,
        target_date: current.date,
        target_action: action,
        expected_status: current.status,
        expected_actor: getExpectedActor(current),
        target_member_id: options.assignedUserId ?? null,
        target_repeat_rule: options.repeatRule ?? "today",
        target_reminder_enabled: options.reminderEnabled ?? true,
        target_release_scope: options.releaseScope ?? "day",
      },
    );

    if (rpcError || !data) {
      rollback();
      throw new Error(rpcError ? getErrorMessage(rpcError) : "No response");
    }

    const result = data as unknown as TransitionResult;
    const saved = toOccurrence(result.occurrence);
    setOccurrences((list) => upsertOccurrence(list, saved));

    if (
      result.ok &&
      ((options.repeatRule && options.repeatRule !== "today") ||
        options.releaseScope === "series")
    ) {
      loadSeries().catch(() => undefined);
    }

    return result.ok
      ? { ok: true, occurrence: saved }
      : {
          ok: false,
          error: result.error ?? "state_changed",
          occurrence: saved,
        };
  }

  const loadOccurrences = useCallback(
    async (from: string, to: string) => {
      if (!householdId || !userId) return;
      const { data, error: queryError } = await getSupabaseClient()
        .from("daily_need_occurrences")
        .select("*")
        .eq("household_id", householdId)
        .gte("occurrence_date", from)
        .lte("occurrence_date", to);
      if (queryError) throw queryError;
      setOccurrences((current) =>
        data.map(toOccurrence).reduce(upsertOccurrence, current),
      );
    },
    [householdId, userId],
  );

  function retry() {
    setError(null);
    setStatus("loading");
    setReloadKey((current) => current + 1);
  }

  // Keep the splash up until there's a real screen to show instead of
  // the "Loading…" gate.
  const firstScreenReady =
    Boolean(configurationError) ||
    (status !== "loading" &&
      !(status === "ready" && (!household || !dog || !session)));
  useEffect(() => {
    if (firstScreenReady) hideSplash();
  }, [firstScreenReady]);

  if (configurationError) {
    return (
      <AccountGate mode="configuration-error" error={configurationError} />
    );
  }

  let gateMode: AccountGateMode | null = null;
  if (status === "check-email") gateMode = "check-email";
  else if (session && recovering) gateMode = "reset-password";
  else if (
    session &&
    !ageConfirmed &&
    status !== "loading" &&
    status !== "error"
  )
    gateMode = "needs-age";
  else if (status !== "ready" || !household || !dog || !session)
    gateMode = status === "ready" ? "loading" : status;

  if (gateMode || !household || !dog || !session) {
    return (
      <AccountGate
        mode={gateMode ?? "loading"}
        error={error}
        notice={notice}
        pendingEmail={pendingEmail}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignInWithApple={signInWithApple}
        onRequestPasswordReset={requestPasswordReset}
        onUpdatePassword={updatePassword}
        onResendConfirmation={resendConfirmation}
        onBackToSignIn={() => {
          setNotice(null);
          setError(null);
          setStatus(session ? "loading" : "signed-out");
        }}
        onConfirmAge={confirmAge}
        onCreateFamily={createFamily}
        onJoinFamily={joinFamily}
        onSignOut={signOut}
        onRetry={retry}
      />
    );
  }

  return (
    <DailyNeedsContext.Provider
      value={{
        needs,
        occurrences,
        series,
        household,
        dog,
        members,
        email: session.user.email ?? "",
        userId: session.user.id,
        saveNeed,
        archiveNeed,
        transition,
        loadOccurrences,
        signOut,
      }}
    >
      {children}
    </DailyNeedsContext.Provider>
  );
}

export function useDailyNeeds() {
  const context = useContext(DailyNeedsContext);
  if (!context) {
    throw new Error("useDailyNeeds must be used within DailyNeedsProvider");
  }
  return context;
}
