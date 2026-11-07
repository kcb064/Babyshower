// Server-side translation between Swedish and English for the admin "Auto-translate" button.
// Never import this from a client component: it reads API keys from the environment.
import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "mymemory" | "none";
export type Lang = "sv" | "en";
export type TranslateErrorCode = "no_provider" | "provider_error" | "too_long" | "rate_limited";
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class TranslateError extends Error {
  constructor(
    readonly code: TranslateErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TranslateError";
  }
}

/** Cheapest current Haiku: translation is a simple, short task. */
export const ANTHROPIC_MODEL = "claude-haiku-5-5";
export const TIMEOUT_MS = 10_000;
/** MyMemory's anonymous API accepts at most 500 characters per request. */
export const MYMEMORY_MAX_CHARS = 500;
/** Longest single text we accept from any provider (largest admin field is 2000). */
export const MAX_TEXT_CHARS = 5000;
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

export const SYSTEM_PROMPT = [
  "You translate text for a baby-shower gift registry between Swedish and English.",
  "The user message contains numbered segments. Translate each numbered segment into the requested target language.",
  "Keep product names, brand names and model numbers as they are.",
  "Keep placeholders (such as {name}, %s or URLs) and line breaks exactly as they appear.",
  "Return ONLY a JSON array of strings, one translated string per segment, in the same order as the segments.",
  "Do not add commentary, numbering, code fences or any other text.",
].join(" ");

/**
 * Anthropic when ANTHROPIC_API_KEY is set, otherwise the free MyMemory API.
 * TRANSLATE_PROVIDER=none turns the feature off; =mymemory forces MyMemory even with a key;
 * =anthropic only takes effect when a key is present.
 */
export function resolveProvider(env: Record<string, string | undefined> = process.env): Provider {
  const forced = env.TRANSLATE_PROVIDER?.trim().toLowerCase();
  if (forced === "none") return "none";
  if (forced === "mymemory") return "mymemory";
  if (env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  return "mymemory";
}

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim() !== "";

export interface PlannedTranslation {
  key: string;
  from: Lang;
  to: Lang;
  source: string;
}

/** For each pair with exactly one side filled, translate that side into the blank one. Never overwrites. */
export function planTranslation(pairs: { key: string; en: string; sv: string }[]): PlannedTranslation[] {
  const out: PlannedTranslation[] = [];
  for (const p of pairs) {
    const en = filled(p.en);
    const sv = filled(p.sv);
    if (en === sv) continue; // both filled or neither filled
    out.push(en ? { key: p.key, from: "en", to: "sv", source: p.en.trim() } : { key: p.key, from: "sv", to: "en", source: p.sv.trim() });
  }
  return out;
}

export interface TranslateOptions {
  provider: Provider;
  apiKey?: string;
  fetch?: FetchLike;
  /** Test-only: return "[sv] text" / "[en] text" without any network call. */
  fake?: boolean;
}

const LANG_NAME: Record<Lang, string> = { sv: "Swedish", en: "English" };

export async function translateTexts(texts: string[], from: Lang, to: Lang, opts: TranslateOptions): Promise<string[]> {
  if (opts.provider === "none") throw new TranslateError("no_provider");
  if (texts.length === 0) return [];
  if (from === to) return [...texts];
  if (texts.some((t) => t.length > MAX_TEXT_CHARS)) throw new TranslateError("too_long", `Text longer than ${MAX_TEXT_CHARS} characters`);
  if (opts.fake ?? process.env.TRANSLATE_FAKE === "1") return texts.map((t) => `[${to}] ${t}`);
  if (opts.provider === "anthropic") return translateAnthropic(texts, from, to, opts);
  return translateMyMemory(texts, from, to, opts);
}

/* ---------- Anthropic ---------- */

async function translateAnthropic(texts: string[], from: Lang, to: Lang, opts: TranslateOptions): Promise<string[]> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) throw new TranslateError("no_provider", "ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  const segments = texts.map((t, i) => `<segment n="${i + 1}">\n${t}\n</segment>`).join("\n");
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Translate these ${texts.length} segment(s) from ${LANG_NAME[from]} to ${LANG_NAME[to]}.\n\n${segments}`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new TranslateError("rate_limited", err.message);
    if (err instanceof Anthropic.APIError) throw new TranslateError("provider_error", err.message);
    throw new TranslateError("provider_error", err instanceof Error ? err.message : String(err));
  }
  if (response.stop_reason !== "end_turn") {
    throw new TranslateError("provider_error", `Unexpected stop reason: ${response.stop_reason}`);
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return parseTranslationArray(text, texts.length);
}

/** Strictly parse the model's reply: a JSON array of exactly `expected` strings. */
export function parseTranslationArray(text: string, expected: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TranslateError("provider_error", "Reply was not valid JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === "string")) {
    throw new TranslateError("provider_error", "Reply was not a JSON array of strings");
  }
  if (parsed.length !== expected) {
    throw new TranslateError("provider_error", `Expected ${expected} translations, got ${parsed.length}`);
  }
  return parsed as string[];
}

/* ---------- MyMemory ---------- */

/**
 * Split a text into chunks of at most `max` characters on sentence or line boundaries.
 * Each chunk keeps its trailing whitespace separately so the text can be rejoined unchanged.
 * Throws too_long when a single sentence is longer than `max`.
 */
export function splitForMyMemory(text: string, max = MYMEMORY_MAX_CHARS): { body: string; tail: string }[] {
  if (text.length <= max) return [{ body: text, tail: "" }];
  const sentences = text.match(/[^.!?…\n]*(?:[.!?…]+|\n|$)\s*/g)?.filter((s) => s !== "") ?? [text];
  const chunks: { body: string; tail: string }[] = [];
  let current = "";
  for (const s of sentences) {
    if (s.trimEnd().length > max) throw new TranslateError("too_long", `A sentence is longer than ${max} characters`);
    if ((current + s).trimEnd().length > max) {
      chunks.push(splitTail(current));
      current = s;
    } else {
      current += s;
    }
  }
  if (current) chunks.push(splitTail(current));
  return chunks;
}

function splitTail(s: string): { body: string; tail: string } {
  const body = s.trimEnd();
  return { body, tail: s.slice(body.length) };
}

async function translateMyMemory(texts: string[], from: Lang, to: Lang, opts: TranslateOptions): Promise<string[]> {
  const doFetch: FetchLike = opts.fetch ?? fetch;
  // Split everything first so an over-long text fails before any request is sent.
  const plans = texts.map((t) => splitForMyMemory(t));
  const out: string[] = [];
  for (const chunks of plans) {
    let result = "";
    for (const c of chunks) {
      result += (c.body.trim() ? await myMemoryOne(doFetch, c.body, from, to) : c.body) + c.tail;
    }
    out.push(result);
  }
  return out;
}

async function myMemoryOne(doFetch: FetchLike, text: string, from: Lang, to: Lang): Promise<string> {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  } catch (err) {
    throw new TranslateError("provider_error", err instanceof Error ? err.message : String(err));
  }
  if (res.status === 429) throw new TranslateError("rate_limited", "MyMemory rate limit");
  if (!res.ok) throw new TranslateError("provider_error", `MyMemory HTTP ${res.status}`);
  let body: { responseStatus?: unknown; responseData?: { translatedText?: unknown } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new TranslateError("provider_error", "MyMemory reply was not JSON");
  }
  const status = Number(body.responseStatus);
  const translated = body.responseData?.translatedText;
  if (status === 429 || (typeof translated === "string" && /MYMEMORY WARNING/i.test(translated))) {
    throw new TranslateError("rate_limited", "MyMemory daily limit reached");
  }
  if (status !== 200) throw new TranslateError("provider_error", `MyMemory status ${String(body.responseStatus)}`);
  if (typeof translated !== "string" || translated.trim() === "") {
    throw new TranslateError("provider_error", "MyMemory returned no translation");
  }
  return translated;
}
