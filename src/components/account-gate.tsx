import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import { SymbolView } from "expo-symbols";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { LegalLinks } from "@/constants/links";
import { Spacing, type PaletteColors } from "@/constants/theme";
import { usePalette } from "@/hooks/use-palette";
import { t } from "@/i18n";

export type AccountGateMode =
  | "loading"
  | "signed-out"
  | "check-email"
  | "reset-password"
  | "needs-age"
  | "needs-household"
  | "error"
  | "configuration-error";

type AccountGateProps = {
  mode: AccountGateMode;
  error?: string | null;
  notice?: string | null;
  pendingEmail?: string;
  onSignIn?: (email: string, password: string) => Promise<void>;
  onSignUp?: (email: string, password: string) => Promise<void>;
  onSignInWithApple?: (confirmAge: boolean) => Promise<void>;
  onRequestPasswordReset?: (email: string) => Promise<void>;
  onUpdatePassword?: (password: string) => Promise<void>;
  onResendConfirmation?: () => Promise<void>;
  onBackToSignIn?: () => void;
  onConfirmAge?: () => Promise<void>;
  onCreateFamily?: (dogName: string) => Promise<void>;
  onJoinFamily?: (inviteCode: string) => Promise<void>;
  onSignOut?: () => Promise<void>;
  onRetry?: () => void;
};

type AuthView = "sign-up" | "sign-in" | "forgot";
type FamilyStep = "choose" | "create" | "join";

/**
 * Signed-out, onboarding-lite and boot states. Replaced by the
 * (onboarding) route group when the onboarding wizard ships
 * (docs/design/screens.md §2).
 */
export function AccountGate(props: AccountGateProps) {
  const colors = usePalette();
  const [authView, setAuthView] = useState<AuthView>("sign-up");
  const [familyStep, setFamilyStep] = useState<FamilyStep>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [dogName, setDogName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
  ];

  async function submit(action: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    try {
      await action();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  function requireAge() {
    if (authView === "sign-up" && !ageConfirmed) {
      setFormError(t("auth.ageRequired"));
      return false;
    }
    return true;
  }

  function submitEmail() {
    if (!email.trim() || !password) {
      setFormError(t("auth.missingFields"));
      return;
    }
    if (authView === "sign-up") {
      if (!requireAge()) return;
      if (password.length < 6) {
        setFormError(t("auth.passwordShort"));
        return;
      }
      void submit(async () => props.onSignUp?.(email, password));
    } else {
      void submit(async () => props.onSignIn?.(email, password));
    }
  }

  const title =
    props.mode === "configuration-error"
      ? t("auth.configTitle")
      : props.mode === "signed-out"
        ? authView === "forgot"
          ? t("auth.resetTitle")
          : t("auth.appName")
        : props.mode === "check-email"
          ? t("auth.checkEmailTitle")
          : props.mode === "reset-password"
            ? t("auth.newPasswordTitle")
            : props.mode === "needs-age"
              ? t("auth.ageTitle")
              : props.mode === "needs-household"
                ? t("family.chooseTitle")
                : props.mode === "error"
                  ? t("auth.loadError")
                  : t("auth.loading");

  let body: ReactNode = null;

  if (props.mode === "configuration-error") {
    body = <ThemedText style={{ color: colors.muted }}>{props.error}</ThemedText>;
  } else if (props.mode === "loading") {
    body = (
      <ThemedText style={{ color: colors.muted }}>
        {t("auth.loadingBody")}
      </ThemedText>
    );
  } else if (props.mode === "error") {
    body = (
      <>
        <PrimaryButton colors={colors} onPress={() => props.onRetry?.()}>
          {t("action.retry")}
        </PrimaryButton>
        <LinkButton colors={colors} onPress={() => void props.onSignOut?.()}>
          {t("auth.signOut")}
        </LinkButton>
      </>
    );
  } else if (props.mode === "signed-out" && authView === "forgot") {
    body = (
      <>
        <ThemedText style={{ color: colors.muted }}>
          {t("auth.resetHelp")}
        </ThemedText>
        <Field label={t("auth.email")}>
          <TextInput
            accessibilityLabel={t("auth.email")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={inputStyle}
          />
        </Field>
        <PrimaryButton
          colors={colors}
          disabled={busy}
          onPress={() =>
            void submit(async () => {
              if (!email.trim()) throw new Error(t("auth.missingFields"));
              await props.onRequestPasswordReset?.(email);
            })
          }
        >
          {busy ? t("auth.wait") : t("auth.sendReset")}
        </PrimaryButton>
        <LinkButton
          colors={colors}
          onPress={() => {
            setFormError("");
            setAuthView("sign-in");
            props.onBackToSignIn?.();
          }}
        >
          {t("auth.backToSignIn")}
        </LinkButton>
      </>
    );
  } else if (props.mode === "signed-out") {
    const signUp = authView === "sign-up";
    body = (
      <>
        <ThemedText style={{ color: colors.muted }}>
          {t("auth.tagline")}
        </ThemedText>
        <View
          accessibilityRole="tablist"
          style={[styles.segment, { backgroundColor: colors.line }]}
        >
          {(["sign-up", "sign-in"] as const).map((view) => {
            const selected = authView === view;
            return (
              <Pressable
                key={view}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setFormError("");
                  setAuthView(view);
                }}
                style={[
                  styles.segmentOption,
                  selected && { backgroundColor: colors.surface },
                ]}
              >
                <ThemedText
                  style={[
                    styles.segmentText,
                    { color: selected ? colors.text : colors.muted },
                  ]}
                >
                  {view === "sign-up"
                    ? t("auth.signUpTab")
                    : t("auth.signInTab")}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {signUp ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ageConfirmed }}
            onPress={() => {
              setFormError("");
              setAgeConfirmed((value) => !value);
            }}
            style={styles.checkboxRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: ageConfirmed ? colors.primary : colors.border,
                  backgroundColor: ageConfirmed
                    ? colors.primary
                    : colors.surface,
                },
              ]}
            >
              {ageConfirmed ? (
                <SymbolView
                  name={{ ios: "checkmark", android: "check", web: "check" }}
                  tintColor="#FFFFFF"
                  size={18}
                />
              ) : null}
            </View>
            <View style={styles.checkboxText}>
              <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                {t("auth.ageGate")}
              </ThemedText>
              <ThemedText type="small" style={{ color: colors.muted }}>
                {t("auth.under16")}
              </ThemedText>
            </View>
          </Pressable>
        ) : null}

        {appleAvailable ? (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                signUp
                  ? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={() => {
                if (busy || !requireAge()) return;
                void submit(async () =>
                  props.onSignInWithApple?.(signUp && ageConfirmed),
                );
              }}
            />
            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: colors.line }]} />
              <ThemedText type="small" style={{ color: colors.muted }}>
                {t("auth.or")}
              </ThemedText>
              <View style={[styles.orLine, { backgroundColor: colors.line }]} />
            </View>
          </>
        ) : null}

        <Field label={t("auth.email")}>
          <TextInput
            accessibilityLabel={t("auth.email")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={inputStyle}
          />
        </Field>
        <Field label={t("auth.password")}>
          <TextInput
            accessibilityLabel={t("auth.password")}
            autoComplete={signUp ? "new-password" : "current-password"}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submitEmail}
            style={inputStyle}
          />
        </Field>
        <PrimaryButton colors={colors} disabled={busy} onPress={submitEmail}>
          {busy
            ? t("auth.wait")
            : signUp
              ? t("auth.createAccount")
              : t("auth.signIn")}
        </PrimaryButton>
        {signUp ? (
          <LegalLine colors={colors} />
        ) : (
          <LinkButton
            colors={colors}
            onPress={() => {
              setFormError("");
              setAuthView("forgot");
            }}
          >
            {t("auth.forgot")}
          </LinkButton>
        )}
      </>
    );
  } else if (props.mode === "check-email") {
    body = (
      <>
        <View style={[styles.illustration, { backgroundColor: colors.primarySoft }]}>
          <SymbolView
            name={{ ios: "envelope.open", android: "mark_email_unread", web: "mark_email_unread" }}
            tintColor={colors.primary}
            size={44}
          />
        </View>
        <ThemedText style={{ color: colors.muted }}>
          {t("auth.checkEmailBody", { email: props.pendingEmail ?? "" })}
        </ThemedText>
        <PrimaryButton
          colors={colors}
          onPress={() => {
            Linking.openURL(Platform.OS === "ios" ? "message://" : "mailto:").catch(
              () => undefined,
            );
          }}
        >
          {t("auth.openMail")}
        </PrimaryButton>
        <SecondaryButton
          colors={colors}
          disabled={busy}
          onPress={() =>
            void submit(async () => props.onResendConfirmation?.())
          }
        >
          {busy ? t("auth.wait") : t("auth.resend")}
        </SecondaryButton>
        <LinkButton
          colors={colors}
          onPress={() => {
            setAuthView("sign-in");
            props.onBackToSignIn?.();
          }}
        >
          {t("auth.backToSignIn")}
        </LinkButton>
      </>
    );
  } else if (props.mode === "reset-password") {
    body = (
      <>
        <Field label={t("auth.newPassword")}>
          <TextInput
            accessibilityLabel={t("auth.newPassword")}
            autoComplete="new-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={inputStyle}
          />
        </Field>
        <PrimaryButton
          colors={colors}
          disabled={busy}
          onPress={() =>
            void submit(async () => {
              if (password.length < 6) throw new Error(t("auth.passwordShort"));
              await props.onUpdatePassword?.(password);
            })
          }
        >
          {busy ? t("auth.wait") : t("auth.savePassword")}
        </PrimaryButton>
      </>
    );
  } else if (props.mode === "needs-age") {
    body = (
      <>
        <ThemedText style={{ color: colors.muted }}>{t("auth.ageBody")}</ThemedText>
        <PrimaryButton
          colors={colors}
          disabled={busy}
          onPress={() => void submit(async () => props.onConfirmAge?.())}
        >
          {busy ? t("auth.wait") : t("auth.ageGate")}
        </PrimaryButton>
        <ThemedText type="small" style={{ color: colors.muted }}>
          {t("auth.under16")}
        </ThemedText>
        <LinkButton colors={colors} onPress={() => void props.onSignOut?.()}>
          {t("auth.signOut")}
        </LinkButton>
      </>
    );
  } else if (props.mode === "needs-household" && familyStep === "choose") {
    body = (
      <>
        <ThemedText style={{ color: colors.muted }}>
          {t("family.chooseBody")}
        </ThemedText>
        <ChoiceCard
          colors={colors}
          icon={{ ios: "house", android: "home", web: "home" }}
          title={t("family.create")}
          detail={t("family.createHelp")}
          onPress={() => {
            setFormError("");
            setFamilyStep("create");
          }}
        />
        <ChoiceCard
          colors={colors}
          icon={{ ios: "person.2", android: "group", web: "group" }}
          title={t("family.join")}
          detail={t("family.joinHelp")}
          onPress={() => {
            setFormError("");
            setFamilyStep("join");
          }}
        />
        <LinkButton colors={colors} onPress={() => void props.onSignOut?.()}>
          {t("auth.signOut")}
        </LinkButton>
      </>
    );
  } else if (props.mode === "needs-household" && familyStep === "create") {
    body = (
      <>
        <Field label={t("family.dogName")}>
          <TextInput
            accessibilityLabel={t("family.dogName")}
            value={dogName}
            onChangeText={setDogName}
            maxLength={80}
            autoFocus
            style={inputStyle}
          />
        </Field>
        <PrimaryButton
          colors={colors}
          disabled={busy}
          onPress={() =>
            void submit(async () => {
              if (!dogName.trim()) throw new Error(t("family.dogNameRequired"));
              await props.onCreateFamily?.(dogName);
            })
          }
        >
          {busy ? t("auth.wait") : t("family.createButton")}
        </PrimaryButton>
        <LinkButton
          colors={colors}
          onPress={() => {
            setFormError("");
            setFamilyStep("choose");
          }}
        >
          {t("family.back")}
        </LinkButton>
      </>
    );
  } else if (props.mode === "needs-household") {
    body = (
      <>
        <Field label={t("family.inviteCode")}>
          <TextInput
            accessibilityLabel={t("family.inviteCode")}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            value={inviteCode}
            onChangeText={setInviteCode}
            maxLength={24}
            style={inputStyle}
          />
        </Field>
        <PrimaryButton
          colors={colors}
          disabled={busy}
          onPress={() =>
            void submit(async () => {
              if (!inviteCode.trim()) throw new Error(t("family.codeRequired"));
              await props.onJoinFamily?.(inviteCode);
            })
          }
        >
          {busy ? t("auth.wait") : t("family.joinButton")}
        </PrimaryButton>
        <LinkButton
          colors={colors}
          onPress={() => {
            setFormError("");
            setFamilyStep("choose");
          }}
        >
          {t("family.back")}
        </LinkButton>
      </>
    );
  }

  const message = formError || props.error;

  return (
    <View style={[styles.screen, { backgroundColor: colors.ground }]}>
      <SafeAreaView style={styles.flex}>
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
                accessibilityRole="header"
                style={[styles.title, { color: colors.text }]}
              >
                {title}
              </ThemedText>
              {body}
              {props.notice ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={{ color: colors.primary, fontWeight: "600" }}
                >
                  {props.notice}
                </ThemedText>
              ) : null}
              {message && props.mode !== "configuration-error" ? (
                <ThemedText
                  type="small"
                  accessibilityRole="alert"
                  style={{ color: colors.danger }}
                >
                  {message}
                </ThemedText>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

function PrimaryButton({
  colors,
  disabled,
  onPress,
  children,
}: {
  colors: PaletteColors;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.primary },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <ThemedText style={[styles.buttonText, { color: colors.primaryText }]}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function SecondaryButton({
  colors,
  disabled,
  onPress,
  children,
}: {
  colors: PaletteColors;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderWidth: 1.5, borderColor: colors.primary },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <ThemedText style={[styles.buttonText, { color: colors.primary }]}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function LinkButton({
  colors,
  onPress,
  children,
}: {
  colors: PaletteColors;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.linkButton}
    >
      <ThemedText style={{ color: colors.primary, fontWeight: "600" }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function ChoiceCard({
  colors,
  icon,
  title,
  detail,
  onPress,
}: {
  colors: PaletteColors;
  icon: ComponentProps<typeof SymbolView>["name"];
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: colors.surface, borderColor: colors.line },
        pressed && styles.dimmed,
      ]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: colors.primarySoft }]}>
        <SymbolView name={icon} tintColor={colors.primary} size={26} />
      </View>
      <View style={styles.choiceText}>
        <ThemedText style={[styles.choiceTitle, { color: colors.text }]}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: colors.muted }}>
          {detail}
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
        tintColor={colors.muted}
        size={18}
      />
    </Pressable>
  );
}

function LegalLine({ colors }: { colors: PaletteColors }) {
  const linkStyle = { color: colors.primary, fontWeight: "600" as const };
  return (
    <View style={styles.legalRow}>
      <ThemedText type="small" style={{ color: colors.muted }}>
        {t("auth.legal")}
      </ThemedText>
      <View style={styles.legalLinks}>
        {LegalLinks.terms ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(LegalLinks.terms)}
          >
            <ThemedText type="small" style={linkStyle}>
              {t("auth.terms")}
            </ThemedText>
          </Pressable>
        ) : null}
        {LegalLinks.privacy ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(LegalLinks.privacy)}
          >
            <ThemedText type="small" style={linkStyle}>
              {t("auth.privacy")}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
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
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  field: { gap: Spacing.two },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  buttonText: { fontWeight: "700", fontSize: 16 },
  dimmed: { opacity: 0.6 },
  linkButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  segment: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  segmentOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontWeight: "600" },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 44,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxText: { flex: 1, minWidth: 0 },
  appleButton: { width: "100%", height: 48 },
  orRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  orLine: { flex: 1, height: 1 },
  illustration: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 88,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { flex: 1, minWidth: 0, gap: 2 },
  choiceTitle: { fontSize: 17, fontWeight: "700" },
  legalRow: { gap: Spacing.one },
  legalLinks: { flexDirection: "row", gap: Spacing.three },
});
