import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";

import type { Database } from "@/lib/database.types";

let client: SupabaseClient<Database> | undefined;
let appStateListener: ReturnType<typeof AppState.addEventListener> | undefined;

const webStorage = {
  getItem: async (key: string) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

export function getSupabaseClient(): SupabaseClient<Database> {
  const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const url = configuredUrl?.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }

  if (!client) {
    client = createClient<Database>(url, publishableKey, {
      auth: {
        storage: Platform.OS === "web" ? webStorage : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
      },
    });

    if (Platform.OS !== "web" && !appStateListener) {
      client.auth.startAutoRefresh();
      appStateListener = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          client?.auth.startAutoRefresh();
        } else {
          client?.auth.stopAutoRefresh();
        }
      });
    }
  }

  return client;
}
