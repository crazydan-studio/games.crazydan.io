// ============ Babylon 3D 资产清单（纯数据模块，Node 可单测） ============
// 全部资产位于 public/tiantian-dianchong/assets/b3d/（CC0，来源与许可见 ATTRIBUTION.md）：
//   · Quaternius —— 宠物/自然/窗户/玩具（quaternius.com）
//   · KayKit（Kay Lousberg）—— 家具与食物道具（kaylousberg.itch.io）
// 加载与缓存策略：Babylon SceneLoader.ImportMeshAsync 按需加载 + 模块级 Map 缓存，
// 经浏览器缓存与 SW「缓存优先」策略，离线可玩。

// ---- 宠物模型（family 决定动画映射表） ----
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
  pig: {
    file: 'pets/pig.glb',
    family: 'farm',
    label: '猪猪',
    targetHeight: 0.9
  },
  trex: {
    file: 'pets/trex.glb',
    family: 'trex',
    label: '霸王龙',
    targetHeight: 1.5
  }
}

// 自定义/AI 物种无预设模型：通用狐狸身体 + look.body 染色
export const GENERIC_PET_MODEL = 'fox'

// ---- 场景道具模型（type 对齐 core/scenes.js 的 PROP_TYPES） ----
// anchor: 该类道具落在宠物行走线（z 固定），动作系统可接近
export const PROP_MODELS = {
  bed: { file: 'home/bed_single_A.glb', anchor: true, scale: 1.0 },
  sofa: { file: 'home/couch.glb', scale: 1.0 },
  lamp: { file: 'home/lamp_standing.glb', scale: 1.0 },
  rug: { file: 'home/rug_oval_A.glb', scale: 1.0 },
  table: { file: 'home/table_medium.glb', scale: 1.0 },
  chair: { file: 'home/chair_A.glb', scale: 1.0 },
  shelf: { file: 'home/shelf_B_small_decorated.glb', scale: 1.0 },
  plant: { file: 'home/cactus_small_A.glb', scale: 1.0 },
  window: { file: 'home/window.glb', scale: 1.0, wall: true },
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

/** 物种 → 3D 模型键（无预设模型的自定义/AI 物种回落通用身体+染色） */
export function modelKeyOf(species) {
  const key = species?.model
  if (key && PET_MODELS[key]) return { key, tint: null }
  return { key: GENERIC_PET_MODEL, tint: species?.look?.body || null }
}
