// ============ 随机生命系统（内置固化模式） ============
// 物种行为权重 + 当前状态修正 + 注入式随机源 → 决定行为与心声。
// 零网络依赖，离线完全可用；同时作为 AI 智能体生命系统的降级兜底。

import { isAsleep } from './life.js'
import { hourOfDay, periodOfDay } from './time.js'

// 状态模板台词（物种差异通过 quips 前缀体现）
const STATE_QUIPS = {
  hungry: ['肚子咕咕叫了……', '好饿好饿，饭呢？', '闻到好吃的味道了吗？'],
  starving: ['饿到眼前发花了……', '急需支援！食物优先！'],
  dirty: ['毛毛都打结了……', '身上痒痒的，想洗澡澡'],
  sick: ['没什么精神……头昏昏的', '咳咳……想休息一下'],
  sad: ['有点孤单呢……', '陪陪我好不好？'],
  sleepy: ['眼皮好重……', '打个哈欠～'],
  happy: ['今天心情好到冒泡！', '嘿嘿，超开心的～'],
  night: ['夜深了，万籁俱寂……', '这个时辰最舒服了']
}

// 依状态修正行为权重（饥饿→乞食↑、困倦→睡觉↑、脏→梳洗↑、心情低→讨好↑）
function adjustedWeights(pet, species, clock, asleep) {
  const w = { ...species.behaviors }
  if (asleep) {
    return { sleep: 999 } // 睡着就继续睡
  }
  if (pet.hunger < 30) w.beg = (w.beg || 1) * 3.2
  if (pet.hunger < 12) w.beg = (w.beg || 1) * 2
  if (pet.hygiene < 35) w.groom = (w.groom || 1) * 2.4
  if (pet.mood < 35) w.beg = (w.beg || 1) * 1.8
  if (pet.mood > 70) w.play = (w.play || 1) * 1.6
  if (pet.illness) {
    w.sleep = (w.sleep || 1) * 3
    w.play = (w.play || 1) * 0.2
    w.wander = (w.wander || 1) * 0.4
  }
  if (pet.coma) return { sleep: 999 }
  return w
}

// 状态优先台词：恶劣状态优先发声
function pickStateQuip(pet, period, rng) {
  const pool = []
  if (pet.hunger < 12) pool.push(...STATE_QUIPS.starving)
  else if (pet.hunger < 30) pool.push(...STATE_QUIPS.hungry)
  if (pet.illness) pool.push(...STATE_QUIPS.sick)
  if (pet.hygiene < 35) pool.push(...STATE_QUIPS.dirty)
  if (pet.mood < 35) pool.push(...STATE_QUIPS.sad)
  if (!pool.length && pet.mood > 70) pool.push(...STATE_QUIPS.happy)
  if (!pool.length && period.night) pool.push(...STATE_QUIPS.night)
  if (!pool.length) return null
  return pool[Math.floor(rng() * pool.length)]
}

function pickQuips(species, rng) {
  if (!species.quips?.length) return null
  return species.quips[Math.floor(rng() * species.quips.length)]
}

function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (!total) return 'idle'
  let r = rng() * total
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

/**
 * 随机生命系统决策
 * @param {object} pet 宠物状态
 * @param {object} species 物种定义
 * @param {number} clock 当前游戏时钟（ms）
 * @param {() => number} rng 注入式随机源（单测确定性用）
 * @returns {{ behavior: string, say: string }}
 */
export function decideRandom(pet, species, clock, rng = Math.random) {
  const hour = hourOfDay(clock)
  const period = periodOfDay(hour)
  const asleep = isAsleep(pet, species, clock)

  const behavior = weightedPick(adjustedWeights(pet, species, clock, asleep), rng)

  // 台词：睡着说梦话；清醒优先表达当前状态
  let say
  if (behavior === 'sleep') {
    say = rng() < 0.5 ? 'Zzz……' : '（发出均匀的呼吸声）'
  } else {
    say = pickStateQuip(pet, period, rng) ?? pickQuips(species, rng) ?? '……'
  }
  return { behavior, say }
}
