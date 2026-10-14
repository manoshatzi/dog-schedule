import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LogoMark } from "@/components/logo-mark";
import { TaskEditor } from "@/components/task-editor";
import { MemberAvatar, OpenAvatar } from "@/components/task-ui";
import { ThemedText } from "@/components/themed-text";
import { Spacing, type PaletteColors } from "@/constants/theme";
import { useDailyNeeds } from "@/hooks/use-daily-needs";
import { usePalette } from "@/hooks/use-palette";
import { useTaskActions } from "@/hooks/use-task-actions";
import { formatClock, formatDayLabel, t, toDisplayUpperCase } from "@/i18n";
import {
  getTaskTitle,
  getTimingState,
  isNeedScheduledOn,
  resolveOccurrence,
  toClockKey,
  toDateKey,
  type DailyNeed,
  type DailyNeedOccurrence,
  type HouseholdMember,
  type TimingState,
} from "@/lib/tasks";

export function TodayList() {
  const { needs, occurrences, series, members, dog, userId, saveNeed } =
    useDailyNeeds();
  const { run, nameFor } = useTaskActions();
  const [now, setNow] = useState(() => new Date());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const dateKey = toDateKey(now);
  const dayLabel = toDisplayUpperCase(formatDayLabel(now));
  const rows = needs
    .filter((need) => isNeedScheduledOn(need, dateKey))
    .map((need) => ({
      need,
      occurrence: resolveOccurrence(need, dateKey, occurrences, series, members),
      timing: getTimingState(need, dateKey, now),
    }));
  const doneRows = rows.filter((row) => row.occurrence.status === "done");
  const openCount = rows.filter((row) => row.occurrence.status === "open").length;
  const allDone = rows.length > 0 && doneRows.length === rows.length;
  const nowTime = toClockKey(now);
  const nextNeedId = rows.find((row) => row.need.time >= nowTime)?.need.id;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function act(
    need: DailyNeed,
    occurrence: DailyNeedOccurrence,
    action: "claim" | "complete" | "undo",
  ) {
    setConfirmingId(null);
    setBusyId(need.id);
    try {
      await run(need, occurrence, action, {
        reminderEnabled: need.reminderMinutesBefore !== null,
      }, { quiet: action === "undo" });
    } finally {
      setBusyId(null);
    }
  }

  function openSheet(need: DailyNeed) {
    router.push({ pathname: "/task", params: { needId: need.id, date: dateKey } });
  }

  function getAllDoneSummary() {
    const counts = new Map<string, number>();
    for (const row of doneRows) {
      const id = row.occurrence.completedBy ?? "";
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1])
      .map(([id, count]) =>
        id === userId
          ? t("today.byYou", { count })
          : t("today.byName", { count, name: nameFor(id, null) }),
      )
      .join(", ");
  }

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.need.id}
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
            <View style={styles.headingRow}>
              <View style={styles.headingText}>
                <ThemedText style={[styles.dayLabel, { color: colors.muted }]}>
                  {dayLabel}
                </ThemedText>
                <ThemedText
                  accessibilityRole="header"
                  style={[styles.dogName, { color: colors.text }]}
                >
                  {t("today.title", { dog: dog.name })}
                </ThemedText>
              </View>
              {/* TODO(Family screen, screens.md #15): tap opens Family. */}
              <View style={[styles.paw, { backgroundColor: colors.primary }]}>
                <LogoMark size={30} color="#FFFFFF" />
              </View>
            </View>
            {rows.length > 0 ? (
              <View
                style={[styles.progressCard, { backgroundColor: colors.surface }]}
              >
                <View style={styles.progressLabels}>
                  <ThemedText
                    style={[styles.progressCount, { color: colors.text }]}
                  >
                    {allDone
                      ? t("today.allDone")
                      : t("today.progress", {
                          done: doneRows.length,
                          total: rows.length,
                        })}
                  </ThemedText>
                  {!allDone && openCount > 0 ? (
                    <ThemedText
                      style={[styles.openCount, { color: colors.openText }]}
                    >
                      {t("today.stillOpen", { count: openCount })}
                    </ThemedText>
                  ) : null}
                </View>
                {allDone ? (
                  <ThemedText type="small" style={{ color: colors.muted }}>
                    {getAllDoneSummary()}
                  </ThemedText>
                ) : null}
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: rows.length,
                    now: doneRows.length,
                  }}
                  style={[styles.progressTrack, { backgroundColor: colors.line }]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${(doneRows.length / rows.length) * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={{ color: colors.muted }}>
              {t("today.empty", { dog: dog.name })}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditorOpen(true)}
              style={({ pressed }) => [
                styles.emptyButton,
                { borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ ios: "plus", android: "add", web: "add" }}
                tintColor={colors.text}
                size={20}
              />
              <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                {t("today.addTask")}
              </ThemedText>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          rows.length > 0 && !nextNeedId ? (
            <NowMarker time={nowTime} colors={colors} />
          ) : (
            <View style={styles.footerSpace} />
          )
        }
        renderItem={({ item }) => (
          <>
            {item.need.id === nextNeedId ? (
              <NowMarker time={nowTime} colors={colors} />
            ) : null}
            <TaskRow
              need={item.need}
              occurrence={item.occurrence}
              timing={item.timing}
              userId={userId}
              members={members}
              colors={colors}
              busy={busyId === item.need.id}
              confirming={confirmingId === item.need.id}
              nameFor={nameFor}
              onOpen={() => openSheet(item.need)}
              onClaim={() => void act(item.need, item.occurrence, "claim")}
              onDone={() => {
                const claimedByOther =
                  item.occurrence.status === "booked" &&
                  item.occurrence.assignedUserId !== userId;
                if (claimedByOther && confirmingId !== item.need.id) {
                  setConfirmingId(item.need.id);
                  return;
                }
                void act(item.need, item.occurrence, "complete");
              }}
              onCancelConfirm={() => setConfirmingId(null)}
              onUndo={() => void act(item.need, item.occurrence, "undo")}
            />
          </>
        )}
      />
      {editorOpen ? (
        <TaskEditor
          dogName={dog.name}
          members={members}
          userId={userId}
          onClose={() => setEditorOpen(false)}
          onSave={async (input) => {
            await saveNeed(input);
            setEditorOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type TaskRowProps = {
  need: DailyNeed;
  occurrence: DailyNeedOccurrence;
  timing: TimingState;
  userId: string;
  members: readonly HouseholdMember[];
  colors: PaletteColors;
  busy: boolean;
  confirming: boolean;
  nameFor: (id: string | null, fallback: string | null) => string;
  onOpen: () => void;
  onClaim: () => void;
  onDone: () => void;
  onCancelConfirm: () => void;
  onUndo: () => void;
};

function TaskRow({
  need,
  occurrence,
  timing,
  userId,
  members,
  colors,
  busy,
  confirming,
  nameFor,
  onOpen,
  onClaim,
  onDone,
  onCancelConfirm,
  onUndo,
}: TaskRowProps) {
  const { status } = occurrence;
  const isMine = status === "booked" && occurrence.assignedUserId === userId;
  const title = getTaskTitle(need);
  const duration = t("common.minutes", { count: need.durationMinutes });
  const showDoneForOthers =
    status === "booked" && !isMine && timing !== "upcoming";

  const subtitle =
    status === "done"
      ? t("status.doneBy", {
          name: nameFor(occurrence.completedBy, occurrence.completedName),
          time: occurrence.completedAt ? formatClock(occurrence.completedAt) : "",
        })
      : status === "booked"
        ? `${
            isMine
              ? t("status.claimed.me")
              : t("status.claimed", {
                  name: nameFor(occurrence.assignedUserId, occurrence.assignedName),
                })
          } · ${duration}`
        : `${t("status.open")} · ${duration}`;

  const cardStyle =
    status === "done"
      ? { backgroundColor: colors.doneRow, borderColor: "transparent" }
      : status === "open"
        ? {
            backgroundColor: colors.openFill,
            borderColor: colors.openBorder,
            borderStyle: "dashed" as const,
          }
        : {
            backgroundColor: colors.surface,
            borderColor:
              isMine && timing !== "upcoming" ? colors.primary : "transparent",
          };

  return (
    <View style={styles.rowBlock}>
      <View style={styles.row}>
        <ThemedText
          style={[
            styles.time,
            { color: status === "done" ? colors.muted : colors.text },
          ]}
        >
          {need.time}
        </ThemedText>
        <View style={[styles.card, cardStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("today.openTaskA11y", { task: need.title })}
            onPress={onOpen}
            style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
          >
            {status === "done" ? (
              <View style={[styles.doneCheck, { backgroundColor: colors.primary }]}>
                <SymbolView
                  name={{ ios: "checkmark", android: "check", web: "check" }}
                  tintColor="#FFFFFF"
                  size={14}
                />
              </View>
            ) : status === "booked" ? (
              <MemberAvatar
                members={members}
                userId={occurrence.assignedUserId}
                name={nameFor(occurrence.assignedUserId, occurrence.assignedName)}
              />
            ) : (
              <OpenAvatar colors={colors} />
            )}
            <View style={styles.details}>
              <View style={styles.titleRow}>
                <ThemedText
                  numberOfLines={1}
                  style={[
                    styles.title,
                    { color: status === "done" ? colors.doneText : colors.text },
                    status === "done" && styles.doneTitle,
                  ]}
                >
                  {title}
                </ThemedText>
                {status !== "done" && timing !== "upcoming" ? (
                  <View
                    style={[
                      styles.tag,
                      {
                        backgroundColor:
                          timing === "overdue" ? colors.now : colors.warningFill,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.tagText,
                        {
                          color:
                            timing === "overdue" ? "#FFFFFF" : colors.warningText,
                        },
                      ]}
                    >
                      {timing === "overdue"
                        ? t("status.overdue")
                        : t("status.due")}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText
                numberOfLines={1}
                style={[
                  styles.subtitle,
                  { color: status === "open" ? colors.openText : colors.muted },
                  status === "open" && styles.openSubtitle,
                ]}
              >
                {subtitle}
              </ThemedText>
            </View>
          </Pressable>
          <View style={styles.actions}>
            {status === "done" && occurrence.completedBy === userId ? (
              <ActionButton
                label={t("action.undo")}
                accessibilityLabel={`${t("action.undo")}: ${need.title}`}
                variant="ghost"
                colors={colors}
                disabled={busy}
                onPress={onUndo}
              />
            ) : null}
            {status === "open" ? (
              <>
                <IconDoneButton
                  label={t("today.doneA11y", { task: need.title })}
                  colors={colors}
                  disabled={busy}
                  onPress={onDone}
                />
                <ActionButton
                  label={t("action.claim")}
                  variant="claim"
                  colors={colors}
                  disabled={busy}
                  onPress={onClaim}
                />
              </>
            ) : null}
            {isMine || showDoneForOthers ? (
              <ActionButton
                label={t("action.done")}
                accessibilityLabel={t("today.doneA11y", { task: need.title })}
                variant="done"
                colors={colors}
                disabled={busy}
                onPress={onDone}
              />
            ) : null}
          </View>
        </View>
      </View>
      {confirming ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.confirm, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <ThemedText style={[styles.confirmText, { color: colors.text }]}>
            {t("today.confirmDoneOther", {
              name: nameFor(occurrence.assignedUserId, occurrence.assignedName),
            })}
          </ThemedText>
          <View style={styles.confirmActions}>
            <ActionButton
              label={t("action.cancel")}
              variant="ghost"
              colors={colors}
              onPress={onCancelConfirm}
            />
            <ActionButton
              label={t("action.markDone")}
              variant="done"
              colors={colors}
              disabled={busy}
              onPress={onDone}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  accessibilityLabel,
  variant,
  colors,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  variant: "claim" | "done" | "ghost";
  colors: PaletteColors;
  disabled?: boolean;
  onPress: () => void;
}) {
  const background =
    variant === "claim"
      ? colors.claimButton
      : variant === "done"
        ? colors.primary
        : "transparent";
  const foreground =
    variant === "claim"
      ? colors.claimButtonText
      : variant === "done"
        ? colors.primaryText
        : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: background },
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <ThemedText
        numberOfLines={1}
        style={[styles.actionText, { color: foreground }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Small secondary Done on open rows ("I just did it"). */
function IconDoneButton({
  label,
  colors,
  disabled,
  onPress,
}: {
  label: string;
  colors: PaletteColors;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        { borderColor: colors.openBorder },
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <SymbolView
        name={{ ios: "checkmark", android: "check", web: "check" }}
        tintColor={colors.openText}
        size={16}
      />
    </Pressable>
  );
}

function NowMarker({ time, colors }: { time: string; colors: PaletteColors }) {
  return (
    <View style={styles.nowRow}>
      <ThemedText style={[styles.nowLabel, { color: colors.now }]}>
        {t("today.now", { time })}
      </ThemedText>
      <View style={[styles.nowLine, { backgroundColor: colors.now }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: Spacing.four - 4,
    paddingBottom: Spacing.four,
  },
  header: { gap: Spacing.three, paddingBottom: Spacing.three },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.three,
  },
  headingText: { flex: 1, minWidth: 0, gap: 2 },
  dayLabel: { fontSize: 13, fontWeight: "500", letterSpacing: 0.5 },
  dogName: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  paw: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  progressCard: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    gap: 10,
    elevation: 1,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  progressCount: { fontSize: 15, fontWeight: "600" },
  openCount: { fontSize: 13, fontWeight: "600" },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%" },
  empty: { gap: Spacing.three, paddingVertical: Spacing.three },
  emptyButton: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  footerSpace: { height: 96 },
  rowBlock: { marginBottom: Spacing.two, gap: Spacing.one },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  time: {
    width: 44,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 2,
    paddingRight: 8,
    elevation: 1,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 12,
  },
  doneCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  details: { flex: 1, minWidth: 0, gap: 2, paddingVertical: Spacing.two },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    minWidth: 0,
  },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "600", flexShrink: 1 },
  doneTitle: { textDecorationLine: "line-through" },
  subtitle: { fontSize: 12, lineHeight: 16 },
  openSubtitle: { fontWeight: "600" },
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionButton: {
    minHeight: 44,
    minWidth: 44,
    maxWidth: 150,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 14, fontWeight: "600" },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  confirm: {
    marginLeft: 52,
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.two,
    paddingLeft: Spacing.three,
    gap: Spacing.one,
  },
  confirmText: { fontSize: 14, fontWeight: "600" },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.two,
  },
  pressed: { opacity: 0.7 },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
    paddingLeft: 4,
  },
  nowLabel: { fontWeight: "700", fontSize: 11, letterSpacing: 0.6 },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
});
