<script setup>
import { onMounted } from 'vue'
import { store } from '../store'

onMounted(async () => {
  const r = await fetch('/api/papers')
  store.papers = await r.json()
})
</script>

<template>
  <aside class="panel material">
    <h2>纸张</h2>
    <div class="paper-list">
      <label v-for="p in store.papers" :key="p.id">
        <input type="radio" name="paper" :value="p.id" v-model="store.paper" />
        {{ p.name }}
      </label>
      <button class="ghost" disabled title="P1 开放">+ 上传我的纸张（P1）</button>
    </div>

    <h2>字体</h2>
    <div class="font-list">
      <label><input type="radio" name="font" checked /> 霞鹜文楷（默认）</label>
      <button class="ghost" disabled title="P1 开放">+ 上传我的字体（P1）</button>
    </div>

    <h2>参数</h2>
    <div class="params">
      <label>字号（P1 开放）<input type="range" min="28" max="64" value="44" disabled /></label>
      <label>潦草度（P1 开放）<input type="range" min="0" max="10" value="5" disabled /></label>
    </div>
  </aside>
</template>
