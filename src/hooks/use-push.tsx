import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { useToast } from "@/components/toast";
import { useDailyNeeds } from "@/hooks/use-daily-needs";
import { t } from "@/i18n";
import type { FamilyActivityPreference } from "@/lib/database.types";
import {
  configureNotifications,
  getNotificationTarget,
  getPushPermission,
  pushSupported,
  registerPushToken,
  requestPushPermission,
  shouldOfferRemindersAfterClaim,
  type PushPermission,
} from "@/lib/push";
import { getSupabaseClient } from "@/lib/supabase";

/** screens.md #22. Defaults match the column defaults in the push migration. */
export type NotificationPreferences = {
  claimedTasks: boolean;
  openTasks: boolean;
  overdueTasks: boolean;
  familyActivity: FamilyActivityPreference;
  newMembers: boolean;
};

export const defaultPreferences: NotificationPreferences = {
  claimedTasks: true,
  openTasks: true,
  overdueTasks: true,
  familyActivity: "must_do",
  newMembers: true,
};

type PushContextValue = {
  supported: boolean;
  permission: PushPermission;
  preferences: NotificationPreferences;
  /** Asks the OS (or opens Settings if it was denied) and registers. */
  enableReminders: () => Promise<PushPermission>;
  openSystemSettings: () => Promise<void>;
  setPreference: <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => Promise<void>;
  /** After the user's own claim: one soft, in-context ask (flow d). */
  offerRemindersAfterClaim: () => void;
};

const PushContext = createContext<PushContextValue | null>(null);

/**
 * Mounted only while signed in with a family (inside DailyNeedsProvider), so
 * the task sheet can open from a tapped notification, including on a cold
 * start (the response is read once the navigator is ready).
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const { userId, needs, dog } = useDailyNeeds();
  const { showToast } = useToast();
  const [permission, setPermission] = useState<PushPermission>(
    pushSupported ? "undetermined" : "unsupported",
  );
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(defaultPreferences);
  const navigationKey = useRootNavigationState()?.key;
  // Wait for the navigator and the family's tasks, so the sheet opens with
  // its data on a cold start.
  const navigationReady = Boolean(navigationKey) && needs.length > 0;
  const handledResponse = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getPushPermission();
    setPermission(next);
    if (next === "granted") {
      try {
        await registerPushToken();
      } catch (error) {
        if (__DEV__) console.warn("Push token registration failed", error);
      }
    }
    return next;
  }, []);

  // Permission status + token on start and whenever the app comes back
  // (the user may have changed it in system Settings).
  useEffect(() => {
    if (!pushSupported) return;
    void configureNotifications().then(refresh);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    // The OS can roll the token while the app runs; re-register.
    const tokenListener = Notifications.addPushTokenListener(() => {
      void refresh();
    });
    return () => {
      appState.remove();
      tokenListener.remove();
    };
  }, [refresh, userId]);

  // Tapping a notification opens the task sheet for that occurrence.
  useEffect(() => {
    if (!pushSupported || !navigationReady) return;

    function open(response: Notifications.NotificationResponse | null) {
      const target = getNotificationTarget(response);
      if (!response || !target) return;
      const id = response.notification.request.identifier;
      if (handledResponse.current === id) return;
      handledResponse.current = id;
      Notifications.clearLastNotificationResponse();
      router.push({ pathname: "/task", params: target });
    }

    // Cold start: the tap that launched the app.
    open(Notifications.getLastNotificationResponse());
    const subscription =
      Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [navigationReady]);

  // Preferences (one row per user; no row means defaults).
  useEffect(() => {
    let active = true;
    getSupabaseClient()
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setPreferences({
          claimedTasks: data.claimed_tasks,
          openTasks: data.open_tasks,
          overdueTasks: data.overdue_tasks,
          familyActivity: data.family_activity,
          newMembers: data.new_members,
        });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const setPreference = useCallback(
    async <K extends keyof NotificationPreferences>(
      key: K,
      value: NotificationPreferences[K],
    ) => {
      const previous = preferences;
      const next = { ...preferences, [key]: value };
      setPreferences(next);
      const { error } = await getSupabaseClient()
        .from("notification_preferences")
        .upsert({
          user_id: userId,
          claimed_tasks: next.claimedTasks,
          open_tasks: next.openTasks,
          overdue_tasks: next.overdueTasks,
          family_activity: next.familyActivity,
          new_members: next.newMembers,
          updated_at: new Date().toISOString(),
        });
      if (error) {
        setPreferences(previous);
        showToast({ message: t("error.couldNotSave"), tone: "error" });
      }
    },
    [preferences, userId, showToast],
  );

  const openSystemSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // Not available (web); nothing to open.
    }
  }, []);

  const enableReminders = useCallback(async () => {
    const current = await getPushPermission();
    if (current === "denied") {
      await openSystemSettings();
      return current;
    }
    const next =
      current === "granted" ? current : await requestPushPermission();
    setPermission(next);
    if (next === "granted") {
      try {
        await registerPushToken();
      } catch (error) {
        if (__DEV__) console.warn("Push token registration failed", error);
        showToast({ message: t("push.registerFailed"), tone: "error" });
      }
    }
    return next;
  }, [openSystemSettings, showToast]);

  const offerRemindersAfterClaim = useCallback(() => {
    if (!pushSupported) return;
    void shouldOfferRemindersAfterClaim().then((offer) => {
      if (!offer) return;
      showToast({
        message: t("push.primeTitle"),
        detail: t("push.primeBody", { dog: dog.name }),
        duration: 8000,
        action: {
          label: t("push.turnOn"),
          onPress: () => void enableReminders(),
        },
      });
    });
  }, [dog.name, enableReminders, showToast]);

  return (
    <PushContext.Provider
      value={{
        supported: pushSupported,
        permission,
        preferences,
        enableReminders,
        openSystemSettings,
        setPreference,
        offerRemindersAfterClaim,
      }}
    >
      {children}
    </PushContext.Provider>
  );
}

export function usePush() {
  const context = useContext(PushContext);
  if (!context) throw new Error("usePush must be used within PushProvider");
  return context;
}
