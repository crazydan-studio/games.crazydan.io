// ============ PWA 状态（离线徽章 / SW 就绪） ============
import { reactive } from 'vue'

export const pwaState = reactive({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  controlled: false, // 页面已被 Service Worker 接管（可离线）
  canInstall: false // 提示用户可安装到桌面（beforeinstallprompt 已捕获）
})

let deferredPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    pwaState.online = true
  })
  window.addEventListener('offline', () => {
    pwaState.online = false
  })

  if ('serviceWorker' in navigator) {
    if (navigator.serviceWorker.controller) pwaState.controlled = true
    navigator.serviceWorker.ready.then(() => {
      pwaState.controlled = true
    }).catch(() => {})

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferredPrompt = e
      pwaState.canInstall = true
    })
  }
}

// 用户主动触发安装（主页按钮）
export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  pwaState.canInstall = false
  return outcome === 'accepted'
}
