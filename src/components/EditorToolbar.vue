<script setup>
// 编辑器工具条：记号插入 + 拍题/导入/AI 解题入口 + 停止。
// 纯展示组件：动作通过 emit 交回父组件（insert 需要编辑框光标位置）。
import { store } from '../store'

defineProps({
  aiElapsed: { type: Number, default: 0 },
  importing: { type: Boolean, default: false },
})
const emit = defineEmits(['insert', 'photo', 'import', 'solve', 'stop'])

// 记号工具条：点击向光标处插入记号模板，光标落到第一个 } 前
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
  { label: 'mat', title: '矩阵（分号分行，逗号分列；det() 为行列式）', tpl: 'mat(; ; )' },
]
</script>

<template>
  <div class="toolbar">
    <button v-for="m in marks" :key="m.tpl" :title="m.title + '：' + m.tpl"
            @click="emit('insert', m.tpl)">
      {{ m.label }}
    </button>
    <span class="sep"></span>
    <button class="ai" title="拍题目照片，AI 抄成文字"
            :disabled="store.aiBusy || importing"
            @click="emit('photo')">
      {{ store.aiBusy && store.aiKind === 'transcribe'
        ? `正在抄题… ${aiElapsed}s` : '📷 拍题' }}
    </button>
    <button class="ai" title="上传文字版 PDF / Word 文档，直接提取文字（不消耗 AI 次数）"
            :disabled="store.aiBusy || importing" @click="emit('import')">
      {{ importing ? '解析中…' : '📄 导入' }}
    </button>
    <button class="ai" title="AI 按本站记号规范写答案（务必自行核对）"
            :disabled="store.aiBusy || importing" @click="emit('solve')">
      {{ store.aiBusy && store.aiKind === 'solve'
        ? `正在解题… ${aiElapsed}s` : '🤖 AI 解题' }}
    </button>
    <button v-if="store.aiBusy" class="stop" @click="emit('stop')"
            title="不再等待结果（AI 侧可能已消耗本次额度）">
      ✕ 停止
    </button>
    <a class="cheatsheet"
       href="https://github.com/xiaoxiaoyu-123/handwritten-simulation-front-end#支持的记号"
       target="_blank">记号速查 ↗</a>
  </div>
</template>
