// PicWall user-manual screenshot capture
// Drives the real app, screenshots each documented state, adds DOM annotations.
// Run: node docs/guide/capture.mjs  (after npm run dev on :3000)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const SHOTS = path.resolve("docs/guide/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

// draw an arrow from (x1,y1) to (x2,y2) + optional label box, via an overlay div
function annotate(page, { from, to, label, color = "#d96c4a" }) {
  return page.evaluate(({ from, to, label, color }) => {
    const ov = document.createElement("div");
    ov.id = "__guide_annotate";
    ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999;";
    const [x1, y1] = from, [x2, y2] = to;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const svg = `<svg width="100%" height="100%" style="position:absolute;top:0;left:0">
      <line x1="${x1}" y1="${y1}" x2="${x2 - 12}" y2="${y2 - 12}" stroke="${color}" stroke-width="2.5"
        marker-end="url(#__arr)" stroke-dasharray="6 4"/>
      <defs><marker id="__arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
        <path d="M0,0 L7,3 L0,6 Z" fill="${color}"/></marker></defs>
      <rect x="${x2 + 8}" y="${y2 - 10}" width="${label ? label.length * 15 + 20 : 0}" height="24" rx="4"
        fill="${color}" opacity="0.92"/>
      <text x="${x2 + 18}" y="${y2 + 5}" font-size="13" fill="#fff" font-family="sans-serif">${label}</text>
    </svg>`;
    ov.innerHTML = svg;
    document.body.appendChild(ov);
    return { x1, y1, x2, y2, len, ang };
  }, { from, to, label, color });
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// ---- 1. 启动与浏览照片墙 ----
await page.goto(BASE);
await page.waitForSelector(".polaroid");
await page.waitForTimeout(900); // entrance animation
await shot(page, "01-wall.png");

// ---- 2. 按钮添加照片 ----
await annotate(page, { from: [1060, 740], to: [1210, 755], label: "添加照片" });
await shot(page, "02-add-button.png");
await page.evaluate(() => document.getElementById("__guide_annotate")?.remove());

// upload a real test image via the hidden input
const input = page.locator('input[type="file"]');
const fixture = path.resolve("docs/guide/fixture.jpg");
await input.setInputFiles(fixture);
await page.waitForFunction(() => document.querySelectorAll(".polaroid").length >= 6);
await page.waitForTimeout(700);
await shot(page, "03-after-upload.png");

// ---- 4. 浏览大图 (lightbox) ----
await page.locator(".polaroid").last().click();
await page.waitForSelector('[role="dialog"]');
await page.waitForTimeout(300);
await annotate(page, { from: [610, 140], to: [750, 175], label: "大图预览" });
await annotate(page, { from: [1150, 120], to: [1230, 135], label: "关闭" });
await shot(page, "04-lightbox.png");
await page.evaluate(() => document.getElementById("__guide_annotate")?.remove());

// close via button
await page.getByRole("button", { name: "关闭" }).click();
await page.waitForSelector('[role="dialog"]', { state: "detached" });

// ---- 5. 键盘操作 ----
await page.locator(".polaroid").last().focus();
await page.keyboard.press("Enter");
await page.waitForSelector('[role="dialog"]');
await page.keyboard.press("Escape");
await page.waitForSelector('[role="dialog"]', { state: "detached" });
await shot(page, "05-keyboard.png");

// ---- 3. 拖拽添加照片 ----
// simulate drag: dispatch dragenter/dragover with DataTransfer
const dt = await page.evaluateHandle(() => new DataTransfer());
await page.evaluate(() => {
  const main = document.querySelector("main");
  const dt = new DataTransfer();
  main.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
});
await page.waitForSelector("text=松手上传");
await shot(page, "06-drag-overlay.png");
await page.evaluate(() => {
  const main = document.querySelector("main");
  const dt = new DataTransfer();
  main.dispatchEvent(new DragEvent("dragleave", { bubbles: true, dataTransfer: dt }));
});

// ---- 7. 异常处理: >20MB 拒绝 ----
// API-level proof: POST a >20MB file, expect error JSON (UI shows no new card)
const bigRes = await page.evaluate(async () => {
  const fd = new FormData();
  fd.append("files", new File([new Uint8Array(21 * 1024 * 1024)], "too-big.jpg"));
  const res = await fetch("/api/images", { method: "POST", body: fd });
  return await res.json();
});
console.log("oversize response:", JSON.stringify(bigRes[0]));

await page.reload();
await page.waitForSelector(".polaroid");
await page.waitForTimeout(700);
await shot(page, "07-wall-clean.png");

await browser.close();
console.log("done — screenshots in", SHOTS);
