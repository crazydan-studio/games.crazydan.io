// ============ 逻辑动画 → 3D 动画映射（纯逻辑模块，Node 可单测） ============
// 动作系统产出 17 个逻辑动画名（ACTIONS.anim）；不同模型家族的实际动画词汇不同，
// 本模块解析出「实际动画名 + 姿态变换配置」：
//   · name  实际 AnimationGroup 名
//   · rate  播放速率（睡眠慢放 / 兴奋加速）
//   · once  只播放一次并保持（倒地/死亡类）
//   · lie   躺卧旋转角（度，绕 Z 轴向侧面倒下——弥补无睡姿动画的模型）
//   · dim   整体明暗（0-1，昏迷/死亡暗化）
//   · jitter 位移抖动幅度（米，寒颤抖动）
//   · sink  站姿下沉/抬升（米，睡眠贴地）
// 解析失败时走兜底链：家族专属 → 家族 idle → 冻结。

// ---- 模型家族的动画词汇（与 GLB 内 AnimationGroup 名一致，单测对照真实资产校验） ----
export const FAMILY_ANIMS = {
  // Quaternius Ultimate Animated Animals（fox / shibainu）
  uaa: [
    'AnimalArmature|Attack', 'AnimalArmature|Death', 'AnimalArmature|Eating',
    'AnimalArmature|Gallop', 'AnimalArmature|Gallop_Jump', 'AnimalArmature|Idle',
    'AnimalArmature|Idle_2', 'AnimalArmature|Idle_2_HeadLow',
    'AnimalArmature|Idle_HitReact_Left', 'AnimalArmature|Idle_HitReact_Right',
    'AnimalArmature|Jump_ToIdle', 'AnimalArmature|Walk'
  ],
  // Quaternius Farm Animals（pig，仅两段）
  farm: ['Armature|Idle', 'Armature|Jump'],
  // Quaternius Dinosaurs（trex）
  trex: [
    'Armature|TRex_Attack', 'Armature|TRex_Death', 'Armature|TRex_Idle',
    'Armature|TRex_Jump', 'Armature|TRex_Run', 'Armature|TRex_Walk'
  ]
}

const NOOP = { name: '', rate: 0, once: false }

// ---- 家族映射表：逻辑动画 → 姿态配置 ----
const FAMILY_MAPS = {
  uaa: {
    idle: { name: 'AnimalArmature|Idle' },
    walk: { name: 'AnimalArmature|Walk' },
    stare: { name: 'AnimalArmature|Idle_2_HeadLow', rate: 0.7 },
    beg: { name: 'AnimalArmature|Gallop_Jump', rate: 0.8 },
    groom: { name: 'AnimalArmature|Idle_2', rate: 1.1 },
    sleep: { name: 'AnimalArmature|Idle', rate: 0.32, lie: 78, sink: 0.16 },
    wake: { name: 'AnimalArmature|Jump_ToIdle', once: true },
    eat: { name: 'AnimalArmature|Eating' },
    play: { name: 'AnimalArmature|Attack', rate: 1.15 },
    wash: { name: 'AnimalArmature|Idle_HitReact_Left', rate: 1.5 },
    medicine: { name: 'AnimalArmature|Idle_2_HeadLow', rate: 0.55 },
    pet: { name: 'AnimalArmature|Gallop_Jump', rate: 0.9 },
    happy: { name: 'AnimalArmature|Gallop_Jump', rate: 1.25 },
    sad: { name: 'AnimalArmature|Idle_2_HeadLow', rate: 0.5 },
    shiver: { name: 'AnimalArmature|Idle_HitReact_Left', rate: 1.8, jitter: 0.022 },
    coma: { name: 'AnimalArmature|Death', rate: 0.12, dim: 0.72, sink: 0.1 },
    dead: { name: 'AnimalArmature|Death', rate: 0.6, once: true, dim: 0.55, sink: 0.12 }
  },
  farm: {
    // 猪仅 Idle/Jump：行走=欢快蹦跳，睡觉=慢放+躺卧，进食=加速拱食
    idle: { name: 'Armature|Idle' },
    walk: { name: 'Armature|Jump', rate: 2.1 },
    stare: { name: 'Armature|Idle', rate: 0.6 },
    beg: { name: 'Armature|Jump', rate: 1.1 },
    groom: { name: 'Armature|Idle', rate: 1.4 },
    sleep: { name: 'Armature|Idle', rate: 0.3, lie: 82, sink: 0.18 },
    wake: { name: 'Armature|Jump', rate: 0.8, once: true },
    eat: { name: 'Armature|Idle', rate: 1.6, sink: 0.06 },
    play: { name: 'Armature|Jump', rate: 1.35 },
    wash: { name: 'Armature|Jump', rate: 1.8 },
    medicine: { name: 'Armature|Idle', rate: 0.5 },
    pet: { name: 'Armature|Jump', rate: 0.85 },
    happy: { name: 'Armature|Jump', rate: 1.25 },
    sad: { name: 'Armature|Idle', rate: 0.42 },
    shiver: { name: 'Armature|Idle', rate: 2.2, jitter: 0.02 },
    coma: { name: 'Armature|Idle', rate: 0.1, dim: 0.72, lie: 80, sink: 0.14 },
    dead: { name: 'Armature|Idle', rate: 0, once: true, dim: 0.5, lie: 88, sink: 0.16 }
  },
  trex: {
    idle: { name: 'Armature|TRex_Idle' },
    walk: { name: 'Armature|TRex_Walk' },
    stare: { name: 'Armature|TRex_Idle', rate: 0.55 },
    beg: { name: 'Armature|TRex_Jump', rate: 0.8 },
    groom: { name: 'Armature|TRex_Idle', rate: 1.3 },
    sleep: { name: 'Armature|TRex_Idle', rate: 0.3, lie: 72, sink: 0.2 },
    wake: { name: 'Armature|TRex_Jump', once: true },
    eat: { name: 'Armature|TRex_Attack', rate: 0.8 },
    play: { name: 'Armature|TRex_Attack', rate: 1.2 },
    wash: { name: 'Armature|TRex_Jump', rate: 1.6 },
    medicine: { name: 'Armature|TRex_Idle', rate: 0.5 },
    pet: { name: 'Armature|TRex_Jump', rate: 0.75 },
    happy: { name: 'Armature|TRex_Jump', rate: 1.15 },
    sad: { name: 'Armature|TRex_Idle', rate: 0.4 },
    shiver: { name: 'Armature|TRex_Idle', rate: 2.0, jitter: 0.025 },
    coma: { name: 'Armature|TRex_Death', rate: 0.12, dim: 0.72, sink: 0.12 },
    dead: { name: 'Armature|TRex_Death', rate: 0.5, once: true, dim: 0.55, sink: 0.14 }
  }
}

// 兜底链：家族内逐级回退
const FAMILY_FALLBACK = {
  uaa: ['AnimalArmature|Idle'],
  farm: ['Armature|Idle'],
  trex: ['Armature|TRex_Idle']
}

/**
 * 解析逻辑动画（动作系统词汇）→ 实际动画 + 姿态配置
 * @param {string} family 模型家族（uaa / farm / trex）
 * @param {string[]} available 该模型实际存在的动画名列表
 * @param {string} logical 逻辑动画名（ACTIONS.anim）
 * @returns {{ name, rate, once, lie, dim, jitter, sink }}
 */
export function resolveAnim(family, available, logical) {
  const list = Array.isArray(available) ? available : []
  const has = (n) => list.includes(n)
  const map = FAMILY_MAPS[family] || FAMILY_MAPS.uaa
  const cfg = map[logical]
  if (cfg && has(cfg.name)) return { ...cfg }
  // 指定动画缺失 → 家族兜底链
  for (const fb of FAMILY_FALLBACK[family] || FAMILY_FALLBACK.uaa) {
    if (has(fb)) return { name: fb, rate: 0, once: false }
  }
  // 完全没有可用动画 → 冻结（保持姿势）
  return { ...NOOP }
}

/** 家族列表（校验用） */
export function families() {
  return Object.keys(FAMILY_MAPS)
}
