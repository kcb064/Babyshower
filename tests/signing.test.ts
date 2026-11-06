import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "@/lib/signing";
import { RateLimiter } from "@/lib/rate-limit";

const SECRET = "test-secret";

describe("signed cookies", () => {
  it("round-trips a payload", async () => {
    const token = await signToken({ kind: "editor", name: "Mira" }, SECRET, 60);
    const p = await verifyToken(token, SECRET);
    expect(p).toMatchObject({ kind: "editor", name: "Mira" });
    expect(typeof p?.exp).toBe("number");
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken({ kind: "editor", name: "Mira" }, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ kind: "editor", name: "Eve" })).toString("base64url");
    expect(await verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a tampered signature and the wrong secret", async () => {
    const token = await signToken({ a: 1 }, SECRET);
    expect(await verifyToken(token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA"), SECRET)).toBeNull();
    expect(await verifyToken(token, "other-secret")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const issued = Date.now() - 100_000;
    const token = await signToken({ a: 1 }, SECRET, 10, issued);
    expect(await verifyToken(token, SECRET)).toBeNull();
    expect(await verifyToken(token, SECRET, issued + 5_000)).not.toBeNull();
  });

  it("rejects garbage", async () => {
    for (const bad of [undefined, "", "abc", "a.b.c", "!!!.???"]) expect(await verifyToken(bad, SECRET)).toBeNull();
  });

  it("issues 90-day editor tokens", async () => {
    const now = Date.now();
    const token = await signToken({ kind: "editor" }, SECRET, 90 * 24 * 3600, now);
    expect(await verifyToken(token, SECRET, now + 89 * 24 * 3600 * 1000)).not.toBeNull();
    expect(await verifyToken(token, SECRET, now + 91 * 24 * 3600 * 1000)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows 10 attempts per 15 minutes per key", () => {
    const rl = new RateLimiter(10, 15 * 60 * 1000);
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(rl.attempt("1.2.3.4", t0 + i)).toBe(true);
    expect(rl.attempt("1.2.3.4", t0 + 20)).toBe(false);
    expect(rl.attempt("5.6.7.8", t0 + 20)).toBe(true);
    expect(rl.attempt("1.2.3.4", t0 + 15 * 60 * 1000 + 10)).toBe(true);
  });
});
