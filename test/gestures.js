// 手势测试: 真机 touch 语义全套验证 (synthetic PointerEvents, pointerType=touch)
// 交互模型: tap=lightbox, 长按400ms=拖拽, 横滑=删除/回弹, 纵滑=页面滚动
// 用法: node test/gestures.js <baseUrl>
const { chromium } = require("@playwright/test");

const URL = process.argv[2] || "http://localhost:3100";
const results = [];

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
  const card = p.locator(".polaroid").first();
  await card.waitFor({ state: "visible" });

  // helper: synthetic touch gesture on first card
  // holdMs: 指尖停留时间 (>=400 触发长按 arm)
  async function gesture(name, points, { holdMs = 0 } = {}) {
    // ensure no modal blocking the card
    for (const sel of ["[role=dialog]", "[role=alertdialog]"]) {
      if (await p.locator(sel).isVisible().catch(() => false)) {
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
      }
    }
    const bb = await card.boundingBox();
    if (!bb) throw new Error(`${name}: no boundingBox`);
    const sx = bb.x + 60, sy = bb.y + 60;
    console.log(`  [run] ${name} at (${Math.round(sx)},${Math.round(sy)})`);
    await p.evaluate(({ sx, sy, points, holdMs }) => {
      const el = document.elementFromPoint(sx, sy)?.closest(".polaroid");
      if (!el) throw new Error("no card at point");
      el.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: sx, clientY: sy, pointerType: "touch", bubbles: true })
      );
      const step = (i) => {
        if (i >= points.length) {
          // release: pointerup at final point (else card stays mid-drag)
          const [fx, fy] = points.length ? points[points.length - 1] : [0, 0];
          window.dispatchEvent(
            new PointerEvent("pointerup", { clientX: sx + fx, clientY: sy + fy, pointerType: "touch", bubbles: true })
          );
          return;
        }
        window.dispatchEvent(
          new PointerEvent("pointermove", { clientX: sx + points[i][0], clientY: sy + points[i][1], pointerType: "touch", bubbles: true })
        );
        setTimeout(() => step(i + 1), 16);
      };
      // hold first (long-press window), then move
      setTimeout(() => step(0), Math.max(holdMs, 0));
    }, { sx, sy, points, holdMs });
    // wait for gesture to finish + settle
    const total = holdMs + points.length * 16 + 700;
    await p.waitForTimeout(total);
    const alert = await p.getByRole("alertdialog").isVisible().catch(() => false);
    const pos = await card.evaluate((el) => ({ l: Math.round(el.offsetLeft), t: Math.round(el.offsetTop) }));
    results.push({ name, alert, pos });
    if (alert) {
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
  }

  // 1. 点击 → lightbox (down→up 无位移)
  const bb0 = await card.boundingBox();
  await p.evaluate(({ sx, sy }) => {
    const el = document.elementFromPoint(sx, sy)?.closest(".polaroid");
    el?.dispatchEvent(new PointerEvent("pointerdown", { clientX: sx, clientY: sy, pointerType: "touch", bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: sx, clientY: sy, pointerType: "touch", bubbles: true }));
    (el ?? document.body).click();
  }, { sx: bb0.x + 60, sy: bb0.y + 60 });
  await p.waitForTimeout(600);
  const dialog = await p.getByRole("dialog").isVisible().catch(() => false);
  results.push({ name: "tap", alert: false, dialog });
  if (dialog) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }

  // 2. 纯左滑 120px → 删除确认
  await gesture("swipe-left", [[-40, 0], [-80, 0], [-120, 0]]);

  // 3. 长按后拖拽 (hold 500ms → move) → 重定位不删
  await gesture("longpress-drag", [[50, 30], [90, 55]], { holdMs: 500 });

  // 4. 长按原地不动再松手 → armed 分支, 保存原位置不删
  await gesture("longpress-still", [], { holdMs: 500 });

  // 5. 纵向滑动 (0,-150) → 页面滚动,卡片不动
  await gesture("scroll-up", [[0, -75], [0, -150]]);

  // 6. 短左滑 30px → 回弹不删
  await gesture("swipe-left-short", [[-15, 0], [-30, 0]]);

  // 7. 抖动 (净位移小) → 不删
  await gesture("jitter", [[20, 0], [40, 0], [10, 0], [-5, 0]]);

  // 汇总
  console.log("\n=== GESTURE TEST RESULTS ===");
  for (const r of results) {
    const verdict =
      r.name === "tap" ? (r.dialog ? "PASS" : "FAIL")
      : r.name === "swipe-left" ? (r.alert ? "PASS" : "FAIL")
      : (!r.alert ? "PASS" : "FAIL");
    console.log(
      `${verdict}  ${r.name.padEnd(18)} confirm=${r.alert ? "Y" : "n"} ${r.name === "tap" ? `dialog=${r.dialog ? "Y" : "n"}` : `pos=(${r.pos.l},${r.pos.t})`}`
    );
  }
  await b.close();
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
