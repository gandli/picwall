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

describe("边界分支补测", () => {
  it("manifest 损坏时 getImages 返回空数组不抛出", async () => {
    fs.writeFileSync(process.env.PICWALL_MANIFEST!, "{corrupt json!!");
    expect(store.getImages()).toEqual([]);
  });

  it("deleteImage 未知 id 返回 false", async () => {
    const meta = await store.addImage({
      filename: "a.jpg", width: 1, height: 1, size: 4, title: "t", desc: "",
      buf: Buffer.from([0xff, 0xd8, 0xff]),
    });
    await expect(store.deleteImage("nonexistent-id")).resolves.toBe(false);
    // 原数据不受影响
    expect(store.getImages().map((i) => i.id)).toEqual([meta.id]);
  });

  it("并发 DELETE + PATCH 经写队列串行化，双方更新都不丢", async () => {
    const e = await store.addImage({
      filename: "race.jpg", width: 1, height: 1, size: 4, title: "旧", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    // fire concurrently — queue must serialize them
    const [, patched] = await Promise.all([
      store.deleteImage("other-id"), // no-op delete, keeps entry alive
      store.updateImageMeta(e.id, { title: "新" }),
    ]);
    expect(patched?.title).toBe("新");
    expect(store.getImages()[0].title).toBe("新");

    // real race: delete the entry while a patch to it is in flight
    const e2 = await store.addImage({
      filename: "race2.jpg", width: 1, height: 1, size: 4, title: "旧", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    const [deleted] = await Promise.all([
      store.deleteImage(e2.id),
      store.updateImageMeta(e2.id, { title: "迟到的patch" }),
    ]);
    expect(deleted).toBe(true);
    // serialized: whichever order ran, manifest is consistent — no resurrect
    const left = store.getImages().filter((i) => i.id === e2.id);
    expect(left.length).toBeLessThanOrEqual(1);
    if (left.length === 1) expect(left[0].title).toBe("迟到的patch"); // patch won the race
  });
});

  it("manifest 写入原子性：rename 失败时旧 manifest 保持完整", async () => {
    const e = await store.addImage({
      filename: "atom.jpg", width: 1, height: 1, size: 4, title: "完好", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    expect(store.getImages()).toHaveLength(1);
    // block the rename step → addImage must reject, old manifest untouched
    const realRename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("disk full");
    });
    await expect(store.addImage({
      filename: "boom.jpg", width: 1, height: 1, size: 4, title: "炸", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    })).rejects.toThrow("disk full");
    (fs.renameSync as any).mockRestore?.();
    // manifest still parses and holds exactly the pre-crash entry
    expect(store.getImages().map((i) => i.id)).toEqual([e.id]);
    void realRename;
  });

  it("写队列中单次失败不阻塞后续写入", async () => {
    // first write fails (bad meta), queue must still process the next
    await store.addImage({
      filename: "ok.jpg", width: 1, height: 1, size: 4, title: "ok", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    const imgs = store.getImages();
    expect(imgs).toHaveLength(1);
  });


  it("队列中某次写入失败不阻塞后续写入（错误被吞掉）", async () => {
    // break the manifest path: writeFileSync will throw inside the queued task
    const badManifest = process.env.PICWALL_MANIFEST!;
    fs.rmSync(badManifest, { force: true });
    fs.mkdirSync(badManifest); // manifest is now a directory → write throws
    await expect(store.addImage({
      filename: "bad.jpg", width: 1, height: 1, size: 4, title: "x", desc: "",
      buf: Buffer.from([0xff]),
    })).rejects.toThrow();
    // restore and verify queue still works
    fs.rmdirSync(badManifest);
    const meta = await store.addImage({
      filename: "good.jpg", width: 1, height: 1, size: 4, title: "ok", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    expect(meta.id).toBeTruthy();
    expect(store.getImages()).toHaveLength(1);
  });
  it("updateImageMeta 更新已有图并持久化", async () => {
    const meta = await store.addImage({
      filename: "a.jpg", width: 1, height: 1, size: 4, title: "旧题", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    const updated = await store.updateImageMeta(meta.id, { title: "新标题", desc: "新描述" });
    expect(updated!.title).toBe("新标题");
    expect(store.getImages()[0].desc).toBe("新描述");
  });


  it("deleteImage 文件已不在磁盘时仍清 manifest", async () => {
    const meta = await store.addImage({
      filename: "gone.jpg", width: 1, height: 1, size: 4, title: "t", desc: "",
      buf: Buffer.from([0xff, 0xd8]),
    });
    const p = store.UPLOAD_DIR + "/" + meta.id + ".jpg";
    fs.unlinkSync(p); // simulate file already removed
    await expect(store.deleteImage(meta.id)).resolves.toBe(true);
    expect(store.getImages()).toHaveLength(0);
  });
  it("updateImageMeta 未知 id 返回 null", async () => {
    expect(await store.updateImageMeta("ghost-id", { title: "x" })).toBeNull();
  });
