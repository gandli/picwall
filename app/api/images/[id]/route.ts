import { NextRequest, NextResponse } from "next/server";
import { deleteImage, updateImageMeta } from "@/lib/store";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteImage(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 404 });
}

// persist browser-generated caption (SmolVLM runs client-side; server only stores)
const CAPTION_LIMITS = { title: 40, desc: 200 };
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.slice(0, CAPTION_LIMITS.title) : undefined;
  const desc = typeof body?.desc === "string" ? body.desc.slice(0, CAPTION_LIMITS.desc) : undefined;
  if (title === undefined && desc === undefined) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const updated = await updateImageMeta(id, {
    ...(title !== undefined && { title }),
    ...(desc !== undefined && { desc }),
  });
  return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 404 });
}
