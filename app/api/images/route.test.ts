import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

let tmpDir: string;
let route: typeof import("./route");
const MAX_SIZE = 20 * 1024 * 1024;

// valid JPEG magic bytes (FF D8 FF) — minimal fake image header
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

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
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_SIZE - JPEG.length)]);
    const res = await route.POST(postForm([["files", new File([big], "exact.jpg")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].path).toMatch(/^\/uploads\/[a-z0-9]+\.jpg$/);
    expect(fs.readdirSync(path.join(tmpDir, "uploads"))).toHaveLength(1);
  });

  it("超过 20MB 拒绝且不写盘", async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_SIZE + 1024 * 1024 - JPEG.length)]);
    const res = await route.POST(postForm([["files", new File([big], "too-big.jpg")]]));
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
    const res = await route.POST(postForm([["files", new File([JPEG], "evil.sh")]]));
    const out = await res.json();
    expect(out[0].error).toContain("不支持的文件类型");
    expect(out[0].filename).toBe("evil.sh");
    expect(fs.readdirSync(path.join(tmpDir, "uploads"))).toHaveLength(0);
  });

  it("超长文件名 title 截断到 16 字符", async () => {
    const res = await route.POST(postForm([["files", new File([JPEG], "a-very-very-long-image-name.jpg")]]));
    const out = await res.json();
    expect(out[0].title.length).toBeLessThanOrEqual(16);
    expect(out[0].title).toBe("a-very-very-long");
  });

  it("file 单字段兼容上传", async () => {
    const res = await route.POST(postForm([["file", new File([JPEG], "single.jpg")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe("single.jpg");
  });

  it("files 数组里混入非 File 项被跳过", async () => {
    const res = await route.POST(postForm([["files", "not-a-file"], ["files", new File([JPEG], "real.jpg")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe("real.jpg");
  });

  it("无扩展名文件 ext 兜底 jpg", async () => {
    const res = await route.POST(postForm([["files", new File([JPEG], "noext")]]));
    const out = await res.json();
    expect(out[0].path).toMatch(/\.jpg$/);
  });

  it("魔数不符拒绝（SVG 伪装 .jpg → 存储型 XSS 防护）", async () => {
    const svg = Buffer.from("<svg onload=alert(1) xmlns='http://www.w3.org/2000/svg'/>");
    const res = await route.POST(postForm([["files", new File([svg], "evil.jpg")]]));
    const out = await res.json();
    expect(out[0].error).toContain("文件内容与扩展名不符");
    expect(fs.readdirSync(path.join(tmpDir, "uploads"))).toHaveLength(0);
  });

  it("真实 PNG 魔数通过", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const res = await route.POST(postForm([["files", new File([png], "real.png")]]));
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0].path).toMatch(/\.png$/);
  });

  it("webp/bmp/gif 魔数通过", async () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
    const bmp = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const res = await route.POST(postForm([
      ["files", new File([webp], "a.webp")],
      ["files", new File([bmp], "b.bmp")],
      ["files", new File([gif], "c.gif")],
      ["files", new File([JPEG], "d.jpeg")],
    ]));
    const out = await res.json();
    expect(out).toHaveLength(4);
    expect(out.map((x: { path: string }) => x.path)).toEqual([
      expect.stringMatching(/\.webp$/),
      expect.stringMatching(/\.bmp$/),
      expect.stringMatching(/\.gif$/),
      expect.stringMatching(/\.jpeg$/),
    ]);
  });

  it("未知扩展名魔数兜底拒绝", async () => {
    const res = await route.POST(postForm([["files", new File([JPEG], "x.xyz")]]));
    const out = await res.json();
    expect(out[0].error).toContain("不支持的文件类型");
  });
});

describe("GET /api/images", () => {
  it("publicMeta 剔除 filename", async () => {
    await route.POST(postForm([["files", new File([JPEG], "a.jpg")]]));
    const res = await route.GET();
    const out = await res.json();
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("filename");
    expect(out[0]).toHaveProperty("path");
    expect(out[0]).toHaveProperty("uploaded_at");
  });

  it("manifest 损坏 → 500 而非静默空墙", async () => {
    fs.writeFileSync(process.env.PICWALL_MANIFEST!, "{corrupt");
    const res = await route.GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("manifest");
  });
});
