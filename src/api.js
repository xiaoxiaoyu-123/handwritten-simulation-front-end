// 统一的 API 调用入口：同源带 Cookie + X-Client-Id（用户资产隔离键，
// 首次访问生成存 localStorage）。需要其他统一拦截（如 401）时再扩展这里。
import { clientId } from './fontstore'

export async function apiFetch(path, opts = {}) {
  const headers = new Headers(opts.headers || {})
  headers.set('X-Client-Id', clientId())
  return fetch(path, { credentials: 'same-origin', ...opts, headers })
}
