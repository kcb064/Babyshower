import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MODEL,
  looksUntranslated,
  parseTranslationArray,
  planTranslation,
  resolveProvider,
  splitForMyMemory,
  translateTexts,
  TranslateError,
  type FetchLike,
} from "@/lib/translate";

afterEach(() => {
  vi.unstubAllEnvs();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function anthropicReply(text: string, stop_reason = "end_turn") {
  return json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: ANTHROPIC_MODEL,
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(TranslateError);
    return (err as TranslateError).code;
  }
  throw new Error("expected a TranslateError");
}

describe("planTranslation", () => {
  it("picks the direction from the filled side", () => {
    expect(
      planTranslation([
        { key: "name", en: "Baby nest", sv: "" },
        { key: "welcome", en: "  ", sv: " Välkommen! " },
      ]),
    ).toEqual([
      { key: "name", from: "en", to: "sv", source: "Baby nest" },
      { key: "welcome", from: "sv", to: "en", source: "Välkommen!" },
    ]);
  });

  it("skips pairs where both or neither side is filled", () => {
    expect(
      planTranslation([
        { key: "both", en: "Sleep", sv: "Sova" },
        { key: "neither", en: "", sv: "   " },
      ]),
    ).toEqual([]);
  });
});

describe("resolveProvider", () => {
  it("prefers anthropic when a key is set", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-test" })).toBe("anthropic");
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-test", TRANSLATE_PROVIDER: "" })).toBe("anthropic");
  });
  it("falls back to mymemory without a key", () => {
    expect(resolveProvider({})).toBe("mymemory");
    expect(resolveProvider({ ANTHROPIC_API_KEY: "  " })).toBe("mymemory");
    expect(resolveProvider({ TRANSLATE_PROVIDER: "anthropic" })).toBe("mymemory");
  });
  it("TRANSLATE_PROVIDER can force mymemory or none", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-test", TRANSLATE_PROVIDER: "mymemory" })).toBe("mymemory");
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-test", TRANSLATE_PROVIDER: "none" })).toBe("none");
    expect(resolveProvider({ TRANSLATE_PROVIDER: "NONE" })).toBe("none");
  });
});

describe("translateTexts: general", () => {
  it("rejects provider none", async () => {
    expect(await codeOf(translateTexts(["Hej"], "sv", "en", { provider: "none" }))).toBe("no_provider");
  });
  it("fake mode returns tagged text without network", async () => {
    const fetch = vi.fn<FetchLike>();
    expect(await translateTexts(["Baby nest"], "en", "sv", { provider: "mymemory", fetch, fake: true })).toEqual([
      "[sv] Baby nest",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects texts over the overall cap", async () => {
    const fetch = vi.fn<FetchLike>();
    expect(await codeOf(translateTexts(["a".repeat(5001)], "en", "sv", { provider: "anthropic", apiKey: "k", fetch }))).toBe(
      "too_long",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("translateTexts: anthropic", () => {
  it("sends one request with the model and all texts, and parses the JSON array", async () => {
    const fetch = vi.fn<FetchLike>(async () => anthropicReply('["Babybo", "Sova gott"]'));
    const out = await translateTexts(["Baby nest", "Sleep well"], "en", "sv", { provider: "anthropic", apiKey: "sk-test", fetch, fake: false });
    expect(out).toEqual(["Babybo", "Sova gott"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers(init?.headers);
    // The SDK sends the key either as x-api-key or as a bearer token depending on version.
    expect(`${headers.get("x-api-key")} ${headers.get("authorization")}`).toContain("sk-test");
    expect(headers.get("anthropic-version")).toBeTruthy();
    expect(headers.get("x-stainless-timeout")).toBe("10");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.system).toMatch(/JSON array/);
    expect(body.system).toMatch(/Swedish and English/);
    const content = body.messages[0].content as string;
    expect(content).toContain("Baby nest");
    expect(content).toContain("Sleep well");
    expect(content).toContain("English to Swedish");
  });

  it("fails on a short array", async () => {
    const fetch = vi.fn<FetchLike>(async () => anthropicReply('["Babybo"]'));
    expect(await codeOf(translateTexts(["a", "b"], "en", "sv", { provider: "anthropic", apiKey: "k", fetch, fake: false }))).toBe(
      "provider_error",
    );
  });

  it("fails on malformed JSON or commentary", async () => {
    const fetch = vi.fn<FetchLike>(async () => anthropicReply('Here you go: ["Babybo"]'));
    expect(await codeOf(translateTexts(["a"], "en", "sv", { provider: "anthropic", apiKey: "k", fetch, fake: false }))).toBe(
      "provider_error",
    );
  });

  it("maps 429 to rate_limited and other HTTP errors to provider_error", async () => {
    const err = (status: number) =>
      json({ type: "error", error: { type: status === 429 ? "rate_limit_error" : "api_error", message: "x" } }, status);
    const f429 = vi.fn<FetchLike>(async () => err(429));
    expect(await codeOf(translateTexts(["a"], "en", "sv", { provider: "anthropic", apiKey: "k", fetch: f429, fake: false }))).toBe(
      "rate_limited",
    );
    expect(f429).toHaveBeenCalledTimes(1); // no retries
    const f500 = vi.fn<FetchLike>(async () => err(500));
    expect(await codeOf(translateTexts(["a"], "en", "sv", { provider: "anthropic", apiKey: "k", fetch: f500, fake: false }))).toBe(
      "provider_error",
    );
  });

  it("requires an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await codeOf(translateTexts(["a"], "en", "sv", { provider: "anthropic", fake: false }))).toBe("no_provider");
  });

  it("parseTranslationArray rejects non-string items", () => {
    expect(() => parseTranslationArray("[1, 2]", 2)).toThrow(TranslateError);
    expect(parseTranslationArray('["a","b"]', 2)).toEqual(["a", "b"]);
  });
});

describe("translateTexts: mymemory", () => {
  it("calls the API once per text with the right langpair, in order", async () => {
    const fetch = vi.fn<FetchLike>(async (url) => {
      const q = new URL(String(url)).searchParams.get("q");
      return json({ responseStatus: 200, responseData: { translatedText: `T(${q})` } });
    });
    const out = await translateTexts(["Hej", "Sova"], "sv", "en", { provider: "mymemory", fetch, fake: false });
    expect(out).toEqual(["T(Hej)", "T(Sova)"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.mymemory.translated.net/get");
    expect(url.searchParams.get("langpair")).toBe("sv|en");
    expect(url.searchParams.get("q")).toBe("Hej");
  });

  it("treats responseStatus !== 200 as an error", async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ responseStatus: 403, responseData: { translatedText: "INVALID LANGUAGE PAIR" } }));
    expect(await codeOf(translateTexts(["Hej"], "sv", "en", { provider: "mymemory", fetch, fake: false }))).toBe("provider_error");
  });

  it("maps quota errors to rate_limited", async () => {
    const f1 = vi.fn<FetchLike>(async () => json({ responseStatus: 429, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } }));
    expect(await codeOf(translateTexts(["Hej"], "sv", "en", { provider: "mymemory", fetch: f1, fake: false }))).toBe("rate_limited");
    const f2 = vi.fn<FetchLike>(async () => new Response("slow down", { status: 429 }));
    expect(await codeOf(translateTexts(["Hej"], "sv", "en", { provider: "mymemory", fetch: f2, fake: false }))).toBe("rate_limited");
  });

  it("splits long texts on sentence boundaries and rejoins them", async () => {
    const sentence = `${"word ".repeat(40).trim()}.`; // ~200 chars
    const text = `${sentence} ${sentence} ${sentence}`;
    const fetch = vi.fn<FetchLike>(async (url) => {
      const q = new URL(String(url)).searchParams.get("q") ?? "";
      expect(q.length).toBeLessThanOrEqual(500);
      return json({ responseStatus: 200, responseData: { translatedText: "X." } });
    });
    const out = await translateTexts([text], "en", "sv", { provider: "mymemory", fetch, fake: false });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out).toEqual(["X. X."]);
  });

  it("rejects a single sentence longer than 500 characters before any request", async () => {
    const fetch = vi.fn<FetchLike>();
    expect(await codeOf(translateTexts(["a".repeat(600)], "en", "sv", { provider: "mymemory", fetch, fake: false }))).toBe("too_long");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("splitForMyMemory keeps short texts whole and preserves separators", () => {
    expect(splitForMyMemory("Hej. Då.")).toEqual([{ body: "Hej. Då.", tail: "" }]);
    const parts = splitForMyMemory("Aa.\nBb. Cc.", 5);
    expect(parts.map((p) => p.body + p.tail).join("")).toBe("Aa.\nBb. Cc.");
    expect(parts.every((p) => p.body.length <= 5)).toBe(true);
  });
});

describe("looksUntranslated", () => {
  it("flags a Swedish description echoed back as English", () => {
    const sv = "Mjuk och skön babynest i ekologisk bomull. Passar från födseln.";
    expect(looksUntranslated(sv, sv, "sv")).toBe(true);
    expect(looksUntranslated(sv, sv.toUpperCase(), "sv")).toBe(true);
    expect(looksUntranslated(sv, "A soft and cosy baby nest in organic cotton. Fits from birth.", "sv")).toBe(false);
  });

  it("flags long prose with no clear language, but lets brand names through", () => {
    expect(looksUntranslated("Stokke Tripp Trapp", "Stokke Tripp Trapp", "sv")).toBe(false);
    expect(looksUntranslated("BabyBjörn Bouncer Bliss", "BabyBjörn Bouncer Bliss", "en")).toBe(false);
    expect(looksUntranslated("Alpha beta gamma delta epsilon zeta", "Alpha beta gamma delta epsilon zeta", "sv")).toBe(true);
    expect(looksUntranslated("Baby nest", "", "en")).toBe(false); // blank results are handled by the caller
  });
});
