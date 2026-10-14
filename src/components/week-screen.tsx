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
import { MemberColors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useDailyNeeds } from "@/hooks/use-daily-needs";
import { usePalette } from "@/hooks/use-palette";
import {
  formatWeekdayShort,
  formatWeekRange,
  t,
} from "@/i18n";
import {
  getInitials,
  getMemberColor,
  isNeedScheduledOn,
  resolveOccurrence,
  toDateKey,
  type DailyNeed,
  type DailyNeedOccurrence,
  type HouseholdMember,
} from "@/lib/tasks";

type Colors = ReturnType<typeof usePalette>;
type WeekDay = { date: Date; key: string; short: string; number: string };

/** Who a slot counts for in "Who covers what": completer, else claimer. */
function getSlotOwner(occurrence: DailyNeedOccurrence) {
  if (occurrence.status === "done") return occurrence.completedBy;
  if (occurrence.status === "booked") return occurrence.assignedUserId;
  return null;
}

export function WeekScreen() {
  const { needs, occurrences, series, members, dog, household, userId, loadOccurrences } =
    useDailyNeeds();
  const [weekOffset, setWeekOffset] = useState(0);
  const [loadError, setLoadError] = useState("");
  const { width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const colors = usePalette();
  const selectedDayColor = scheme === "dark" ? "#DDEDE1" : "#1C2321";

  const monday = getMonday(new Date(), weekOffset);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date,
      key: toDateKey(date),
      short: formatWeekdayShort(date),
      number: String(date.getDate()),
    };
  });
  const firstDate = days[0].key;
  const lastDate = days[6].key;
  const todayKey = toDateKey(new Date());
  const gridWidth = Math.max(
    620,
    Math.min(852, viewportWidth - 68 - insets.left - insets.right),
  );
  const innerGridWidth = gridWidth - Spacing.three;
  const labelWidth = 126;
  const cellWidth = (innerGridWidth - labelWidth) / 7;
  const solo = members.length <= 1;

  useEffect(() => {
    loadOccurrences(firstDate, lastDate).catch(() => {
      setLoadError(t("week.loadError"));
    });
  }, [firstDate, lastDate, loadOccurrences]);

  function changeWeek(amount: number) {
    setLoadError("");
    setWeekOffset((value) => value + amount);
  }

  const slots = needs.flatMap((need) =>
    days
      .filter((day) => isNeedScheduledOn(need, day.key))
      .map((day) =>
        resolveOccurrence(need, day.key, occurrences, series, members),
      ),
  );
  const openSlots = slots.filter((slot) => slot.status === "open").length;
  const memberCounts = members.map((member) => ({
    member,
    count: slots.filter((slot) => getSlotOwner(slot) === member.userId).length,
  }));

  return (
    <View style={[styles.screen, { backgroundColor: colors.ground }]}>
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
            accessibilityRole="header"
            style={[styles.pageTitle, { color: colors.text }]}
          >
            {t("week.title")}
          </ThemedText>
          <View style={styles.weekControls}>
            <WeekButton
              label={t("week.previous")}
              icon={{
                ios: "chevron.left",
                android: "chevron_left",
                web: "chevron_left",
              }}
              colors={colors}
              onPress={() => changeWeek(-1)}
            />
            <WeekButton
              label={t("week.next")}
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
        <ThemedText style={[styles.dateRange, { color: colors.muted }]}>
          {formatWeekRange(days[0].date, days[6].date)}
        </ThemedText>

        {needs.length === 0 ? (
          <ThemedText style={{ color: colors.muted }}>
            {t("week.empty", { dog: dog.name })}
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
                  style={[styles.gridHeader, { borderBottomColor: colors.line }]}
                >
                  <View style={{ width: labelWidth }} />
                  {days.map((day) => {
                    const selected = day.key === todayKey;
                    const selectedText =
                      scheme === "dark" ? "#1C2321" : "#FFFFFF";
                    return (
                      <View
                        key={day.key}
                        style={[styles.dayHeader, { width: cellWidth }]}
                      >
                        <View
                          style={[
                            styles.daySelected,
                            selected && { backgroundColor: selectedDayColor },
                          ]}
                        >
                          <ThemedText
                            numberOfLines={1}
                            style={{
                              color: selected ? selectedText : colors.muted,
                              fontWeight: "700",
                              fontSize: 13,
                            }}
                          >
                            {day.short}
                          </ThemedText>
                          <ThemedText
                            style={{
                              color: selected ? selectedText : colors.text,
                              fontSize: 17,
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
                    style={[styles.taskRow, { borderBottomColor: colors.line }]}
                  >
                    <View style={[styles.taskLabel, { width: labelWidth }]}>
                      <ThemedText
                        numberOfLines={2}
                        style={[styles.taskTitle, { color: colors.text }]}
                      >
                        {need.title}
                      </ThemedText>
                      <ThemedText style={{ color: colors.muted, fontSize: 13 }}>
                        {need.time}
                      </ThemedText>
                    </View>
                    {days.map((day) => (
                      <View
                        key={`${need.id}-${day.key}`}
                        style={[styles.cell, { width: cellWidth }]}
                      >
                        {isNeedScheduledOn(need, day.key) ? (
                          <WeekSlot
                            need={need}
                            day={day}
                            past={day.key < todayKey}
                            occurrence={resolveOccurrence(
                              need,
                              day.key,
                              occurrences,
                              series,
                              members,
                            )}
                            members={members}
                            userId={userId}
                            colors={colors}
                          />
                        ) : (
                          <InactiveCell colors={colors} />
                        )}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {loadError ? (
          <ThemedText
            accessibilityRole="alert"
            style={[styles.error, { color: colors.danger }]}
          >
            {loadError}
          </ThemedText>
        ) : null}

        <View style={styles.coverageSection}>
          <ThemedText style={[styles.coverageTitle, { color: colors.muted }]}>
            {t("week.coverage")}
          </ThemedText>
          {solo ? (
            // Solo nudge (user-flows.md a). TODO(Invite sheet, screens.md #21).
            <View
              style={[
                styles.soloCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}
            >
              <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                {t("week.soloNudge")}
              </ThemedText>
              <ThemedText selectable style={{ color: colors.muted }}>
                {t("week.inviteCode", { code: household.inviteCode })}
              </ThemedText>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.coverageRow}>
              {(solo ? [] : memberCounts).map(({ member, count }) => {
                const color = getMemberColor(members, member.userId);
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
                      style={[styles.coverageName, { color: colors.muted }]}
                    >
                      {member.userId === userId ? t("common.you") : member.name}
                    </ThemedText>
                  </View>
                );
              })}
              <View
                style={[
                  styles.coverageCard,
                  styles.openCoverage,
                  {
                    backgroundColor: colors.openFill,
                    borderColor: colors.openBorder,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.coverageCount, { color: colors.openText }]}
                >
                  {openSlots}
                </ThemedText>
                <ThemedText style={[styles.coverageName, { color: colors.openText }]}>
                  {t("week.open")}
                </ThemedText>
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
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.weekButton,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      <SymbolView name={icon} tintColor={colors.text} size={20} />
    </Pressable>
  );
}

function WeekSlot({
  need,
  day,
  past,
  occurrence,
  members,
  userId,
  colors,
}: {
  need: DailyNeed;
  day: WeekDay;
  past: boolean;
  occurrence: DailyNeedOccurrence;
  members: HouseholdMember[];
  userId: string;
  colors: Colors;
}) {
  const dayLabel = `${day.short} ${day.number}`;
  // Past days will open History (screens.md #18); not built yet, so they
  // are read-only here.
  const openSheet = past
    ? undefined
    : () =>
        router.push({
          pathname: "/task",
          params: { needId: need.id, date: day.key },
        });

  if (occurrence.status === "open") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("week.slotOpenA11y", {
          task: need.title,
          day: dayLabel,
        })}
        disabled={!openSheet}
        onPress={openSheet}
        style={[
          styles.openSlot,
          {
            backgroundColor: colors.openFill,
            borderColor: colors.openBorder,
          },
          past && styles.pastSlot,
        ]}
      >
        {past ? null : (
          <SymbolView
            name={{ ios: "plus", android: "add", web: "add" }}
            tintColor={colors.openText}
            size={20}
          />
        )}
      </Pressable>
    );
  }

  const isDone = occurrence.status === "done";
  const ownerId = getSlotOwner(occurrence);
  const name =
    (isDone ? occurrence.completedName : occurrence.assignedName) ??
    t("common.familyMember");
  const color = ownerId
    ? getMemberColor(members, ownerId)
    : MemberColors[0];
  const state = isDone
    ? t("status.doneBy", { name, time: "" }).trim()
    : ownerId === userId
      ? t("status.claimed.me")
      : t("status.claimed", { name });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("week.slotA11y", {
        task: need.title,
        day: dayLabel,
        state,
      })}
      disabled={!openSheet}
      onPress={openSheet}
      style={[
        styles.assignedSlot,
        { backgroundColor: isDone ? colors.doneRow : color.background },
      ]}
    >
      <ThemedText style={[styles.initials, { color: color.text }]}>
        {getInitials(name)}
      </ThemedText>
      {isDone ? (
        <View style={[styles.doneMark, { backgroundColor: colors.primary }]}>
          <SymbolView
            name={{ ios: "checkmark", android: "check", web: "check" }}
            tintColor="#FFFFFF"
            size={11}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

function InactiveCell({ colors }: { colors: Colors }) {
  return (
    <View style={[styles.inactiveCell, { backgroundColor: colors.inset }]}>
      {[-12, 2, 16, 30, 44].map((left) => (
        <View key={left} style={[styles.hatch, { left }]} />
      ))}
    </View>
  );
}

function getMonday(date: Date, offset: number) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday + offset * 7);
  return monday;
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
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  weekControls: { flexDirection: "row", gap: Spacing.two },
  weekButton: {
    width: 44,
    height: 44,
    borderWidth: 1.5,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dateRange: { fontSize: 15, paddingBottom: Spacing.three },
  gridSurface: {
    paddingHorizontal: Spacing.two,
    borderRadius: 18,
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
    alignItems: "center",
    justifyContent: "center",
  },
  pastSlot: { opacity: 0.6 },
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
  soloCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  coverageTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
    fontWeight: "700",
    paddingBottom: Spacing.one,
  },
  coverageRow: { flexDirection: "row", gap: Spacing.two },
  coverageCard: {
    width: 112,
    minHeight: 88,
    borderRadius: 16,
    justifyContent: "center",
    padding: Spacing.two,
    gap: Spacing.one,
  },
  coverageCount: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  coverageName: { fontSize: 14 },
  openCoverage: {
    borderWidth: 2,
    borderStyle: "dashed",
  },
  error: { paddingTop: Spacing.two },
});
