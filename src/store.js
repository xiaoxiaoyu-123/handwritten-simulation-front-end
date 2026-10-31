import { reactive } from 'vue'

// ---- 会话模型（ZCode 式任务切换）----
// 每个"会话"= 一份题文 + 它的 AI 输出 / 导出任务 / 预览现场。
// 点历史切换会话互不打断：流式回调写进**发起时的那个会话对象**，
// 切走再切回来，原文抽屉、预览、进度条、下载链接全部恢复现场。
// 预览图 / 题目照片只存内存（单张 300KB~几 MB），其余落 localStorage。

const SKEY = 'hs_sessions_v2'
const MAX_SESSIONS = 12

export function newSession(text = '') {
  return {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    updatedAt: Date.now(),
    text,
    lint: null,            // 该会话的记号体检结果
    lintFor: '',           // lint 对应的文本（切会话回来不重复体检）
    // AI 输出（解题/抄题写进发起时的会话，切走不串）
    aiState: 'idle',       // idle | solving | ready | error
    aiError: '',
    raw: '', tex: '', reasoning: '',
    model: '', elapsed: 0,
    problemText: '',       // 题目原文（对照栏）
    problemImage: '',      // 拍题照片 dataURL —— 仅内存，不落盘
    aiUsed: false,
    aiPending: null,       // 解题返回时该会话文本已被改动 → {text, problem}
    // 导出任务（每次生成独立；jobForText 用于判断"当前文本是否已改动"）
    job: null, jobForText: '', jobError: '',
    downloadUrl: '', downloadPngUrl: '',
    // 预览现场（仅内存；切回来秒显，刷新页面后重渲染）
    preview: { url: '', geom: null, error: '', page: 1, hasNext: false,
               updatedAt: '' },
  }
}

export function hasContent(s) {
  return !!(s.text.trim() || s.raw || s.job || s.aiState !== 'idle')
}

export const store = reactive({
  sessions: [],
  activeId: null,

  // 全局设置（不随会话切换：用户选好的纸/字体/潦草度一直沿用）
  papers: [], fonts: [],
  paper: 'a4-lined', font: 'default', chaos: 'normal',
  previewNonce: 0,       // 校准保存等场景手动触发预览刷新
  previewing: false,     // 当前会话预览渲染中（全局一把锁）
  focusLine: 0,          // 请求编辑区聚焦的源行（1 基，0=无）

  // AI 单飞锁（全局：每 IP 配额按次计，解题/拍题/扫描识别互斥）
  aiBusy: false,
  aiKind: '',            // 'transcribe' | 'solve' | 'import'

  // ---- 旧字段 → 当前会话 的读写代理 ----
  // 组件照常用 store.text / store.lint / store.aiRaw…，模板自动跟随
  // 当前会话；"发起时"的写操作在各自组件里直接写捕获的会话对象。
  get text() { return cur()?.text ?? '' },
  set text(v) {
    const s = cur()
    if (s) { s.text = v; s.updatedAt = Date.now(); persistSoon() }
  },
  get lint() { return cur()?.lint ?? null },
  set lint(v) { const s = cur(); if (s) s.lint = v },
  get lintFor() { return cur()?.lintFor ?? '' },
  set lintFor(v) { const s = cur(); if (s) s.lintFor = v },

  get problemText() { return cur()?.problemText ?? '' },
  set problemText(v) { const s = cur(); if (s) s.problemText = v },
  get problemImage() { return cur()?.problemImage ?? '' },
  set problemImage(v) { const s = cur(); if (s) s.problemImage = v },

  get aiUsed() { return cur()?.aiUsed ?? false },
  set aiUsed(v) { const s = cur(); if (s) s.aiUsed = v },
  get aiPending() { return cur()?.aiPending ?? null },
  set aiPending(v) { const s = cur(); if (s) s.aiPending = v },
  get aiError() { return cur()?.aiError ?? '' },
  set aiError(v) { const s = cur(); if (s) s.aiError = v },
  get aiState() { return cur()?.aiState ?? 'idle' },
  set aiState(v) { const s = cur(); if (s) s.aiState = v },
  get aiRaw() { return cur()?.raw ?? '' },
  set aiRaw(v) { const s = cur(); if (s) s.raw = v },
  get aiTex() { return cur()?.tex ?? '' },
  set aiTex(v) { const s = cur(); if (s) s.tex = v },
  get aiReasoning() { return cur()?.reasoning ?? '' },
  set aiReasoning(v) { const s = cur(); if (s) s.reasoning = v },
  get aiModel() { return cur()?.model ?? '' },
  set aiModel(v) { const s = cur(); if (s) s.model = v },
  get aiElapsed() { return cur()?.elapsed ?? 0 },
  set aiElapsed(v) { const s = cur(); if (s) s.elapsed = v },

  get job() { return cur()?.job ?? null },
  set job(v) { const s = cur(); if (s) s.job = v },
  get jobForText() { return cur()?.jobForText ?? '' },
  set jobForText(v) { const s = cur(); if (s) s.jobForText = v },
  get jobError() { return cur()?.jobError ?? '' },
  set jobError(v) { const s = cur(); if (s) s.jobError = v },
  get downloadUrl() { return cur()?.downloadUrl ?? '' },
  set downloadUrl(v) { const s = cur(); if (s) s.downloadUrl = v },
  get downloadPngUrl() { return cur()?.downloadPngUrl ?? '' },
  set downloadPngUrl(v) { const s = cur(); if (s) s.downloadPngUrl = v },

  get previewUrl() { return cur()?.preview.url ?? '' },
  set previewUrl(v) { const s = cur(); if (s) s.preview.url = v },
  get previewGeom() { return cur()?.preview.geom ?? null },
  set previewGeom(v) { const s = cur(); if (s) s.preview.geom = v },
  get previewError() { return cur()?.preview.error ?? '' },
  set previewError(v) { const s = cur(); if (s) s.preview.error = v },
  get previewPage() { return cur()?.preview.page ?? 1 },
  set previewPage(v) { const s = cur(); if (s) s.preview.page = v },
  get previewHasNext() { return cur()?.preview.hasNext ?? false },
  set previewHasNext(v) { const s = cur(); if (s) s.preview.hasNext = v },
  get previewUpdatedAt() { return cur()?.preview.updatedAt ?? '' },
  set previewUpdatedAt(v) { const s = cur(); if (s) s.preview.updatedAt = v },
})

export function cur() {
  return store.sessions.find(s => s.id === store.activeId)
    || store.sessions[0] || null
}

// ---- 持久化：剥离内存态字段（预览图/照片可能好几 MB） ----
let persistTimer = null

export function persistNow() {
  clearTimeout(persistTimer)
  try {
    const slim = store.sessions.slice(0, MAX_SESSIONS).map(s => {
      const { preview, problemImage, ...rest } = s
      return rest
    })
    localStorage.setItem(SKEY, JSON.stringify(slim))
  } catch { /* 存储满/隐私模式：静默，会话只活在本页 */ }
}

export function persistSoon() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persistNow, 800)
}

export function loadSessions() {
  let arr = []
  try {
    arr = JSON.parse(localStorage.getItem(SKEY)) || []
  } catch { /* 损坏就当没有 */ }
  if (!arr.length) {
    // 旧版 hs_history_v1 迁移（只读一次就删）
    try {
      const old = JSON.parse(localStorage.getItem('hs_history_v1')) || []
      arr = old.map(h => ({
        ...newSession(h.text || ''),
        id: 'm' + h.ts.toString(36), ts: h.ts, updatedAt: h.ts,
        raw: h.raw || '', tex: h.tex || '', model: h.model || '',
        elapsed: h.elapsed || 0,
        aiState: h.raw ? 'ready' : 'idle',
      }))
      localStorage.removeItem('hs_history_v1')
    } catch { arr = [] }
  }
  arr = arr.filter(s => s && typeof s.text === 'string' && s.preview)
  store.sessions = arr.length ? arr : [newSession('')]
  store.activeId = store.sessions[0].id
}

export function createSession(text = '') {
  const s = newSession(text)
  store.sessions.unshift(s)
  trimSessions()
  store.activeId = s.id
  persistNow()
  return s
}

export function switchSession(id) {
  if (!store.sessions.some(s => s.id === id) || store.activeId === id) return
  store.activeId = id
  persistSoon()
}

// 只清数据，保留当前草稿（「清空历史（一键删除我的数据）」用）
export function clearSessions() {
  const fresh = newSession('')
  store.sessions = [fresh]
  store.activeId = fresh.id
  localStorage.removeItem(SKEY)
  localStorage.removeItem('hs_history_v1')
}

function running(s) {
  return s.aiState === 'solving'
    || !!(s.job && !['done', 'failed'].includes(s.job.status))
}

function trimSessions() {
  if (store.sessions.length <= MAX_SESSIONS) return
  const removable = store.sessions.filter(s =>
    s.id !== store.activeId && !running(s))
  while (store.sessions.length > MAX_SESSIONS && removable.length) {
    const victim = removable.pop()          // 最旧的、不在用且没在跑的
    store.sessions.splice(store.sessions.indexOf(victim), 1)
  }
}

// 兼容旧调用点：会话模型下"生成"只刷新会话现场，不再单独写历史
export function loadHistory() { loadSessions() }

export function saveHistoryEntry() {
  const s = cur()
  if (s) { s.updatedAt = Date.now(); persistNow() }
}

export function clearHistory() { clearSessions() }
