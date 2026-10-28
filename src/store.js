import { reactive } from 'vue'

// 全站共享状态（P0/P1 单页面足够，不上 Pinia）
export const store = reactive({
  text: '',
  paper: 'a4-lined',
  papers: [],
  font: 'default',
  fonts: [],
  previewNonce: 0,       // 校准保存等场景手动触发预览刷新

  previewUrl: '',
  previewing: false,
  previewError: '',
  previewGeom: null,     // 后端返回的版面几何 + 渲染行→源行映射（点行跳转）
  focusLine: 0,          // 请求编辑区聚焦的源行（1 基，0=无）

  problemText: '',       // 解题时的题目原文（对照用）
  problemImage: '',      // 拍题照片 dataURL（对照用）

  job: null,             // {id, status, done, total, error}
  jobError: '',
  downloadUrl: '',
  downloadPngUrl: '',

  lint: null,            // {fixable, blockers, skip_lines, ok} 记号体检结果
  chaos: 'normal',       // 潦草度：neat | normal | messy

  history: [],           // [{ts, text, paper, font}] 最近 10 份

  // AI 由站点内置 Key 提供（服务端环境变量），用户无需配置
  aiBusy: false,         // 任一 AI 请求进行中（拍题/解题互斥：单飞锁）
  aiKind: '',            // 'transcribe' | 'solve'——分开显示"抄题/解题中"
  aiUsed: false,         // 当前文本来自 AI → 显示核对提醒
  aiPending: null,       // 解题返回时用户已改动编辑区 → {text, problem} 待应用
  aiRaw: '',             // 模型原文（流式时逐字累积）→「AI 原文」抽屉展示
  aiTex: '',             // 原文的 LaTeX 版（done 事件带）→ KaTeX 渲染
  aiReasoning: '',       // 推理模型的思考过程（reasoning 事件累积）
  aiElapsed: 0,          // 本次解题耗时（秒，done 事件带）
  aiModel: '',           // 本次解题用的模型名（仅展示）
})

const HKEY = 'hs_history_v1'

export function loadHistory() {
  try {
    store.history = JSON.parse(localStorage.getItem(HKEY)) || []
  } catch {
    store.history = []
  }
}

export function saveHistoryEntry() {
  if (!store.text.trim()) return
  store.history = [
    { ts: Date.now(), text: store.text, paper: store.paper,
      font: store.font, chaos: store.chaos,
      // AI 解题的原文/排版版一并留存，恢复历史时抽屉还能对照
      raw: store.aiRaw || '', tex: store.aiTex || '',
      model: store.aiModel || '', elapsed: store.aiElapsed || 0 },
    ...store.history.filter(h => h.text !== store.text),
  ].slice(0, 10)
  localStorage.setItem(HKEY, JSON.stringify(store.history))
}

export function clearHistory() {
  store.history = []
  localStorage.removeItem(HKEY)
}
