// ============ 生命系统运行时：宠物内在的独立驱动 ============
// 把「宠物自己的意志」从 UI 编排中剥离：时间引擎推进、行为决策、
// 生理节律（入睡/醒来）、生死事件，全部在这里驱动，并以指令形式
// 送入指令总线——生命系统不认识动作系统，也不认识渲染层。
//
// 双生命系统在此切换：
//   · decideRandom（内置随机，离线可用，兼 AI 降级兜底）
//   · decideAi（AI 智能体，失败自动降级随机 + 连续失败冷却）

import { advance, isAsleep } from './life.js'
import { BEHAVIOR_TO_ACTION, PRIORITIES } from './commands.js'

const SHIVER_CHANCE = 0.25 // 生病时每次决策的寒颤概率

/**
 * 创建生命系统运行时
 * @param {object} opts
 *   getSave(): 存档（含 pet/species 引用与 gameClock）
 *   getSpecies(): 当前物种定义
 *   bus: 指令总线（send/dispatch）
 *   decide(pet, species, clock): 异步决策 → { behavior, say, source }
 *   onEvents(events): 生命引擎事件（日志/弹层由 UI 消费）
 *   onSay(say, fromAi): 心声气泡
 *   now(): 可注入时钟
 */
export function createLifeRuntime({
  getSave, getSpecies, bus, decide, onEvents = () => {}, onSay = () => {}, now = () => Date.now()
} = {}) {
  let lastAsleep = null
  let lastIllness = false

  /** 生理状态监视：入睡/醒来/生病/痊愈/昏迷/死亡 → 关键指令 */
  function watchPhysiology() {
    const s = getSave()
    if (!s || !s.pet) return
    const sp = getSpecies()
    if (!sp) return
    const pet = s.pet
    const clock = s.gameClock

    if (pet.dead) {
      if (state.lastDead !== true) {
        state.lastDead = true
        bus.send('act', { action: 'dead' }, { source: 'system', priority: PRIORITIES.critical, reason: '生命终止' })
      }
      return
    }
    state.lastDead = false

    const asleep = isAsleep(pet, sp, clock)
    if (lastAsleep !== null && asleep !== lastAsleep) {
      if (asleep) {
        bus.send('act', { action: 'sleep' }, { source: 'life', priority: PRIORITIES.routine, reason: '作息时间到，自然入睡' })
      } else {
        bus.send('act', { action: 'wake' }, { source: 'life', priority: PRIORITIES.routine, reason: '睡饱了，自然醒来' })
      }
    }
    lastAsleep = asleep

    // 昏迷 ⇆ 苏醒（引擎事件也会来一份文本，这里只管身体）
    if (pet.coma && state.lastComa !== true) {
      bus.send('act', { action: 'coma' }, { source: 'system', priority: PRIORITIES.critical, reason: '健康耗尽，陷入昏迷' })
    }
    state.lastComa = !!pet.coma

    // 病中偶发寒颤（生病期间的可见体感）
    if (pet.illness && !asleep && !pet.coma) {
      if (Math.random() < SHIVER_CHANCE) {
        bus.send('act', { action: 'shiver' }, { source: 'life', priority: PRIORITIES.ambient, reason: `病中寒颤（${pet.illness.name}）` })
      }
    }
    lastIllness = !!pet.illness
  }

  const state = { lastDead: false, lastComa: false }

  /**
   * 时间引擎泵（UI 每秒调用一次）：推进生命演化并监视生理。
   * @returns 生命引擎事件数组（由调用方写日志/弹层）
   */
  function pump() {
    const s = getSave()
    if (!s) return []
    const events = advance(s, now())
    if (events.length) onEvents(events)
    watchPhysiology()
    return events
  }

  /**
   * 行为决策循环（UI 的行为定时器调用）：问询双生命系统并派发指令。
   * 睡眠/昏迷/死亡期间跳过行为决策（生理监视已接管身体）。
   */
  async function decideOnce() {
    const s = getSave()
    if (!s || !s.pet || s.pet.dead || (typeof document !== 'undefined' && document.hidden)) return
    const sp = getSpecies()
    if (!sp) return
    const pet = s.pet
    const clock = s.gameClock

    // 生理性睡眠中：不打扰决策（梦话由决策器自己给）
    if (pet.coma) return

    const result = await decide(pet, sp, clock)
    if (!result) return
    const { behavior, say } = result
    if (say) onSay(say, result.source === 'ai')

    const action = BEHAVIOR_TO_ACTION[behavior]
    if (!action) return
    // 自然入睡交给生理监视（routine 优先级）；行为决策只派发清醒行为
    if (action === 'sleep') return
    bus.send('act', { action }, {
      source: 'life',
      priority: PRIORITIES.ambient,
      reason: `${result.source === 'ai' ? 'AI' : '随机'}生命系统：${behavior}`
    })

    // 心情低落的身体语言：难过姿态优先于普通行为（状态→指令的直观体现）
    if (pet.mood < 20 && !isAsleep(pet, sp, clock) && !pet.coma) {
      bus.send('act', { action: 'sad' }, {
        source: 'life',
        priority: PRIORITIES.ambient,
        reason: `心情低落（${Math.round(pet.mood)}/100）`
      })
    }
  }

  /** 载入/恢复时的身体对齐：按当前生理状态发出初始指令 */
  function bootstrap() {
    const s = getSave()
    if (!s || !s.pet) return
    const sp = getSpecies()
    if (!sp) return
    lastAsleep = null
    state.lastDead = false
    state.lastComa = false
    if (s.pet.dead) {
      bus.send('act', { action: 'dead' }, { source: 'system', priority: PRIORITIES.critical, reason: '载入：已逝去' })
    } else if (s.pet.coma) {
      bus.send('act', { action: 'coma' }, { source: 'system', priority: PRIORITIES.critical, reason: '载入：昏迷中' })
    } else if (isAsleep(s.pet, sp, s.gameClock)) {
      bus.send('act', { action: 'sleep' }, { source: 'life', priority: PRIORITIES.routine, reason: '载入：作息睡眠中' })
      lastAsleep = true
    } else {
      bus.send('act', { action: 'idle' }, { source: 'life', priority: PRIORITIES.ambient, reason: '载入：清醒待命' })
      lastAsleep = false
    }
    state.lastComa = !!s.pet.coma
    state.lastDead = !!s.pet.dead
  }

  return { pump, decideOnce, bootstrap, watchPhysiology }
}
