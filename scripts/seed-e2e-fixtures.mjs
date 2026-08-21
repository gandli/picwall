// CI-only: create fixtures for E2E. uploads/ + manifest.json are gitignored,
// so a fresh checkout has neither — generate both from a known seed list.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// JPEG magic + minimal EOI (10 bytes header + FFD9)
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

// same seeds as local dev fixtures (picsum ids) — E2E expects exactly 5 cards
const seeds = [
  ["0p3jjb6w8q9j", "u1"],
  ["l469vo1wvxk", "u2"],
  ["e72m8pezbc6", "u3"],
  ["7v7d4ed99bx", "u4"],
  ["wx7a6sabe99", "u5"],
];

fs.mkdirSync(path.join(root, "uploads"), { recursive: true });
const manifest = seeds.map(([id, title], i) => {
  fs.writeFileSync(path.join(root, "uploads", `${id}.jpg`), jpg);
  return {
    id,
    path: `/uploads/${id}.jpg`,
    width: 400,
    height: 400,
    size: jpg.length,
    title,
    desc: "",
    uploaded_at: `2026-08-21T12:0${i}:00.000Z`,
  };
});
fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`seeded ${manifest.length} fixture images`);
