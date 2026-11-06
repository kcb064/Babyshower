import { NextResponse, type NextRequest } from "next/server";
import { readGuestLinkToken, setGuestCookie } from "@/lib/guest";

/** Durable "my claims" link: restores the guest cookie on a new device, then shows the list. */
export async function GET(req: NextRequest) {
  const guest = await readGuestLinkToken(req.nextUrl.searchParams.get("t"));
  const target = req.nextUrl.clone();
  target.pathname = "/my-claims";
  target.search = guest ? "" : "?invalid=1";
  if (guest) await setGuestCookie(guest);
  return NextResponse.redirect(target, 303);
}
