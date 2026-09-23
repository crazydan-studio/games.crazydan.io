// ============ 自发行为库 ============
// 生命系统 decide() 的行为白名单；渲染动画与台词在 UI 侧映射。

export const BEHAVIORS = {
  idle: { key: 'idle', label: '安静待着', icon: '🐾' },
  wander: { key: 'wander', label: '踱步闲逛', icon: '🚶' },
  sleep: { key: 'sleep', label: '呼呼大睡', icon: '💤' },
  play: { key: 'play', label: '自娱自乐', icon: '🎾' },
  beg: { key: 'beg', label: '撒娇讨抱', icon: '🥺' },
  groom: { key: 'groom', label: '梳洗打扮', icon: '🧼' },
  stare: { key: 'stare', label: '望着你发呆', icon: '👀' }
}

export const BEHAVIOR_KEYS = Object.keys(BEHAVIORS)

export function isBehavior(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BEHAVIORS, v)
}
