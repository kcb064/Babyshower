/** Owner push notifications via ntfy.sh. Never throws, never blocks the caller. */

export type NtfyEvent = "claim" | "purchased" | "released";

const labels: Record<NtfyEvent, string> = {
  claim: "Ny reservation",
  purchased: "Markerad som köpt",
  released: "Reservation släppt",
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
  return `${labels[opts.event]}: ${opts.itemName} (${opts.claimed} av ${opts.total})${who}`;
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
