# handwritten-simulation-front-end

手写模拟网站前端（Vue 3 + Vite）：把纯文本数学作业渲染成"手写作业"图片与
PDF。配套一个提供 `/api` 的后端服务（FastAPI + 渲染引擎，本仓库不含后端代码）。

**功能一览**：三栏编辑页（素材 / 文本编辑 / 实时预览）· 记号工具条 ·
记号体检（可一键修复）· AI 拍题抄题与解题（**流式逐字输出** + 思考过程展示 +
原文抽屉可复制 + 等待秒数 / 停止 / 不覆盖手动编辑）·
文档导入（文字版 PDF/Word 直接抽文本，0 token）· 潦草度三档 · 字体工坊
（手写拍照 → 生成自己的 TTF）· PDF/PNG 导出

> 本仓库可独立部署与二次开发；后端接口约定见下方「后端接口」。
> 项目仅供个人学习演示用途，请勿用于提交作业等不诚信场景。

## 页面结构（PC 三栏）

```
┌──────────┬────────────────────┬─────────────┐
│ 素材栏    │ 文本编辑区           │ 实时预览      │
│ 纸张/字体 │ 行号栏 + 记号工具条   │ 预览图 + 进度 │
│ 参数调节  │ 体检条 + AI 按钮     │ 条 + 下载    │
└──────────┴────────────────────┴─────────────┘
```

## 技术栈

| 项 | 选择 | 说明 |
|---|---|---|
| 框架 | Vue 3（`<script setup>` 组合式 API） | 未引入 UI 组件库与 Pinia，样式全手写 |
| 构建 | Vite 5 | 开发期 `/api` 代理到后端，见 `vite.config.js` |
| 状态 | `src/store.js`（`reactive` 单例） | 全站共享状态，体量小不引状态库 |
| 请求 | `src/api.js`（`apiFetch` 统一入口） | 同源带 Cookie；401/限流等拦截在这扩展 |
| 本地持久化 | `localStorage` | 最近 10 份文本历史，可一键清空 |
| 后端依赖 | FastAPI（另有仓库） | 本仓库只含前端，`dist/` 也可直接挂静态站点 |

## 项目结构

```
src/
├── main.js                    入口：挂载 #app，引入全局样式
├── App.vue                    布局骨架：顶栏 + 三栏 + 页脚隐私说明
├── store.js                   reactive 单例状态 + 历史记录（localStorage）
├── api.js                     apiFetch：统一请求入口（同源带 Cookie）
├── style.css                  全部样式（CSS 变量定义主题色）
└── components/
    ├── MaterialPanel.vue      素材栏：纸张选择/上传、潦草度、字体、历史
    ├── EditorPanel.vue        编辑区：记号工具条、行号栏（跳步标黄/点击跳行）、
    │                          题目原文对照卡、AI 拍题与解题
    ├── LintBar.vue            记号体检条：可修复项一键修、问题行定位、
    │                          跳步行提醒、长行自动断行提示
    ├── PreviewPanel.vue       预览区：实时预览（防抖 500ms + AbortController
    │                          取消旧请求）、点预览行跳回编辑区、
    │                          导出进度条与 PDF/PNG 下载
    └── ForgePanel.vue         字体工坊：下载模板 PDF → 上传手写拍照 →
                               逐字校对 → 生成个人 TTF（依赖后端 fontforge）
```

## 运行

```bash
npm install
npm run dev      # http://localhost:5173，/api 代理到 127.0.0.1:8000
npm run build    # 产物在 dist/（可挂任意静态站点，/api 反代到后端）
```

需要一个提供 `/api` 的后端：开发期改 `vite.config.js` 里的代理目标，
生产环境在反向代理（nginx / Caddy / 1Panel）把 `/api` 指到后端即可。
后端起来后顶栏会显示"后端已连接"。

## 后端接口（前端实际用到的）

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/health` | GET | 顶栏连通状态 |
| `/api/papers`、`/api/fonts` | GET | 纸张 / 字体列表（含上传删除） |
| `/api/preview` | POST | 单页实时预览（返回 base64 PNG + 版面几何） |
| `/api/jobs`、`/api/jobs/{id}` | POST/GET | 导出任务：创建 / 轮询进度 |
| `/api/jobs/{id}/download` | GET | 下载 PDF / PNG 压缩包 |
| `/api/lint`、`/api/lint/fix` | POST | 记号体检与一键修复 |
| `/api/import` | POST | 题目文档导入（PDF/Word 文字版直接抽文本，0 token） |
| `/api/ai/transcribe`、`/api/ai/solve` | POST | AI 拍题抄题 / 解题 |
| `/api/ai/solve/stream` | POST | 流式解题（NDJSON：meta/delta/reasoning/done/error） |
| `/api/papers/upload`、`/api/fonts/upload` | POST | 上传个人纸张 / 字体 |
| `/api/fontforge/*` | 多个 | 字体工坊流程（模板 / 上传 / 生成） |

请求/响应的具体字段直接看 `src/components/*.vue` 里的 `apiFetch` 调用，
后端另有 FastAPI 自动文档（`/docs`）。

## 说明

- 本项目仅供个人学习演示用途。
- 支持的记号：`fr{分子}{分母}`、`√(...)`、`∫[下,上]`、`sb{底}{下标}`、
  `pd{下标}`、`ov{X}`、`ot{X}`、`lim{过程}`、`Σ[下,上]`、`∏[下,上]`、
  `sf{分子}{分母}`（分数指数）、`{N` 分段大括号；指数用 `^` 写，
  支持括号成组与嵌套（`x^(n+1)`、`e^(-x^3)`），但指数里不要放
  `fr{}{}` 分数（放到指数外面，否则体检会提示记法有误）。
- 上传的纸张/字体只存在浏览器所连接的后端实例里，可随时删除。

## License

[MIT](LICENSE)
