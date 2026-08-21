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

describe("store", () => {
  it("addImage 生成 id + /uploads/ 路径", async () => {
    const e = await store.addImage({ filename: "a.jpg", size: 10, width: 0, height: 0, title: "t", desc: "" });
    expect(e.id).toBeTruthy();
    expect(e.path).toMatch(/^\/uploads\/[a-z0-9]+\.jpg$/);
  });

  it("ext 白名单外文件名兜底 .jpg", async () => {
    const e = await store.addImage({ filename: "evil.sh", size: 1, width: 0, height: 0, title: "", desc: "" });
    expect(e.path).toMatch(/\.jpg$/);
  });

  it("getImages 返回刚添加的条目", async () => {
    await store.addImage({ filename: "b.png", size: 5, width: 0, height: 0, title: "x", desc: "" });
    const list = store.getImages();
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe("b.png");
  });

  it("getImages 在损坏 JSON 时返回空数组", () => {
    fs.writeFileSync(process.env.PICWALL_MANIFEST!, "{broken");
    expect(store.getImages()).toEqual([]);
  });

  it("getImages 无 manifest 时返回空数组", () => {
    expect(store.getImages()).toEqual([]);
  });

  it("deleteImage 删除条目", async () => {
    const e = await store.addImage({ filename: "c.jpg", size: 3, width: 0, height: 0, title: "", desc: "" });
    expect(store.deleteImage(e.id)).toBe(true);
    expect(store.getImages()).toHaveLength(0);
  });

  it("deleteImage 不存在的 id 返回 false", () => {
    expect(store.deleteImage("nope")).toBe(false);
  });

  it("并发 addImage 不丢条目", async () => {
    await Promise.all([
      store.addImage({ filename: "1.jpg", size: 1, width: 0, height: 0, title: "", desc: "" }),
      store.addImage({ filename: "2.jpg", size: 1, width: 0, height: 0, title: "", desc: "" }),
      store.addImage({ filename: "3.jpg", size: 1, width: 0, height: 0, title: "", desc: "" }),
    ]);
    expect(store.getImages()).toHaveLength(3);
  });

  it("evl.sh 非法 ext 兜底 .jpg", async () => {
    const e = await store.addImage({ filename: "evil.sh", size: 1, width: 0, height: 0, title: "", desc: "" });
    expect(e.path).toMatch(/\.jpg$/);
    expect(e.path).not.toMatch(/\.sh$/);
  });

  it("超长 title 不截断 (store 层原样保存)", async () => {
    const long = "x".repeat(100);
    const e = await store.addImage({ filename: "a.jpg", size: 1, width: 0, height: 0, title: long, desc: "" });
    expect(e.title).toBe(long);
    expect(store.getImages()[0].title).toBe(long);
  });

  it("先写文件后写 manifest：文件写失败不留 manifest 条目", async () => {
    const e = await store.addImage({ filename: "a.jpg", size: 1, width: 0, height: 0, title: "", desc: "", buf: Buffer.from("x") });
    // 模拟文件写失败：删掉 DATA_DIR 后再次 addImage with buf
    fs.rmSync(path.join(tmpDir, "uploads"), { recursive: true, force: true });
    fs.writeFileSync(path.join(tmpDir, "uploads"), "now-a-file");
    await expect(
      store.addImage({ filename: "b.jpg", size: 1, width: 0, height: 0, title: "", desc: "", buf: Buffer.from("y") })
    ).rejects.toThrow();
    // manifest 仍只有第一条
    expect(store.getImages()).toHaveLength(1);
  });

  it("getImages 在 manifest 是数组但缺字段时仍返回", async () => {
    fs.writeFileSync(process.env.PICWALL_MANIFEST!, JSON.stringify([{ id: "x" }]));
    expect(store.getImages()).toEqual([{ id: "x" }]);
  });

  it("deleteImage 同时删除磁盘文件", async () => {
    const e = await store.addImage({ filename: "c.jpg", size: 3, width: 0, height: 0, title: "", desc: "", buf: Buffer.from("x") });
    expect(store.deleteImage(e.id)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "uploads", `${e.id}.jpg`))).toBe(false);
  });
});

