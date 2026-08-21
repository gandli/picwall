# PicWall · photo wall

本地拍立得照片墙：拖照片进网页 → 自动存 `uploads/` → 页面渲染为可点击、hover 放大、随机旋转、z-index 分层的拍立得散落布局。零数据库、零外部依赖。

## 启动

```bash
npm install
npm run dev   # → http://localhost:3000
```

生产模式：`npm run build && npm start`。

## 使用

- **上传**：拖拽照片到页面任意位置，或点击右下角 `+` 按钮（支持多选）
- **查看**：点击照片卡片打开大图（含 AI 生成的标题与描述）
- **键盘**：Tab 聚焦卡片 → Enter/Space 打开，Esc 关闭大图

## 存储结构

```
uploads/           # 上传的照片（按 id 命名，如 5aeb779cd258.jpg）
manifest.json      # 照片元数据（id/path/title/desc/uploaded_at）
```

`uploads/` 与 `manifest.json` 均为运行时数据，已 gitignore，不入库。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/images` | 照片列表（剔除原始文件名，隐私）|
| POST | `/api/images` | 上传（multipart，字段 `files`，≤20MB/张，白名单 jpg/png/gif/webp/bmp）|
| DELETE | `/api/images/:id` | 删除照片 + 元数据 |

## 技术栈

Next.js 15 (App Router) + React 19 + TypeScript，零运行时依赖（仅 next/react/react-dom）。
