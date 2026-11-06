import { NextResponse, type NextRequest } from "next/server";
import { EDITOR_COOKIE, cookieSecretFromEnv } from "@/lib/auth-constants";
import { verifyToken } from "@/lib/signing";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/sign-in" || pathname.startsWith("/admin/sign-in/")) return NextResponse.next();
  const secret = cookieSecretFromEnv({ COOKIE_SECRET: process.env.COOKIE_SECRET, NODE_ENV: process.env.NODE_ENV });
  const payload = secret ? await verifyToken(req.cookies.get(EDITOR_COOKIE)?.value, secret) : null;
  if (!payload || payload.kind !== "editor" || !payload.name) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
