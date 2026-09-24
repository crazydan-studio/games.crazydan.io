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
      if (navigator.serviceWorker.controller) {
        // 本次页面已被 SW 接管（更新场景由旧 SW 继续服务）：不打扰当前页，
        // 新 SW 自下次导航起生效，避免 SW 更新掐断在途请求
        return
      }
      // 首次访问：等新 SW 就绪后请求「安全接管」——此时页面资源已全部加载完毕，
      // 接管不会影响任何在途请求；接管成功后由 warmUpCache 补写缓存，
      // 实现「打开一次即可完全离线游玩」。
      await navigator.serviceWorker.ready
      if (reg.active) reg.active.postMessage('CLAIM')
      navigator.serviceWorker.addEventListener('controllerchange', warmUpCache, { once: true })
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
