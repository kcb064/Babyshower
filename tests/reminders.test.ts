import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { openDb, type DB } from "@/db";
import { createClaim, createContribution, listAdminItems, listPublicItems, markClaimPurchased, type NewClaimInput } from "@/db/queries";
import { notifyReleased, releaseItemReservations, sendDueReminders, sendItemReminders } from "@/db/reminders";
import { claim, item, registry } from "@/db/schema";
import { mailConfigFromEnv, type Mail } from "@/lib/mail";
import { FIRST_REMINDER_MS, inSendingHours, MAX_REMINDERS, reminderDue, reminderMail, REPEAT_REMINDER_MS } from "@/lib/reminders";

const now = new Date("2026-11-10T12:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 24 * 3600 * 1000);

describe("reminderDue", () => {
  const fresh = { createdAt: now, remindedAt: null, reminderCount: 0 };

  it("first reminder three days after reserving", () => {
    expect(reminderDue(fresh, new Date(now.getTime() + FIRST_REMINDER_MS - 1))).toBe(false);
    expect(reminderDue(fresh, new Date(now.getTime() + FIRST_REMINDER_MS))).toBe(true);
  });

  it("later reminders a week after the previous one, three at most", () => {
    const once = { createdAt: now, remindedAt: days(3), reminderCount: 1 };
    expect(reminderDue(once, new Date(days(3).getTime() + REPEAT_REMINDER_MS - 1))).toBe(false);
    expect(reminderDue(once, new Date(days(3).getTime() + REPEAT_REMINDER_MS))).toBe(true);
    expect(reminderDue({ createdAt: now, remindedAt: days(17), reminderCount: MAX_REMINDERS }, days(400))).toBe(false);
  });
});

describe("inSendingHours", () => {
  it("is daytime in Sweden, summer and winter time", () => {
    expect(inSendingHours(new Date("2026-11-10T07:59:00Z"))).toBe(false); // 08:59 CET
    expect(inSendingHours(new Date("2026-11-10T08:00:00Z"))).toBe(true); // 09:00 CET
    expect(inSendingHours(new Date("2026-11-10T18:59:00Z"))).toBe(true); // 19:59 CET
    expect(inSendingHours(new Date("2026-11-10T19:00:00Z"))).toBe(false); // 20:00 CET
    expect(inSendingHours(new Date("2026-07-10T07:00:00Z"))).toBe(true); // 09:00 CEST
    expect(inSendingHours(new Date("2026-11-10T23:30:00Z"))).toBe(false); // 00:30 CET
  });
});

describe("reminderMail", () => {
  it("is bilingual, uses the first name and carries the link", () => {
    const mail = reminderMail({
      to: "anna@example.com",
      guestName: "Anna Andersson",
      title: { sv: "Babyshower", en: "Baby shower" },
      items: [{ qty: 2, name: { sv: "Spjälsäng", en: "Crib" } }],
      link: "https://shower.example.se/my-claims/link?t=abc",
    });
    expect(mail.to).toBe("anna@example.com");
    expect(mail.text).toContain("Hi Anna,");
    expect(mail.text).toContain("Hej Anna!");
    expect(mail.text).toContain("2 × Crib");
    expect(mail.text).toContain("2 × Spjälsäng");
    expect(mail.text.split("https://shower.example.se/my-claims/link?t=abc")).toHaveLength(3);
    expect(mail.text).not.toContain("Andersson");
  });
});

describe("mailConfigFromEnv", () => {
  it("is off without a host or a sender", () => {
    expect(mailConfigFromEnv({ NODE_ENV: "test" })).toBeNull();
    expect(mailConfigFromEnv({ NODE_ENV: "test", SMTP_HOST: "smtp.example.com" })).toBeNull();
  });

  it("defaults to port 587 and the login as sender; 465 means implicit TLS", () => {
    expect(mailConfigFromEnv({ NODE_ENV: "test", SMTP_HOST: "smtp.example.com", SMTP_USER: "me@example.com", SMTP_PASS: "pw" })).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "me@example.com",
      pass: "pw",
      from: "me@example.com",
    });
    const cfg = mailConfigFromEnv({ NODE_ENV: "test", SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", MAIL_FROM: "Shower <a@example.com>" });
    expect(cfg).toMatchObject({ port: 465, secure: true, user: undefined, from: "Shower <a@example.com>" });
  });
});

describe("reminders against the database", () => {
  let db: DB;
  let sent: Mail[];
  const send = async (mail: Mail) => {
    sent.push(mail);
  };
  const linkFor = async (g: { gid: string; email: string }) => `https://x.test/link/${g.gid}`;

  function addItem(name: string, qty = 1, type: "physical" | "group" = "physical") {
    return db.insert(item).values({ name: { en: name }, qtyWanted: qty, type, price: 1000 }).returning().get();
  }
  const base = (itemId: number, over: Partial<NewClaimInput> = {}): NewClaimInput => ({
    itemId,
    guestKey: "g1",
    guestName: "Anna Andersson",
    guestEmail: "anna@example.com",
    qty: 1,
    message: null,
    showName: false,
    address: null,
    purchased: false,
    ...over,
  });
  const rows = () => db.select().from(claim).orderBy(claim.id).all();

  beforeEach(() => {
    db = openDb(":memory:");
    sent = [];
  });

  it("sends nothing before three days, then one mail per guest with all their open reservations", async () => {
    const crib = addItem("Crib");
    const carrier = addItem("Carrier");
    const bottle = addItem("Bottle", 2);
    createClaim(db, base(crib.id), now);
    createClaim(db, base(carrier.id), days(2)); // same guest, reserved later
    createClaim(db, base(bottle.id, { guestKey: "g2", guestName: "Erik", guestEmail: "erik@example.com" }), now);
    createClaim(db, base(bottle.id, { guestKey: "g3", guestName: "Bo", guestEmail: "bo@example.com", purchased: true }), now);

    expect(await sendDueReminders(db, send, linkFor, days(2.9))).toEqual({ sent: 0, failed: 0 });
    expect(await sendDueReminders(db, send, linkFor, days(3))).toEqual({ sent: 2, failed: 0 });
    expect(sent.map((m) => m.to).sort()).toEqual(["anna@example.com", "erik@example.com"]);
    const anna = sent.find((m) => m.to === "anna@example.com");
    expect(anna?.text).toContain("1 × Crib");
    expect(anna?.text).toContain("1 × Carrier");
    expect(anna?.text).toContain("https://x.test/link/g1");
    expect(anna?.text).not.toContain("Bottle");
    // The guest who already bought is never mailed or counted.
    expect(rows().map((r) => r.reminderCount)).toEqual([1, 1, 1, 0]);

    // Nothing more until a week has passed.
    expect(await sendDueReminders(db, send, linkFor, days(9.9))).toEqual({ sent: 0, failed: 0 });
    expect(await sendDueReminders(db, send, linkFor, days(10))).toEqual({ sent: 2, failed: 0 });
  });

  it("stops once the guest marks it bought, and after three reminders", async () => {
    const crib = addItem("Crib");
    const carrier = addItem("Carrier");
    const a = createClaim(db, base(crib.id), now);
    createClaim(db, base(carrier.id, { guestKey: "g2", guestEmail: "erik@example.com" }), now);
    if (!a.ok) throw new Error("claim failed");
    expect((await sendDueReminders(db, send, linkFor, days(3))).sent).toBe(2);
    markClaimPurchased(db, a.claim.id, "g1", days(4));
    expect((await sendDueReminders(db, send, linkFor, days(10))).sent).toBe(1);
    expect((await sendDueReminders(db, send, linkFor, days(17))).sent).toBe(1);
    expect((await sendDueReminders(db, send, linkFor, days(400))).sent).toBe(0);
    expect(sent.filter((m) => m.to === "erik@example.com")).toHaveLength(3);
    expect(sent.filter((m) => m.to === "anna@example.com")).toHaveLength(1);
  });

  it("does not mark a claim as reminded when the mail server refuses it", async () => {
    const crib = addItem("Crib");
    createClaim(db, base(crib.id), now);
    const failing = async () => {
      throw new Error("535 authentication failed");
    };
    expect(await sendDueReminders(db, failing, linkFor, days(3))).toEqual({ sent: 0, failed: 1 });
    expect(rows()[0]).toMatchObject({ reminderCount: 0, remindedAt: null });
    expect(await sendDueReminders(db, send, linkFor, days(3))).toEqual({ sent: 1, failed: 0 });
  });

  it("never reminds about Swish contributions", async () => {
    db.update(registry).set({ swishNumber: "0701234567" }).where(eq(registry.id, 1)).run();
    const group = addItem("Stroller", 1, "group");
    const res = createContribution(
      db,
      { itemId: group.id, guestKey: "g1", guestName: "Anna", guestEmail: "anna@example.com", amount: 300, message: null, showName: false },
      now,
    );
    expect(res.ok).toBe(true);
    expect(await sendDueReminders(db, send, linkFor, new Date(now.getTime() + 23 * 3600 * 1000))).toEqual({ sent: 0, failed: 0 });
  });

  it("an editor can remind about one item right away, past the schedule and its cap", async () => {
    const carrier = addItem("Carrier", 1, "group"); // a group gift someone is buying whole
    const crib = addItem("Crib", 2);
    createClaim(db, base(carrier.id), now);
    createClaim(db, base(crib.id), now); // same guest, another item: not part of this mail
    createClaim(db, base(crib.id, { guestKey: "g2", guestName: "Erik", guestEmail: "erik@example.com" }), now);
    db.update(claim).set({ reminderCount: 3, remindedAt: days(17) }).where(eq(claim.itemId, carrier.id)).run();

    expect(listAdminItems(db, false, days(20)).find((i) => i.id === carrier.id)?.open).toEqual({ since: now, remindedAt: days(17) });
    expect(await sendItemReminders(db, carrier.id, send, linkFor, days(20))).toEqual({ sent: 1, failed: 0, recent: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("anna@example.com");
    expect(sent[0]?.text).toContain("1 × Carrier");
    expect(sent[0]?.text).not.toContain("Crib");
    expect(sent[0]?.text).toContain("https://x.test/link/g1");
    expect(sent[0]?.text).toContain("they may release it");
    expect(sent[0]?.text).toContain("kan de släppa reservationen");
    expect(rows().map((r) => [r.reminderCount, r.remindedAt])).toEqual([
      [4, days(20)],
      [0, null],
      [0, null],
    ]);
    expect(listAdminItems(db, false, days(20)).find((i) => i.id === carrier.id)?.open?.remindedAt).toEqual(days(20));

    // A second press within the hour mails nobody; later it does again.
    expect(await sendItemReminders(db, carrier.id, send, linkFor, new Date(days(20).getTime() + 59 * 60 * 1000))).toEqual({
      sent: 0,
      failed: 0,
      recent: 1,
    });
    expect(await sendItemReminders(db, carrier.id, send, linkFor, days(21))).toEqual({ sent: 1, failed: 0, recent: 0 });
    expect(sent).toHaveLength(2);
  });

  it("an item reminder skips what is bought or released and survives a refused mail", async () => {
    const bottle = addItem("Bottle", 3);
    const a = createClaim(db, base(bottle.id), now);
    createClaim(db, base(bottle.id, { guestKey: "g2", guestName: "Erik", guestEmail: "erik@example.com", purchased: true }), now);
    if (!a.ok) throw new Error("claim failed");
    const failing = async () => {
      throw new Error("535 authentication failed");
    };
    expect(await sendItemReminders(db, bottle.id, failing, linkFor, days(1))).toEqual({ sent: 0, failed: 1, recent: 0 });
    expect(rows()[0]).toMatchObject({ reminderCount: 0, remindedAt: null });
    expect(await sendItemReminders(db, bottle.id, send, linkFor, days(1))).toEqual({ sent: 1, failed: 0, recent: 0 });
    expect(sent.map((m) => m.to)).toEqual(["anna@example.com"]);

    markClaimPurchased(db, a.claim.id, "g1", days(2));
    expect(await sendItemReminders(db, bottle.id, send, linkFor, days(3))).toEqual({ sent: 0, failed: 0, recent: 0 });
    expect(listAdminItems(db, false, days(3)).find((i) => i.id === bottle.id)?.open).toBeNull();
  });

  it("an editor can release what is reserved but not bought, and the guest is told", async () => {
    const bottle = addItem("Bottle", 3);
    createClaim(db, base(bottle.id), now);
    createClaim(db, base(bottle.id, { guestKey: "g2", guestName: "Erik Ek", guestEmail: "erik@example.com", purchased: true }), now);
    const other = addItem("Crib");
    createClaim(db, base(other.id, { guestKey: "g3", guestEmail: "bo@example.com" }), now);

    const released = releaseItemReservations(db, bottle.id, days(1));
    expect(released).toEqual([{ guestName: "Anna Andersson", guestEmail: "anna@example.com", qty: 1, itemName: { en: "Bottle" } }]);
    expect(rows().map((r) => r.status)).toEqual(["released", "purchased", "reserved"]);
    expect(listPublicItems(db, days(1)).find((i) => i.id === bottle.id)?.status).toMatchObject({ claimed: 1, remaining: 2 });
    expect(releaseItemReservations(db, bottle.id, days(1))).toEqual([]);

    await notifyReleased(db, send, released, "https://x.test");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("anna@example.com");
    expect(sent[0]?.text).toContain("1 × Bottle");
    expect(sent[0]?.text).toContain("https://x.test");
  });
});

describe("migration from the 72 h hold", () => {
  it("clears the deadline on open reservations and keeps everything else", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bs-mig-"));
    const file = path.join(dir, "registry.db");
    // Build a database as the previous release left it: every migration except the last.
    const folder = path.join(dir, "drizzle");
    fs.cpSync(path.resolve("drizzle"), folder, { recursive: true });
    const journalPath = path.join(folder, "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
    const full = structuredClone(journal);
    expect(journal.entries.at(-1)?.tag).toBe("0003_reservations_keep_reminders");
    journal.entries.pop();
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    const old = new Database(file);
    migrate(drizzle(old), { migrationsFolder: folder });
    old.exec(`insert into item (id, name) values (1, '{"en":"Crib"}')`);
    const hold = now.getTime() + 72 * 3600 * 1000;
    const ins = old.prepare(
      "insert into claim (item_id, guest_key, guest_name, guest_email, status, amount, expires_at) values (1, 'g', 'n', 'e@example.com', ?, ?, ?)",
    );
    ins.run("reserved", null, hold);
    ins.run("purchased", 300, hold); // unconfirmed Swish contribution keeps its 24 h window
    ins.run("released", null, hold);
    old.close();

    fs.writeFileSync(journalPath, JSON.stringify(full));
    const upgraded = new Database(file);
    migrate(drizzle(upgraded), { migrationsFolder: folder });
    const after = upgraded.prepare("select status, expires_at, reminder_count, reminded_at from claim order by id").all();
    upgraded.close();
    expect(after).toEqual([
      { status: "reserved", expires_at: null, reminder_count: 0, reminded_at: null },
      { status: "purchased", expires_at: hold, reminder_count: 0, reminded_at: null },
      { status: "released", expires_at: hold, reminder_count: 0, reminded_at: null },
    ]);
  });
});
