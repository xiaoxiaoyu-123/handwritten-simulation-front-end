<script setup>
// 分步动画讲解播放器（2.0 阶段 4）：
// - 数据：AI 按固定 schema 产出的 steps[{f: LaTeX, t: 中文解说}]（store.animSteps）
// - 交互：上一步/下一步/自动播放/进度点/语音朗读（浏览器 TTS）
// - 导出：getDisplayMedia + MediaRecorder 录 webm（纯客户端，服务器零开销）
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import katex from 'katex'
import { store } from '../store'

const router = useRouter()
const steps = computed(() => store.animSteps || [])
const problem = computed(() => store.animProblem || '')
const idx = ref(0)
const playing = ref(false)
const ttsOn = ref(false)
const recording = ref(false)
const formulaEl = ref(null)
let timer = null
let recorder = null
let recChunks = []

const cur = computed(() => steps.value[idx.value] || { f: '', t: '' })

function renderFormula() {
  if (!formulaEl.value) return
  if (!cur.value.f) {
    formulaEl.value.textContent = ''
    return
  }
  try {
    katex.render(cur.value.f, formulaEl.value,
                 { displayMode: true, throwOnError: false })
  } catch {
    formulaEl.value.textContent = cur.value.f      // LaTeX 渲染失败降级原文
  }
}

function speak(text) {
  if (!ttsOn.value || !('speechSynthesis' in window) || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  speechSynthesis.speak(u)
}

function go(i) {
  if (!steps.value.length) return
  idx.value = Math.max(0, Math.min(steps.value.length - 1, i))
  nextTick(renderFormula)
  speak(cur.value.t)
}

function nextStep() { go(idx.value + 1) }
function prevStep() { go(idx.value - 1) }

function stopPlay() {
  playing.value = false
  if (timer) { clearInterval(timer); timer = null }
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  if (recording.value) finishRecording()           // 录制时播完自动收尾
}

function play() {
  if (!steps.value.length) return
  playing.value = true
  go(0)
  timer = setInterval(() => {
    if (idx.value < steps.value.length - 1) go(idx.value + 1)
    else stopPlay()
  }, 4500)
}

watch(ttsOn, v => {
  if (!v && 'speechSynthesis' in window) speechSynthesis.cancel()
})
onMounted(renderFormula)
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if ('speechSynthesis' in window) speechSynthesis.cancel()
})

// ---- 视频导出：getDisplayMedia 录当前标签页 + MediaRecorder webm ----
async function exportVideo() {
  let stream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
  } catch {
    return                                     // 用户取消分享
  }
  recChunks = []
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm'
  recorder = new MediaRecorder(stream, { mimeType: mime })
  recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data) }
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop())
    const blob = new Blob(recChunks, { type: 'video/webm' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = '讲解动画.webm'
    a.click()
    URL.revokeObjectURL(a.href)
    recording.value = false
  }
  stream.getVideoTracks()[0].addEventListener('ended', () => stopPlay())
  recorder.start(500)
  recording.value = true
  play()                                       // 录制期间自动完整播放一遍
}

function finishRecording() {
  try { recorder?.stop() } catch { /* 已停 */ }
}
</script>

<template>
  <main class="page-narrow">
    <section class="panel anim-panel">
      <template v-if="steps.length">
        <div class="anim-head">
          <b class="anim-brand">🎞️ 分步讲解</b>
          <span class="anim-problem" :title="problem">{{ problem.slice(0, 60) }}</span>
          <span class="anim-count">第 {{ idx + 1 }} / {{ steps.length }} 步</span>
        </div>

        <div class="anim-stage" :class="{ recording }">
          <div class="anim-formula" ref="formulaEl"></div>
          <p class="anim-note">{{ cur.t }}</p>
        </div>

        <div class="anim-progress">
          <span v-for="(s, i) in steps" :key="i" class="dot"
                :class="{ on: i === idx, past: i < idx }"></span>
        </div>

        <div class="anim-controls" v-if="!recording">
          <button @click="go(0)" title="回到第一步">⏮</button>
          <button @click="prevStep" :disabled="idx === 0">◀ 上一步</button>
          <button class="anim-play" @click="playing ? stopPlay() : play()">
            {{ playing ? '⏸ 暂停' : '▶ 自动播放' }}
          </button>
          <button @click="nextStep" :disabled="idx === steps.length - 1">下一步 ▶</button>
          <button @click="go(steps.length - 1)" title="跳到最后一步">⏭</button>
        </div>
        <div class="anim-tts">
          <label v-if="!recording">
            <input type="checkbox" v-model="ttsOn" /> 🔊 语音朗读解说
          </label>
          <button class="anim-rec" @click="exportVideo"
                  v-if="!recording" title="录当前标签页，播放完自动保存 webm">
            ⏺ 录制讲解视频
          </button>
          <span v-else class="anim-recing">● 录制中——播放完自动保存</span>
        </div>
      </template>

      <div v-else class="anim-empty">
        <p class="anim-empty-t">还没有可播放的讲解。</p>
        <p class="hint">
          在「写作业」页完成 AI 解答后，点「🎬 动画讲解」生成；
          题库里的解答也可以一键生成讲解。
        </p>
        <button class="primary small" style="width: auto; padding: 8px 22px"
                @click="router.push('/write')">去写作业 →</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.anim-panel { min-height: 420px; display: flex; flex-direction: column; }
.anim-head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 12px;
}
.anim-brand { color: var(--color-primary); font-family: var(--font-serif); font-size: 17px; }
.anim-problem {
  flex: 1; font-size: 13px; color: var(--color-fg-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.anim-count { font-size: 12px; color: var(--color-fg-faint); flex: none; }

.anim-stage {
  border: 1px solid var(--color-border); border-radius: var(--radius-l);
  background: var(--color-card); min-height: 260px;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 34px 30px; gap: 18px;
  transition: box-shadow 0.2s;
}
.anim-stage.recording { border-color: var(--color-danger); }
.anim-formula { font-size: 22px; min-height: 70px; display: flex; align-items: center; }
.anim-note {
  font-size: 15px; line-height: 1.8; color: var(--color-fg-soft);
  max-width: 640px; text-align: center; min-height: 2em;
}

.anim-progress { display: flex; gap: 7px; justify-content: center; margin-top: 14px; }
.anim-progress .dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--color-border); transition: background 0.2s, transform 0.2s;
}
.anim-progress .dot.past { background: var(--color-primary-soft); }
.anim-progress .dot.on {
  background: var(--color-primary); transform: scale(1.35);
}

.anim-controls { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
.anim-controls button {
  padding: 7px 16px; font-size: 13px;
  border: 1px solid var(--color-border); background: var(--color-card-2);
  border-radius: var(--radius-s); cursor: pointer; color: var(--color-fg);
  transition: border-color 0.15s, color 0.15s;
}
.anim-controls button:hover:not(:disabled) {
  border-color: var(--color-primary); color: var(--color-primary);
}
.anim-controls button:disabled { opacity: 0.45; cursor: default; }
.anim-controls .anim-play {
  background: var(--color-primary); color: var(--color-on-primary);
  border-color: var(--color-primary); font-weight: 600;
}
.anim-controls .anim-play:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 88%, black);
  color: var(--color-on-primary);
}

.anim-tts {
  display: flex; align-items: center; gap: 14px; justify-content: center;
  margin-top: 12px; font-size: 13px; color: var(--color-fg-soft);
}
.anim-tts label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.anim-rec {
  padding: 5px 14px; font-size: 13px;
  border: 1px solid var(--color-danger-border); background: var(--color-card);
  border-radius: var(--radius-s); cursor: pointer; color: var(--color-danger);
  transition: background 0.15s;
}
.anim-rec:hover { background: var(--color-danger-soft); }
.anim-recing { color: var(--color-danger); font-weight: 600; }

.anim-empty { padding: 40px 20px; text-align: center; }
.anim-empty-t { font-size: 16px; color: var(--color-fg); margin-bottom: 8px; }
</style>
