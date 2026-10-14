import { NativeTabs } from "expo-router/native-tabs";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";
import { t } from "@/i18n";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="index" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>{t("tab.today")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="week">
        <NativeTabs.Trigger.Label>{t("tab.week")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="routine">
        <NativeTabs.Trigger.Label>{t("tab.routine")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
