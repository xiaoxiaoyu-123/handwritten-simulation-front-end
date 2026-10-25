<script setup>
import { computed, ref } from 'vue'
import { store } from '../store'

const step = ref(1)
const charset = ref('common100')
const customText = ref('')
const forgeName = ref('我的手写字体')
const uploading = ref(false)
const session = ref(null)          // {session_id, thumbs}
const excluded = ref(new Set())
const building = ref(false)
const result = ref(null)           // {id, name, glyphs}
const error = ref('')

const pageCount = computed(() => {
  const n = charset.value === 'custom'
    ? customText.value.replace(/\s/g, '').length : 100
  return Math.max(1, Math.ceil(n / 42))
})

const templateUrl = computed(() => {
  const q = new URLSearchParams({ charset: charset.value,
                                  custom: customText.value })
  return `/api/fontforge/template?${q}`
})

function toggle(ch) {
  if (!excluded.value.has(ch)) {
    excluded.value.add(ch)
  } else {
    excluded.value.delete(ch)
  }
  excluded.value = new Set(excluded.value)   // 触发响应式
}

async function upload(e) {
  const files = [...e.target.files]
  if (!files.length) return
  uploading.value = true
  error.value = ''
  try {
    const fd = new FormData()
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .forEach(f => fd.append('files', f))
    fd.append('charset', charset.value)
    fd.append('custom', customText.value)
    const r = await fetch('/api/fontforge/upload', { method: 'POST', body: fd })
    const data = await r.json()
    if (!r.ok) {
      error.value = String(data.detail || '上传失败')
    } else {
      session.value = data
      excluded.value = new Set()
      step.value = 3
    }
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

async function build() {
  building.value = true
  error.value = ''
  try {
    const r = await fetch('/api/fontforge/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.value.session_id,
                             name: forgeName.value,
                             excluded: [...excluded.value] }),
    })
    const data = await r.json()
    if (!r.ok) {
      error.value = String(data.detail || '生成失败')
    } else {
      result.value = data
      // 自动入库并选中，回"写作业"立即可用
      store.fonts = await (await fetch('/api/fonts')).json()
      store.font = data.id
    }
  } finally {
    building.value = false
  }
}
</script>

<template>
  <section class="panel forge">
    <h2>字体工坊 —— 写一张模板，生成你自己的手写字体</h2>

    <div class="steps">
      <div class="step" :class="{ on: step >= 1 }">
        <b>① 下载模板并打印</b>
        <div class="step-body">
          <div class="row">
            <label>字符集：
              <select v-model="charset">
                <option value="common100">常用 100 字</option>
                <option value="alnum">数字/字母/符号</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <label v-if="charset === 'custom'">
              自定义字符（≤300）：
              <input type="text" v-model="customText"
                     placeholder="要做成字体的所有字符" />
            </label>
          </div>
          <div class="row">
            <label>字体名：<input type="text" v-model="forgeName" maxlength="20" /></label>
            <a class="primary small" :href="templateUrl">⬇ 下载模板 PDF（{{ pageCount }} 页）</a>
          </div>
          <p class="hint">打印后用黑色笔写满格子（写在虚线之间），不写的格留空；拍清楚四个角的黑色方块</p>
        </div>
      </div>

      <div class="step" :class="{ on: step >= 2 }">
        <b>② 上传照片（按模板页序）</b>
        <div class="step-body">
          <label class="upload" :class="{ busy: uploading }">
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
                   @change="upload" />
            {{ uploading ? '切割识别中…' : `选择/拍摄照片（共 ${pageCount} 页，按页序多选）` }}
          </label>
        </div>
      </div>

      <div class="step" :class="{ on: step >= 3 }">
        <b>③ 校对并生成</b>
        <div class="step-body" v-if="session">
          <p class="hint">点击写坏的字标记为"作废"（红色 = 不收录）；确认后生成</p>
          <div class="glyph-grid">
            <button v-for="t in session.thumbs" :key="t.char"
                    class="glyph" :class="{ bad: excluded.has(t.char), empty: !t.has_ink }"
                    :disabled="!t.has_ink" :title="t.char"
                    @click="toggle(t.char)">
              <img v-if="t.thumb" :src="t.thumb" alt="" />
              <span v-else class="empty-mark">空</span>
              <i>{{ t.char }}</i>
            </button>
          </div>
          <button class="primary" :disabled="building" @click="build">
            {{ building ? '生成中…' : `生成字体（收录 ${session.thumbs.length - excluded.size} 字）` }}
          </button>
        </div>
        <div class="step-body" v-else>
          <p class="hint">完成第 ② 步后在这里校对</p>
        </div>
      </div>

      <div v-if="result" class="done">
        ✅ 字体「{{ result.name }}」已生成（{{ result.glyphs }} 字），已自动选为当前字体
        —— <a :href="`/api/fonts/${result.id}/download`">⬇ 下载 TTF</a>
        —— <button class="link" @click="$emit('back')">去写作业 →</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.forge { max-width: 1100px; margin: 0 auto; }
.steps { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }
.step { border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.step.on { border-color: var(--accent); }
.step b { color: var(--accent); }
.step-body { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.row input[type="text"] { padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; min-width: 260px; }
.glyph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.glyph {
  position: relative; border: 1px solid var(--line); border-radius: 8px;
  background: #fff; padding: 4px; cursor: pointer; min-height: 76px;
}
.glyph img { width: 100%; object-fit: contain; display: block; }
.glyph i { position: absolute; top: 2px; right: 5px; font-size: 11px; color: var(--muted); font-style: normal; }
.glyph.bad { outline: 2px solid #d33; opacity: 0.35; }
.glyph.empty { background: #f4f5f7; cursor: default; }
.empty-mark { color: var(--muted); font-size: 12px; }
.done { margin-top: 12px; padding: 12px; background: #e2f5ea; border-radius: 8px; color: #147a3d; }
.link { border: none; background: none; color: var(--accent); cursor: pointer; }
</style>
