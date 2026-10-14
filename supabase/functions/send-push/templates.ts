// Notification copy (docs/design/user-flows.md, flows c and d). Rendered per
// device locale; Greek falls back to English until the app's Greek
// dictionary is complete and reviewed (src/i18n/strings.ts).

export type PushKind =
  | "claimer_reminder"
  | "must_do_unclaimed"
  | "due_unclaimed"
  | "overdue"
  | "assigned"
  | "taken_over"
  | "done_on_your_claim"
  | "released_near_due"
  | "reopened"
  | "family_done"
  | "member_joined"
  | "task_deleted"
  | "task_moved";

type Template = { title: string; body: string };

// Placeholders: {task} title as written, {taskLower} for mid-sentence use,
// {dog}, {time}, {oldTime}, {actor}.
const en: Record<PushKind, Template> = {
  claimer_reminder: {
    title: "{task} at {time}",
    body: "You've got this one.",
  },
  must_do_unclaimed: {
    title: "Nobody's on it yet",
    body: "{dog}'s {taskLower} at {time} has nobody on it yet.",
  },
  due_unclaimed: {
    title: "{task} is due",
    body: "{dog}'s {taskLower} is due and nobody's on it.",
  },
  overdue: {
    title: "Overdue",
    body: "{dog}'s {taskLower} is overdue.",
  },
  assigned: {
    title: "You're on it",
    body: "{actor} signed you up for the {taskLower}, {time}.",
  },
  taken_over: {
    title: "Taken over",
    body: "{actor} took over the {taskLower} at {time}. You're off the hook.",
  },
  done_on_your_claim: {
    title: "Already done",
    body: "{actor} did the {taskLower} you claimed.",
  },
  released_near_due: {
    title: "Open again",
    body: "{task} at {time} is open again. Can you do it?",
  },
  reopened: {
    title: "Marked as not done",
    body: "{actor} marked the {taskLower} as not done.",
  },
  family_done: {
    title: "{task} done",
    body: "{actor} did {dog}'s {taskLower}.",
  },
  member_joined: {
    title: "New in the family",
    body: "{actor} joined {dog}'s family 🎉",
  },
  task_deleted: {
    title: "Task deleted",
    body: "{actor} deleted the {taskLower}. You're off the hook today.",
  },
  task_moved: {
    title: "{task} moved to {time}",
    body: "{actor} moved it from {oldTime}. You're still on it.",
  },
};

const dictionaries: Record<string, Partial<Record<PushKind, Template>>> = { en };

/** "Evening walk" -> "evening walk" (English only; keeps "TV walk"). */
function lowerFirst(title: string, language: string) {
  if (language !== "en" || title.length < 2) return title;
  const second = title[1];
  if (/[A-Z]/.test(second)) return title;
  return title[0].toLowerCase() + title.slice(1);
}

export function renderNotification(
  kind: PushKind,
  data: Record<string, unknown>,
  locale: string,
): Template {
  const language = (locale || "en").slice(0, 2).toLowerCase();
  const template = dictionaries[language]?.[kind] ?? en[kind];
  const text = (key: string, fallback: string) =>
    typeof data[key] === "string" && data[key] !== "" ? (data[key] as string) : fallback;
  const task = text("task", "Task");
  const params: Record<string, string> = {
    task,
    taskLower: lowerFirst(task, language),
    dog: text("dog", "Your dog"),
    time: text("time", ""),
    oldTime: text("oldTime", ""),
    actor: text("actor", "Someone"),
  };
  const fill = (value: string) =>
    value.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
  return { title: fill(template.title), body: fill(template.body) };
}
