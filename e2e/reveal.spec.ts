import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Runs last (files run alphabetically on one worker): it reveals the shared registry for good.
const ITEM = "Spjälsäng";
const GUEST = "Greta Gustafsson";
const GUEST_EMAIL = "greta@example.com";
const MESSAGE = "Grattis; ni kommer bli fantastiska!";
const ADDRESS = "Lingonvägen 3, 123 45 Ås";

async function newPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // The UI defaults to English; these flows assert Swedish copy, so pin the locale cookie.
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "sv", url: `http://localhost:${process.env.E2E_PORT ?? 3100}` }]);
  return { ctx, page: await ctx.newPage() };
}

async function signIn(page: Page, name: string) {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Lösenkod").fill("test");
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.getByLabel("Ditt namn").fill(name);
  await page.getByRole("button", { name: "Fortsätt" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function thankCount(text: string | null): { thanked: number; total: number } {
  const m = /(\d+) av (\d+) tackade/.exec(text ?? "");
  if (!m) throw new Error(`unexpected thank count: ${text}`);
  return { thanked: Number(m[1]), total: Number(m[2]) };
}

test("reveal and peek: surprise until reveal, then names, thank-yous and CSV", async ({ browser }) => {
  // --- Editor adds an item; save returns to the item list ---
  const editor = await newPage(browser);
  const ep = editor.page;
  await signIn(ep, "Mira");
  await ep.getByTestId("add-item").click();
  await expect(ep).toHaveURL(/\/admin\/items\/new$/);
  await ep.getByLabel("Namn – Svenska").fill(ITEM);
  await ep.getByLabel("Pris (kr)").fill("2495");
  await ep.getByTestId("save-item").click();
  await expect(ep).toHaveURL(/\/admin#items$/);
  await expect(ep.getByTestId("admin-item").filter({ hasText: ITEM })).toBeVisible();

  // --- Guest claims it with a message and an address ---
  const guest = await newPage(browser);
  const gp = guest.page;
  await gp.goto("/");
  await gp.getByTestId("item-card").filter({ hasText: ITEM }).getByTestId("claim-link").click();
  await gp.getByLabel("Ditt namn").fill(GUEST);
  await gp.getByLabel("Din e-post").fill(GUEST_EMAIL);
  await gp.getByLabel("Hälsning (valfritt)").fill(MESSAGE);
  await gp.getByLabel("Postadress (valfritt)").fill(ADDRESS);
  await gp.getByTestId("claim-submit").click();
  await expect(gp.getByTestId("claim-confirmation")).toBeVisible();

  // --- Before reveal: /admin/gifts is aggregate only, export is refused ---
  await ep.goto("/admin/gifts");
  await expect(ep.getByTestId("gifts-surprise")).toBeVisible();
  await expect(ep.getByTestId("gifts-aggregate-row").filter({ hasText: ITEM })).toContainText("1 / 1");
  await expect(ep.getByTestId("gifts-reveal-link")).toHaveAttribute("href", "/admin/reveal");
  await expect(ep.locator("body")).not.toContainText(GUEST);
  await expect(ep.locator("body")).not.toContainText(GUEST_EMAIL);
  const refused = await ep.request.get("/admin/gifts/export.csv");
  expect(refused.status()).toBe(403);
  expect(await refused.text()).toContain("Not revealed yet");

  // --- Peek: checkbox required, shows the list once, logs, does not reveal ---
  await ep.goto("/admin/reveal");
  await expect(ep.locator("body")).not.toContainText(GUEST);
  await ep.getByTestId("peek-understand").check();
  const [peekResponse] = await Promise.all([
    ep.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/reveal")),
    ep.getByTestId("peek-submit").click(),
  ]);
  expect(peekResponse.headers()["cache-control"] ?? "").toContain("no-store");
  const peek = ep.getByTestId("peek-result");
  await expect(peek).toBeVisible();
  const peekRow = peek.getByTestId("gift-row").filter({ hasText: GUEST_EMAIL });
  await expect(peekRow.getByTestId("gift-guest")).toHaveText(GUEST);
  await expect(peekRow.getByTestId("gift-message")).toHaveText(MESSAGE);
  await expect(peekRow.getByTestId("thank-checkbox")).toHaveCount(0);

  await ep.reload();
  await expect(ep.getByTestId("peek-result")).toHaveCount(0);
  await expect(ep.locator("body")).not.toContainText(GUEST);
  await expect(ep.getByTestId("last-peek")).toContainText("Senast tittad: Mira");

  // A second editor sees the peek on the dashboard; still not revealed.
  const other = await newPage(browser);
  await signIn(other.page, "Lisa");
  await expect(other.page.getByTestId("reveal-state")).toHaveText("Inte avslöjad än – överraskningsläget är på.");
  await expect(other.page.getByTestId("surprise-banner")).toBeVisible();
  await expect(other.page.getByTestId("dashboard-last-peek")).toContainText("Senast tittad: Mira");
  await expect(other.page.getByTestId("editor-log")).toContainText("Peek by Mira");
  await expect(other.page.locator("body")).not.toContainText(GUEST_EMAIL);
  expect((await other.page.request.get("/admin/gifts/export.csv")).status()).toBe(403);

  // --- Reveal needs the typed word ---
  await ep.getByLabel("Skriv AVSLÖJA för att bekräfta").fill("ja");
  await ep.getByTestId("reveal-submit").click();
  await expect(ep.getByTestId("reveal-error")).toContainText("Skriv AVSLÖJA");
  await expect(ep).toHaveURL(/\/admin\/reveal$/);
  await ep.getByLabel("Skriv AVSLÖJA för att bekräfta").fill("avslöja");
  await ep.getByTestId("reveal-submit").click();
  await expect(ep).toHaveURL(/\/admin\/gifts$/);

  // --- After reveal: names, email, message and address ---
  const row = ep.getByTestId("gift-row").filter({ hasText: GUEST_EMAIL });
  await expect(row.getByTestId("gift-guest")).toHaveText(GUEST);
  await expect(row.getByTestId("gift-email")).toHaveText(GUEST_EMAIL);
  await expect(row.getByTestId("gift-message")).toHaveText(MESSAGE);
  await expect(row.getByTestId("gift-address")).toContainText(ADDRESS);
  const before = thankCount(await ep.getByTestId("thank-count").textContent());
  expect(before.thanked).toBe(0);
  expect(before.total).toBeGreaterThanOrEqual(1);

  // --- Thank-you checkbox persists and updates the count ---
  await row.getByTestId("thank-checkbox").check();
  await expect(ep.getByTestId("thank-count")).toHaveText(`1 av ${before.total} tackade`);
  await ep.reload();
  await expect(row.getByTestId("thank-checkbox")).toBeChecked();
  await expect(ep.getByTestId("thank-count")).toHaveText(`1 av ${before.total} tackade`);
  await row.getByTestId("thank-note").fill("Kort skickat");
  await row.getByRole("button", { name: "Spara" }).click();
  await expect(async () => {
    await ep.reload();
    await expect(row.getByTestId("thank-note")).toHaveValue("Kort skickat", { timeout: 1000 });
  }).toPass();
  await expect(row.getByTestId("thank-checkbox")).toBeChecked();

  await ep.getByTestId("filter-done").click();
  await expect(ep).toHaveURL(/filter=done/);
  await expect(ep.getByTestId("gift-row")).toHaveCount(1);
  await ep.getByTestId("filter-todo").click();
  await expect(ep.getByTestId("gift-row").filter({ hasText: GUEST_EMAIL })).toHaveCount(0);

  // --- Dashboard now shows who gave what ---
  await other.page.goto("/admin");
  await expect(other.page.getByTestId("reveal-state")).toContainText("Avslöjad");
  await expect(other.page.getByTestId("reveal-state")).toContainText("Mira");
  await expect(other.page.getByTestId("dashboard-gifts")).toContainText(GUEST);

  // --- CSV export: BOM, semicolons, the guest's row ---
  const res = await ep.request.get("/admin/gifts/export.csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = body.subarray(3).toString("utf8");
  const [header, ...lines] = csv.split("\r\n");
  expect(header).toBe("Item;Type;Name;Email;Qty;Amount (SEK);Status;Message;Address;Show name;Created;Thanked;Thank-you note");
  const line = lines.find((l) => l.includes(GUEST_EMAIL));
  expect(line).toBeDefined();
  expect(line).toContain(`${ITEM};item;${GUEST};${GUEST_EMAIL};1;;Reserved;"${MESSAGE}";${ADDRESS};no;`);
  expect(line).toMatch(/;\d{4}-\d{2}-\d{2}T[\d:.]+Z;Kort skickat$/);

  await Promise.all([editor.ctx.close(), guest.ctx.close(), other.ctx.close()]);
});

test("reveal page shows the reveal as done", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await signIn(page, "Mira");
  await page.goto("/admin/reveal");
  await expect(page.getByTestId("reveal-done")).toContainText("Mira avslöjade listan");
  await expect(page.getByTestId("peek-form")).toHaveCount(0);
  await ctx.close();
});

test("backup button writes a backup and reports it", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await signIn(page, "Mira");
  await page.getByTestId("backup-now").click();
  await expect(page.getByTestId("backup-result")).toHaveText(/Sparade registry-\d{8}-\d{4}(-\d+)?\.db\. \d+ kopi(a|or) finns nu\./);
  await page.reload();
  await expect(page.getByTestId("backup-count")).toContainText("Senaste kopian: registry-");
  await expect(page.getByTestId("editor-log")).toContainText("Backed up the database");
  await ctx.close();
});

test("image proxy refuses URLs that are not item images", async ({ request }) => {
  expect((await request.get("/api/img?u=" + encodeURIComponent("https://example.com/not-an-item.jpg"))).status()).toBe(404);
  expect((await request.get("/api/img?u=" + encodeURIComponent("file:///etc/passwd"))).status()).toBe(404);
  expect((await request.get("/api/img")).status()).toBe(404);
});
