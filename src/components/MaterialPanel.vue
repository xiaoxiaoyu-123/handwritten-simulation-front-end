<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { clearHistory, createSession, hasContent, switchSession, store }
  from '../store'
import { idbAll, idbDelete, idbPut } from '../fontstore'
import { apiFetch } from '../api'

const paperFile = ref(null)
const fontFile = ref(null)
const uploading = ref('')
const renaming = ref('')            // 正在改名的字体 id
const renameValue = ref('')
const restoring = ref('')           // 正在自动补传的字体名
const calibOpen = ref(false)
const calib = ref({ ls: 78, top: 213, left: 200 })

onMounted(() => {
  refresh()
})

async function refresh() {
  store.papers = await (await apiFetch('/api/papers')).json()
  store.fonts = await (await apiFetch('/api/fonts')).json()
  restoreMissingFonts()
}

// 本机 IndexedDB 副本 vs 云端：被 TTL 清理/换服务器时静默补传回来
async function restoreMissingFonts() {
  let copies = []
  try {
    copies = await idbAll()
  } catch {
    return                            // IndexedDB 不可用（隐私模式等）
  }
  if (!copies.length) return
  const cloud = new Set(store.fonts.map(f => f.id))
  const missing = copies.filter(c => !cloud.has(c.fontId))
  for (const c of missing) {
    try {
      restoring.value = c.name
      const fd = new FormData()
      fd.append('file', new File([c.blob], `${c.name}.ttf`,
                                 { type: 'font/ttf' }))
      fd.append('restore_id', c.fontId)
      const r = await apiFetch('/api/fonts/upload',
                               { method: 'POST', body: fd })
      if (r.ok) {
        const data = await r.json()
        if (data.id !== c.fontId) {
          // 极少见：服务端没沿用 id → 更新本机映射
          await idbDelete(c.fontId)
          await idbPut({ ...c, fontId: data.id })
        }
        store.fonts = await (await apiFetch('/api/fonts')).json()
      } else {
        await idbDelete(c.fontId)     // 服务端拒绝（损坏/超限）：清掉死副本
      }
    } catch {
      /* 网络失败：下次再试 */
    } finally {
      restoring.value = ''
    }
  }
}

async function startRename(f) {
  renaming.value = f.id
  renameValue.value = f.name
}

async function saveRename(f) {
  const name = renameValue.value.trim()
  renaming.value = ''
  if (!name || name === f.name) return
  const r = await apiFetch(`/api/fonts/${f.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (r.ok) {
    f.name = name
  } else {
    const data = await r.json().catch(() => ({}))
    alert(String(data.detail || '改名失败'))
  }
}

const selectedUserPaper = computed(() =>
  store.papers.find(p => p.id === store.paper && !p.builtin))

// 潦草度三档（后端按档位缩放抖动参数，版式不变）
const chaosLevels = [
  { id: 'neat', label: '工整', hint: '认真写' },
  { id: 'normal', label: '正常', hint: '默认' },
  { id: 'messy', label: '潦草', hint: '赶时间' },
]

// 字体分组：内置（含站点内置个性字体，均从后端拿）/ 我上传的
const fontGroups = computed(() => {
  const builtin = store.fonts.filter(f => f.builtin)
  const mine = store.fonts.filter(f => !f.builtin)
  return [
    { title: '内置', items: builtin },
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
    const r = await apiFetch('/api/papers/upload', { method: 'POST', body: fd })
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
  const r = await apiFetch(`/api/papers/${p.id}/params`, {
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
  await apiFetch(`/api/papers/${id}`, { method: 'DELETE' })
  if (store.paper === id) store.paper = 'a4-lined'
  await refresh()
  store.previewNonce++
}

async function uploadFont(e, tag = 'font') {
  const f = e.target.files[0]
  if (!f) return
  uploading.value = tag
  const fd = new FormData()
  fd.append('file', f)
  try {
    const r = await apiFetch('/api/fonts/upload', { method: 'POST', body: fd })
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
  if (!confirm('删除这个字体？服务器与本机副本都会一并删除。')) return
  await apiFetch(`/api/fonts/${id}`, { method: 'DELETE' })
  await idbDelete(id).catch(() => {})
  if (store.font === id) store.font = 'default'
  await refresh()
  store.previewNonce++
}

// ---- 历史即会话列表（ZCode 式任务切换）----
// 只显示有内容的会话；解题中/生成中的会话带徽标，点了切过去不打断任务
const listed = computed(() => store.sessions.filter(hasContent))

function badge(s) {
  if (s.aiState === 'solving') return '⏳ 解题中'
  if (s.job && !['done', 'failed'].includes(s.job.status)) return '⏳ 生成中'
  if (s.aiPending) return '❗ 待应用'
  return ''
}

function newOne() {
  createSession('')
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
            <template v-if="renaming === f.id">
              <input class="rename" v-model="renameValue" maxlength="30"
                     @keyup.enter="saveRename(f)"
                     @keyup.esc="renaming = ''"
                     @click.stop />
              <button class="mini" title="保存" @click.stop="saveRename(f)">✓</button>
            </template>
            <template v-else>
              <span class="fname" :title="!f.builtin ? '点击改名' : ''"
                    @click="!f.builtin && startRename(f)">{{ f.name }}</span>
            </template>
            <span v-if="restoring === f.name" class="badge restoring">补传中…</span>
          </label>
          <button v-if="!f.builtin && renaming !== f.id" class="mini"
                  title="删除（点击名字可改名）" @click="deleteFont(f.id)">🗑</button>
        </div>
      </template>
      <label class="upload" :class="{ busy: uploading === 'font' }">
        <input type="file" accept=".ttf,.otf" hidden @change="uploadFont" />
        {{ uploading === 'font' ? '校验生成中…' : '＋ 上传字体' }}
      </label>
      <p class="hint">上传后会自动生成上标字形，支持指数记法</p>
    </div>

    <h2>历史（本机浏览器保存，最近 12 份）</h2>
    <div class="history">
      <button class="ghost new-task" title="开一份新题目，当前内容保留在历史里"
              @click="newOne">＋ 新建题目</button>
      <div v-for="s in listed" :key="s.id" class="pick">
        <button class="hist" :class="{ on: s.id === store.activeId }"
                :title="s.text.slice(0, 60)" @click="switchSession(s.id)">
          {{ fmt(s.updatedAt) }} · {{ s.text.replace(/\n/g, ' ').slice(0, 14) }}…
          <span v-if="badge(s)" class="badge-run">{{ badge(s) }}</span>
        </button>
      </div>
      <p v-if="!listed.length" class="hint">
        输入题目后按会话保存，随时点回来；AI 解题中也可以切去看别的
      </p>
      <button v-if="listed.length" class="ghost" @click="clearHistory">
        清空历史（一键删除我的数据）
      </button>
    </div>
  </aside>
</template>
