import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type {
  DailyNeed,
  DailyNeedOccurrence,
  NeedOccurrenceStatus,
} from "@/hooks/use-daily-needs";

type TodayListProps = {
  dogName: string;
  userId: string;
  needs: readonly DailyNeed[];
  occurrences: readonly DailyNeedOccurrence[];
  onSetOccurrence: (
    needId: string,
    date: string,
    status: NeedOccurrenceStatus,
  ) => Promise<void>;
  date?: Date;
};

const palette = {
  light: {
    background: "#F4F6F3",
    surface: "#FFFFFF",
    text: "#1B2522",
    secondary: "#5C6762",
    mutedSurface: "#E8EEE9",
    line: "#DDE3DE",
  },
  dark: {
    background: "#141917",
    surface: "#222B26",
    text: "#F4F6F3",
    secondary: "#ADB6B0",
    mutedSurface: "#29352E",
    line: "#39463D",
  },
};

export function TodayList({
  dogName,
  userId,
  needs,
  occurrences,
  onSetOccurrence,
  date,
}: TodayListProps) {
  const [now, setNow] = useState(() => new Date());
  const [actionError, setActionError] = useState("");
  const scheme = useColorScheme();
  const colors = palette[scheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const activeDate = date ?? now;
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
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    activeDate.getDay()
  ];
  const dateKey = `${activeDate.getFullYear()}-${String(activeDate.getMonth() + 1).padStart(2, "0")}-${String(activeDate.getDate()).padStart(2, "0")}`;
  const daysNeeds = needs.filter(
    (need) => !need.repeatDays || need.repeatDays.includes(dayKey),
  );
  const todayOccurrences = occurrences.filter((item) => item.date === dateKey);
  const doneCount = daysNeeds.filter(
    (need) =>
      todayOccurrences.find((item) => item.needId === need.id)?.status ===
      "done",
  ).length;
  const openCount = daysNeeds.length - doneCount;
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nextNeedId = daysNeeds.find((need) => need.time >= nowTime)?.id;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function updateOccurrence(
    needId: string,
    status: NeedOccurrenceStatus,
  ) {
    setActionError("");
    try {
      await onSetOccurrence(needId, dateKey, status);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not update this need.",
      );
    }
  }

  return (
    <FlatList
      data={daysNeeds}
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
          <View style={styles.headingRow}>
            <View style={styles.headingText}>
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
            <View style={styles.paw}>
              <SymbolView
                name={{ ios: "pawprint.fill", android: "pets", web: "pets" }}
                tintColor="#FFFFFF"
                size={30}
              />
            </View>
          </View>
          <View
            style={[styles.progressCard, { backgroundColor: colors.surface }]}
          >
            <View style={styles.progressLabels}>
              <ThemedText
                style={[styles.progressCount, { color: colors.text }]}
              >
                {doneCount} of {daysNeeds.length} done
              </ThemedText>
              <ThemedText style={styles.openCount}>
                {openCount} still open
              </ThemedText>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: daysNeeds.length,
                now: doneCount,
              }}
              style={[styles.progressTrack, { backgroundColor: colors.line }]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${daysNeeds.length ? (doneCount / daysNeeds.length) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
          {actionError ? (
            <ThemedText accessibilityRole="alert" style={styles.actionError}>
              {actionError}
            </ThemedText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <ThemedText style={{ color: colors.secondary }}>
          No needs scheduled for today.
        </ThemedText>
      }
      ListFooterComponent={
        nextNeedId ? undefined : <NowMarker time={nowTime} />
      }
      renderItem={({ item }) => {
        const occurrence = todayOccurrences.find(
          (entry) => entry.needId === item.id,
        );
        const status = occurrence?.status ?? "open";
        const isBookedByMe = occurrence?.bookedBy === userId;
        const typeStyle = getTypeStyle(item.type);

        return (
          <>
            {item.id === nextNeedId ? <NowMarker time={nowTime} /> : null}
            <View style={styles.row}>
              <ThemedText
                type="smallBold"
                style={[styles.time, { color: colors.secondary }]}
              >
                {item.time}
              </ThemedText>
              <View
                style={[
                  styles.need,
                  {
                    backgroundColor:
                      status === "done"
                        ? colors.mutedSurface
                        : status === "booked"
                          ? "#FFF7E9"
                          : colors.surface,
                    borderColor:
                      status === "booked" ? "#E87919" : "transparent",
                    borderStyle: status === "booked" ? "dashed" : "solid",
                  },
                ]}
              >
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: typeStyle.background },
                  ]}
                >
                  <ThemedText
                    style={{ color: typeStyle.text, fontWeight: "700" }}
                  >
                    {item.type === "medicine"
                      ? "M"
                      : item.type === "grooming"
                        ? "G"
                        : item.type.slice(0, 1).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.needDetails}>
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.needTitle,
                      { color: colors.text },
                      status === "done" && styles.completedTitle,
                    ]}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.needSubtitle,
                      {
                        color:
                          status === "booked" ? "#9A4A12" : colors.secondary,
                      },
                    ]}
                  >
                    {status === "done"
                      ? `${occurrence?.completedName ?? "Family member"} · done ${occurrence?.completedAt ? formatClock(occurrence.completedAt) : ""}`
                      : status === "booked"
                        ? `${isBookedByMe ? "You booked" : `${occurrence?.bookedName ?? "Family member"} booked for ${occurrence?.assignedName ?? "a family member"}`} · ${item.durationMinutes} min`
                        : [item.details, `${item.durationMinutes} min`]
                            .filter(Boolean)
                            .join(" · ")}
                  </ThemedText>
                </View>
                {status === "done" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Undo completion of ${item.title}`}
                    onPress={() => void updateOccurrence(item.id, "open")}
                    style={[styles.actionButton, styles.undoButton]}
                  >
                    <ThemedText
                      style={[styles.actionText, { color: colors.secondary }]}
                    >
                      Undo
                    </ThemedText>
                  </Pressable>
                ) : status === "booked" ? (
                  isBookedByMe ? (
                    <View style={styles.actionGroup}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel booking for ${item.title}`}
                        onPress={() => void updateOccurrence(item.id, "open")}
                        style={[styles.actionButton, styles.unbookAction]}
                      >
                        <ThemedText style={styles.unbookText}>
                          Cancel
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void updateOccurrence(item.id, "done")}
                        style={[styles.actionButton, styles.doneAction]}
                      >
                        <ThemedText style={styles.actionText}>Done</ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void updateOccurrence(item.id, "done")}
                      style={[styles.actionButton, styles.doneAction]}
                    >
                      <ThemedText style={styles.actionText}>Done</ThemedText>
                    </Pressable>
                  )
                ) : item.type === "walk" && item.time >= nowTime ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/book-task",
                        params: { needId: item.id, date: dateKey },
                      })
                    }
                    style={[styles.actionButton, styles.bookAction]}
                  >
                    <ThemedText style={styles.actionText}>Book</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void updateOccurrence(item.id, "done")}
                    style={[styles.actionButton, styles.doneAction]}
                  >
                    <ThemedText style={styles.actionText}>Done</ThemedText>
                  </Pressable>
                )}
              </View>
            </View>
          </>
        );
      }}
    />
  );
}

function NowMarker({ time }: { time: string }) {
  return (
    <View style={styles.nowRow}>
      <ThemedText style={styles.nowLabel}>NOW {time}</ThemedText>
      <View style={styles.nowLine} />
    </View>
  );
}

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getTypeStyle(type: DailyNeed["type"]) {
  switch (type) {
    case "walk":
      return { background: "#E5DCF7", text: "#54378C" };
    case "food":
      return { background: "#DCE8FA", text: "#244B86" };
    case "medicine":
      return { background: "#F9DFD0", text: "#8D4318" };
    case "potty":
      return { background: "#E2E8D8", text: "#53643D" };
    case "play":
      return { background: "#DCE8FA", text: "#244B86" };
    case "grooming":
      return { background: "#F0DDF2", text: "#704378" };
    default:
      return { background: "#E6E9E7", text: "#4B5550" };
  }
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  header: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headingText: { gap: Spacing.one },
  paw: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#286B50",
    alignItems: "center",
    justifyContent: "center",
  },
  dogName: {
    fontWeight: "700",
  },
  progressCard: {
    padding: Spacing.three,
    borderRadius: 24,
    gap: Spacing.two,
    elevation: 1,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressCount: { fontSize: 20, fontWeight: "700" },
  openCount: { color: "#9A4A12", fontWeight: "700" },
  progressTrack: { height: 12, borderRadius: 6, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#286B50", borderRadius: 6 },
  actionError: { color: "#C43C25" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  time: {
    width: 68,
    fontVariant: ["tabular-nums"],
    textAlign: "left",
  },
  need: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 24,
    borderWidth: 2,
    elevation: 1,
  },
  typeBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  needDetails: { flex: 1, minWidth: 0, gap: Spacing.one },
  needTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  completedTitle: { textDecorationLine: "line-through", opacity: 0.76 },
  needSubtitle: { fontSize: 15 },
  actionButton: {
    minWidth: 72,
    minHeight: 64,
    paddingHorizontal: Spacing.two,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#FFFFFF", fontWeight: "700" },
  doneAction: { backgroundColor: "#286B50" },
  bookAction: { backgroundColor: "#17211E" },
  actionGroup: { flexDirection: "row", gap: Spacing.one },
  unbookAction: { minWidth: 56, backgroundColor: "#F2E8D9" },
  unbookText: { color: "#744314", fontWeight: "700" },
  undoButton: { backgroundColor: "transparent", minWidth: 48 },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
    marginLeft: 4,
  },
  nowLabel: { color: "#BF442B", fontWeight: "700", fontSize: 14 },
  nowLine: { flex: 1, height: 2, backgroundColor: "#BF442B" },
});
