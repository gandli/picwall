import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { addImage, getImages, UPLOAD_DIR } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getImages());
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
    const meta = addImage({
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
