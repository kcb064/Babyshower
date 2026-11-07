import { describe, expect, it } from "vitest";
import { imageCacheKey, isImageContentType, proxiedImageSrc, validateImageUrl } from "@/lib/imgproxy";

describe("validateImageUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateImageUrl("https://cdn.example.se/a.jpg")).toBe("https://cdn.example.se/a.jpg");
    expect(validateImageUrl("http://img.example.com/b.png?x=1")).toBe("http://img.example.com/b.png?x=1");
  });
  it("rejects other schemes, internal hosts and junk", () => {
    for (const bad of [
      null,
      "",
      "ftp://example.com/a.jpg",
      "file:///etc/passwd",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "http://localhost/a.jpg",
      "http://127.0.0.1/a.jpg",
      "http://192.168.1.10/a.jpg",
      "http://user:pw@example.com/a.jpg",
      "/api/uploads/x.jpg",
      "not a url",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect(validateImageUrl(bad)).toBeNull();
    }
  });
});

describe("imageCacheKey", () => {
  it("is a stable sha256 hex", () => {
    const k = imageCacheKey("https://cdn.example.se/a.jpg");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(imageCacheKey("https://cdn.example.se/a.jpg")).toBe(k);
    expect(imageCacheKey("https://cdn.example.se/b.jpg")).not.toBe(k);
  });
});

describe("isImageContentType", () => {
  it("passes image/* only, not SVG", () => {
    expect(isImageContentType("image/jpeg")).toBe(true);
    expect(isImageContentType("image/webp; charset=binary")).toBe(true);
    expect(isImageContentType("IMAGE/PNG")).toBe(true);
    expect(isImageContentType("image/svg+xml")).toBe(false);
    expect(isImageContentType("text/html")).toBe(false);
    expect(isImageContentType(null)).toBe(false);
  });
});

describe("proxiedImageSrc", () => {
  it("routes external images through /api/img and leaves uploads alone", () => {
    expect(proxiedImageSrc("https://cdn.example.se/a b.jpg")).toBe("/api/img?u=https%3A%2F%2Fcdn.example.se%2Fa%20b.jpg");
    expect(proxiedImageSrc("/api/uploads/0f8fad5b-d9cb-469f-a165-70867728950e.jpg")).toBe(
      "/api/uploads/0f8fad5b-d9cb-469f-a165-70867728950e.jpg",
    );
    expect(proxiedImageSrc(null)).toBeNull();
  });
});
