<script setup>
// AI 原文抽屉（P2/P3）：外层一起折叠，内层「思考过程 / 解答原文」各自独立折叠；
// 流式时贴底自动跟随，上翻即停，右下角"回到最新"；done 后 KaTeX 整块渲染。
// 原文仅供阅读核对，永不进 PDF——编辑区/渲染管线始终吃记号文本。
import { computed, nextTick, ref, watch } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { store } from '../store'

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

const rawEl = ref(null)
const reasonEl = ref(null)
const followRaw = ref(true)
const followReason = ref(true)

function nearBottom(e) {
  const el = e.target
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

async function stick(el, on) {
  if (!on || !el) return
  await nextTick()
  el.scrollTop = el.scrollHeight
}

function jumpBottom(el, which) {
  if (which === 'raw') followRaw.value = true
  else followReason.value = true
  if (el) el.scrollTop = el.scrollHeight
}

watch(() => store.aiRaw, () => stick(rawEl.value, followRaw.value))
watch(() => store.aiReasoning, () => stick(reasonEl.value, followReason.value))
// done 后 pre → KaTeX 整块替换：重新建立跟随
watch(() => store.aiTex, () => {
  followRaw.value = true
  stick(rawEl.value, true)
})

// 切换会话时重置跟随（App/store 层切会话不重挂本组件，需监听）
watch(() => store.activeId, () => {
  followRaw.value = true
  followReason.value = true
})

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
</script>

<template>
  <details v-if="store.aiRaw || store.aiReasoning" class="rawbox"
           :open="store.aiBusy || undefined">
    <summary>
      📄 AI 原文（模型原始输出，仅供核对）
      <span class="tip">{{ store.aiBusy
        ? '生成中…'
        : `模型 ${store.aiModel} · 耗时 ${store.aiElapsed}s` }}</span>
    </summary>
    <details v-if="store.aiReasoning" class="rawsub"
             :open="store.aiBusy || undefined">
      <summary>💭 思考过程</summary>
      <div class="rawwrap">
        <pre v-if="store.aiReasoning" class="reasoning" ref="reasonEl"
             @scroll="followReason = nearBottom($event)">{{ store.aiReasoning }}</pre>
        <button v-if="!followReason" class="to-bottom"
                title="回到最新输出" @click="jumpBottom(reasonEl, 'reason')">
          ↓ 回到最新
        </button>
      </div>
    </details>
    <details class="rawsub" :open="store.aiBusy || undefined">
      <summary>✍️ 解答原文</summary>
      <div class="rawwrap">
        <pre v-if="!store.aiTex" class="rawtext" ref="rawEl"
             @scroll="followRaw = nearBottom($event)">{{ store.aiRaw }}</pre>
        <div v-else class="rawtext katexbox" ref="rawEl"
             @scroll="followRaw = nearBottom($event)">
          <div v-for="(line, i) in texLines" :key="i" class="texline"
               v-html="lineHtml(line)"></div>
        </div>
        <button v-if="!followRaw" class="to-bottom"
                title="回到最新输出" @click="jumpBottom(rawEl, 'raw')">
          ↓ 回到最新
        </button>
      </div>
    </details>
    <div class="import-actions">
      <button @click="copyRaw">{{ copied ? '✓ 已复制' : '复制原文' }}</button>
      <span v-if="store.aiTex" class="tex-tip">公式已排版显示；编辑区仍是可直接渲染的记号文本</span>
    </div>
  </details>
</template>
