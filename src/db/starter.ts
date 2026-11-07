import { eq, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

/** Swedish name of the default category (see DEFAULT_CATEGORIES in seed.ts). */
export type StarterCategory = "Sova" | "Mat" | "Bad" | "Kläder" | "Blöjor" | "Ute" | "Lek" | "Böcker" | "Hälsa";

export interface StarterItem {
  /** Stable key; never change it once shipped, it is how seeding stays idempotent. */
  key: string;
  category: StarterCategory;
  sv: string;
  en: string;
  noteSv: string;
  noteEn: string;
  /** Typical Swedish retail price in whole SEK. */
  price: number;
  qty: number;
  priority: "must" | "nice";
  usedOk: boolean;
}

const s = (
  key: string,
  category: StarterCategory,
  sv: string,
  en: string,
  noteSv: string,
  noteEn: string,
  price: number,
  qty = 1,
  priority: "must" | "nice" = "nice",
  usedOk = false,
): StarterItem => ({ key, category, sv, en, noteSv, noteEn, price, qty, priority, usedOk });

/**
 * Curated Swedish-market starter list. Seeded hidden on first run; editors toggle what to show
 * on /admin/starter. No store links: editors add one if they want.
 */
export const STARTER_ITEMS: StarterItem[] = [
  // Sova
  s("sleep-crib", "Sova", "Spjälsäng", "Cot", "Med ställbar botten.", "With adjustable base height.", 2000, 1, "must", true),
  s("sleep-mattress", "Sova", "Madrass till spjälsängen", "Cot mattress", "Ny madrass, 60 × 120 cm.", "New mattress, 60 × 120 cm.", 900, 1, "must"),
  s("sleep-bedside", "Sova", "Bedsidesäng", "Bedside crib", "Som kan stå tätt intill vår säng.", "One that sits right next to our bed.", 2500, 1, "nice", true),
  s("sleep-sheets", "Sova", "Lakan till spjälsäng", "Fitted cot sheets", "Formsydda, 60 × 120 cm.", "Fitted, 60 × 120 cm.", 150, 4, "must"),
  s("sleep-sleeping-bag", "Sova", "Sovpåse", "Baby sleeping bag", "Storlek 0–6 mån, 1–2,5 tog.", "Size 0–6 months, 1–2.5 tog.", 400, 2, "must", true),
  s("sleep-swaddle", "Sova", "Lindor", "Swaddle wraps", "Gärna i bomullsmuslin.", "Cotton muslin is great.", 250, 2),
  s("sleep-monitor", "Sova", "Babyvakt", "Baby monitor", "Ljud räcker, video är bonus.", "Audio is enough, video is a bonus.", 1200, 1, "nice"),
  s("sleep-nightlight", "Sova", "Nattlampa", "Night light", "Med dämpat, varmt ljus.", "Dimmable, warm light.", 300),
  s("sleep-blackout", "Sova", "Mörkläggningsgardin", "Blackout blind", "Portabel med sugkoppar.", "Portable with suction cups.", 350),

  // Mat
  s("feed-bottles", "Mat", "Nappflaskor", "Baby bottles", "Anti-kolik, 150 och 260 ml.", "Anti-colic, 150 and 260 ml.", 120, 4, "must"),
  s("feed-steriliser", "Mat", "Sterilisator", "Bottle steriliser", "Till mikrovågsugn eller elektrisk.", "Microwave or electric.", 600),
  s("feed-bibs", "Mat", "Haklappar", "Bibs", "Både små och med ärmar.", "Small ones and some with sleeves.", 60, 6, "nice", true),
  s("feed-burp-cloths", "Mat", "Spydukar i muslin", "Burp cloths", "Muslindukar går åt!", "We'll go through lots of muslins!", 50, 6, "must"),
  s("feed-nursing-pillow", "Mat", "Amningskudde", "Nursing pillow", "Med avtagbart överdrag.", "With a removable cover.", 450, 1, "nice", true),
  s("feed-pump", "Mat", "Bröstpump", "Breast pump", "Manuell räcker gott.", "A manual one is fine.", 900),
  s("feed-high-chair", "Mat", "Barnstol", "High chair", "Som växer med barnet.", "One that grows with the child.", 2200, 1, "nice", true),
  s("feed-bowls", "Mat", "Barnservis", "Baby tableware set", "Skål, tallrik och sked.", "Bowl, plate and spoon.", 250),

  // Bad
  s("bath-tub", "Bad", "Badbalja", "Baby bath", "Gärna med badstöd.", "Ideally with a bath support.", 300, 1, "must", true),
  s("bath-towels", "Bad", "Handdukar med luva", "Hooded towels", "Mjuk bomull eller bambu.", "Soft cotton or bamboo.", 200, 3),
  s("bath-washcloths", "Bad", "Tvättlappar", "Washcloths", "Små och mjuka.", "Small and soft.", 80, 2),
  s("bath-thermometer", "Bad", "Badtermometer", "Bath thermometer", "Enkel modell räcker.", "A simple one is fine.", 100),
  s("bath-hairbrush", "Bad", "Babyborste och kam", "Baby brush and comb", "Med mjuka borst.", "With soft bristles.", 120),
  s("bath-nail-scissors", "Bad", "Nagelsax för bebis", "Baby nail scissors", "Med rundade spetsar.", "With rounded tips.", 90),

  // Kläder
  s("clothes-bodies-50", "Kläder", "Bodys storlek 50/56", "Bodysuits size 50/56", "Kortärm och långärm, gärna ekologisk bomull.", "Short and long sleeves, organic cotton welcome.", 80, 6, "must", true),
  s("clothes-bodies-62", "Kläder", "Bodys storlek 62/68", "Bodysuits size 62/68", "Neutrala färger.", "Neutral colours.", 80, 6, "must", true),
  s("clothes-sleepsuits", "Kläder", "Pyjamas med fötter", "Footed sleepsuits", "Med dragkedja, storlek 56–62.", "With a zip, size 56–62.", 180, 4, "must", true),
  s("clothes-trousers", "Kläder", "Mjukisbyxor", "Soft trousers", "Storlek 56–68.", "Size 56–68.", 100, 4, "nice", true),
  s("clothes-hats", "Kläder", "Mössor", "Hats", "En tunn och en varm.", "One thin, one warm.", 100, 2, "nice", true),
  s("clothes-socks", "Kläder", "Strumpor och vantar", "Socks and mittens", "Små storlekar.", "Small sizes.", 60, 4, "nice", true),
  s("clothes-overall", "Kläder", "Åkpåse eller vinteroverall", "Winter snowsuit or footmuff", "Det blir vinterbebis!", "It's a winter baby!", 800, 1, "must", true),
  s("clothes-wool", "Kläder", "Ullset", "Merino wool set", "Body och byxor i merinoull.", "Merino bodysuit and leggings.", 450, 1, "nice", true),
  s("clothes-cardigan", "Kläder", "Stickad kofta", "Knitted cardigan", "Hemstickat är extra fint.", "Hand-knitted is extra lovely.", 300, 1, "nice", true),

  // Blöjor
  s("diaper-changing-pad", "Blöjor", "Skötbädd", "Changing mat", "Avtorkningsbar.", "Wipe-clean.", 350, 1, "must"),
  s("diaper-changing-table", "Blöjor", "Skötbord", "Changing table", "Som passar över badkaret är perfekt.", "One that fits over the bathtub is perfect.", 1500, 1, "nice", true),
  s("diaper-nappies", "Blöjor", "Blöjor storlek 1–2", "Nappies size 1–2", "Vilket märke som helst.", "Any brand.", 120, 6, "must"),
  s("diaper-wipes", "Blöjor", "Våtservetter", "Baby wipes", "Oparfymerade.", "Fragrance-free.", 40, 10, "nice"),
  s("diaper-cloth", "Blöjor", "Tygblöjor", "Cloth nappies", "Ett startpaket att prova med.", "A starter pack to try.", 700, 1, "nice", true),
  s("diaper-bin", "Blöjor", "Blöjhink", "Nappy bin", "Med lock som stänger lukten inne.", "With an odour-sealing lid.", 400),
  s("diaper-bag", "Blöjor", "Skötväska", "Changing bag", "Gärna som ryggsäck.", "A backpack style would be great.", 700, 1, "nice", true),

  // Ute
  s("out-stroller", "Ute", "Barnvagn", "Pram", "Med liggdel och sittdel.", "With bassinet and seat.", 7000, 1, "must", true),
  s("out-car-seat", "Ute", "Babyskydd", "Infant car seat", "Nytt, i-Size-godkänt.", "New, i-Size approved.", 2500, 1, "must"),
  s("out-carrier", "Ute", "Bärsele", "Baby carrier", "Ergonomisk, från nyfödd.", "Ergonomic, from newborn.", 1200, 1, "nice", true),
  s("out-wrap", "Ute", "Bärsjal", "Baby wrap", "Elastisk sjal.", "Stretchy wrap.", 500, 1, "nice", true),
  s("out-rain-cover", "Ute", "Regnskydd till vagnen", "Pram rain cover", "Passar de flesta vagnar.", "Fits most prams.", 250, 1, "nice", true),
  s("out-pram-blanket", "Ute", "Vagnsfilt", "Pram blanket", "Ull eller fleece.", "Wool or fleece.", 350, 1, "nice", true),

  // Lek
  s("play-gym", "Lek", "Babygym", "Play gym", "Med hängande leksaker.", "With hanging toys.", 700, 1, "nice", true),
  s("play-mat", "Lek", "Lekmatta", "Play mat", "Mjuk och tvättbar.", "Soft and washable.", 500, 1, "nice", true),
  s("play-rattle", "Lek", "Skallror och bitringar", "Rattles and teethers", "Naturgummi eller trä.", "Natural rubber or wood.", 120, 3, "nice", true),
  s("play-soft-toy", "Lek", "Gosedjur", "Soft toy", "Ett litet och mjukt.", "A small, soft one.", 200, 2, "nice", true),
  s("play-bouncer", "Lek", "Babysitter", "Baby bouncer", "Som går att vippa.", "One that rocks gently.", 1500, 1, "nice", true),
  s("play-mobile", "Lek", "Mobil över sängen", "Cot mobile", "Gärna i dova färger.", "Muted colours, please.", 400, 1, "nice", true),

  // Böcker
  s("books-board", "Böcker", "Pekböcker", "Board books", "Svenska klassiker är toppen.", "Swedish classics are perfect.", 120, 5, "nice", true),
  s("books-contrast", "Böcker", "Kontrastbok", "High-contrast book", "Svartvita bilder för de minsta.", "Black and white pictures for newborns.", 150, 1, "nice", true),
  s("books-lullabies", "Böcker", "Visbok", "Book of lullabies", "Med noter och texter.", "With music and lyrics.", 250, 1, "nice", true),
  s("books-baby-journal", "Böcker", "Barnets bok", "Baby memory book", "Att fylla i under första året.", "To fill in during the first year.", 300),

  // Hälsa
  s("health-thermometer", "Hälsa", "Febertermometer", "Thermometer", "Digital, snabb.", "Digital, quick.", 150, 1, "must"),
  s("health-nasal", "Hälsa", "Nässug", "Nasal aspirator", "Till förkylningsperioden.", "For cold season.", 120),
  s("health-first-aid", "Hälsa", "Första hjälpen-kit för bebis", "Baby first-aid kit", "Plåster, koksalt, sax.", "Plasters, saline, scissors.", 250),
  s("health-humidifier", "Hälsa", "Luftfuktare", "Humidifier", "Bra under vintern.", "Handy in winter.", 600),
  s("health-pacifiers", "Hälsa", "Nappar", "Dummies", "Storlek 0–6 mån.", "Size 0–6 months.", 80, 2),
];

/**
 * Insert the starter list hidden (`visible=false, seeded=true`) the first time the app starts.
 * Idempotent: a flag on the registry row stops it from re-adding suggestions the editors deleted,
 * and the unique `starter_key` stops duplicates even if the flag were reset.
 */
export function seedStarter(db: DB, now: Date = new Date()): number {
  return db.transaction((tx) => {
    const reg = tx
      .select({ starterSeededAt: schema.registry.starterSeededAt })
      .from(schema.registry)
      .where(eq(schema.registry.id, 1))
      .get();
    if (!reg || reg.starterSeededAt) return 0;
    const cats = tx.select().from(schema.category).all();
    const catId = new Map(cats.map((c) => [c.name.sv, c.id]));
    const existing = new Set(
      tx
        .select({ key: schema.item.starterKey })
        .from(schema.item)
        .where(isNotNull(schema.item.starterKey))
        .all()
        .map((r) => r.key),
    );
    const maxSort = tx.select({ sortOrder: schema.item.sortOrder }).from(schema.item).all().reduce((m, r) => Math.max(m, r.sortOrder), 0);
    const rows = STARTER_ITEMS.filter((it) => !existing.has(it.key)).map((it, i) => ({
      type: "physical" as const,
      name: { sv: it.sv, en: it.en },
      notes: { sv: it.noteSv, en: it.noteEn },
      price: it.price,
      qtyWanted: it.qty,
      priority: it.priority,
      usedOk: it.usedOk,
      categoryId: catId.get(it.category) ?? null,
      sortOrder: maxSort + (i + 1) * 10,
      visible: false,
      seeded: true,
      starterKey: it.key,
      createdAt: now,
    }));
    if (rows.length) tx.insert(schema.item).values(rows).run();
    tx.update(schema.registry).set({ starterSeededAt: now }).where(eq(schema.registry.id, 1)).run();
    return rows.length;
  });
}

