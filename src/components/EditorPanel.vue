<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import LintBar from './LintBar.vue'
import { store } from '../store'
import { apiFetch } from '../api'

const ta = ref(null)
const gutter = ref(null)
const photoFile = ref(null)
const lintBar = ref(null)
let aiCtl = null            // 进行中 AI 请求的 AbortController（「停止」用）
const lastPhoto = ref('')   // 最近一次拍题照片（失败重试用）
const retryKind = ref('')   // 失败的 AI 调用类型（'solve'|'transcribe'）

// 行号栏：行数 / 跳步行集合（lint 的 skip_lines 按行号）
const lineCount = computed(() =>
  store.text ? store.text.split('\n').length : 0)
const skipSet = computed(() => new Set(
  (store.lint?.skip_lines || []).map(s => s.line)))
const blockSet = computed(() => new Set(
  (store.lint?.blockers || []).map(b => b.line)))

// 行高与 textarea 的 line-height 必须一致（15px × 1.9），否则行号会错位
const LINE_H = 15 * 1.9

function syncScroll() {
  if (gutter.value && ta.value) gutter.value.scrollTop = ta.value.scrollTop
}

// 选中第 n 行（1 基）：点行号、点预览行都走这里
function focusLine(n) {
  const el = ta.value
  if (!el || !n) return
  const lines = store.text.split('\n')
  const idx = Math.max(0, Math.min(n - 1, lines.length - 1))
  let start = 0
  for (let i = 0; i < idx; i++) start += lines[i].length + 1
  el.focus()
  el.setSelectionRange(start, start + lines[idx].length)
  el.scrollTop = Math.max(0, (idx - 2) * LINE_H)
  syncScroll()
}

// 预览里点了某一行 → 编辑框跳过去
watch(() => store.focusLine, (n) => {
  if (!n) return
  focusLine(n)
  store.focusLine = 0
})

// 记号工具条：点击向光标处插入记号模板，光标落到第一个 } 前
const marks = [
  { label: 'a/b', title: '堆叠分数', tpl: 'fr{}{}' },
  { label: '√', title: '根号', tpl: '√()' },
  { label: '∫', title: '积分上下限', tpl: '∫[,]' },
  { label: 'xᵧ', title: '下标', tpl: 'sb{}{}' },
  { label: '∂', title: '偏导', tpl: 'pd{}' },
  { label: 'x̄', title: '上划线', tpl: 'ov{}' },
  { label: 'lim', title: '极限（过程写在正下方）', tpl: 'lim{}' },
  { label: 'Σ', title: '求和上下限', tpl: 'Σ[,]' },
  { label: '{ }', title: '分段大括号（写在第一分支行）', tpl: '{2 ' },
]

function insert(tpl) {
  const el = ta.value
  const s = el?.selectionStart ?? store.text.length
  const e = el?.selectionEnd ?? s
  store.text = store.text.slice(0, s) + tpl + store.text.slice(e)
  nextTick(() => {
    el?.focus()
    const pos = s + Math.max(0, tpl.indexOf('}'))
    el?.setSelectionRange(pos, pos)
  })
}

async function callAi(path, body) {
  if (store.aiBusy) return null          // 单飞锁：解题期间再点拍题/解题直接忽略
  store.aiBusy = true
  store.aiKind = path.endsWith('/transcribe') ? 'transcribe' : 'solve'
  store.aiError = ''
  aiCtl = new AbortController()
  startAiTimer()
  try {
    const r = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: aiCtl.signal,
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      store.aiError = String(data.detail || `AI 请求失败（HTTP ${r.status}）`)
      retryKind.value = store.aiKind
      return null
    }
    retryKind.value = ''
    return data
  } catch (e) {
    if (e?.name === 'AbortError') {
      store.aiError = '已停止等待（注意：AI 侧可能已消耗本次额度）'
    } else {
      store.aiError = '无法连接后端'
    }
    retryKind.value = store.aiKind
    return null
  } finally {
    stopAiTimer()
    store.aiBusy = false
    store.aiKind = ''
    aiCtl = null
  }
}

// 失败重试：按上次失败的种类重发（抄题用留存的照片，解题用当前编辑区文本）
function retryAi() {
  if (store.aiBusy || !retryKind.value) return
  const kind = retryKind.value
  retryKind.value = ''
  if (kind === 'transcribe' && lastPhoto.value) {
    transcribeDataUrl(lastPhoto.value)
  } else {
    solve()
  }
}

// 等待反馈：AI 请求进行时每秒刷新"已等待 Ns"
const aiElapsed = ref(0)
let aiTimer = null

function startAiTimer() {
  aiElapsed.value = 0
  aiTimer = setInterval(() => { aiElapsed.value++ }, 1000)
}

function stopAiTimer() {
  clearInterval(aiTimer)
  aiTimer = null
}

function stopAi() {
  aiCtl?.abort()
}

async function transcribe(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  const dataUrl = await new Promise((res) => {
    const rd = new FileReader()
    rd.onload = () => res(rd.result)
    rd.readAsDataURL(f)
  })
  await transcribeDataUrl(dataUrl)
}

// 拍题核心（重试按钮复用）：照片 dataURL → 抄题入编辑区。
// 编辑区已有内容时不直接追加（否则旧题和新拍题会混成一套，AI 会解错题），
// 改为出预览卡让用户选「插入」或「替换全文」。
async function transcribeDataUrl(dataUrl) {
  lastPhoto.value = dataUrl
  const data = await callAi('/api/ai/transcribe', { image: dataUrl })
  if (!data?.text) return
  if (store.text.trim()) {
    pendingPhoto.value = { text: data.text, image: dataUrl }
    importPreview.value = {
      text: data.text, from: 'photo',
      warnings: ['这是拍题识别结果：编辑区已有内容，请确认后选择「插入」或「替换全文」'],
      chars: data.text.length, lines: data.text.split('\n').length,
    }
    return
  }
  finishPhotoImport(data.text, dataUrl)
}

function finishPhotoImport(text, image) {
  store.text = text
  store.aiUsed = false          // 抄题不算 AI 作答
  store.problemImage = image
  store.problemText = text
}

// 读取 NDJSON 流式响应，逐事件回调（解题 / 扫描版识别共用）
async function readNdjson(r, onEvent) {
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try { onEvent(JSON.parse(line)) } catch { /* 跳过坏行 */ }
    }
  }
}

// AI 解题：走流式端点（NDJSON），边生成边把原文逐字显示在抽屉里；
// done 后拿到 tex（记号→LaTeX），抽屉切换成 KaTeX 渲染（DS 网页效果）；
// 停止 = abort fetch → 后端检测断开 → 取消上游 DeepSeek 请求，不白烧 token
async function solve() {
  if (!store.text.trim()) {
    store.aiError = '先在文本框里放题目（拍照识别或手动粘贴）'
    return
  }
  const problem = store.text          // 先存题目原文，供对照栏显示
  const snapshot = store.text         // 等待期间用户可能继续编辑
  store.aiBusy = true
  store.aiKind = 'solve'
  store.aiError = ''
  store.aiRaw = ''
  store.aiTex = ''
  store.aiReasoning = ''
  store.aiElapsed = 0
  store.aiModel = ''
  aiCtl = new AbortController()
  startAiTimer()
  try {
    const r = await apiFetch('/api/ai/solve/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem }),
      signal: aiCtl.signal,
    })
    if (!r.ok || !r.body) {
      const data = await r.json().catch(() => ({}))
      store.aiError = String(data.detail || `AI 请求失败（HTTP ${r.status}）`)
      retryKind.value = 'solve'
      return
    }
    let result = null
    await readNdjson(r, (ev) => {
      if (ev.type === 'delta') store.aiRaw += ev.text
      else if (ev.type === 'reasoning') store.aiReasoning += ev.text
      else if (ev.type === 'error') store.aiError = ev.message
      else if (ev.type === 'done') result = ev
      // meta / ping 忽略
    })
    if (result?.text) {
      store.aiElapsed = result.elapsed
      store.aiModel = result.model
      store.aiRaw = result.raw
      store.aiTex = result.tex || ''
      if (store.text === snapshot) {
        applyAiAnswer(result.text, problem)
      } else {
        // 等待期间编辑区变了：不覆盖，横幅里等用户决定
        store.aiPending = { text: result.text, problem }
      }
    }
  } catch (e) {
    if (e?.name === 'AbortError') store.aiError = '已停止（已断开与 AI 的连接）'
    else store.aiError = '无法连接后端'
    retryKind.value = 'solve'
  } finally {
    stopAiTimer()
    store.aiBusy = false
    store.aiKind = ''
    aiCtl = null
  }
}

// ---- AI 原文抽屉：done 后把 LaTeX 逐行交给 KaTeX 渲染（按行缓存）----
const texLines = computed(() =>
  store.aiTex ? store.aiTex.split('\n') : [])
const _katexCache = new Map()

function lineHtml(line) {
  if (!line) return ''
  if (_katexCache.has(line)) return _katexCache.get(line)
  let html
  try {
    html = katex.renderToString(line,
      { throwOnError: false, strict: false, displayMode: false })
  } catch {
    html = line.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  }
  _katexCache.set(line, html)
  return html
}

const copied = ref(false)

async function copyRaw() {
  try {
    await navigator.clipboard.writeText(
      (store.aiReasoning ? `【思考过程】\n${store.aiReasoning}\n\n` : '')
      + (store.aiRaw || ''))
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* 剪贴板不可用时静默 */ }
}

function applyAiAnswer(text, problem) {
  store.problemText = problem
  store.text = text
  store.aiUsed = true           // AI 作答 → 显示核对提醒
  store.aiPending = null
  nextTick(() => lintBar.value?.runLint())   // AI 返回后立刻体检，别等渲染报错
}

function discardAiPending() {
  store.aiPending = null
}

// ---- 文档导入（P1）：文字版 PDF/DOCX 直接抽文本，0 token ----
// 扫描版 PDF 走「AI 识别」（P4）：逐页渲染成图交给视觉模型，NDJSON 进度
const docFile = ref(null)
const importing = ref(false)
const importError = ref('')
const importPreview = ref(null)   // {text, warnings, chars, lines, from?}
const pendingScanFile = ref(null) // 检测为扫描版的 PDF，等用户确认
const scanDetail = ref('')
const visualProgress = ref(null)  // {page, total}
const pendingPhoto = ref(null)    // 拍题结果待确认：{text, image}

async function importDoc(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  importing.value = true
  importError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', f)
    const r = await apiFetch('/api/import', { method: 'POST', body: fd })
    const data = await r.json().catch(() => ({}))
    if (r.status === 422 && /扫描/.test(String(data.detail || ''))) {
      // 扫描版：不硬拒，给「AI 识别」入口（每页消耗 1 次 AI 次数）
      pendingScanFile.value = f
      scanDetail.value = String(data.detail)
      return
    }
    if (!r.ok) {
      importError.value = String(data.detail || `导入失败（HTTP ${r.status}）`)
      return
    }
    importPreview.value = data
  } catch {
    importError.value = '无法连接后端'
  } finally {
    importing.value = false
  }
}

async function startVisualImport() {
  const f = pendingScanFile.value
  if (!f || store.aiBusy) return
  scanDetail.value = ''
  pendingScanFile.value = null
  importing.value = true
  importError.value = ''
  visualProgress.value = { page: 0, total: 0 }
  const parts = []
  store.aiBusy = true
  store.aiKind = 'import'
  aiCtl = new AbortController()
  startAiTimer()
  try {
    const fd = new FormData()
    fd.append('file', f)
    const r = await apiFetch('/api/import/visual',
      { method: 'POST', body: fd, signal: aiCtl.signal })
    if (!r.ok || !r.body) {
      const data = await r.json().catch(() => ({}))
      importError.value = String(data.detail || `识别失败（HTTP ${r.status}）`)
      return
    }
    await readNdjson(r, (ev) => {
      if (ev.type === 'meta') visualProgress.value = { page: 0, total: ev.total }
      else if (ev.type === 'page') {
        visualProgress.value = { page: ev.page, total: ev.total }
        parts.push(ev.text)
      } else if (ev.type === 'error') importError.value = ev.message
      else if (ev.type === 'done') {
        importPreview.value = {
          text: ev.text,
          from: 'visual',
          warnings: [`已用 AI 识别 ${ev.pages} 页扫描件，务必逐行核对`],
          chars: ev.text.length,
          lines: ev.text.split('\n').length,
        }
      }
    })
  } catch (e) {
    if (e?.name === 'AbortError') importError.value = '已停止（已断开与 AI 的连接）'
    else importError.value = '无法连接后端'
  } finally {
    importing.value = false
    visualProgress.value = null
    stopAiTimer()
    store.aiBusy = false
    store.aiKind = ''
    aiCtl = null
  }
}

function cancelScanOffer() {
  pendingScanFile.value = null
  scanDetail.value = ''
}

function insertImported() {
  const t = importPreview.value?.text
  if (!t) return
  const el = ta.value
  const s = el?.selectionStart ?? store.text.length
  const e = el?.selectionEnd ?? s
  const pad = store.text && s > 0 && store.text[s - 1] !== '\n' ? '\n' : ''
  store.text = store.text.slice(0, s) + pad + t + '\n' + store.text.slice(e)
  adoptPendingPhoto()
  importPreview.value = null
}

function replaceAllImported() {
  const t = importPreview.value?.text
  if (!t) return
  store.text = t
  adoptPendingPhoto()
  importPreview.value = null
}

// 拍题结果被采用后，补上"题目原文/照片"对照栏的数据
function adoptPendingPhoto() {
  if (!pendingPhoto.value) return
  store.problemText = pendingPhoto.value.text
  store.problemImage = pendingPhoto.value.image
  store.aiUsed = false
  pendingPhoto.value = null
}

function cancelImport() {
  pendingPhoto.value = null
  importPreview.value = null
}
</script>

<template>
  <section class="panel editor">
    <details v-if="store.problemText || store.problemImage" class="problem">
      <summary>
        题目原文（点开对照）
        <span class="tip">解题时会自动留存，方便逐行核对答案</span>
      </summary>
      <img v-if="store.problemImage" :src="store.problemImage" alt="题目照片" />
      <pre v-if="store.problemText">{{ store.problemText }}</pre>
    </details>

    <div class="toolbar">
      <button v-for="m in marks" :key="m.tpl" :title="m.title + '：' + m.tpl"
              @click="insert(m.tpl)">
        {{ m.label }}
      </button>
      <span class="sep"></span>
      <button class="ai" title="拍题目照片，AI 抄成文字"
              :disabled="store.aiBusy || importing"
              @click="photoFile.click()">
        {{ store.aiBusy && store.aiKind === 'transcribe'
          ? `正在抄题… ${aiElapsed}s` : '📷 拍题' }}
      </button>
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden
             ref="photoFile" @change="transcribe" />
      <button class="ai" title="上传文字版 PDF / Word 文档，直接提取文字（不消耗 AI 次数）"
              :disabled="store.aiBusy || importing" @click="docFile.click()">
        {{ importing ? '解析中…' : '📄 导入' }}
      </button>
      <input type="file" accept=".pdf,.docx" hidden
             ref="docFile" @change="importDoc" />
      <button class="ai" title="AI 按本站记号规范写答案（务必自行核对）"
              :disabled="store.aiBusy || importing" @click="solve">
        {{ store.aiBusy && store.aiKind === 'solve'
          ? `正在解题… ${aiElapsed}s` : '🤖 AI 解题' }}
      </button>
      <button v-if="store.aiBusy" class="stop" @click="stopAi"
              title="不再等待结果（AI 侧可能已消耗本次额度）">
        ✕ 停止
      </button>
      <a class="cheatsheet" href="https://github.com/xiaoxiaoyu-123/handwritten-simulation-front-end#支持的记号"
         target="_blank">记号速查 ↗</a>
    </div>

    <p v-if="store.aiBusy" class="ai-hint">
      通常 30–90 秒；期间可以继续编辑，答案返回时若文本已改动会先询问再覆盖
    </p>

    <!-- AI 原文抽屉（P2/P3）：流式时逐字出现；done 后 KaTeX 渲染（DS 网页效果）。
         原文仅供阅读核对，永不进 PDF——编辑区/渲染管线始终吃记号文本 -->
    <details v-if="store.aiRaw || store.aiReasoning" class="rawbox"
             :open="store.aiBusy || undefined">
      <summary>
        📄 AI 原文（模型原始输出，仅供核对）
        <span class="tip">{{ store.aiBusy
          ? '生成中…'
          : `模型 ${store.aiModel} · 耗时 ${store.aiElapsed}s` }}</span>
      </summary>
      <pre v-if="store.aiReasoning" class="reasoning">【思考过程】
{{ store.aiReasoning }}</pre>
      <div v-if="store.aiTex" class="rawtext katexbox">
        <div v-for="(line, i) in texLines" :key="i" class="texline"
             v-html="lineHtml(line)"></div>
      </div>
      <pre v-else class="rawtext">{{ store.aiRaw }}</pre>
      <div class="import-actions">
        <button @click="copyRaw">{{ copied ? '✓ 已复制' : '复制原文' }}</button>
        <span v-if="store.aiTex" class="tex-tip">公式已排版显示；编辑区仍是可直接渲染的记号文本</span>
      </div>
    </details>

    <!-- 扫描版 PDF：确认后逐页 AI 识别（P4，每页 1 次 AI 次数） -->
    <div v-if="pendingScanFile" class="import-box">
      <div class="import-head">
        📄 {{ pendingScanFile.name }}：扫描版 PDF（没有文字层）
      </div>
      <p class="import-warn">{{ scanDetail }}</p>
      <p class="import-warn">
        可以逐页用 AI 视觉识别：每页消耗 1 次 AI 次数（上限 5 页/次），
        识别结果出来后请务必逐行核对。
      </p>
      <div class="import-actions">
        <button @click="startVisualImport">开始 AI 识别</button>
        <button class="ghost" @click="cancelScanOffer">取消</button>
      </div>
    </div>
    <div v-if="visualProgress" class="import-box">
      <div class="import-head">
        正在识别第 {{ visualProgress.page }} / {{ visualProgress.total }} 页…
        <span class="import-note">点上方「✕ 停止」可中断，已识别的页保留</span>
      </div>
    </div>

    <!-- 文档导入预览：解析完先确认，不直接覆盖编辑区 -->
    <div v-if="importPreview" class="import-box">
      <div class="import-head">
        解析完成：{{ importPreview.chars }} 字 / {{ importPreview.lines }} 行
        <span v-if="!importPreview.from" class="import-note">文字版直接提取，不消耗 AI 次数</span>
        <span v-else-if="importPreview.from === 'photo'" class="import-note">拍题识别结果（已消耗 1 次 AI 次数）</span>
      </div>
      <pre class="import-text">{{ importPreview.text.slice(0, 600)
        }}{{ importPreview.text.length > 600 ? '…' : '' }}</pre>
      <p v-for="w in importPreview.warnings" :key="w" class="import-warn">⚠ {{ w }}</p>
      <div class="import-actions">
        <button @click="insertImported">插入到光标处</button>
        <button @click="replaceAllImported">替换全文</button>
        <button class="ghost" @click="cancelImport">取消</button>
      </div>
    </div>
    <p v-if="importError" class="error">{{ importError }}</p>

    <!-- AI 答案返回但编辑区已被用户改过：不覆盖，等用户决定 -->
    <div v-if="store.aiPending" class="pending-box">
      <div>
        AI 答案已返回——等待期间你改动了文本，没有自动覆盖
        <span class="pending-tip">应用后原题会存入「题目原文」对照栏</span>
      </div>
      <div class="import-actions">
        <button @click="applyAiAnswer(store.aiPending.text, store.aiPending.problem)">
          应用到编辑区
        </button>
        <button class="ghost" @click="discardAiPending">丢弃</button>
      </div>
    </div>

    <div class="editor-body">
      <div class="gutter" ref="gutter" aria-hidden="false">
        <div v-for="n in lineCount" :key="n" class="ln"
             :class="{ skip: skipSet.has(n), block: blockSet.has(n) }"
             :title="skipSet.has(n) ? '这行含跳步标志词，核对一下'
                     : blockSet.has(n) ? '这行有记号问题'
                     : '跳到第 ' + n + ' 行'"
             @click="focusLine(n)">{{ n }}</div>
      </div>
      <textarea ref="ta" v-model="store.text" @scroll="syncScroll"
        placeholder="在这里输入或粘贴作业文本…&#10;支持记号：fr{分子}{分母}、√(...)、∫[下,上]、sb{底}{下标}、lim{过程}、Σ[下,上] 等&#10;指数写 ^ 记法：e^(-jωt)、x^(n+1)&#10;也可以📷拍题让 AI 抄题、🤖让 AI 解题"
      ></textarea>
    </div>
    <p v-if="store.aiUsed" class="ai-warn">
      ⚠ 当前内容由 AI 生成，渲染导出前务必逐行自行核对
    </p>
    <LintBar ref="lintBar" @fix-all="() => {}" />
    <p v-if="store.aiError" class="error">
      {{ store.aiError }}
      <button v-if="retryKind" class="retry" @click="retryAi">↻ 重试</button>
    </p>
    <div class="meta">
      行数 {{ lineCount }}
      <span v-if="skipSet.size" class="meta-skip">
        · 🟡 {{ skipSet.size }} 行疑似跳步（行号标黄）
      </span>
    </div>
  </section>
</template>
