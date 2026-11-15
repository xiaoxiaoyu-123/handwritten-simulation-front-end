<script setup>
import { computed, ref } from 'vue'
import { idbPut } from '../fontstore'
import { store } from '../store'
import { apiFetch } from '../api'

const step = ref(1)
const charset = ref('common100_math')
const customText = ref('')
const forgeName = ref('我的手写字体')
const uploading = ref(false)
const session = ref(null)          // {session_id, thumbs}
const excluded = ref(new Set())
const building = ref(false)
const result = ref(null)           // {id, name, glyphs}
const error = ref('')

const charsets = [
  { id: 'common100_math', label: '常用 100 字 + 数学符号（推荐，4 页）' },
  { id: 'common100', label: '常用 100 字（3 页）' },
  { id: 'math', label: '仅数学符号与数字（补字用，1 页）' },
  { id: 'alnum', label: '数字/字母/标点符号' },
  { id: 'custom', label: '自定义字符（≤300 字）' },
]

const charCount = computed(() => {
  if (charset.value === 'custom') {
    return customText.value.replace(/\s/g, '').length || 0
  }
  return { common100_math: 141, common100: 99, math: 42, alnum: 97 }[charset.value] || 100
})

const pageCount = computed(() => Math.max(1, Math.ceil(charCount.value / 42)))

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
  if (files.length !== pageCount.value) {
    error.value = `应上传 ${pageCount.value} 页（模板共 ${pageCount.value} 页），`
      + `当前选了 ${files.length} 张——请按页序补齐`
    e.target.value = ''
    return
  }
  uploading.value = true
  error.value = ''
  try {
    const fd = new FormData()
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .forEach(f => fd.append('files', f))
    fd.append('charset', charset.value)
    fd.append('custom', customText.value)
    const r = await apiFetch('/api/fontforge/upload', { method: 'POST', body: fd })
    const data = await r.json()
    if (!r.ok) {
      error.value = String(data.detail || '上传失败')
    } else {
      session.value = data
      excluded.value = new Set()
      step.value = 3
    }
  } catch {
    error.value = '无法连接后端'
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

async function build() {
  building.value = true
  error.value = ''
  try {
    const r = await apiFetch('/api/fontforge/build', {
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
      // 本机存一份 ttf 副本：服务端 30 天 TTL 清理后，下次打开自动补传
      try {
        const dl = await fetch(`/api/fonts/${data.id}/download`)
        if (dl.ok) {
          idbPut({ fontId: data.id, name: data.name,
                   blob: await dl.blob(), created: Date.now() })
        }
      } catch { /* 副本存不上不影响使用 */ }
      // 自动入库并选中，回"写作业"立即可用
      store.fonts = await (await apiFetch('/api/fonts')).json()
      store.font = data.id
    }
  } finally {
    building.value = false
  }
}
</script>

<template>
  <section class="panel forge">
    <h2>字体工坊 —— 做一套你自己的手写字体（约 20~30 分钟）</h2>

    <div class="guide">
      <p><b>怎么玩：</b>打印模板 → 在每个格子里<b>照着示例字写一遍</b> →
        按页序拍照上传 → 校对后生成。程序靠模板的格子准确知道"哪块墨迹
        是哪个字"，所以效果稳定。</p>
      <p><b>为什么不能直接传作业截图？</b>截图里字的大小、位置、连笔都不定，
        切错认错就会"写 a 出 b"；想补个别符号（ω、∫）选"仅数学符号"
        字符集，只写一页。</p>
      <p class="hint">🔒 生成后的字体只绑定你这个浏览器、只有你能看到；
        建议生成后<b>下载 TTF 备份</b>。写数学作业请选带数学符号的字符集
        （√ ∫ ω π α ≤ ≥ …）。</p>
    </div>

    <div class="steps">
      <div class="step" :class="{ on: step >= 1 }">
        <b>① 下载模板并打印</b>
        <div class="step-body">
          <div class="row">
            <label>字符集：
              <select v-model="charset">
                <option v-for="c in charsets" :key="c.id" :value="c.id">
                  {{ c.label }}
                </option>
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
          <p class="hint">打印后用黑色笔写满格子（写在虚线与基线之间），不写的格留空；
            拍照时四个角的黑色方块必须完整入镜、纸张铺平、顺光无阴影</p>
        </div>
      </div>

      <div class="step" :class="{ on: step >= 2 }">
        <b>② 上传照片（按模板页序，共 {{ pageCount }} 页）</b>
        <div class="step-body">
          <label class="upload" :class="{ busy: uploading }">
            <input type="file" accept="image/png,image/jpeg,image/webp"
                   capture="environment" multiple hidden @change="upload" />
            {{ uploading ? '校正、切格、识别中…' : `选择/拍摄照片（${pageCount} 页全选，按页序）` }}
          </label>
          <p class="hint">手机直接调后摄；页序看模板右上角页码</p>
        </div>
      </div>

      <div class="step" :class="{ on: step >= 3 }">
        <b>③ 校对并生成</b>
        <div class="step-body" v-if="session">
          <p class="hint">
            点击写坏的字标记为"作废"（红色 = 不收录）；确认后生成，
            约 5~15 秒。已收录 {{ session.thumbs.length - excluded.size }}
            / {{ session.thumbs.length }} 字
          </p>
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
            {{ building ? '正在组装字形…（约 5~15 秒）'
                         : `生成字体（收录 ${session.thumbs.length - excluded.size} 字）` }}
          </button>
        </div>
        <div class="step-body" v-else>
          <p class="hint">完成第 ② 步后在这里逐格校对</p>
        </div>
      </div>

      <div v-if="result" class="done">
        ✅ 字体「{{ result.name }}」已生成（{{ result.glyphs }} 字），已自动选为当前字体，
        本机也存了一份副本<br />
        <button class="link" @click="$emit('back')">去写作业 →</button>
        —— <a :href="`/api/fonts/${result.id}/download`">⬇ 下载 TTF 备份</a>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.forge { max-width: 1100px; margin: 0 auto; }
.guide {
  border: 1px dashed var(--accent); border-radius: 10px;
  background: rgba(253, 242, 248, 0.85); padding: 12px 14px; margin-top: 12px;
}
.guide p { margin: 4px 0; font-size: 13.5px; line-height: 1.75; }
.guide .hint { color: var(--muted); }
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
@media (max-width: 920px) {
  .forge { padding: 10px; }
  .row input[type="text"] { min-width: 0; width: 100%; }
}
</style>
