<script setup>
// 访问口令门：后端设了 HS_PASSWORD 且当前会话未通过时挡在页面最前面。
import { ref } from 'vue'
import { login } from '../api'

const emit = defineEmits(['ok'])
const pw = ref('')
const err = ref('')
const busy = ref(false)

async function submit() {
  if (!pw.value || busy.value) return
  busy.value = true
  err.value = ''
  try {
    await login(pw.value)
    emit('ok')
  } catch (e) {
    err.value = e.message || '口令不对'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="gate">
    <div class="card">
      <h2>✍️ 手写模拟</h2>
      <p class="hint">这是个公开演示站，请输入访问口令进入。</p>
      <input v-model="pw" type="password" placeholder="访问口令"
             autocomplete="current-password" @keyup.enter="submit" />
      <button :disabled="busy || !pw" @click="submit">
        {{ busy ? '验证中…' : '进入' }}
      </button>
      <p v-if="err" class="err">{{ err }}</p>
      <p class="small">
        本站不收集账号信息，口令只用于限制公开演示的用量；
        渲染的作业文件 1 小时后自动删除。
      </p>
    </div>
  </div>
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  background: #f3f2ee;
  display: grid;
  place-items: center;
  z-index: 100;
}
.card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, .12);
  padding: 28px 30px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h2 { margin: 0; font-size: 20px; }
.hint { margin: 0; color: #555; font-size: 13px; }
input {
  padding: 10px 12px;
  border: 1px solid #d8d6d0;
  border-radius: 8px;
  font-size: 14px;
}
button {
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: #2f6fed;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
button:disabled { opacity: .55; cursor: default; }
.err { margin: 0; color: #c22; font-size: 13px; }
.small { margin: 4px 0 0; color: #999; font-size: 12px; line-height: 1.6; }
</style>
