import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v) || v.startsWith("/api/uploads/"), { message: "url" })
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** HTML checkbox: present as "on" when ticked, absent otherwise. */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export const claimSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "name").max(80, "name"),
  email: z.string().trim().max(200, "email").pipe(z.email("email")),
  qty: z.coerce.number().int("qty").min(1, "qty").max(99, "qty"),
  message: optionalText(1000),
  showName: checkbox,
  address: optionalText(500),
  purchased: checkbox,
});
export type ClaimInput = z.infer<typeof claimSchema>;

export const registrySchema = z.object({
  titleSv: z.string().trim().min(1).max(120),
  titleEn: z.string().trim().max(120).default(""),
  welcomeSv: z.string().trim().max(3000).default(""),
  welcomeEn: z.string().trim().max(3000).default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventTime: z
    .string()
    .regex(/^(\d{2}:\d{2})?$/)
    .transform((v) => v || null),
  location: optionalText(300),
  mapUrl: optionalUrl,
  hostContact: optionalText(300),
  swishNumber: optionalText(30),
});

export const categorySchema = z.object({
  nameSv: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(60).default(""),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

export const itemSchema = z.object({
  nameSv: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).default(""),
  descriptionSv: z.string().trim().max(2000).default(""),
  descriptionEn: z.string().trim().max(2000).default(""),
  notesSv: z.string().trim().max(1000).default(""),
  notesEn: z.string().trim().max(1000).default(""),
  imageUrl: optionalUrl,
  storeUrl: optionalUrl,
  price: z
    .string()
    .trim()
    .regex(/^\d{0,7}$/)
    .transform((v) => (v === "" ? null : Number(v))),
  qtyWanted: z.coerce.number().int().min(1).max(999),
  priority: z.enum(["must", "nice"]),
  categoryId: z
    .string()
    .regex(/^\d*$/)
    .transform((v) => (v === "" ? null : Number(v))),
  usedOk: checkbox,
  visible: checkbox,
  sortOrder: z.coerce.number().int().min(0).max(1000000).default(0),
});

/** Convert FormData to a plain object of strings (files skipped) for zod. */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
