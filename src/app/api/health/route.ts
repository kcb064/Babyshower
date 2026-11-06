import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().get(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (err) {
    console.error("health check failed", err);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
