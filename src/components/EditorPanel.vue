<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import LintBar from './LintBar.vue'
import { store } from '../store'
import { apiFetch } from '../api'

const ta = ref(null)
const gutter = ref(null)
const photoFile = ref(null)
const lintBar = ref(null)

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
  store.aiBusy = true
  store.aiError = ''
  try {
    const r = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      store.aiError = String(data.detail || 'AI 请求失败')
      return null
    }
    return data
  } catch {
    store.aiError = '无法连接后端'
    return null
  } finally {
    store.aiBusy = false
  }
}

async function transcribe(e) {
  const f = e.target.files[0]
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
  e.target.value = ''
}

async function solve() {
  if (!store.text.trim()) {
    store.aiError = '先在文本框里放题目（拍照识别或手动粘贴）'
    return
  }
  const problem = store.text          // 先存题目原文，供对照栏显示
  const data = await callAi('/api/ai/solve', { problem })
  if (data?.text) {
    store.problemText = problem
    store.text = data.text
    store.aiUsed = true           // AI 作答 → 显示核对提醒
    await nextTick()
    lintBar.value?.runLint()      // AI 返回后立刻体检，别等渲染报错
  }
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
      <button class="ai" title="拍题目照片，AI 抄成文字" @click="photoFile.click()">
        📷 拍题
      </button>
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden
             ref="photoFile" @change="transcribe" />
      <button class="ai" title="AI 按本站记号规范写答案（务必自行核对）"
              :disabled="store.aiBusy" @click="solve">
        {{ store.aiBusy ? 'AI 思考中…' : '🤖 AI 解题' }}
      </button>
      <a class="cheatsheet" href="https://github.com/xiaoxiaoyu-123/handwritten-simulation-front-end#支持的记号"
         target="_blank">记号速查 ↗</a>
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
