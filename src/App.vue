<script setup>
import { onMounted, ref } from 'vue'
import AboutPanel from './components/AboutPanel.vue'
import ForgePanel from './components/ForgePanel.vue'
import MaterialPanel from './components/MaterialPanel.vue'
import EditorPanel from './components/EditorPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import { loadSessions, store } from './store'

const view = ref('write')            // write | forge | about
const backendOk = ref(false)

onMounted(() => {
  loadSessions()
  fetch('/api/health').then(r => { backendOk.value = r.ok })
    .catch(() => { backendOk.value = false })
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
        <button :class="{ on: view === 'about' }" @click="view = 'about'">公告</button>
      </nav>
      <span class="backend-dot" :class="backendOk ? 'ok' : 'down'">
        {{ backendOk ? '后端已连接' : '后端未连接' }}
      </span>
      <span class="tagline">仅供个人学习演示使用</span>
    </header>

    <ForgePanel v-if="view === 'forge'" @back="useNewFont" />
    <AboutPanel v-else-if="view === 'about'" />
    <main v-else class="columns">
      <MaterialPanel />
      <EditorPanel />
      <PreviewPanel />
    </main>

    <footer class="privacy">
      本工具不保存你的题文（仅本机浏览器，可随时清空）；导出的 PDF/PNG 在服务器
      保留 24 小时后自动删除；AI 解题由本站提供（每人每天次数有限），题文会发送
      给 AI 服务商，请勿提交涉密或隐私内容；上传的纸张/字体仅本机可见，可随时删除。
    </footer>

  </div>
</template>
