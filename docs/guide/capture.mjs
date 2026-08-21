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
    // remove ALL previous overlays (annotate may be called multiple times)
    document.querySelectorAll("#__guide_annotate").forEach((el) => el.remove());
    const ov = document.createElement("div");
    ov.id = "__guide_annotate";
    ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999;";
    const [x1, y1] = from, [x2, y2] = to;
    // build SVG via DOM APIs (no innerHTML with data) — labels are hardcoded here
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.cssText = "position:absolute;top:0;left:0";
    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "__arr");
    marker.setAttribute("markerWidth", "9");
    marker.setAttribute("markerHeight", "9");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    const arrow = document.createElementNS(svgNS, "path");
    arrow.setAttribute("d", "M0,0 L7,3 L0,6 Z");
    arrow.setAttribute("fill", color);
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2 - 12));
    line.setAttribute("y2", String(y2 - 12));
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("marker-end", "url(#__arr)");
    line.setAttribute("stroke-dasharray", "6 4");
    svg.appendChild(line);
    if (label) {
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(x2 + 8));
      rect.setAttribute("y", String(y2 - 10));
      rect.setAttribute("width", String(label.length * 15 + 20));
      rect.setAttribute("height", "24");
      rect.setAttribute("rx", "4");
      rect.setAttribute("fill", color);
      rect.setAttribute("opacity", "0.92");
      svg.appendChild(rect);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", String(x2 + 18));
      text.setAttribute("y", String(y2 + 5));
      text.setAttribute("font-size", "13");
      text.setAttribute("fill", "#fff");
      text.setAttribute("font-family", "sans-serif");
      text.textContent = label;
      svg.appendChild(text);
    }
    ov.appendChild(svg);
    document.body.appendChild(ov);
  }, { from, to, label, color });
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });

const clearOverlays = (page) =>
  page.evaluate(() => document.querySelectorAll("#__guide_annotate").forEach((el) => el.remove()));

const browser = await chromium.launchPersistentContext("/tmp/picwall-guide-profile", {
  headless: true,
}); // persistent profile: local caption models (~330MB) stay cached across regens
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// ---- 1. 启动与浏览照片墙 ----
await page.goto(BASE);
await page.waitForSelector(".polaroid");
await page.waitForTimeout(900); // entrance animation
await shot(page, "01-wall.png");

// ---- 2. 按钮添加照片 ----
await annotate(page, { from: [1060, 740], to: [1210, 755], label: "添加照片" });
await shot(page, "02-add-button.png");
await clearOverlays(page);

// upload a real test image via the hidden input
const input = page.locator('input[type="file"]');
const fixture = path.resolve("docs/guide/fixture.jpg");
await input.setInputFiles(fixture);
await page.waitForFunction(() => document.querySelectorAll(".polaroid").length >= 6);
await page.waitForTimeout(700);
await shot(page, "03-after-upload.png");

// ---- 8. AI 图像描述（本地模型自动生成中文标题）----
// wait until the new card's caption replaces the filename (local wasm pipeline, ~4s warm)
await page.waitForFunction(
  () => {
    const cards = [...document.querySelectorAll(".polaroid")];
    return cards.some((c) => /[\u4e00-\u9fff]/.test(c.textContent));
  },
  undefined,
  { timeout: 120_000 },
);
await page.mouse.move(10, 10); // drop hover so no card is mid-lift
await page.waitForTimeout(500);
await annotate(page, { from: [400, 300], to: [640, 420], label: "AI 自动生成标题" });
await shot(page, "08-ai-caption.png");
await clearOverlays(page);

// ---- 4. 浏览大图 (lightbox) ----
await page.locator(".polaroid").last().click();
await page.waitForSelector('[role="dialog"]');
await page.waitForTimeout(300);
await annotate(page, { from: [610, 140], to: [750, 175], label: "大图预览" });
await annotate(page, { from: [1150, 120], to: [1230, 135], label: "关闭" });
await shot(page, "04-lightbox.png");
await clearOverlays(page);

// close via button
await page.getByRole("button", { name: "关闭", exact: true }).click();
await page.waitForSelector('[role="dialog"]', { state: "detached" });

// ---- 5. 键盘操作 ----
await page.locator(".polaroid").last().focus();
await page.keyboard.press("Enter");
await page.waitForSelector('[role="dialog"]');
await page.keyboard.press("Escape");
await page.waitForSelector('[role="dialog"]', { state: "detached" });
await shot(page, "05-keyboard.png");

// ---- 3. 拖拽添加照片 ----
// simulate drag: dispatch dragover with DataTransfer
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
if (!Array.isArray(bigRes) || !bigRes[0]?.error) {
  throw new Error(`expected oversize rejection, got: ${JSON.stringify(bigRes)}`);
}
console.log("oversize response:", JSON.stringify(bigRes[0]));

await page.reload();
await page.waitForSelector(".polaroid");
await page.waitForTimeout(700);
await shot(page, "07-wall-clean.png");

await browser.close();
console.log("done — screenshots in", SHOTS);
