import { getLocales } from "expo-localization";

import { el, en, type StringKey } from "./strings";

export type Language = "en" | "el";
export type { StringKey };

/**
 * Greek is wired but not enabled: the dictionary only holds the core labels
 * from docs/design/screens.md §1 and still needs native-speaker review.
 * Add "el" here once `el` in strings.ts is complete.
 */
const enabledLanguages: readonly Language[] = ["en"];

const dictionaries: Record<Language, Partial<Record<StringKey, string>>> = {
  en,
  el,
};

/** BCP-47 tags used for dates and numbers. */
const localeTags: Record<Language, string> = { en: "en-GB", el: "el-GR" };

function detectLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode as Language | null;
      if (code && enabledLanguages.includes(code)) return code;
    }
  } catch {
    // Native module missing (for example an old dev build): use English.
  }
  return "en";
}

let language: Language = detectLanguage();

export function getLanguage() {
  return language;
}

/** For the future Language setting (screens.md #23). */
export function setLanguage(next: Language) {
  language = enabledLanguages.includes(next) ? next : "en";
}

export function getLocaleTag() {
  return localeTags[language];
}

type Params = Record<string, string | number>;

export function t(key: StringKey, params?: Params): string {
  const template = dictionaries[language][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Picks `${key}.one` / `${key}.other` using the language's plural rules. */
export function tPlural(
  key: string,
  count: number,
  params?: Params,
): string {
  let rule: string = count === 1 ? "one" : "other";
  try {
    rule = new Intl.PluralRules(getLocaleTag()).select(count);
  } catch {
    // Intl.PluralRules unavailable: the English rule above is close enough.
  }
  const pluralKey = (rule === "one" ? `${key}.one` : `${key}.other`) as StringKey;
  return t(pluralKey, { count, ...params });
}

/**
 * Upper-case for labels. Greek capitals drop the tonos (ΤΡΙΤΗ, not ΤΡΊΤΗ),
 * so strip combining accents for Greek.
 */
export function toDisplayUpperCase(value: string) {
  const upper = value.toLocaleUpperCase(getLocaleTag());
  if (language !== "el") return upper;
  return upper.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

export function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat(getLocaleTag(), {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(getLocaleTag(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatWeekdayShort(date: Date) {
  return new Intl.DateTimeFormat(getLocaleTag(), { weekday: "short" }).format(
    date,
  );
}

export function formatWeekdayLong(date: Date) {
  return new Intl.DateTimeFormat(getLocaleTag(), { weekday: "long" }).format(
    date,
  );
}

export function formatMonth(date: Date, style: "short" | "long") {
  return new Intl.DateTimeFormat(getLocaleTag(), { month: style }).format(date);
}

export function formatClock(timestamp: string | Date) {
  return new Intl.DateTimeFormat(getLocaleTag(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof timestamp === "string" ? new Date(timestamp) : timestamp);
}

export function formatWeekRange(first: Date, last: Date) {
  try {
    return new Intl.DateTimeFormat(getLocaleTag(), {
      day: "numeric",
      month: "long",
    }).formatRange(first, last);
  } catch {
    return `${first.getDate()} ${formatMonth(first, "short")} – ${last.getDate()} ${formatMonth(last, "long")}`;
  }
}
