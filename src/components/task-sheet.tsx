import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MemberAvatar } from "@/components/task-ui";
import { ThemedText } from "@/components/themed-text";
import { Spacing, type PaletteColors } from "@/constants/theme";
import { useDailyNeeds } from "@/hooks/use-daily-needs";
import { usePalette } from "@/hooks/use-palette";
import { useTaskActions, type ConflictMessage } from "@/hooks/use-task-actions";
import {
  formatClock,
  formatDayLabel,
  formatWeekdayShort,
  t,
  toDisplayUpperCase,
} from "@/i18n";
import type { TransitionAction } from "@/lib/database.types";
import {
  findActiveSeries,
  formatAmount,
  fromDateKey,
  getEndTime,
  getTaskPhrase,
  resolveOccurrence,
  toDateKey,
  type BookingRepeat,
} from "@/lib/tasks";

type Confirm = "take_over" | "complete_other" | "reopen" | null;

/**
 * Task sheet (was "Book a task"): details plus claim, assign, release, take
 * over, done and "mark as not done" for a task on a given day. Presented as a
 * form sheet; also the target for push deep links:
 * dogschedule://task?needId=<id>&date=<YYYY-MM-DD>.
 */
export function TaskSheet() {
  const { needId, date: dateParam } = useLocalSearchParams<{
    needId: string;
    date?: string;
  }>();
  const {
    needs,
    occurrences,
    series,
    household,
    dog,
    members,
    userId,
    loadOccurrences,
  } = useDailyNeeds();
  const { run, nameFor, describeConflict } = useTaskActions();
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const todayKey = toDateKey(new Date());
  const date = typeof dateParam === "string" ? dateParam : todayKey;
  const need = needs.find((item) => item.id === needId);
  const occurrence = need
    ? resolveOccurrence(need, date, occurrences, series, members)
    : null;
  const activeSeries = need
    ? findActiveSeries(need.id, date, series, members)
    : undefined;
  const [assignee, setAssignee] = useState<string>(
    occurrence?.status === "booked" && occurrence.assignedUserId
      ? occurrence.assignedUserId
      : userId,
  );
  const [repeat, setRepeat] = useState<BookingRepeat>(
    activeSeries?.repeatRule ?? "today",
  );
  const [reminderEnabled, setReminderEnabled] = useState(
    need ? need.reminderMinutesBefore !== null : true,
  );
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ConflictMessage | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    loadOccurrences(date, date).catch(() => undefined);
  }, [date, loadOccurrences]);

  if (!need || !occurrence) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.ground }]}>
        <ThemedText style={{ color: colors.text }}>{t("sheet.missing")}</ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.textButton}
        >
          <ThemedText style={{ color: colors.primary, fontWeight: "700" }}>
            {t("sheet.goBack")}
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  const selectedDate = fromDateKey(date);
  const isFuture = date > todayKey;
  const status = occurrence.status;
  const claimer = occurrence.assignedUserId;
  const isMine = status === "booked" && claimer === userId;
  const reminderMinutes = need.reminderMinutesBefore ?? 15;
  const amount = formatAmount(need.amountValue, need.amountUnit);
  const assigneeName =
    assignee === userId ? t("common.me") : nameFor(assignee, null);
  const claimerName = nameFor(claimer, occurrence.assignedName);
  const repeatsForClaimer =
    status === "booked" &&
    activeSeries &&
    activeSeries.assignedUserId === claimer;

  async function perform(
    action: TransitionAction,
    options: Parameters<typeof run>[3] = {},
  ) {
    if (!need || !occurrence) return;
    setBusy(true);
    setProblem(null);
    setConfirm(null);
    try {
      const outcome = await run(need, occurrence, action, options, {
        inlineFailures: true,
      });
      if (!outcome) {
        setProblem({ message: t("error.couldNotSave") });
      } else if (!outcome.ok) {
        setProblem(
          describeConflict(need, action, outcome) ?? {
            message: t("conflict.changed"),
          },
        );
      } else {
        router.back();
      }
    } finally {
      setBusy(false);
    }
  }

  const claimOptions = {
    assignedUserId: assignee,
    repeatRule: repeat,
    reminderEnabled,
  };

  // Primary and secondary actions for the current state.
  let primary: { label: string; onPress: () => void; tone?: "claim" } | null =
    null;
  const secondary: { label: string; onPress: () => void; danger?: boolean }[] =
    [];

  if (status === "open") {
    primary = {
      label:
        assignee === userId
          ? t("action.claimTask", { task: getTaskPhrase(need.title) })
          : t("action.assignTo", { name: assigneeName }),
      onPress: () => void perform("claim", claimOptions),
      tone: "claim",
    };
    if (!isFuture) {
      secondary.push({
        label: t("action.done"),
        onPress: () => void perform("complete"),
      });
    }
  } else if (status === "booked" && isMine) {
    if (assignee !== userId) {
      primary = {
        label: t("action.assignTo", { name: assigneeName }),
        onPress: () => void perform("take_over", claimOptions),
        tone: "claim",
      };
    } else if (!isFuture) {
      primary = {
        label: t("action.done"),
        onPress: () => void perform("complete"),
      };
    }
    if (repeatsForClaimer) {
      secondary.push(
        {
          label: t("action.releaseToday"),
          onPress: () => void perform("release", { releaseScope: "day" }),
        },
        {
          label: t("action.stopRepeating"),
          onPress: () => void perform("release", { releaseScope: "series" }),
        },
      );
    } else {
      secondary.push({
        label: t("action.release"),
        onPress: () => void perform("release"),
      });
    }
  } else if (status === "booked") {
    primary = {
      label:
        assignee === userId || assignee === claimer
          ? t("action.takeOver")
          : t("action.assignTo", { name: assigneeName }),
      onPress: () => setConfirm("take_over"),
      tone: "claim",
    };
    if (!isFuture) {
      secondary.push({
        label: t("action.markDone"),
        onPress: () => setConfirm("complete_other"),
      });
    }
  } else if (occurrence.completedBy === userId) {
    secondary.push({
      label: t("action.undo"),
      onPress: () => void perform("undo"),
    });
  } else {
    secondary.push({
      label: t("action.markNotDone"),
      onPress: () => setConfirm("reopen"),
      danger: true,
    });
  }

  const confirmText =
    confirm === "take_over"
      ? t("sheet.confirmTakeOver", { name: claimerName })
      : confirm === "complete_other"
        ? t("today.confirmDoneOther", { name: claimerName })
        : confirm === "reopen"
          ? t("sheet.confirmMarkNotDone", {
              name: nameFor(occurrence.completedBy, occurrence.completedName),
            })
          : "";

  function confirmAction() {
    if (confirm === "take_over") {
      void perform("take_over", {
        ...claimOptions,
        assignedUserId: assignee === claimer ? userId : assignee,
      });
    } else if (confirm === "complete_other") {
      void perform("complete");
    } else if (confirm === "reopen") {
      void perform("reopen");
    }
  }

  const badge =
    status === "open"
      ? {
          label: toDisplayUpperCase(t("status.open")),
          fill: colors.openFill,
          text: colors.openText,
        }
      : status === "booked"
        ? {
            label: toDisplayUpperCase(t("status.claimedShort")),
            fill: colors.primarySoft,
            text: colors.primary,
          }
        : {
            label: toDisplayUpperCase(t("status.doneShort")),
            fill: colors.doneRow,
            text: colors.doneText,
          };

  return (
    <View style={[styles.screen, { backgroundColor: colors.ground }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("action.close")}
          onPress={() => router.back()}
          style={[styles.closeButton, { backgroundColor: colors.surface }]}
        >
          <SymbolView
            name={{ ios: "xmark", android: "close", web: "close" }}
            tintColor={colors.text}
            size={18}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.taskCard, { backgroundColor: colors.surface }]}>
          <View style={styles.dateRow}>
            <ThemedText
              style={[styles.badge, { backgroundColor: badge.fill, color: badge.text }]}
            >
              {badge.label}
            </ThemedText>
            <ThemedText style={[styles.dateLabel, { color: colors.muted }]}>
              {formatDayLabel(selectedDate)}
            </ThemedText>
          </View>
          <ThemedText
            accessibilityRole="header"
            style={[styles.taskTitle, { color: colors.text }]}
          >
            {need.title}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.text }]}>
            {[
              `${need.time} – ${getEndTime(need)}`,
              amount ?? t("common.minutes", { count: need.durationMinutes }),
            ].join(" · ")}
          </ThemedText>
          {status === "booked" ? (
            <ThemedText style={{ color: colors.muted }}>
              {isMine ? t("status.claimed.me") : t("status.claimed", { name: claimerName })}
              {repeatsForClaimer && activeSeries
                ? ` · ${
                    activeSeries.repeatRule === "daily"
                      ? t("repeat.everyDay")
                      : t("repeat.everyWeekday", {
                          day: formatWeekdayShort(selectedDate),
                        })
                  }`
                : ""}
            </ThemedText>
          ) : null}
          {status === "done" ? (
            <ThemedText style={{ color: colors.muted }}>
              {t("sheet.doneBy", {
                name: nameFor(occurrence.completedBy, occurrence.completedName),
                time: occurrence.completedAt
                  ? formatClock(occurrence.completedAt)
                  : "",
              })}
            </ThemedText>
          ) : null}
          {need.details ? (
            <View style={[styles.notes, { backgroundColor: colors.inset }]}>
              <ThemedText style={{ color: colors.text }}>{need.details}</ThemedText>
            </View>
          ) : null}
        </View>

        {status !== "done" ? (
          <>
            <Section label={t("sheet.who")} colors={colors}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.memberRow}>
                  {members.map((member) => {
                    const selected = member.userId === assignee;
                    const label =
                      member.userId === userId ? t("common.me") : member.name;
                    return (
                      <Pressable
                        key={member.userId}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setAssignee(member.userId)}
                        style={[
                          styles.memberChip,
                          {
                            borderColor: selected ? colors.primary : colors.line,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <MemberAvatar
                          members={members}
                          userId={member.userId}
                          name={member.name}
                          size={32}
                        />
                        <ThemedText style={[styles.memberName, { color: colors.text }]}>
                          {label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                  {members.length <= 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowInvite((value) => !value)}
                      style={[
                        styles.memberChip,
                        styles.inviteChip,
                        { borderColor: colors.openBorder },
                      ]}
                    >
                      <ThemedText style={{ color: colors.openText, fontWeight: "700" }}>
                        {t("sheet.invite")}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </ScrollView>
              {/* TODO(Invite sheet, screens.md #21): open the share sheet. */}
              {showInvite ? (
                <ThemedText selectable style={{ color: colors.muted }}>
                  {t("sheet.inviteHint", { code: household.inviteCode })}
                </ThemedText>
              ) : null}
            </Section>

            {status === "open" || assignee !== claimer ? (
              <Section label={t("sheet.repeat")} colors={colors}>
                <View style={[styles.segment, { backgroundColor: colors.line }]}>
                  {(["today", "weekday", "daily"] as const).map((key) => {
                    const selected = repeat === key;
                    const label =
                      key === "today"
                        ? t("repeat.justToday")
                        : key === "weekday"
                          ? t("repeat.everyWeekday", {
                              day: formatWeekdayShort(selectedDate),
                            })
                          : t("repeat.everyDay");
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setRepeat(key)}
                        style={[
                          styles.segmentOption,
                          selected && { backgroundColor: colors.surface },
                        ]}
                      >
                        <ThemedText
                          style={[styles.segmentText, { color: colors.text }]}
                        >
                          {label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            {status === "open" || assignee !== claimer ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: reminderEnabled }}
                onPress={() => setReminderEnabled((value) => !value)}
                style={[styles.reminderRow, { backgroundColor: colors.surface }]}
              >
                <ThemedText style={[styles.reminderText, { color: colors.text }]}>
                  {t("sheet.remind", { count: reminderMinutes })}
                </ThemedText>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: reminderEnabled ? colors.primary : colors.border,
                      backgroundColor: reminderEnabled
                        ? colors.primary
                        : colors.surface,
                    },
                  ]}
                >
                  {reminderEnabled ? (
                    <SymbolView
                      name={{ ios: "checkmark", android: "check", web: "check" }}
                      tintColor="#FFFFFF"
                      size={16}
                    />
                  ) : null}
                </View>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <ThemedText style={[styles.helper, { color: colors.muted }]}>
          {t("sheet.helper", { dog: dog.name })}
        </ThemedText>
        {isFuture && status !== "done" ? (
          <ThemedText type="small" style={{ color: colors.muted }}>
            {t("sheet.futureDone")}
          </ThemedText>
        ) : null}

        {problem ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.problem,
              { backgroundColor: colors.warningFill, borderColor: colors.openBorder },
            ]}
          >
            <ThemedText style={[styles.problemText, { color: colors.warningText }]}>
              {problem.message}
            </ThemedText>
            {problem.detail ? (
              <ThemedText style={{ color: colors.warningText }}>
                {problem.detail}
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {confirm ? (
          <View
            style={[styles.confirm, { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
              {confirmText}
            </ThemedText>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirm(null)}
                style={styles.textButton}
              >
                <ThemedText style={{ color: colors.muted, fontWeight: "600" }}>
                  {t("action.cancel")}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={confirmAction}
                style={[
                  styles.smallButton,
                  {
                    backgroundColor:
                      confirm === "reopen" ? colors.danger : colors.primary,
                  },
                ]}
              >
                <ThemedText style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  {confirm === "take_over"
                    ? t("action.takeOver")
                    : confirm === "reopen"
                      ? t("action.markNotDone")
                      : t("action.markDone")}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.ground,
            paddingBottom: insets.bottom + Spacing.two,
          },
        ]}
      >
        {secondary.length > 0 ? (
          <View style={styles.secondaryRow}>
            {secondary.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                disabled={busy}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: item.danger ? colors.danger : colors.border },
                  (pressed || busy) && styles.pressed,
                ]}
              >
                <ThemedText
                  numberOfLines={1}
                  style={{
                    color: item.danger ? colors.danger : colors.text,
                    fontWeight: "600",
                  }}
                >
                  {item.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {primary ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={primary.onPress}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor:
                  primary.tone === "claim" ? colors.claimButton : colors.primary,
              },
              (pressed || busy) && styles.pressed,
            ]}
          >
            <ThemedText
              numberOfLines={2}
              style={[
                styles.primaryText,
                {
                  color:
                    primary.tone === "claim"
                      ? colors.claimButtonText
                      : colors.primaryText,
                },
              ]}
            >
              {busy ? t("auth.wait") : primary.label}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: PaletteColors;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: colors.muted }]}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: Spacing.four - 4,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  taskCard: { borderRadius: 18, padding: Spacing.three, gap: Spacing.two },
  dateRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  badge: {
    overflow: "hidden",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateLabel: { fontSize: 14 },
  taskTitle: { fontSize: 26, lineHeight: 32, fontWeight: "700" },
  meta: { fontSize: 15, fontVariant: ["tabular-nums"] },
  notes: { padding: Spacing.three, borderRadius: 12 },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  memberRow: { flexDirection: "row", gap: Spacing.two },
  memberChip: {
    minHeight: 48,
    borderWidth: 2,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingLeft: 6,
    paddingRight: Spacing.three,
  },
  inviteChip: { borderStyle: "dashed", paddingLeft: Spacing.three },
  memberName: { fontSize: 15, fontWeight: "600" },
  segment: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  segmentOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.one,
  },
  segmentText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  reminderRow: {
    minHeight: 56,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  reminderText: { fontSize: 15, flex: 1 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: { fontSize: 14, lineHeight: 20 },
  problem: {
    borderRadius: 14,
    borderWidth: 2,
    padding: Spacing.three,
    gap: 2,
  },
  problemText: { fontSize: 15, fontWeight: "700" },
  confirm: {
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.two,
  },
  textButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  secondaryRow: { flexDirection: "row", gap: Spacing.two },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
  },
  primaryText: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  pressed: { opacity: 0.7 },
  missing: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.three,
  },
});
