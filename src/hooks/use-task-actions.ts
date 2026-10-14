import { useToast } from "@/components/toast";
import {
  useDailyNeeds,
  type TransitionOptions,
  type TransitionOutcome,
} from "@/hooks/use-daily-needs";
import { usePush } from "@/hooks/use-push";
import { formatClock, t } from "@/i18n";
import type { TransitionAction } from "@/lib/database.types";
import {
  getTaskPhrase,
  type DailyNeed,
  type DailyNeedOccurrence,
} from "@/lib/tasks";

type RunConfig = {
  /** Skip the success toast (the caller shows its own feedback). */
  quiet?: boolean;
  /**
   * Don't toast conflicts or failures; the caller shows them inline. Used by
   * the task sheet, which is a native sheet drawn above the toast layer.
   */
  inlineFailures?: boolean;
};

export type ConflictMessage = { message: string; detail?: string };

/**
 * Runs a guarded transition and turns the outcome into the toasts and
 * snackbars from docs/design/user-flows.md (c): conflicts name the person,
 * "already done" is the double-feeding guard, failures offer Retry and Done
 * offers a 5 second Undo.
 */
export function useTaskActions() {
  const { transition, userId, members } = useDailyNeeds();
  const { showToast } = useToast();
  const { offerRemindersAfterClaim } = usePush();

  function nameFor(id: string | null, fallback: string | null) {
    if (id && id === userId) return t("common.you");
    return (
      members.find((member) => member.userId === id)?.name ??
      fallback ??
      t("common.familyMember")
    );
  }

  /** Plain-language conflict text; null when nothing went wrong for the user. */
  function describeConflict(
    need: DailyNeed,
    action: TransitionAction,
    outcome: Extract<TransitionOutcome, { ok: false }>,
  ): ConflictMessage | null {
    const current = outcome.occurrence;
    switch (outcome.error) {
      case "already_done":
        return {
          message: t("conflict.done", {
            name: nameFor(current.completedBy, current.completedName),
            time: current.completedAt ? formatClock(current.completedAt) : "",
          }),
          detail:
            need.type === "food"
              ? t("conflict.dontFeed")
              : need.type === "medicine"
                ? t("conflict.dontGive")
                : undefined,
        };
      case "already_claimed":
        // Our own double tap: nothing went wrong.
        if (current.assignedUserId === userId) return null;
        return {
          message: t("conflict.claimed", {
            name: nameFor(current.assignedUserId, current.assignedName),
          }),
        };
      case "not_allowed":
        return {
          message:
            action === "undo"
              ? t("conflict.notAllowedUndo")
              : t("conflict.notAllowed"),
        };
      default:
        return { message: t("conflict.changed") };
    }
  }

  async function run(
    need: DailyNeed,
    current: DailyNeedOccurrence,
    action: TransitionAction,
    options: TransitionOptions = {},
    config: RunConfig = {},
  ): Promise<TransitionOutcome | null> {
    let outcome: TransitionOutcome;
    try {
      outcome = await transition(need, current, action, options);
    } catch {
      if (config.inlineFailures) return null;
      showToast({
        tone: "error",
        message: t("error.couldNotSave"),
        action: {
          label: t("action.retry"),
          onPress: () => void run(need, current, action, options, config),
        },
      });
      return null;
    }

    if (!outcome.ok) {
      const conflict = describeConflict(need, action, outcome);
      if (conflict && !config.inlineFailures) {
        showToast({
          ...conflict,
          tone: outcome.error === "already_done" ? "warning" : "info",
        });
      }
      return outcome;
    }
    // First own claim: ask for reminders in context (flow d), not at launch.
    if (
      (action === "claim" || action === "take_over") &&
      outcome.occurrence.assignedUserId === userId
    ) {
      offerRemindersAfterClaim();
    }
    if (config.quiet) return outcome;

    const task = getTaskPhrase(need.title);
    const saved = outcome.occurrence;
    if (action === "complete") {
      showToast({
        message: t("toast.done", { task: need.title }),
        action: {
          label: t("action.undo"),
          onPress: () => void run(need, saved, "undo", {}, { quiet: true }),
        },
      });
    } else if (action === "release") {
      showToast({ message: t("toast.released", { task: need.title }) });
    } else if (action === "take_over") {
      showToast({ message: t("toast.takenOver", { task }) });
    } else if (action === "reopen") {
      showToast({ message: t("toast.reopened", { task: need.title }) });
    } else if (action === "claim" && saved.assignedUserId !== userId) {
      showToast({
        message: t("toast.assigned", {
          name: nameFor(saved.assignedUserId, saved.assignedName),
          task,
        }),
      });
    }
    return outcome;
  }

  return { run, nameFor, describeConflict };
}
