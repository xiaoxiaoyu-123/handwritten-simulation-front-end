<script setup>
import { nextTick, ref } from 'vue'
import { store } from '../store'

const ta = ref(null)
const photoFile = ref(null)

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
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...store.aiconfig, ...body }),
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
  if (!store.aiconfig) {
    store.showAiSettings = true
    e.target.value = ''
    return
  }
  const dataUrl = await new Promise((res) => {
    const rd = new FileReader()
    rd.onload = () => res(rd.result)
    rd.readAsDataURL(f)
  })
  const data = await callAi('/api/ai/transcribe', { image: dataUrl })
  if (data?.text) {
    store.text = (store.text ? store.text + '\n' : '') + data.text
    store.aiUsed = false          // 抄题不算 AI 作答
  }
  e.target.value = ''
}

async function solve() {
  if (!store.text.trim()) {
    store.aiError = '先在文本框里放题目（拍照识别或手动粘贴）'
    return
  }
  if (!store.aiconfig) {
    store.showAiSettings = true
    return
  }
  const data = await callAi('/api/ai/solve', { problem: store.text })
  if (data?.text) {
    store.text = data.text
    store.aiUsed = true           // AI 作答 → 显示核对提醒
  }
}
</script>

<template>
  <section class="panel editor">
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
    <textarea ref="ta" v-model="store.text"
      placeholder="在这里输入或粘贴作业文本…&#10;支持记号：fr{分子}{分母}、√(...)、∫[下,上]、sb{底}{下标}、lim{过程}、Σ[下,上] 等&#10;指数写 ^ 记法：e^(-jωt)、x^(n+1)&#10;也可以📷拍题让 AI 抄题、🤖让 AI 解题"
    ></textarea>
    <p v-if="store.aiUsed" class="ai-warn">
      ⚠ 当前内容由 AI 生成，渲染导出前务必逐行自行核对
    </p>
    <p v-if="store.aiError" class="error">{{ store.aiError }}</p>
    <div class="meta">行数 {{ store.text ? store.text.split('\n').length : 0 }}</div>
  </section>
</template>
