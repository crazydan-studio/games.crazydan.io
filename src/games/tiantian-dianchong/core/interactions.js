// ============ 交互系统：宠物与外界的一切互动入口 ============
// 以「交互器 (Interactor)」为统一抽象：
//   · user  用户交互器——当前主角：喂食/零食/玩耍/洗澡/喂药/哄睡/摸头，
//           校验+结算（core/actions.js）后派发指令驱动动作系统
//   · scene 场景交互器——已提供锚点（食盆/床铺位置，从场景 props 提取），
//           后续可扩展：场景氛围影响心情、昼夜事件等
//   · prop  道具交互器——预留：玩具球/逗猫棒/食物碗等道具点击 → 指令
//   · pet   宠物交互器——预留：多宠物开放后的 greet/playTogether/shareFood
//           （原宠物间交互总线 API 原样保留，测试与旧调用不受影响）
//
// 交互器约定：request(...) 负责校验与状态结算，然后把「身体该做什么」
// 抽象成指令发给总线——交互系统从不直接操纵动作或渲染。

import { performAction } from './actions.js'
import { PRIORITIES } from './commands.js'
import { getScene } from './scenes.js'

// 用户操作 → 动作名（动作系统词汇）
const USER_ACTION_MAP = {
  feed: 'eat', snack: 'snack', play: 'play',
  bathe: 'bathe', medicine: 'medicine', sleep: 'sleep'
}

// 场景锚点来源：props 里的功能性物件位置（0-100 舞台坐标）
const ANCHOR_PROPS = { food: 'bowl', bed: 'bed' }

/**
 * 创建交互系统
 * @param {object} opts
 *   bus: 指令总线
 *   getSave / getSpecies / now: 环境读取
 *   onResult({ actionId, ok, message, event }): 用户操作结果（UI 呈现）
 */
export function createInteractionSystem({ bus, getSave, getSpecies, now = () => Date.now(), onResult = () => {} } = {}) {
  const interactors = new Map()

  // ---------- 用户交互器 ----------
  const user = {
    id: 'user',
    capabilities: ['feed', 'snack', 'play', 'bathe', 'medicine', 'sleep', 'pet'],

    /** 六大照料操作：结算状态 → 派发动作指令 */
    request(actionId) {
      const s = getSave()
      if (!s || !s.pet) return { ok: false, message: '还没有宠物' }
      const sp = getSpecies()
      if (!sp) return { ok: false, message: '物种数据缺失' }

      const r = performAction(s.pet, sp, actionId, s.gameClock)
      if (r.ok) {
        const action = USER_ACTION_MAP[actionId]
        if (action) {
          bus.send('act', { action }, { source: 'user', priority: PRIORITIES.user, reason: `玩家操作：${actionId}` })
        }
      }
      onResult({ actionId, ...r })
      return r
    },

    /** 摸头彩蛋：纯心情微调 + 撒娇动作 */
    petTouch({ moodGain = 2 } = {}) {
      const s = getSave()
      if (!s || !s.pet || s.pet.dead || s.pet.coma) return { ok: false }
      s.pet.mood = Math.min(100, s.pet.mood + moodGain)
      bus.send('act', { action: 'pet' }, { source: 'user', priority: PRIORITIES.user, reason: '摸头杀' })
      return { ok: true }
    }
  }

  // ---------- 场景交互器（锚点 + 预留扩展） ----------
  const scene = {
    id: 'scene',
    capabilities: ['anchors'],
    /** 场景锚点：动作系统据此决定「先走到哪再执行」（道具坐标 0-1 → 舞台 0-100） */
    anchors() {
      const s = getSave()
      if (!s) return {}
      const sceneDef = getScene(s.settings?.sceneId, s.customScenes)
      if (!sceneDef?.props) return {}
      const out = {}
      for (const [key, propType] of Object.entries(ANCHOR_PROPS)) {
        const prop = sceneDef.props.find((p) => p.type === propType)
        if (prop && Number.isFinite(prop.x)) out[key] = Math.round(prop.x * 100)
      }
      return out
    },
    /** 预留：场景氛围/昼夜对宠物的影响（未来：心情修正、事件指令） */
    ambientEffect() {
      return null
    }
  }

  // ---------- 道具交互器（预留） ----------
  const prop = {
    id: 'prop',
    capabilities: [],
    /** 预留：道具使用（玩具球→play、食物碗→eat、窝→sleep） */
    use(/* propId, payload */) {
      return { ok: false, message: '道具系统尚未开放' }
    }
  }

  // ---------- 宠物交互器（多宠物预留，包装既有总线） ----------
  const pet = {
    id: 'pet',
    capabilities: ['greet', 'playTogether', 'shareFood'],
    /** 预留：多宠物开放后由 UI 调用；当前单宠物直接拒绝 */
    interact(actor, target, type, payload) {
      if (!actor || !target || actor === target) {
        return { ok: false, message: '当前只有一只宠物，暂时无法与同伴互动' }
      }
      return runPetInteraction(actor, target, type, payload)
    }
  }

  function registerInteractor(interactor) {
    if (!interactor || typeof interactor.id !== 'string') return false
    interactors.set(interactor.id, interactor)
    return true
  }

  for (const it of [user, scene, prop, pet]) registerInteractor(it)

  return {
    user,
    scene,
    prop,
    pet,
    interactors: () => [...interactors.values()],
    get: (id) => interactors.get(id) || null
  }
}

// ============================================================
// 宠物间交互总线（原模块 API，完整保留：多宠物开放后直接接线）
// ============================================================

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
  greet: (actor, target) => {
    actor.mood = Math.min(100, actor.mood + 4)
    target.mood = Math.min(100, target.mood + 4)
    return { text: `${actor.name} 和 ${target.name} 碰了碰鼻尖，互相问了好` }
  },
  playTogether: (actor, target) => {
    for (const p of [actor, target]) {
      p.mood = Math.min(100, p.mood + 14)
      p.hunger = Math.max(0, p.hunger - 5)
      p.hygiene = Math.max(0, p.hygiene - 3)
    }
    return { text: `${actor.name} 和 ${target.name} 追逐打闹，玩得不亦乐乎` }
  },
  shareFood: (actor, target) => {
    const share = Math.min(20, actor.hunger * 0.25)
    actor.hunger -= share
    target.hunger = Math.min(100, target.hunger + share)
    return { text: `${actor.name} 把食物分给了 ${target.name} 一半` }
  }
}

for (const [type, handler] of Object.entries(BUILTIN)) registerPetInteraction(type, handler)

export const BUILTIN_PET_INTERACTIONS = Object.keys(BUILTIN)
