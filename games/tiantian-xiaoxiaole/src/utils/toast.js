// ============ 全局 Toast ============
import { reactive } from 'vue'

export const toasts = reactive([])
let seq = 0

export function toast(msg, type = 'info') {
  const id = ++seq
  toasts.push({ id, msg, type })
  if (toasts.length > 3) toasts.splice(0, toasts.length - 3)
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, 2400)
}
