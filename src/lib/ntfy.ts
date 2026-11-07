/** Owner push notifications via ntfy.sh. Never throws, never blocks the caller. */

export type NtfyEvent = "claim" | "purchased" | "released";

const labels: Record<NtfyEvent, string> = {
  claim: "New reservation",
  purchased: "Marked as purchased",
  released: "Reservation released",
};

/**
 * Build the notification text. The guest name is only included once the registry has been
 * revealed, so a phone lock screen never spoils the surprise.
 */
export function ntfyMessage(opts: {
  event: NtfyEvent;
  itemName: string;
  claimed: number;
  total: number;
  guestName?: string | null;
  revealed: boolean;
}): string {
  const who = opts.revealed && opts.guestName ? ` – ${opts.guestName}` : "";
  return `${labels[opts.event]}: ${opts.itemName} (${opts.claimed} of ${opts.total})${who}`;
}

/** Group digits with ordinary spaces, e.g. 3 100 (notification text, not HTML). */
function grouped(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * "New contribution: Diaper fund 300 kr (3 100 / 5 000)". Sent when a guest confirms a Swish
 * contribution. Same reveal rule as claims: the name is only added after reveal.
 */
export function ntfyContributionMessage(opts: {
  itemName: string;
  amount: number;
  confirmed: number;
  goal: number;
  guestName?: string | null;
  revealed: boolean;
}): string {
  const who = opts.revealed && opts.guestName ? ` – ${opts.guestName}` : "";
  const progress = opts.goal > 0 ? ` (${grouped(opts.confirmed)} / ${grouped(opts.goal)})` : ` (${grouped(opts.confirmed)} kr)`;
  return `New contribution: ${opts.itemName} ${grouped(opts.amount)} kr${progress}${who}`;
}

export function sendNtfy(message: string, topic: string | undefined = process.env.NTFY_TOPIC): void {
  if (!topic) return;
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;
  void fetch(url, {
    method: "POST",
    body: message,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    signal: AbortSignal.timeout(3000),
  }).catch((err: unknown) => {
    console.warn("ntfy notification failed:", err instanceof Error ? err.message : err);
  });
}
