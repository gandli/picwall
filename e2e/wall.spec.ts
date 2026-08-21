import { test, expect, type Page } from "@playwright/test";

// 1x1 red PNG — valid image payload for upload
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const UPLOAD_NAME = "e2e-upload.png";
const UPLOAD_TITLE = "e2e-upload"; // title = filename minus extension, capped at 16 chars

// card id comes from its data-src (/uploads/<id>.png); delete via API so
// uploads/ and manifest.json stay clean across runs
async function deleteUploaded(page: Page, card: ReturnType<Page["locator"]>) {
  const src = await card.getAttribute("data-src");
  const id = src?.split("/").pop()?.replace(/\.[^.]+$/, "");
  expect(id).toBeTruthy();
  const res = await page.request.delete(`/api/images/${id}`);
  expect(res.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /PicWall/ })
  ).toBeVisible();
  await expect(page.locator(".polaroid").first()).toBeVisible();
});

test("页面加载渲染已有照片成拍立得卡片", async ({ page }) => {
  // baseline is the seeded 5, but the dev data dir may hold extra manual
  // uploads — assert "at least the seed" instead of an exact count
  await expect(page.locator(".polaroid").first()).toBeVisible();
  expect(await page.locator(".polaroid").count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("button", { name: "添加照片" })).toBeVisible();
});

test("file input 上传新卡片出现并可通过 DELETE 清理", async ({ page }) => {
  const before = await page.locator(".polaroid").count();

  await page.setInputFiles('input[type="file"]', {
    name: UPLOAD_NAME,
    mimeType: "image/png",
    buffer: PNG,
  });

  const card = page.locator(".polaroid", { hasText: UPLOAD_TITLE });
  await expect(card).toBeVisible();
  await expect(page.locator(".polaroid")).toHaveCount(before + 1);

  // self-clean: DELETE via API, card gone after reload
  await deleteUploaded(page, card);
  await page.reload();
  await expect(page.locator(".polaroid")).toHaveCount(before);
});

test("点击卡片打开 lightbox，Escape 关闭", async ({ page }) => {
  const card = page.locator(".polaroid").first();
  await card.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.locator("img")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("键盘 Enter 聚焦卡片打开 lightbox", async ({ page }) => {
  const card = page.locator(".polaroid").first();
  await card.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("卡片 × 按钮打开确认框，确认后删除卡片", async ({ page }) => {
  // upload a fresh card to delete
  await page.setInputFiles('input[type="file"]', {
    name: UPLOAD_NAME,
    mimeType: "image/png",
    buffer: PNG,
  });
  const card = page.locator(".polaroid", { hasText: UPLOAD_TITLE });
  await expect(card).toBeVisible();

  // hover shows × on desktop (always visible on mobile); click it
  await card.hover();
  await card.getByRole("button", { name: "删除照片" }).click();

  const alert = page.getByRole("alertdialog");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText(/删除这张照片/);

  // cancel first — card stays
  await alert.getByRole("button", { name: "取消" }).click();
  await expect(alert).toBeHidden();
  await expect(card).toBeVisible();

  // confirm — card disappears
  await card.hover();
  await card.getByRole("button", { name: "删除照片" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除这张照片？" }).click();
  await expect(card).toBeHidden();

  // manifest back to baseline (seeded 5 + any manual uploads)
  await page.reload();
  await expect(page.locator(".polaroid").first()).toBeVisible();
  expect(await page.locator(".polaroid").count()).toBeGreaterThanOrEqual(5);
});
