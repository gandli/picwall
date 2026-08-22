// CI-only: create fixtures for E2E + manual screenshots. uploads/ + manifest.json
// are gitignored, so a fresh checkout has neither — generate both from a known
// seed list. Photos come from Unsplash (stable CDN ids) so the wall renders real
// imagery; falls back to a minimal JPEG stub when offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// JPEG magic + minimal EOI (10 bytes header + FFD9) — offline fallback only
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

// E2E expects exactly 5 cards
const seeds = [
  ["0p3jjb6w8q9j", "u1", "photo-1506905925346-21bda4d32df4"], // mountain dusk
  ["l469vo1wvxk", "u2", "photo-1519681393784-d120267933ba"], // snowy peak night
  ["e72m8pezbc6", "u3", "photo-1470770841072-f978cf4d019e"], // lake cabin
  ["7v7d4ed99bx", "u4", "photo-1441974231531-c6227db76b6e"], // forest road
  ["wx7a6sabe99", "u5", "photo-1501594907352-04cda38ebc29"], // golden gate
];

async function fetchPhoto(url) {
  try {
    const res = await fetch(`${url}?w=800&q=70&fm=jpg&fit=crop`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null; // sanity: real image, not error page
  } catch {
    return null;
  }
}

fs.mkdirSync(path.join(root, "uploads"), { recursive: true });
const manifest = [];
for (let i = 0; i < seeds.length; i++) {
  const [id, title, photoId] = seeds[i];
  const data = (await fetchPhoto(`https://images.unsplash.com/${photoId}`)) ?? jpg;
  fs.writeFileSync(path.join(root, "uploads", `${id}.jpg`), data);
  manifest.push({
    id,
    path: `/uploads/${id}.jpg`,
    width: 400,
    height: 400,
    size: data.length,
    title,
    desc: "",
    uploaded_at: `2026-08-21T12:0${i}:00.000Z`,
  });
}
fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`seeded ${manifest.length} fixture images`);
