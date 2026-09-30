// ============ 关卡进度（localStorage 持久化） ============
// 经典闯关的当前关卡自动记录：通关推进时写入（useGame.nextLevel），
// 刷新/重开浏览器后从记录的关卡继续，不再从第 1 关重来；
// 需要重来时可在主页「游戏设置」里从第 1 关重新开始。
// 限时挑战没有关卡概念，不读写本模块。
const KEY = 'ttxsl-level'
const MIN = 1
const MAX = 9999 // 防异常数据把关卡数撑到离谱

// 读取并清洗：无记录 / 非数字 / 越界一律回落第 1 关
export function loadLevel() {
  try {
    const n = Number(localStorage.getItem(KEY))
    if (!Number.isFinite(n)) return MIN
    return Math.min(MAX, Math.max(MIN, Math.floor(n)))
  } catch {
    return MIN // 隐私模式等存储不可用
  }
}

export function saveLevel(level) {
  try {
    localStorage.setItem(KEY, String(level))
  } catch {
    /* 隐私模式忽略 */
  }
}

// 从第 1 关重新开始（清零进度）
export function resetLevel() {
  saveLevel(MIN)
  return MIN
}
