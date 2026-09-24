// ============ 天天消消乐 Service Worker —— PWA 离线可玩 ============
// 缓存策略：
//   · 页面导航：网络优先（保证拿到最新版本），离线时回落缓存
//   · 静态资源：缓存优先（首次访问后全部落入缓存，断网可玩）
//   · 开发服务器路径（/src/、/@vite 等）：永远走网络，避免冻结 HMR
//   · blob:/objectURL（IndexedDB 表情图）不经 SW，天然离线可用
//
// v3 加固（与天天电宠 sw.js v4 同步）：
//   · activate 不再自动 clients.claim()，避免 SW 更新掐断在途请求；首次安装
//     由页面加载完成后发 'CLAIM' 消息触发安全接管；
//   · 缓存清理只删本游戏 ttxsl-cache-* 前缀，不误删同源其他游戏缓存；
//   · 导航响应只有 fresh.ok 才写缓存，避免错误页污染离线兜底。
const CACHE = 'ttxsl-cache-v3'

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './expressions/manifest.json',
  './expressions/images/face-01.svg',
  './expressions/images/face-02.svg',
  './expressions/images/face-03.svg',
  './expressions/images/face-04.svg',
  './expressions/images/face-05.svg',
  './expressions/images/face-06.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
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
      // 只清理本游戏的历史版本缓存；同源其他游戏（tiantian-dianchong 等）不动
      await Promise.all(
        keys.filter((k) => k.startsWith('ttxsl-cache-') && k !== CACHE).map((k) => caches.delete(k))
      )
      // 不调用 clients.claim()：更新场景由旧 SW 继续服务当前页面至下次导航；
      // 首次安装的接管由页面在 load 完成后发 'CLAIM' 消息触发（见 main.js）。
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
  // 页面资源加载完毕后的安全接管（仅首次安装场景使用，见 main.js）
  if (event.data === 'CLAIM') self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return
  if (isDevPath(url.pathname)) return

  // 页面导航：网络优先，离线回落缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          if (fresh && fresh.ok) {
            try {
              const cache = await caches.open(CACHE)
              cache.put('./index.html', fresh.clone())
            } catch {
              /* 克隆失败不影响返回 */
            }
          }
          return fresh
        } catch {
          try {
            return (
              (await caches.match(req)) ||
              (await caches.match('./index.html')) ||
              (await caches.match('./')) ||
              new Response('<h1>离线中</h1><p>天天还没缓存好这一页，联网打开一次即可离线游玩～</p>', {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
                status: 200
              })
            )
          } catch {
            return new Response('', { status: 504, statusText: 'Offline' })
          }
        }
      })()
    )
    return
  }

  // 静态资源：缓存优先，未命中则网络并写缓存；任何异常兜底，绝不 reject
  event.respondWith(
    (async () => {
      try {
        const hit = await caches.match(req)
        if (hit) return hit
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
