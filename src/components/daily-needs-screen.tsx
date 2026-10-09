import { SymbolView } from "expo-symbols";
import { useState } from "react";
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

export function DailyNeedsScreen() {
  const { needs, saveNeed } = useDailyNeeds();
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
              <ThemedText type="subtitle" style={styles.profileName}>
                Summer
              </ThemedText>
            </View>
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
                {item.details ? `${item.details} - every day` : "Every day"}
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
          colors={colors}
          onClose={() => setEditor(null)}
          onSave={(input) => {
            saveNeed(input);
            setEditor(null);
          }}
        />
      )}
    </>
  );
}

type NeedFormProps = {
  need?: DailyNeed;
  colors: typeof palette.light;
  onClose: () => void;
  onSave: (input: DailyNeedInput) => void;
};

function NeedForm({ need, colors, onClose, onSave }: NeedFormProps) {
  const [title, setTitle] = useState(need?.title ?? "");
  const [time, setTime] = useState(need?.time ?? "");
  const [details, setDetails] = useState(need?.details ?? "");
  const [required, setRequired] = useState(need?.required ?? false);
  const [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border },
  ];

  function submit() {
    if (!title.trim()) {
      setError("Enter a name for this need.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
      setError("Enter a time in 24-hour format, such as 07:30.");
      return;
    }
    onSave({
      id: need?.id,
      title: title.trim(),
      time: time.trim(),
      details: details.trim(),
      required,
    });
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.backdrop,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + Spacing.three,
          },
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.form, { backgroundColor: colors.surface }]}
        >
          <View style={styles.formHeader}>
            <ThemedText
              type="subtitle"
              accessibilityRole="header"
              style={[styles.formTitle, { color: colors.text }]}
            >
              {need ? "Edit need" : "Add a need"}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close need form"
              onPress={onClose}
              style={styles.iconButton}
            >
              <SymbolView
                name={{ ios: "xmark", android: "close", web: "close" }}
                tintColor={colors.text}
                size={24}
              />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.fields}
          >
            <View style={styles.field}>
              <ThemedText type="smallBold" style={{ color: colors.text }}>
                Name
              </ThemedText>
              <TextInput
                accessibilityLabel="Need name"
                autoFocus
                value={title}
                onChangeText={setTitle}
                placeholder="Morning walk"
                placeholderTextColor={colors.secondary}
                maxLength={120}
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <ThemedText type="smallBold" style={{ color: colors.text }}>
                Time (24-hour)
              </ThemedText>
              <TextInput
                accessibilityLabel="Need time"
                value={time}
                onChangeText={setTime}
                placeholder="07:30"
                placeholderTextColor={colors.secondary}
                maxLength={5}
                autoCorrect={false}
                keyboardType={
                  Platform.OS === "ios" ? "numbers-and-punctuation" : "default"
                }
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <ThemedText type="smallBold" style={{ color: colors.text }}>
                Details (optional)
              </ThemedText>
              <TextInput
                accessibilityLabel="Need details"
                value={details}
                onChangeText={setDetails}
                placeholder="30 min or 150 g dry food"
                placeholderTextColor={colors.secondary}
                maxLength={240}
                multiline
                style={[inputStyle, styles.detailsInput]}
              />
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
            {error ? (
              <ThemedText
                type="small"
                accessibilityRole="alert"
                style={styles.error}
              >
                {error}
              </ThemedText>
            ) : null}
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
                {need ? "Save changes" : "Add need"}
              </ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  header: { gap: Spacing.four, paddingBottom: Spacing.four },
  title: { fontWeight: "700" },
  profile: {
    backgroundColor: green,
    padding: Spacing.three,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DDEDE1",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { color: "#FFFFFF", flex: 1 },
  empty: { paddingBottom: Spacing.three },
  need: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 88,
    padding: Spacing.three,
    borderRadius: 16,
    marginBottom: Spacing.two,
  },
  time: {
    fontSize: 18,
    fontWeight: "700",
    width: 54,
    fontVariant: ["tabular-nums"],
  },
  needContent: { flex: 1, minWidth: 0, gap: Spacing.one },
  needHeading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  needTitle: { fontWeight: "700", flexShrink: 1 },
  badge: {
    color: "#9C301B",
    backgroundColor: "#FADCD3",
    paddingHorizontal: Spacing.two,
    borderRadius: 4,
  },
  addButton: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    minHeight: 64,
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
  },
  form: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "100%",
    borderRadius: 8,
    padding: Spacing.four,
    flexShrink: 1,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  formTitle: { fontSize: 24, lineHeight: 32, flex: 1 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fields: { gap: Spacing.three },
  field: { gap: Spacing.two },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.two,
    fontSize: 16,
    fontFamily: Fonts.sans,
  },
  detailsInput: { minHeight: 80, textAlignVertical: "top" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  error: { color: "#C43C25" },
  saveButton: {
    backgroundColor: green,
    borderRadius: 8,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  saveText: { color: "#FFFFFF", fontWeight: "700" },
});
