// ============ Babylon 3D 资产清单（纯数据模块，Node 可单测） ============
// 全部资产位于 public/tiantian-dianchong/assets/b3d/（CC0，来源与许可见 ATTRIBUTION.md）：
//   · Quaternius Ultimate Animated Animals —— 宠物建模（quaternius.com/packs/ultimateanimatedanimals.html）
//   · Quaternius Ultimate Monsters —— 怪兽建模（quaternius.com/packs/ultimatemonsters.html）
//   · KayKit Restaurant Bits（Kay Lousberg）—— 室内场景与食物道具（kaylousberg.itch.io/restaurant-bits）
//   · Quaternius Simple Nature —— 室外自然装饰（quaternius.com）
// 加载与缓存策略：Babylon SceneLoader.ImportMeshAsync 按需加载 + 模块级 Map 缓存，
// 经浏览器缓存与 SW「缓存优先」策略，离线可玩。
//
// ⚠ 本游戏不做建模降级/回退：物种必须绑定 PET_MODELS 白名单内的模型，
//   渲染层 modelKeyOf 严格解析，无预设模型直接抛错（不静默替换为通用身体）。

// ---- 宠物模型（family 决定动画映射表） ----
// UAA 两种骨架代际：uaa = 12 动画老词汇（Attack/Idle_2_HeadLow/Jump_ToIdle）；
// uaa2 = 13 动画新词汇（Attack_Headbutt/Attack_Kick/Idle_Headlow/Jump_toIdle）
export const PET_MODELS = {
  fox: {
    file: 'pets/fox.glb',
    family: 'uaa',
    label: '小狐狸',
    targetHeight: 1.05
  },
  shibainu: {
    file: 'pets/shibainu.glb',
    family: 'uaa',
    label: '柴犬',
    targetHeight: 1.0
  },
  alpaca: {
    file: 'pets/alpaca.glb',
    family: 'uaa2',
    label: '羊驼',
    targetHeight: 1.15
  },
  dragon: {
    file: 'pets/dragon.glb',
    family: 'monster',
    label: '小飞龙',
    targetHeight: 1.3
  }
}

// ---- 场景道具模型（type 对齐 core/scenes.js 的 PROP_TYPES） ----
// anchor: 该类道具落在宠物行走线（z 固定），动作系统可接近
// yOff:   模型原点高于/低于贴地面时的高度补偿（乘以最终缩放）
// scale:  原始包围盒（KayKit 模型普遍 0.5-4 米）到舞台尺度的换算
export const PROP_MODELS = {
  table: {
    file: 'home/table_round_A.glb', scale: 0.62,
    variants: ['home/table_round_B.glb']
  },
  chair: {
    file: 'home/chair_A.glb', scale: 0.9,
    variants: ['home/chair_B.glb', 'home/chair_stool.glb']
  },
  counter: { file: 'home/kitchencounter_straight_A.glb', scale: 0.78 },
  stove: { file: 'home/stove_single.glb', scale: 0.72 },
  fridge: { file: 'home/fridge_A.glb', scale: 0.6, yOff: 0.8 },
  menu: { file: 'home/menu.glb', scale: 1.3 },
  crate: {
    file: 'home/crate_buns.glb', scale: 0.5,
    variants: ['home/crate_carrots.glb', 'home/crate_cheese.glb']
  },
  floor: { file: 'home/floor_kitchen.glb', scale: 0.95, yOff: -0.5 },
  window: { file: 'home/wall_window_open.glb', scale: 0.85, wall: true },
  tree: { file: 'nature/tree1.glb', scale: 1.0, variants: ['nature/tree2.glb', 'nature/tree3.glb', 'nature/tree4.glb'] },
  bush: { file: 'nature/bush1.glb', scale: 1.0, variants: ['nature/bush2.glb', 'nature/bush3.glb'] },
  flower: { file: 'nature/grass1.glb', scale: 0.8, variants: ['nature/grass2.glb'] },
  rock: { file: 'nature/rock1.glb', scale: 1.0, variants: ['nature/rock2.glb', 'nature/rock3.glb'] },
  bowl: { file: 'props/bowl.glb', anchor: true, scale: 1.0 }
}

// ---- 交互道具（投掷物：drag & throw） ----
// kind: food=投喂(走过去吃) toy=玩耍(追过去玩)
export const THROW_ITEMS = {
  burger: { file: 'props/food_burger.glb', kind: 'food', action: 'feed', label: '汉堡', emoji: '🍔', scale: 0.55 },
  carrot: { file: 'props/food_ingredient_carrot.glb', kind: 'food', action: 'snack', label: '胡萝卜', emoji: '🥕', scale: 0.6 },
  cheese: { file: 'props/food_ingredient_cheese.glb', kind: 'food', action: 'snack', label: '芝士', emoji: '🧀', scale: 0.6 },
  bone: { file: 'props/bone.glb', kind: 'toy', action: 'play', label: '玩具骨头', emoji: '🦴', scale: 0.7 },
  chicken: { file: 'props/chicken-leg.glb', kind: 'food', action: 'feed', label: '鸡腿', emoji: '🍗', scale: 0.7 }
}

/** 资产基础地址（相对当前页面，兼容子路径部署与 dev 虚拟入口） */
export function assetBaseUrl() {
  return new URL('assets/b3d/', document.baseURI).href
}

/**
 * 物种 → 3D 模型键（严格解析，无回退）
 * 物种必须绑定 PET_MODELS 白名单内的 model（内置物种与 AI 物种同规），
 * 否则抛错 —— 由上层以加载失败呈现（等待遮罩/错误提示），绝不静默换模型。
 */
export function modelKeyOf(species) {
  const key = species?.model
  const def = key ? PET_MODELS[key] : null
  if (!def) {
    throw new Error(`物种「${species?.name || '未知'}」未绑定有效的 3D 模型（model=${key ?? '空'}）`)
  }
  return { key, def }
}
