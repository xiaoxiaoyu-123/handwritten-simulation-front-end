<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import LintBar from './LintBar.vue'
import { store } from '../store'
import { apiFetch } from '../api'

const ta = ref(null)
const gutter = ref(null)
const photoFile = ref(null)
const lintBar = ref(null)
let aiCtl = null            // 进行中 AI 请求的 AbortController（「停止」用）

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
      return null
    }
    return data
  } catch (e) {
    if (e?.name === 'AbortError') {
      store.aiError = '已停止等待（注意：AI 侧可能已消耗本次额度）'
    } else {
      store.aiError = '无法连接后端'
    }
    return null
  } finally {
    stopAiTimer()
    store.aiBusy = false
    store.aiKind = ''
    aiCtl = null
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
  const data = await callAi('/api/ai/transcribe', { image: dataUrl })
  if (data?.text) {
    store.text = (store.text ? store.text + '\n' : '') + data.text
    store.aiUsed = false          // 抄题不算 AI 作答
    // 对照用：留下照片与识别出的题文，解题后还能并排核对
    store.problemImage = dataUrl
    store.problemText = data.text
  }
}

async function solve() {
  if (!store.text.trim()) {
    store.aiError = '先在文本框里放题目（拍照识别或手动粘贴）'
    return
  }
  const problem = store.text          // 先存题目原文，供对照栏显示
  const snapshot = store.text         // 等待期间用户可能继续编辑
  const data = await callAi('/api/ai/solve', { problem })
  if (!data?.text) return
  if (store.text === snapshot) {
    applyAiAnswer(data.text, problem)
  } else {
    // 等待期间编辑区变了：不覆盖，横幅里等用户决定
    store.aiPending = { text: data.text, problem }
  }
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
const docFile = ref(null)
const importing = ref(false)
const importError = ref('')
const importPreview = ref(null)   // {text, warnings, chars, lines}

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

function insertImported() {
  const t = importPreview.value?.text
  if (!t) return
  const el = ta.value
  const s = el?.selectionStart ?? store.text.length
  const e = el?.selectionEnd ?? s
  const pad = store.text && s > 0 && store.text[s - 1] !== '\n' ? '\n' : ''
  store.text = store.text.slice(0, s) + pad + t + '\n' + store.text.slice(e)
  importPreview.value = null
}

function replaceAllImported() {
  const t = importPreview.value?.text
  if (!t) return
  store.text = t
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

    <!-- 文档导入预览：解析完先确认，不直接覆盖编辑区 -->
    <div v-if="importPreview" class="import-box">
      <div class="import-head">
        解析完成：{{ importPreview.chars }} 字 / {{ importPreview.lines }} 行
        <span class="import-note">文字版直接提取，不消耗 AI 次数</span>
      </div>
      <pre class="import-text">{{ importPreview.text.slice(0, 600)
        }}{{ importPreview.text.length > 600 ? '…' : '' }}</pre>
      <p v-for="w in importPreview.warnings" :key="w" class="import-warn">⚠ {{ w }}</p>
      <div class="import-actions">
        <button @click="insertImported">插入到光标处</button>
        <button @click="replaceAllImported">替换全文</button>
        <button class="ghost" @click="importPreview = null">取消</button>
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
    <p v-if="store.aiError" class="error">{{ store.aiError }}</p>
    <div class="meta">
      行数 {{ lineCount }}
      <span v-if="skipSet.size" class="meta-skip">
        · 🟡 {{ skipSet.size }} 行疑似跳步（行号标黄）
      </span>
    </div>
  </section>
</template>
