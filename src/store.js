import { reactive } from 'vue'

// 全站共享状态（P0 单页面足够，不上 Pinia）
export const store = reactive({
  text: '',
  paper: 'a4-lined',
  papers: [],

  previewUrl: '',
  previewing: false,
  previewError: '',

  job: null,            // {id, status, done, total, error}
  jobError: '',
  downloadUrl: '',
})
