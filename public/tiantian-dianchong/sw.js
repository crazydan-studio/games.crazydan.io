// ============ 天天电宠 Service Worker —— PWA 离线可玩 ============
// 缓存策略：
//   · 页面导航：网络优先（保证拿到最新版本），离线时回落缓存
//   · 静态资源：缓存优先（首次访问后全部落入缓存，断网可玩）
//   · 开发服务器路径（/src/、/@vite 等）：永远走网络，避免冻结 HMR
//   · AI 接口请求（外部 origin / POST）：不经 SW，天然直连
const CACHE = 'ttdc-cache-v1'

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // DragonBones 预设骨骼资产（猫/狗/恐龙；猪与 AI 物种为程序化生成，随 JS 打包）
  './assets/db/cat/cat_ske.json',
  './assets/db/cat/cat_tex.json',
  './assets/db/cat/cat_tex.png',
  './assets/db/dog/dog_ske.json',
  './assets/db/dog/dog_tex.json',
  './assets/db/dog/dog_tex.png',
  './assets/db/dino/dragon_boy_ske.json',
  './assets/db/dino/dragon_boy_tex.json',
  './assets/db/dino/dragon_boy_tex.png'
]

function isDevPath(pathname) {
  return (
    pathname.startsWith('/@') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.includes('/__vite') ||
    pathname.endsWith('sw.js') // SW 自身总是走网络，便于发版更新
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }))
          } catch {
            /* 单项失败不阻塞安装 */
          }
        })
      )
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (isDevPath(url.pathname)) return

  // 页面导航：网络优先，离线回落缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          try {
            const cache = await caches.open(CACHE)
            cache.put('./index.html', fresh.clone())
          } catch {
            /* 克隆失败不影响返回 */
          }
          return fresh
        } catch {
          return (
            (await caches.match(req)) ||
            (await caches.match('./index.html')) ||
            (await caches.match('./')) ||
            new Response('<h1>离线中</h1><p>这只电宠还没缓存好这一页，联网打开一次即可离线游玩～</p>', {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
              status: 200
            })
          )
        }
      })()
    )
    return
  }

  // 静态资源：缓存优先，未命中则网络并写缓存
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: false })
      if (hit) return hit
      try {
        const fresh = await fetch(req)
        if (fresh && fresh.ok) {
          try {
            const cache = await caches.open(CACHE)
            cache.put(req, fresh.clone())
          } catch {
            /* 只读响应不可缓存时忽略 */
          }
        }
        return fresh
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' })
      }
    })()
  )
})
