// Dump uncovered source lines for the coverage-gate files, using the same
// sourcemap pipeline as the fixture. Run: node scripts/e2e-uncovered.tmp.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import V8ToIstanbul from "v8-to-istanbul";
import { FlattenMap } from "@jridgewell/trace-mapping";

const VLQ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const enc = (v) => {
  let q = v < 0 ? (-v << 1) | 1 : v << 1, o = "";
  do { let d = q & 31; q >>>= 5; if (q > 0) d |= 32; o += VLQ[d]; } while (q > 0);
  return o;
};
const encMappings = (dd) => {
  let ps = 0, psl = 0, psc = 0;
  return dd.map((segs) => {
    let pgc = 0;
    return segs.map((seg) => {
      let s = enc(seg[0] - pgc); pgc = seg[0];
      if (seg.length >= 4) { s += enc(seg[1]-ps)+enc(seg[2]-psl)+enc(seg[3]-psc); ps=seg[1]; psl=seg[2]; psc=seg[3]; }
      return s;
    }).join(",");
  }).join(";");
};

const b = await chromium.launch();
const page = await b.newPage();
await page.coverage.startJSCoverage({ resetOnNavigation: false });
// replay the same flows the suite runs (approximation — good enough to find gaps)
await page.goto("http://localhost:3000/?e2eVision=1");
await page.waitForTimeout(1200);
const entries = await page.coverage.stopJSCoverage();
await b.close();

const byUrl = new Map();
for (const e of entries) {
  if (!/^https?:\/\//.test(e.url)) continue;
  const arr = byUrl.get(e.url) ?? [];
  arr.push(...e.functions.flatMap((f) => f.ranges));
  byUrl.set(e.url, arr);
}

const tmpDir = "/tmp/covchunks";
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

for (const [url, ranges] of byUrl) {
  try {
    let text;
    try { text = await (await fetch(url)).text(); } catch { continue; }
    const smUrl = text.match(/\/\/# sourceMappingURL=(?!data:)(.+)$/m)?.[1];
    if (!smUrl) continue;
    const rawMap = await (await fetch(new URL(smUrl, url))).json().catch(() => null);
    if (!rawMap) continue;
    let map = rawMap;
    if (rawMap.sections?.length) {
      const flat = FlattenMap(rawMap, "c.js");
      map = {
        version: 3,
        file: "c.js",
        sources: flat.sources.map((x) => x.replace(/^file:\/\/\/.*?picwall\//, "")),
        sourcesContent: flat.sourcesContent ?? null,
        names: flat.names ?? [],
        mappings: encMappings(flat._decoded),
      };
    }
    if (!map.mappings) continue;
    const cname = path.basename(new URL(url).pathname);
    if (!cname.endsWith(".js")) continue;
    text = text.replace(/\/\/# sourceMappingURL=.+$/m, `//# sourceMappingURL=${cname}.map`);
    fs.writeFileSync(`${tmpDir}/${cname}`, text);
    fs.writeFileSync(`${tmpDir}/${cname}.map`, JSON.stringify(map));
    const conv = V8ToIstanbul(`${tmpDir}/${cname}`, 0);
    await conv.load();
    conv.applyCoverage(ranges.map((r) => ({ functionName: "", ranges: [r], isBlockCoverage: false })));
    const data = conv.toIstanbul();
    for (const [f, cov] of Object.entries(data)) {
      if (!/app\/page\.tsx$|lib\/vision\.ts$|lib\/i18n\.ts$/.test(f)) continue;
      const smLines = Object.values(cov.statementMap).map((x) => x.start.line);
      const unc = [...new Set(Object.entries(cov.s).filter(([, n]) => n === 0).map(([id]) => smLines[id]).filter(Boolean))].sort((a, b) => a - b);
      console.log(`=== ${f.replace(/.*picwall\//, "")} uncovered:\n${unc.join(",")}\n`);
    }
  } catch (e) { /* chunk skip */ }
}
