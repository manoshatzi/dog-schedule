import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { usePalette } from "@/hooks/use-palette";

export type ToastTone = "info" | "warning" | "error";

export type ToastOptions = {
  message: string;
  /** Second line, e.g. "Don't feed again." */
  detail?: string;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
  /** Milliseconds; defaults to 4s, 5s with an action, 7s for warnings. */
  duration?: number;
};

type ToastState = ToastOptions & { id: number };

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * One toast or snackbar at a time, above the tab bar. Replaces the inline
 * header error text the screens used to show (docs/design/user-flows.md c).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();
  const colors = usePalette();

  const hideToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    setToast({ ...options, id: nextId.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const duration =
      toast.duration ??
      (toast.tone === "warning" ? 7000 : toast.action ? 5000 : 4000);
    const timeout = setTimeout(
      () => setToast((current) => (current?.id === toast.id ? null : current)),
      duration,
    );
    return () => clearTimeout(timeout);
  }, [toast]);

  const tone = toast?.tone ?? "info";
  const background =
    tone === "warning"
      ? colors.warningFill
      : tone === "error"
        ? colors.danger
        : colors.toast;
  const foreground =
    tone === "warning"
      ? colors.warningText
      : tone === "error"
        ? "#FFFFFF"
        : colors.toastText;

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.container,
            { bottom: insets.bottom + BottomTabInset + Spacing.three },
          ]}
        >
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              { backgroundColor: background },
              tone === "warning" && {
                borderColor: colors.openBorder,
                borderWidth: 2,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Dismisses the message"
              onPress={hideToast}
              style={styles.messageArea}
            >
              <ThemedText
                style={[
                  styles.message,
                  { color: foreground },
                  tone === "warning" && styles.warningMessage,
                ]}
              >
                {toast.message}
              </ThemedText>
              {toast.detail ? (
                <ThemedText style={[styles.detail, { color: foreground }]}>
                  {toast.detail}
                </ThemedText>
              ) : null}
            </Pressable>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const action = toast.action;
                  setToast(null);
                  action?.onPress();
                }}
                style={styles.actionButton}
              >
                <ThemedText style={[styles.actionText, { color: foreground }]}>
                  {toast.action.label}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    alignItems: "center",
  },
  toast: {
    width: "100%",
    maxWidth: 560,
    minHeight: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    elevation: 4,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  messageArea: { flex: 1, minWidth: 0, gap: 2 },
  message: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  warningMessage: { fontSize: 16, fontWeight: "700" },
  detail: { fontSize: 14, lineHeight: 19 },
  actionButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 15,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
