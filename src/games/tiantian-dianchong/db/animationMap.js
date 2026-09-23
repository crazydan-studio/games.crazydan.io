// ============ 动作 → DragonBones 动画映射 ============
// 动作系统发出的是「逻辑动画名」（ACTIONS.anim 词汇：idle/walk/stare/beg/
// groom/sleep/wake/eat/play/wash/medicine/pet/happy/sad/shiver/coma/dead）。
// 程序化生成的骨架拥有全部同名动画（恒等映射）；预设资产（猫/狗/恐龙）的
// 动画词汇不同，需要映射表 + 兜底链：
//   · 条目可为字符串（动画名）或 { name, rate?, lie?, dim?, jitter?, once? }
//     - rate   播放速率（0.4 = 慢放，营造睡意；0 = 冻结）
//     - lie    容器旋转角（80/90 = 侧卧，弥补无卧姿动画的预设资产）
//     - dim    整体不透明度（昏迷/死亡的暗化）
//     - jitter 渲染层横向颤动幅度（寒颤）
//     - once   播放一次并保持末帧（fall/倒地类，循环重播会「反复摔」）
//   · 兜底链：映射名缺失时依次尝试通用候选，最后回落首动画
//
// 映射依据（对猫/狗 bahama 资产逐帧目检）：
//   walk→skating（踩滑板滑向食盆）/ medicine→drinking（举杯喝药）/
//   pet→hifi（张开手臂求抱抱）/ groom→blowing（照镜子吹气）/
//   beg→collecting（抱福袋讨好）/ play→dance（撒欢跳舞）
// 恐龙（dragon_boy）：walk/jump/fall 原生动画，fall 兼作睡卧。

const TALKING_PET = {
  idle: 'idle',
  walk: 'skating',
  stare: 'talking',
  beg: 'collecting',
  groom: 'blowing',
  sleep: { name: 'idle', rate: 0.42, lie: 82 },
  wake: 'popup',
  eat: 'eating',
  play: 'dance',
  wash: 'face_happy',
  medicine: 'drinking',
  pet: 'hifi',
  happy: 'joy',
  sad: 'sad',
  shiver: { name: 'sad', jitter: 2.4 },
  coma: { name: 'idle', rate: 0.14, lie: 90, dim: 0.62 },
  dead: { name: 'idle', rate: 0, lie: 90, dim: 0.5, once: true }
}

const DRAGON_BOY = {
  idle: 'stand',
  walk: 'walk',
  stare: 'stand',
  beg: 'jump',
  groom: 'stand',
  sleep: { name: 'fall', rate: 0.42, once: true },
  wake: 'jump',
  eat: 'jump',
  play: 'jump',
  wash: 'jump',
  medicine: 'jump',
  pet: 'jump',
  happy: 'jump',
  sad: 'fall',
  shiver: { name: 'fall', jitter: 2.0, once: true },
  coma: { name: 'fall', rate: 0.12, dim: 0.62, once: true },
  dead: { name: 'fall', rate: 0, dim: 0.5, once: true }
}

// 资产键 → 映射表
export const ANIM_MAP = {
  cat: TALKING_PET,
  dog: TALKING_PET,
  dino: DRAGON_BOY
}

// 兜底候选（按序尝试，最终回落 available[0]）
const FALLBACK_CHAINS = {
  walk: ['walk', 'skating', 'jumping', 'jump', 'run', 'move'],
  sleep: ['sleep', 'fall', 'lie', 'idle'],
  eat: ['eat', 'eating', 'face_eating'],
  play: ['play', 'dance', 'jumping', 'jump'],
  sad: ['sad', 'face_wrong', 'fall'],
  happy: ['happy', 'joy', 'laugh', 'face_happy', 'jumping', 'jump']
}

const NORMALIZE = (entry) => (typeof entry === 'string' ? { name: entry } : { ...entry })

/**
 * 解析逻辑动画名 → 该资产实际播放配置
 * @param {string} assetKey 预设资产键（cat/dog/dino）或 'procedural'
 * @param {string[]} available 该骨架可用的动画名列表
 * @param {string} logical 动作系统的逻辑动画名
 * @returns {{ name: string, rate: number, lie: number, dim: number, jitter: number, once: boolean }}
 */
export function resolveAnim(assetKey, available, logical) {
  const set = new Set(available)
  const first = available[0] || 'idle'

  // 程序化骨架：恒等映射（全部逻辑名都存在）
  const entry = assetKey === 'procedural' || !ANIM_MAP[assetKey]
    ? { name: logical }
    : NORMALIZE(ANIM_MAP[assetKey][logical] ?? logical)

  // 兜底链
  if (!set.has(entry.name)) {
    const chain = FALLBACK_CHAINS[logical] || []
    const hit = chain.find((n) => set.has(n))
    if (hit) entry.name = hit
    else if (set.has(logical)) entry.name = logical
    else entry.name = first
  }

  return {
    name: entry.name,
    rate: entry.rate ?? 1,
    lie: entry.lie ?? 0,
    dim: entry.dim ?? 1,
    jitter: entry.jitter ?? 0,
    once: !!entry.once
  }
}
