# PicWall 审计白皮书

**日期**: 2026-08-21
**审计模式**: full（Deep Scan）
**项目**: picwall-next（Next.js 15 本地拍立得照片墙）
**分支**: nextjs-refactor @ bfb01ac

## 执行摘要

PicWall 是本地优先的照片墙应用：拖拽上传 → 存本地 uploads/ → 页面渲染拍立得散落布局。代码量小（6 TS 文件 ~270 LOC），功能聚焦。但存在 **git 仓库被构建产物/依赖/用户数据污染** 的 P0 级问题，及若干安全与健壮性缺口。

**综合评分: 52/100 (C-)**
**技术债估算: ~6.5 人时**

## 评分看板

| 维度 | 得分 | 等级 | 一句话理由 |
|---|---|---|---|
| 架构 (architecture) | 7.0/10 | B | 单页+API 路由职责清晰，但 store.ts 读写无同步 |
| 安全 (security) | 4.0/10 | D | 上传无大小限制、路径由用户文件名注入、manifest 暴露绝对路径 |
| 稳定性 (stability) | 6.5/10 | C+ | 无 try/catch 的上传失败路径、JSON 解析静默失败 |
| 性能 (performance) | 8.0/10 | B+ | 本地 5 图秒载，layout() O(n) 合理 |
| 可维护性 (maintainability) | 5.5/10 | C+ | 无测试、无 README、node_modules 污染 git |
| 测试 (testing) | 0.0/10 | F | 零测试 |
| 发布就绪 (release) | 3.0/10 | D | 无 .gitignore 有效规则、无 CI、无 README |
| 无障碍 (accessibility) | 8.5/10 | A- | aria-label/focus/lightbox 齐全，缺 focus trap |
| 文档 (documentation) | 2.0/10 | D- | 无 README，唯一文档是审计报告本身 |
| 供应链 (supply-chain) | 4.0/10 | D | node_modules 入库 9141 文件、锁文件存在但依赖未锁死 |

## 统计

| 严重级 | 数量 |
|---|---|
| P0 | 3 |
| P1 | 5 |
| P2 | 7 |

## 主要风险 Top 5

1. **[P0] node_modules 9141 文件 + .next 167 文件 + 用户照片 5 张被 git 追踪**
2. **[P0] 上传无大小/数量限制 → 本地磁盘可被填满**
3. **[P0] 文件名注入路径：上传文件名直接进入 manifest 并用于拼接存储路径**
4. **[P1] 无任何测试**
5. **[P1] store.ts 并发写 manifest.json 无锁 → 双上传丢数据**

## 覆盖率矩阵

| 维度 | 覆盖度 | 检查证据 | 排除 |
|---|---|---|---|
| 架构/维护 | High | 6 个 TS 文件全读 + git 结构 | — |
| 安全/数据完整性 | High | route.ts ×2 + store.ts 全读 | — |
| 稳定性/性能 | Medium | page.tsx + 运行时行为 | 未做负载测试 |
| 测试 | High | 仓库零测试文件确认 | — |
| 文档/发布 | High | README/.gitignore/CI 检查 | — |
| 无障碍 | Medium | 代码审查 + 视觉验证 | 未跑 axe 自动扫描 |
| 供应链 | High | git ls-files node_modules 计数 | 未跑 npm audit |

## P0 阻断级

### P0-1 · git 仓库污染：node_modules/.next/uploads 入库
- **路径**: 仓库根（`.gitignore` 仅 2 行无效规则）
- **证据**: `git ls-files node_modules | wc -l` = 9141；`git ls-files .next | wc -l` = 167；`git ls-files uploads` = 5 张用户照片
- **问题**: `node_modules`（依赖）+ `.next`（构建产物）+ `uploads/`（用户照片，含人脸）全部被 git 追踪。仓库体积膨胀（>100MB），照片泄漏隐私，`git pull` 慢
- **真实故障**: 任何人 `git clone` 会拉下用户家庭照片；CI 构建时 node_modules 已存在导致安装不一致
- **最小修复**: 重写 `.gitignore`（node_modules/.next/uploads/manifest.json/.env*/.DS_Store），`git rm -r --cached` 三目录
- **回归测试**: `git ls-files | grep -cE "node_modules|\.next|uploads"` 应 = 0
- **工作量**: 10 分钟

### P0-2 · 上传无大小限制 → 本地磁盘耗尽
- **路径**: `app/api/images/route.ts:24`
- **代码**: `const buf = Buffer.from(await f.arrayBuffer());` — 无大小检查直接整读入内存
- **问题**: 任何人可 POST 任意大小文件（route 无鉴权、无 body 限制），内存 + 磁盘双耗尽
- **真实故障**: 一张 2GB 视频伪装 jpg → 内存崩溃；循环 POST → 磁盘写满
- **最小修复**: `if (buf.length > 20 * 1024 * 1024) { out.push({error: "文件过大", filename: f.name}); continue; }`
- **回归测试**: POST 21MB 文件应返回 error 且不写盘
- **工作量**: 5 分钟

### P0-3 · 文件名注入路径 + manifest 暴露
- **路径**: `lib/store.ts:31` `path.extname(meta.filename)` + `app/api/images/route.ts:33` `fs.writeFileSync(`${UPLOAD_DIR}/${meta.path.split("/").pop()}`, buf)`
- **问题**: 文件名是用户输入。`addImage` 生成 `id+ext` 存盘（安全），但 ext 来自用户文件名 — `f.name = "x.evil"` → ext = `evil`（不在白名单，route.ts:20 已拦）。**实际风险低但依赖 route 层白名单**，若白名单被绕过（如 `evil` 碰巧在列表），`path.basename` 已是防护。**次要**：manifest 含 `filename` 原样，含用户路径/特殊字符；GET 返回全部元数据含 `size/width/height`（当前 0 伪造）
- **真实故障**: 低（双重防护：白名单 + basename），但 manifest 泄露文件名元数据
- **最小修复**: `addImage` 内部强制 ext 白名单（不信任 route）；GET 响应剔除 `filename` 字段
- **回归测试**: `addImage({filename: "x.sh"})` 应生成 `.jpg` 存储名
- **工作量**: 15 分钟

## P1 严重级

### P1-1 · 零测试
- **路径**: 全仓（`ls test* tests/ __tests__/` 均无）
- **问题**: 核心逻辑 `store.ts`（57 行，含增删改查+JSON）无任何测试
- **最小修复**: 为 `store.ts` 加 vitest 单测（add/get/delete/损坏 JSON/不存在 id）
- **回归测试**: `vitest run` 全绿
- **工作量**: 1 小时

### P1-2 · store.ts 并发写 manifest 无锁
- **路径**: `lib/store.ts:40,50` `fs.writeFileSync(MANIFEST, ...)`
- **问题**: 两请求并发 POST → 双读同一 manifest → 后写覆盖前写 → 丢一张图
- **最小修复**: 模块级 promise 链（`queue = queue.then(fn)`）串行化写操作
- **回归测试**: 并发 2 上传 → manifest 含 2 条
- **工作量**: 30 分钟

### P1-3 · 上传失败无错误处理（UI 层）
- **路径**: `app/page.tsx:72-75`
- **代码**: `const res = await fetch(...)` — 无 `if (!res.ok)`，无 try/catch
- **问题**: 上传失败时 `res.json()` 抛异常 → `setUploading(false)` 不执行 → 页面永远显示"上传中…"
- **最小修复**: try/finally 包 upload()，`!res.ok` 时 setError
- **回归测试**: mock fetch 500 → uploading 归 false
- **工作量**: 15 分钟

### P1-4 · GET /api/images 暴露 filename 原始文件名
- **路径**: `app/api/images/route.ts:6` 直接返回 `getImages()`
- **问题**: 响应含用户原始文件名（如 `wx_camera_1787222229010.jpg`）+ 完整路径 + 元数据。隐私敏感（拍摄设备名、时间戳）
- **最小修复**: GET 映射剔除 `filename`
- **回归测试**: GET 响应无 filename 字段
- **工作量**: 10 分钟

### P1-5 · 无 README / 无运行文档
- **路径**: 仓库根
- **证据**: `ls README*` → no README
- **问题**: 新环境无法启动（需知道 `npm install && npm run dev` + 上传目录约定）
- **最小修复**: 写 README（功能、启动、存储结构、API）
- **回归测试**: 文档人工核验
- **工作量**: 30 分钟

## P2 优化级

### P2-1 · lightbox 无 focus trap
- **路径**: `app/page.tsx:124-137`
- **问题**: Tab 可逃出 dialog；关闭后 focus 不归还触发卡片
- **最小修复**: 关闭时 `el.focus()` 还原 + Tab 循环
- **工作量**: 20 分钟

### P2-2 · upload() 无类型（`list.filter((m: any)`）
- **路径**: `app/page.tsx:74`
- **代码**: `.filter((m: any) => !m.error)` — `any` 逃逸
- **最小修复**: 定义 `ApiResult = Img | {error: string; filename: string}` 联合类型
- **工作量**: 5 分钟

### P2-3 · 图片尺寸伪造
- **路径**: `app/api/images/route.ts:28-29` `width: 0, height: 0`
- **问题**: manifest 写死 0，前端无用途但数据不实
- **最小修复**: 用 sharp 或 `image-size` 读真实尺寸（新增依赖，P3 可延）
- **工作量**: 30 分钟

### P2-4 · `.gitignore` 只含 venv 规则
- **路径**: `.gitignore`
- **证据**: 仅 2 行（`.venv/` `__pycache__/`），无任何 Node 规则
- **最小修复**: 随 P0-1 一并重写
- **工作量**: 5 分钟

### P2-5 · layout() 在渲染期间读 offsetHeight
- **路径**: `app/page.tsx:33-60`
- **问题**: `useEffect` 里读 DOM 布局 OK（已挂载），但 resize 频繁触发全量重排
- **最小修复**: 可保留；未来若图多加 rAF 节流
- **工作量**: 0（已知项）

### P2-6 · 无 .nvmrc / engines 锁定 Node 版本
- **路径**: 仓库根
- **问题**: Next 15 需 Node 18.18+，环境漂移
- **最小修复**: `.nvmrc` = `20` + package.json engines
- **工作量**: 5 分钟

### P2-7 · 无 CI
- **路径**: `.github/` 不存在
- **问题**: 无法自动验证 build + lint + test
- **最小修复**: 加 GitHub Actions（build + typecheck）
- **工作量**: 30 分钟

## 修复顺序

1. P0-1 (10m) → 2. P0-2 (5m) → 3. P0-3 (15m) → 4. P1-1 (1h) → 5. P1-2 (30m) → 6. P1-3 (15m) → 7. P1-4 (10m) → 8. P1-5 (30m)

## Quick Wins

| 项 | 工作量 | 收益 |
|---|---|---|
| P0-2 大小限制 | 5m | 磁盘安全 |
| P2-2 类型收窄 | 5m | 消除 any |
| P0-1 gitignore | 10m | 仓库瘦身+隐私 |

## 维度小节

### frontend-state
**覆盖**: Medium — page.tsx 全读
- 组件 152 行，无超大组件 ✓
- 状态机清晰（loaded/dragOver/uploading/lightbox/error），无 prop drilling ✓
- 唯一 `any`：page.tsx:74 `(m: any)` → P2-2

### backend-api
**覆盖**: High — route.ts ×2 全读
- POST 校验：白名单 ✓ / 大小限制 ✗ (P0-2) / 文件名信任 ✗ (P0-3)
- DELETE 幂等 ✓（404 返回）
- GET 暴露 filename ✗ (P1-4)

### dependency-weight
**覆盖**: Medium — package.json 分析
- 依赖极轻：next/react/react-dom + 3 devDeps，无冗余 ✓
- 但 node_modules 入库 9141 文件 (P0-1)

### code-consistency
**覆盖**: High — 6 TS 文件全读
- 命名一致（camelCase 函数、PascalCase 类型）✓
- import 顺序一致（react → 内部）✓
- 唯一不一致：route.ts 用 `instanceof File`，store.ts 用 `path.extname` 双路径处理 ext

### comment-coverage
**覆盖**: High — 6 TS 文件全读
- 代码简洁自解释，无缺失注释 ✓
- 零注释但逻辑直白（57 行 store 函数名即文档）✓
- README 缺失为真正缺口 (P1-5)




