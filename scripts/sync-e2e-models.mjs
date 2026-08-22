// Sync local HF model files into e2e/fixtures/models for offline E2E captioning.
// Source: any warm Playwright profile that has run the app with captions on.
// Usage: node scripts/sync-e2e-models.mjs [profileDir]
// ponytail: full-file dump (351MB, gitignored). If CI ever needs this without a
// warm profile, switch to `huggingface-cli download` + same filename mapping.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const profile = process.argv[2] ?? "/tmp/picwall-diag-profile";
const outDir = new URL("../e2e/fixtures/models/", import.meta.url).pathname;
fs.mkdirSync(outDir, { recursive: true });

const b = await chromium.launchPersistentContext(profile, { headless: true });
const page = await b.newPage();
await page.goto("http://localhost:3000");
const entries = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = [];
  for (const n of names) {
    const c = await caches.open(n);
    for (const r of await c.keys()) {
      const resp = await c.match(r);
      if (!resp || !resp.url.includes("huggingface.co")) continue;
      const buf = new Uint8Array(await resp.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000)
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      out.push({ url: resp.url, b64: btoa(bin) });
    }
  }
  return out;
});
for (const { url, b64 } of entries) {
  const name = url.replace("https://huggingface.co/", "").replace(/\//g, "__");
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, "base64"));
}
console.log(`synced ${entries.length} model files -> ${outDir}`);
await b.close();
