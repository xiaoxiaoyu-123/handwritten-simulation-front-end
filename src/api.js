// 统一的 API 调用入口：带上会话 Cookie，401 时把 store 切到"需要口令"状态。
// 组件里原来直接用 fetch('/api/...')，换成 apiFetch 即可获得拦截能力。
import { store } from './store'

export async function apiFetch(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts })
  if (r.status === 401) {
    store.authRequired = true
    store.authed = false
    throw new Error('需要访问口令')
  }
  return r
}

export async function checkAuth() {
  try {
    const r = await fetch('/api/auth/status', { credentials: 'same-origin' })
    const j = await r.json()
    store.authRequired = !!j.auth_required
    store.authed = !!j.authed
    return j
  } catch {
    // 后端没起来时不弹口令框，交给顶部的"后端未连接"提示
    return { auth_required: false, authed: true }
  }
}

export async function login(password) {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(typeof j.detail === 'string' ? j.detail : '口令不对')
  }
  store.authed = true
  store.authRequired = false
  return true
}
