import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState, type ComponentProps } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  useDailyNeeds,
  type DailyNeed,
  type DailyNeedOccurrence,
  type HouseholdMember,
} from "@/hooks/use-daily-needs";

const palette = {
  light: {
    background: "#F4F6F3",
    surface: "#FFFFFF",
    text: "#1B2522",
    secondary: "#5C6762",
    border: "#E1E6E1",
    selected: "#18211E",
    inactive: "#F0F2F0",
  },
  dark: {
    background: "#141917",
    surface: "#222B26",
    text: "#F4F6F3",
    secondary: "#ADB6B0",
    border: "#39463D",
    selected: "#DDEDE1",
    inactive: "#202722",
  },
};

const memberColors = [
  { background: "#DCE8FA", text: "#244B86" },
  { background: "#F9DFD0", text: "#8D4318" },
  { background: "#E5DCF7", text: "#54378C" },
  { background: "#E2E8D8", text: "#53643D" },
];

type WeekDay = { date: Date; key: string; short: string; number: string };
type Slot = {
  occurrence?: DailyNeedOccurrence;
  source?: DailyNeedOccurrence;
};

export function WeekScreen() {
  const { needs, occurrences, members, household, loadOccurrences } =
    useDailyNeeds();
  const [weekOffset, setWeekOffset] = useState(0);
  const [loadError, setLoadError] = useState("");
  const { width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const colors = palette[scheme === "dark" ? "dark" : "light"];

  const monday = getMonday(new Date(), weekOffset);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date,
      key: formatDate(date),
      short: new Intl.DateTimeFormat("en-GB", { weekday: "short" })
        .format(date)
        .slice(0, 3),
      number: String(date.getDate()),
    };
  });
  const firstDate = days[0].key;
  const lastDate = days[6].key;
  const todayKey = formatDate(new Date());
  const gridWidth = Math.max(
    620,
    Math.min(852, viewportWidth - 68 - insets.left - insets.right),
  );
  const innerGridWidth = gridWidth - Spacing.three;
  const labelWidth = 126;
  const cellWidth = (innerGridWidth - labelWidth) / 7;

  useEffect(() => {
    loadOccurrences(firstDate, lastDate).catch((error: unknown) => {
      setLoadError(
        error instanceof Error ? error.message : "Could not load this week.",
      );
    });
  }, [firstDate, lastDate, loadOccurrences]);

  function changeWeek(amount: number) {
    setLoadError("");
    setWeekOffset((value) => value + amount);
  }

  const rangeLabel = getWeekLabel(days[0].date, days[6].date);
  const openSlots = needs.reduce(
    (total, need) =>
      total +
      days.filter((day) => {
        const slot = getSlot(need.id, day.key, day.date, occurrences);
        if (!isNeedScheduled(need, day.date) && !slot.source) return false;
        return !slot.occurrence && !slot.source;
      }).length,
    0,
  );
  const memberCounts = members.map((member) => ({
    member,
    count: needs.reduce(
      (count, need) =>
        count +
        days.filter((day) => {
          const slot = getSlot(need.id, day.key, day.date, occurrences);
          if (!isNeedScheduled(need, day.date) && !slot.source) return false;
          return (
            slot.occurrence?.assignedUserId === member.userId ||
            slot.source?.assignedUserId === member.userId
          );
        }).length,
      0,
    ),
  }));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: Spacing.four,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <ThemedText
            type="subtitle"
            accessibilityRole="header"
            style={[styles.pageTitle, { color: colors.text }]}
          >
            This week
          </ThemedText>
          <View style={styles.weekControls}>
            <WeekButton
              label="Previous week"
              icon={{
                ios: "chevron.left",
                android: "chevron_left",
                web: "chevron_left",
              }}
              colors={colors}
              onPress={() => changeWeek(-1)}
            />
            <WeekButton
              label="Next week"
              icon={{
                ios: "chevron.right",
                android: "chevron_right",
                web: "chevron_right",
              }}
              colors={colors}
              onPress={() => changeWeek(1)}
            />
          </View>
        </View>
        <ThemedText style={[styles.dateRange, { color: colors.secondary }]}>
          {rangeLabel}
        </ThemedText>

        {needs.length === 0 ? (
          <ThemedText style={{ color: colors.secondary }}>
            Add daily needs to build {household.name}&apos;s weekly schedule.
          </ThemedText>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View
              style={[
                styles.gridSurface,
                { width: gridWidth, backgroundColor: colors.surface },
              ]}
            >
              <View style={{ width: innerGridWidth }}>
                <View
                  style={[
                    styles.gridHeader,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={{ width: labelWidth }} />
                  {days.map((day) => {
                    const selected = day.key === todayKey;
                    const selectedText =
                      scheme === "dark" ? "#18211E" : "#FFFFFF";
                    return (
                      <View
                        key={day.key}
                        style={[styles.dayHeader, { width: cellWidth }]}
                      >
                        <View
                          style={[
                            styles.daySelected,
                            selected && { backgroundColor: colors.selected },
                          ]}
                        >
                          <ThemedText
                            style={{
                              color: selected ? selectedText : colors.secondary,
                              fontWeight: "700",
                            }}
                          >
                            {day.short}
                          </ThemedText>
                          <ThemedText
                            style={{
                              color: selected ? selectedText : colors.text,
                              fontSize: 19,
                              fontWeight: "700",
                            }}
                          >
                            {day.number}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {needs.map((need) => (
                  <View
                    key={need.id}
                    style={[
                      styles.taskRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.taskLabel, { width: labelWidth }]}>
                      <ThemedText
                        numberOfLines={2}
                        style={[styles.taskTitle, { color: colors.text }]}
                      >
                        {need.title}
                      </ThemedText>
                      <ThemedText style={{ color: colors.secondary }}>
                        {need.time}
                      </ThemedText>
                    </View>
                    {days.map((day) => {
                      const slot = getSlot(
                        need.id,
                        day.key,
                        day.date,
                        occurrences,
                      );
                      const scheduled =
                        isNeedScheduled(need, day.date) || Boolean(slot.source);
                      return (
                        <View
                          key={`${need.id}-${day.key}`}
                          style={[styles.cell, { width: cellWidth }]}
                        >
                          {scheduled ? (
                            <WeekSlot
                              need={need}
                              day={day}
                              slot={slot}
                              members={members}
                              colors={colors}
                            />
                          ) : (
                            <InactiveCell colors={colors} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {loadError ? (
          <ThemedText accessibilityRole="alert" style={styles.error}>
            {loadError}
          </ThemedText>
        ) : null}

        <View style={styles.coverageSection}>
          <ThemedText
            style={[styles.coverageTitle, { color: colors.secondary }]}
          >
            WHO COVERS WHAT
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.coverageRow}>
              {memberCounts.map(({ member, count }, index) => {
                const color = memberColors[index % memberColors.length];
                return (
                  <View
                    key={member.userId}
                    style={[
                      styles.coverageCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <ThemedText
                      style={[styles.coverageCount, { color: color.text }]}
                    >
                      {count}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      style={[styles.coverageName, { color: colors.secondary }]}
                    >
                      {member.name}
                    </ThemedText>
                  </View>
                );
              })}
              <View
                style={[
                  styles.coverageCard,
                  styles.openCoverage,
                  { backgroundColor: "#FFF7E9" },
                ]}
              >
                <ThemedText style={styles.openCount}>{openSlots}</ThemedText>
                <ThemedText style={styles.openLabel}>Open</ThemedText>
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function WeekButton({
  label,
  icon,
  colors,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof SymbolView>["name"];
  colors: (typeof palette)["light"];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.weekButton,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <SymbolView name={icon} tintColor={colors.text} size={23} />
    </Pressable>
  );
}

function WeekSlot({
  need,
  day,
  slot,
  members,
  colors,
}: {
  need: DailyNeed;
  day: WeekDay;
  slot: Slot;
  members: HouseholdMember[];
  colors: (typeof palette)["light"];
}) {
  const occurrence = slot.occurrence ?? slot.source;
  const isBooked = occurrence?.status === "booked";
  const isDone = occurrence?.status === "done";
  if (!occurrence || (!isBooked && !isDone)) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Book ${need.title} on ${day.short} ${day.number}`}
        onPress={() =>
          router.push({
            pathname: "/book-task",
            params: { needId: need.id, date: day.key },
          })
        }
        style={[
          styles.openSlot,
          { backgroundColor: "#FFF8EF", borderColor: "#E87919" },
        ]}
      >
        <SymbolView
          name={{ ios: "plus", android: "add", web: "add" }}
          tintColor="#9A4A12"
          size={22}
        />
      </Pressable>
    );
  }

  const name =
    occurrence.assignedName ??
    occurrence.completedName ??
    occurrence.bookedName ??
    "Open";
  const memberIndex = members.findIndex(
    (member) => member.userId === occurrence.assignedUserId,
  );
  const color =
    memberIndex >= 0
      ? memberColors[memberIndex % memberColors.length]
      : { background: "#E5DCF7", text: "#54378C" };

  return (
    <View
      accessibilityLabel={`${need.title}, ${isDone ? "done" : `booked by ${name}`}`}
      style={[
        styles.assignedSlot,
        { backgroundColor: isDone ? colors.inactive : color.background },
      ]}
    >
      <ThemedText style={[styles.initials, { color: color.text }]}>
        {getInitials(name)}
      </ThemedText>
      {isDone ? (
        <View style={styles.doneMark}>
          <SymbolView
            name={{ ios: "checkmark", android: "check", web: "check" }}
            tintColor="#FFFFFF"
            size={11}
          />
        </View>
      ) : null}
    </View>
  );
}

function InactiveCell({ colors }: { colors: (typeof palette)["light"] }) {
  return (
    <View style={[styles.inactiveCell, { backgroundColor: colors.inactive }]}>
      {[-12, 2, 16, 30, 44].map((left) => (
        <View key={left} style={[styles.hatch, { left }]} />
      ))}
    </View>
  );
}

function getSlot(
  needId: string,
  dateKey: string,
  date: Date,
  occurrences: readonly DailyNeedOccurrence[],
): Slot {
  const occurrence = occurrences.find(
    (item) => item.needId === needId && item.date === dateKey,
  );
  if (occurrence) return { occurrence };

  const previous = occurrences
    .filter((item) => item.needId === needId && item.date < dateKey)
    .sort((first, second) => second.date.localeCompare(first.date))[0];
  if (
    !previous ||
    (previous.status !== "booked" && previous.status !== "done") ||
    (previous.repeatRule !== "daily" && previous.repeatRule !== "weekday")
  ) {
    return {};
  }
  if (
    previous.repeatRule === "weekday" &&
    new Date(`${previous.date}T12:00:00`).getDay() !== date.getDay()
  ) {
    return {};
  }
  return { source: { ...previous, date: dateKey, status: "booked" } };
}

function isNeedScheduled(need: DailyNeed, date: Date) {
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    date.getDay()
  ];
  return need.repeatDays.includes(dayKey);
}

function getMonday(date: Date, offset: number) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday + offset * 7);
  return monday;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getInitials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 2))
    .join("");
}

function getWeekLabel(first: Date, last: Date) {
  const firstMonth = new Intl.DateTimeFormat("en-GB", {
    month: "short",
  }).format(first);
  const lastMonth = new Intl.DateTimeFormat("en-GB", {
    month: "long",
  }).format(last);
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${lastMonth}`;
  }
  return `${first.getDate()} ${firstMonth} – ${last.getDate()} ${lastMonth}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageTitle: { fontSize: 48, lineHeight: 56, fontWeight: "700" },
  weekControls: { flexDirection: "row", gap: Spacing.two },
  weekButton: {
    width: 58,
    height: 58,
    borderWidth: 1.5,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  dateRange: { fontSize: 19, paddingBottom: Spacing.three },
  gridSurface: {
    paddingHorizontal: Spacing.two,
    borderRadius: 28,
    overflow: "hidden",
    elevation: 1,
  },
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 92,
    borderBottomWidth: 1,
  },
  dayHeader: { alignItems: "center", justifyContent: "center" },
  daySelected: {
    minWidth: 50,
    minHeight: 68,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    borderBottomWidth: 1,
  },
  taskLabel: { paddingRight: Spacing.two, gap: 2 },
  taskTitle: { fontSize: 17, lineHeight: 21, fontWeight: "700" },
  cell: { alignItems: "center", justifyContent: "center" },
  assignedSlot: {
    width: 54,
    height: 54,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontWeight: "700", fontSize: 15 },
  doneMark: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#286B50",
    alignItems: "center",
    justifyContent: "center",
  },
  openSlot: {
    width: 54,
    height: 54,
    borderRadius: 13,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inactiveCell: {
    width: 54,
    height: 54,
    borderRadius: 13,
    overflow: "hidden",
  },
  hatch: {
    position: "absolute",
    top: -10,
    width: 4,
    height: 76,
    backgroundColor: "rgba(255,255,255,0.85)",
    transform: [{ rotate: "45deg" }],
  },
  coverageSection: { gap: Spacing.two, paddingTop: Spacing.three },
  coverageTitle: {
    fontSize: 16,
    fontWeight: "700",
    paddingBottom: Spacing.one,
  },
  coverageRow: { flexDirection: "row", gap: Spacing.two },
  coverageCard: {
    width: 132,
    minHeight: 108,
    borderRadius: 22,
    justifyContent: "center",
    padding: Spacing.two,
    gap: Spacing.one,
  },
  coverageCount: { fontSize: 34, lineHeight: 40, fontWeight: "700" },
  coverageName: { fontSize: 16 },
  openCoverage: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#E87919",
  },
  openCount: {
    color: "#9A4A12",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
  },
  openLabel: { color: "#9A4A12", fontSize: 16 },
  error: { color: "#C43C25", paddingTop: Spacing.two },
});
