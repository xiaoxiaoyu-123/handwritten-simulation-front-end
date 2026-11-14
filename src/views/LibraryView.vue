<script setup>
// 个人题库页（RAG v1）：列表/搜索/置信度标签/展开查看/删除。
// 解答经「双解一致 + sympy 验算」自动校准置信度，无需人工预审。
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import { apiFetch } from '../api'

const vueRouter = useRouter()
const animLoading = ref('')

const entries = ref([])
const q = ref('')
const loading = ref(false)
const error = ref('')
const expanded = ref('')

const confLabel = { L0: '未验证', L1: '双解一致', L2: '已验算' }
const confClass = { L0: 'c0', L1: 'c1', L2: 'c2' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    entries.value = await (await apiFetch(
      `/api/kb/list?q=${encodeURIComponent(q.value)}`)).json()
  } catch {
    error.value = '无法连接后端'
  } finally {
    loading.value = false
  }
}

function toggleExpand(id) {
  expanded.value = expanded.value === id ? '' : id
}

async function del(e) {
  if (!confirm(`从题库删除「${e.title || '这条解答'}」？`)) return
  await apiFetch(`/api/kb/${e.id}`, { method: 'DELETE' })
  await load()
}

function firstLine(text) {
  return (text || '').split('\n')[0] || ''
}

function copySolution(e) {
  navigator.clipboard.writeText(e.solution).catch(() => {})
}

async function makeAnim(e) {
  animLoading.value = e.id
  try {
    const r = await apiFetch('/api/ai/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem: e.problem, solution: e.solution }),
    })
    if (r.ok) {
      const data = await r.json()
      store.animSteps = data.steps || []
      store.animProblem = firstLine(e.problem)
      vueRouter.push('/anim')
    } else {
      const data = await r.json().catch(() => ({}))
      alert(String(data.detail || '讲解生成失败'))
    }
  } catch {
    alert('讲解生成失败：无法连接后端')
  } finally {
    animLoading.value = ''
  }
}

function fmt(ts) {
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(load)
</script>

<template>
  <main class="page-narrow">
    <section class="panel kb-page">
      <h2 class="page-title">📚 个人题库</h2>
      <p class="page-sub">
        AI 解答经「独立二解 + 符号验算」自动校准后沉淀在这里——
        写作业时遇到相同、相似的题，直接取回已核验的解答。
      </p>

      <div class="kb-search">
        <input type="text" v-model="q" placeholder="搜索题面/解答关键词…"
               @keyup.enter="load" />
        <button @click="load">搜索</button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="hint">加载中…</p>

      <div v-if="!loading && !entries.length && !error" class="kb-empty">
        <p>题库还是空的。</p>
        <p class="hint">在「写作业」页让 AI 解题后，点「💾 存入题库」，
          解答会经自动校准沉淀到这里。</p>
      </div>

      <div v-for="e in entries" :key="e.id" class="kb-entry">
        <div class="kb-row" @click="toggleExpand(e.id)">
          <span class="kb-conf" :class="confClass[e.confidence]">
            {{ confLabel[e.confidence] || e.confidence }}
          </span>
          <span class="kb-title">{{ firstLine(e.problem) || e.title }}</span>
          <span class="kb-meta">{{ fmt(e.created) }}</span>
          <span v-if="e.use_count" class="kb-meta">· 用过 {{ e.use_count }} 次</span>
        </div>
        <div v-if="expanded === e.id" class="kb-detail">
          <b class="kb-label">题面</b>
          <pre>{{ e.problem }}</pre>
          <b class="kb-label">解答</b>
          <pre>{{ e.solution }}</pre>
          <div class="import-actions">
            <button @click="copySolution(e)">复制解答</button>
            <button :disabled="animLoading === e.id" @click="makeAnim(e)">
              {{ animLoading === e.id ? '讲解生成中…' : '🎬 动画讲解' }}
            </button>
            <button class="ghost" @click="del(e)">删除</button>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
