"use client";

import { useEffect, useRef, useState } from "react";

type Img = {
  id: string;
  filename: string;
  path: string;
  title: string;
  desc: string;
};

const rand = (a: number, b: number) => Math.random() * (b - a) + a;

export default function WallPage() {
  const [images, setImages] = useState<Img[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<Img | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/images")
      .then((r) => { if (!r.ok) throw new Error("加载失败"); return r.json(); })
      .then(setImages)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  function layout() {
    const wall = wallRef.current;
    if (!wall) return;
    const cards = wall.querySelectorAll<HTMLElement>(".polaroid");
    if (!cards.length || window.innerWidth <= 640) return;
    let row = 0, col = 0;
    const cols = 4, w = 240, h = 300;
    cards.forEach((el, i) => {
      el.style.left = `${col * w + rand(-15, 15)}px`;
      el.style.top = `${row * h + rand(-10, 10)}px`;
      el.style.transform = `rotate(${rand(-6, 6)}deg)`;
      el.style.zIndex = String(Math.floor(rand(1, 20)));
      el.style.transitionDelay = `${i * 50}ms`;
      if (!el.dataset.entered) {
        el.dataset.entered = "1";
        el.style.transition = "opacity .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1)";
        el.style.opacity = "0";
        el.style.transform = `rotate(${rand(-6, 6)}deg) scale(.92) translateY(14px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = `rotate(${rand(-6, 6)}deg) scale(1) translateY(0)`;
          setTimeout(() => { el.style.transitionDelay = "0ms"; }, 600);
        }));
      }
      if (++col >= cols) { col = 0; row++; }
    });
    wall.style.height = `${row * h + 320}px`;
  }

  useEffect(() => {
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [images]);

  async function upload(files: FileList | File[]) {
    setUploading(true);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    const res = await fetch("/api/images", { method: "POST", body: fd });
    const list = await res.json();
    setImages((prev) => [...prev, ...list.filter((m: any) => !m.error)]);
    setUploading(false);
  }

  return (
    <main
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
      style={{ position: "relative" }}
    >
      {dragOver && <div className="drop-overlay">松手上传</div>}
      <header>
        <h1>PicWall <span className="en">photo wall</span></h1>
        <p>把照片拖到页面任意位置，或点击添加</p>
      </header>

      <div className="wall" ref={wallRef}>
        {!loaded && <div className="empty"><p>加载中…</p></div>}
        {error && <div className="empty"><p>{error}</p></div>}
        {loaded && !error && images.length === 0 && (
          <div className="empty">
            <div className="frame">+</div>
            <p>暂无照片</p>
            <p className="sub">拖一张照片到这里，开始你的照片墙</p>
          </div>
        )}
        {images.map((img) => (
          <div
            key={img.id}
            className="polaroid"
            data-src={img.path}
            data-title={img.title}
            data-desc={img.desc}
            tabIndex={0}
            role="button"
            aria-label={`查看 ${img.title}`}
            onClick={() => setLightbox(img)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightbox(img); } }}
          >
            <img src={img.path} alt={img.title} width={200} height={200} loading="lazy" />
            <div className="cap">{img.title}</div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true"
          onKeyDown={(e) => { if (e.key === "Escape") setLightbox(null); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.path} alt={lightbox.title} />
            <div className="lb-title">{lightbox.title}</div>
            {lightbox.desc && <div className="lb-desc">{lightbox.desc}</div>}
            <button className="lb-close" aria-label="关闭" onClick={() => setLightbox(null)}>×</button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="选择照片上传"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }}
      />
      {uploading && <div className="uploading">上传中…</div>}
      <button className="add-btn" aria-label="添加照片" title="添加照片" onClick={() => fileRef.current?.click()}>+</button>
    </main>
  );
}
