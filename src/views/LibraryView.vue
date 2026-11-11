<script setup>
// 题库（RAG）占位壳：阶段 2 填功能（自动收录/检索/置信度标签/公共题库）
const planned = [
  { icon: '📥', title: '自动收录', desc: 'AI 解答经独立二解与符号验算校准后，一键存入你的个人题库' },
  { icon: '⚡', title: '秒取解答', desc: '再遇到相同或相似的题，直接取回已核验的解答，不用等 AI' },
  { icon: '🏷️', title: '置信度透明', desc: '每条解答带「双解一致 / 已验算」标签，可随时一键纠错下架' },
]
</script>

<template>
  <main class="page-narrow">
    <section class="panel placeholder-page">
      <h2 class="page-title">📚 个人题库</h2>
      <p class="page-sub">
        解答经校准后沉淀成你的专属题库——下次遇到相同、相似的题，
        直接取回已核验的解答。
      </p>
      <div class="plan-grid">
        <div v-for="p in planned" :key="p.title" class="plan-card">
          <span class="plan-icon">{{ p.icon }}</span>
          <b>{{ p.title }}</b>
          <p>{{ p.desc }}</p>
        </div>
      </div>
      <p class="dev-note">🚧 该功能正在开发中（阶段 2），完成后这里就是你的题库首页</p>
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
