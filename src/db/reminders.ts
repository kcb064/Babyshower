/**
 * Email reminders for reservations not yet marked as bought, and the editor's "release" of them.
 * Guest names and addresses are only used to send the mail; callers get counts back, so surprise
 * mode holds.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "./index";
import { claim, item } from "./schema";
import { getRegistry } from "./queries";
import type { Bilingual } from "@/lib/i18n";
import type { SendMail } from "@/lib/mail";
import { reminderDue, reminderMail, releasedMail, type MailItem } from "@/lib/reminders";

export interface GuestIdentityLike {
  gid: string;
  email: string;
}

interface GuestReservations {
  guest: GuestIdentityLike;
  guestName: string;
  claimIds: number[];
  items: MailItem[];
}

/** Open reservations grouped per guest, for guests with at least one reminder due. */
function dueReminderGroups(db: DB, now: Date): GuestReservations[] {
  const rows = db
    .select({
      id: claim.id,
      guestKey: claim.guestKey,
      guestName: claim.guestName,
      guestEmail: claim.guestEmail,
      qty: claim.qty,
      createdAt: claim.createdAt,
      remindedAt: claim.remindedAt,
      reminderCount: claim.reminderCount,
      itemName: item.name,
    })
    .from(claim)
    .innerJoin(item, eq(claim.itemId, item.id))
    .where(and(eq(claim.status, "reserved"), isNull(claim.amount)))
    .orderBy(asc(claim.createdAt), asc(claim.id))
    .all();
  const groups = new Map<string, GuestReservations & { due: boolean }>();
  for (const r of rows) {
    const key = `${r.guestKey}\n${r.guestEmail}`;
    const g = groups.get(key) ?? {
      guest: { gid: r.guestKey, email: r.guestEmail },
      guestName: r.guestName,
      claimIds: [],
      items: [],
      due: false,
    };
    g.claimIds.push(r.id);
    g.items.push({ qty: r.qty, name: r.itemName });
    if (reminderDue(r, now)) g.due = true;
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.due);
}

export interface ReminderRun {
  sent: number;
  failed: number;
}

const globalForReminders = globalThis as unknown as { __remindersRunning?: boolean };

/**
 * Send one email per guest who has a reminder due, listing all their open reservations. A claim is
 * only marked as reminded once its mail was accepted by the mail server.
 */
export async function sendDueReminders(
  db: DB,
  send: SendMail,
  linkFor: (guest: GuestIdentityLike) => Promise<string>,
  now: Date = new Date(),
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, failed: 0 };
  if (globalForReminders.__remindersRunning) return run;
  globalForReminders.__remindersRunning = true;
  try {
    const title = getRegistry(db).title;
    for (const g of dueReminderGroups(db, now)) {
      try {
        await send(reminderMail({ to: g.guest.email, guestName: g.guestName, title, items: g.items, link: await linkFor(g.guest) }));
        db.update(claim)
          .set({ remindedAt: now, reminderCount: sql`${claim.reminderCount} + 1` })
          .where(inArray(claim.id, g.claimIds))
          .run();
        run.sent += 1;
      } catch (err) {
        run.failed += 1;
        console.error("[reminders] could not send a reminder:", err instanceof Error ? err.message : err);
      }
    }
  } finally {
    globalForReminders.__remindersRunning = false;
  }
  return run;
}

export interface ReleasedReservation {
  guestName: string;
  guestEmail: string;
  qty: number;
  itemName: Bilingual;
}

/**
 * Editor frees an item: every reservation on it that is not marked as bought is released. Returns
 * the released rows for the notification mail only; never pass them on to a page.
 */
export function releaseItemReservations(db: DB, itemId: number, now: Date = new Date()): ReleasedReservation[] {
  return db.transaction((tx) => {
    const rows = tx
      .select({ id: claim.id, guestName: claim.guestName, guestEmail: claim.guestEmail, qty: claim.qty, itemName: item.name })
      .from(claim)
      .innerJoin(item, eq(claim.itemId, item.id))
      .where(and(eq(claim.itemId, itemId), eq(claim.status, "reserved"), isNull(claim.amount)))
      .all();
    if (rows.length) {
      tx.update(claim)
        .set({ status: "released", releasedAt: now, updatedAt: now })
        .where(inArray(claim.id, rows.map((r) => r.id)))
        .run();
    }
    return rows.map(({ guestName, guestEmail, qty, itemName }) => ({ guestName, guestEmail, qty, itemName }));
  });
}

/** Tell each released guest by email. Failures are logged, never thrown. */
export async function notifyReleased(db: DB, send: SendMail, released: readonly ReleasedReservation[], link: string): Promise<void> {
  const title = getRegistry(db).title;
  for (const r of released) {
    try {
      await send(releasedMail({ to: r.guestEmail, guestName: r.guestName, title, items: [{ qty: r.qty, name: r.itemName }], link }));
    } catch (err) {
      console.error("[reminders] could not send a release notice:", err instanceof Error ? err.message : err);
    }
  }
}
