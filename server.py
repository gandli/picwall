#!/usr/bin/env python3
"""PicWall — 拍立得照片墙，纯本地存储。

单文件 FastAPI 应用：上传图片 → 保存到本地 uploads/ → 渲染为散落拍立得墙。
零外部存储依赖，零配置，开箱即用。
"""
import os
import json
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image
from jinja2 import Environment, FileSystemLoader

BASE = Path(__file__).resolve().parent
UPLOADS = BASE / "uploads"
TEMPLATES = BASE / "templates"
STATIC = BASE / "static"
for d in (UPLOADS, TEMPLATES, STATIC):
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PicWall")
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS)), name="uploads")

# jinja2 env
env = Environment(loader=FileSystemLoader(str(TEMPLATES)), autoescape=True)
env.filters["basename"] = lambda p: Path(p).name


def _save_image(file: UploadFile) -> dict:
    """保存上传文件到本地，返回图片元数据 dict。"""
    ext = os.path.splitext(file.filename or "img.jpg")[1].lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        raise HTTPException(400, f"不支持的文件类型: {ext}")
    fid = uuid.uuid4().hex[:12]
    fname = f"{fid}{ext}"
    path = UPLOADS / fname
    data = file.file.read()
    path.write_bytes(data)
    try:
        with Image.open(path) as im:
            w, h = im.size
    except Exception:
        w, h = 0, 0
    meta = {
        "id": fid,
        "filename": file.filename or fname,
        "path": f"/uploads/{fname}",
        "width": w,
        "height": h,
        "size": len(data),
        "title": os.path.splitext(file.filename or "照片")[0][:16],
        "desc": "",
        "uploaded_at": datetime.now().isoformat(timespec="seconds"),
    }
    # 持久化到 manifest
    manifest = BASE / "manifest.json"
    items: List[dict] = []
    if manifest.exists():
        items = json.loads(manifest.read_text() or "[]")
    items.append(meta)
    manifest.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    return meta


@app.get("/", response_class=HTMLResponse)
async def index():
    manifest = BASE / "manifest.json"
    items: List[dict] = []
    if manifest.exists():
        items = json.loads(manifest.read_text() or "[]")
    template = env.get_template("index.html")
    return HTMLResponse(template.render(images=items))


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    meta = _save_image(file)
    return JSONResponse(meta)


@app.post("/upload-multiple")
async def upload_multiple(files: List[UploadFile] = File(...)):
    out = []
    for f in files:
        try:
            out.append(_save_image(f))
        except HTTPException as e:
            out.append({"error": str(e.detail), "filename": f.filename})
    return JSONResponse(out)


@app.get("/api/images")
async def list_images():
    manifest = BASE / "manifest.json"
    if not manifest.exists():
        return []
    return json.loads(manifest.read_text() or "[]")


@app.delete("/api/images/{fid}")
async def delete_image(fid: str):
    manifest = BASE / "manifest.json"
    if not manifest.exists():
        raise HTTPException(404, "图片不存在")
    items: List[dict] = json.loads(manifest.read_text() or "[]")
    target = next((i for i in items if i["id"] == fid), None)
    if not target:
        raise HTTPException(404, "图片不存在")
    # 删除文件
    p = BASE / target["path"].lstrip("/")
    if p.exists():
        p.unlink()
    items = [i for i in items if i["id"] != fid]
    manifest.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    return {"ok": True, "deleted": fid}


@app.get("/health")
async def health():
    return {"status": "ok", "count": len(json.loads((BASE / "manifest.json").read_text() or "[]"))}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)