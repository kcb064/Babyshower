import { getDb } from "@/db";
import { listRevealedGifts } from "@/db/gifts";
import { getEditor } from "@/lib/auth";
import { giftsCsv } from "@/lib/csv";
import { t2 } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const typeLabel = { physical: "item", group: "group gift", fund: "fund" } as const;
const statusLabel = { reserved: "Reserved", purchased: "Purchased", pending: "Awaiting confirmation" } as const;

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f4f1ea;color:#2b2b2b;max-width:36rem;margin:3rem auto;padding:0 16px;line-height:1.5">
<h1 style="font-family:Georgia,serif;font-weight:600">${title}</h1><p>${body}</p>
<p><a href="/admin/reveal" style="color:#a95b3b">Go to Reveal and peek</a> · <a href="/admin" style="color:#a95b3b">Overview</a></p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET() {
  const editor = await getEditor();
  if (!editor?.name) return page(401, "Sign in first", "The export is for editors only.");
  const rows = listRevealedGifts(getDb());
  if (!rows) {
    return page(
      403,
      "Not revealed yet",
      "The gift list can be exported once the registry has been revealed, so the surprise holds.",
    );
  }
  const csv = giftsCsv(
    rows.map((r) => ({
      item: t2(r.itemName, "en"),
      type: typeLabel[r.itemType],
      guestName: r.guestName,
      email: r.guestEmail,
      qty: r.amount === null ? r.qty : null,
      amount: r.amount,
      status: statusLabel[r.status],
      message: r.message,
      address: r.address,
      showName: r.showName,
      createdAt: r.createdAt,
      thankedAt: r.thankedAt,
      thankNote: r.thankNote,
    })),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gifts-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
