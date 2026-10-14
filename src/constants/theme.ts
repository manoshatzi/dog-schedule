/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Product palette from docs/design/mockups/README.md (light) with a matching
 * dark variant. Screens should use these instead of local palettes.
 */
export const Palette = {
  light: {
    ground: '#F4F5F1',
    surface: '#FFFFFF',
    text: '#1C2321',
    muted: '#5A635F',
    line: '#E3E6E0',
    border: '#C9D0CA',
    inset: '#F0F3F0',
    primary: '#2F6B4F',
    primaryText: '#FFFFFF',
    primarySoft: '#EAF3EE',
    claimButton: '#1C2321',
    claimButtonText: '#FFFFFF',
    openBorder: '#D9822B',
    openFill: '#FFF6EA',
    openText: '#8A4510',
    now: '#B8452A',
    mustFill: '#F8DDD5',
    mustText: '#8F2F1A',
    doneRow: '#E9EDE6',
    doneText: '#3E4743',
    danger: '#B8452A',
    toast: '#1C2321',
    toastText: '#FFFFFF',
    warningFill: '#FBE3CC',
    warningText: '#5C2A06',
  },
  dark: {
    ground: '#141917',
    surface: '#222B26',
    text: '#F4F6F3',
    muted: '#ADB6B0',
    line: '#39463D',
    border: '#4B5A50',
    inset: '#1A211D',
    primary: '#4F9C77',
    primaryText: '#FFFFFF',
    primarySoft: '#1F3529',
    claimButton: '#F4F6F3',
    claimButtonText: '#141917',
    openBorder: '#D9822B',
    openFill: '#3A2A17',
    openText: '#F2C08E',
    now: '#E0694B',
    mustFill: '#4A2219',
    mustText: '#F8C7B8',
    doneRow: '#29352E',
    doneText: '#C3CCC6',
    danger: '#E0694B',
    toast: '#F4F6F3',
    toastText: '#141917',
    warningFill: '#4A3017',
    warningText: '#FBE3CC',
  },
} as const;

export type PaletteColors = { [K in keyof typeof Palette.light]: string };

/** Stable member colours (join order), from the mockups. */
export const MemberColors = [
  { background: '#DCE6F7', text: '#1F4280' },
  { background: '#FBE3CC', text: '#8A4510' },
  { background: '#E9DFF5', text: '#4F2C80' },
  { background: '#DDEDE1', text: '#22553C' },
  { background: '#F7DCE6', text: '#80244A' },
] as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
