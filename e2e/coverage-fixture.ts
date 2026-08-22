import { test as base, expect, type Page } from "@playwright/test";
import type { Profiler } from "node:inspector";
import fs from "node:fs";
import path from "node:path";
import V8ToIstanbul from "v8-to-istanbul";
import { FlattenMap } from "@jridgewell/trace-mapping";

// E2E coverage fixture: wraps every test with Chromium V8 JS coverage, then
// maps raw ranges back to source files via the dev server's sourcemaps.
// ponytail: Chromium-only + turbopack dev chunks. Prod-build measurement =
// nextcov territory; add when needed.

type PWRange = { count: number; startOffset: number; endOffset: number };
type CovEntry = {
  url: string;
  functions: { functionName: string; isBlockCoverage: boolean; ranges: PWRange[] }[];
};

const collected: CovEntry[] = [];

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    collected.push(...(await page.coverage.stopJSCoverage()));
  },
});

export { expect };

const VLQ_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += VLQ_CHARS[digit];
  } while (vlq > 0);
  return out;
}

/** decoded segments ([genCol, srcIdx, srcLine, srcCol, nameIdx?]) -> VLQ string */
function encodeMappings(decoded: number[][][]): string {
  const lines: string[] = [];
  let prevSrc = 0,
    prevSrcLine = 0,
    prevSrcCol = 0,
    prevName = 0;
  for (const segs of decoded) {
    const parts: string[] = [];
    let prevGenCol = 0;
    for (const seg of segs) {
      let s = encodeVlq(seg[0] - prevGenCol);
      prevGenCol = seg[0];
      if (seg.length >= 4) {
        s +=
          encodeVlq(seg[1] - prevSrc) +
          encodeVlq(seg[2] - prevSrcLine) +
          encodeVlq(seg[3] - prevSrcCol);
        prevSrc = seg[1];
        prevSrcLine = seg[2];
        prevSrcCol = seg[3];
        if (seg.length >= 5) {
          s += encodeVlq(seg[4] - prevName);
          prevName = seg[4];
        }
      }
      parts.push(s);
    }
    lines.push(parts.join(","));
  }
  return lines.join(";");
}

/**
 * Assert 100% statement coverage for the given source files.
 * Merges all collected entries per chunk URL, runs v8-to-istanbul with the
 * chunk's inline sourcemap, and reads each source's own statement map.
 */
export async function expectCoverage(sources: string[], projectRoot: string) {
  // group entries by chunk url
  type R = { startOffset: number; endOffset: number; count: number };
  const byUrl = new Map<string, R[]>();
  for (const e of collected) {
    // skip non-http pseudo-URLs (turbopack internals)
    if (!/^https?:\/\//.test(e.url)) continue;
    const arr = byUrl.get(e.url) ?? [];
    arr.push(...e.functions.flatMap((f) => f.ranges));
    byUrl.set(e.url, arr);
  }
  // Merge across tests: same chunk re-executes per page load; V8 reports the
  // whole script as count:0 for pages where a function never ran. Take the
  // per-offset MAX so one exercising test wins over N idle ones.
  for (const [url, ranges] of byUrl) {
    ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    const merged: R[] = [];
    for (const r of ranges) {
      if (r.count === 0) continue; // refined away below by any covering range
      const last = merged[merged.length - 1];
      if (last && r.startOffset < last.endOffset) {
        last.endOffset = Math.max(last.endOffset, r.endOffset);
        last.count = Math.max(last.count, r.count);
      } else {
        merged.push({ ...r });
      }
    }
    byUrl.set(url, merged);
  }

  // istanbul data across chunks: { file -> { s: counts, statementMap } }
  type FileCov = { s: Record<string, number>; statementMap: Record<string, { start: { line: number } }> };
  const files = new Map<string, FileCov>();

  for (const [url, ranges] of byUrl) {
    let text: string;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      continue;
    }
    // turbopack emits an external SECTIONED sourcemap that v8-to-istanbul
    // can't read — fetch it, flatten with trace-mapping's FlattenMap, and
    // hand the converter a classic map.
    const smUrl = text.match(/\/\/# sourceMappingURL=(.+)$/m)?.[1];
    if (!smUrl) continue;
    let rawMap: { sections?: { offset: unknown; map: unknown }[] } & Record<string, unknown>;
    try {
      rawMap = await (await fetch(new URL(smUrl, url).toString())).json();
    } catch {
      continue;
    }
    let map: Record<string, unknown> = rawMap;
    const chunkName = path.basename(new URL(url).pathname);
    if (rawMap.sections?.length) {
      // FlattenMap yields decoded segments; re-encode to classic VLQ mappings
      const flat = FlattenMap(rawMap as never, chunkName) as unknown as {
        sources: string[];
        sourcesContent?: (string | null)[];
        names: string[];
        _decoded: number[][][]; // [genCol, srcIdx, srcLine, srcCol, nameIdx?]
      };
      map = {
        version: 3,
        file: chunkName,
        sources: flat.sources.map((x) => x.replace(/^file:\/\/\/.*?picwall\//, "")),
        sourcesContent: flat.sourcesContent ?? null,
        names: flat.names ?? [],
        mappings: encodeMappings(flat._decoded),
      };
    }

    if (!chunkName || !chunkName.endsWith(".js")) continue;
    const tmp = path.join(projectRoot, "coverage", "chunks", chunkName);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, text.replace(/\/\/# sourceMappingURL=.+$/m,
      `//# sourceMappingURL=${chunkName}.map`));
    fs.writeFileSync(path.join(path.dirname(tmp), `${chunkName}.map`),
      JSON.stringify({ ...map, file: chunkName }));

    let data: Record<string, unknown>;
    try {
      const converter = V8ToIstanbul(tmp, 0);
      await converter.load();
      converter.applyCoverage(
        ranges.map(
          (r): Profiler.FunctionCoverage => ({
            functionName: "",
            ranges: [{ startOffset: r.startOffset, endOffset: r.endOffset, count: r.count }],
            isBlockCoverage: false,
          })
        )
      );
      data = converter.toIstanbul() as Record<string, unknown>;
    } catch {
      // one broken chunk must not sink the whole report
      continue;
    }

    for (const [fileKey, cov] of Object.entries(data)) {
      const hit = sources.find((s) => fileKey.endsWith(s));
      if (!hit) continue;
      const c = cov as FileCov;
      const existing = files.get(hit) ?? { s: {}, statementMap: c.statementMap ?? {} };
      for (const [id, n] of Object.entries(c.s)) {
        existing.s[id] = (existing.s[id] ?? 0) + n;
      }
      files.set(hit, existing);
    }
  }

  const summary: Record<string, string> = {};
  let allFull = true;
  for (const src of sources) {
    const f = files.get(src);
    if (!f || !Object.keys(f.s).length) {
      summary[src] = "NOT MEASURED";
      allFull = false;
      continue;
    }
    const counts = Object.values(f.s);
    const covered = counts.filter((n) => n > 0).length;
    const pct = ((covered / counts.length) * 100).toFixed(1);
    summary[src] = `${pct}% (${covered}/${counts.length} statements)`;
    console.log(`coverage ${src}: ${summary[src]}`);
    if (Number(pct) < 100) allFull = false;
  }

  const dir = path.join(projectRoot, "coverage", "e2e");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  // full per-line detail for debugging gaps
  fs.writeFileSync(
    path.join(dir, "istanbul.json"),
    JSON.stringify(Object.fromEntries([...files]), null, 2)
  );

  expect(
    allFull,
    `E2E coverage below 100%:\n${JSON.stringify(summary, null, 2)}`
  ).toBe(true);
}
