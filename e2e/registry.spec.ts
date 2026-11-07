import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const ITEM_SV = "Babynest";
const ITEM_EN = "Baby nest";
const GUEST = "Anna Andersson";
const GUEST_EMAIL = "anna@example.com";

async function newPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // The UI defaults to English; these flows assert Swedish copy, so pin the locale cookie.
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "sv", url: `http://localhost:${process.env.E2E_PORT ?? 3100}` }]);
  return { ctx, page: await ctx.newPage() };
}

function card(page: Page) {
  return page.getByTestId("item-card").filter({ hasText: ITEM_SV });
}

async function claim(page: Page, opts: { showName: boolean }) {
  await page.goto("/");
  await card(page).getByTestId("claim-link").click();
  await expect(page.getByTestId("item-title")).toHaveText(ITEM_SV);
  await page.getByLabel("Ditt namn").fill(GUEST);
  await page.getByLabel("Din e-post").fill(GUEST_EMAIL);
  if (opts.showName) await page.getByLabel("Visa mitt namn för andra gäster").check();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-confirmation")).toBeVisible();
  await expect(page.getByTestId("confirm-text")).toContainText(`Du har reserverat 1 × ${ITEM_SV}`);
}

test("health endpoint returns 200", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("admin requires sign-in and rejects a wrong passcode", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await page.getByLabel("Lösenkod").fill("nope");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page.getByText("Fel lösenkod.")).toBeVisible();
  await ctx.close();
});

test("full registry flow: add item, claim, surprise mode, show name, release", async ({ browser }) => {
  // --- Editor signs in and adds an item ---
  const editor = await newPage(browser);
  const ep = editor.page;
  await ep.goto("/admin/sign-in");
  await ep.getByLabel("Lösenkod").fill("test");
  await ep.getByRole("button", { name: "Logga in" }).click();
  await expect(ep.getByRole("heading", { name: "Vad heter du?" })).toBeVisible();
  await ep.getByLabel("Ditt namn").fill("Mira");
  await ep.getByRole("button", { name: "Fortsätt" }).click();
  await expect(ep).toHaveURL(/\/admin$/);
  await expect(ep.getByTestId("admin-signed-in")).toHaveText("Inloggad som Mira");
  await expect(ep.getByTestId("surprise-banner")).toBeVisible();

  await ep.getByTestId("add-item").click();
  await expect(ep).toHaveURL(/\/admin\/items\/new$/);
  await expect(ep.getByRole("heading", { name: "Ny sak" })).toBeVisible();
  await ep.getByLabel("Namn – Svenska").fill(ITEM_SV);
  await ep.getByLabel("Namn – Engelska").fill(ITEM_EN);
  await ep.getByLabel("Pris (kr)").fill("1295");
  await ep.getByLabel("Antal som önskas").fill("3");
  await ep.getByLabel("Kategori").selectOption({ label: "Sova" });
  await ep.getByLabel("Länk till butik").fill("https://example.com/babynest");
  await ep.getByTestId("save-item").click();
  await expect(ep).toHaveURL(/\/admin(#items)?$/);
  const adminItem = ep.getByTestId("admin-item").filter({ hasText: ITEM_SV });
  await expect(adminItem).toBeVisible();
  await expect(adminItem.getByTestId("agg-claimed")).toHaveText("0");
  await expect(ep.getByTestId("editor-log")).toContainText(`Added "${ITEM_EN}"`);
  await expect(ep.getByTestId("editor-log")).toContainText("Mira");

  // --- Guest sees the item and claims one, name hidden ---
  const guest = await newPage(browser);
  const gp = guest.page;
  await gp.goto("/");
  await expect(card(gp)).toBeVisible();
  await expect(card(gp)).toContainText(/1\s295\s*kr/);
  await expect(card(gp).getByTestId("item-status-text")).toHaveText("3 av 3 kvar");
  await claim(gp, { showName: false });
  const myClaimsUrl = await gp.getByTestId("my-claims-url").inputValue();
  expect(myClaimsUrl).toMatch(/\/my-claims\/link\?t=/);

  await gp.goto("/");
  await expect(card(gp).getByTestId("item-status-text")).toHaveText("1 av 3 reserverade");
  await expect(card(gp).getByTestId("item-status-names")).toHaveCount(0);
  await expect(gp.locator("body")).not.toContainText("Anna");

  // --- Admin sees the aggregate but no guest details ---
  await ep.goto("/admin");
  await expect(adminItem.getByTestId("agg-claimed")).toHaveText("1");
  await expect(adminItem.getByTestId("agg-purchased")).toHaveText("0");
  await expect(ep.locator("body")).not.toContainText("Anna");
  await expect(ep.locator("body")).not.toContainText(GUEST_EMAIL);

  // --- Second claim with "show my name" → name visible to others ---
  await claim(gp, { showName: true });
  const other = await newPage(browser);
  await other.page.goto("/");
  await expect(card(other.page).getByTestId("item-status-text")).toHaveText("2 av 3 reserverade");
  await expect(card(other.page).getByTestId("item-status-names")).toHaveText("Reserverad av Anna");
  await ep.goto("/admin");
  await expect(adminItem.getByTestId("agg-claimed")).toHaveText("2");
  await expect(ep.locator("body")).not.toContainText("Anna");

  // --- The durable link restores "my claims" on another device ---
  await other.page.goto(myClaimsUrl);
  await expect(other.page).toHaveURL(/\/my-claims$/);
  await expect(other.page.getByTestId("my-claim")).toHaveCount(2);

  // --- Guest releases both claims → counts return ---
  await gp.goto("/my-claims");
  await expect(gp.getByTestId("my-claim")).toHaveCount(2);
  await gp.getByTestId("release-claim").first().click();
  await expect(gp.getByTestId("my-claim")).toHaveCount(1);
  await gp.goto("/");
  await expect(card(gp).getByTestId("item-status-text")).toHaveText("1 av 3 reserverade");
  await expect(card(gp).getByTestId("item-status-names")).toHaveCount(0);

  await gp.goto("/my-claims");
  await gp.getByTestId("release-claim").first().click();
  await expect(gp.getByText("Du har inga reservationer här ännu.")).toBeVisible();
  await gp.goto("/");
  await expect(card(gp).getByTestId("item-status-text")).toHaveText("3 av 3 kvar");
  await ep.goto("/admin");
  await expect(adminItem.getByTestId("agg-claimed")).toHaveText("0");

  await Promise.all([editor.ctx.close(), guest.ctx.close(), other.ctx.close()]);
});

test("defaults to English and the language toggle switches header text", async ({ page }) => {
  // Fresh context without a locale cookie: English is the default.
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("nav-my-claims")).toHaveText("My claims");
  await expect(page.getByRole("heading", { name: "The registry" })).toBeVisible();
  await page.getByTestId("lang-sv").click();
  await expect(page.getByTestId("nav-my-claims")).toHaveText("Mina reservationer");
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await page.getByTestId("lang-en").click();
  await expect(page.getByTestId("nav-my-claims")).toHaveText("My claims");
});
