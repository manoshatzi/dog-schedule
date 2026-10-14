import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { Platform } from "react-native";

import { getLanguage } from "@/i18n";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Push plumbing (docs/architecture.md, "Push notifications"). The server
 * decides what to send; the app only asks for permission in context,
 * registers this device's Expo push token and opens the task sheet when a
 * notification is tapped. Push needs a development or store build: Expo Go
 * has no push support since SDK 53.
 */

export const pushSupported = Platform.OS === "ios" || Platform.OS === "android";

/** "granted" includes iOS provisional authorisation. */
export type PushPermission =
  "granted" | "denied" | "undetermined" | "unsupported";

const TOKEN_KEY = "push.registeredToken";
const ASKED_KEY = "push.askedAfterClaim";

let configured = false;

/**
 * Call once at startup. SDK 58 shows foreground notifications by default; the
 * handler keeps that but skips the badge (the app doesn't use badges).
 * Android channels must exist before a token is requested (Android 13
 * permission prompt) and before a push names them in `channelId`; keep the
 * ids in sync with supabase/functions/send-push/index.ts.
 */
export async function configureNotifications() {
  if (!pushSupported || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    await Promise.all([
      Notifications.setNotificationChannelAsync("reminders", {
        name: "Reminders",
        description: "Your claimed tasks, open tasks and overdue tasks",
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      }),
      Notifications.setNotificationChannelAsync("activity", {
        name: "Family activity",
        description: "Done tasks, take-overs and new members",
        importance: AndroidImportance.DEFAULT,
      }),
    ]);
  }
}

function toPermission(
  status: Notifications.NotificationPermissionsStatus,
): PushPermission {
  if (
    status.granted ||
    status.ios?.status === IosAuthorizationStatus.PROVISIONAL
  ) {
    return "granted";
  }
  return status.status === "denied" ? "denied" : "undetermined";
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!pushSupported) return "unsupported";
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return "unsupported";
  }
}

/** Shows the OS prompt (only does anything while "undetermined"). */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported) return "unsupported";
  await configureNotifications();
  const status = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return toPermission(status);
}

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

/**
 * Gets this device's Expo push token and upserts it for the signed-in user.
 * Safe to call often; no-op without permission. Throws when the project has
 * no EAS projectId or the token request fails (offline).
 */
export async function registerPushToken(): Promise<string | null> {
  if (!pushSupported) return null;
  if ((await getPushPermission()) !== "granted") return null;
  await configureNotifications();
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error(
      "No EAS projectId in app.json (expo.extra.eas.projectId). Run `yarn dlx eas-cli@latest init`.",
    );
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  await saveToken(token);
  return token;
}

/** Stores a token the OS rolled while the app was running. */
export async function saveToken(token: string) {
  const { error } = await getSupabaseClient().rpc("register_push_token", {
    token,
    token_platform: Platform.OS === "ios" ? "ios" : "android",
    token_locale: getLanguage(),
  });
  if (error) throw error;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** Before sign-out: stop pushes to this device for this account. */
export async function unregisterPushToken() {
  if (!pushSupported) return;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await getSupabaseClient().rpc("unregister_push_token", { token });
  } finally {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

/** One soft ask after the first claim; the account sheet card is always there. */
export async function shouldOfferRemindersAfterClaim() {
  if ((await getPushPermission()) !== "undetermined") return false;
  const asked = await AsyncStorage.getItem(ASKED_KEY);
  if (asked) return false;
  await AsyncStorage.setItem(ASKED_KEY, new Date().toISOString());
  return true;
}

/** The Expo Router path in a tapped notification, if it is one of ours. */
export function getNotificationTarget(
  response: Notifications.NotificationResponse | null | undefined,
): { needId: string; date: string } | null {
  if (!response) return null;
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return null;
  }
  const data = response.notification.request.content.data as
    Record<string, unknown> | null | undefined;
  const needId = data?.needId;
  const date = data?.date;
  if (typeof needId !== "string" || typeof date !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { needId, date };
}
