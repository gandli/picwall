// Caption quality eval: run the REAL Florence-2 → opus-mt-en-zh pipeline (same
// models as lib/vision.ts) against the 5 seeded fixture photos, then score
// title/desc quality. Downloads model weights on first run (~275MB, then
// browser/node cache). Not a CI gate — a local diagnostic:
//   run: node scripts/caption-quality.mjs
// Scoring per photo: structure (non-empty title ≤16, desc ≤60, derived exactly
// as vision.ts does) + keyword hit (seed's expected English nouns appear in the
// raw caption). Output: table + overall score; exit 1 if any caption is empty
// or translation fails outright.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const t = await import("@huggingface/transformers");

const processor = await t.Florence2Processor.from_pretrained("onnx-community/Florence-2-base-ft", {
  dtype: "q8",
});
const florence = await t.Florence2ForConditionalGeneration.from_pretrained(
  "onnx-community/Florence-2-base-ft",
  { dtype: { embed_tokens: "q8", vision_encoder: "q8", encoder_model: "q8", decoder_model_merged: "q8" }, device: "cpu" }
);
const tr = await t.pipeline("translation", "Xenova/opus-mt-en-zh", { device: "cpu", dtype: "q8" });

async function captionEn(file) {
  const image = await t.RawImage.read(path.join(root, "uploads", file));
  const inputs = await processor(image, "<MORE_DETAILED_CAPTION>");
  const ids = await florence.generate({ ...inputs, max_new_tokens: 256 });
  return processor.batch_decode(ids.slice(null, [inputs.input_ids.dims[1], null]), { skip_special_tokens: true })[0].trim();
}

// same derivation as vision.ts:57-58
function derive(zh) {
  const clean = zh.replace(/[。！？，][\s\S]*/, "").trim() || zh;
  return { title: clean.slice(0, 16), desc: zh.slice(0, 60) };
}

// seeds mirror scripts/seed-e2e-fixtures.mjs (+ keywords the true content shows)
const seeds = [
  // Florence-2 describes this shot as water+mountains (cabin too small to mention)
  ["e72m8pezbc6.jpg", ["mountain", "water", "lake", "cabin"]],
  ["7v7d4ed99bx.jpg", ["forest", "road", "trees"]],
  ["0p3jjb6w8q9j.jpg", ["mountain", "cloud", "snow"]],
  ["l469vo1wvxk.jpg", ["mountain", "snow", "night", "sky"]],
  ["wx7a6sabe99.jpg", ["bridge", "gate"]],
];

let pass = 0;
const rows = [];
for (const [file, kws] of seeds) {
  const en = await captionEn(file);
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
