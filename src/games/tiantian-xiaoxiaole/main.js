import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

// ---- PWA：注册 Service Worker（离线可玩 + 可安装到桌面/手机主屏） ----
// 使用相对路径注册，兼容任意子路径的静态部署
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js')
      // 首次访问时，页面资源在 SW 接管前就已加载完毕（不会经过 fetch 拦截），
      // 因此等 SW 接管后主动「补热」：把这些资源重新请求一遍写入缓存，
      // 实现「打开一次即可完全离线游玩」。
      if (navigator.serviceWorker.controller) return // 已被接管（非首次），资源天然走缓存
      if (reg.active) {
        warmUpCache()
      } else {
        navigator.serviceWorker.addEventListener('controllerchange', warmUpCache, { once: true })
      }
    } catch {
      /* 注册失败（如非安全源）不影响游戏本身 */
    }
  })
}

async function warmUpCache() {
  try {
    const urls = new Set([location.href])
    for (const entry of performance.getEntriesByType('resource')) {
      try {
        const url = new URL(entry.name)
        if (url.origin !== location.origin) continue
        // 开发服务器路径不落缓存（与 sw.js 策略一致）
        if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules/')) continue
        urls.add(entry.name)
      } catch {
        /* 无效 URL 忽略 */
      }
    }
    await Promise.all([...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})))
  } catch {
    /* 预热失败不影响游戏 */
  }
}
