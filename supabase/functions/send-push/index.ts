// send-push: drains public.notification_outbox through the Expo Push API.
//
// Invoked every minute by pg_cron (public.push_kick via pg_net) when there is
// work. Auth: the `x-cron-secret` header must equal the PUSH_CRON_SECRET
// function secret (deploy with --no-verify-jwt). Database access uses the
// service role key that Supabase injects into Edge Functions; it never leaves
// the server.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (provided by Supabase)
//   PUSH_CRON_SECRET                         (supabase secrets set ...)
//   EXPO_ACCESS_TOKEN                        (optional; only if "Enhanced
//                                             push security" is on in EAS)
//
// Steps: claim due outbox rows (state, preferences, quiet hours and expiry
// are re-checked in SQL) -> render copy in the device locale -> POST to Expo
// in chunks of 100 -> store tickets -> fetch receipts for tickets older than
// 15 minutes -> delete tokens that report DeviceNotRegistered.

import { createClient } from "npm:@supabase/supabase-js@2";

import { renderNotification, type PushKind } from "./templates.ts";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_ROUNDS = 5;
const BATCH_SIZE = 100;

type DeviceToken = { token: string; platform: "ios" | "android"; locale: string };

type ClaimedRow = {
  outbox_id: number;
  kind: PushKind;
  data: Record<string, unknown>;
  expires_at: string | null;
  tokens: DeviceToken[];
};

type ExpoMessage = {
  to: string;
  title?: string;
  body: string;
  data: Record<string, unknown>;
  sound?: "default";
  channelId?: string;
  priority?: "default" | "normal" | "high";
  expiration?: number;
  threadId?: string;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

type TicketResult = {
  token: string;
  status: "ok" | "error";
  ticketId?: string;
  error?: string;
};

class RetryableError extends Error {}

const TIME_SENSITIVE: ReadonlySet<PushKind> = new Set<PushKind>([
  "claimer_reminder",
  "must_do_unclaimed",
  "due_unclaimed",
  "overdue",
  "released_near_due",
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function expoHeaders() {
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
    "content-type": "application/json",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

/** POST with exponential backoff on 429 / 5xx / network errors. */
async function postToExpo(url: string, body: unknown): Promise<unknown> {
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = `network: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      lastError = `HTTP ${response.status}`;
      await response.body?.cancel();
      continue;
    }
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      // 4xx other than 429: the request itself is wrong; don't retry.
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }
  throw new RetryableError(lastError);
}

function buildMessage(row: ClaimedRow, device: DeviceToken): ExpoMessage {
  const { title, body } = renderNotification(row.kind, row.data, device.locale);
  const needId = typeof row.data.needId === "string" ? row.data.needId : null;
  const date = typeof row.data.date === "string" ? row.data.date : null;
  const url =
    needId && date
      ? `/task?needId=${encodeURIComponent(needId)}&date=${encodeURIComponent(date)}`
      : "/";
  const timeSensitive = TIME_SENSITIVE.has(row.kind);
  const message: ExpoMessage = {
    to: device.token,
    title,
    body,
    data: { url, kind: row.kind, needId, date },
    sound: "default",
    // Channels are created by the app (src/lib/push.ts). A channel that does
    // not exist on the device hides the notification, so keep these in sync.
    channelId: timeSensitive ? "reminders" : "activity",
    priority: timeSensitive ? "high" : "default",
  };
  if (needId) message.threadId = needId;
  if (row.expires_at) {
    message.expiration = Math.floor(new Date(row.expires_at).getTime() / 1000);
  }
  return message;
}

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get("PUSH_CRON_SECRET");
  const providedSecret = request.headers.get("x-cron-secret") ?? "";
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = { sent: 0, failed: 0, retried: 0, receipts: 0, tokensRemoved: 0 };

  // 1. Drain the outbox.
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, error } = await supabase.rpc("push_claim_batch", {
      batch_size: BATCH_SIZE,
    });
    if (error) {
      console.error("push_claim_batch failed", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    const rows = (data ?? []) as ClaimedRow[];
    if (rows.length === 0) break;

    const entries = rows.flatMap((row) =>
      row.tokens.map((device) => ({ row, device, message: buildMessage(row, device) })),
    );
    const ticketsByRow = new Map<number, TicketResult[]>();
    const failureByRow = new Map<number, { outcome: "failed" | "retry"; error: string }>();

    for (let start = 0; start < entries.length; start += MAX_MESSAGES_PER_REQUEST) {
      const chunk = entries.slice(start, start + MAX_MESSAGES_PER_REQUEST);
      try {
        const response = (await postToExpo(
          EXPO_SEND_URL,
          chunk.map((entry) => entry.message),
        )) as { data?: ExpoTicket[]; errors?: { code: string; message: string }[] };
        const tickets = response.data ?? [];
        chunk.forEach((entry, index) => {
          const ticket = tickets[index];
          const result: TicketResult =
            ticket?.status === "ok"
              ? { token: entry.device.token, status: "ok", ticketId: ticket.id }
              : {
                  token: entry.device.token,
                  status: "error",
                  error:
                    ticket?.status === "error"
                      ? (ticket.details?.error ?? ticket.message ?? "error")
                      : (response.errors?.[0]?.code ?? "missing ticket"),
                };
          const list = ticketsByRow.get(entry.row.outbox_id) ?? [];
          list.push(result);
          ticketsByRow.set(entry.row.outbox_id, list);
        });
      } catch (error) {
        const outcome = error instanceof RetryableError ? "retry" : "failed";
        const message = error instanceof Error ? error.message : String(error);
        for (const entry of chunk) {
          failureByRow.set(entry.row.outbox_id, { outcome, error: message });
        }
      }
    }

    for (const row of rows) {
      const tickets = ticketsByRow.get(row.outbox_id) ?? [];
      const failure = failureByRow.get(row.outbox_id);
      const anyOk = tickets.some((ticket) => ticket.status === "ok");
      const outcome = anyOk ? "sent" : (failure?.outcome ?? "failed");
      const errorText = anyOk
        ? null
        : (failure?.error ??
          (tickets.map((ticket) => ticket.error).filter(Boolean).join(", ") ||
            null));
      const { error: finishError } = await supabase.rpc("push_finish", {
        target_outbox_id: row.outbox_id,
        outcome,
        error_message: errorText,
        tickets,
      });
      if (finishError) console.error("push_finish failed", row.outbox_id, finishError);
      if (outcome === "sent") summary.sent += 1;
      else if (outcome === "retry") summary.retried += 1;
      else summary.failed += 1;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  // 2. Receipts (Expo recommends checking ~15 minutes after sending).
  const { data: pending, error: pendingError } = await supabase.rpc(
    "push_pending_receipts",
    { max_ids: 1000 },
  );
  if (pendingError) {
    console.error("push_pending_receipts failed", pendingError);
  } else {
    const ids = ((pending ?? []) as { ticket_id: string }[]).map((row) => row.ticket_id);
    if (ids.length > 0) {
      try {
        const response = (await postToExpo(EXPO_RECEIPTS_URL, { ids })) as {
          data?: Record<
            string,
            { status: "ok" | "error"; message?: string; details?: { error?: string } }
          >;
        };
        const receipts = Object.entries(response.data ?? {}).map(([ticketId, receipt]) => ({
          ticketId,
          status: receipt.status,
          error: receipt.details?.error ?? receipt.message ?? null,
        }));
        for (const receipt of receipts) {
          if (receipt.status === "error") {
            console.warn("push receipt error", receipt.ticketId, receipt.error);
          }
        }
        if (receipts.length > 0) {
          const { data: removed, error: recordError } = await supabase.rpc(
            "push_record_receipts",
            { receipts },
          );
          if (recordError) console.error("push_record_receipts failed", recordError);
          summary.receipts = receipts.length;
          summary.tokensRemoved = typeof removed === "number" ? removed : 0;
        }
      } catch (error) {
        console.error("getReceipts failed", error);
      }
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { "content-type": "application/json" },
  });
});
