<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadSessions, store } from './store'

const route = useRoute()
const backendOk = ref(false)
const theme = ref(localStorage.getItem('hs_theme') || 'light')

// 五页导航（2.0 信息架构）；题库/讲解为占位壳
const tabs = [
  { to: '/write', label: '写作业' },
  { to: '/library', label: '题库' },
  { to: '/anim', label: '讲解' },
  { to: '/forge', label: '字体工坊' },
  { to: '/about', label: '公告' },
]

onMounted(() => {
  loadSessions()
  document.documentElement.dataset.theme = theme.value
  fetch('/api/health').then(r => { backendOk.value = r.ok })
    .catch(() => { backendOk.value = false })
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('hs_theme', theme.value)
  document.documentElement.dataset.theme = theme.value
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <span class="logo">✍️ 手写模拟</span>
      <nav class="tabs">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to"
                    class="tab" active-class="on">{{ t.label }}</RouterLink>
      </nav>
      <span class="backend-dot" :class="backendOk ? 'ok' : 'down'">
        {{ backendOk ? '后端已连接' : '后端未连接' }}
      </span>
      <button class="theme-toggle" :title="theme === 'dark' ? '切到亮色' : '切到暗色'"
              @click="toggleTheme">
        {{ theme === 'dark' ? '☀️' : '🌙' }}
      </button>
      <span class="tagline">仅供个人学习演示使用</span>
    </header>

    <RouterView />

    <footer class="privacy">
      本工具不保存你的题文（仅本机浏览器，可随时清空）；导出的 PDF/PNG 在服务器
      保留 24 小时后自动删除；AI 解题由本站提供（每人每天次数有限），题文会发送
      给 AI 服务商，请勿提交涉密或隐私内容；上传的纸张/字体仅本机可见，可随时删除。
    </footer>

  </div>
</template>
