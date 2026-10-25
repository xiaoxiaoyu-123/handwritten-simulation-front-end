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

  job: null,             // {id, status, done, total, error}
  jobError: '',
  downloadUrl: '',
  downloadPngUrl: '',

  history: [],           // [{ts, text, paper, font}] 最近 10 份
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
    { ts: Date.now(), text: store.text, paper: store.paper, font: store.font },
    ...store.history.filter(h => h.text !== store.text),
  ].slice(0, 10)
  localStorage.setItem(HKEY, JSON.stringify(store.history))
}

export function clearHistory() {
  store.history = []
  localStorage.removeItem(HKEY)
}
