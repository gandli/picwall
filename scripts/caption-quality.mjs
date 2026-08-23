// Caption quality eval: run the REAL vit-gpt2 → opus-mt-en-zh pipeline (same
// models as lib/vision.ts, loaded from the local e2e/fixtures/models cache —
// no network) against the 5 seeded fixture photos, then score title/desc
// quality. Not a CI gate (CI has no model cache) — a local diagnostic:
//   1) prepare cache:  node scripts/sync-e2e-models.mjs   (once, warm profile)
//   2) run:            node scripts/caption-quality.mjs
// Scoring per photo: structure (non-empty title ≤16, desc ≤60, derived exactly
// as vision.ts does) + keyword hit (seed's expected English nouns appear in the
// raw caption). Output: table + overall score; exit 1 if any caption is empty
// or translation fails outright.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheDir = path.join(root, "e2e", "fixtures", "models");
const workDir = "/tmp/picwall-eval-models";

if (!fs.existsSync(cacheDir)) {
  console.error(`no model cache at ${cacheDir} — run scripts/sync-e2e-models.mjs first`);
  process.exit(2);
}

// flatten Cache-API dump → transformers local_model_dir layout
for (const [model, dir] of [
  ["Xenova__vit-gpt2-image-captioning__resolve__main__", "vit-gpt2"],
  ["Xenova__opus-mt-en-zh__resolve__main__", "opus-mt"],
]) {
  const dest = path.join(workDir, dir);
  fs.rmSync(dest, { recursive: true, force: true });
  for (const f of fs.readdirSync(cacheDir)) {
    if (!f.startsWith(model)) continue;
    const rel = f.slice(model.length).replace("onnx__", "onnx/");
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(cacheDir, f), target);
  }
}

const t = await import("@huggingface/transformers");
t.env.localModelPath = workDir;
t.env.allowRemoteModels = false;

const cap = await t.pipeline("image-to-text", "vit-gpt2", { device: "cpu", dtype: "q8" });
const tr = await t.pipeline("translation", "opus-mt", { device: "cpu", dtype: "q8" });

// same derivation as vision.ts:57-58
function derive(zh) {
  const clean = zh.replace(/[。！？，][\s\S]*/, "").trim() || zh;
  return { title: clean.slice(0, 16), desc: zh.slice(0, 60) };
}

// seeds mirror scripts/seed-e2e-fixtures.mjs (+ keywords the true content shows)
const seeds = [
  ["e72m8pezbc6.jpg", ["cabin", "river", "lake", "house"]],
  ["7v7d4ed99bx.jpg", ["forest", "road", "trees"]],
  ["0p3jjb6w8q9j.jpg", ["mountain", "cloud", "snow"]],
  ["l469vo1wvxk.jpg", ["mountain", "snow", "night", "sky"]],
  ["wx7a6sabe99.jpg", ["bridge", "gate"]],
];

let pass = 0;
const rows = [];
for (const [file, kws] of seeds) {
  const img = await t.RawImage.read(path.join(root, "uploads", file));
  const en = (await cap(img, { max_new_tokens: 30 }))[0].generated_text.trim();
  let zh = "";
  try { zh = (await tr(en))[0].translation_text.trim(); } catch { /* counted below */ }
  const { title, desc } = derive(zh);
  const kwHit = kws.some((k) => en.toLowerCase().includes(k));
  const ok =
    Boolean(title) && title.length <= 16 &&
    Boolean(desc) && desc.length <= 60 &&
    zh.length > 0 && kwHit;
  if (ok) pass++;
  rows.push({ file, en, zh, title, desc, kwHit, ok });
}

console.table(
  rows.map((r) => ({
    photo: r.file,
    EN_caption: r.en,
    ZH: r.zh,
    title: r.title,
    kw_hit: r.kwHit ? "✓" : "✗",
    ok: r.ok ? "✓" : "✗",
  }))
);
console.log(`quality: ${pass}/${seeds.length} photos pass (structure + keyword relevance)`);

if (pass < seeds.length) process.exit(1); // threshold: every seeded photo must produce a relevant caption
