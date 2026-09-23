// ============ 游戏设置（玩家可调，localStorage 持久化） ============
// - hint：提示辅助（「提示」按钮 + 停顿自动提示），默认禁用
// - corner：消除块右下角颜色角标，默认禁用
// - board：棋盘矩阵预设，缺省选中「大图标」矩阵（6 列 × 8 行）
import { reactive, computed } from 'vue'

const KEY = 'ttxsl-settings-v1'

// 棋盘矩阵预设：列数越少，图标越大
// label 里的「6×8」指 6 列 × 8 行（棋盘更高、图标更大，适合手机竖屏）
export const BOARD_PRESETS = [
  { id: 'small', name: '小图标', matrix: '8×8', rows: 8, cols: 8 },
  { id: 'large', name: '大图标', matrix: '6×8', rows: 8, cols: 6 },
  { id: 'xlarge', name: '特大图标', matrix: '6×6', rows: 6, cols: 6 }
]

const DEFAULTS = {
  hint: false,
  corner: false,
  board: 'large'
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved && typeof saved === 'object') {
      return {
        ...DEFAULTS,
        ...saved,
        // 未知预设 id 一律回落默认
        board: BOARD_PRESETS.some((p) => p.id === saved.board) ? saved.board : DEFAULTS.board
      }
    }
  } catch {
    /* 隐私模式/损坏数据忽略 */
  }
  return { ...DEFAULTS }
}

export const settings = reactive(load())

export function updateSettings(patch) {
  Object.assign(settings, patch)
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...settings }))
  } catch {
    /* 隐私模式忽略 */
  }
}

// 当前棋盘预设（供开局时取行列数）
export const boardPreset = computed(
  () => BOARD_PRESETS.find((p) => p.id === settings.board) || BOARD_PRESETS[1]
)

export function boardDims() {
  const p = boardPreset.value
  return { rows: p.rows, cols: p.cols }
}
