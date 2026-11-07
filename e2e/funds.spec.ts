import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const FUND = "Blöjfond";
const GROUP = "Duovagn";
const STARTER = "Babygym";
const GUEST = "Karin Lund";
const GUEST_EMAIL = "karin@example.com";
const amountRe = (a: string, b: string) => new RegExp(`${a.replace(" ", "\\s")}\\skr av ${b.replace(" ", "\\s")}\\skr`);

async function newPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // The UI defaults to English; these flows assert Swedish copy, so pin the locale cookie.
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "sv", url: `http://localhost:${process.env.E2E_PORT ?? 3100}` }]);
  return { ctx, page: await ctx.newPage() };
}

async function signIn(page: Page, name = "Mira") {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Lösenkod").fill("test");
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.getByLabel("Ditt namn").fill(name);
  await page.getByRole("button", { name: "Fortsätt" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function setSwish(page: Page, number: string) {
  await page.goto("/admin");
  await page.getByLabel("Swish-nummer").fill(number);
  await page.getByTestId("save-registry").click();
  await expect(page.getByText("Sparat.")).toBeVisible();
}

function card(page: Page, name: string) {
  return page.getByTestId("item-card").filter({ hasText: name });
}

test("Swish number is validated in settings", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await signIn(page);
  await page.getByLabel("Swish-nummer").fill("08-123 45 67");
  await page.getByTestId("save-registry").click();
  await expect(page.locator("#swish-help")).toHaveText("Swish-numret måste vara ett mobilnummer (07x) eller ett 123-nummer.");
  await setSwish(page, "+46 70-123 45 67");
  await page.reload();
  await expect(page.getByLabel("Swish-nummer")).toHaveValue("0701234567");
  await ctx.close();
});

test("cash fund: contribute 300 via Swish, confirm, progress and admin aggregate", async ({ browser }) => {
  const editor = await newPage(browser);
  const ep = editor.page;
  await signIn(ep);
  await setSwish(ep, "070-123 45 67");

  await ep.getByTestId("add-item").click();
  await ep.getByTestId("type-fund").check();
  await expect(ep.getByLabel("Länk till butik")).toHaveCount(0);
  await ep.getByLabel("Namn – Svenska").fill(FUND);
  await ep.getByLabel("Namn – Engelska").fill("Nappy fund");
  await ep.getByLabel("Mål (kr)").fill("5000");
  await ep.getByTestId("save-item").click();
  await expect(ep).toHaveURL(/\/admin(#items)?$/);
  const adminFund = ep.getByTestId("admin-item").filter({ hasText: FUND });
  await expect(adminFund.getByTestId("fund-contributors")).toHaveText("0");
  await expect(ep.getByTestId("editor-log")).toContainText(`Lade till insamlingen "${FUND}"`);

  // --- Guest sees the fund card and contributes ---
  const guest = await newPage(browser);
  const gp = guest.page;
  await gp.goto("/");
  await expect(card(gp, FUND).getByTestId("fund-progress-text")).toHaveText(amountRe("0", "5 000"));
  await card(gp, FUND).getByTestId("contribute-link").click();
  await expect(gp.getByTestId("item-title")).toHaveText(FUND);
  await gp.getByTestId("preset-300").click();
  await expect(gp.getByTestId("contribution-amount")).toHaveValue("300");
  await gp.getByLabel("Ditt namn").fill(GUEST);
  await gp.getByLabel("Din e-post").fill(GUEST_EMAIL);
  await gp.getByTestId("contribution-submit").click();

  // --- Confirmation: deep link, QR, number ---
  await expect(gp.getByTestId("swish-intro")).toContainText(/Swisha 300\skr till Blöjfond/);
  const href = (await gp.getByTestId("swish-link").getAttribute("href")) ?? "";
  expect(href.startsWith("swish://payment?data=")).toBe(true);
  const payload = JSON.parse(decodeURIComponent(href.slice("swish://payment?data=".length)));
  expect(payload).toMatchObject({ version: 1, payee: { value: "0701234567", editable: false }, amount: { value: 300, editable: false } });
  expect(payload.message.value).toBe("Babyshower: Blöjfond");
  const qr = gp.getByTestId("swish-qr");
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(gp.getByTestId("swish-number")).toHaveText("070-123 45 67");

  // Not confirmed yet: does not count.
  const other = await newPage(browser);
  await other.page.goto("/");
  await expect(card(other.page, FUND).getByTestId("fund-progress-text")).toHaveText(amountRe("0", "5 000"));
  await ep.goto("/admin");
  await expect(adminFund.getByTestId("fund-pending")).toHaveText("1");

  // --- Guest marks it sent ---
  await gp.getByTestId("swish-sent").click();
  await expect(gp.getByTestId("swish-confirmed")).toContainText(/300\skr/);
  await gp.goto("/my-claims");
  await expect(gp.getByTestId("my-contribution-amount")).toHaveText(/Bidrag: 300\skr/);
  await expect(gp.getByTestId("my-contribution-status")).toHaveText("Swishat");
  await expect(gp.getByTestId("mark-sent")).toHaveCount(0);
  await expect(gp.getByTestId("release-claim")).toHaveCount(0);

  await other.page.goto("/");
  await expect(card(other.page, FUND).getByTestId("fund-progress-text")).toHaveText(amountRe("300", "5 000"));
  await expect(card(other.page, FUND).getByTestId("fund-percent")).toHaveText("6 %");
  await expect(card(other.page, FUND).getByTestId("fund-count")).toHaveText("1 bidrag");
  await expect(other.page.locator("body")).not.toContainText("Karin");

  // --- Admin: 1 contributor, total, no name ---
  await ep.goto("/admin");
  await expect(adminFund.getByTestId("fund-contributors")).toHaveText("1");
  await expect(adminFund.getByTestId("fund-pending")).toHaveText("0");
  await expect(adminFund.getByTestId("fund-confirmed")).toHaveText(/300\skr \/ 5\s000\skr/);
  await expect(ep.locator("body")).not.toContainText("Karin");
  await expect(ep.locator("body")).not.toContainText(GUEST_EMAIL);

  await Promise.all([editor.ctx.close(), guest.ctx.close(), other.ctx.close()]);
});

test("contribution can be confirmed later from my claims", async ({ browser }) => {
  const guest = await newPage(browser);
  const gp = guest.page;
  await gp.goto("/");
  await card(gp, FUND).getByTestId("contribute-link").click();
  await gp.getByTestId("contribution-amount").fill("150");
  await gp.getByLabel("Ditt namn").fill("Olle");
  await gp.getByLabel("Din e-post").fill("olle@example.com");
  await gp.getByTestId("contribution-submit").click();
  await expect(gp.getByTestId("swish-link")).toBeVisible();
  await gp.goto("/my-claims");
  await expect(gp.getByTestId("my-contribution-status")).toHaveText("Inte bekräftat");
  await gp.getByTestId("mark-sent").click();
  await expect(gp.getByTestId("my-contribution-status")).toHaveText("Swishat");
  await gp.goto("/");
  await expect(card(gp, FUND).getByTestId("fund-progress-text")).toHaveText(amountRe("450", "5 000"));
  await guest.ctx.close();
});

test("amount below 20 kr is refused", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await page.goto("/");
  await card(page, FUND).getByTestId("contribute-link").click();
  await page.getByTestId("contribution-amount").fill("10");
  await page.getByLabel("Ditt namn").fill("Olle");
  await page.getByLabel("Din e-post").fill("olle@example.com");
  await page.getByTestId("contribution-submit").click();
  await expect(page.getByText(/Välj ett belopp på minst 20\skr/)).toBeVisible();
  await ctx.close();
});

test("group gift: buy the whole thing covers the goal", async ({ browser }) => {
  const editor = await newPage(browser);
  const ep = editor.page;
  await signIn(ep);
  await ep.getByTestId("add-item").click();
  await ep.getByTestId("type-group").check();
  await ep.getByLabel("Namn – Svenska").fill(GROUP);
  await ep.getByLabel("Pris (kr)").fill("6000");
  await ep.getByTestId("save-item").click();
  await expect(ep).toHaveURL(/\/admin(#items)?$/);
  const adminGroup = ep.getByTestId("admin-item").filter({ hasText: GROUP });
  await expect(adminGroup.getByTestId("fund-confirmed")).toHaveText(/0\skr \/ 6\s000\skr/);

  const guest = await newPage(browser);
  const gp = guest.page;
  await gp.goto("/");
  await expect(card(gp, GROUP).getByTestId("fund-progress-text")).toHaveText(amountRe("0", "6 000"));
  await card(gp, GROUP).getByTestId("contribute-link").click();
  const buy = gp.getByTestId("buy-whole");
  await buy.getByTestId("buy-whole-toggle").click();
  await buy.getByLabel("Ditt namn").fill(GUEST);
  await buy.getByLabel("Din e-post").fill(GUEST_EMAIL);
  await buy.getByTestId("claim-submit").click();
  await expect(gp.getByTestId("confirm-text")).toHaveText(`Du har reserverat 1 × ${GROUP}.`);

  await gp.goto("/");
  await expect(card(gp, GROUP).getByTestId("fund-bought-whole")).toHaveText("En gäst köper hela presenten");
  await expect(card(gp, GROUP).getByTestId("contribute-link")).toHaveCount(0);
  await gp.goto("/my-claims");
  await expect(gp.getByTestId("my-claim").filter({ hasText: GROUP })).toBeVisible();

  await ep.goto("/admin");
  await expect(adminGroup.getByTestId("admin-fund")).toContainText("Köps hel av en gäst");
  await expect(ep.locator("body")).not.toContainText("Karin");
  await Promise.all([editor.ctx.close(), guest.ctx.close()]);
});

test("starter list: toggling a suggestion makes it visible to guests", async ({ browser }) => {
  const editor = await newPage(browser);
  const ep = editor.page;
  await signIn(ep);
  await ep.getByTestId("admin-nav-starter").click();
  await expect(ep).toHaveURL(/\/admin\/starter$/);
  await expect(ep.getByTestId("starter-note")).toHaveText("Dolda förslag syns inte för gästerna.");
  const categories = ep.getByTestId("starter-category");
  expect(await categories.count()).toBeGreaterThanOrEqual(9);

  const guest = await newPage(browser);
  await guest.page.goto("/");
  await expect(card(guest.page, STARTER)).toHaveCount(0);

  const row = ep.getByTestId("starter-item").filter({ hasText: STARTER });
  await expect(row.getByTestId("starter-toggle")).toHaveAttribute("aria-checked", "false");
  await row.getByTestId("starter-toggle").click();
  await expect(row.getByTestId("starter-toggle")).toHaveAttribute("aria-checked", "true");

  await guest.page.goto("/");
  await expect(card(guest.page, STARTER)).toBeVisible();
  await expect(card(guest.page, STARTER).getByTestId("item-status-text")).toHaveText("1 av 1 kvar");

  await ep.goto("/admin");
  await expect(ep.getByTestId("editor-log")).toContainText(`Visade startförslaget "${STARTER}"`);
  await Promise.all([editor.ctx.close(), guest.ctx.close()]);
});
