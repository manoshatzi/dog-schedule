import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import Animated, { Easing, Keyframe } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// Must match the expo-splash-screen plugin in app.json so the hand-off from
// the native splash to this overlay is invisible.
const BACKGROUND = { light: "#2F6B4F", dark: "#1F4A36" };
const IMAGE_SIZE = 120;
// Never hold the app longer than this, even if loading stalls.
const MAX_HOLD_MS = 4000;
const EXIT_MS = 450;

let appReady = false;
const listeners = new Set<() => void>();

/** Called once the first real screen (sign-in, onboarding or Today) can render. */
export function hideSplash() {
  if (appReady) return;
  appReady = true;
  listeners.forEach((listener) => listener());
}

const backgroundExit = new Keyframe({
  0: { opacity: 1 },
  40: { opacity: 1 },
  100: { opacity: 0, easing: Easing.out(Easing.quad) },
});

const markExit = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  30: { opacity: 1, transform: [{ scale: 0.92 }], easing: Easing.out(Easing.quad) },
  100: { opacity: 0, transform: [{ scale: 1.25 }], easing: Easing.in(Easing.cubic) },
});

export function SplashOverlay() {
  const scheme = useColorScheme();
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);
  const nativeHidden = useRef(false);

  function hideNativeSplash() {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    void SplashScreen.hideAsync();
  }

  useEffect(() => {
    const leave = () => setLeaving(true);
    if (appReady) leave();
    listeners.add(leave);
    const maxHold = setTimeout(leave, MAX_HOLD_MS);
    // In case the image never reports back, don't leave the native splash up.
    const imageFallback = setTimeout(hideNativeSplash, 1000);
    return () => {
      listeners.delete(leave);
      clearTimeout(maxHold);
      clearTimeout(imageFallback);
    };
  }, []);

  if (!visible) return null;

  const background = {
    backgroundColor: scheme === "dark" ? BACKGROUND.dark : BACKGROUND.light,
  };
  const mark = (
    <Image
      style={styles.image}
      source={require("@/assets/images/splash-icon.png")}
      contentFit="contain"
      onDisplay={hideNativeSplash}
      onError={hideNativeSplash}
    />
  );

  if (!leaving) {
    return (
      <View pointerEvents="none" style={[styles.overlay, background]}>
        {mark}
      </View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      entering={backgroundExit.duration(EXIT_MS).withCallback((finished) => {
        "worklet";
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={[styles.overlay, background]}
    >
      <Animated.View entering={markExit.duration(EXIT_MS)}>{mark}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
});
