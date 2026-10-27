<script setup>
import { ref } from 'vue'
import { AI_PRESETS, saveAiConfig, store } from '../store'
import { apiFetch } from '../api'

const emit = defineEmits(["close"])

const preset = ref("zhipu")
const cfg = ref({ ...(store.aiconfig || AI_PRESETS.zhipu) })
const testing = ref(false)
const testResult = ref("")

async function test() {
  testing.value = true
  testResult.value = ""
  try {
    const r = await apiFetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg.value),
    })
    const data = await r.json()
    testResult.value = r.ok ? `✅ 连接成功（回复：${data.reply}）`
                            : `❌ ${data.detail}`
  } catch {
    testResult.value = "❌ 无法连接后端"
  } finally {
    testing.value = false
  }
}

function save() {
  if (!cfg.value.base_url || !cfg.value.model || !cfg.value.api_key) {
    testResult.value = "❌ 配置不完整"
    return
  }
  saveAiConfig({ ...cfg.value })
  emit("close")
}

function applyPreset() {
  cfg.value = { ...AI_PRESETS[preset.value] }
}
</script>

<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <h2>🤖 AI 设置（BYOK：Key 只存本浏览器）</h2>
      <p class="hint">
        使用你自己的大模型 API Key（OpenAI 兼容接口均可）。服务端只转发请求，
        不存储 Key。拍照识别需要视觉模型（如 glm-4.5v）；纯文字解题任意模型均可。
      </p>
      <div class="row">
        <label>预设：
          <select v-model="preset" @change="applyPreset">
            <option v-for="(p, k) in AI_PRESETS" :key="k" :value="k">{{ p.label }}</option>
            <option value="custom">自定义</option>
          </select>
        </label>
      </div>
      <label>接口地址
        <input type="text" v-model="cfg.base_url"
               placeholder="https://open.bigmodel.cn/api/paas/v4" />
      </label>
      <label>模型名
        <input type="text" v-model="cfg.model" placeholder="glm-4.5v" />
      </label>
      <label>API Key
        <input type="password" v-model="cfg.api_key" placeholder="sk-…" autocomplete="off" />
      </label>
      <div class="row">
        <button class="ghost" :disabled="testing" @click="test">
          {{ testing ? "测试中…" : "测试连接" }}
        </button>
        <button class="primary small" @click="save">保存</button>
        <button class="link" @click="$emit('close')">取消</button>
      </div>
      <p v-if="testResult" class="hint">{{ testResult }}</p>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed; inset: 0; background: rgba(20, 24, 32, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.modal {
  background: #fff; border-radius: 12px; padding: 22px; width: 480px;
  display: flex; flex-direction: column; gap: 12px;
}
.modal h2 { font-size: 16px; }
.modal label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.modal input, .modal select {
  padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: 14px;
}
.row { display: flex; gap: 10px; align-items: center; }
.hint { font-size: 12px; color: var(--muted); }
</style>
