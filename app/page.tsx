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
  const wallRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/images")
      .then((r) => r.json())
      .then(setImages)
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
      if (!el.dataset.entered) {
        el.style.opacity = "0";
        el.dataset.entered = "1";
        setTimeout(() => {
          el.style.opacity = "1";
          el.style.transform = `rotate(${rand(-6, 6)}deg) scale(1)`;
        }, i * 80);
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
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    const res = await fetch("/api/images", { method: "POST", body: fd });
    const list = await res.json();
    setImages((prev) => [...prev, ...list.filter((m: any) => !m.error)]);
  }

  return (
    <main
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <header>
        <h1>PicWall <span className="en">photo wall</span></h1>
        <p>把照片拖到页面任意位置，或点击添加</p>
      </header>

      <div className="wall" ref={wallRef}>
        {loaded && images.length === 0 && (
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
          >
            <img src={img.path} alt={img.title} loading="lazy" />
            <div className="cap">{img.title}</div>
          </div>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }}
      />
      <button className="add-btn" title="添加照片" onClick={() => fileRef.current?.click()}>+</button>
    </main>
  );
}
