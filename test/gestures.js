// 手势测试: 真机 touch 语义全套验证 (via synthetic PointerEvents, pointerType=touch)
// 用法: node test/gestures.js <baseUrl>
const { chromium } = require("@playwright/test");

const URL = process.argv[2] || "http://localhost:3100";
const results = [];
let card;

async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  card = p.locator(".polaroid").first();
  await expectVisible();

  // helper: synthetic touch gesture on first card
  async function gesture(name, points) {
    const bb = await card.boundingBox();
    const sx = bb.x + 60, sy = bb.y + 60;
    await p.evaluate(
      ({ sx, sy, points }) => {
        const el = document.elementFromPoint(sx, sy)?.closest(".polaroid");
        if (!el) throw new Error("no card at point");
        el.dispatchEvent(
          new PointerEvent("pointerdown", { clientX: sx, clientY: sy, pointerType: "touch", bubbles: true })
        );
        for (const [dx, dy] of points) {
          window.dispatchEvent(
            new PointerEvent("pointermove", { clientX: sx + dx, clientY: sy + dy, pointerType: "touch", bubbles: true })
          );
        }
        window.dispatchEvent(
          new PointerEvent("pointerup", { clientX: sx + points.at(-1)[0], clientY: sy + points.at(-1)[1], pointerType: "touch", bubbles: true })
        );
      },
      { sx, sy, points }
    );
    await p.waitForTimeout(700);
    const alert = await p.getByRole("alertdialog").isVisible().catch(() => false);
    const pos = await card.evaluate((el) => ({ l: Math.round(el.offsetLeft), t: Math.round(el.offsetTop) }));
    results.push({ name, alert, pos });
    if (alert) {
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
  }

  // 1. 点击 → lightbox (tap: down→up 无位移; React onClick 由 click 合成, 直接调 click())
  const bb0 = await card.boundingBox();
  await p.evaluate(({ sx, sy }) => {
    const el = document.elementFromPoint(sx, sy)?.closest(".polaroid");
    el?.dispatchEvent(new PointerEvent("pointerdown", { clientX: sx, clientY: sy, pointerType: "touch", bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: sx, clientY: sy, pointerType: "touch", bubbles: true }));
    // suppressClick 未置位 (无 move), 合成 click 打开 lightbox
    (el ?? document.body).click();
  }, { sx: bb0.x + 60, sy: bb0.y + 60 });
  await p.waitForTimeout(600);
  const dialog = await p.getByRole("dialog").isVisible().catch(() => false);
  results.push({ name: "tap", alert: false, dialog });
  if (dialog) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }

  // 2. 纯左滑 120px → 删除确认
  await gesture("swipe-left", [[-120, 0]]);

  // 3. 纯右滑 120px → 拖动不删
  await gesture("swipe-right", [[120, 0]]);

  // 4. 斜向右下 (80,60) → 拖动排版
  await gesture("diag-right-down", [[80, 60]]);

  // 5. 纵向滑动 (0,-150) → 页面滚动,卡片不动
  await gesture("scroll-up", [[0, -150]]);

  // 6. 短左滑 30px → 回弹不删
  await gesture("swipe-left-short", [[-30, 0]]);

  // 7. 横向抖动 (先右后左, 净位移小) → 不删
  await gesture("jitter", [[20, 0], [40, 0], [10, 0], [-5, 0]]);

  // 汇总
  console.log("\n=== GESTURE TEST RESULTS ===");
  for (const r of results) {
    const verdict =
      r.name === "tap" ? (r.dialog ? "PASS" : "FAIL")
      : r.name === "swipe-left" ? (r.alert ? "PASS" : "FAIL")
      : r.name === "swipe-left-short" || r.name === "jitter" ? (!r.alert ? "PASS" : "FAIL")
      : (!r.alert ? "PASS" : "FAIL");
    console.log(
      `${verdict}  ${r.name.padEnd(18)} confirm=${r.alert ? "Y" : "n"} ${r.name === "tap" ? `dialog=${r.dialog ? "Y" : "n"}` : `pos=(${r.pos.l},${r.pos.t})`}`
    );
  }
  await b.close();
}

async function expectVisible() {
  await card.waitFor({ state: "visible" });
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
