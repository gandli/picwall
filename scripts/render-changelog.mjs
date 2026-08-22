// Prepend an "Unreleased" section to CHANGELOG.md from TSV rows:
//   type<TAB>prNumber<TAB>title
// Idempotent: skips PRs already listed; exits 0 without touching the file when
// nothing is new. Usage: node scripts/render-changelog.mjs <rows.tsv>
import fs from "node:fs";

const [tsvPath] = process.argv.slice(2);
const rows = fs
  .readFileSync(tsvPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"));

const CHANGELOG = "CHANGELOG.md";
const doc = fs.readFileSync(CHANGELOG, "utf8");
const existing = new Set([...doc.matchAll(/#(\d+)\)/g)].map((m) => m[1]));
const fresh = rows.filter(([, num]) => !existing.has(num));
if (fresh.length === 0) {
  console.log("no new PRs for changelog");
  process.exit(0);
}

const ORDER = ["Added", "Changed", "Fixed", "Documentation", "Maintenance"];
const buckets = new Map();
for (const [type, num, title] of fresh) {
  (buckets.get(type) ?? buckets.get(type) ?? buckets.set(type, []).get(type)).push(
    `- ${title} (#${num})`
  );
}

let section = "## [Unreleased]\n";
for (const type of ORDER.filter((t) => buckets.has(t))) {
  section += `\n### ${type}\n${buckets.get(type).join("\n")}\n`;
}

// insert after the Keep a Changelog preamble (before the first "## [" heading)
const head = doc.indexOf("## [");
if (head === -1) throw new Error("no release heading found in CHANGELOG.md");
fs.writeFileSync(CHANGELOG, doc.slice(0, head) + section + "\n" + doc.slice(head));
console.log(`changelog: added ${fresh.length} entr${fresh.length === 1 ? "y" : "ies"}`);
