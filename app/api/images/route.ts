import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { addImage, getImages, UPLOAD_DIR } from "@/lib/store";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

function publicMeta(m: { id: string; path: string; width: number; height: number; size: number; title: string; desc: string; uploaded_at: string }) {
  return { id: m.id, path: m.path, width: m.width, height: m.height, size: m.size, title: m.title, desc: m.desc, uploaded_at: m.uploaded_at };
}

export async function GET() {
  return NextResponse.json(getImages().map(publicMeta));
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
    const meta = await addImage({
      filename: f.name,
      size: buf.length,
      width: 0,
      height: 0,
      title: f.name.replace(/\.[^.]+$/, "").slice(0, 16),
      desc: "",
    });
    fs.writeFileSync(`${UPLOAD_DIR}/${meta.path.split("/").pop()}`, buf);
    out.push(meta);
  }
  return NextResponse.json(out);
}
