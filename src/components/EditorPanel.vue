<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import LintBar from './LintBar.vue'
import RawDrawer from './RawDrawer.vue'
import EditorToolbar from './EditorToolbar.vue'
import { cur, persistNow, store } from '../store'
import { apiFetch } from '../api'

const ta = ref(null)
const gutter = ref(null)
const photoFile = ref(null)
const docFile = ref(null)
const lintBar = ref(null)
let aiCtl = null            // 进行中 AI 请求的 AbortController（「停止」用）
const lastPhoto = ref('')   // 最近一次拍题照片（失败重试用）
const retryKind = ref('')   // 失败的 AI 调用类型（'solve'|'transcribe'）

const s = computed(() => cur())   // 当前会话（模板直接用 s.xxx）

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

// 切换会话：重试按钮的上下文跟着新会话重置（抽屉跟随态在 RawDrawer 内自管）
watch(() => store.activeId, () => {
  retryKind.value = ''
})

// 记号插入：工具条 emit 过来，光标落到第一个 } 前
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

// s = 发起调用时的会话：错误写进它，切走也不串
async function callAi(path, body, s) {
  if (store.aiBusy) return null          // 单飞锁：解题期间再点拍题/解题直接忽略
  store.aiBusy = true
  store.aiKind = path.endsWith('/transcribe') ? 'transcribe' : 'solve'
  s.aiError = ''
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
      s.aiError = String(data.detail || `AI 请求失败（HTTP ${r.status}）`)
      retryKind.value = store.aiKind
      return null
    }
    retryKind.value = ''
    return data
  } catch (e) {
    if (e?.name === 'AbortError') {
      s.aiError = '已停止等待（注意：AI 侧可能已消耗本次额度）'
    } else {
      s.aiError = '无法连接后端'
    }
    retryKind.value = store.aiKind
    return null
  } finally {
    stopAiTimer()
    store.aiBusy = false
    store.aiKind = ''
    aiCtl = null
    persistNow()
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
  const s = cur()
  lastPhoto.value = dataUrl
  const data = await callAi('/api/ai/transcribe', { image: dataUrl }, s)
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
  persistNow()
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

// AI 解题主入口：Agent 流水线（查题库命中秒取 / AI 解题 / 失败换模型）
async function solve() {
  const s = cur()
  if (!s.text.trim()) {
    s.aiError = '先在文本框里放题目（拍照识别或手动粘贴）'
    return
  }
  await doSolve(s.text, s, false)
}

// 重新生成（题库来源时可要求全新的 AI 解答）
function reSolveAi() {
  const s = cur()
  if (s.problemText) doSolve(s.problemText, s, true)
}

// 实际解题：流式端点（Agent 流水线），输出写进**发起时的会话对象**——
// 期间切到别的会话查看互不打扰，切回来原文抽屉/编辑区自动恢复；
// 停止 = abort → 后端取消上游请求
async function doSolve(problem, s, forceAi = false) {
  const snapshot = s.text         // 解答返回时对比：期间是否改过文本
  store.aiBusy = true
  store.aiKind = 'solve'
  s.aiError = ''
  s.raw = ''
  s.tex = ''
  s.reasoning = ''
  s.elapsed = 0
  s.model = ''
  s.aiState = 'solving'
  aiCtl = new AbortController()
  startAiTimer()
  let result = null
  try {
    const r = await apiFetch('/api/ai/solve/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, force_ai: forceAi }),
      signal: aiCtl.signal,
    })
    if (!r.ok || !r.body) {
      const data = await r.json().catch(() => ({}))
      s.aiError = String(data.detail || `AI 请求失败（HTTP ${r.status}）`)
      s.aiState = 'error'
      retryKind.value = 'solve'
      return
    }
    await readNdjson(r, (ev) => {
      if (ev.type === 'delta') s.raw += ev.text
      else if (ev.type === 'reasoning') s.reasoning += ev.text
      else if (ev.type === 'retry') { s.raw = ''; s.reasoning = '' }   // 换备用模型重来
      else if (ev.type === 'error') s.aiError = ev.message
      else if (ev.type === 'done') result = ev
      // meta / ping 忽略
    })
    if (result?.text) {
      s.elapsed = result.elapsed
      s.model = result.model
      s.raw = result.raw
      s.tex = result.tex || ''
      s.fromKb = result.source === 'kb'
      s.kbAuto = result.kb_saved === true && !s.fromKb
      if (cur()?.id === s.id) {
        if (s.text === snapshot) {
          applyAiAnswer(result.text, problem)
        } else {
          // 等待期间用户改了本会话文本：不覆盖，横幅里等用户决定
          s.aiPending = { text: result.text, problem }
        }
      } else {
        // 没人在看这个会话：直接落位，切回来就是答案
        s.problemText = problem
        s.text = result.text
        s.aiUsed = true
      }
    } else if (!s.aiError) {
      s.aiError = 'AI 没有返回内容'
      s.aiState = 'error'
    }
  } catch (e) {
    if (e?.name === 'AbortError') s.aiError = '已停止（已断开与 AI 的连接）'
    else s.aiError = '无法连接后端'
    s.aiState = 'error'
    retryKind.value = 'solve'
  } finally {
    if (s.aiState === 'solving') s.aiState = s.aiError ? 'error' : 'ready'
    stopAiTimer()
    store.aiBusy = false
    store.aiKind = ''
    aiCtl = null
    persistNow()
  }
}

function applyAiAnswer(text, problem) {
  store.problemText = problem
  store.text = text
  store.aiUsed = true           // AI 作答 → 显示核对提醒
  store.aiPending = null
  store.aiState = 'ready'
  nextTick(() => lintBar.value?.runLint())   // AI 返回后立刻体检，别等渲染报错
}

function discardAiPending() {
  store.aiPending = null
}

// ---- 文档导入（P1）：文字版 PDF/DOCX 直接抽文本，0 token ----
// 扫描版 PDF 走「AI 识别」（P4）：逐页渲染成图交给视觉模型，NDJSON 进度
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
    persistNow()
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
  persistNow()
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

    <EditorToolbar :ai-elapsed="aiElapsed" :importing="importing"
                   @insert="insert" @photo="photoFile.click()"
                   @import="docFile.click()" @solve="solve" @stop="stopAi" />
    <input type="file" accept="image/png,image/jpeg,image/webp" hidden
           ref="photoFile" @change="transcribe" />
    <input type="file" accept=".pdf,.docx" hidden
           ref="docFile" @change="importDoc" />

    <p v-if="store.aiBusy" class="ai-hint">
      通常 30–90 秒；期间可以点左侧历史切到别的题目查看，输出会写进本条会话，
      切回来即可继续看流式进度
    </p>

    <RawDrawer />

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

    <!-- AI 答案返回但本会话文本已被用户改过：不覆盖，等用户决定 -->
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
        placeholder="在这里输入或粘贴作业文本…&#10;支持记号：fr{分子}{分母}、√(...)、∫[下,上]、sb{底}{下标}、lim{过程}、Σ[下,上]、mat(行;行) 等&#10;指数写 ^ 记法：e^(-jωt)、x^(n+1)&#10;也可以📷拍题让 AI 抄题、🤖让 AI 解题"
      ></textarea>
    </div>
    <p v-if="store.aiUsed" class="ai-warn">
      <template v-if="s && s.fromKb">
        ⚡ 本解答来自个人题库（已验算）——想看不同的解法可以重新生成
        <button class="kb-save" :disabled="store.aiBusy"
                @click="reSolveAi">🔄 重新 AI 解题</button>
      </template>
      <template v-else>
        ⚠ 当前内容由 AI 生成，渲染导出前务必逐行自行核对
        <span v-if="s && s.kbAuto" class="kb-saved">✓ 已自动存入题库（校准中）</span>
      </template>
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
