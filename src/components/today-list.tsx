import { FlatList, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type TodayNeed = {
  id: string;
  title: string;
  time?: string;
};

type TodayListProps = {
  dogName: string;
  needs: readonly TodayNeed[];
  date?: Date;
};

const palette = {
  light: {
    background: "#F4F6F3",
    surface: "#FFFFFF",
    text: "#1B2522",
    secondary: "#5C6762",
  },
  dark: {
    background: "#141917",
    surface: "#222B26",
    text: "#F4F6F3",
    secondary: "#ADB6B0",
  },
};

export function TodayList({
  dogName,
  needs,
  date = new Date(),
}: TodayListProps) {
  const scheme = useColorScheme();
  const colors = palette[scheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => part.value)
    .join(" ")
    .toUpperCase();

  return (
    <FlatList
      data={needs}
      keyExtractor={(need) => need.id}
      style={[styles.list, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        {
          paddingTop:
            Spacing.four + (Platform.OS === "android" ? insets.top : 0),
        },
      ]}
      ListHeaderComponent={
        <View style={styles.header}>
          <ThemedText type="smallBold" style={{ color: colors.secondary }}>
            {dayLabel}
          </ThemedText>
          <ThemedText
            accessibilityRole="header"
            type="subtitle"
            style={[styles.dogName, { color: colors.text }]}
          >
            {dogName}&apos;s day
          </ThemedText>
        </View>
      }
      ListEmptyComponent={
        <ThemedText style={{ color: colors.secondary }}>
          No needs scheduled for today.
        </ThemedText>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          {item.time ? (
            <ThemedText
              type="smallBold"
              style={[styles.time, { color: colors.secondary }]}
            >
              {item.time}
            </ThemedText>
          ) : null}
          <View style={[styles.need, { backgroundColor: colors.surface }]}>
            <ThemedText style={[styles.needTitle, { color: colors.text }]}>
              {item.title}
            </ThemedText>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    paddingBottom: Spacing.five,
  },
  dogName: {
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  time: {
    width: 48,
    fontVariant: ["tabular-nums"],
  },
  need: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    justifyContent: "center",
    padding: Spacing.three,
    borderRadius: 16,
  },
  needTitle: {
    fontWeight: "600",
  },
});
