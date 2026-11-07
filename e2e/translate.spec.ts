import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// e2e/server.mjs sets TRANSLATE_FAKE=1, so the server "translates" to "[sv] text" / "[en] text" without network.
const NAME_EN = "Baby nest";
const NAME_SV = "[sv] Baby nest";

async function newPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  // Own client IP so the sign-in rate limit (10 per 15 min per IP, shared with the other specs) is not hit.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.42" },
  });
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

test("auto-translate fills only the empty language in the item form", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await signIn(page, "Mira");
  await page.getByTestId("add-item").click();
  await expect(page).toHaveURL(/\/admin\/items\/new$/);

  const button = page.getByTestId("translate-button");
  await expect(button).toHaveText("Översätt tomma fält automatiskt");
  await expect(button).toBeDisabled(); // nothing written yet

  await page.getByLabel("Namn – Engelska").fill(NAME_EN);
  // Both description fields filled: must stay untouched.
  await page.getByLabel("Beskrivning – Svenska").fill("Mjuk och skön");
  await page.getByLabel("Beskrivning – Engelska").fill("Soft and comfy");
  await page.getByLabel("Pris (kr)").fill("995");

  await expect(button).toBeEnabled();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await button.click();

  await expect(page.getByLabel("Namn – Svenska")).toHaveValue(NAME_SV);
  await expect(page.getByLabel("Namn – Engelska")).toHaveValue(NAME_EN);
  await expect(page.getByLabel("Beskrivning – Svenska")).toHaveValue("Mjuk och skön");
  await expect(page.getByLabel("Beskrivning – Engelska")).toHaveValue("Soft and comfy");
  await expect(page.getByTestId("translate-button-status")).toContainText("Fyllde i 1 fält.");
  await expect(button).toBeDisabled(); // nothing left to translate

  await page.getByTestId("save-item").click();
  await expect(page).toHaveURL(/\/admin(#items)?$/);
  await expect(page.getByTestId("editor-log")).toContainText("Auto-translated 1 field(s) (mymemory)");

  // Public page in Swedish shows the translated name.
  await page.goto("/");
  await expect(page.getByTestId("item-card").filter({ hasText: NAME_SV }).getByTestId("item-name")).toHaveText(NAME_SV);
  await ctx.close();
});

test("auto-translate in the registry and category forms", async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await signIn(page, "Mira");

  // Registry details: Swedish welcome only, title in both languages.
  await page.getByLabel("Rubrik – Engelska").fill("Our shower");
  await page.getByLabel("Rubrik – Svenska").fill("Vår fest");
  await page.getByLabel("Välkomsttext – Engelska").fill("");
  await page.getByLabel("Välkomsttext – Svenska").fill("Välkommen!\nVi ses.");
  await page.getByTestId("translate-registry").click();
  await expect(page.getByLabel("Välkomsttext – Engelska")).toHaveValue("[en] Välkommen!\nVi ses.");
  await expect(page.getByLabel("Välkomsttext – Svenska")).toHaveValue("Välkommen!\nVi ses.");
  await expect(page.getByLabel("Rubrik – Engelska")).toHaveValue("Our shower");
  await expect(page.getByLabel("Rubrik – Svenska")).toHaveValue("Vår fest");

  // Categories: the add row and the edit rows share one button.
  await page.locator("#cat-new-en").fill("Bath time");
  await page.getByTestId("translate-categories").click();
  await expect(page.locator("#cat-new-sv")).toHaveValue("[sv] Bath time");
  await page.getByRole("button", { name: /Lägg till kategori/ }).click();
  await expect(page.locator('input[name="nameSv"][value="[sv] Bath time"]')).toBeVisible();
  await ctx.close();
});
