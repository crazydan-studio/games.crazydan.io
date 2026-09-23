// ============ 生命系统引擎 ============
// 纯函数式推进（就地修改 save，返回新产生的事件）：
//   advance(save, realNow) → events[]
// 所有状态按「游戏小时」步进；离线补偿按 ≤6h 分块推进，上限 90 游戏日。

import { HOUR, DAY, hourOfDay, dayOf, fmtGameSpan, periodOfDay } from './time.js'
import { getSpecies, stageOf, isSleepHour } from './species.js'

// ---- 单次离线结算上限（90 游戏日）：超出部分丢弃，避免超大数值跳变 ----
export const OFFLINE_CAP_MS = 90 * DAY

// ---- 病种 ----
const ILLNESSES = [
  { id: 'cold', name: '小感冒' },
  { id: 'tummy', name: '肠胃不适' },
  { id: 'rash', name: '皮肤过敏' },
  { id: 'fever', name: '发低烧' }
]

export function createPet({ speciesId, name, clock = 0 }) {
  return {
    speciesId,
    name,
    bornClock: clock,
    growth: 0,
    hunger: 92,
    mood: 90,
    hygiene: 95,
    health: 100,
    illness: null, // { id, name, since }
    dead: false,
    coma: false,
    forcedSleepUntil: 0, // 游戏时钟（ms）：哄睡截止
    lastPlayClock: null, // 上次玩耍（游戏时钟 ms）
    cooldowns: {}, // actionId → 到期游戏时钟 ms
    thresholds: {} // 事件键 → 上次触发游戏时钟 ms（防刷屏）
  }
}

export function ageDays(pet, clock) {
  return Math.max(1, Math.floor((clock - pet.bornClock) / DAY) + 1)
}

// ---- 心情目标值：由各项需求综合而来 ----
// clock：当前游戏时钟（ms），用于计算距上次玩耍的时长
export function moodTarget(pet, species, clock = 0) {
  let t = 72
  if (pet.hunger > 60) t += 8
  if (pet.hunger < 25) t -= 30
  if (pet.hunger < 5) t -= 15
  if (pet.hygiene < 30) t -= 12
  if (pet.health < 50) t -= 15
  if (pet.illness) t -= 20
  const sincePlay = pet.lastPlayClock === null ? Infinity : clock - pet.lastPlayClock
  if (sincePlay > 12 * HOUR) t -= 10
  return Math.min(100, Math.max(5, t))
}

// ---- 综合风险评级（供 UI 配色） ----
export function riskLevel(pet) {
  if (pet.dead) return 'gone'
  if (pet.coma) return 'critical'
  if (pet.health < 15 || pet.hunger < 10 || (pet.illness && pet.health < 30)) return 'critical'
  if (pet.health < 40 || pet.hunger < 25 || pet.hygiene < 20 || pet.mood < 20 || pet.illness) return 'warn'
  return 'ok'
}

// ---- 每游戏小时 tick（内部） ----
function tickHour(pet, species, hour, settings, clock, events, rng = Math.random) {
  const t = species.traits
  const slow = pet.coma ? 0.3 : 1

  if (!pet.dead) {
    // 饱食 / 清洁衰减
    pet.hunger = Math.max(0, pet.hunger - 2.0 * t.metabolism * slow)
    pet.hygiene = Math.max(0, pet.hygiene - 1.2 * t.hygieneDecay * slow)

    // 心情向目标趋近（波动大的趋近更快）
    const target = moodTarget(pet, species, clock)
    const pace = 0.25 * t.moodVolatility
    pet.mood += (target - pet.mood) * Math.min(0.8, pace)
    pet.mood = Math.min(100, Math.max(0, pet.mood))

    // 健康
    let dh = -0.3
    if (pet.hunger < 20) dh -= 1.5
    if (pet.hygiene < 20) dh -= 0.8
    if (pet.illness) dh -= 1.2
    if (pet.hunger > 60 && pet.hygiene > 60 && !pet.illness && pet.health < 100) dh += 0.8 * t.recovery
    if (pet.coma) dh = Math.max(dh, 0.25) // 昏迷中缓慢自愈
    pet.health = Math.min(100, Math.max(0, pet.health + dh))

    // 成长
    pet.growth += t.growthSpeed

    // 生病掷骰（rng 可注入，单测确定性用）
    if (!pet.illness && !pet.coma) {
      const risk = (pet.hunger < 25 ? 1.5 : 0) + (pet.hygiene < 25 ? 1.5 : 0)
      const p = 0.004 * t.illnessRate * (1 + risk)
      if (rng() < p) {
        const pick = ILLNESSES[Math.floor(rng() * ILLNESSES.length)]
        pet.illness = { ...pick, since: clock }
      }
    }
  }

  // 阈值事件（同键 8 游戏小时冷却）
  const fire = (key, text, icon) => {
    const last = pet.thresholds[key] ?? -Infinity
    if (clock - last < 8 * HOUR) return
    pet.thresholds[key] = clock
    events.push({ t: clock, kind: key, text, icon })
  }
  if (pet.hunger < 5) fire('starving', `${pet.name} 已经饿得没有力气了，快喂点吃的！`, '🆘')
  else if (pet.hunger < 25) fire('hungry', `${pet.name} 的肚子咕咕叫了`, '🍽️')
  if (pet.hygiene < 20) fire('dirty', `${pet.name} 身上有点脏了，该洗洗澡啦`, '🫧')
  if (pet.mood < 20) fire('sad', `${pet.name} 有点闷闷不乐`, '💔')
  if (pet.illness) fire('sick', `${pet.name} 病了（${pet.illness.name}），需要喂药治疗`, '🤒')
  if (pet.health < 25 && !pet.coma && !pet.dead) fire('lowHealth', `${pet.name} 的健康堪忧`, '⚠️')

  // 死亡 / 昏迷
  if (pet.health <= 0 && !pet.dead && !pet.coma) {
    if (settings.deathEnabled) {
      pet.dead = true
      events.push({ t: clock, kind: 'dead', text: `${pet.name} 回到了星尘里……`, icon: '🕯️' })
    } else {
      pet.coma = true
      pet.health = 2
      events.push({
        t: clock, kind: 'coma',
        text: `${pet.name} 虚弱地昏了过去，但它的心还在轻轻跳动——好好照料就能醒来`,
        icon: '💤'
      })
    }
  }
  if (pet.coma && pet.health >= 15 && !pet.dead) {
    pet.coma = false
    events.push({ t: clock, kind: 'wake', text: `${pet.name} 缓缓睁开了眼睛，苏醒过来！`, icon: '✨' })
  }
}

// ---- 主推进：把存档推进到 realNow（就地修改） ----
// deps.rng：可注入随机源（单测确定性用）
export function advance(save, realNow = Date.now(), deps = {}) {
  const rng = deps.rng || Math.random
  const events = []
  const pet = save?.pet
  if (!pet || pet.dead) {
    if (save) save.lastSeen = realNow
    return events
  }
  const species = getSpecies(pet.speciesId, save.customSpecies)
  if (!species) {
    if (save) save.lastSeen = realNow
    return events
  }

  const scale = save.settings.timeScale || 1
  let elapsedGame = Math.max(0, realNow - (save.lastSeen || realNow)) * scale
  const capped = elapsedGame > OFFLINE_CAP_MS
  if (capped) elapsedGame = OFFLINE_CAP_MS

  const fromClock = save.gameClock
  const toClock = fromClock + elapsedGame

  // 逐游戏小时推进：剩余 ≥1 小时才执行整小时 tick；不足 1 小时的零头按比例折算
  let ticked = fromClock
  while (toClock - ticked >= HOUR && !pet.dead) {
    ticked += HOUR
    tickHour(pet, species, hourOfDay(ticked), save.settings, ticked, events, rng)
  }
  // 尾部零头：按比例折算（饱食/清洁/成长）
  const rest = toClock - ticked
  if (rest > 0 && !pet.dead) {
    const f = rest / HOUR
    const t = species.traits
    const slow = pet.coma ? 0.3 : 1
    pet.hunger = Math.max(0, pet.hunger - 2.0 * t.metabolism * slow * f)
    pet.hygiene = Math.max(0, pet.hygiene - 1.2 * t.hygieneDecay * slow * f)
    pet.growth += t.growthSpeed * f
  }

  // 成长阶段跨越事件
  const stage = stageOf(pet.growth)
  if (stage.key !== save.lastStageKey) {
    if (save.lastStageKey) {
      events.push({ t: toClock, kind: 'grow', text: `${pet.name} 长大了：进入「${stage.label}」阶段`, icon: '🌱' })
    }
    save.lastStageKey = stage.key
  }

  save.gameClock = toClock
  save.lastSeen = realNow

  if (capped) {
    events.unshift({
      t: toClock, kind: 'cap',
      text: `你离开了太久，久远的时光化作了模糊的梦（本回最多结算 ${fmtGameSpan(OFFLINE_CAP_MS)}）`,
      icon: '🌌'
    })
  }
  return events
}

// ---- 离线摘要（App 载入时展示） ----
export function offlineSummary(save, events, realNow = Date.now()) {
  const scale = save.settings.timeScale || 1
  const elapsed = Math.max(0, realNow - (save.lastSeen || realNow)) * scale
  if (elapsed < 2 * HOUR || !events.length) return null
  const lines = []
  const count = (k) => events.filter((e) => e.kind === k).length
  if (count('hungry') || count('starving')) lines.push(`饿了 ${count('hungry') + count('starving')} 次`)
  if (count('sick')) lines.push(`病了 ${count('sick')} 场`)
  if (count('grow')) lines.push('长大了一岁')
  if (count('coma')) lines.push('陷入过昏迷')
  if (save.pet.dead) lines.push('但它最终回到了星尘')
  const pet = save.pet
  return {
    span: fmtGameSpan(Math.min(elapsed, OFFLINE_CAP_MS)),
    title: `你离开了 ${fmtGameSpan(Math.min(elapsed, OFFLINE_CAP_MS))}`,
    detail: lines.length ? `${pet.name}${lines.join('，')}` : `${pet.name} 安安静静地等你回来`,
    events
  }
}

// ---- 睡眠判定（行为系统用） ----
export function isAsleep(pet, species, clock) {
  if (pet.dead || pet.coma) return true
  if (clock < pet.forcedSleepUntil) return true
  return isSleepHour(species, hourOfDay(clock))
}

export { hourOfDay, dayOf, periodOfDay, stageOf }
