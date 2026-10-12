import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type AccountGateProps = {
  mode:
    | "loading"
    | "signed-out"
    | "needs-household"
    | "error"
    | "configuration-error";
  error?: string | null;
  notice?: string | null;
  onSignIn?: (email: string, password: string) => Promise<void>;
  onSignUp?: (email: string, password: string) => Promise<void>;
  onCreateHousehold?: (name: string) => Promise<void>;
  onJoinHousehold?: (inviteCode: string) => Promise<void>;
  onRetry?: () => void;
};

export function AccountGate(props: AccountGateProps) {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.textSecondary },
  ];

  async function submit(action: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    try {
      await action();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  const signedOut = props.mode === "signed-out";
  const needsHousehold = props.mode === "needs-household";

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inner}>
              <ThemedText
                type="subtitle"
                accessibilityRole="header"
                style={styles.title}
              >
                {props.mode === "configuration-error"
                  ? "Connect Supabase"
                  : signedOut
                    ? "Dog Schedule"
                    : needsHousehold
                      ? "Set up your household"
                      : props.mode === "error"
                        ? "Could not load your household"
                        : "Loading your schedule"}
              </ThemedText>
              {props.mode === "configuration-error" ? (
                <ThemedText themeColor="textSecondary">
                  {props.error}
                </ThemedText>
              ) : null}
              {props.mode === "loading" ? (
                <ThemedText themeColor="textSecondary">
                  Connecting to your shared schedule...
                </ThemedText>
              ) : null}
              {props.mode === "error" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={props.onRetry}
                  style={styles.primaryButton}
                >
                  <ThemedText style={styles.primaryText}>Try again</ThemedText>
                </Pressable>
              ) : null}
              {signedOut ? (
                <>
                  <ThemedText themeColor="textSecondary">
                    Sign in or create an account to sync your dog’s needs with
                    family.
                  </ThemedText>
                  <View style={styles.field}>
                    <ThemedText type="smallBold">Email</ThemedText>
                    <TextInput
                      accessibilityLabel="Email"
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                      style={inputStyle}
                    />
                  </View>
                  <View style={styles.field}>
                    <ThemedText type="smallBold">Password</ThemedText>
                    <TextInput
                      accessibilityLabel="Password"
                      autoComplete="password"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                      style={inputStyle}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      submit(async () => props.onSignIn?.(email, password))
                    }
                    style={[styles.primaryButton, busy && styles.disabled]}
                  >
                    <ThemedText style={styles.primaryText}>
                      {busy ? "Please wait..." : "Sign in"}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      submit(async () => props.onSignUp?.(email, password))
                    }
                    style={[styles.secondaryButton, busy && styles.disabled]}
                  >
                    <ThemedText style={styles.secondaryText}>
                      Create account
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
              {needsHousehold ? (
                <>
                  <ThemedText themeColor="textSecondary">
                    Create a shared schedule for your dog, or join a family
                    member’s with their invite code.
                  </ThemedText>
                  <View style={styles.field}>
                    <ThemedText type="smallBold">Dog’s name</ThemedText>
                    <TextInput
                      accessibilityLabel="Dog name"
                      value={householdName}
                      onChangeText={setHouseholdName}
                      maxLength={80}
                      style={inputStyle}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      submit(async () =>
                        props.onCreateHousehold?.(householdName),
                      )
                    }
                    style={[styles.primaryButton, busy && styles.disabled]}
                  >
                    <ThemedText style={styles.primaryText}>
                      Create household
                    </ThemedText>
                  </Pressable>
                  <View style={styles.divider} />
                  <View style={styles.field}>
                    <ThemedText type="smallBold">Family invite code</ThemedText>
                    <TextInput
                      accessibilityLabel="Family invite code"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      value={inviteCode}
                      onChangeText={setInviteCode}
                      maxLength={16}
                      style={inputStyle}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      submit(async () => props.onJoinHousehold?.(inviteCode))
                    }
                    style={[styles.secondaryButton, busy && styles.disabled]}
                  >
                    <ThemedText style={styles.secondaryText}>
                      Join household
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
              {props.notice ? (
                <ThemedText style={styles.notice}>{props.notice}</ThemedText>
              ) : null}
              {formError || props.error ? (
                <ThemedText
                  type="small"
                  accessibilityRole="alert"
                  style={styles.error}
                >
                  {formError || props.error}
                </ThemedText>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.four,
  },
  inner: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    gap: Spacing.three,
  },
  title: { fontWeight: "700" },
  field: { gap: Spacing.two },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.two,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: "#2D6D51",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "700" },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2D6D51",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  secondaryText: { color: "#2D6D51", fontWeight: "700" },
  disabled: { opacity: 0.55 },
  divider: {
    height: 1,
    backgroundColor: "#A0ACA5",
    marginVertical: Spacing.one,
  },
  notice: { color: "#2D6D51" },
  error: { color: "#C43C25" },
});
