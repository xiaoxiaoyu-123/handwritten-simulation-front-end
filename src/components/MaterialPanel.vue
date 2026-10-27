<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { clearHistory, store } from '../store'

const paperFile = ref(null)
const fontFile = ref(null)
const uploading = ref('')
const calibOpen = ref(false)
const calib = ref({ ls: 78, top: 213, left: 200 })

onMounted(() => {
  refresh()
})

async function refresh() {
  store.papers = await (await fetch('/api/papers')).json()
  store.fonts = await (await fetch('/api/fonts')).json()
}

const selectedUserPaper = computed(() =>
  store.papers.find(p => p.id === store.paper && !p.builtin))

// 潦草度三档（后端按档位缩放抖动参数，版式不变）
const chaosLevels = [
  { id: 'neat', label: '工整', hint: '认真写' },
  { id: 'normal', label: '正常', hint: '默认' },
  { id: 'messy', label: '潦草', hint: '赶时间' },
]

// 字体分组：内置（可公开）/ 本机私有 / 我上传的
const fontGroups = computed(() => {
  const builtin = store.fonts.filter(f => f.builtin && !f.local)
  const local = store.fonts.filter(f => f.local)
  const mine = store.fonts.filter(f => !f.builtin)
  return [
    { title: '内置', items: builtin },
    { title: '本机私有', items: local },
    { title: '我上传的', items: mine },
  ].filter(g => g.items.length)
})

watch(selectedUserPaper, p => {
  if (p) {
    calib.value = {
      ls: p.params.line_spacing,
      top: p.params.top_margin,
      left: p.params.left_margin,
    }
    calibOpen.value = false
  }
})

async function uploadPaper(e) {
  const f = e.target.files[0]
  if (!f) return
  uploading.value = 'paper'
  const fd = new FormData()
  fd.append('file', f)
  try {
    const r = await fetch('/api/papers/upload', { method: 'POST', body: fd })
    const data = await r.json()
    if (!r.ok) {
      alert(data.detail || '上传失败')
    } else {
      await refresh()
      store.paper = data.id
      if (!data.measured) {
        alert('自动测线未成功（照片模糊或无线条），已用默认参数，请用"校准"手动调整')
      }
      store.previewNonce++
    }
  } finally {
    uploading.value = ''
    e.target.value = ''
  }
}

async function saveCalib() {
  const p = selectedUserPaper.value
  if (!p) return
  const params = { ...p.params, line_spacing: calib.value.ls,
                   top_margin: calib.value.top,
                   left_margin: calib.value.left }
  const r = await fetch(`/api/papers/${p.id}/params`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params }),
  })
  if (r.ok) {
    await refresh()
    store.previewNonce++
    calibOpen.value = false
  }
}

async function deletePaper(id) {
  if (!confirm('删除这张纸张？')) return
  await fetch(`/api/papers/${id}`, { method: 'DELETE' })
  if (store.paper === id) store.paper = 'a4-lined'
  await refresh()
  store.previewNonce++
}

async function uploadFont(e) {
  const f = e.target.files[0]
  if (!f) return
  uploading.value = 'font'
  const fd = new FormData()
  fd.append('file', f)
  try {
    const r = await fetch('/api/fonts/upload', { method: 'POST', body: fd })
    const data = await r.json()
    if (!r.ok) {
      alert(data.detail || '上传失败')
    } else {
      await refresh()
      store.font = data.id
      store.previewNonce++
    }
  } finally {
    uploading.value = ''
    e.target.value = ''
  }
}

async function deleteFont(id) {
  if (!confirm('删除这个字体？')) return
  await fetch(`/api/fonts/${id}`, { method: 'DELETE' })
  if (store.font === id) store.font = 'default'
  await refresh()
  store.previewNonce++
}

function restore(h) {
  store.text = h.text
  store.paper = h.paper
  store.font = h.font
  if (h.chaos) store.chaos = h.chaos
  store.previewNonce++
}

function fmt(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <aside class="panel material">
    <h2>纸张</h2>
    <div class="paper-list">
      <div v-for="p in store.papers" :key="p.id" class="pick">
        <label>
          <input type="radio" name="paper" :value="p.id" v-model="store.paper" />
          {{ p.name }}
          <span v-if="p.local" class="badge" title="来自本机手写模拟器，仅本机可见，不分发">本机</span>
        </label>
        <button v-if="!p.builtin" class="mini" title="删除" @click="deletePaper(p.id)">🗑</button>
      </div>
      <label class="upload" :class="{ busy: uploading === 'paper' }">
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden
               @change="uploadPaper" ref="paperFile" />
        {{ uploading === 'paper' ? '上传识别中…' : '+ 上传我的纸张（自动测行距）' }}
      </label>

      <div v-if="selectedUserPaper" class="calib">
        <button class="ghost" @click="calibOpen = !calibOpen">
          ⚙ 校准（行距/边距微调）
        </button>
        <div v-if="calibOpen" class="calib-form">
          <label>行距 <input type="number" v-model.number="calib.ls" min="30" max="400" /></label>
          <label>上边距 <input type="number" v-model.number="calib.top" min="0" max="4000" /></label>
          <label>左边距 <input type="number" v-model.number="calib.left" min="0" max="4000" /></label>
          <button class="primary small" @click="saveCalib">保存并刷新预览</button>
        </div>
      </div>
    </div>

    <h2>潦草度</h2>
    <div class="chaos">
      <label v-for="c in chaosLevels" :key="c.id" :class="{ on: store.chaos === c.id }">
        <input type="radio" name="chaos" :value="c.id" v-model="store.chaos" />
        {{ c.label }}<small>{{ c.hint }}</small>
      </label>
    </div>

    <h2>字体</h2>
    <div class="font-list">
      <template v-for="grp in fontGroups" :key="grp.title">
        <p v-if="grp.items.length > 1 || grp.title !== '内置'" class="group-title">{{ grp.title }}</p>
        <div v-for="f in grp.items" :key="f.id" class="pick">
          <label>
            <input type="radio" name="font" :value="f.id" v-model="store.font" />
            {{ f.name }}
            <span v-if="f.local" class="badge" title="来自本机手写模拟器，仅本机可见，不分发">本机</span>
          </label>
          <button v-if="!f.builtin" class="mini" title="删除" @click="deleteFont(f.id)">🗑</button>
        </div>
      </template>
      <label class="upload" :class="{ busy: uploading === 'font' }">
        <input type="file" accept=".ttf,.otf" hidden @change="uploadFont" />
        {{ uploading === 'font' ? '校验生成中…' : '+ 上传我的字体（.ttf/.otf）' }}
      </label>
      <p class="hint">上传后会自动生成上标字形，支持指数记法</p>
    </div>

    <h2>历史（本机浏览器保存，最近 10 份）</h2>
    <div class="history">
      <div v-for="h in store.history" :key="h.ts" class="pick">
        <button class="hist" :title="h.text.slice(0, 60)"
                @click="restore(h)">
          {{ fmt(h.ts) }} · {{ h.text.replace(/\n/g, ' ').slice(0, 14) }}…
        </button>
      </div>
      <button v-if="store.history.length" class="ghost" @click="clearHistory">
        清空历史（一键删除我的数据）
      </button>
      <p v-else class="hint">还没有历史记录</p>
    </div>
  </aside>
</template>
