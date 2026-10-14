import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from "expo-router/ui";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";

import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";
import { t } from "@/i18n";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

export default function AppTabs() {
  return (
    <Tabs style={styles.tabs}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="today" href="/" asChild>
            <TabButton icon="today">{t("tab.today")}</TabButton>
          </TabTrigger>
          <TabTrigger name="week" href="/week" asChild>
            <TabButton icon="calendar_month">{t("tab.week")}</TabButton>
          </TabTrigger>
          <TabTrigger name="routine" href="/routine" asChild>
            <TabButton icon="checklist">{t("tab.routine")}</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = Omit<TabTriggerSlotProps, "ref"> &
  Pick<ComponentProps<typeof Pressable>, "ref"> & {
    icon: "today" | "calendar_month" | "checklist";
  };

export function TabButton({
  children,
  isFocused,
  icon,
  ...props
}: TabButtonProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
    >
      <ThemedView
        type={isFocused ? "backgroundSelected" : "background"}
        style={styles.tabButtonView}
      >
        <SymbolView
          name={{ web: icon }}
          tintColor={isFocused ? colors.text : colors.textSecondary}
          size={24}
        />
        <ThemedText
          type="small"
          themeColor={isFocused ? "text" : "textSecondary"}
        >
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.backgroundElement,
        },
      ]}
    >
      <ThemedView style={styles.innerContainer}>{props.children}</ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flex: 1,
  },
  slot: {
    flex: 1,
    minHeight: 0,
  },
  tabListContainer: {
    width: "100%",
    borderTopWidth: 1,
    padding: Spacing.two,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  innerContainer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    minHeight: 56,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.one,
  },
});
