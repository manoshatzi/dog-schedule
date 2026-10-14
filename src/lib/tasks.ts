import { MemberColors } from "@/constants/theme";
import { getLanguage, t, tPlural } from "@/i18n";
import type {
  AmountUnit,
  ClaimRepeatRule,
  OccurrenceStatus,
  TaskType,
} from "@/lib/database.types";

export type { AmountUnit, TaskType };
export type DailyNeedType = TaskType;
export type NeedOccurrenceStatus = OccurrenceStatus;
export type BookingRepeat = ClaimRepeatRule;

export type DailyNeed = {
  id: string;
  dogId: string | null;
  title: string;
  time: string;
  details: string;
  required: boolean;
  type: TaskType;
  durationMinutes: number;
  repeatDays: string[];
  amountValue: number | null;
  amountUnit: AmountUnit | null;
  oneOffDate: string | null;
  defaultAssigneeId: string | null;
  reminderMinutesBefore: number | null;
};

export type DailyNeedInput = Omit<DailyNeed, "id" | "dogId"> & { id?: string };

export type HouseholdMember = {
  userId: string;
  name: string;
  role: "owner" | "member";
  /** Index into MemberColors, stable by join order. */
  colorIndex: number;
};

export type DailyNeedOccurrence = {
  needId: string;
  date: string;
  status: NeedOccurrenceStatus;
  bookedBy: string | null;
  bookedName: string | null;
  assignedUserId: string | null;
  assignedName: string | null;
  repeatRule: BookingRepeat;
  reminderEnabled: boolean;
  completedBy: string | null;
  completedName: string | null;
  completedAt: string | null;
  previousStatus: "open" | "booked" | null;
  /** True when no row is stored and the state comes from a series or default. */
  virtual?: boolean;
};

export type ClaimSeries = {
  id: string;
  needId: string;
  assignedUserId: string | null;
  assignedName: string;
  repeatRule: "weekday" | "daily";
  weekday: number | null;
  startsOn: string;
  endsOn: string | null;
  reminderEnabled: boolean;
  createdBy: string | null;
};

export type Dog = {
  id: string;
  name: string;
  birthday: string | null;
  photoPath: string | null;
};

export const weekdayKeys = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;
/** Monday-first, for pickers. */
export const mondayFirstKeys = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Noon local time avoids DST edge cases when doing day arithmetic. */
export function fromDateKey(key: string) {
  return new Date(`${key}T12:00:00`);
}

export function addDays(key: string, amount: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function toClockKey(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function isNeedScheduledOn(need: DailyNeed, dateKey: string) {
  if (need.oneOffDate) return need.oneOffDate === dateKey;
  const dayKey = weekdayKeys[fromDateKey(dateKey).getDay()];
  return need.repeatDays.includes(dayKey);
}

function isMember(members: readonly HouseholdMember[], userId: string | null) {
  return Boolean(userId && members.some((member) => member.userId === userId));
}

export function findActiveSeries(
  needId: string,
  dateKey: string,
  series: readonly ClaimSeries[],
  members: readonly HouseholdMember[],
) {
  const weekday = fromDateKey(dateKey).getDay();
  return series
    .filter(
      (item) =>
        item.needId === needId &&
        item.startsOn <= dateKey &&
        (!item.endsOn || item.endsOn >= dateKey) &&
        (item.repeatRule === "daily" || item.weekday === weekday) &&
        isMember(members, item.assignedUserId),
    )
    .sort((first, second) => second.startsOn.localeCompare(first.startsOn))[0];
}

/**
 * Effective state of a task on a day. Mirrors public.resolve_occurrence():
 * stored row > repeating claim > task default assignee > open.
 */
export function resolveOccurrence(
  need: DailyNeed,
  dateKey: string,
  occurrences: readonly DailyNeedOccurrence[],
  series: readonly ClaimSeries[],
  members: readonly HouseholdMember[],
): DailyNeedOccurrence {
  const stored = occurrences.find(
    (item) => item.needId === need.id && item.date === dateKey,
  );
  if (stored) return stored;

  const base: DailyNeedOccurrence = {
    needId: need.id,
    date: dateKey,
    status: "open",
    bookedBy: null,
    bookedName: null,
    assignedUserId: null,
    assignedName: null,
    repeatRule: "today",
    reminderEnabled: false,
    completedBy: null,
    completedName: null,
    completedAt: null,
    previousStatus: null,
    virtual: true,
  };

  const active = findActiveSeries(need.id, dateKey, series, members);
  if (active) {
    const assignee = members.find(
      (member) => member.userId === active.assignedUserId,
    );
    const creator = members.find((member) => member.userId === active.createdBy);
    return {
      ...base,
      status: "booked",
      assignedUserId: active.assignedUserId,
      assignedName: assignee?.name ?? active.assignedName,
      bookedBy: active.createdBy ?? active.assignedUserId,
      bookedName: creator?.name ?? assignee?.name ?? active.assignedName,
      repeatRule: active.repeatRule,
      reminderEnabled: active.reminderEnabled,
    };
  }

  const fallback = members.find(
    (member) => member.userId === need.defaultAssigneeId,
  );
  if (fallback) {
    return {
      ...base,
      status: "booked",
      assignedUserId: fallback.userId,
      assignedName: fallback.name,
      bookedBy: fallback.userId,
      bookedName: fallback.name,
      reminderEnabled: need.reminderMinutesBefore !== null,
    };
  }

  return base;
}

/** The actor the guarded RPC compares against for the current status. */
export function getExpectedActor(occurrence: DailyNeedOccurrence) {
  if (occurrence.status === "booked") return occurrence.assignedUserId;
  if (occurrence.status === "done") return occurrence.completedBy;
  return null;
}

export type TimingState = "upcoming" | "due" | "overdue";

/**
 * Due from the task time; overdue after a grace period of the task's
 * duration, clamped to 30–60 minutes (docs/design/user-flows.md status model).
 */
export function getTimingState(
  need: DailyNeed,
  dateKey: string,
  now: Date,
): TimingState {
  const todayKey = toDateKey(now);
  if (dateKey > todayKey) return "upcoming";
  if (dateKey < todayKey) return "overdue";
  const [hours, minutes] = need.time.split(":").map(Number);
  const start = hours * 60 + minutes;
  const current = now.getHours() * 60 + now.getMinutes();
  const grace = Math.min(60, Math.max(30, need.durationMinutes));
  if (current < start) return "upcoming";
  if (current < start + grace) return "due";
  return "overdue";
}

export function getEndTime(need: DailyNeed) {
  const [hours, minutes] = need.time.split(":").map(Number);
  const end = (hours * 60 + minutes + need.durationMinutes) % 1440;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function getMemberColor(
  members: readonly HouseholdMember[],
  userId: string | null,
) {
  const member = members.find((item) => item.userId === userId);
  return MemberColors[(member?.colorIndex ?? 0) % MemberColors.length];
}

export function getInitials(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase();
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export function formatAmount(
  value: number | null,
  unit: AmountUnit | null,
): string | null {
  if (value === null || unit === null) return null;
  const count = Number.isInteger(value) ? value : Number(value.toFixed(2));
  switch (unit) {
    case "pill":
      return tPlural("unit.pill", count);
    case "drop":
      return t("unit.drop");
    default:
      return t(`unit.${unit}`, { count });
  }
}

/** "Dinner · 150 g" */
export function getTaskTitle(need: DailyNeed) {
  const amount = formatAmount(need.amountValue, need.amountUnit);
  return amount ? `${need.title} · ${amount}` : need.title;
}

/** "I'll do the evening walk": lower-case the first letter in English only. */
export function getTaskPhrase(title: string) {
  if (getLanguage() !== "en" || !title) return title;
  const [first, second] = title;
  // Keep acronyms and names that start with two capitals ("TV walk").
  if (second && second === second.toUpperCase() && /[A-Z]/.test(second)) {
    return title;
  }
  return first.toLowerCase() + title.slice(1);
}

export function isFeedingType(type: TaskType) {
  return type === "food" || type === "medicine";
}
