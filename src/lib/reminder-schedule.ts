import { getDb } from "@/db";
import { sendDueReminders, type GuestIdentityLike, type ReminderRun } from "@/db/reminders";
import { serverEnv } from "./env";
import { guestLinkToken } from "./guest";
import { mailer } from "./mail";
import { inSendingHours } from "./reminders";

/** The guest's durable "my claims" link, where one click marks a reservation bought or releases it. */
function linkFor(base: string) {
  return async (guest: GuestIdentityLike) => `${base}/my-claims/link?t=${encodeURIComponent(await guestLinkToken(guest))}`;
}

/** Send every reminder that is due now. Null when email is not set up. */
export async function runReminders(base: string, now: Date = new Date()): Promise<ReminderRun | null> {
  const send = mailer();
  if (!send) return null;
  return sendDueReminders(getDb(), send, linkFor(base), now);
}

const HOUR_MS = 60 * 60 * 1000;
const FIRST_RUN_MS = 2 * 60 * 1000;
const globalForSchedule = globalThis as unknown as { __reminderTimerStarted?: boolean };

/**
 * Hourly check inside the server process; mail only goes out in the daytime (Swedish time).
 * Production only, and only when SMTP and PUBLIC_URL are configured (the mail needs a link).
 */
export function startReminderSchedule(env: NodeJS.ProcessEnv = process.env): "started" | "off" | "noPublicUrl" {
  if (env.NODE_ENV !== "production" || globalForSchedule.__reminderTimerStarted || !mailer(env)) return "off";
  const base = serverEnv().publicUrl;
  if (!base) return "noPublicUrl";
  globalForSchedule.__reminderTimerStarted = true;
  const run = () => {
    if (!inSendingHours(new Date())) return;
    runReminders(base)
      .then((r) => {
        if (r && (r.sent || r.failed)) console.log(`[reminders] sent ${r.sent}, failed ${r.failed}`);
      })
      .catch((err: unknown) => console.error("[reminders] failed:", err instanceof Error ? err.message : err));
  };
  setTimeout(run, FIRST_RUN_MS).unref();
  setInterval(run, HOUR_MS).unref();
  return "started";
}
