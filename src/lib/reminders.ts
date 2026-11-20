/** Pure rules and wording for guest emails about reservations not yet marked as bought. */
import { t2, type Bilingual } from "./i18n";
import type { Mail } from "./mail";

const DAY_MS = 24 * 60 * 60 * 1000;
/** First reminder this long after reserving. */
export const FIRST_REMINDER_MS = 3 * DAY_MS;
/** Later reminders this long after the previous one. */
export const REPEAT_REMINDER_MS = 7 * DAY_MS;
export const MAX_REMINDERS = 3;
/** An editor's "send reminder" on an item skips guests who were mailed about it this recently. */
export const MANUAL_REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

export interface ReminderState {
  createdAt: Date;
  remindedAt: Date | null;
  reminderCount: number;
}

export function reminderDue(c: ReminderState, now: Date): boolean {
  if (c.reminderCount >= MAX_REMINDERS) return false;
  if (c.remindedAt) return now.getTime() - c.remindedAt.getTime() >= REPEAT_REMINDER_MS;
  return now.getTime() - c.createdAt.getTime() >= FIRST_REMINDER_MS;
}

/** Scheduled reminders only go out in the daytime, Swedish time. */
export function inSendingHours(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Stockholm" }).format(now),
  );
  return hour >= 9 && hour < 20;
}

export interface MailItem {
  qty: number;
  name: Bilingual;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function lines(items: readonly MailItem[], locale: "en" | "sv"): string {
  return items.map((i) => `  - ${i.qty} × ${t2(i.name, locale)}`).join("\n");
}

const DIVIDER = "\n\n----------\n\n";

/**
 * Reminder in English and Swedish: the guest's language is not stored with the reservation.
 * `fromHosts` is the editor's own nudge about one item: it says the hosts may release it.
 */
export function reminderMail(opts: {
  to: string;
  guestName: string;
  title: Bilingual;
  items: readonly MailItem[];
  link: string;
  fromHosts?: boolean;
}): Mail {
  const name = firstName(opts.guestName);
  const en = [
    `Hi ${name},`,
    `You reserved this on the gift list "${t2(opts.title, "en")}":`,
    lines(opts.items, "en"),
    "Have you bought it? Then please mark it as bought, so we know it is taken care of. If you have changed your mind, release it so that someone else can take it. Both take one click here:",
    opts.link,
    opts.fromHosts
      ? "The hosts asked us to check in with you about this. If it stays unmarked, they may release it so that another guest can take it."
      : "Your reservation stays in place until you do one or the other.",
  ].join("\n\n");
  const sv = [
    `Hej ${name}!`,
    `Du har reserverat det här på önskelistan "${t2(opts.title, "sv")}":`,
    lines(opts.items, "sv"),
    "Har du köpt den? Markera den då som köpt, så vet vi att den är ordnad. Har du ändrat dig kan du släppa reservationen så att någon annan kan ta den. Båda görs med ett klick här:",
    opts.link,
    opts.fromHosts
      ? "Värdarna har bett oss höra av oss till dig om det här. Om den förblir omarkerad kan de släppa reservationen så att en annan gäst kan ta den."
      : "Reservationen ligger kvar tills du gör det ena eller det andra.",
  ].join("\n\n");
  return {
    to: opts.to,
    subject: `Reminder: your reservation / Påminnelse: din reservation – ${t2(opts.title, "en")}`,
    text: en + DIVIDER + sv,
  };
}

/** Tells a guest that an editor released their reservation, so they do not buy the gift anyway. */
export function releasedMail(opts: { to: string; guestName: string; title: Bilingual; items: readonly MailItem[]; link: string }): Mail {
  const name = firstName(opts.guestName);
  const en = [
    `Hi ${name},`,
    `Your reservation on the gift list "${t2(opts.title, "en")}" has been released by the hosts:`,
    lines(opts.items, "en"),
    "It is available to other guests again. If you have already bought it, or still want to, you can reserve it again here:",
    opts.link,
  ].join("\n\n");
  const sv = [
    `Hej ${name}!`,
    `Din reservation på önskelistan "${t2(opts.title, "sv")}" har släppts av värdarna:`,
    lines(opts.items, "sv"),
    "Den är ledig för andra gäster igen. Har du redan köpt den, eller vill du fortfarande ta den, kan du reservera den igen här:",
    opts.link,
  ].join("\n\n");
  return {
    to: opts.to,
    subject: `Your reservation was released / Din reservation har släppts – ${t2(opts.title, "en")}`,
    text: en + DIVIDER + sv,
  };
}
