import { describe, it, expect } from "vitest";
import { DICTS, loadLang, saveLang } from "./i18n";

const memStorage = (): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; store: Record<string, string> } => {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
  };
};

describe("i18n dictionaries", () => {
  it("zh and en have identical key sets", () => {
    const zhKeys = Object.keys(DICTS.zh).sort();
    const enKeys = Object.keys(DICTS.en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("no empty values in either locale", () => {
    for (const lang of ["zh", "en"] as const) {
      for (const [k, v] of Object.entries(DICTS[lang])) {
        expect(v.length, `${lang}.${k} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("every key has a non-identical translation across locales", () => {
    for (const k of Object.keys(DICTS.zh)) {
      const zh = DICTS.zh[k];
      const en = DICTS.en[k];
      // brand name keys may be identical; UI copy should differ
      if (!k.startsWith("app.")) {
        expect(en, `en.${k} same as zh`).not.toBe(zh);
      }
    }
  });

  it("all keys are camelCase dot-namespaced", () => {
    for (const k of Object.keys(DICTS.zh)) {
      expect(k, `key ${k}`).toMatch(/^[a-z]+\.[a-z.]+$/);
    }
  });
});

describe("loadLang", () => {
  it("returns zh when storage is empty", () => {
    expect(loadLang(memStorage())).toBe("zh");
  });

  it("returns saved en", () => {
    const s = memStorage();
    s.setItem("picwall.lang", "en");
    expect(loadLang(s)).toBe("en");
  });

  it("falls back to zh on invalid value", () => {
    const s = memStorage();
    s.setItem("picwall.lang", "fr");
    expect(loadLang(s)).toBe("zh");
  });

  it("returns zh without storage (SSR)", () => {
    expect(loadLang(undefined)).toBe("zh");
  });

  it("reads global localStorage when no storage arg (browser)", () => {
    const s = memStorage();
    s.setItem("picwall.lang", "en");
    (globalThis as any).localStorage = s;
    try {
      expect(loadLang()).toBe("en");
    } finally {
      delete (globalThis as any).localStorage;
    }
  });
});

describe("saveLang", () => {
  it("persists the chosen language", () => {
    const s = memStorage();
    saveLang("en", s);
    expect(s.store["picwall.lang"]).toBe("en");
    saveLang("zh", s);
    expect(s.store["picwall.lang"]).toBe("zh");
  });

  it("no-ops without storage (SSR)", () => {
    expect(() => saveLang("en", undefined)).not.toThrow();
  });

  it("writes to global localStorage when no storage arg (browser)", () => {
    const s = memStorage();
    (globalThis as any).localStorage = s;
    try {
      saveLang("zh");
      expect(s.store["picwall.lang"]).toBe("zh");
    } finally {
      delete (globalThis as any).localStorage;
    }
  });
});
