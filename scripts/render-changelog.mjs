// Merge TSV rows (type<TAB>prNumber<TAB>title) into CHANGELOG.md's Unreleased
// section. Creates the section if absent; merges into it if present — never
// duplicates the heading. Skips PR numbers already listed anywhere (idempotent).
// Usage: node scripts/render-changelog.mjs <rows.tsv>
import fs from "node:fs";

const [tsvPath] = process.argv.slice(2);
const rows = fs
  .readFileSync(tsvPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"));

const CHANGELOG = "CHANGELOG.md";
const doc = fs.readFileSync(CHANGELOG, "utf8");
const ORDER = ["Added", "Changed", "Fixed", "Documentation", "Maintenance"];

const existingNums = new Set([...doc.matchAll(/\(#(\d+)\)/g)].map((m) => m[1]));
const fresh = rows.filter(([, num]) => !existingNums.has(num));
if (fresh.length === 0) {
  console.log("no new PRs for changelog");
  process.exit(0);
}

// harvest existing Unreleased entries so reruns merge instead of re-heading
const sec = doc.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/);
const all = [...fresh];
let cur = null;
for (const line of sec ? sec[1].split("\n") : []) {
  const h = line.match(/^### (\S+)/);
  if (h) {
    cur = h[1];
    continue;
  }
  const e = line.match(/^- (.+) \(#(\d+)\)$/);
  if (e && cur) all.push([cur, e[2], e[1]]);
}

const seen = new Set();
const uniq = all.filter(([, , num]) => !seen.has(num) && seen.add(num));

const buckets = new Map();
for (const [type, num, title] of uniq)
  buckets.set(type, [...(buckets.get(type) ?? []), `- ${title} (#${num})`]);

let body = "";
for (const t of ORDER.filter((t) => buckets.has(t)))
  body += `\n### ${t}\n${buckets.get(t).join("\n")}\n`;

let out;
if (sec) {
  out = doc.replace(sec[0], `## [Unreleased]\n${body}`);
} else {
  const head = doc.indexOf("## [");
  if (head === -1) throw new Error("no release heading found in CHANGELOG.md");
  out = doc.slice(0, head) + `## [Unreleased]\n${body}\n` + doc.slice(head);
}
fs.writeFileSync(CHANGELOG, out);
console.log(`changelog: ${uniq.length} entries (${fresh.length} new)`);
