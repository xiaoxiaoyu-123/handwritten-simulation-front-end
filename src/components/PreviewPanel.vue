<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { loadHistory, saveHistoryEntry, store } from '../store'
import { apiFetch } from '../api'

onMounted(loadHistory)

// 手动刷新按钮旁的"更新于 HH:MM:SS"（P0）+ 多页翻页状态
const updatedAt = ref('')
const curPage = ref(1)
const hasNext = ref(false)

// 体检未通过（有需人工改的问题）时禁止生成，避免吐出带字面量的 PDF
const blocked = computed(() => (store.lint?.blockers?.length || 0) > 0)
const blockReason = computed(() => {
  const n = store.lint?.blockers?.length || 0
  return n ? `有 ${n} 处记号问题需先修改（见编辑区体检提示）` : ''
})

let timer = null
watch(() => [store.text, store.paper, store.font, store.chaos,
             store.previewNonce], () => {
  clearTimeout(timer)
  curPage.value = 1                    // 内容变了回到第 1 页
  if (!store.text.trim()) {
    store.previewUrl = ''
    hasNext.value = false
    return
  }
  timer = setTimeout(preview, 500)          // 防抖 500ms
})

// 取消上一次预览请求：狂打字时旧的渲染还没回来就被新输入取代，
// 不取消的话请求会在服务端排队堆积，把单 worker 的 CPU 占满
let abortCtl = null

async function preview() {
  if (abortCtl) abortCtl.abort()
  const ctl = new AbortController()
  abortCtl = ctl
  store.previewing = true
  store.previewError = ''
  try {
    const r = await apiFetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: store.text, paper: store.paper,
                             font: store.font, chaos: store.chaos,
                             page: curPage.value }),
      signal: ctl.signal,
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      const d = err.detail
      store.previewError = typeof d === 'object'
        ? `${d.message}：${(d.details || []).join('；')}`
        : String(d || `预览失败（HTTP ${r.status}）`)
      store.previewUrl = ''
    } else {
      const data = await r.json()
      store.previewUrl = data.image
      store.previewGeom = data.geom || null
      store.previewError = data.warnings?.length
        ? data.warnings.join('\n') : ''
      updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      // 后端把超页请求钳到最后一页，页码以它返回的为准
      curPage.value = data.page || curPage.value
      hasNext.value = !!data.has_next
    }
  } catch (e) {
    if (e?.name === 'AbortError' || abortCtl !== ctl) return
    store.previewError = '无法连接后端'
  } finally {
    if (abortCtl === ctl) store.previewing = false
  }
}

// 多页翻页（后端逐页缓存：往回翻秒出，往前翻渲染一页约 3-6 秒）
function nextPage() {
  if (!hasNext.value || store.previewing || !store.text.trim()) return
  curPage.value++
  preview()
}

function prevPage() {
  if (curPage.value <= 1 || store.previewing) return
  curPage.value--
  preview()
}

// 手动刷新：跳过防抖立即重渲染当前页（自动刷新偶发"卡住"时的兜底入口）
function refreshNow() {
  if (!store.text.trim() || store.previewing) return
  clearTimeout(timer)
  preview()
}

// 点预览某一行 → 编辑区跳到对应源文本行。
// 后端给了 first_baseline / line_spacing / rendered_to_src：自动断行时
// 一条源行会占多条渲染行，映射表把它们折回同一行。
function jumpToLine(e) {  const g = store.previewGeom
  if (!g || !g.line_spacing) return
  const img = e.currentTarget
  const rect = img.getBoundingClientRect()
  if (!rect.height) return
  const y = (e.clientY - rect.top) * (g.height / rect.height)
  const idx = Math.round((y - g.first_baseline) / g.line_spacing)
  const clamped = Math.max(0, Math.min(idx, g.rendered_lines - 1))
  const src = g.rendered_to_src?.[String(clamped)]
  if (src === undefined || src === null) return
  store.focusLine = src + 1
}

async function generate() {
  store.jobError = ''
  store.downloadUrl = ''
  store.downloadPngUrl = ''
  const r = await apiFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: store.text, paper: store.paper,
                           font: store.font, chaos: store.chaos }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    store.jobError = String(err.detail || '创建任务失败')
    return
  }
  store.job = await r.json()
  saveHistoryEntry()
  poll()
}

async function poll() {
  while (store.job && store.job.status !== 'done'
         && store.job.status !== 'failed') {
    await new Promise(res => setTimeout(res, 800))
    const r = await apiFetch(`/api/jobs/${store.job.id}`)
    if (!r.ok) break
    store.job = await r.json()
  }
  if (store.job?.status === 'done') {
    store.downloadUrl = `/api/jobs/${store.job.id}/download`
    store.downloadPngUrl = `/api/jobs/${store.job.id}/download?format=png`
  } else if (store.job?.status === 'failed') {
    store.jobError = store.job.error || '渲染失败'
  }
}

const percent = computed(() => {
  const j = store.job
  if (!j) return 0
  if (j.status === 'done') return 100
  if (j.status === 'pdf') return 97
  if (j.status === 'rendering' && j.total > 0) {
    return Math.round((j.done / j.total) * 95)
  }
  return 4
})

const statusText = computed(() => {
  const j = store.job
  if (!j) return '待生成'
  return {
    queued: '排队中…',
    rendering: `渲染中 第${j.done}页 / 共${j.total}页`,
    pdf: '正在合成 PDF…',
    done: '✅ 完成',
    failed: '失败',
  }[j.status] || j.status
})
</script>

<template>
  <section class="panel preview">
    <h2 class="preview-head">
      实时预览（改动后自动刷新）
      <span class="h-actions">
        <span v-if="updatedAt" class="upd">更新于 {{ updatedAt }}</span>
        <button class="refresh" :class="{ spinning: store.previewing }"
                :disabled="store.previewing || !store.text.trim()"
                title="手动刷新预览" @click="refreshNow">⟳</button>
      </span>
    </h2>
    <div class="page">
      <img v-if="store.previewUrl" :src="store.previewUrl" alt="预览"
           class="clickable" title="点任意一行 → 编辑框跳到对应源文本行"
           @click="jumpToLine" />
      <div v-if="store.previewing && store.previewUrl" class="overlay">渲染中…</div>
      <p v-else-if="store.previewing" class="placeholder">渲染中…</p>
      <p v-else class="placeholder">
        在左侧输入文本，这里会显示第一页手写效果
      </p>
    </div>
    <p v-if="store.previewUrl" class="hint-line pager">
      <button class="pagebtn" :disabled="curPage <= 1 || store.previewing"
              @click="prevPage">‹ 上一页</button>
      <span class="pageno">第 {{ curPage }} 页<span v-if="!hasNext">（末页）</span></span>
      <button class="pagebtn" :disabled="!hasNext || store.previewing"
              @click="nextPage">下一页 ›</button>
    </p>
    <p v-if="store.previewError" class="error">{{ store.previewError }}</p>

    <button class="primary" :disabled="!store.text.trim() || blocked
      || (store.job && !['done', 'failed'].includes(store.job.status))"
      @click="generate">
      生成（共 {{ Math.max(1, Math.ceil((store.text ? store.text.split('\n').length : 0) / 25)) }} 页）
    </button>
    <p v-if="blocked" class="error">{{ blockReason }}</p>

    <div class="progress">
      <div class="bar"><div class="fill" :style="{ width: percent + '%' }"></div></div>
      <span class="status">{{ statusText }}</span>
      <a v-if="store.downloadUrl" class="download" :href="store.downloadUrl">⬇ PDF</a>
      <a v-if="store.downloadPngUrl" class="download" :href="store.downloadPngUrl">⬇ PNG</a>
    </div>
    <p v-if="store.jobError" class="error">{{ store.jobError }}</p>
  </section>
</template>
