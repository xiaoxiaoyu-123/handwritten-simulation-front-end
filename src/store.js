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
  aiBusy: false,
  aiUsed: false,         // 当前文本来自 AI → 显示核对提醒
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
      font: store.font, chaos: store.chaos },
    ...store.history.filter(h => h.text !== store.text),
  ].slice(0, 10)
  localStorage.setItem(HKEY, JSON.stringify(store.history))
}

export function clearHistory() {
  store.history = []
  localStorage.removeItem(HKEY)
}
