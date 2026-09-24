// ============ 天天电宠 Service Worker —— PWA 离线可玩 ============
// 缓存策略：
//   · 页面导航：网络优先（保证拿到最新版本），离线时回落缓存
//   · 静态资源：缓存优先（首次访问后全部落入缓存，断网可玩）
//   · 开发服务器路径（/src/、/@vite 等）：永远走网络，避免冻结 HMR
//   · AI 接口请求（外部 origin / POST）：不经 SW，天然直连
const CACHE = 'ttdc-cache-v3' // 资产更新（pig.glb 修复）→ 缓存版本必须升级

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // Babylon.js 3D 资产（Quaternius + KayKit，CC0；许可与来源见 ATTRIBUTION.md）
  './assets/b3d/pets/fox.glb',
  './assets/b3d/pets/shibainu.glb',
  './assets/b3d/pets/pig.glb',
  './assets/b3d/pets/trex.glb',
  './assets/b3d/home/bed_single_A.glb',
  './assets/b3d/home/book_set.glb',
  './assets/b3d/home/cactus_small_A.glb',
  './assets/b3d/home/chair_A.glb',
  './assets/b3d/home/couch.glb',
  './assets/b3d/home/lamp_standing.glb',
  './assets/b3d/home/pictureframe_small_A.glb',
  './assets/b3d/home/rug_oval_A.glb',
  './assets/b3d/home/shelf_B_small_decorated.glb',
  './assets/b3d/home/table_medium.glb',
  './assets/b3d/home/window.glb',
  './assets/b3d/nature/bush1.glb',
  './assets/b3d/nature/bush2.glb',
  './assets/b3d/nature/bush3.glb',
  './assets/b3d/nature/grass1.glb',
  './assets/b3d/nature/grass2.glb',
  './assets/b3d/nature/rock1.glb',
  './assets/b3d/nature/rock2.glb',
  './assets/b3d/nature/rock3.glb',
  './assets/b3d/nature/tree1.glb',
  './assets/b3d/nature/tree2.glb',
  './assets/b3d/nature/tree3.glb',
  './assets/b3d/nature/tree4.glb',
  './assets/b3d/props/bone.glb',
  './assets/b3d/props/bowl.glb',
  './assets/b3d/props/chicken-leg.glb',
  './assets/b3d/props/food_burger.glb',
  './assets/b3d/props/food_ingredient_carrot.glb',
  './assets/b3d/props/food_ingredient_cheese.glb',
  './assets/b3d/props/food_stew.glb',
  './assets/b3d/props/plate.glb'
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
