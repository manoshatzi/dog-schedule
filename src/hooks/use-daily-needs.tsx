import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { AccountGate } from "@/components/account-gate";
import type { Database } from "@/lib/database.types";
import { getSupabaseClient } from "@/lib/supabase";

export type DailyNeed = {
  id: string;
  title: string;
  time: string;
  details: string;
  required: boolean;
  type: DailyNeedType;
  durationMinutes: number;
  repeatDays: string[];
};

export type DailyNeedType =
  | "walk"
  | "food"
  | "medicine"
  | "potty"
  | "play"
  | "grooming"
  | "other";

export type DailyNeedInput = Omit<DailyNeed, "id"> & { id?: string };
export type NeedOccurrenceStatus = "open" | "booked" | "done";
export type BookingRepeat = "today" | "weekday" | "daily";
export type HouseholdMember = { userId: string; name: string };
export type DailyNeedOccurrence = {
  needId: string;
  date: string;
  status: NeedOccurrenceStatus;
  bookedBy: string | null;
  bookedName: string | null;
  assignedUserId: string | null;
  assignedName: string | null;
  repeatRule: BookingRepeat;
  reminderEnabled: boolean;
  completedBy: string | null;
  completedName: string | null;
  completedAt: string | null;
};
export type Household = { id: string; name: string; inviteCode: string };
type DailyNeedRow = Database["public"]["Tables"]["daily_needs"]["Row"];
type DailyNeedOccurrenceRow =
  Database["public"]["Tables"]["daily_need_occurrences"]["Row"];
type AppStatus =
  | "loading"
  | "signed-out"
  | "needs-household"
  | "ready"
  | "error";

type DailyNeedsContextValue = {
  needs: DailyNeed[];
  occurrences: DailyNeedOccurrence[];
  household: Household;
  members: HouseholdMember[];
  email: string;
  userId: string;
  error: string | null;
  saveNeed: (input: DailyNeedInput) => Promise<void>;
  setOccurrence: (
    needId: string,
    date: string,
    status: NeedOccurrenceStatus,
    options?: {
      assignedUserId?: string;
      repeatRule?: BookingRepeat;
      reminderEnabled?: boolean;
    },
  ) => Promise<void>;
  loadOccurrences: (from: string, to: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const DailyNeedsContext = createContext<DailyNeedsContextValue | null>(null);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function toDailyNeed(row: DailyNeedRow): DailyNeed {
  return {
    id: row.id,
    title: row.title,
    time: row.time.slice(0, 5),
    details: row.details,
    required: row.required,
    type: row.type,
    durationMinutes: row.duration_minutes,
    repeatDays: row.repeat_days,
  };
}

function toOccurrence(row: DailyNeedOccurrenceRow): DailyNeedOccurrence {
  return {
    needId: row.daily_need_id,
    date: row.occurrence_date,
    status: row.status as NeedOccurrenceStatus,
    bookedBy: row.booked_by,
    bookedName: row.booked_name,
    assignedUserId: row.assigned_user_id,
    assignedName: row.assigned_name,
    repeatRule: row.repeat_rule as BookingRepeat,
    reminderEnabled: row.reminder_enabled,
    completedBy: row.completed_by,
    completedName: row.completed_name,
    completedAt: row.completed_at,
  };
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortNeeds(needs: DailyNeed[]) {
  return [...needs].sort((first, second) =>
    first.time.localeCompare(second.time),
  );
}

function mergeOccurrences(...groups: DailyNeedOccurrence[][]) {
  const byOccurrence = new Map<string, DailyNeedOccurrence>();
  for (const group of groups) {
    for (const occurrence of group) {
      byOccurrence.set(`${occurrence.needId}:${occurrence.date}`, occurrence);
    }
  }
  return [...byOccurrence.values()];
}

async function getHousehold(userId: string): Promise<Household | null> {
  const supabase = getSupabaseClient();
  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return null;

  const { data, error } = await supabase
    .from("households")
    .select("id, name, invite_code")
    .eq("id", membership.household_id)
    .single();

  if (error) throw error;
  return { id: data.id, name: data.name, inviteCode: data.invite_code };
}

export function DailyNeedsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [needs, setNeeds] = useState<DailyNeed[]>([]);
  const [occurrences, setOccurrences] = useState<DailyNeedOccurrence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [configurationError] = useState(() => {
    try {
      getSupabaseClient();
      return null;
    } catch (clientError) {
      return getErrorMessage(clientError);
    }
  });

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
      setSession(data.session);
      if (!data.session) setStatus("signed-out");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError(null);
      setNotice(null);
      if (nextSession) {
        setStatus("loading");
      } else {
        setHousehold(null);
        setMembers([]);
        setNeeds([]);
        setOccurrences([]);
        setStatus("signed-out");
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configurationError]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    getHousehold(session.user.id)
      .then((currentHousehold) => {
        if (!active) return;
        setHousehold(currentHousehold);
        setStatus(currentHousehold ? "ready" : "needs-household");
      })
      .catch((householdError: unknown) => {
        if (!active) return;
        setError(getErrorMessage(householdError));
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [session, reloadKey]);

  useEffect(() => {
    if (!household || !session) return;
    let active = true;
    const occurrenceDate = getLocalDateKey(new Date());

    const loadNeeds = async () => {
      const supabase = getSupabaseClient();
      const { data, error: loadError } = await supabase
        .from("daily_needs")
        .select(
          "id, household_id, title, time, details, required, type, duration_minutes, repeat_days, created_at",
        )
        .eq("household_id", household.id)
        .order("time");

      if (loadError) throw loadError;
      if (active) setNeeds(sortNeeds(data.map(toDailyNeed)));

      const { data: memberData, error: memberError } = await supabase.rpc(
        "get_household_members",
      );
      if (memberError) throw memberError;
      if (active) {
        setMembers(
          memberData.map((member) => ({
            userId: member.user_id,
            name: member.display_name,
          })),
        );
      }

      const { data: occurrenceData, error: occurrenceError } = await supabase
        .from("daily_need_occurrences")
        .select("*")
        .eq("household_id", household.id)
        .eq("occurrence_date", occurrenceDate);

      if (occurrenceError) throw occurrenceError;
      if (active) setOccurrences(occurrenceData.map(toOccurrence));
    };

    loadNeeds().catch((loadError: unknown) => {
      if (!active) return;
      setError(getErrorMessage(loadError));
      setStatus("error");
    });

    const channel = getSupabaseClient()
      .channel(`household-needs-${household.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_needs",
          filter: `household_id=eq.${household.id}`,
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
          if (row.household_id !== household.id) return;
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
          filter: `household_id=eq.${household.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as Partial<DailyNeedOccurrenceRow>;
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

          const row = payload.new as DailyNeedOccurrenceRow;
          if (row.household_id !== household.id) {
            return;
          }
          const updated = toOccurrence(row);
          setOccurrences((current) => [
            ...current.filter(
              (item) =>
                item.needId !== updated.needId || item.date !== updated.date,
            ),
            updated,
          ]);
        },
      )
      .subscribe((channelStatus, channelError) => {
        if (channelStatus === "CHANNEL_ERROR" && active) {
          setError(
            channelError?.message ?? "Realtime updates could not connect.",
          );
        }
      });

    return () => {
      active = false;
      void getSupabaseClient().removeChannel(channel);
    };
  }, [household, session]);

  async function signIn(email: string, password: string) {
    setStatus("loading");
    setError(null);
    const { error: signInError } =
      await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
    if (signInError) {
      setStatus("signed-out");
      setError(signInError.message);
    }
  }

  async function signUp(email: string, password: string) {
    setStatus("loading");
    setError(null);
    setNotice(null);
    const { data, error: signUpError } = await getSupabaseClient().auth.signUp({
      email: email.trim(),
      password,
    });
    if (signUpError) {
      setStatus("signed-out");
      setError(signUpError.message);
    } else if (!data.session) {
      setStatus("signed-out");
      setNotice("Check your email to confirm your account, then sign in.");
    }
  }

  async function signOut() {
    const { error: signOutError } = await getSupabaseClient().auth.signOut({
      scope: "local",
    });
    if (signOutError) setError(signOutError.message);
  }

  async function createHousehold(name: string) {
    setError(null);
    const { error: createError } = await getSupabaseClient().rpc(
      "create_household",
      {
        household_name: name.trim(),
      },
    );
    if (createError) {
      setError(createError.message);
      return;
    }
    setStatus("loading");
    setReloadKey((current) => current + 1);
  }

  async function joinHousehold(inviteCode: string) {
    setError(null);
    const { error: joinError } = await getSupabaseClient().rpc(
      "join_household",
      {
        invite_code: inviteCode.trim(),
      },
    );
    if (joinError) {
      setError(joinError.message);
      return;
    }
    setStatus("loading");
    setReloadKey((current) => current + 1);
  }

  async function saveNeed(input: DailyNeedInput) {
    if (!household) throw new Error("Join a household before saving needs.");
    setError(null);
    const values = {
      title: input.title,
      time: input.time,
      details: input.details,
      required: input.required,
      type: input.type,
      duration_minutes: input.durationMinutes,
      repeat_days: input.repeatDays,
    };

    const result = input.id
      ? await getSupabaseClient()
          .from("daily_needs")
          .update(values)
          .eq("id", input.id)
          .eq("household_id", household.id)
          .select(
            "id, household_id, title, time, details, required, type, duration_minutes, repeat_days, created_at",
          )
          .single()
      : await getSupabaseClient()
          .from("daily_needs")
          .insert({ ...values, household_id: household.id })
          .select(
            "id, household_id, title, time, details, required, type, duration_minutes, repeat_days, created_at",
          )
          .single();

    if (result.error) {
      setError(result.error.message);
      throw result.error;
    }

    const saved = toDailyNeed(result.data);
    setNeeds((current) =>
      sortNeeds([...current.filter((need) => need.id !== saved.id), saved]),
    );
  }

  async function setOccurrence(
    needId: string,
    date: string,
    nextStatus: NeedOccurrenceStatus,
    options: {
      assignedUserId?: string;
      repeatRule?: BookingRepeat;
      reminderEnabled?: boolean;
    } = {},
  ) {
    if (!session) throw new Error("Sign in before updating a daily need.");
    const actorName = session?.user.email?.split("@")[0] || "Family member";
    const existing = occurrences.find(
      (item) => item.needId === needId && item.date === date,
    );
    const { data, error: occurrenceError } = await getSupabaseClient().rpc(
      "set_daily_need_occurrence",
      {
        target_need_id: needId,
        target_date: date,
        next_status: nextStatus,
        actor_name: actorName,
        target_member_id:
          options.assignedUserId ?? existing?.assignedUserId ?? session.user.id,
        target_repeat_rule:
          options.repeatRule ?? existing?.repeatRule ?? "today",
        reminder_enabled:
          options.reminderEnabled ?? existing?.reminderEnabled ?? false,
      },
    );
    if (occurrenceError) {
      setError(occurrenceError.message);
      throw occurrenceError;
    }
    const saved = toOccurrence(data[0]);
    setOccurrences((current) => [
      ...current.filter(
        (item) => item.needId !== saved.needId || item.date !== saved.date,
      ),
      saved,
    ]);
  }

  const loadOccurrences = useCallback(
    async (from: string, to: string) => {
      if (!household || !session) return;
      const supabase = getSupabaseClient();
      const [rangeResult, priorResult] = await Promise.all([
        supabase
          .from("daily_need_occurrences")
          .select("*")
          .eq("household_id", household.id)
          .gte("occurrence_date", from)
          .lte("occurrence_date", to),
        supabase.rpc("get_latest_household_occurrences", {
          target_date: from,
        }),
      ]);
      const queryError = rangeResult.error ?? priorResult.error;
      if (queryError) {
        setError(queryError.message);
        throw queryError;
      }
      setOccurrences((current) =>
        mergeOccurrences(
          current,
          (priorResult.data ?? []).map(toOccurrence),
          (rangeResult.data ?? []).map(toOccurrence),
        ),
      );
    },
    [household, session],
  );

  function retry() {
    setError(null);
    setStatus("loading");
    setReloadKey((current) => current + 1);
  }

  if (configurationError) {
    return (
      <AccountGate mode="configuration-error" error={configurationError} />
    );
  }

  if (status !== "ready" || !household || !session) {
    return (
      <AccountGate
        mode={status === "ready" ? "loading" : status}
        error={error}
        notice={notice}
        onSignIn={signIn}
        onSignUp={signUp}
        onCreateHousehold={createHousehold}
        onJoinHousehold={joinHousehold}
        onRetry={retry}
      />
    );
  }

  return (
    <DailyNeedsContext.Provider
      value={{
        needs,
        occurrences,
        household,
        members,
        email: session.user.email ?? "",
        userId: session.user.id,
        error,
        saveNeed,
        setOccurrence,
        loadOccurrences,
        signOut,
        clearError: () => setError(null),
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
