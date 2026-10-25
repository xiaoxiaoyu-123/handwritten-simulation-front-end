<script setup>
import { nextTick, ref } from 'vue'
import { store } from '../store'

const ta = ref(null)

// 记号工具条：向光标处插入模板，光标落到第一个 } 前
const marks = [
  { label: 'a/b', title: '堆叠分数', tpl: 'fr{}{}' },
  { label: '√', title: '根号', tpl: '√()' },
  { label: '∫', title: '积分上下限', tpl: '∫[,]' },
  { label: 'xᵧ', title: '下标', tpl: 'sb{}{}' },
  { label: '∂', title: '偏导', tpl: 'pd{}' },
  { label: 'x̄', title: '上划线', tpl: 'ov{}' },
  { label: 'lim', title: '极限（过程写在正下方）', tpl: 'lim{}' },
  { label: 'Σ', title: '求和上下限', tpl: 'Σ[,]' },
  { label: '{ }', title: '分段大括号（写在第一分支行）', tpl: '{2 ' },
]

function insert(tpl) {
  const el = ta.value
  const s = el?.selectionStart ?? store.text.length
  const e = el?.selectionEnd ?? s
  store.text = store.text.slice(0, s) + tpl + store.text.slice(e)
  nextTick(() => {
    el?.focus()
    const pos = s + Math.max(0, tpl.indexOf('}'))
    el?.setSelectionRange(pos, pos)
  })
}
</script>

<template>
  <section class="panel editor">
    <div class="toolbar">
      <button v-for="m in marks" :key="m.tpl" :title="m.title + '：' + m.tpl"
              @click="insert(m.tpl)">
        {{ m.label }}
      </button>
      <a class="cheatsheet" href="https://github.com/xiaoxiaoyu-123/handwritten-simulation-front-end#支持的记号"
         target="_blank">记号速查 ↗</a>
    </div>
    <textarea ref="ta" v-model="store.text"
      placeholder="在这里输入或粘贴作业文本…&#10;支持记号：fr{分子}{分母}、√(...)、∫[下,上]、sb{底}{下标}、lim{过程}、Σ[下,上] 等&#10;指数写 ^ 记法：e^(-jωt)、x^(n+1)"
    ></textarea>
    <div class="meta">行数 {{ store.text ? store.text.split('\n').length : 0 }}</div>
  </section>
</template>
