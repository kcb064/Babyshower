import { describe, expect, it } from "vitest";
import { httpsFromHeaders } from "@/lib/cookies";

const h = (map: Record<string, string>) => (name: string) => map[name.toLowerCase()] ?? null;

describe("Secure cookie flag follows the request protocol", () => {
  it("is off for a direct plain-http visit (no proxy headers)", () => {
    expect(httpsFromHeaders(h({}))).toBe(false);
    expect(httpsFromHeaders(h({ host: "192.168.1.10:3050" }))).toBe(false);
  });
  it("is on behind Cloudflare Tunnel (X-Forwarded-Proto: https)", () => {
    expect(httpsFromHeaders(h({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(httpsFromHeaders(h({ "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(httpsFromHeaders(h({ "x-forwarded-proto": "HTTPS" }))).toBe(true);
  });
  it("is off when a proxy says http", () => {
    expect(httpsFromHeaders(h({ "x-forwarded-proto": "http" }))).toBe(false);
  });
  it("accepts Cloudflare's cf-visitor header as a fallback", () => {
    expect(httpsFromHeaders(h({ "cf-visitor": '{"scheme":"https"}' }))).toBe(true);
    expect(httpsFromHeaders(h({ "cf-visitor": '{"scheme":"http"}' }))).toBe(false);
  });
});
