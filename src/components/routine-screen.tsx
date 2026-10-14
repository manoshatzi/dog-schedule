import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountSheet } from "@/components/account-sheet";
import { LogoMark } from "@/components/logo-mark";
import { getRepeatLabel, TaskEditor } from "@/components/task-editor";
import { ThemedText } from "@/components/themed-text";
import { useToast } from "@/components/toast";
import { Spacing } from "@/constants/theme";
import { useDailyNeeds } from "@/hooks/use-daily-needs";
import { usePalette } from "@/hooks/use-palette";
import { formatLongDate, t, tPlural } from "@/i18n";
import {
  formatAmount,
  fromDateKey,
  resolveOccurrence,
  toDateKey,
  type DailyNeed,
} from "@/lib/tasks";

function getDogAge(birthday: string | null, now: Date) {
  if (!birthday) return null;
  const born = fromDateKey(birthday);
  const months =
    (now.getFullYear() - born.getFullYear()) * 12 +
    (now.getMonth() - born.getMonth()) -
    (now.getDate() < born.getDate() ? 1 : 0);
  if (months < 0) return null;
  if (months < 12) return t("routine.age.months", { count: months });
  return tPlural("routine.age.years", Math.floor(months / 12));
}

export function RoutineScreen() {
  const {
    needs,
    occurrences,
    series,
    household,
    dog,
    members,
    userId,
    saveNeed,
    archiveNeed,
  } = useDailyNeeds();
  const { showToast } = useToast();
  const [editor, setEditor] = useState<DailyNeed | "new" | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const solo = members.length <= 1;
  const age = getDogAge(dog.birthday, new Date());
  const membersLabel = solo
    ? t("routine.members.one")
    : t("routine.members.other", { count: members.length });
  const editing = editor !== null && editor !== "new" ? editor : undefined;
  const editingToday = editing
    ? resolveOccurrence(
        editing,
        toDateKey(new Date()),
        occurrences,
        series,
        members,
      )
    : null;
  const claimedTodayBy =
    editingToday?.status === "booked" && editingToday.assignedUserId !== userId
      ? editingToday.assignedName
      : null;

  return (
    <>
      <FlatList
        data={needs}
        keyExtractor={(need) => need.id}
        style={[styles.list, { backgroundColor: colors.ground }]}
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
            <View style={styles.titleRow}>
              <ThemedText
                accessibilityRole="header"
                style={[styles.title, { color: colors.text }]}
              >
                {t("routine.title")}
              </ThemedText>
              {/* Gear → Settings (screens.md #20). Interim: account sheet. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("routine.accountA11y")}
                onPress={() => setAccountOpen(true)}
                style={({ pressed }) => [
                  styles.gear,
                  { backgroundColor: colors.surface },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={{ ios: "gearshape", android: "settings", web: "settings" }}
                  tintColor={colors.text}
                  size={22}
                />
              </Pressable>
            </View>
            {/* TODO(Family screen, screens.md #15): the dog card opens Family. */}
            <View style={[styles.dogCard, { backgroundColor: colors.primary }]}>
              <View style={styles.dogAvatar}>
                <LogoMark size={34} color={colors.primary} />
              </View>
              <View style={styles.dogText}>
                <ThemedText numberOfLines={1} style={styles.dogName}>
                  {dog.name}
                </ThemedText>
                <ThemedText style={styles.dogMeta}>
                  {[age, membersLabel].filter(Boolean).join(" · ")}
                </ThemedText>
                {solo ? (
                  <ThemedText selectable style={styles.dogMeta}>
                    {t("week.inviteCode", { code: household.inviteCode })}
                  </ThemedText>
                ) : null}
              </View>
            </View>
            <ThemedText style={[styles.intro, { color: colors.muted }]}>
              {t("routine.intro", { dog: dog.name })}
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          <ThemedText style={[styles.empty, { color: colors.muted }]}>
            {t("routine.empty")}
          </ThemedText>
        }
        ListFooterComponent={
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditor("new")}
            style={({ pressed }) => [
              styles.addButton,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={{ ios: "plus", android: "add", web: "add" }}
              tintColor={colors.text}
              size={20}
            />
            <ThemedText style={[styles.addText, { color: colors.text }]}>
              {t("routine.add")}
            </ThemedText>
          </Pressable>
        }
        renderItem={({ item }) => {
          const amount = formatAmount(item.amountValue, item.amountUnit);
          const schedule = item.oneOffDate
            ? t("routine.once", {
                date: formatLongDate(fromDateKey(item.oneOffDate)),
              })
            : getRepeatLabel(item.repeatDays);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("routine.editA11y", {
                task: item.title,
                time: item.time,
              })}
              onPress={() => setEditor(item)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={[styles.time, { color: colors.text }]}>
                {item.time}
              </ThemedText>
              <View style={styles.rowContent}>
                <View style={styles.rowHeading}>
                  <ThemedText
                    numberOfLines={1}
                    style={[styles.rowTitle, { color: colors.text }]}
                  >
                    {item.title}
                  </ThemedText>
                  {item.required ? (
                    <ThemedText
                      style={[
                        styles.badge,
                        {
                          color: colors.mustText,
                          backgroundColor: colors.mustFill,
                        },
                      ]}
                    >
                      {t("mustBadge")}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText
                  numberOfLines={1}
                  type="small"
                  style={{ color: colors.muted }}
                >
                  {[
                    amount ?? t("common.minutes", { count: item.durationMinutes }),
                    schedule,
                  ].join(" · ")}
                </ThemedText>
              </View>
              <SymbolView
                name={{
                  ios: "chevron.right",
                  android: "chevron_right",
                  web: "chevron_right",
                }}
                tintColor={colors.muted}
                size={18}
              />
            </Pressable>
          );
        }}
      />
      {editor !== null ? (
        <TaskEditor
          need={editing}
          dogName={dog.name}
          members={members}
          userId={userId}
          claimedTodayBy={claimedTodayBy}
          onClose={() => setEditor(null)}
          onSave={async (input) => {
            await saveNeed(input);
            setEditor(null);
          }}
          onDelete={
            editing
              ? async () => {
                  await archiveNeed(editing.id);
                  setEditor(null);
                  showToast({ message: t("toast.deleted") });
                }
              : undefined
          }
        />
      ) : null}
      {accountOpen ? <AccountSheet onClose={() => setAccountOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: Spacing.four - 4,
    paddingBottom: 96,
  },
  header: { gap: Spacing.three, paddingBottom: Spacing.three },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dogCard: {
    borderRadius: 18,
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  dogAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DDEDE1",
    alignItems: "center",
    justifyContent: "center",
  },
  dogText: { flex: 1, minWidth: 0, gap: 2 },
  dogName: { color: "#FFFFFF", fontSize: 20, lineHeight: 26, fontWeight: "700" },
  dogMeta: { color: "#DDEDE1", fontSize: 13 },
  intro: { fontSize: 15, lineHeight: 22 },
  empty: { paddingBottom: Spacing.three },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
    marginBottom: Spacing.two,
  },
  time: {
    width: 48,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  rowContent: { flex: 1, minWidth: 0, gap: 2 },
  rowHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  rowTitle: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  badge: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: "hidden",
  },
  addButton: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  addText: { fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
