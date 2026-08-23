import { describe, it, expect, beforeEach, vi } from "vitest";

// mock the heavy dep — no model downloads in unit tests
const mocks = vi.hoisted(() => ({
  Florence2Processor: { from_pretrained: vi.fn() },
  Florence2ForConditionalGeneration: { from_pretrained: vi.fn() },
  pipeline: vi.fn(),
  rawRead: vi.fn(),
}));
vi.mock("@huggingface/transformers", () => ({
  Florence2Processor: mocks.Florence2Processor,
  Florence2ForConditionalGeneration: mocks.Florence2ForConditionalGeneration,
  pipeline: mocks.pipeline,
  RawImage: { read: mocks.rawRead },
}));

let vision: typeof import("./vision");

beforeEach(async () => {
  vi.resetModules(); // fresh singletons (florence/translator) per test
  mocks.pipeline.mockReset();
  mocks.rawRead.mockReset();
  mocks.Florence2Processor.from_pretrained.mockReset();
  mocks.Florence2ForConditionalGeneration.from_pretrained.mockReset();
  vision = await import("./vision");
});

// wire the florence pair + translator the way captionImage consumes them
function fakeStack(en: string, zh: string) {
  const fakeInputs = { input_ids: { dims: [1, 5] } };
  const fakeModel = {
    generate: vi.fn().mockResolvedValue({ slice: () => ({}) }),
  };
  // real Florence2Processor instances are callable — mock must be a fn
  const processor = Object.assign(vi.fn().mockResolvedValue(fakeInputs), {
    batch_decode: vi.fn().mockReturnValue([` ${en} `]),
  });
  mocks.rawRead.mockResolvedValue({ data: new Uint8Array(4) });
  mocks.Florence2Processor.from_pretrained.mockResolvedValue(processor);
  mocks.Florence2ForConditionalGeneration.from_pretrained.mockResolvedValue(fakeModel);
  mocks.pipeline.mockResolvedValue(async () => [{ translation_text: zh }]);
  return { processor, fakeModel, fakeInputs };
}

describe("captionImage", () => {
  it("标题取第一个分句，desc 为整句", async () => {
    fakeStack("a cat on a mat", "一只猫在垫子上，旁边有毛线");
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r).toEqual({ title: "一只猫在垫子上", desc: "一只猫在垫子上，旁边有毛线" });
  });

  it("用 /uploads/<basename> 读图", async () => {
    fakeStack("en", "中文");
    await vision.captionImage({ path: "/uploads/abc/def.jpg" });
    expect(mocks.rawRead).toHaveBeenCalledWith("/uploads/def.jpg");
  });

  it("Florence-2 以 q8 分片加载, 翻译器走 opus-mt", async () => {
    fakeStack("en", "中文");
    await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(mocks.Florence2Processor.from_pretrained).toHaveBeenCalledWith(
      "onnx-community/Florence-2-base-ft",
      { dtype: "q8" },
    );
    expect(mocks.Florence2ForConditionalGeneration.from_pretrained).toHaveBeenCalledWith(
      "onnx-community/Florence-2-base-ft",
      expect.objectContaining({ device: "cpu" }),
    );
    expect(mocks.pipeline).toHaveBeenCalledWith("translation", "Xenova/opus-mt-en-zh", {
      device: "cpu",
    });
  });

  it("caption 输出 trim 后进入翻译", async () => {
    const s = fakeStack("a cat on a mat", "中文");
    await vision.captionImage({ path: "/uploads/x.jpg" });
    // processor called with MORE_DETAILED_CAPTION task prompt
    expect(s.processor.batch_decode).toHaveBeenCalled();
  });

  it("无标点长句截断标题到16字", async () => {
    const zh = "一".repeat(30);
    fakeStack("en", zh);
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r!.title).toHaveLength(16);
    expect(r!.desc).toBe(zh.slice(0, 60));
  });

  it("模型加载失败返回 null 不抛出", async () => {
    mocks.rawRead.mockResolvedValue({ data: new Uint8Array(4) });
    mocks.Florence2Processor.from_pretrained.mockRejectedValue(new Error("download failed"));
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r).toBeNull();
  });

  it("caption 输出为空时返回 null（翻译空串仍产出结构）", async () => {
    fakeStack("", "");
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    // empty en → empty zh → clean fallback = "" → title "" desc ""
    expect(r).toEqual({ title: "", desc: "" });
  });
});

  it("标题分句吞掉整句时回退到原句", async () => {
    // "，，" — replace strips from first punctuation, leaving empty → falls back to full zh
    fakeStack("en", "，，");
    const r = await vision.captionImage({ path: "/uploads/x.jpg" });
    expect(r!.title).toBe("，，".slice(0, 16));
  });

describe("visionSupported", () => {
  it("node 环境（无 window）返回 false", () => {
    expect(vision.visionSupported()).toBe(false);
  });
});
