import { describe, it, expect, beforeEach, vi } from "vitest";

// mock the heavy dep — no model downloads in unit tests
const mocks = vi.hoisted(() => ({
  pipeline: vi.fn(),
  rawRead: vi.fn(),
}));
vi.mock("@huggingface/transformers", () => ({
  pipeline: mocks.pipeline,
  RawImage: { read: mocks.rawRead },
}));

let vision: typeof import("./vision");

beforeEach(async () => {
  vi.resetModules(); // fresh singletons (capper/translator) per test
  mocks.pipeline.mockReset();
  mocks.rawRead.mockReset();
  vision = await import("./vision");
});

function fakePipelines(en: string, zh: string) {
  mocks.rawRead.mockResolvedValue({ data: new Uint8Array(4) });
  mocks.pipeline.mockImplementation(async (task: string) =>
    task === "image-to-text"
      ? async () => [{ generated_text: en }]
      : async () => [{ translation_text: zh }],
  );
}

describe("captionImage", () => {
  it("标题取第一个分句，desc 为整句", async () => {
    fakePipelines("a cat on a mat", "一只猫在垫子上，旁边有毛线");
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r).toEqual({ title: "一只猫在垫子上", desc: "一只猫在垫子上，旁边有毛线" });
  });

  it("用 /uploads/<basename> 读图", async () => {
    fakePipelines("en", "中文");
    await vision.captionImage({ path: "/uploads/abc/def.jpg" });
    expect(mocks.rawRead).toHaveBeenCalledWith("/uploads/def.jpg");
  });

  it("pipeline 以 wasm 设备加载两个指定模型", async () => {
    fakePipelines("en", "中文");
    await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(mocks.pipeline).toHaveBeenCalledWith(
      "image-to-text",
      "Xenova/vit-gpt2-image-captioning",
      { device: "wasm" },
    );
    expect(mocks.pipeline).toHaveBeenCalledWith("translation", "Xenova/opus-mt-en-zh", {
      device: "wasm",
    });
  });

  it("无标点长句截断标题到16字", async () => {
    const zh = "一".repeat(30);
    fakePipelines("en", zh);
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r!.title).toHaveLength(16);
    expect(r!.desc).toBe(zh.slice(0, 60));
  });

  it("模型加载失败返回 null 不抛出", async () => {
    mocks.pipeline.mockRejectedValue(new Error("download failed"));
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r).toBeNull();
  });

  it("caption 输出为空时返回 null", async () => {
    mocks.rawRead.mockResolvedValue({});
    mocks.pipeline.mockImplementation(async (task: string) =>
      task === "image-to-text" ? async () => [] : async () => [{ translation_text: "x" }],
    );
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r).toBeNull();
  });
});


  it("标题分句吞掉整句时回退到原句", async () => {
    // "，，" — replace strips from first punctuation, leaving empty → falls back to full zh
    fakePipelines("en", "，，");
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r!.title).toBe("，，".slice(0, 16));
  });

describe("visionSupported", () => {
  it("node 环境（无 window）返回 false", () => {
    expect(vision.visionSupported()).toBe(false);
  });
});
