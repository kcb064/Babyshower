import { NextResponse, type NextRequest } from "next/server";
import { baseUrl, readGuestLinkToken, setGuestCookie } from "@/lib/guest";

/** Durable "my claims" link: restores the guest cookie on a new device, then shows the list. */
export async function GET(req: NextRequest) {
  const guest = await readGuestLinkToken(req.nextUrl.searchParams.get("t"));
  if (guest) await setGuestCookie(guest);
  // Not req.nextUrl: in the standalone server its origin is the bind address (https://0.0.0.0:3000
  // in Docker), not the address the guest used. baseUrl() is PUBLIC_URL or the forwarded host.
  return NextResponse.redirect(`${await baseUrl()}/my-claims${guest ? "" : "?invalid=1"}`, 303);
}
