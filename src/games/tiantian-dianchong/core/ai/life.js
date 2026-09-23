// ============ AI 智能体生命系统：行为决策 ============
// 把宠物快照（物种人设/状态/最近事件/游戏时间）发给大模型，由模型决定
// 此刻的行为与心声。失败（未配置/超时/解析失败/行为不在白名单）自动降级
// 到随机生命系统当次兜底；连续失败进入冷却。

import { createAiClient } from './provider.js'
import { decideRandom } from '../randomLife.js'
import { isBehavior } from '../behaviors.js'
import { fmtGameTime, dayOf } from '../time.js'
import { stageOf, speciesPromptText } from '../species.js'
import { isAsleep } from '../life.js'

const SYSTEM_TMPL = (species, pet) =>
  `你是一只名叫「${pet.name}」的${species.name}，住在主人的电子设备里的电波生命。` +
  `你的性格：${species.personality.join('、') || '待定'}。${speciesPromptText(species)}\n` +
  `你要根据当前状态决定此刻的行为，并用一句简短、符合性格、口语化的话表达心声（不超过 20 个字）。\n` +
  `严格只输出 JSON，格式：{"behavior":"idle|wander|sleep|play|beg|groom|stare","say":"台词"}\n` +
  `行为含义：idle=安静待着，wander=踱步闲逛，sleep=睡觉，play=自己玩耍，beg=向主人撒娇讨要（关注/食物/陪伴），groom=梳洗自己，stare=望着主人发呆。`

function snapshotText(pet, species, clock, recentEvents) {
  const stage = stageOf(pet.growth)
  const lines = [
    `时间：${fmtGameTime(clock)}（已陪伴 ${dayOf(clock - pet.bornClock)} 天）`,
    `成长阶段：${stage.label}`,
    `饱食度：${Math.round(pet.hunger)}/100`,
    `心情：${Math.round(pet.mood)}/100`,
    `健康：${Math.round(pet.health)}/100`,
    `清洁：${Math.round(pet.hygiene)}/100`,
    `状态：${pet.dead ? '已逝去' : pet.coma ? '昏迷中' : pet.illness ? `生病（${pet.illness.name}）` : '健康'}`
  ]
  if (recentEvents?.length) {
    lines.push(`最近发生：${recentEvents.slice(-5).map((e) => e.text).join('；')}`)
  }
  return lines.join('\n')
}

/**
 * AI 行为决策（含降级链路）
 * @param {object} pet 宠物状态
 * @param {object} species 物种定义
 * @param {number} clock 当前游戏时钟（ms）
 * @param {object} cfg { baseUrl, apiKey, model }
 * @param {object} extras { recentEvents, fetchImpl, rng, signal }
 * @returns {Promise<{behavior: string, say: string, source: 'ai'|'fallback', error?: string}>}
 */
export async function decideAi(pet, species, clock, cfg, extras = {}) {
  const client = createAiClient(cfg, extras.fetchImpl)
  if (!client.ready) {
    return { ...decideRandom(pet, species, clock, extras.rng || Math.random), source: 'fallback', error: 'AI 未配置' }
  }
  // 睡着 / 昏迷 / 死亡：无需打扰模型，直接本地决策
  if (pet.dead || pet.coma || isAsleep(pet, species, clock)) {
    return { ...decideRandom(pet, species, clock, extras.rng || Math.random), source: 'fallback', error: null }
  }

  const res = await client.chat({
    system: SYSTEM_TMPL(species, pet),
    user: snapshotText(pet, species, clock, extras.recentEvents),
    json: true,
    temperature: 0.9,
    signal: extras.signal
  })

  if (res.ok && res.data && isBehavior(res.data.behavior)) {
    const say = typeof res.data.say === 'string' && res.data.say.trim() ? res.data.say.trim().slice(0, 30) : '……'
    return { behavior: res.data.behavior, say, source: 'ai' }
  }
  // 降级：当次随机兜底
  return {
    ...decideRandom(pet, species, clock, extras.rng || Math.random),
    source: 'fallback',
    error: res.ok ? '模型输出未通过校验' : res.error
  }
}
