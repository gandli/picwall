"use client";

// In-browser image captioning, fully local:
//   Xenova/vit-gpt2-image-captioning (~246MB q8) → English caption
//   → Xenova/opus-mt-en-zh (~80MB) → Chinese sentence
// Models cached by the browser Cache API after first download; inference is
// wasm (WebGPU crashes on SmolVLM-class models on M1 — measured, not assumed).
// ponytail: single pipeline pair kept warm for the tab's lifetime; a worker
// thread is the upgrade path if captioning ever janks the UI.

import type { ImageMeta } from "./store";

type Pipe = {
  processor: unknown;
  model: unknown;
};

let capper: Awaited<ReturnType<typeof loadCaptioner>> | null = null;
let translator: Awaited<ReturnType<typeof loadTranslator>> | null = null;

async function loadCaptioner() {
  const t = await import("@huggingface/transformers");
  return t.pipeline("image-to-text", "Xenova/vit-gpt2-image-captioning", { device: "wasm" });
}

async function loadTranslator() {
  const t = await import("@huggingface/transformers");
  return t.pipeline("translation", "Xenova/opus-mt-en-zh", { device: "wasm" });
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
    const t = await import("@huggingface/transformers");
    capper ??= await loadCaptioner();
    translator ??= await loadTranslator();

    const raw = await t.RawImage.read(`/uploads/${img.path.split("/").pop()}`);
    const out = (await (capper as any)(raw, { max_new_tokens: 30 }))[0]
      .generated_text as string;
    const zh = (await (translator as any)(out))[0].translation_text as string;

    // title = first clause up to punctuation, capped; desc = full sentence
    const clean = zh.replace(/[。！？，][\s\S]*/, "").trim() || zh;
    return { title: clean.slice(0, 16), desc: zh.slice(0, 60) };
  } catch (e) {
    console.warn("[vision] caption failed:", e);
    return null;
  }
}
