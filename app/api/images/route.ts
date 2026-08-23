import { NextRequest, NextResponse } from "next/server";
import { addImage, getImagesStrict } from "@/lib/store";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

// magic-byte sniff: extension check alone lets SVG/HTML masquerade as .jpg
// (public/uploads symlink serves them with real content-type → stored XSS)
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  jpg: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  gif: (b) => b.length > 5 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  webp: (b) => b.length > 11 && b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP",
  bmp: (b) => b.length > 1 && b[0] === 0x42 && b[1] === 0x4d,
};

function sniffImage(buf: Buffer, ext: string): boolean {
  const check = MAGIC[ext];
  // defensive: ext whitelist above already gates every call, so `check` is
  // always defined in practice.
  /* v8 ignore next 1 -- unreachable else branch (ext gated upstream) */
  return check ? check(buf) : false;
}

function publicMeta(m: { id: string; path: string; width: number; height: number; size: number; title: string; desc: string; uploaded_at: string }) {
  return { id: m.id, path: m.path, width: m.width, height: m.height, size: m.size, title: m.title, desc: m.desc, uploaded_at: m.uploaded_at };
}

export async function GET() {
  try {
    return NextResponse.json(getImagesStrict().map(publicMeta));
  } catch {
    // corrupt manifest: surface as server error so the UI shows its error
    // state instead of a misleading empty wall
    return NextResponse.json({ error: "manifest corrupted" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files");
  if (!files.length) {
    const single = form.get("file");
    if (single) files.push(single);
  }
  const out = [];
  for (const f of files) {
    if (!(f instanceof File)) continue;
    const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || "jpg").toLowerCase();
    if (!["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) {
      out.push({ error: `不支持的文件类型: ${ext}`, filename: f.name });
      continue;
    }
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length > MAX_SIZE) {
      out.push({ error: `文件过大（>20MB）`, filename: f.name });
      continue;
    }
    if (!sniffImage(buf, ext)) {
      out.push({ error: `文件内容与扩展名不符，已拒绝`, filename: f.name });
      continue;
    }
    const meta = await addImage({
      filename: f.name,
      size: buf.length,
      width: 0,
      height: 0,
      title: f.name.replace(/\.[^.]+$/, "").slice(0, 16),
      desc: "",
      buf,
    });
    out.push(meta);
  }
  return NextResponse.json(out);
}
