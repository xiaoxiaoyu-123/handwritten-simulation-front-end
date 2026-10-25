<script setup>
import { onMounted, ref } from 'vue'
import MaterialPanel from './components/MaterialPanel.vue'
import EditorPanel from './components/EditorPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'

const backendOk = ref(false)

onMounted(async () => {
  // 骨架期先探一下后端健康检查；P0 会换成真正的预览/任务接口
  try {
    const r = await fetch('/api/health')
    backendOk.value = r.ok
  } catch {
    backendOk.value = false
  }
})
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <span class="logo">✍️ 手写模拟</span>
      <span class="backend-dot" :class="backendOk ? 'ok' : 'down'">
        {{ backendOk ? '后端已连接' : '后端未连接' }}
      </span>
      <span class="tagline">仅供个人学习演示使用</span>
    </header>

    <main class="columns">
      <MaterialPanel />
      <EditorPanel />
      <PreviewPanel />
    </main>
  </div>
</template>
