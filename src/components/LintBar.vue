<script setup>
// 记号体检条：输入时自动检查（防抖），可修的一键修，不可修的定位到行。
import { computed, onMounted, ref, watch } from 'vue'
import { store } from '../store'
import { apiFetch } from '../api'

const expanded = ref(false)
const fixing = ref(false)

let timer = null
watch(() => store.text, () => {
  clearTimeout(timer)
  if (!store.text.trim()) {
    store.lint = null
    return
  }
  // 切回已体检过的会话：结果还在（结果跟随会话保存），不重复请求
  if (store.lintFor === store.text) return
  timer = setTimeout(runLint, 800)      // 防抖 800ms，不阻塞打字
})

onMounted(() => {
  if (store.text.trim()) runLint()
})

async function runLint() {
  try {
    const r = await apiFetch('/api/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: store.text }),
    })
    if (!r.ok) return
    store.lint = await r.json()
    store.lintFor = store.text
  } catch {
    /* 后端未连接时不打扰用户 */
  }
}

const fixable = computed(() => store.lint?.fixable || [])
const blockers = computed(() => store.lint?.blockers || [])
const skipLines = computed(() => store.lint?.skip_lines || [])
const notes = computed(() => store.lint?.notes || [])
const clean = computed(() => fixable.value.length === 0
                            && blockers.value.length === 0)

async function fixAll() {
  if (!fixable.value.length) return
  fixing.value = true
  try {
    const r = await apiFetch('/api/lint/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: store.text, fixes: fixable.value }),
    })
    if (r.ok) {
      const data = await r.json()
      store.text = data.text
      store.lint = null
      await runLint()
    }
  } finally {
    fixing.value = false
  }
}

// 行号徽标：把问题按行聚合（供后续编辑器高亮扩展用）
const byLine = computed(() => {
  const m = {}
  for (const f of fixable.value) {
    m[f.line] = m[f.line] || { fix: 0, block: 0 }
    m[f.line].fix++
  }
  for (const b of blockers.value) {
    m[b.line] = m[b.line] || { fix: 0, block: 0 }
    m[b.line].block++
  }
  return m
})

defineExpose({ runLint, byLine })
</script>

<template>
  <div v-if="store.lint" class="lint" :class="{ ok: clean, bad: blockers.length }">
    <!-- 干净 -->
    <div v-if="clean && !skipLines.length" class="lint-summary ok-text">
      ✅ 记号检查通过
    </div>

    <!-- 有问题 -->
    <template v-else>
      <div class="lint-summary">
        <span v-if="fixable.length" class="warn-text">
          ⚠ {{ fixable.length }} 处可自动修复
          <button class="btn-fix" :disabled="fixing" @click="fixAll">
            {{ fixing ? '修复中…' : '全部修复' }}
          </button>
        </span>
        <span v-if="blockers.length" class="err-text">
          ⛔ {{ blockers.length }} 处需手动修改
        </span>
        <span v-if="skipLines.length" class="skip-text">
          🟡 {{ skipLines.length }} 行像是跳步了，建议核对
        </span>
        <span v-if="notes.length" class="note-text">
          ℹ {{ notes.length }} 行较长，会自动断行
        </span>
        <button class="btn-toggle" @click="expanded = !expanded">
          {{ expanded ? '收起' : '查看详情' }}
        </button>
      </div>

      <div v-if="expanded" class="lint-detail">
        <div v-for="b in blockers" :key="'b' + b.line + b.col" class="item block">
          <span class="ln">第 {{ b.line }} 行</span>
          <b>{{ b.message }}</b>
          <span class="hint">{{ b.hint }}</span>
          <code>{{ b.raw.slice(0, 40) }}</code>
        </div>
        <div v-for="f in fixable" :key="'f' + f.line + f.col" class="item fix">
          <span class="ln">第 {{ f.line }} 行</span>
          <b>{{ f.message }}</b>
          <code>{{ f.raw }}</code>
          <span class="arrow">→</span>
          <code class="good">{{ f.suggestion }}</code>
        </div>
        <div v-for="n in notes" :key="'n' + n.line" class="item note">
          <span class="ln">第 {{ n.line }} 行</span>
          <b>{{ n.message }}</b>
          <span class="hint">{{ n.hint }}</span>
        </div>
        <div v-for="s in skipLines" :key="'s' + s.line" class="item skip">
          <span class="ln">第 {{ s.line }} 行</span>
          <b>含「{{ s.markers.join('、') }}」</b>
          <span class="hint">这类短语常伴随跳步，抄进作业前请确认中间步骤写全了</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lint {
  margin-top: 8px; padding: 8px 10px; border-radius: 8px;
  background: #fdf6e3; border: 1px solid #f0e0bd; font-size: 13px;
}
.lint.ok { background: #eef9f1; border-color: #cfe9d8; }
.lint.bad { background: #fdeeee; border-color: #f0c9c9; }
.lint-summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ok-text { color: #147a3d; }
.warn-text { color: #8a6a00; display: flex; align-items: center; gap: 6px; }
.err-text { color: #a02222; }
.skip-text { color: #8a6a00; }
.note-text { color: var(--muted); }
.item.note b { color: var(--muted); font-weight: 500; }
.btn-fix {
  padding: 3px 10px; font-size: 12px; border: 1px solid #d9b64a;
  background: #fff8e4; border-radius: 6px; cursor: pointer; color: #7a5c00;
}
.btn-fix:hover { background: #fff; }
.btn-toggle {
  margin-left: auto; border: none; background: none; cursor: pointer;
  color: var(--muted); font-size: 12px; text-decoration: underline;
}
.lint-detail { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.item { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.item .ln { color: var(--muted); font-size: 12px; min-width: 62px; }
.item code {
  background: #fff; padding: 1px 5px; border-radius: 4px;
  font-size: 12px; border: 1px solid #e8e2d2;
}
.item code.good { color: #147a3d; border-color: #cfe9d8; }
.item .arrow { color: var(--muted); }
.item .hint { color: var(--muted); font-size: 12px; }
.item.block b { color: #a02222; }
.item.fix b { color: #8a6a00; }
.item.skip b { color: #8a6a00; }
</style>
