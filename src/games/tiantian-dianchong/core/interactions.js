// ============ 宠物间交互总线（预留接口） ============
// 当前游戏仅支持单个宠物，本模块为「多宠物」开放后的交互接线而预留：
//   · registerPetInteraction(type, handler) 注册交互类型
//   · runPetInteraction(actor, target, type, payload) 执行交互
//   · 内置三个演示 handler：greet / playTogether / shareFood
// 多宠物扩展点（见设计文档 §3.8）：store.pet → pets[]，舞台渲染多只，
// UI 调 runPetInteraction 即通；handler 返回交互结果与状态影响。

const handlers = new Map()

export function registerPetInteraction(type, handler) {
  if (typeof type !== 'string' || typeof handler !== 'function') return false
  handlers.set(type, handler)
  return true
}

export function listPetInteractions() {
  return [...handlers.keys()]
}

export async function runPetInteraction(actor, target, type, payload = {}) {
  const handler = handlers.get(type)
  if (!handler) return { ok: false, error: `未注册的交互类型：${type}` }
  if (!actor || !target) return { ok: false, error: '交互双方不完整' }
  try {
    const result = await handler(actor, target, payload)
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ---- 内置演示交互（多宠物开放后可直接接线） ----
const BUILTIN = {
  // 打招呼：双方心情小幅提升
  greet: (actor, target) => {
    actor.mood = Math.min(100, actor.mood + 4)
    target.mood = Math.min(100, target.mood + 4)
    return { text: `${actor.name} 和 ${target.name} 碰了碰鼻尖，互相问了好` }
  },
  // 一起玩：双方心情大幅提升，消耗体力和清洁
  playTogether: (actor, target) => {
    for (const p of [actor, target]) {
      p.mood = Math.min(100, p.mood + 14)
      p.hunger = Math.max(0, p.hunger - 5)
      p.hygiene = Math.max(0, p.hygiene - 3)
    }
    return { text: `${actor.name} 和 ${target.name} 追逐打闹，玩得不亦乐乎` }
  },
  // 分享食物：施与者饱食度转移
  shareFood: (actor, target) => {
    const share = Math.min(20, actor.hunger * 0.25)
    actor.hunger -= share
    target.hunger = Math.min(100, target.hunger + share)
    return { text: `${actor.name} 把食物分给了 ${target.name} 一半` }
  }
}

for (const [type, handler] of Object.entries(BUILTIN)) registerPetInteraction(type, handler)

export const BUILTIN_PET_INTERACTIONS = Object.keys(BUILTIN)
