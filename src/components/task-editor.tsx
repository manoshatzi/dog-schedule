import { SymbolView } from "expo-symbols";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getTypeLabel, taskTypes } from "@/components/task-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Spacing, type PaletteColors } from "@/constants/theme";
import { usePalette } from "@/hooks/use-palette";
import { formatLongDate, formatWeekdayShort, t, type StringKey } from "@/i18n";
import {
  addDays,
  formatAmount,
  fromDateKey,
  mondayFirstKeys,
  toDateKey,
  type AmountUnit,
  type DailyNeed,
  type DailyNeedInput,
  type HouseholdMember,
  type TaskType,
} from "@/lib/tasks";

type TaskEditorProps = {
  need?: DailyNeed;
  dogName: string;
  members: readonly HouseholdMember[];
  userId: string;
  /** Name of whoever has claimed today's occurrence, for the delete warning. */
  claimedTodayBy?: string | null;
  onClose: () => void;
  onSave: (input: DailyNeedInput) => Promise<void>;
  onDelete?: () => Promise<void>;
};

type RepeatMode = "days" | "once";
type AmountOption = { value: number | null; unit: AmountUnit | null };

const timePresets = [
  { key: "editor.preset.morning", value: "07:30" },
  { key: "editor.preset.midday", value: "13:00" },
  { key: "editor.preset.evening", value: "18:00" },
  { key: "editor.preset.night", value: "22:30" },
] as const;

const amountOptions: Partial<Record<TaskType, AmountOption[]>> = {
  food: [
    { value: 100, unit: "g" },
    { value: 150, unit: "g" },
    { value: 200, unit: "g" },
  ],
  medicine: [
    { value: 1, unit: "pill" },
    { value: 2, unit: "pill" },
    { value: 1, unit: "drop" },
  ],
};

const durationOptions = [10, 15, 30, 45, 60];
const reminderOptions: (number | null)[] = [null, 5, 15, 30, 60];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function getDayPartKey(time: string): StringKey {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return "editor.preset.morning";
  if (hour < 16) return "editor.preset.midday";
  if (hour < 21) return "editor.preset.evening";
  return "editor.preset.night";
}

function getDefaultName(type: TaskType, time: string) {
  if (type === "walk") {
    return t("editor.walkName", { part: t(getDayPartKey(time)) });
  }
  return getTypeLabel(type);
}

export function getRepeatLabel(days: readonly string[]) {
  if (days.length === 7) return t("repeat.everyDay");
  if (
    days.length === 5 &&
    mondayFirstKeys.slice(0, 5).every((day) => days.includes(day))
  ) {
    return t("repeat.weekdays");
  }
  if (days.length === 2 && days.includes("sat") && days.includes("sun")) {
    return t("repeat.weekends");
  }
  const labels = mondayFirstKeys
    .map((key, index) => ({ key, date: mondayOfReferenceWeek(index) }))
    .filter((day) => days.includes(day.key))
    .map((day) => formatWeekdayShort(day.date));
  return labels.join(", ") || t("repeat.chooseDays");
}

/** 2024-01-01 was a Monday; used to localise weekday names. */
function mondayOfReferenceWeek(offset: number) {
  return new Date(2024, 0, 1 + offset, 12);
}

export function TaskEditor({
  need,
  dogName,
  members,
  userId,
  claimedTodayBy,
  onClose,
  onSave,
  onDelete,
}: TaskEditorProps) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TaskType>(need?.type ?? "walk");
  const [time, setTime] = useState(need?.time ?? "07:30");
  const [title, setTitle] = useState(need?.title ?? getDefaultName("walk", "07:30"));
  const [titleTouched, setTitleTouched] = useState(Boolean(need));
  const [details, setDetails] = useState(need?.details ?? "");
  const [required, setRequired] = useState(need?.required ?? false);
  const [durationMinutes, setDurationMinutes] = useState(
    need?.durationMinutes ?? 15,
  );
  const [amount, setAmount] = useState<AmountOption>({
    value: need?.amountValue ?? null,
    unit: need?.amountUnit ?? null,
  });
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(
    need?.oneOffDate ? "once" : "days",
  );
  const [repeatDays, setRepeatDays] = useState<string[]>(
    need?.repeatDays ?? [...mondayFirstKeys],
  );
  const [oneOffDate, setOneOffDate] = useState(
    need?.oneOffDate ?? toDateKey(new Date()),
  );
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(
    need?.defaultAssigneeId ?? null,
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(
    need ? need.reminderMinutesBefore : 15,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border },
  ];
  const amounts = amountOptions[type];

  function updateTime(next: string) {
    setTime(next);
    if (!titleTouched && timePattern.test(next)) {
      setTitle(getDefaultName(type, next));
    }
  }

  function adjustTime(minutesDelta: number) {
    const [hours, minutes] = (timePattern.test(time) ? time : "07:30")
      .split(":")
      .map(Number);
    const next = (hours * 60 + minutes + minutesDelta + 1440) % 1440;
    updateTime(
      `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`,
    );
  }

  function selectType(nextType: TaskType) {
    setType(nextType);
    if (!titleTouched) setTitle(getDefaultName(nextType, time));
    const nextAmounts = amountOptions[nextType];
    if (
      !nextAmounts?.some(
        (option) => option.unit === amount.unit && option.value === amount.value,
      )
    ) {
      setAmount({ value: null, unit: null });
    }
  }

  function setDays(days: readonly string[]) {
    setRepeatMode("days");
    setRepeatDays([...days]);
  }

  function toggleDay(day: string) {
    setRepeatDays((current) =>
      current.includes(day)
        ? current.filter((selected) => selected !== day)
        : mondayFirstKeys.filter(
            (key) => current.includes(key) || key === day,
          ),
    );
  }

  async function submit() {
    if (!title.trim()) {
      setError(t("editor.errorName"));
      return;
    }
    if (!timePattern.test(time.trim())) {
      setError(t("editor.errorTime"));
      return;
    }
    if (repeatMode === "days" && repeatDays.length === 0) {
      setError(t("editor.errorDays"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        id: need?.id,
        title: title.trim(),
        time: time.trim(),
        details: details.trim(),
        required,
        type,
        durationMinutes,
        // A one-off task keeps its weekday list for when it is made repeating.
        repeatDays: repeatDays.length ? repeatDays : [...mondayFirstKeys],
        amountValue: amounts ? amount.value : null,
        amountUnit: amounts ? amount.unit : null,
        oneOffDate: repeatMode === "once" ? oneOffDate : null,
        defaultAssigneeId,
        reminderMinutesBefore: reminderMinutes,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("editor.errorSave"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setSaving(true);
    setError("");
    try {
      await onDelete();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : t("editor.errorSave"),
      );
      setSaving(false);
    }
  }

  const repeatSummary =
    repeatMode === "once"
      ? t("editor.onceOn", { date: formatLongDate(fromDateKey(oneOffDate)) })
      : getRepeatLabel(repeatDays);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.backdrop, { paddingTop: insets.top + Spacing.one }]}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          <View style={styles.header}>
            <View style={styles.heading}>
              <ThemedText
                accessibilityRole="header"
                style={[styles.headerTitle, { color: colors.text }]}
              >
                {need ? t("editor.edit") : t("editor.new")}
              </ThemedText>
              <ThemedText type="small" style={{ color: colors.muted }}>
                {t("editor.subtitle", { dog: dogName })}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("editor.close")}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.ground }]}
            >
              <SymbolView
                name={{ ios: "xmark", android: "close", web: "close" }}
                tintColor={colors.text}
                size={18}
              />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.fields}
            showsVerticalScrollIndicator={false}
          >
            <Section label={t("editor.type")} colors={colors}>
              <View style={styles.typeGrid}>
                {taskTypes.map((option) => {
                  const selected = option.type === type;
                  return (
                    <Pressable
                      key={option.type}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => selectType(option.type)}
                      style={[
                        styles.typeTile,
                        {
                          borderColor: selected ? colors.primary : colors.line,
                          backgroundColor: selected
                            ? colors.primarySoft
                            : colors.surface,
                        },
                      ]}
                    >
                      <SymbolView
                        name={option.icon}
                        tintColor={selected ? colors.primary : colors.muted}
                        size={22}
                      />
                      <ThemedText
                        numberOfLines={1}
                        style={[
                          styles.tileText,
                          { color: selected ? colors.primary : colors.text },
                        ]}
                      >
                        {getTypeLabel(option.type)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Section label={t("editor.name")} colors={colors}>
              <TextInput
                accessibilityLabel={t("editor.name")}
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setTitleTouched(true);
                }}
                maxLength={120}
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </Section>

            <Section label={t("editor.time")} colors={colors}>
              <View
                style={[
                  styles.timePicker,
                  { backgroundColor: colors.ground, borderColor: colors.line },
                ]}
              >
                <StepButton
                  label={t("editor.earlier")}
                  icon="minus"
                  colors={colors}
                  onPress={() => adjustTime(-5)}
                />
                <TextInput
                  accessibilityLabel={t("editor.time")}
                  value={time}
                  onChangeText={updateTime}
                  maxLength={5}
                  autoCorrect={false}
                  keyboardType={
                    Platform.OS === "ios" ? "numbers-and-punctuation" : "default"
                  }
                  style={[styles.timeInput, { color: colors.text }]}
                />
                <StepButton
                  label={t("editor.later")}
                  icon="plus"
                  colors={colors}
                  onPress={() => adjustTime(5)}
                />
              </View>
              <View style={styles.chipRow}>
                {timePresets.map((preset) => (
                  <Chip
                    key={preset.key}
                    colors={colors}
                    selected={time === preset.value}
                    onPress={() => updateTime(preset.value)}
                    label={t(preset.key)}
                    detail={preset.value}
                  />
                ))}
              </View>
            </Section>

            {amounts ? (
              <Section label={t("editor.amount")} colors={colors}>
                <View style={styles.chipRow}>
                  <Chip
                    colors={colors}
                    selected={amount.value === null}
                    onPress={() => setAmount({ value: null, unit: null })}
                    label={t("editor.none")}
                  />
                  {amounts.map((option) => (
                    <Chip
                      key={`${option.value}${option.unit}`}
                      colors={colors}
                      selected={
                        amount.value === option.value &&
                        amount.unit === option.unit
                      }
                      onPress={() => setAmount(option)}
                      label={formatAmount(option.value, option.unit) ?? ""}
                    />
                  ))}
                </View>
              </Section>
            ) : (
              <Section label={t("editor.duration")} colors={colors}>
                <View style={styles.chipRow}>
                  {durationOptions.map((minutes) => (
                    <Chip
                      key={minutes}
                      colors={colors}
                      selected={durationMinutes === minutes}
                      onPress={() => setDurationMinutes(minutes)}
                      label={t("common.minutes", { count: minutes })}
                    />
                  ))}
                </View>
              </Section>
            )}

            <Section
              label={t("editor.repeats")}
              colors={colors}
              trailing={
                <ThemedText
                  numberOfLines={1}
                  style={[styles.summary, { color: colors.primary }]}
                >
                  {repeatSummary}
                </ThemedText>
              }
            >
              <View style={styles.chipRow}>
                <Chip
                  colors={colors}
                  selected={repeatMode === "days" && repeatDays.length === 7}
                  onPress={() => setDays(mondayFirstKeys)}
                  label={t("repeat.everyDay")}
                />
                <Chip
                  colors={colors}
                  selected={
                    repeatMode === "days" &&
                    getRepeatLabel(repeatDays) === t("repeat.weekdays")
                  }
                  onPress={() => setDays(mondayFirstKeys.slice(0, 5))}
                  label={t("repeat.weekdays")}
                />
                <Chip
                  colors={colors}
                  selected={
                    repeatMode === "days" &&
                    getRepeatLabel(repeatDays) === t("repeat.weekends")
                  }
                  onPress={() => setDays(["sat", "sun"])}
                  label={t("repeat.weekends")}
                />
                <Chip
                  colors={colors}
                  selected={repeatMode === "once"}
                  onPress={() => setRepeatMode("once")}
                  label={t("repeat.once")}
                />
              </View>
              {repeatMode === "days" ? (
                <View style={styles.weekdayRow}>
                  {mondayFirstKeys.map((day, index) => {
                    const selected = repeatDays.includes(day);
                    const date = mondayOfReferenceWeek(index);
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="checkbox"
                        accessibilityLabel={formatWeekdayShort(date)}
                        accessibilityState={{ checked: selected }}
                        onPress={() => toggleDay(day)}
                        style={[
                          styles.weekday,
                          {
                            backgroundColor: selected
                              ? colors.primary
                              : colors.ground,
                          },
                        ]}
                      >
                        <ThemedText
                          style={{
                            color: selected ? colors.primaryText : colors.text,
                            fontWeight: "700",
                          }}
                        >
                          {formatWeekdayShort(date).slice(0, 1)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View
                  style={[
                    styles.timePicker,
                    { backgroundColor: colors.ground, borderColor: colors.line },
                  ]}
                >
                  <StepButton
                    label={t("editor.earlierDay")}
                    icon="minus"
                    colors={colors}
                    onPress={() => setOneOffDate((value) => addDays(value, -1))}
                  />
                  <ThemedText
                    style={[styles.dateValue, { color: colors.text }]}
                  >
                    {formatLongDate(fromDateKey(oneOffDate))}
                  </ThemedText>
                  <StepButton
                    label={t("editor.laterDay")}
                    icon="plus"
                    colors={colors}
                    onPress={() => setOneOffDate((value) => addDays(value, 1))}
                  />
                </View>
              )}
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                    {t("must")}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: colors.muted }}>
                    {t("editor.mustHelp")}
                  </ThemedText>
                </View>
                <Switch
                  accessibilityLabel={t("must")}
                  value={required}
                  onValueChange={setRequired}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            </Section>

            <Section label={t("editor.usuallyBy")} colors={colors}>
              <View style={styles.chipRow}>
                <Chip
                  colors={colors}
                  selected={defaultAssigneeId === null}
                  onPress={() => setDefaultAssigneeId(null)}
                  label={t("editor.anyone")}
                />
                {members.map((member) => (
                  <Chip
                    key={member.userId}
                    colors={colors}
                    selected={defaultAssigneeId === member.userId}
                    onPress={() => setDefaultAssigneeId(member.userId)}
                    label={member.userId === userId ? t("common.me") : member.name}
                  />
                ))}
              </View>
            </Section>

            <Section label={t("editor.remind")} colors={colors}>
              <View style={styles.chipRow}>
                {reminderOptions.map((minutes) => (
                  <Chip
                    key={minutes ?? "off"}
                    colors={colors}
                    selected={reminderMinutes === minutes}
                    onPress={() => setReminderMinutes(minutes)}
                    label={
                      minutes === null
                        ? t("editor.off")
                        : t("common.minutes", { count: minutes })
                    }
                  />
                ))}
              </View>
            </Section>

            <Section label={t("editor.notes")} colors={colors}>
              <TextInput
                accessibilityLabel={t("editor.notes")}
                value={details}
                onChangeText={setDetails}
                placeholder={t("editor.notesPlaceholder")}
                placeholderTextColor={colors.muted}
                maxLength={240}
                style={inputStyle}
              />
            </Section>

            {need && onDelete ? (
              confirmDelete ? (
                <View
                  style={[styles.deleteConfirm, { borderColor: colors.danger }]}
                >
                  <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                    {t("editor.deleteConfirm", { task: need.title })}
                  </ThemedText>
                  {claimedTodayBy ? (
                    <ThemedText type="small" style={{ color: colors.muted }}>
                      {t("editor.deleteClaimed", { name: claimedTodayBy })}
                    </ThemedText>
                  ) : null}
                  <View style={styles.deleteActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setConfirmDelete(false)}
                      style={styles.textButton}
                    >
                      <ThemedText style={{ color: colors.muted, fontWeight: "600" }}>
                        {t("action.cancel")}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => void remove()}
                      style={[
                        styles.deleteButton,
                        { backgroundColor: colors.danger },
                        saving && styles.pressed,
                      ]}
                    >
                      <ThemedText style={styles.deleteButtonText}>
                        {t("editor.delete")}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmDelete(true)}
                  style={styles.textButton}
                >
                  <ThemedText style={{ color: colors.danger, fontWeight: "700" }}>
                    {t("editor.delete")}
                  </ThemedText>
                </Pressable>
              )
            ) : null}

            {error ? (
              <ThemedText
                type="small"
                accessibilityRole="alert"
                style={{ color: colors.danger }}
              >
                {error}
              </ThemedText>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { borderColor: colors.line, backgroundColor: colors.surface },
            ]}
          >
            <ThemedText
              type="small"
              numberOfLines={1}
              style={[styles.footerSummary, { color: colors.muted }]}
            >
              {t("editor.summary", { repeat: repeatSummary, time })}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.primary },
                (pressed || saving) && styles.pressed,
              ]}
            >
              <ThemedText style={[styles.saveText, { color: colors.primaryText }]}>
                {need ? t("editor.save") : t("editor.add", { dog: dogName })}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({
  label,
  colors,
  trailing,
  children,
}: {
  label: string;
  colors: PaletteColors;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <ThemedText style={[styles.sectionLabel, { color: colors.muted }]}>
          {label}
        </ThemedText>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function Chip({
  label,
  detail,
  selected,
  colors,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  colors: PaletteColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.primary : colors.line,
          backgroundColor: selected ? colors.primarySoft : colors.surface,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.chipText,
          { color: selected ? colors.primary : colors.text },
        ]}
      >
        {label}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" style={{ color: colors.muted }}>
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function StepButton({
  label,
  icon,
  colors,
  onPress,
}: {
  label: string;
  icon: "plus" | "minus";
  colors: PaletteColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.stepButton, { backgroundColor: colors.surface }]}
    >
      <SymbolView
        name={
          icon === "plus"
            ? { ios: "plus", android: "add", web: "add" }
            : { ios: "minus", android: "remove", web: "remove" }
        }
        tintColor={colors.text}
        size={20}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxHeight: "96%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.two,
    overflow: "hidden",
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: Spacing.two,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four - 4,
    paddingBottom: Spacing.two,
  },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexShrink: 1 },
  fields: {
    gap: Spacing.four - 4,
    paddingHorizontal: Spacing.four - 4,
    paddingBottom: Spacing.four,
  },
  section: { gap: Spacing.two },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  summary: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  typeTile: {
    width: "23%",
    flexGrow: 1,
    minHeight: 68,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: Spacing.one,
  },
  tileText: { fontSize: 12, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontFamily: Fonts.sans,
  },
  timePicker: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.two,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timeInput: {
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    minWidth: 110,
    fontVariant: ["tabular-nums"],
  },
  dateValue: { fontSize: 16, fontWeight: "700", textAlign: "center", flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  chip: {
    minHeight: 44,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  chipText: { fontSize: 14, fontWeight: "600" },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.one,
  },
  weekday: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    minHeight: 44,
  },
  switchText: { flex: 1, minWidth: 0 },
  textButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  deleteConfirm: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  deleteActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.two,
  },
  deleteButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: { color: "#FFFFFF", fontWeight: "700" },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  footerSummary: { textAlign: "center" },
  saveButton: {
    borderRadius: 12,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  saveText: { fontWeight: "700", fontSize: 16 },
  pressed: { opacity: 0.7 },
});
