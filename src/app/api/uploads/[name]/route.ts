import fs from "node:fs/promises";
import path from "node:path";
import { serverEnv } from "@/lib/env";
import { EXT_TYPES, isSafeUploadName } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isSafeUploadName(name)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(serverEnv().uploadsDir, name));
    const ext = name.split(".").pop() ?? "";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": EXT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
