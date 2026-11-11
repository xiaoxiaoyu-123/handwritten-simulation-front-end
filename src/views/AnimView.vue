<script setup>
// 动画讲解占位壳：阶段 4 填功能（分步 KaTeX 动画播放器 + webm 导出）
const planned = [
  { icon: '🎬', title: '分步动画', desc: 'AI 把解答拆成一步一步，KaTeX 公式逐推演示，支持暂停/回看/单步' },
  { icon: '🔊', title: '语音讲解', desc: '每步配解说朗读（浏览器原生语音，可关）' },
  { icon: '📹', title: '导出视频', desc: '浏览器直接录成 webm 视频文件，复习/分享都用得上' },
]
</script>

<template>
  <main class="page-narrow">
    <section class="panel placeholder-page">
      <h2 class="page-title">🎞️ 分步动画讲解</h2>
      <p class="page-sub">
        把"抄答案"变成"学明白"——AI 把解答拆成一步一步，
        每步一个公式加一句解说，像老师板书一样逐推给你看。
      </p>
      <div class="plan-grid">
        <div v-for="p in planned" :key="p.title" class="plan-card">
          <span class="plan-icon">{{ p.icon }}</span>
          <b>{{ p.title }}</b>
          <p>{{ p.desc }}</p>
        </div>
      </div>
      <p class="dev-note">🚧 该功能正在开发中（阶段 4），入口将从题库命中的题目进入</p>
    </section>
  </main>
</template>

<style scoped>
.page-narrow { padding: 20px; max-width: 960px; margin: 0 auto; width: 100%; overflow: auto; }
.placeholder-page { padding: 28px 32px; }
.page-title { font-family: var(--font-serif); font-size: 22px; color: var(--color-fg); }
.page-sub { margin: 10px 0 20px; color: var(--color-fg-soft); line-height: 1.8; font-size: 14px; }
.plan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.plan-card {
  border: 1px solid var(--color-border); border-radius: var(--radius-m);
  padding: 16px; background: var(--color-card-2);
  display: flex; flex-direction: column; gap: 6px;
}
.plan-icon { font-size: 24px; }
.plan-card b { font-size: 14px; color: var(--color-fg); }
.plan-card p { font-size: 13px; color: var(--color-fg-soft); line-height: 1.7; }
.dev-note {
  margin-top: 20px; padding: 10px 14px; border-radius: var(--radius-m);
  background: var(--color-warn-soft); color: var(--color-warn); font-size: 13px;
}
</style>
