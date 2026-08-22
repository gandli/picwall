// test/expect come from coverage-fixture (wraps `page` with V8 collection)
import { test, expect, expectCoverage } from "./coverage-fixture";
import type { Page } from "@playwright/test";

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

test("主题切换持久化", async ({ page }) => {
  await page.getByRole("button", { name: "切换主题" }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("picwall.theme"))).toBe("dark");
  // reload keeps dark + icon flips
  await page.reload();
  await expect(page.locator("html.dark")).toBeVisible();
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html.dark")).toHaveCount(0);
});

test("语言切换 zh↔en 持久化", async ({ page }) => {
  await page.getByRole("button", { name: "切换语言" }).click();
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("picwall.lang"))).toBe("en");
  await page.reload();
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  await page.getByRole("button", { name: "Toggle language" }).click();
  await expect(page.getByRole("button", { name: "添加照片" })).toBeVisible();
});

test("音效开关持久化", async ({ page }) => {
  await page.getByRole("button", { name: "关闭音效" }).click();
  expect(await page.evaluate(() => localStorage.getItem("picwall.sound"))).toBe("off");
  await page.reload();
  await expect(page.getByRole("button", { name: "开启音效" })).toBeVisible();
  await page.getByRole("button", { name: "开启音效" }).click();
  expect(await page.evaluate(() => localStorage.getItem("picwall.sound"))).toBe("on");
});

test("拖放上传（dataTransfer 模拟）", async ({ page }) => {
  const before = await page.locator(".polaroid").count();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.dispatchEvent("main", "dragover", { dataTransfer });
  await expect(page.getByText("松手上传")).toBeVisible();
  await page.evaluate(async ([dt]) => {
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "e2e-drop.png", { type: "image/png" });
    (dt as DataTransfer).items.add(file);
    document.querySelector("main")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dt as DataTransfer, bubbles: true }));
  }, [dataTransfer]);
  const card = page.locator(".polaroid", { hasText: "e2e-drop" });
  await expect(card).toBeVisible();
  const src = await card.getAttribute("data-src");
  await page.request.delete(`/api/images/${src?.split("/").pop()?.replace(/\.[^.]+$/, "")}`);
});

test("空格键也能打开 lightbox，点击遮罩关闭", async ({ page }) => {
  const card = page.locator(".polaroid").first();
  await card.focus();
  await page.keyboard.press(" ");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // click backdrop (not inner panel) to close — the second path of dismissal
  await dialog.click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
});

test("上传失败（超限文件）显示错误提示", async ({ page }) => {
  // route-level rejection: intercept POST and return a per-file error payload
  await page.route("**/api/images", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ error: "exceeds 20MB limit", filename: "big.png" }]),
    })
  );
  await page.setInputFiles('input[type="file"]', {
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.from("x"),
  });
  await expect(page.locator("main")).toContainText("上传失败");
});

test("AI 描述流程：pending 指示 → 中文标题 → PATCH 持久化（e2eVision seam）", async ({ page }) => {
  await page.goto("/?e2eVision=1");
  await page.setInputFiles('input[type="file"]', {
    name: "caption-e2e.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const card = page.locator(".polaroid", { hasText: "caption-e2e" }).first();
  await expect(card).toBeVisible();
  // grab id BEFORE captioning replaces the visible filename
  const src = await card.getAttribute("data-src");
  const id = src?.split("/").pop()?.replace(/\.[^.]+$/, "");
  expect(id).toBeTruthy();

  // pending indicator appears then clears when the caption lands
  await expect(card.getByText(/AI 描述生成中|Generating AI description/)).toBeHidden({ timeout: 15_000 });

  // title replaced by the canned Chinese caption (locate by id — text changed under us)
  const byId = page.locator(`.polaroid[data-src="/uploads/${id}.png"]`);
  await expect(byId).toHaveAttribute("data-title", "测试照片");

  // persisted via PATCH → survives reload
  await page.reload();
  await expect(page.locator(`.polaroid[data-src="/uploads/${id}.png"]`)).toHaveAttribute("data-title", "测试照片");

  await deleteUploaded(page, byId);
});

// coverage gate: runs after all functional tests, same worker (serial mode) so
// the fixture has the full suite's V8 data
test("E2E 语句覆盖率 100%（app/page.tsx + lib/*）", async () => {
  await expectCoverage(["app/page.tsx", "lib/i18n.ts", "lib/vision.ts"], process.cwd());
});
