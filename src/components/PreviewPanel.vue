<template>
  <section class="panel preview">
    <h2>实时预览</h2>
    <div class="page">
      <p class="placeholder">预览区（P0 接 /api/preview，防抖 500ms 自动刷新）</p>
    </div>

    <button class="primary" disabled>生成 PDF</button>

    <div class="progress">
      <div class="bar"><div class="fill" style="width: 0%"></div></div>
      <span class="status">待生成</span>
    </div>
  </section>
</template>
