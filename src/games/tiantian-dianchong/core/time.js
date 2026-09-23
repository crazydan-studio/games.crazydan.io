// ============ 时间系统 ============
// 游戏时钟 = 累积的「游戏内毫秒」；现实流逝 × timeScale 计入。
// 唯一可信来源为设备现实时钟（now），存档仅记录 gameClock 与 lastSeen。

export const HOUR = 3600 * 1000 // 1 游戏小时（游戏内毫秒）
export const DAY = 24 * HOUR

// 可选时间流速：1× 与现实同步（默认）；60× 起为「加速游戏世界时间」
export const TIME_SCALES = [
  { value: 1, label: '与现实同步', hint: '和现实世界同一节奏，适合随身陪伴' },
  { value: 60, label: '60× 轻快', hint: '现实 1 分钟 = 游戏 1 小时' },
  { value: 600, label: '600× 飞快', hint: '现实 1 分钟 = 游戏 10 小时' },
  { value: 3600, label: '3600× 疾速', hint: '现实 1 秒 = 游戏 1 小时，快速看它长大' }
]

// 读取视图：不修改存档，仅换算「此刻」的游戏时钟
export function clockNow(save, realNow = Date.now()) {
  const scale = save?.settings?.timeScale || 1
  return (save?.gameClock || 0) + Math.max(0, realNow - (save?.lastSeen || realNow)) * scale
}

export function gameHours(clockMs) {
  return clockMs / HOUR
}

export function dayOf(clockMs) {
  return Math.floor(clockMs / DAY) + 1
}

export function hourOfDay(clockMs) {
  return Math.floor((clockMs % DAY) / HOUR)
}

// 游戏内时段（影响行为与场景氛围）
export function periodOfDay(hour) {
  if (hour >= 5 && hour < 8) return { key: 'dawn', label: '清晨', night: false }
  if (hour >= 8 && hour < 12) return { key: 'morning', label: '上午', night: false }
  if (hour >= 12 && hour < 17) return { key: 'afternoon', label: '下午', night: false }
  if (hour >= 17 && hour < 20) return { key: 'evening', label: '傍晚', night: false }
  return { key: 'night', label: '夜晚', night: true }
}

export function periodNow(clockMs) {
  return periodOfDay(hourOfDay(clockMs))
}

export function fmtGameTime(clockMs) {
  const h = hourOfDay(clockMs)
  const hh = String(h).padStart(2, '0')
  return `第 ${dayOf(clockMs)} 天 · ${periodOfDay(h).label} ${hh}:00`
}

// 人性化描述一段游戏时长（离线结算摘要用）
export function fmtGameSpan(ms) {
  const hours = ms / HOUR
  if (hours < 1) return '不到 1 小时'
  if (hours < 48) return `${Math.round(hours)} 小时`
  return `${(hours / 24).toFixed(hours % 24 === 0 ? 0 : 1)} 天`
}
