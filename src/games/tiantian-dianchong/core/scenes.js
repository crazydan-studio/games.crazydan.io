// ============ 场景系统 ============
// 当前仅内置几个场景（参数化 SVG 数据：渐变天空/地面 + 装饰件组合）。
// 场景 Schema 同时是 AI 动态生成新场景的契约（clampScene 钳制）。

const clampColor = (v, fallback) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : fallback
const clamp01 = (v, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

// 装饰件白名单（PROP_MODELS 有 GLB 的类型 + 程序化类型）
// 室内道具 = KayKit Restaurant Bits（餐桌/餐椅/料理台/灶台/冰箱/菜单牌/食材箱/地面/墙窗）
export const PROP_TYPES = [
  'cloud', 'tree', 'flower', 'butterfly', 'moon', 'star', 'cityline', 'fence',
  'ball', 'bowl', 'table', 'chair', 'counter', 'stove', 'fridge', 'menu', 'crate',
  'floor', 'window'
]

// ---- 内置场景 ----
export const BUILTIN_SCENES = {
  'living-room': {
    id: 'living-room',
    name: '温馨餐厅',
    builtin: true,
    sky: ['#FFE9C8', '#FFD9A8'],
    ground: ['#E8B87F', '#D9A266'],
    groundY: 0.74,
    night: false,
    props: [
      { type: 'window', x: 0.22, y: 0.3, s: 1 },
      { type: 'floor', x: 0.5, y: 0.88, s: 1.2 },
      { type: 'table', x: 0.5, y: 0.56, s: 1 },
      { type: 'chair', x: 0.3, y: 0.68, s: 0.9 },
      { type: 'chair', x: 0.7, y: 0.68, s: 1.1 },
      { type: 'counter', x: 0.86, y: 0.42, s: 1 },
      { type: 'menu', x: 0.1, y: 0.5, s: 1 },
      { type: 'bowl', x: 0.64, y: 0.92, s: 0.6 }
    ]
  },
  meadow: {
    id: 'meadow',
    name: '草地公园',
    builtin: true,
    sky: ['#BFE6FF', '#E3F6DC'],
    ground: ['#A5D977', '#83C15C'],
    groundY: 0.72,
    night: false,
    props: [
      { type: 'cloud', x: 0.2, y: 0.16, s: 1.2 },
      { type: 'cloud', x: 0.62, y: 0.1, s: 0.8 },
      { type: 'tree', x: 0.14, y: 0.52, s: 1.1 },
      { type: 'tree', x: 0.86, y: 0.55, s: 0.9 },
      { type: 'flower', x: 0.32, y: 0.84, s: 0.7, color: '#FF8FA3' },
      { type: 'flower', x: 0.7, y: 0.88, s: 0.6, color: '#FFD34E' },
      { type: 'butterfly', x: 0.5, y: 0.4, s: 0.5 },
      { type: 'fence', x: 0.5, y: 0.76, s: 1 }
    ]
  },
  bedroom: {
    id: 'bedroom',
    name: '深夜食堂',
    builtin: true,
    sky: ['#3E4A7A', '#2A3355'],
    ground: ['#8A6FB5', '#6E559B'],
    groundY: 0.76,
    night: true,
    props: [
      { type: 'star', x: 0.15, y: 0.12, s: 0.6 },
      { type: 'star', x: 0.42, y: 0.08, s: 0.5 },
      { type: 'star', x: 0.7, y: 0.15, s: 0.7 },
      { type: 'moon', x: 0.85, y: 0.14, s: 0.9 },
      { type: 'stove', x: 0.24, y: 0.5, s: 1 },
      { type: 'fridge', x: 0.82, y: 0.48, s: 1 },
      { type: 'table', x: 0.52, y: 0.72, s: 1 },
      { type: 'crate', x: 0.12, y: 0.82, s: 1 }
    ]
  },
  rooftop: {
    id: 'rooftop',
    name: '星空露台',
    builtin: true,
    sky: ['#1B2A5E', '#0E1533'],
    ground: ['#5470A8', '#3C5185'],
    groundY: 0.78,
    night: true,
    props: [
      { type: 'star', x: 0.12, y: 0.1, s: 0.7 },
      { type: 'star', x: 0.3, y: 0.2, s: 0.5 },
      { type: 'star', x: 0.55, y: 0.09, s: 0.6 },
      { type: 'star', x: 0.78, y: 0.18, s: 0.5 },
      { type: 'moon', x: 0.68, y: 0.12, s: 0.8 },
      { type: 'cityline', x: 0.5, y: 0.68, s: 1.1 },
      { type: 'fence', x: 0.5, y: 0.8, s: 0.9 },
      { type: 'bowl', x: 0.24, y: 0.9, s: 0.55 }
    ]
  }
}

export function getScene(id, customLib = {}) {
  if (BUILTIN_SCENES[id]) return BUILTIN_SCENES[id]
  const custom = customLib?.[id]
  if (custom) return clampScene(custom)
  return BUILTIN_SCENES['living-room']
}

export function sceneList(customLib = {}) {
  return [...Object.values(BUILTIN_SCENES), ...Object.values(customLib || {}).map(clampScene).filter(Boolean)]
}

// ---- Schema 钳制（AI / 导入数据必经） ----
export function clampScene(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id =
    typeof raw.id === 'string' && /^[\w-]{1,32}$/.test(raw.id) ? raw.id : `scene-${Date.now()}`
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 12) : '新场景'
  const props = (Array.isArray(raw.props) ? raw.props : [])
    .map((p) => {
      if (!p || typeof p !== 'object') return null
      if (!PROP_TYPES.includes(p.type)) return null
      return {
        type: p.type,
        x: clamp01(p.x, 0.5),
        y: clamp01(p.y, 0.5),
        s: Math.min(2, Math.max(0.4, Number(p.s) || 1)),
        color: clampColor(p.color, '')
      }
    })
    .filter(Boolean)
    .slice(0, 8)
  return {
    id,
    name,
    builtin: false,
    sky: [clampColor(raw.sky?.[0], '#BFE6FF'), clampColor(raw.sky?.[1], '#E3F6DC')],
    ground: [clampColor(raw.ground?.[0], '#A5D977'), clampColor(raw.ground?.[1], '#83C15C')],
    groundY: clamp01(raw.groundY, 0.72),
    night: !!raw.night,
    props
  }
}
