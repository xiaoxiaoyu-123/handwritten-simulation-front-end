// 本机字体副本（IndexedDB）：生成/上传成功的 ttf 存一份，服务端被 TTL
// 清理或换了部署机器时，打开页面自动补传回来——不用重新拍照生成。
// 注意：渲染在服务端，字体终究要传上去才能用；本机副本省的是"重新生成"。

const DB_NAME = 'hs_fonts'
const STORE = 'ttf'

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'fontId' })
      }
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

async function tx(mode, fn) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode)
    const out = fn(t.objectStore(STORE))
    t.oncomplete = () => res(out?.result !== undefined ? out.result : out)
    t.onerror = () => rej(t.error)
  })
}

export async function idbPut(rec) {
  return tx('readwrite', (st) => st.put(rec))
}

export async function idbDelete(fontId) {
  return tx('readwrite', (st) => st.delete(fontId))
}

export async function idbAll() {
  const db = await openDB()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).getAll()
    req.onsuccess = () => res(req.result || [])
    req.onerror = () => rej(req.error)
  })
}

export async function idbGet(fontId) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).get(fontId)
    req.onsuccess = () => res(req.result || null)
    req.onerror = () => rej(req.error)
  })
}

// client_id：浏览器首次访问生成，之后所有请求带上（X-Client-Id）——
// 用户资产的隔离键。它不是登录（可被伪造），目标是"普通人不互见"。
export function clientId() {
  let cid = localStorage.getItem('hs_client_id')
  if (!cid || !/^[0-9a-f-]{8,64}$/.test(cid)) {
    cid = (crypto.randomUUID ? crypto.randomUUID() : `-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-xxxx`)
    cid = cid.replace(/[^0-9a-f-]/g, '0')
    localStorage.setItem('hs_client_id', cid)
  }
  return cid
}
