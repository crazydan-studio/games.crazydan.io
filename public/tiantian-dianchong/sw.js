// ============ 天天电宠 Service Worker —— PWA 离线可玩 ============
// 缓存策略：
//   · 页面导航：网络优先（保证拿到最新版本），离线时回落缓存
//   · 静态资源：缓存优先（首次访问后全部落入缓存，断网可玩）
//   · 开发服务器路径（/src/、/@vite 等）：永远走网络，避免冻结 HMR
//   · AI 接口请求（外部 origin / POST）：不经 SW，天然直连
//
// v4 加固（修复线上报错「A ServiceWorker intercepted the request and
// encountered an unexpected error」——SW 更新抢占导致在途大 chunk 请求被掐断）：
//   · activate 不再自动 clients.claim()：SW 更新时正在加载的页面（含 Babylon 主
//     chunk 等在途请求）继续由旧 SW 服务，新 SW 自下次导航起接管，彻底规避
//     「worker 被替换 → 在途 respondWith 被杀 → 主 chunk 加载失败」的竞态；
//   · 首次安装后的接管改为页面加载完成主动发 'CLAIM' 消息触发（彼时页面资源已
//     就绪，无在途请求，抢占安全），离线补热逻辑随之执行；
//   · 缓存清理只删本游戏 ttdc-cache-* 前缀，不再误删同源其他游戏（消消乐）缓存；
//   · respondWith 全路径 try/catch 兜底：任何异常回落网络/504，绝不 reject；
//   · 导航响应只有 fresh.ok 才写缓存，避免把 4xx/5xx 错误页污染离线兜底。
// v5：宠物建模换 Quaternius Ultimate Animated Animals（alpaca 替 pig）、
//     怪兽建模换 Ultimate Monsters（dragon 替 trex）、室内场景换 KayKit
//     Restaurant Bits（餐厅道具全套替 FurnitureBits 家具）
const CACHE = 'ttdc-cache-v5'

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // Babylon.js 3D 资产（Quaternius + KayKit，CC0；许可与来源见 ATTRIBUTION.md）
  // 宠物 = Ultimate Animated Animals；怪兽 = Ultimate Monsters；室内 = Restaurant Bits
  './assets/b3d/pets/fox.glb',
  './assets/b3d/pets/shibainu.glb',
  './assets/b3d/pets/alpaca.glb',
  './assets/b3d/pets/dragon.glb',
  './assets/b3d/home/chair_A.glb',
  './assets/b3d/home/chair_B.glb',
  './assets/b3d/home/chair_stool.glb',
  './assets/b3d/home/crate_buns.glb',
  './assets/b3d/home/crate_carrots.glb',
  './assets/b3d/home/crate_cheese.glb',
  './assets/b3d/home/floor_kitchen.glb',
  './assets/b3d/home/fridge_A.glb',
  './assets/b3d/home/kitchencounter_straight_A.glb',
  './assets/b3d/home/menu.glb',
  './assets/b3d/home/stove_single.glb',
  './assets/b3d/home/table_round_A.glb',
  './assets/b3d/home/table_round_B.glb',
  './assets/b3d/home/wall_window_open.glb',
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
      // 只清理本游戏的历史版本缓存；同源其他游戏（tiantian-xiaoxiaole 等）不动
      await Promise.all(
        keys.filter((k) => k.startsWith('ttdc-cache-') && k !== CACHE).map((k) => caches.delete(k))
      )
      // 注意：这里不调用 clients.claim()。更新场景下由旧 SW 继续服务当前页面直到
      // 下次导航，避免 worker 替换掐断在途请求；首次安装的接管由页面在 load 完成
      // 后发 'CLAIM' 消息触发（见 main.js）。
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
              new Response('<h1>离线中</h1><p>这只电宠还没缓存好这一页，联网打开一次即可离线游玩～</p>', {
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
