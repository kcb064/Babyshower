import { afterEach, describe, expect, it, vi } from "vitest";
import { ntfyMessage, sendNtfy } from "@/lib/ntfy";

describe("ntfy message", () => {
  it("never includes the guest name in surprise mode", () => {
    const msg = ntfyMessage({ event: "claim", itemName: "Babynest", claimed: 1, total: 1, guestName: "Anna", revealed: false });
    expect(msg).toBe("New reservation: Babynest (1 of 1)");
    expect(msg).not.toContain("Anna");
  });
  it("labels purchases and releases", () => {
    expect(ntfyMessage({ event: "purchased", itemName: "Bodys", claimed: 2, total: 4, revealed: false })).toBe(
      "Marked as purchased: Bodys (2 of 4)",
    );
    expect(ntfyMessage({ event: "released", itemName: "Bodys", claimed: 1, total: 4, revealed: false })).toBe(
      "Reservation released: Bodys (1 of 4)",
    );
  });
  it("may include the name after reveal", () => {
    expect(ntfyMessage({ event: "claim", itemName: "Babynest", claimed: 1, total: 1, guestName: "Anna", revealed: true })).toContain("Anna");
  });
});

describe("sendNtfy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing without a topic", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    sendNtfy("hej", undefined);
    sendNtfy("hej", "");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the topic and swallows failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => sendNtfy("New reservation: Babynest (1 of 1)", "secret-topic")).not.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.sh/secret-topic",
      expect.objectContaining({ method: "POST", body: "New reservation: Babynest (1 of 1)", signal: expect.any(AbortSignal) }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
