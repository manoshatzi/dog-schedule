import { SymbolView } from "expo-symbols";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MemberAvatar } from "@/components/task-ui";
import { ThemedText } from "@/components/themed-text";
import { Spacing, type PaletteColors } from "@/constants/theme";
import { useDailyNeeds } from "@/hooks/use-daily-needs";
import { usePalette } from "@/hooks/use-palette";
import { usePush, type NotificationPreferences } from "@/hooks/use-push";
import { t, type StringKey } from "@/i18n";
import type { FamilyActivityPreference } from "@/lib/database.types";

/**
 * INTERIM home for the email, invite code and Sign out that screens.md #14
 * moves out of the Routine header, plus the notification settings (#22).
 * Replace with the Family screen (#15), Invite sheet (#21), Settings (#20)
 * and Notification settings (#22) when they are built.
 */
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const { household, members, email, userId, signOut } = useDailyNeeds();
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("action.close")}
          style={styles.flex}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + Spacing.three,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          <View style={styles.header}>
            <ThemedText
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              {t("account.title")}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("action.close")}
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
          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.card, { backgroundColor: colors.ground }]}>
              <ThemedText style={[styles.label, { color: colors.muted }]}>
                {t("account.inviteCode")}
              </ThemedText>
              <ThemedText
                selectable
                style={[styles.code, { color: colors.text }]}
              >
                {household.inviteCode}
              </ThemedText>
              <ThemedText type="small" style={{ color: colors.muted }}>
                {t("account.inviteHelp")}
              </ThemedText>
            </View>

            <View style={styles.section}>
              <ThemedText style={[styles.label, { color: colors.muted }]}>
                {t("account.members")}
              </ThemedText>
              {members.map((member) => (
                <View key={member.userId} style={styles.memberRow}>
                  <MemberAvatar
                    members={members}
                    userId={member.userId}
                    name={member.name}
                    size={36}
                  />
                  <ThemedText style={{ color: colors.text, flex: 1 }}>
                    {member.userId === userId
                      ? `${member.name} (${t("common.you")})`
                      : member.name}
                  </ThemedText>
                </View>
              ))}
            </View>

            <NotificationSettings colors={colors} />

            <ThemedText type="small" style={{ color: colors.muted }}>
              {t("account.signedInAs", { email })}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                void signOut();
              }}
              style={({ pressed }) => [
                styles.signOut,
                { borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={{ color: colors.danger, fontWeight: "700" }}>
                {t("account.signOut")}
              </ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const toggles: {
  key: Exclude<keyof NotificationPreferences, "familyActivity">;
  label: StringKey;
}[] = [
  { key: "claimedTasks", label: "notif.claimed" },
  { key: "openTasks", label: "notif.open" },
  { key: "overdueTasks", label: "notif.overdue" },
  { key: "newMembers", label: "notif.members" },
];

const familyOptions: FamilyActivityPreference[] = ["off", "must_do", "all"];

/** screens.md #22: OS status + deep link, 5 toggles, quiet-hours note. */
function NotificationSettings({ colors }: { colors: PaletteColors }) {
  const { dog } = useDailyNeeds();
  const {
    supported,
    permission,
    preferences,
    enableReminders,
    openSystemSettings,
    setPreference,
  } = usePush();
  const enabled = permission === "granted";

  return (
    <View style={styles.section}>
      <ThemedText style={[styles.label, { color: colors.muted }]}>
        {t("notif.title")}
      </ThemedText>
      <View style={[styles.card, { backgroundColor: colors.ground }]}>
        <ThemedText style={{ color: colors.text }}>
          {t(`notif.status.${permission}`, { dog: dog.name })}
        </ThemedText>
        {supported && permission !== "granted" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void (permission === "denied"
                ? openSystemSettings()
                : enableReminders())
            }
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText
              style={{ color: colors.primaryText, fontWeight: "700" }}
            >
              {permission === "denied"
                ? t("notif.openSettings")
                : t("notif.turnOn")}
            </ThemedText>
          </Pressable>
        ) : null}
        {enabled ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void openSystemSettings()}
          >
            <ThemedText style={{ color: colors.primary, fontWeight: "700" }}>
              {t("notif.openSettings")}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {toggles.map((toggle) => (
        <View key={toggle.key} style={styles.toggleRow}>
          <ThemedText style={{ color: colors.text, flex: 1 }}>
            {t(toggle.label)}
          </ThemedText>
          <Switch
            accessibilityLabel={t(toggle.label)}
            value={preferences[toggle.key]}
            onValueChange={(value) => void setPreference(toggle.key, value)}
            trackColor={{ true: colors.primary }}
          />
        </View>
      ))}

      <View style={styles.familyRow}>
        <ThemedText style={{ color: colors.text }}>
          {t("notif.family")}
        </ThemedText>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {familyOptions.map((option) => {
            const selected = preferences.familyActivity === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => void setPreference("familyActivity", option)}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primarySoft
                      : "transparent",
                  },
                ]}
              >
                <ThemedText
                  type="small"
                  style={{
                    color: selected ? colors.primary : colors.text,
                    fontWeight: selected ? "700" : "400",
                  }}
                >
                  {t(`notif.family.${option}`)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ThemedText type="small" style={{ color: colors.muted }}>
        {t("notif.quiet")}
      </ThemedText>
      {Platform.OS === "android" ? (
        <ThemedText type="small" style={{ color: colors.muted }}>
          {t("notif.battery")}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.two,
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four - 4,
  },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: Spacing.four - 4, gap: Spacing.three },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  code: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  section: { gap: Spacing.two },
  memberRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  signOut: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  primary: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.one,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    minHeight: 44,
  },
  familyRow: { gap: Spacing.one },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.two + 4,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
  },
});
