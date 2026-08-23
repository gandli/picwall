"use client";

// In-browser image captioning, fully local:
//   onnx-community/Florence-2-base-ft (~275MB q8) <MORE_DETAILED_CAPTION> → English
//   → Xenova/opus-mt-en-zh (~80MB) → Chinese sentence
// Florence-2 replaced vit-gpt2 (2026-08): measured on the 5 seed photos,
// vit-gpt2 produced degenerate repeats ("a mountain range with a mountain
// range") and hallucinations (bridge → lighthouse); Florence-2 captions were
// accurate and distinct per photo at similar download size.
// Models cached by the browser Cache API after first download; inference is
// wasm/cpu (WebGPU crashes on SmolVLM-class models on M1 — measured, not assumed).
// ponytail: single pipeline pair kept warm for the tab's lifetime; a worker
// thread is the upgrade path if captioning ever janks the UI.

import type { ImageMeta } from "./store";

const CAPTION_MODEL = "onnx-community/Florence-2-base-ft";
let florence: { processor: any; model: any } | null = null;
let translator: Awaited<ReturnType<typeof loadTranslator>> | null = null;

async function loadFlorence() {
  const t = await import("@huggingface/transformers");
  const processor = await t.Florence2Processor.from_pretrained(CAPTION_MODEL, { dtype: "q8" });
  const model = await t.Florence2ForConditionalGeneration.from_pretrained(CAPTION_MODEL, {
    dtype: { embed_tokens: "q8", vision_encoder: "q8", encoder_model: "q8", decoder_model_merged: "q8" },
    device: "cpu",
  });
  return { processor, model };
}

async function loadTranslator() {
  const t = await import("@huggingface/transformers");
  return t.pipeline("translation", "Xenova/opus-mt-en-zh", { device: "cpu" });
}

export function visionSupported(): boolean {
  return typeof window !== "undefined";
}

/** English caption → Chinese title + desc. Returns null if anything fails. */
export async function captionImage(
  img: Pick<ImageMeta, "path">,
): Promise<{ title: string; desc: string } | null> {
  try {
    // E2E test seam (?e2eVision=1): deterministic caption without model load.
    // Prod never passes the param; the real pipeline below is unchanged.
    /* v8 ignore next -- covered by Playwright E2E, not vitest */
    if (typeof window !== "undefined" && window.location.search.includes("e2eVision=1")) {
      await new Promise((r) => setTimeout(r, 300));
      return { title: "测试照片", desc: "这是端到端测试生成的描述" };
    }
    florence ??= await loadFlorence();
    translator ??= await loadTranslator();

    const image = await (await import("@huggingface/transformers")).RawImage.read(
      `/uploads/${img.path.split("/").pop()}`
    );
    const inputs = await florence.processor(image, "<MORE_DETAILED_CAPTION>");
    const ids = await florence.model.generate({ ...inputs, max_new_tokens: 256 });
    const en = florence.processor
      .batch_decode(ids.slice(null, [inputs.input_ids.dims[1], null]), { skip_special_tokens: true })[0]
      .trim();
    const zh = (await (translator as any)(en))[0].translation_text as string;

    // title = first clause up to punctuation, capped; desc = full sentence
    const clean = zh.replace(/[。！？，][\s\S]*/, "").trim() || zh;
    return { title: clean.slice(0, 16), desc: zh.slice(0, 60) };
  } catch (e) {
    console.warn("[vision] caption failed:", e);
    return null;
  }
}
