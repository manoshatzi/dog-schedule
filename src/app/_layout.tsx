import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Platform, useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { DailyNeedsProvider } from "@/hooks/use-daily-needs";

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar hidden={Platform.OS === "ios"} />
      <AnimatedSplashOverlay />
      <DailyNeedsProvider>
        <AppTabs />
      </DailyNeedsProvider>
    </ThemeProvider>
  );
}
