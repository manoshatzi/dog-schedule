import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Platform, useColorScheme } from "react-native";

import { SplashOverlay } from "@/components/splash-overlay";
import { ToastProvider } from "@/components/toast";
import { DailyNeedsProvider } from "@/hooks/use-daily-needs";
import { PushProvider } from "@/hooks/use-push";
import { configureNotifications } from "@/lib/push";

SplashScreen.preventAutoHideAsync();
// Notification handler and Android channels before anything can arrive.
void configureNotifications();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar hidden={Platform.OS === "ios"} />
      <ToastProvider>
        <DailyNeedsProvider>
          <PushProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="task"
                options={{
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.92],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 24,
                }}
              />
            </Stack>
          </PushProvider>
        </DailyNeedsProvider>
      </ToastProvider>
      <SplashOverlay />
    </ThemeProvider>
  );
}
