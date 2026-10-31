<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { cur, loadHistory, persistNow, store } from '../store'
import { apiFetch } from '../api'

onMounted(loadHistory)

// 手动刷新按钮旁的"更新于 HH:MM:SS"（P0）——预览现场按会话各存一份
const updatedAt = computed(() => store.previewUpdatedAt)

// 体检未通过（有需人工改的问题）时禁止生成，避免吐出带字面量的 PDF
const blocked = computed(() => (store.lint?.blockers?.length || 0) > 0)
const blockReason = computed(() => {
  const n = store.lint?.blockers?.length || 0
  return n ? `有 ${n} 处记号问题需先修改（见编辑区体检提示）` : ''
})

// 按行数估算的页数（25 行/页）——只是约数，导出后以任务真实页数为准
const estPages = computed(() =>
  Math.max(1, Math.ceil((store.text ? store.text.split('\n').length : 0) / 25)))

// 按钮文案用"约 N 页"：估的是行数，与真实分页（自动断行、纸高）会有出入
// 旧任务是否过期：生成后文本又改了 → 旧下载链接不再代表当前内容
const stale = computed(() =>
  !!(store.job && store.jobForText && store.jobForText !== store.text))

// 预览指纹：同一会话文本/纸/字体/页码没变就不重复请求（切回会话秒显）
function previewKey(s, page) {
  return [s.text, store.paper, store.font, store.chaos, page].join('\u0001')
}

let timer = null
watch(() => [store.text, store.paper, store.font, store.chaos,
             store.previewNonce, store.activeId], () => {
  clearTimeout(timer)
  const s = cur()
  if (!s) return
  if (!store.text.trim()) {
    s.preview.url = ''
    s.preview.hasNext = false
    s.preview.key = ''
    return
  }
  if (s.preview.key === previewKey(s, s.preview.page) && s.preview.url) {
    return                     // 显示的就是当前内容（切回会话的现场恢复）
  }
  if (s.preview.text !== s.text) s.preview.page = 1   // 内容变了回到第 1 页
  timer = setTimeout(preview, 500)                    // 防抖 500ms
})

// 取消上一次预览请求：狂打字时旧的渲染还没回来就被新输入取代，
// 不取消的话请求会在服务端排队堆积，把单 worker 的 CPU 占满
let abortCtl = null

async function preview() {
  const s = cur()
  if (!s) return
  if (abortCtl) abortCtl.abort()
  const ctl = new AbortController()
  abortCtl = ctl
  store.previewing = true
  s.preview.error = ''
  try {
    const r = await apiFetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: s.text, paper: store.paper,
                             font: store.font, chaos: store.chaos,
                             page: s.preview.page }),
      signal: ctl.signal,
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      const d = err.detail
      s.preview.error = typeof d === 'object'
        ? `${d.message}：${(d.details || []).join('；')}`
        : String(d || `预览失败（HTTP ${r.status}）`)
      s.preview.url = ''
    } else {
      const data = await r.json()
      s.preview.url = data.image
      s.preview.geom = data.geom || null
      s.preview.error = data.warnings?.length
        ? data.warnings.join('\n') : ''
      s.preview.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      // 后端把超页请求钳到最后一页，页码以它返回的为准
      s.preview.page = data.page || s.preview.page
      s.preview.hasNext = !!data.has_next
      s.preview.text = s.text
      s.preview.key = previewKey(s, s.preview.page)
    }
  } catch (e) {
    if (e?.name === 'AbortError' || abortCtl !== ctl) return
    s.preview.error = '无法连接后端'
  } finally {
    if (abortCtl === ctl) store.previewing = false
  }
}

// 多页翻页（后端逐页缓存：往回翻秒出，往前翻渲染一页约 3-6 秒）
function nextPage() {
  const s = cur()
  if (!s?.preview.hasNext || store.previewing || !store.text.trim()) return
  s.preview.page++
  preview()
}

function prevPage() {
  const s = cur()
  if (!s || s.preview.page <= 1 || store.previewing) return
  s.preview.page--
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
  const s = cur()
  s.jobError = ''
  s.downloadUrl = ''
  s.downloadPngUrl = ''
  const r = await apiFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: s.text, paper: store.paper,
                           font: store.font, chaos: store.chaos }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    s.jobError = String(err.detail || '创建任务失败')
    return
  }
  s.job = await r.json()
  s.jobForText = s.text        // 记下生成时的文本：之后再改就知道"已过期"
  persistNow()
  poll(s)
}

// 轮询写进**发起时的会话**：期间切去别的会话查看，那边照常推进，
// 历史列表里能看到"生成中…"徽标，切回来进度/下载都在
async function poll(s) {
  while (s.job && s.job.status !== 'done'
         && s.job.status !== 'failed') {
    await new Promise(res => setTimeout(res, 800))
    const r = await apiFetch(`/api/jobs/${s.job.id}`)
    if (!r.ok) break
    s.job = await r.json()
  }
  if (s.job?.status === 'done') {
    s.downloadUrl = `/api/jobs/${s.job.id}/download`
    s.downloadPngUrl = `/api/jobs/${s.job.id}/download?format=png`
  } else if (s.job?.status === 'failed') {
    s.jobError = s.job.error || '渲染失败'
  }
  persistNow()
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
      <p v-else-if="!store.previewUrl" class="placeholder">
        在左侧输入文本，这里会显示第一页手写效果
      </p>
    </div>
    <p v-if="store.previewUrl" class="hint-line pager">
      <button class="pagebtn" :disabled="store.previewPage <= 1 || store.previewing"
              @click="prevPage">‹ 上一页</button>
      <span class="pageno">第 {{ store.previewPage }} 页<span v-if="!store.previewHasNext">（末页）</span></span>
      <button class="pagebtn" :disabled="!store.previewHasNext || store.previewing"
              @click="nextPage">下一页 ›</button>
    </p>
    <p v-if="store.previewError" class="error">
      {{ store.previewError }}
      <button class="retry" @click="refreshNow">↻ 重试</button>
    </p>

    <!-- 文本为空时不显示生成/进度/下载区，避免"上一次任务的完成"误导 -->
    <template v-if="store.text.trim()">
      <button class="primary" :disabled="blocked
        || (store.job && !['done', 'failed'].includes(store.job.status))"
        @click="generate">
        生成（约 {{ estPages }} 页）
      </button>
      <p v-if="blocked" class="error">{{ blockReason }}</p>

      <!-- 生成后文本又改了：旧下载不再代表当前内容，只提示不展示链接 -->
      <div v-if="stale" class="progress">
        <span class="status stale-hint">
          当前文本已改动，尚未生成新版本——需要最新的 PDF 请点上方「生成」
        </span>
      </div>
      <div v-else class="progress">
        <div class="bar"><div class="fill" :style="{ width: percent + '%' }"></div></div>
        <span class="status">{{ statusText }}（{{ percent }}%）</span>
        <a v-if="store.downloadUrl" class="download" :href="store.downloadUrl">⬇ PDF</a>
        <a v-if="store.downloadPngUrl" class="download" :href="store.downloadPngUrl">⬇ PNG</a>
        <span v-if="store.downloadUrl" class="dl-hint" title="服务器任务产物保留 24 小时，到期自动删除">
          24h 内有效
        </span>
      </div>
      <p v-if="store.jobError" class="error">
        {{ store.jobError }}
        <button class="retry" @click="generate">↻ 重试</button>
      </p>
    </template>
  </section>
</template>
