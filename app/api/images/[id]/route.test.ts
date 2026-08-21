import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

let tmpDir: string;
let route: typeof import("./route");
let store: typeof import("@/lib/store");

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "picwall-del-test-"));
  process.env.PICWALL_DATA_DIR = path.join(tmpDir, "uploads");
  process.env.PICWALL_MANIFEST = path.join(tmpDir, "manifest.json");
  vi.resetModules();
  store = await import("@/lib/store");
  route = await import("./route");
});

afterEach(() => {
  delete process.env.PICWALL_DATA_DIR;
  delete process.env.PICWALL_MANIFEST;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("DELETE /api/images/[id]", () => {
  it("删除存在的图片返回 ok:true", async () => {
    const e = await store.addImage({ filename: "d.jpg", size: 1, width: 0, height: 0, title: "", desc: "", buf: Buffer.from("x") });
    const res = await route.DELETE(new NextRequest("http://localhost"), { params: Promise.resolve({ id: e.id }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.getImages()).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, "uploads", `${e.id}.jpg`))).toBe(false);
  });

  it("不存在的 id 返回 404 ok:false", async () => {
    const res = await route.DELETE(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false });
  });
});
