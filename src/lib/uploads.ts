import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const EXT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]),
);

/** Only names we generated ourselves: uuid + known extension. Prevents path traversal. */
export function isSafeUploadName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(name);
}

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

/** Save an uploaded image under uploadsDir and return its public URL, or null if rejected. */
export async function saveImageUpload(file: File, uploadsDir: string): Promise<string | null> {
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return null;
  const name = `${randomUUID()}.${IMAGE_TYPES[type]}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, name), bytes);
  return `/api/uploads/${name}`;
}
