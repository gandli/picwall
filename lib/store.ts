import fs from "node:fs";
import path from "node:path";

export type ImageMeta = {
  id: string;
  filename: string;
  path: string;
  width: number;
  height: number;
  size: number;
  title: string;
  desc: string;
  uploaded_at: string;
};

const DATA_DIR = path.join(process.cwd(), "uploads");
const MANIFEST = path.join(process.cwd(), "manifest.json");

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

// serialize manifest writes so concurrent uploads don't clobber each other
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => T): Promise<T> {
  const run = writeQueue.then(fn);
  writeQueue = run.catch(() => {});
  return run;
}

export function getImages(): ImageMeta[] {
  if (!fs.existsSync(MANIFEST)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf-8"));
  } catch {
    return [];
  }
}

export function addImage(meta: Omit<ImageMeta, "id" | "path" | "uploaded_at">): Promise<ImageMeta> {
  return enqueue(() => {
    const id = Math.random().toString(36).slice(2, 14);
    const ext = ALLOWED_EXT.has(path.extname(meta.filename).toLowerCase().slice(1))
      ? path.extname(meta.filename).toLowerCase()
      : ".jpg";
    const fname = `${id}${ext}`;
    const images = getImages();
    const entry: ImageMeta = {
      ...meta,
      id,
      path: `/uploads/${fname}`,
      uploaded_at: new Date().toISOString(),
    };
    images.push(entry);
    fs.writeFileSync(MANIFEST, JSON.stringify(images, null, 2));
    return entry;
  });
}

export function deleteImage(id: string): boolean {
  const images = getImages();
  const target = images.find((i) => i.id === id);
  if (!target) return false;
  const p = path.join(DATA_DIR, path.basename(target.path));
  if (fs.existsSync(p)) fs.unlinkSync(p);
  fs.writeFileSync(
    MANIFEST,
    JSON.stringify(images.filter((i) => i.id !== id), null, 2)
  );
  return true;
}

export const UPLOAD_DIR = DATA_DIR;
