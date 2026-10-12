import { SymbolView } from "expo-symbols";
import { useState, type ComponentProps } from "react";
import {
  FlatList,
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

import { ThemedText } from "@/components/themed-text";
import { Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  useDailyNeeds,
  type DailyNeed,
  type DailyNeedInput,
  type DailyNeedType,
} from "@/hooks/use-daily-needs";

const palette = {
  light: {
    background: "#F4F6F3",
    surface: "#FFFFFF",
    text: "#1B2522",
    secondary: "#5C6762",
    border: "#A0ACA5",
  },
  dark: {
    background: "#141917",
    surface: "#222B26",
    text: "#F4F6F3",
    secondary: "#ADB6B0",
    border: "#63736A",
  },
};
const green = "#2D6D51";
const weekdays = [
  { key: "mon", label: "M", name: "Monday" },
  { key: "tue", label: "T", name: "Tuesday" },
  { key: "wed", label: "W", name: "Wednesday" },
  { key: "thu", label: "T", name: "Thursday" },
  { key: "fri", label: "F", name: "Friday" },
  { key: "sat", label: "S", name: "Saturday" },
  { key: "sun", label: "S", name: "Sunday" },
];
const needTypes: {
  type: DailyNeedType;
  label: string;
  icon: ComponentProps<typeof SymbolView>["name"];
}[] = [
  {
    type: "walk",
    label: "Walk",
    icon: {
      ios: "figure.walk",
      android: "directions_walk",
      web: "directions_walk",
    },
  },
  {
    type: "food",
    label: "Food",
    icon: {
      ios: "cup.and.saucer",
      android: "lunch_dining",
      web: "lunch_dining",
    },
  },
  {
    type: "medicine",
    label: "Medicine",
    icon: { ios: "pills", android: "medication", web: "medication" },
  },
  {
    type: "potty",
    label: "Potty",
    icon: { ios: "leaf", android: "psychiatry", web: "psychiatry" },
  },
  {
    type: "play",
    label: "Play",
    icon: { ios: "volleyball", android: "sports_soccer", web: "sports_soccer" },
  },
  {
    type: "grooming",
    label: "Grooming",
    icon: { ios: "water.waves", android: "shower", web: "shower" },
  },
  {
    type: "other",
    label: "Other",
    icon: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  },
];

export function DailyNeedsScreen() {
  const { needs, household, email, error, clearError, saveNeed, signOut } =
    useDailyNeeds();
  const [editor, setEditor] = useState<DailyNeed | "new" | null>(null);
  const scheme = useColorScheme();
  const colors = palette[scheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();

  return (
    <>
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
            <ThemedText
              type="subtitle"
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              Daily needs
            </ThemedText>
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <SymbolView
                  name={{ ios: "pawprint", android: "pets", web: "pets" }}
                  tintColor={green}
                  size={32}
                />
              </View>
              <View style={styles.profileContent}>
                <ThemedText type="subtitle" style={styles.profileName}>
                  {household.name}
                </ThemedText>
                <ThemedText style={styles.profileSubtitle}>
                  Shared household
                </ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.intro, { color: colors.secondary }]}>
              Keep the daily routine visible to everyone in your household.
            </ThemedText>
            <View style={styles.householdDetails}>
              <View style={styles.accountDetails}>
                <ThemedText type="small" style={{ color: colors.secondary }}>
                  {email}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: colors.text }}>
                  Invite code: {household.inviteCode}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void signOut()}
              >
                <ThemedText type="smallBold" style={styles.signOutText}>
                  Sign out
                </ThemedText>
              </Pressable>
            </View>
            {error ? (
              <Pressable accessibilityRole="button" onPress={clearError}>
                <ThemedText
                  type="small"
                  accessibilityRole="alert"
                  style={styles.screenError}
                >
                  {error} Dismiss
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <ThemedText style={[styles.empty, { color: colors.secondary }]}>
            No daily needs yet.
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
              size={24}
            />
            <ThemedText style={[styles.needTitle, { color: colors.text }]}>
              Add a need
            </ThemedText>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.title}, ${item.time}`}
            onPress={() => setEditor(item)}
            style={({ pressed }) => [
              styles.need,
              { backgroundColor: colors.surface },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={[styles.time, { color: colors.text }]}>
              {item.time}
            </ThemedText>
            <View style={styles.needContent}>
              <View style={styles.needHeading}>
                <ThemedText style={[styles.needTitle, { color: colors.text }]}>
                  {item.title}
                </ThemedText>
                {item.required && (
                  <ThemedText type="smallBold" style={styles.badge}>
                    MUST
                  </ThemedText>
                )}
              </View>
              <ThemedText type="small" style={{ color: colors.secondary }}>
                {[
                  `${item.durationMinutes} min`,
                  item.details,
                  getRepeatLabel(item.repeatDays),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </ThemedText>
            </View>
            <SymbolView
              name={{
                ios: "chevron.right",
                android: "chevron_right",
                web: "chevron_right",
              }}
              tintColor={colors.secondary}
              size={20}
            />
          </Pressable>
        )}
      />
      {editor !== null && (
        <NeedForm
          need={editor === "new" ? undefined : editor}
          dogName={household.name}
          colors={colors}
          onClose={() => setEditor(null)}
          onSave={async (input) => {
            await saveNeed(input);
            setEditor(null);
          }}
        />
      )}
    </>
  );
}

type NeedFormProps = {
  need?: DailyNeed;
  dogName: string;
  colors: typeof palette.light;
  onClose: () => void;
  onSave: (input: DailyNeedInput) => void | Promise<void>;
};

function NeedForm({ need, dogName, colors, onClose, onSave }: NeedFormProps) {
  const [type, setType] = useState<DailyNeedType>(need?.type ?? "walk");
  const [title, setTitle] = useState(need?.title ?? "Morning walk");
  const [time, setTime] = useState(need?.time ?? "07:30");
  const [details, setDetails] = useState(need?.details ?? "");
  const [required, setRequired] = useState(need?.required ?? false);
  const [durationMinutes, setDurationMinutes] = useState(
    need?.durationMinutes ?? 15,
  );
  const [repeatDays, setRepeatDays] = useState(
    need?.repeatDays ?? weekdays.map((day) => day.key),
  );
  const [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border },
  ];
  function adjustTime(amount: number) {
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const [hours, minutes] = (validTime ? time : "07:30")
      .split(":")
      .map(Number);
    const next = (hours * 60 + minutes + amount + 1440) % 1440;
    setTime(
      `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`,
    );
  }

  function toggleDay(day: string) {
    setRepeatDays((current) =>
      current.includes(day)
        ? current.filter((selected) => selected !== day)
        : weekdays
            .map((weekday) => weekday.key)
            .filter((weekday) => current.includes(weekday) || weekday === day),
    );
  }

  function selectType(nextType: DailyNeedType, label: string) {
    setType(nextType);
    if (
      !need &&
      (!title.trim() ||
        title === "Morning walk" ||
        title === "Food" ||
        title === "Medicine" ||
        title === "Potty" ||
        title === "Play" ||
        title === "Grooming")
    ) {
      setTitle(nextType === "walk" ? "Morning walk" : label);
    }
  }

  function submit() {
    if (!title.trim()) {
      setError("Enter a name for this need.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
      setError("Enter a time in 24-hour format, such as 07:30.");
      return;
    }
    if (repeatDays.length === 0) {
      setError("Choose at least one day to repeat.");
      return;
    }
    void Promise.resolve(
      onSave({
        id: need?.id,
        title: title.trim(),
        time: time.trim(),
        details: details.trim(),
        required,
        type,
        durationMinutes,
        repeatDays,
      }),
    ).catch((saveError: unknown) => {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this need.",
      );
    });
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.backdrop,
          {
            paddingTop: insets.top + Spacing.one,
          },
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.formHeader}>
            <View style={styles.formHeading}>
              <ThemedText
                type="subtitle"
                accessibilityRole="header"
                style={[styles.formTitle, { color: colors.text }]}
              >
                {need ? "Edit daily need" : "New daily need"}
              </ThemedText>
              <ThemedText style={{ color: colors.secondary }}>
                For {dogName} · shared with the household
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close need form"
              onPress={onClose}
              style={[
                styles.iconButton,
                { backgroundColor: colors.background },
              ]}
            >
              <SymbolView
                name={{ ios: "xmark", android: "close", web: "close" }}
                tintColor={colors.text}
                size={24}
              />
            </Pressable>
          </View>
          <ScrollView
            style={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.fields}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.field}>
              <ThemedText
                type="smallBold"
                style={[styles.sectionLabel, { color: colors.secondary }]}
              >
                TYPE
              </ThemedText>
              <View style={styles.typeGrid}>
                {needTypes.map((option) => {
                  const selected = option.type === type;
                  return (
                    <Pressable
                      key={option.type}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => selectType(option.type, option.label)}
                      style={[
                        styles.typeOption,
                        {
                          borderColor: selected ? green : colors.border,
                          backgroundColor: selected
                            ? "#EAF3EE"
                            : colors.surface,
                        },
                      ]}
                    >
                      <SymbolView
                        name={option.icon}
                        tintColor={selected ? green : colors.secondary}
                        size={24}
                      />
                      <ThemedText
                        style={{ color: selected ? green : colors.text }}
                      >
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.field}>
              <ThemedText
                type="smallBold"
                style={[styles.sectionLabel, { color: colors.secondary }]}
              >
                NAME
              </ThemedText>
              <TextInput
                accessibilityLabel="Need name"
                value={title}
                onChangeText={setTitle}
                placeholder="Morning walk"
                placeholderTextColor={colors.secondary}
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <ThemedText
                type="smallBold"
                style={[styles.sectionLabel, { color: colors.secondary }]}
              >
                TIME
              </ThemedText>
              <View
                style={[
                  styles.timePicker,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Earlier by five minutes"
                  onPress={() => adjustTime(-5)}
                  style={styles.stepButton}
                >
                  <SymbolView
                    name={{ ios: "minus", android: "remove", web: "remove" }}
                    tintColor={colors.text}
                    size={22}
                  />
                </Pressable>
                <TextInput
                  accessibilityLabel="Need time"
                  value={time}
                  onChangeText={setTime}
                  maxLength={5}
                  autoCorrect={false}
                  keyboardType={
                    Platform.OS === "ios"
                      ? "numbers-and-punctuation"
                      : "default"
                  }
                  style={[styles.timeInput, { color: colors.text }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Later by five minutes"
                  onPress={() => adjustTime(5)}
                  style={styles.stepButton}
                >
                  <SymbolView
                    name={{ ios: "plus", android: "add", web: "add" }}
                    tintColor={colors.text}
                    size={22}
                  />
                </Pressable>
              </View>
              <View style={styles.presetRow}>
                {[
                  { label: "Morning", value: "07:30" },
                  { label: "Midday", value: "13:00" },
                  { label: "Evening", value: "18:00" },
                  { label: "Night", value: "22:30" },
                ].map((preset) => (
                  <Pressable
                    key={preset.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: time === preset.value }}
                    onPress={() => setTime(preset.value)}
                    style={[
                      styles.preset,
                      {
                        borderColor:
                          time === preset.value ? green : colors.border,
                        backgroundColor:
                          time === preset.value ? "#EAF3EE" : colors.surface,
                      },
                    ]}
                  >
                    <ThemedText style={{ color: colors.text }}>
                      {preset.label}
                    </ThemedText>
                    <ThemedText style={{ color: colors.text }}>
                      {preset.value}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <ThemedText
                type="smallBold"
                style={[styles.sectionLabel, { color: colors.secondary }]}
              >
                DURATION
              </ThemedText>
              <View style={styles.durationRow}>
                {[10, 15, 30, 45].map((minutes) => (
                  <Pressable
                    key={minutes}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: durationMinutes === minutes,
                    }}
                    onPress={() => setDurationMinutes(minutes)}
                    style={[
                      styles.durationOption,
                      {
                        borderColor:
                          durationMinutes === minutes ? green : colors.border,
                        backgroundColor:
                          durationMinutes === minutes
                            ? "#EAF3EE"
                            : colors.surface,
                      },
                    ]}
                  >
                    <ThemedText
                      style={{
                        color:
                          durationMinutes === minutes ? green : colors.text,
                      }}
                    >
                      {minutes} min
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <View style={styles.repeatHeading}>
                <ThemedText
                  type="smallBold"
                  style={[styles.sectionLabel, { color: colors.secondary }]}
                >
                  REPEATS
                </ThemedText>
                <ThemedText style={styles.repeatSummary}>
                  {getRepeatLabel(repeatDays)}
                </ThemedText>
              </View>
              <View style={styles.weekdayRow}>
                {weekdays.map((day) => {
                  const selected = repeatDays.includes(day.key);
                  return (
                    <Pressable
                      key={day.key}
                      accessibilityRole="checkbox"
                      accessibilityLabel={day.name}
                      accessibilityState={{ checked: selected }}
                      onPress={() => toggleDay(day.key)}
                      style={[
                        styles.weekday,
                        {
                          backgroundColor: selected ? green : colors.background,
                        },
                      ]}
                    >
                      <ThemedText
                        style={{
                          color: selected ? "#FFFFFF" : colors.text,
                          fontWeight: "700",
                        }}
                      >
                        {day.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.switchRow}>
                <ThemedText style={{ color: colors.text }}>Must do</ThemedText>
                <Switch
                  accessibilityLabel="Must do"
                  value={required}
                  onValueChange={setRequired}
                  trackColor={{ true: green }}
                />
              </View>
            </View>
            <View style={styles.field}>
              <ThemedText
                type="smallBold"
                style={[styles.sectionLabel, { color: colors.secondary }]}
              >
                NOTES
              </ThemedText>
              <TextInput
                accessibilityLabel="Need notes"
                value={details}
                onChangeText={setDetails}
                placeholder="Optional details"
                placeholderTextColor={colors.secondary}
                maxLength={240}
                style={inputStyle}
              />
            </View>
            {error ? (
              <ThemedText
                type="small"
                accessibilityRole="alert"
                style={styles.error}
              >
                {error}
              </ThemedText>
            ) : null}
          </ScrollView>
          <View style={[styles.sheetFooter, { borderColor: colors.border }]}>
            <ThemedText
              style={[styles.footerSummary, { color: colors.secondary }]}
            >
              {getRepeatLabel(repeatDays)} at {time} · {durationMinutes} min
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={submit}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ ios: "checkmark", android: "check", web: "check" }}
                tintColor="#FFFFFF"
                size={22}
              />
              <ThemedText style={styles.saveText}>
                {need ? "Save changes" : `Add to ${dogName}'s day`}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getRepeatLabel(days: string[]) {
  if (days.length === 7) return "Every day";
  if (
    days.length === 5 &&
    weekdays.slice(0, 5).every((day) => days.includes(day.key))
  ) {
    return "Weekdays";
  }
  if (days.length === 2 && days.includes("sat") && days.includes("sun")) {
    return "Weekends";
  }
  return (
    weekdays
      .filter((day) => days.includes(day.key))
      .map((day) => day.name.slice(0, 3))
      .join(", ") || "Choose days"
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  header: { gap: Spacing.three, paddingBottom: Spacing.four },
  title: { fontSize: 42, lineHeight: 50, fontWeight: "700" },
  profile: {
    backgroundColor: green,
    minHeight: 144,
    padding: Spacing.four,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#DDEDE1",
    alignItems: "center",
    justifyContent: "center",
  },
  profileContent: { flex: 1, minWidth: 0, gap: Spacing.one },
  profileName: { color: "#FFFFFF", flex: 1 },
  profileSubtitle: { color: "#DDEDE1" },
  intro: { fontSize: 17, lineHeight: 25 },
  householdDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  accountDetails: { flex: 1, minWidth: 0, gap: Spacing.one },
  signOutText: { color: green },
  screenError: { color: "#C43C25" },
  empty: { paddingBottom: Spacing.three },
  need: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 108,
    padding: Spacing.three,
    borderRadius: 22,
    marginBottom: 14,
  },
  time: {
    fontSize: 21,
    fontWeight: "700",
    width: 76,
    fontVariant: ["tabular-nums"],
  },
  needContent: { flex: 1, minWidth: 0, gap: Spacing.one },
  needHeading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  needTitle: { fontSize: 19, fontWeight: "700", flexShrink: 1 },
  badge: {
    color: "#9C301B",
    backgroundColor: "#FADCD3",
    paddingHorizontal: Spacing.two,
    borderRadius: 4,
  },
  addButton: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 22,
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxHeight: "96%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: Spacing.two,
    overflow: "hidden",
  },
  handle: {
    width: 68,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D4DAD5",
    alignSelf: "center",
    marginBottom: Spacing.three,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  formHeading: { flex: 1, minWidth: 0, gap: Spacing.one },
  sheetScroll: { flexShrink: 1 },
  sectionLabel: { letterSpacing: 0, fontSize: 14 },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  typeOption: {
    width: "31.5%",
    minHeight: 96,
    borderWidth: 2,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    padding: Spacing.two,
  },
  timePicker: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.two,
  },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  timeInput: {
    fontSize: 52,
    fontWeight: "700",
    textAlign: "center",
    width: 156,
    fontVariant: ["tabular-nums"],
  },
  presetRow: { flexDirection: "row", gap: Spacing.two },
  preset: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.one,
  },
  durationRow: { flexDirection: "row", gap: Spacing.two },
  durationOption: {
    flex: 1,
    minHeight: 62,
    borderWidth: 2,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  repeatSummary: { color: green, fontWeight: "700" },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  weekday: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    backgroundColor: "#FFFFFF",
  },
  footerSummary: { textAlign: "center" },

  formTitle: { fontSize: 40, lineHeight: 46, flex: 1 },
  iconButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  fields: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  field: { gap: Spacing.two },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    fontSize: 20,
    fontFamily: Fonts.sans,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  error: { color: "#C43C25" },
  saveButton: {
    backgroundColor: green,
    borderRadius: 24,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  saveText: { color: "#FFFFFF", fontWeight: "700", fontSize: 20 },
});
