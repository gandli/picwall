"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { captionImage } from "@/lib/vision";
import { bind, play, setEnabled } from "cuelume";

type Img = {
  id: string;
  filename: string;
  path: string;
  title: string;
  desc: string;
};
type UploadResult = Img | { error: string; filename: string };

const rand = (a: number, b: number) => Math.random() * (b - a) + a;

export default function WallPage() {
  const { lang, setLang, t } = useI18n();
  const [images, setImages] = useState<Img[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<Img | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [confirmDel, setConfirmDel] = useState<Img | null>(null);
  const [captioning, setCaptioning] = useState<Set<string>>(new Set());
  // lazy read: useRef initializer would run on server during prerender (no localStorage)
  const firstRun = useRef<boolean | null>(null);
  if (firstRun.current === null && typeof window !== "undefined") {
    firstRun.current = localStorage.getItem("picwall.captioned") === "1";
  }
  const suppressClick = useRef(false);
  const wallRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // fixed per-card tilt (mobile): stable across re-renders/resize
  const tilts = useRef<number[]>([]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    // sound prefs + wire up data-cuelume-* attributes
    const savedSound = localStorage.getItem("picwall.sound") !== "off";
    setSoundOn(savedSound);
    setEnabled(savedSound);
    bind();
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setEnabled(next);
    localStorage.setItem("picwall.sound", next ? "on" : "off");
  }

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("picwall.theme", next ? "dark" : "light");
    setDark(next);
  }

  async function delImage(img: Img) {
    setConfirmDel(null);
    try {
      const res = await fetch(`/api/images/${img.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("delete.error"));
      setImages((prev) => prev.filter((m) => m.id !== img.id));
      play("droplet");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    fetch("/api/images")
      .then((r) => { if (!r.ok) throw new Error(t("load.error")); return r.json(); })
      .then(setImages)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  function layout() {
    const wall = wallRef.current;
    if (!wall) return;
    const cards = wall.querySelectorAll<HTMLElement>(".polaroid");
    if (!cards.length) return;
    const saved = loadPos();
    const isMobile = window.innerWidth <= 640;
    // masonry: track tallest column, shortest column gets next card
    const cols = isMobile ? 2 : 4, w = isMobile ? Math.floor(wall.clientWidth / 2) : 240;
    const colH = new Array(cols).fill(0);
    cards.forEach((el, i) => {
      const id = el.dataset.src?.split("/").pop()?.replace(/\.[^.]+$/, "");
      const sp = id ? saved[id] : undefined;
      if (sp) {
        el.style.left = `${sp.x}px`;
        el.style.top = `${sp.y}px`;
      } else {
        // shortest column wins
        const c = colH.indexOf(Math.min(...colH));
        el.style.left = `${c * w + rand(-15, 15)}px`;
        el.style.top = `${colH[c] + rand(-10, 10)}px`;
        colH[c] += el.offsetHeight + 20;
      }
      el.style.transform = `rotate(${rand(-6, 6)}deg)`;
      el.style.zIndex = String(Math.floor(rand(1, 20)));
      el.style.transitionDelay = `${i * 50}ms`;
      if (!el.dataset.entered) {
        el.dataset.entered = "1";
        el.style.opacity = "0";
        el.style.transform = `rotate(${rand(-6, 6)}deg) scale(.92) translateY(14px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = `rotate(${rand(-6, 6)}deg) scale(1) translateY(0)`;
          setTimeout(() => { el.style.transitionDelay = "0ms"; }, 600);
        }));
      }
    });
    wall.style.height = `${Math.max(...colH) + 320}px`;
  }

  function loadPos(): Record<string, { x: number; y: number }> {
    try {
      return JSON.parse(localStorage.getItem("picwall.pos") || "{}");
    } catch { return {}; }
  }

  function savePos(id: string, x: number, y: number) {
    const all = loadPos();
    all[id] = { x, y };
    localStorage.setItem("picwall.pos", JSON.stringify(all));
  }

  useEffect(() => {
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [images]);

  async function upload(files: FileList | File[]) {
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      if (!res.ok) throw new Error(t("upload.error"));
      const list = (await res.json()) as UploadResult[];
      const ok = list.filter((m): m is Img => !("error" in m));
      setImages((prev) => [...prev, ...ok]);
      const failed = list.filter((m): m is { error: string; filename: string } => "error" in m);
      if (failed.length) setError(`${t("upload.error")}: ${failed[0].error}`);
      else setError(null);
      play("success");
      // caption in-browser (local models) — PATCH result to manifest for persistence
      for (const img of ok) {
        setCaptioning((prev) => new Set(prev).add(img.id));
        void captionImage(img)
          .then(async (cap) => {
            if (!cap) return;
            const r = await fetch(`/api/images/${img.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cap),
            });
            if (r.ok) setImages((prev) => prev.map((m) => (m.id === img.id ? { ...m, ...cap } : m)));
          })
          .finally(() => {
            setCaptioning((prev) => {
              const next = new Set(prev);
              next.delete(img.id);
              return next;
            });
            firstRun.current = true;
            localStorage.setItem("picwall.captioned", "1");
          });
      }
    } catch (e) {
      setError(t("upload.error"));
      play("error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main
      className="relative"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center text-2xl text-white bg-ink/80 tracking-[.06em]">
          {t("drag.hint")}
        </div>
      )}

      <header className="text-center pt-10 px-6 pb-5 max-sm:pt-7 max-sm:px-4 max-sm:pb-3 relative">
        <div className="absolute right-4 top-4 flex gap-2 max-sm:right-3 max-sm:top-3">
          <button
            aria-label={t("theme.aria")} title={t("theme.aria")}
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full border border-black/10 bg-white text-ink text-sm cursor-pointer hover:bg-paper-2 dark:border-white/15 dark:bg-dark-card dark:text-dark-text dark:hover:bg-dark-bg"
          >{dark ? "◐" : "○"}</button>
          <button
            aria-label={t("lang.aria")} title={t("lang.aria")}
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="w-9 h-9 rounded-full border border-black/10 bg-white text-ink text-xs font-medium cursor-pointer hover:bg-paper-2 dark:border-white/15 dark:bg-dark-card dark:text-dark-text dark:hover:bg-dark-bg"
          >{lang === "zh" ? "EN" : "中"}</button>
          <button
            aria-label={soundOn ? t("sound.on.aria") : t("sound.off.aria")} title={soundOn ? t("sound.on.aria") : t("sound.off.aria")}
            onClick={toggleSound}
            className="w-9 h-9 rounded-full border border-black/10 bg-white text-ink text-sm cursor-pointer hover:bg-paper-2 dark:border-white/15 dark:bg-dark-card dark:text-dark-text dark:hover:bg-dark-bg"
          >{soundOn ? "◁" : "▷"}</button>
        </div>
        <h1 className="font-[var(--font-serif)] text-[30px] font-semibold tracking-[-0.02em] leading-[1.1] text-ink dark:text-dark-ink max-sm:text-xl max-sm:pr-20 max-sm:leading-[1.15]">
          PicWall <span className="font-bold">{t("app.subtitle")}</span>
        </h1>
        <p className="text-[13px] text-ink-soft mt-2 tracking-[.04em] dark:text-dark-soft max-sm:text-[12px] max-sm:pr-20">
          {t("app.tagline")}
        </p>
      </header>

      <div className="wall relative w-[90%] max-w-[1200px] mx-auto min-h-[60vh] py-6 pb-15" ref={wallRef}>
        {!loaded && <div className="text-center py-22 px-5 text-ink-soft dark:text-dark-soft"><p>加载中…</p></div>}
        {error && <div className="text-center py-22 px-5 text-ink-soft dark:text-dark-soft"><p>{error}</p></div>}
        {loaded && !error && images.length === 0 && (
          <div className="text-center py-22 px-5 text-ink-soft dark:text-dark-soft">
            <div className="w-30 h-30 mx-auto mb-5 border-[1.5px] border-dashed border-ink/20 rounded-full flex items-center justify-center text-[34px] font-[var(--font-serif)]">
              +
            </div>
            <p className="text-[15px]">{t("empty.title")}</p>
            <p className="text-xs mt-2 opacity-70">{t("empty.hint")}</p>
          </div>
        )}
        {images.map((img, i) => {
          if (tilts.current[i] === undefined) tilts.current[i] = rand(-3, 3);
          return (
          <div
            key={img.id}
            className="polaroid group absolute w-[220px] bg-card p-2.5 pb-10 border border-black/5 shadow-[var(--shadow-polaroid)] cursor-pointer overflow-hidden max-sm:w-[calc(50%-10px)] max-sm:m-0 max-sm:mb-2 max-sm:rotate-[var(--tilt)]"
            style={{ "--tilt": `${tilts.current[i]}deg` } as React.CSSProperties}
            data-idx={i}
            data-src={img.path}
            data-title={img.title}
            data-desc={img.desc}
            tabIndex={0}
            role="group"
            aria-label={`${t("view.aria")} ${img.title}`}
            data-cuelume-press data-cuelume-hover="tick"
            onPointerDown={(e) => {
              const el = e.currentTarget as HTMLElement;
              const sx = e.clientX, sy = e.clientY;
              const ox = el.offsetLeft, oy = el.offsetTop;
              const isTouch = e.pointerType !== "mouse";
              let dragged = false, axis: "x" | "y" | null = null, lastDx = 0, lastDy = 0;
              const move = (ev: PointerEvent) => {
                const dx = ev.clientX - sx, dy = ev.clientY - sy;
                lastDx = dx; lastDy = dy;
                if (!axis) {
                  if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                  axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
                }
                if (isTouch && axis === "y") return; // vertical swipe = scroll, not drag
                if (!dragged) {
                  dragged = true;
                  el.style.transition = "none";
                }
                if (axis === "x") {
                  // horizontal: drag card sideways (left = reveal delete, right = move)
                  el.style.left = `${ox + dx}px`;
                  const idx = Number(el.dataset.idx ?? 0);
                  el.style.transform = `rotate(${tilts.current[idx] ?? 0}deg)`;
                } else {
                  el.style.left = `${ox + dx}px`;
                  el.style.top = `${oy + dy}px`;
                }
                el.style.zIndex = "100";
              };
              const up = (ev: PointerEvent) => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
                // touchEnd carries no coordinates — use last move delta
                const dx = lastDx, dy = lastDy;
                // pure horizontal swipe (|dy| < 12): left = delete, right = move
                // diagonal / vertical = reposition drag
                const isSwipe = isTouch && axis === "x" && Math.abs(dy) < 12;
                if (isSwipe) {
                  if (dx < -60) {
                    setConfirmDel(img);
                    play("toggle");
                    el.style.transition = "";
                    el.style.left = `${ox}px`;
                  } else if (dx > 60) {
                    el.style.transition = "";
                    const id = el.dataset.src?.split("/").pop()?.replace(/\.[^.]+$/, "");
                    if (id) savePos(id, el.offsetLeft, el.offsetTop);
                    suppressClick.current = true;
                    setTimeout(() => { suppressClick.current = false; }, 0);
                  } else {
                    el.style.transition = "";
                    el.style.left = `${ox}px`;
                    suppressClick.current = true;
                    setTimeout(() => { suppressClick.current = false; }, 0);
                  }
                } else if (dragged) {
                  el.style.transition = "";
                  const id = el.dataset.src?.split("/").pop()?.replace(/\.[^.]+$/, "");
                  if (id) savePos(id, el.offsetLeft, el.offsetTop);
                  suppressClick.current = true;
                  setTimeout(() => { suppressClick.current = false; }, 0);
                  ev.preventDefault();
                } else {
                  el.style.transition = "";
                }
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
              window.addEventListener("pointercancel", up);
            }}
            onClick={() => { if (suppressClick.current) return; setLightbox(img); play("arrival"); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightbox(img); play("arrival"); } }}
          >
            <img src={img.path} alt={img.title} width={200} height={200} loading="lazy"
              className="w-full h-auto block bg-paper-2 outline-1 outline-black/10 dark:bg-dark-card dark:outline-white/10"
              onLoad={() => layout()} />
            <button
              aria-label={t("delete.aria")}
              title={t("delete.aria")}
              data-cuelume-press
              onClick={(e) => { e.stopPropagation(); setConfirmDel(img); play("toggle"); }}
              className="absolute top-1 right-1 w-5 h-5 -m-3 p-3 text-ink-soft/70 text-sm leading-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:text-ink max-sm:hidden dark:text-white/60 dark:hover:text-white"
            >✕</button>
            <div className="absolute bottom-3 left-2 w-[calc(100%-16px)] text-center text-xs text-ink-soft font-[var(--font-typewriter)] tracking-[.06em] whitespace-nowrap overflow-hidden text-ellipsis dark:text-dark-cap">
              {img.title}
              {captioning.has(img.id) && <span> · {t("caption.loading")}</span>}
            </div>
            {captioning.has(img.id) && firstRun.current === false && (
              <div className="absolute bottom-8 left-2 right-2 text-center text-[10px] leading-tight text-ink-soft/70 dark:text-dark-soft">
                {t("caption.first")}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-[6px] cursor-pointer dark:bg-black/75"
          onClick={() => { setLightbox(null); play("page"); }} role="dialog" aria-modal="true"
          onKeyDown={(e) => { if (e.key === "Escape") { setLightbox(null); play("page"); } }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="bg-card rounded-lg max-w-[90vw] max-h-[85vh] overflow-auto cursor-default shadow-[0_0_0_1px_rgba(0,0,0,.08),0_32px_64px_rgba(0,0,0,.3)] relative dark:bg-dark-card"
            onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.path} alt={lightbox.title} className="block max-w-[90vw] max-h-[70vh] object-contain" />
            <div className="pt-3.5 px-5 pb-1 text-[17px] font-semibold font-[var(--font-serif)] dark:text-dark-text">{lightbox.title}</div>
            {lightbox.desc && <div className="px-5 pb-4.5 text-[13px] text-ink-soft leading-6 dark:text-dark-soft">{lightbox.desc}</div>}
            <button
              className="absolute top-2 right-2 w-8 h-8 rounded-full border-none bg-black/45 text-white text-lg leading-none flex items-center justify-center cursor-pointer hover:bg-black/60"
              aria-label={t("close.aria")} onClick={() => { setLightbox(null); play("page"); }}>×</button>
          </div>
        </div>
      )}

      {confirmDel && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-[4px]"
          onClick={() => { setConfirmDel(null); play("press"); }} role="alertdialog" aria-modal="true"
          onKeyDown={(e) => { if (e.key === "Escape") { setConfirmDel(null); play("press"); } }}
          tabIndex={-1}
        >
          <div
            className="bg-card rounded-lg p-6 max-w-[320px] w-[85vw] shadow-[0_32px_64px_rgba(0,0,0,.3)] text-center dark:bg-dark-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold font-[var(--font-serif)] dark:text-dark-text">{t("delete.confirm")}</div>
            <div className="text-[13px] text-ink-soft mt-1.5 dark:text-dark-soft">{t("delete.irreversible")}</div>
            <div className="flex gap-2.5 mt-5">
              <button
                autoFocus
                className="flex-1 h-9 rounded-full border border-black/10 text-[13px] text-ink-soft cursor-pointer hover:bg-paper-2 dark:border-white/10 dark:text-dark-soft dark:hover:bg-dark-bg"
                onClick={() => { setConfirmDel(null); play("press"); }}
              >{t("delete.cancel")}</button>
              <button
                className="flex-1 h-9 rounded-full bg-black text-white text-[13px] font-medium cursor-pointer hover:bg-black/80"
                onClick={() => { play("pulse"); delImage(confirmDel); }}
              >{t("delete.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        aria-label={t("upload.aria")}
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }}
      />
      {uploading && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] bg-card text-ink px-6 py-3 rounded-lg text-sm shadow-[var(--shadow-polaroid-hover)] dark:bg-dark-card dark:text-dark-text">
          {t("upload.loading")}
        </div>
      )}
      <button
        className="add-btn fixed right-6 bottom-6 w-12 h-12 rounded-full border-none bg-black text-white text-2xl leading-none cursor-pointer shadow-[0_6px_20px_rgba(0,0,0,.25)] transition-transform duration-150 ease-out hover:translate-y-[-2px] hover:scale-105 hover:shadow-[0_10px_28px_rgba(0,0,0,.3)] active:scale-95 select-none z-[100] dark:bg-white dark:text-black"
        aria-label={t("add.aria")} title={t("add.aria")} onClick={() => fileRef.current?.click()}>+</button>
    </main>
  );
}