// ============ 物种系统 ============
// 内置四个物种（猫/狗/猪/恐龙怪兽），各自拥有不同的生命系统参数与行为模式。
// 物种 Schema 同时是「AI 生成新物种」的严格契约：clampSpecies() 对任意来源
// （内置 / 导入存档 / AI 输出）做校验、缺省合并与数值钳制。

import { isBehavior } from './behaviors.js'

// ---- 数值钳制范围 ----
const RANGE = { min: 0.2, max: 3.0 }
const clampNum = (v, min, max, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
const clamp01 = (v, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}
const clampWeight = (v) => clampNum(v, 0, 5, 1)
const clampColor = (v, fallback) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : fallback

// 耳朵 / 尾巴 / 鼻吻 / 附加件白名单（PetAvatar 渲染模板）
const EAR_STYLES = ['pointed', 'floppy', 'round', 'horn']
const TAIL_STYLES = ['striped', 'wag', 'curly', 'spikes']
const SNOUT_STYLES = ['cat', 'dog', 'pig', 'dino']
const EXTRAS = ['whiskers', 'collar', 'tusks', 'back-spikes', 'none']
// 3D 模型资产键：Babylon.js 版四内置物种使用 public/assets/b3d/ 的 Quaternius CC0 模型；
// 自定义/AI 物种无预设模型，由 3D 播放器用「狐狸通用身体 + 物种配色漫反射染色」呈现
const MODEL_ASSETS = ['fox', 'shibainu', 'pig', 'trex']
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback)

// ---- 内置物种 ----
export const BUILTIN_SPECIES = {
  cat: {
    id: 'cat',
    name: '小狐狸',
    emoji: '🦊',
    builtin: true,
    model: 'fox', // Quaternius Ultimate Animated Animals（CC0，12 段骨骼动画）
    intro: '机灵的小狐狸，吃不多、爱干净，情感细腻又有点小傲娇，被冷落会闹小脾气。',
    personality: ['机灵', '优雅', '有点小傲娇'],
    traits: {
      metabolism: 0.8, // 饥饿慢：省粮
      hygieneDecay: 0.9, // 爱干净
      illnessRate: 0.7,
      recovery: 1.0,
      growthSpeed: 1.0,
      moodVolatility: 1.15, // 情绪敏感
      sociability: 1.1,
      snackLove: 1.0,
      bathMood: -4 // 讨厌水
    },
    schedule: { sleep: [[13, 16], [23, 6]] }, // 午后小憩 + 夜里睡
    behaviors: { idle: 0.8, wander: 0.9, sleep: 1.4, play: 1.3, beg: 0.7, groom: 1.1, stare: 0.5 },
    look: {
      body: '#E88A3A',
      belly: '#F7E3C8',
      accent: '#B45F1E',
      ear: 'pointed',
      tail: 'striped',
      snout: 'cat',
      extra: 'whiskers'
    },
    quips: [
      '嘤嘤～', '尾巴尖才是本体。', '这束阳光正好。', '投喂的，饭呢？',
      '别碰我的尾巴。', '今天也适合窝着。', '你回来了呀。', '狐狸的耳朵什么都听得见。'
    ]
  },
  dog: {
    id: 'dog',
    name: '柴犬',
    emoji: '🐕',
    builtin: true,
    model: 'shibainu', // Quaternius Ultimate Animated Animals（CC0，12 段骨骼动画）
    intro: '笑容满面的柴犬，胃口大、爱运动，情绪稳定超黏人，最怕你不在家。',
    personality: ['热情', '忠诚', '永远开心'],
    traits: {
      metabolism: 1.3,
      hygieneDecay: 1.1,
      illnessRate: 0.9,
      recovery: 1.3, // 恢复力最强
      growthSpeed: 0.9,
      moodVolatility: 0.8,
      sociability: 1.4,
      snackLove: 1.3,
      bathMood: 6
    },
    schedule: { sleep: [[22, 7]] }, // 早睡早起
    behaviors: { idle: 0.7, wander: 1.3, sleep: 0.9, play: 1.6, beg: 1.1, groom: 0.6, stare: 0.4 },
    look: {
      body: '#E8A865',
      belly: '#F5EAD5',
      accent: '#C8844A',
      ear: 'floppy',
      tail: 'wag',
      snout: 'dog',
      extra: 'collar'
    },
    quips: [
      '汪！', '球呢？球呢？！', '尾巴要摇断啦！', '一起去玩嘛～',
      '你回来啦！！', '我是全世界最幸福的柴犬！', '坐好等饭，我最擅长了。'
    ]
  },
  pig: {
    id: 'pig',
    name: '猪猪',
    emoji: '🐷',
    builtin: true,
    model: 'pig', // Quaternius Farm Animals Animated（CC0；动画仅 Idle/Jump，其余姿态程序化弥补）
    intro: '憨憨的小猪，特别特别能吃，吃饱就心情超好，最大的梦想是睡到自然醒。',
    personality: ['憨厚', '吃货', '心宽体胖'],
    traits: {
      metabolism: 1.8, // 最贪吃
      hygieneDecay: 1.3, // 爱打滚
      illnessRate: 1.1,
      recovery: 0.8,
      growthSpeed: 1.1,
      moodVolatility: 0.7, // 心宽
      sociability: 0.9,
      snackLove: 1.8,
      bathMood: 8 // 最爱洗澡（泥巴浴也算）
    },
    schedule: { sleep: [[12, 15], [21, 7]] },
    behaviors: { idle: 0.8, wander: 0.7, sleep: 1.6, play: 0.9, beg: 1.3, groom: 0.7, stare: 0.8 },
    look: {
      body: '#F9B6C0',
      belly: '#FBDCE2',
      accent: '#E88AA0',
      ear: 'round',
      tail: 'curly',
      snout: 'pig',
      extra: 'tusks'
    },
    quips: [
      '哼哼～', '肚子在唱歌。', '梦里全是好吃的。', '再睡五分钟……',
      '零食！零食！！', '吃得好就是幸福。', '打个滚，尘土都香香的。'
    ]
  },
  'dino-monster': {
    id: 'dino-monster',
    name: '霸王龙',
    emoji: '🦖',
    builtin: true,
    model: 'trex', // Quaternius Animated LowPoly Dinosaurs（CC0，6 段骨骼动画）
    intro: '来自远古电流的神秘霸王龙：长得飞快、夜里活跃，情绪上来会小小暴走，但它其实很温柔。',
    personality: ['神秘', '远古血脉', '温柔暴走'],
    traits: {
      metabolism: 1.5,
      hygieneDecay: 1.0,
      illnessRate: 0.8,
      recovery: 0.7, // 远古伤病难愈
      growthSpeed: 2.2, // 长得飞快
      moodVolatility: 1.5, // 会暴走
      sociability: 1.0,
      snackLove: 1.5,
      bathMood: 2
    },
    schedule: { sleep: [[6, 12]] }, // 夜行性：白天睡觉
    behaviors: { idle: 0.7, wander: 1.2, sleep: 0.8, play: 1.5, beg: 0.9, groom: 0.4, stare: 0.6 },
    look: {
      body: '#58B368',
      belly: '#F0DC8A',
      accent: '#E88A3A',
      ear: 'horn',
      tail: 'spikes',
      snout: 'dino',
      extra: 'back-spikes'
    },
    quips: [
      '嗷呜——', '远古的血液在沸腾。', '今晚的月亮看起来很肥。', '咔嚓咔嚓。',
      '我在很久很久以前就认识你了。', '电波里全是我的低吼。'
    ]
  }
}

// ---- 成长阶段 ----
export const STAGES = [
  { key: 'baby', label: '幼年', min: 0, scale: 0.72 },
  { key: 'teen', label: '少年', min: 72, scale: 0.88 },
  { key: 'adult', label: '成年', min: 240, scale: 1.0 },
  { key: 'elder', label: '长寿', min: 720, scale: 0.96 }
]

export function stageOf(growthHours) {
  let cur = STAGES[0]
  for (const s of STAGES) if (growthHours >= s.min) cur = s
  return cur
}

// ---- 物种解析（内置 + 自定义库同权） ----
export function getSpecies(id, customLib = {}) {
  if (BUILTIN_SPECIES[id]) return BUILTIN_SPECIES[id]
  const custom = customLib?.[id]
  if (custom) return clampSpecies(custom)
  return null
}

export function speciesList(customLib = {}) {
  return [...Object.values(BUILTIN_SPECIES), ...Object.values(customLib || {}).map(clampSpecies)]
}

// ---- Schema 钳制：内置合并 → 数值范围钳制（AI / 导入数据必经） ----
const DEFAULT_TRAITS = {
  metabolism: 1.0, hygieneDecay: 1.0, illnessRate: 1.0, recovery: 1.0,
  growthSpeed: 1.0, moodVolatility: 1.0, sociability: 1.0, snackLove: 1.0, bathMood: 0
}

export function clampSpecies(raw) {
  if (!raw || typeof raw !== 'object') return null
  const t = { ...DEFAULT_TRAITS, ...(raw.traits || {}) }
  for (const k of Object.keys(t)) {
    if (k === 'bathMood') continue // bathMood 范围特殊（-10~10），单独钳制
    t[k] = clampNum(t[k], RANGE.min, RANGE.max, DEFAULT_TRAITS[k])
  }
  t.bathMood = clampNum(t.bathMood, -10, 10, 0)

  const behaviors = {}
  const src = raw.behaviors || {}
  for (const k of ['idle', 'wander', 'sleep', 'play', 'beg', 'groom', 'stare']) {
    behaviors[k] = clampWeight(src[k])
  }

  const look = {
    body: clampColor(raw.look?.body, '#8FCF9F'),
    belly: clampColor(raw.look?.belly, '#EAF7EE'),
    accent: clampColor(raw.look?.accent, '#4E9E6E'),
    ear: pick(raw.look?.ear, EAR_STYLES, 'pointed'),
    tail: pick(raw.look?.tail, TAIL_STYLES, 'wag'),
    snout: pick(raw.look?.snout, SNOUT_STYLES, 'cat'),
    extra: pick(raw.look?.extra, EXTRAS, 'none')
  }

  // 3D 模型资产键：仅接受白名单（自定义/AI 物种缺省走「通用狐狸身体 + 染色」）
  const model = MODEL_ASSETS.includes(raw.model) ? raw.model : null

  const id = typeof raw.id === 'string' && /^[\w-]{1,32}$/.test(raw.id) ? raw.id : `custom-${Date.now()}`
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 12) : '神秘生物'

  // 作息：数组对 [起,止)（0-23，可跨夜）；逐项校验
  const sleep = []
  for (const pair of Array.isArray(raw.schedule?.sleep) ? raw.schedule.sleep : [[[13, 16]]]) {
    if (Array.isArray(pair) && pair.length >= 2) {
      const a = clampNum(pair[0], 0, 23, 13) | 0
      const b = clampNum(pair[1], 0, 24, 16) | 0
      if (a !== b) sleep.push([a, b])
    }
  }

  const quips = (Array.isArray(raw.quips) ? raw.quips : [])
    .filter((q) => typeof q === 'string' && q.trim())
    .map((q) => q.trim().slice(0, 40))
    .slice(0, 20)

  return {
    id,
    name,
    emoji: typeof raw.emoji === 'string' && raw.emoji.trim() ? raw.emoji.trim().slice(0, 4) : '🧬',
    builtin: false,
    model,
    intro: typeof raw.intro === 'string' && raw.intro.trim() ? raw.intro.trim().slice(0, 80) : '由 AI 设计的新物种。',
    personality: (Array.isArray(raw.personality) ? raw.personality : [])
      .filter((p) => typeof p === 'string' && p.trim())
      .map((p) => p.trim().slice(0, 12))
      .slice(0, 5),
    traits: t,
    schedule: { sleep: sleep.length ? sleep : [[13, 16]] },
    behaviors,
    look,
    quips: quips.length ? quips : ['……（它神秘地沉默着）']
  }
}

// 是否处于物种作息的睡眠时段
export function isSleepHour(species, hour) {
  for (const [a, b] of species.schedule.sleep) {
    if (a < b ? hour >= a && hour < b : hour >= a || hour < b) return true
  }
  return false
}

// 领养卡片特性摘要（由参数推导，保证与实际数值一致）
export function speciesSummary(species) {
  const t = species.traits
  const bits = []
  bits.push(t.metabolism >= 1.4 ? '很能吃' : t.metabolism <= 0.9 ? '吃得省' : '胃口适中')
  bits.push(t.growthSpeed >= 1.6 ? '长得飞快' : t.growthSpeed <= 0.95 ? '慢慢长大' : '稳步成长')
  bits.push(t.moodVolatility >= 1.3 ? '情绪会暴走' : t.moodVolatility <= 0.8 ? '情绪稳定' : '偶尔闹脾气')
  bits.push(t.sociability >= 1.2 ? '特别黏人' : t.sociability <= 0.95 ? '比较独立' : '喜欢陪伴')
  return bits.join(' · ')
}

// 供 AI 人设的文本化描述
export function speciesPromptText(species) {
  const t = species.traits
  return `${species.name}（${species.personality.join('、')||'性格未知'}）。` +
    `代谢${t.metabolism}、恢复力${t.recovery}、成长速度${t.growthSpeed}、情绪波动${t.moodVolatility}、社交需求${t.sociability}。`
}

export { isBehavior }
