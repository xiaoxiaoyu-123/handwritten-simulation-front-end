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

  // AI（BYOK：key 只存浏览器 localStorage，请求时带给后端转发）
  aiconfig: null,        // {base_url, api_key, model}
  showAiSettings: false,
  aiBusy: false,
  aiUsed: false,         // 当前文本来自 AI → 显示核对提醒
})

export const AI_PRESETS = {
  zhipu: { label: "智谱 GLM", base_url: "https://open.bigmodel.cn/api/paas/v4",
           model: "glm-4.5v" },
  deepseek: { label: "DeepSeek", base_url: "https://api.deepseek.com",
              model: "deepseek-chat" },
}

const AKEY = "hs_aiconfig"

export function loadAiConfig() {
  try {
    store.aiconfig = JSON.parse(localStorage.getItem(AKEY)) || null
  } catch {
    store.aiconfig = null
  }
}

export function saveAiConfig(cfg) {
  store.aiconfig = cfg
  localStorage.setItem(AKEY, JSON.stringify(cfg))
}

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
