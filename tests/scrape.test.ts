import { describe, expect, it } from "vitest";
import { decodeEntities, detectLang, isFetchableUrl, parsePrice, parseProductHtml } from "@/lib/scrape";

const OG_HTML = `<!doctype html><html><head>
<title>Fallback title | Shop</title>
<meta property="og:title" content="Babynest Dreamy &amp; Soft">
<meta property="og:image" content="/images/nest.jpg" />
<meta property="product:price:amount" content="1295.00">
<meta property="product:price:currency" content="SEK">
<meta name="description" content="En mysig babynest.">
</head><body></body></html>`;

const JSONLD_HTML = `<html><head>
<meta property="og:title" content="OG title should lose">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"BreadcrumbList","itemListElement":[]},
  {"@type":["Product","Thing"],"name":"Barnvagn Duo","image":["https://cdn.example.se/duo.jpg","https://cdn.example.se/duo2.jpg"],
   "description":"Kombivagn","offers":{"@type":"AggregateOffer","lowPrice":"7 995,00","priceCurrency":"SEK"}}
]}</script>
<script type="application/ld+json">{ not valid json </script>
</head></html>`;

const MICRODATA_HTML = `<html><head><title>  Skötväska
  Classic </title></head><body>
<div itemscope itemtype="https://schema.org/Product">
<span itemprop="price" content="649">649 kr</span>
</div></body></html>`;

const OFFERS_ARRAY_HTML = `<script type='application/ld+json'>
[{"@type":"Product","name":"Bodys 5-pack","image":{"@type":"ImageObject","url":"https://img.example.com/body.png"},
"offers":[{"@type":"Offer","price":299,"priceCurrency":"SEK"}]}]
</script>`;

describe("parseProductHtml", () => {
  it("reads Open Graph tags and resolves relative images", () => {
    const p = parseProductHtml(OG_HTML, "https://shop.example.se/p/123");
    expect(p).toEqual({
      title: "Babynest Dreamy & Soft",
      imageUrl: "https://shop.example.se/images/nest.jpg",
      price: 1295,
      currency: "SEK",
      description: "En mysig babynest.",
      lang: null,
    });
  });

  it("prefers schema.org Product in @graph with array types and AggregateOffer", () => {
    const p = parseProductHtml(JSONLD_HTML, "https://shop.example.se/duo");
    expect(p.title).toBe("Barnvagn Duo");
    expect(p.imageUrl).toBe("https://cdn.example.se/duo.jpg");
    expect(p.price).toBe(7995);
    expect(p.currency).toBe("SEK");
    expect(p.description).toBe("Kombivagn");
  });

  it("handles top-level arrays, ImageObject and offer arrays", () => {
    const p = parseProductHtml(OFFERS_ARRAY_HTML, "https://example.com");
    expect(p).toMatchObject({ title: "Bodys 5-pack", imageUrl: "https://img.example.com/body.png", price: 299 });
  });

  it("falls back to <title> and microdata price", () => {
    const p = parseProductHtml(MICRODATA_HTML, "https://example.com");
    expect(p.title).toBe("Skötväska Classic");
    expect(p.price).toBe(649);
    expect(p.imageUrl).toBeNull();
  });

  it("returns nulls for a page with nothing useful", () => {
    expect(parseProductHtml("<html></html>", "https://example.com")).toEqual({
      title: null,
      imageUrl: null,
      price: null,
      currency: null,
      description: null,
      lang: null,
    });
  });

  it("ignores non-http image URLs", () => {
    const p = parseProductHtml(`<meta property="og:image" content="javascript:alert(1)">`, "https://example.com");
    expect(p.imageUrl).toBeNull();
  });
});

describe("page language", () => {
  it("reads html lang", () => {
    expect(parseProductHtml('<html lang="sv-SE"><head><title>X</title></head></html>', "https://e.se").lang).toBe("sv");
    expect(parseProductHtml('<html lang="en"><head><title>X</title></head></html>', "https://e.com").lang).toBe("en");
  });
  it("falls back to og:locale and is null for other languages", () => {
    expect(parseProductHtml('<html><head><meta property="og:locale" content="sv_SE"></head></html>', "https://e.se").lang).toBe("sv");
    expect(parseProductHtml('<html lang="de"><head></head></html>', "https://e.de").lang).toBe(null);
  });
  it("trusts clearly Swedish or English text over the declared language", () => {
    // Shop templates often declare lang="en" while the product text is Swedish.
    const sv = `<html lang="en"><head><meta property="og:title" content="Babynest">
      <meta name="description" content="Mjuk och skön babynest i ekologisk bomull. Passar från födseln."></head></html>`;
    expect(parseProductHtml(sv, "https://e.se").lang).toBe("sv");
    const en = `<html><head><meta property="og:title" content="Baby nest">
      <meta name="description" content="A soft and cosy baby nest made of organic cotton."></head></html>`;
    expect(parseProductHtml(en, "https://e.com").lang).toBe("en");
    // A brand name alone says nothing: the declared language stands.
    const brand = `<html lang="sv"><head><meta property="og:title" content="Stokke Tripp Trapp"></head></html>`;
    expect(parseProductHtml(brand, "https://e.se").lang).toBe("sv");
    expect(detectLang("EN-GB")).toBe("en");
    expect(detectLang(undefined)).toBe(null);
  });
});

describe("parsePrice", () => {
  it.each([
    ["1295", 1295],
    ["1295.00", 1295],
    ["1 295,00 kr", 1295],
    ["1 295 kr", 1295],
    ["1,295.00", 1295],
    ["1.295,50", 1296],
    ["SEK 499", 499],
    ["49,90", 50],
    ["12.345", 12345],
    [399, 399],
    ["", null],
    ["gratis", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });
});

describe("helpers", () => {
  it("decodes entities", () => {
    expect(decodeEntities("Barn &amp; baby &#246; &#xE5; &quot;x&quot;")).toBe('Barn & baby ö å "x"');
  });

  it("refuses internal fetch targets", () => {
    expect(isFetchableUrl("https://www.babyshop.se/p/1")).toBe(true);
    for (const bad of ["http://localhost:3000", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1", "file:///etc/passwd", "http://[::1]/", "http://babyshower:3000", "nonsense"]) {
      expect(isFetchableUrl(bad)).toBe(false);
    }
  });
});
