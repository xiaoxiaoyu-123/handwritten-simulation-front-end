// 统一的 API 调用入口：同源带 Cookie。需要 401/鉴权等拦截时再扩展这里。
export async function apiFetch(path, opts = {}) {
  return fetch(path, { credentials: 'same-origin', ...opts })
}
