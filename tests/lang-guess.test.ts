import { describe, expect, it } from "vitest";
import { guessTextLang } from "@/lib/lang-guess";

describe("guessTextLang", () => {
  it("recognises Swedish product text", () => {
    expect(guessTextLang("Mjuk och skön babynest i ekologisk bomull. Passar från födseln.")).toBe("sv");
    expect(guessTextLang("En mysig babynest för de första månaderna.")).toBe("sv");
    expect(guessTextLang("Kombivagn med liggdel och sittdel, tillverkad i Sverige")).toBe("sv");
  });

  it("recognises English product text", () => {
    expect(guessTextLang("A soft and cosy baby nest made of organic cotton. Fits from birth.")).toBe("en");
    expect(guessTextLang("The perfect gift for the first months")).toBe("en");
  });

  it("is undecided on brand names, numbers and mixed text", () => {
    expect(guessTextLang("BabyBjörn Bouncer Bliss")).toBeNull();
    expect(guessTextLang("Stokke Tripp Trapp")).toBeNull();
    expect(guessTextLang("Bodys 5-pack")).toBeNull();
    expect(guessTextLang("")).toBeNull();
    expect(guessTextLang(null)).toBeNull();
    expect(guessTextLang("1295 kr")).toBeNull();
  });
});
