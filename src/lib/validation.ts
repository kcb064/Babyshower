import { z } from "zod";
import { MAX_CONTRIBUTION, MIN_CONTRIBUTION } from "./claims";
import { parseSwishNumber } from "./swish";

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

/** Whole kronor typed by a guest: "300", "1 000", "1000 kr", "250,00". */
const kronor = z
  .string()
  .trim()
  .transform((v) =>
    v
      .replace(/[\s\u00a0]/g, "")
      .replace(/kr$/i, "")
      .replace(/[,.]00?$/, ""),
  )
  .pipe(z.string().regex(/^\d{1,7}$/, "amount"))
  .transform(Number)
  .pipe(z.number().int().min(MIN_CONTRIBUTION, "amount").max(MAX_CONTRIBUTION, "amount"));

export const contributionSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "name").max(80, "name"),
  email: z.string().trim().max(200, "email").pipe(z.email("email")),
  amount: kronor,
  message: optionalText(1000),
  showName: checkbox,
});
export type ContributionInput = z.infer<typeof contributionSchema>;

/** Optional Swish number: blank clears it; otherwise a Swedish 07x mobile or a 123 Swish number. */
export const swishNumberField = z
  .string()
  .max(40, "swish")
  .optional()
  .transform((v, ctx) => {
    const res = parseSwishNumber(v);
    if (!res.ok) {
      ctx.addIssue({ code: "custom", message: "swish" });
      return z.NEVER;
    }
    return res.value;
  });

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
  swishNumber: swishNumberField,
});

export const categorySchema = z.object({
  nameSv: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(60).default(""),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

const optionalKronor = z
  .string()
  .trim()
  .regex(/^\d{0,7}$/)
  .default("")
  .transform((v) => (v === "" ? null : Number(v)));

export const itemSchema = z
  .object({
    type: z.enum(["physical", "group", "fund"]).default("physical"),
    goalAmount: optionalKronor,
    nameSv: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().max(200).default(""),
    descriptionSv: z.string().trim().max(2000).default(""),
    descriptionEn: z.string().trim().max(2000).default(""),
    notesSv: z.string().trim().max(1000).default(""),
    notesEn: z.string().trim().max(1000).default(""),
    imageUrl: optionalUrl,
    storeUrl: optionalUrl,
    price: optionalKronor,
    qtyWanted: z.coerce.number().int().min(1).max(999),
    priority: z.enum(["must", "nice"]),
    categoryId: z
      .string()
      .regex(/^\d*$/)
      .transform((v) => (v === "" ? null : Number(v))),
    usedOk: checkbox,
    visible: checkbox,
    sortOrder: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .superRefine((d, ctx) => {
    // Group gifts default their goal to the price; funds need an explicit goal.
    const goal = d.goalAmount ?? (d.type === "group" ? d.price : null);
    if (d.type !== "physical" && (!goal || goal < 1)) ctx.addIssue({ code: "custom", path: ["goalAmount"], message: "goal" });
  });
export type ItemInput = z.infer<typeof itemSchema>;

/** Convert FormData to a plain object of strings (files skipped) for zod. */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
