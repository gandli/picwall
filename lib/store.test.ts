import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmpDir: string;
let store: typeof import("../lib/store");

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "picwall-test-"));
  process.env.PICWALL_DATA_DIR = path.join(tmpDir, "uploads");
  process.env.PICWALL_MANIFEST = path.join(tmpDir, "manifest.json");
  vi.resetModules();
  store = await import("../lib/store");
});

afterEach(() => {
  delete process.env.PICWALL_DATA_DIR;
  delete process.env.PICWALL_MANIFEST;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("updateImageMeta", () => {
  it("更新 title/desc 并写回 manifest（持久化）", async () => {
    const e = await store.addImage({ filename: "a.jpg", size: 10, width: 1, height: 1, title: "", desc: "" });
    const updated = await store.updateImageMeta(e.id, { title: "海边", desc: "日落时分的海滩" });
    expect(updated?.title).toBe("海边");
    // reload from disk — proves persistence
    expect(store.getImages()[0].title).toBe("海边");
    expect(store.getImages()[0].desc).toBe("日落时分的海滩");
  });

  it("未知 id 返回 null", async () => {
    await expect(store.updateImageMeta("nope", { title: "x" })).resolves.toBeNull();
  });

  it("部分 patch 只改指定字段", async () => {
    const e = await store.addImage({ filename: "b.jpg", size: 10, width: 1, height: 1, title: "原", desc: "原述" });
    await store.updateImageMeta(e.id, { title: "新" });
    const [img] = store.getImages();
    expect(img.title).toBe("新");
    expect(img.desc).toBe("原述");
  });
});
