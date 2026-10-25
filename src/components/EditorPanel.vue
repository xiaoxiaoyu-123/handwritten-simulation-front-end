<script setup>
import { ref } from 'vue'

const text = ref('')

// 记号工具条：点击向光标处插入记号模板（P0 实现；骨架期先占位）
const marks = [
  { label: 'a/b', title: '堆叠分数', tpl: 'fr{}{}' },
  { label: '√', title: '根号', tpl: '√()' },
  { label: '∫', title: '积分上下限', tpl: '∫[,]' },
  { label: 'xᵧ', title: '下标', tpl: 'sb{}{}' },
  { label: '∂', title: '偏导', tpl: 'pd{}' },
  { label: 'x̄', title: '上划线', tpl: 'ov{}' },
  { label: 'lim', title: '极限', tpl: 'lim{}' },
  { label: 'Σ', title: '求和上下限', tpl: 'Σ[,]' },
  { label: '{ }', title: '分段大括号', tpl: '{2 ' },
]
</script>

<template>
  <section class="panel editor">
    <div class="toolbar">
      <button v-for="m in marks" :key="m.tpl" :title="m.title + '：' + m.tpl">
        {{ m.label }}
      </button>
      <a class="cheatsheet" href="#" title="P0 提供完整速查表">记号速查 ?</a>
    </div>
    <textarea
      v-model="text"
      placeholder="在这里输入或粘贴作业文本…&#10;支持记号：fr{分子}{分母}、√(...)、∫[下,上]、sb{底}{下标}、lim{过程}、Σ[下,上] 等"
    ></textarea>
    <div class="meta">行数 {{ text ? text.split('\n').length : 0 }}</div>
  </section>
</template>
