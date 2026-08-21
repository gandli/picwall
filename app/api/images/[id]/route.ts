import { NextRequest, NextResponse } from "next/server";
import { deleteImage } from "@/lib/store";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteImage(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 404 });
}
