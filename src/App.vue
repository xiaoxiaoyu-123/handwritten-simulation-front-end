<script setup>
import { onMounted, ref } from 'vue'
import AiSettings from './components/AiSettings.vue'
import ForgePanel from './components/ForgePanel.vue'
import MaterialPanel from './components/MaterialPanel.vue'
import EditorPanel from './components/EditorPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import { loadAiConfig, loadHistory, store } from './store'

const view = ref('write')            // write | forge
const backendOk = ref(false)

onMounted(async () => {
  loadHistory()
  loadAiConfig()
  try {
    const r = await fetch('/api/health')
    backendOk.value = r.ok
  } catch {
    backendOk.value = false
  }
})

function useNewFont() {
  view.value = 'write'
  store.previewNonce++
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <span class="logo">✍️ 手写模拟</span>
      <nav class="tabs">
        <button :class="{ on: view === 'write' }" @click="view = 'write'">写作业</button>
        <button :class="{ on: view === 'forge' }" @click="view = 'forge'">字体工坊</button>
      </nav>
      <button class="gear" title="AI 设置（BYOK）" @click="store.showAiSettings = true">⚙ AI</button>
      <span class="backend-dot" :class="backendOk ? 'ok' : 'down'">
        {{ backendOk ? '后端已连接' : '后端未连接' }}
      </span>
      <span class="tagline">仅供个人学习演示使用</span>
    </header>

    <ForgePanel v-if="view === 'forge'" @back="useNewFont" />
    <main v-else class="columns">
      <MaterialPanel />
      <EditorPanel />
      <PreviewPanel />
    </main>

    <AiSettings v-if="store.showAiSettings" @close="store.showAiSettings = false" />
  </div>
</template>
