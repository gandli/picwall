import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

let tmpDir: string;
let route: typeof import("./route");
const MAX_SIZE = 20 * 1024 * 1024;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "picwall-api-test-"));
  process.env.PICWALL_DATA_DIR = path.join(tmpDir, "uploads");
  process.env.PICWALL_MANIFEST = path.join(tmpDir, "manifest.json");
  vi.resetModules();
  route = await import("./route");
});

afterEach(() => {
  delete process.env.PICWALL_DATA_DIR;
  delete process.env.PICWALL_MANIFEST;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function postForm(entries: Array<[string, string | File]>): NextRequest {
  const form = new FormData();
  for (const [k, v] of entries) form.append(k, v);
  return new NextRequest("http://localhost/api/images", { method: "POST", body: form });
}

describe("POST /api/images", () => {
  it("恰好 20MB 通过并写盘", async () => {
    const res = await route.POST(postForm([["files", new File([Buffer.alloc(MAX_SIZE)], "exact.jpg")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].path).toMatch(/^\/uploads\/[a-z0-9]+\.jpg$/);
    expect(fs.readdirSync(path.join(tmpDir, "uploads"))).toHaveLength(1);
  });

  it("超过 20MB 拒绝且不写盘", async () => {
    const res = await route.POST(postForm([["files", new File([Buffer.alloc(MAX_SIZE + 1024 * 1024)], "too-big.jpg")]]));
    const out = await res.json();
    expect(out[0]).toEqual({ error: expect.stringContaining("20MB"), filename: "too-big.jpg" });
    expect(fs.existsSync(path.join(tmpDir, "uploads")) ? fs.readdirSync(path.join(tmpDir, "uploads")).length : 0).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "manifest.json"))).toBe(false);
  });

  it("无文件上传返回空数组", async () => {
    const res = await route.POST(postForm([["note", "hello"]]));
    expect(await res.json()).toEqual([]);
  });

  it("非法扩展名返回 error 且不写盘", async () => {
    const res = await route.POST(postForm([["files", new File([Buffer.from("x")], "evil.sh")]]));
    const out = await res.json();
    expect(out[0].error).toContain("不支持的文件类型");
    expect(out[0].filename).toBe("evil.sh");
    expect(fs.readdirSync(path.join(tmpDir, "uploads"))).toHaveLength(0);
  });

  it("超长文件名 title 截断到 16 字符", async () => {
    const res = await route.POST(postForm([["files", new File([Buffer.from("x")], "a-very-very-long-image-name.jpg")]]));
    const out = await res.json();
    expect(out[0].title.length).toBeLessThanOrEqual(16);
    expect(out[0].title).toBe("a-very-very-long");
  });

  it("file 单字段兼容上传", async () => {
    const res = await route.POST(postForm([["file", new File([Buffer.from("x")], "single.jpg")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe("single.jpg");
  });

  it("files 数组里混入非 File 项被跳过", async () => {
    const res = await route.POST(postForm([["files", "not-a-file"], ["files", new File([Buffer.from("x")], "real.jpg")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe("real.jpg");
  });

  it("无扩展名文件 ext 兜底 jpg", async () => {
    const res = await route.POST(postForm([["files", new File([Buffer.from("x")], "noext")]]));
    const out = await res.json();
    expect(out[0].path).toMatch(/\.jpg$/);
  });
});

describe("GET /api/images", () => {
  it("publicMeta 剔除 filename", async () => {
    await route.POST(postForm([["files", new File([Buffer.from("x")], "a.jpg")]]));
    const res = await route.GET();
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("filename");
    expect(out[0]).toHaveProperty("path");
    expect(out[0]).toHaveProperty("uploaded_at");
  });
});
