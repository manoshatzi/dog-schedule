import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useDailyNeeds, type BookingRepeat } from "@/hooks/use-daily-needs";

const palette = {
  light: {
    background: "#F4F6F3",
    surface: "#FFFFFF",
    text: "#1B2522",
    secondary: "#5C6762",
    border: "#D5DDD7",
    inset: "#F0F3F0",
  },
  dark: {
    background: "#141917",
    surface: "#222B26",
    text: "#F4F6F3",
    secondary: "#ADB6B0",
    border: "#4B5A50",
    inset: "#1A211D",
  },
};

const repeatOptions: { key: BookingRepeat; label: string }[] = [
  { key: "today", label: "Just today" },
  { key: "weekday", label: "Same weekday" },
  { key: "daily", label: "Every day" },
];

export function BookTaskScreen() {
  const { needId, date: dateParam } = useLocalSearchParams<{
    needId: string;
    date?: string;
  }>();
  const { needs, household, userId, members, setOccurrence } = useDailyNeeds();
  const need = needs.find((item) => item.id === needId);
  const today = new Date();
  const date = typeof dateParam === "string" ? dateParam : formatDate(today);
  const selectedDate = new Date(`${date}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
  }).format(selectedDate);
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(selectedDate);
  const [assignee, setAssignee] = useState(userId);
  const [repeat, setRepeat] = useState<BookingRepeat>("today");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const colors = palette[scheme === "dark" ? "dark" : "light"];

  async function book() {
    if (!need) return;
    setSaving(true);
    setError("");
    try {
      await setOccurrence(need.id, date, "booked", {
        assignedUserId: assignee,
        repeatRule: repeat,
        reminderEnabled,
      });
      router.back();
    } catch (bookingError) {
      setError(
        bookingError instanceof Error
          ? bookingError.message
          : "Could not book this task.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!need) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <ThemedText style={{ color: colors.text }}>
          This task is no longer available.
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <ThemedText style={styles.link}>Go back</ThemedText>
        </Pressable>
      </View>
    );
  }

  const [hours, minutes] = need.time.split(":").map(Number);
  const end = (hours * 60 + minutes + need.durationMinutes) % 1440;
  const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  const typeColor = getTypeColor(need.type);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <SymbolView
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            tintColor={colors.text}
            size={24}
          />
        </Pressable>
        <ThemedText style={[styles.topTitle, { color: colors.text }]}>
          Book a task
        </ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.taskCard, { backgroundColor: colors.surface }]}>
          <View style={styles.dateRow}>
            <ThemedText style={styles.openBadge}>OPEN</ThemedText>
            <ThemedText style={[styles.dateLabel, { color: colors.secondary }]}>
              {dateLabel}
            </ThemedText>
          </View>
          <ThemedText
            accessibilityRole="header"
            style={[styles.taskTitle, { color: colors.text }]}
          >
            {need.title}
          </ThemedText>
          <View style={styles.metaRow}>
            <SymbolView
              name={{ ios: "clock", android: "schedule", web: "schedule" }}
              tintColor={colors.secondary}
              size={21}
            />
            <ThemedText style={[styles.metaText, { color: colors.text }]}>
              {need.time} – {endTime}
            </ThemedText>
            <SymbolView
              name={{ ios: "clock", android: "timer", web: "timer" }}
              tintColor={colors.secondary}
              size={21}
            />
            <ThemedText style={[styles.metaText, { color: colors.text }]}>
              {need.durationMinutes} min
            </ThemedText>
          </View>
          {need.details ? (
            <View style={[styles.notes, { backgroundColor: colors.inset }]}>
              <ThemedText style={[styles.noteText, { color: colors.text }]}>
                {need.details}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText
            style={[styles.sectionTitle, { color: colors.secondary }]}
          >
            WHO’S DOING IT
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.memberRow}>
              {members.map((member) => {
                const selected = member.userId === assignee;
                return (
                  <Pressable
                    key={member.userId}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setAssignee(member.userId)}
                    style={[
                      styles.memberOption,
                      {
                        borderColor: selected ? "#286B50" : colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.memberAvatar,
                        {
                          backgroundColor:
                            member.userId === userId
                              ? "#DFE9FB"
                              : typeColor.background,
                        },
                      ]}
                    >
                      <ThemedText
                        style={{
                          color:
                            member.userId === userId
                              ? "#244B86"
                              : typeColor.text,
                          fontWeight: "700",
                        }}
                      >
                        {member.userId === userId
                          ? "Me"
                          : getInitials(member.name)}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[styles.memberName, { color: colors.text }]}
                    >
                      {member.userId === userId ? "Me" : member.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <ThemedText
            style={[styles.sectionTitle, { color: colors.secondary }]}
          >
            REPEAT
          </ThemedText>
          <View style={[styles.segment, { backgroundColor: colors.border }]}>
            {repeatOptions.map((option) => {
              const selected = repeat === option.key;
              const label =
                option.key === "weekday" ? `Every ${weekday}` : option.label;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setRepeat(option.key)}
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
        </View>

        <View style={[styles.reminderRow, { backgroundColor: colors.surface }]}>
          <ThemedText style={[styles.reminderText, { color: colors.text }]}>
            Remind me 15 min before
          </ThemedText>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Remind me 15 minutes before"
            accessibilityState={{ checked: reminderEnabled }}
            onPress={() => setReminderEnabled((enabled) => !enabled)}
            style={[
              styles.reminderCheckbox,
              {
                backgroundColor: reminderEnabled
                  ? "#286B50"
                  : colors.background,
              },
            ]}
          >
            {reminderEnabled ? (
              <SymbolView
                name={{ ios: "checkmark", android: "check", web: "check" }}
                tintColor="#FFFFFF"
                size={22}
              />
            ) : null}
          </Pressable>
        </View>

        <ThemedText style={[styles.helper, { color: colors.secondary }]}>
          Everyone in {household.name}&apos;s household can see who booked this
          task. When it&apos;s done, tap Done on today&apos;s list.
        </ThemedText>
        {error ? (
          <ThemedText accessibilityRole="alert" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + Spacing.two,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void book()}
          style={({ pressed }) => [
            styles.bookButton,
            pressed && styles.pressed,
            saving && styles.disabled,
          ]}
        >
          <ThemedText style={styles.bookButtonText}>
            {saving ? "Booking..." : `Book ${need.title}`}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getInitials(name: string) {
  return name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getTypeColor(type: string) {
  if (type === "walk") return { background: "#E5DCF7", text: "#54378C" };
  if (type === "medicine") return { background: "#F9DFD0", text: "#8D4318" };
  return { background: "#DCE8FA", text: "#244B86" };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
  },
  topTitle: { fontSize: 22, fontWeight: "700" },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  taskCard: {
    borderRadius: 28,
    padding: Spacing.four,
    gap: Spacing.three,
    elevation: 1,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  openBadge: {
    overflow: "hidden",
    color: "#914714",
    backgroundColor: "#FBE4CE",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
    fontWeight: "700",
  },
  dateLabel: { fontSize: 18 },
  taskTitle: { fontSize: 40, lineHeight: 48, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  metaText: { fontSize: 18, fontVariant: ["tabular-nums"] },
  notes: { padding: Spacing.three, borderRadius: 20 },
  noteText: { fontSize: 18, lineHeight: 27 },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  memberRow: { flexDirection: "row", gap: Spacing.two },
  memberOption: {
    minHeight: 76,
    borderWidth: 2,
    borderRadius: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.two,
    paddingRight: Spacing.three,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: { fontSize: 17, fontWeight: "600" },
  segment: {
    flexDirection: "row",
    borderRadius: 18,
    padding: 4,
    gap: 4,
  },
  segmentOption: {
    flex: 1,
    minHeight: 72,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.one,
  },
  segmentText: { fontSize: 15, textAlign: "center" },
  reminderRow: {
    minHeight: 88,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
  },
  reminderText: { fontSize: 18, flex: 1 },
  reminderCheckbox: {
    width: 40,
    height: 40,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: { fontSize: 16, lineHeight: 24 },
  error: { color: "#C43C25" },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  bookButton: {
    minHeight: 96,
    borderRadius: 28,
    backgroundColor: "#286B50",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
  },
  bookButtonText: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
  missing: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.three,
  },
  link: { color: "#286B50", fontWeight: "700" },
});
