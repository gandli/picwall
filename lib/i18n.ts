// Minimal i18n: zh/en dictionaries + useI18n hook (localStorage-persisted).
// ponytail: flat dict, no plural/routing — add locales by extending DICTS.
"use client";

import { useEffect, useState } from "react";

export type Lang = "zh" | "en";

export const DICTS: Record<Lang, Record<string, string>> = {
  zh: {
    "app.title": "PicWall",
    "app.subtitle": "photo wall",
    "app.tagline": "把照片拖到页面任意位置，或点击添加",
    "add.aria": "添加照片",
    "upload.aria": "选择照片上传",
    "upload.loading": "上传中…",
    "drag.hint": "松手上传",
    "empty.title": "暂无照片",
    "empty.hint": "拖一张照片到这里，开始你的照片墙",
    "load.error": "加载失败",
    "close.aria": "关闭",
    "view.aria": "查看",
    "theme.aria": "切换主题",
    "lang.aria": "切换语言",
    "delete.aria": "删除照片",
    "delete.confirm": "删除这张照片？",
    "delete.irreversible": "此操作不可撤销",
    "delete.cancel": "取消",
    "delete.error": "删除失败",
    "upload.error": "上传失败",
    "sound.on.aria": "关闭音效",
    "sound.off.aria": "开启音效",
    "caption.loading": "AI 描述生成中…",
    "caption.first": "首次需下载本地模型（约330MB），请稍候",
  },
  en: {
    "app.title": "PicWall",
    "app.subtitle": "photo wall",
    "app.tagline": "Drag photos anywhere on the page, or click to add",
    "add.aria": "Add photo",
    "upload.aria": "Choose photos to upload",
    "upload.loading": "Uploading…",
    "drag.hint": "Drop to upload",
    "empty.title": "No photos yet",
    "empty.hint": "Drag a photo here to start your wall",
    "load.error": "Failed to load",
    "close.aria": "Close",
    "view.aria": "View",
    "theme.aria": "Toggle theme",
    "lang.aria": "Toggle language",
    "delete.aria": "Delete photo",
    "delete.confirm": "Delete this photo?",
    "delete.irreversible": "This action cannot be undone",
    "delete.cancel": "Cancel",
    "delete.error": "Delete failed",
    "upload.error": "Upload failed",
    "sound.on.aria": "Mute sound",
    "sound.off.aria": "Enable sound",
    "caption.loading": "Generating AI description…",
    "caption.first": "First run downloads local models (~330MB), hang tight",
  },
};

export function loadLang(storage?: Pick<Storage, "getItem">): Lang {
  // lazy resolve: default param would eval localStorage on server (ReferenceError)
  const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const saved = s?.getItem("picwall.lang");
  return saved === "en" || saved === "zh" ? saved : "zh";
}

export function saveLang(l: Lang, storage?: Pick<Storage, "setItem">) {
  const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  s?.setItem("picwall.lang", l);
}

/* istanbul ignore next -- React hook wrapper; logic tested via loadLang/saveLang, interactions via E2E */
export function useI18n() {
  // fixed initial value: SSR + hydration first frame must match (no localStorage on server)
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    setLangState(loadLang());
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    saveLang(l);
  };
  const t = (key: string) => DICTS[lang][key] ?? key;
  return { lang, setLang, t };
}
