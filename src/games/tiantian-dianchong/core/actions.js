// ============ 玩家操作 ============
// 喂食/零食/玩耍/洗澡/喂药/哄睡：修改宠物状态 + 冷却判定 + 日志事件。
// 全部操作即时返回结果对象，由 UI 呈现（toast / 气泡 / 日志）。

import { HOUR } from './time.js'
import { riskLevel } from './life.js'

export const ACTIONS = [
  { id: 'feed', label: '喂食', emoji: '🍚', hint: '一顿正餐，饱腹感满满' },
  { id: 'snack', label: '零食', emoji: '🍪', hint: '解馋小点心，心情大好' },
  { id: 'play', label: '玩耍', emoji: '🎾', hint: '陪它玩一会儿' },
  { id: 'bathe', label: '洗澡', emoji: '🛁', hint: '洗得干干净净' },
  { id: 'medicine', label: '喂药', emoji: '💊', hint: '生病时对症下药' },
  { id: 'sleep', label: '哄睡', emoji: '🌙', hint: '哄它睡个好觉' }
]

// 冷却（游戏小时）
const COOLDOWN_H = { feed: 0.5, snack: 0.1, play: 0.3, bathe: 1, medicine: 0.5, sleep: 0.5 }

const clamp100 = (v) => Math.min(100, Math.max(0, v))

/**
 * 执行玩家操作（就地修改 pet）
 * @returns {{ ok: boolean, message: string, event?: object }}
 */
export function performAction(pet, species, actionId, clock, opts = {}) {
  const action = ACTIONS.find((a) => a.id === actionId)
  if (!action) return { ok: false, message: '未知操作' }
  if (pet.dead) return { ok: false, message: `${pet.name} 已经不在了……` }

  const cd = pet.cooldowns[actionId] || 0
  if (clock < cd) {
    const restH = (cd - clock) / HOUR
    const restText = restH >= 1 ? `${restH.toFixed(1)} 小时` : `${Math.ceil(restH * 60)} 分钟（游戏时间）`
    return { ok: false, message: `歇会儿吧，${restText}后再来` }
  }
  pet.cooldowns[actionId] = clock + COOLDOWN_H[actionId] * HOUR

  const t = species.traits
  const event = { t: clock, kind: actionId, text: '', icon: action.emoji }
  let message = ''

  switch (actionId) {
    case 'feed': {
      if (pet.hunger > 92) {
        pet.mood = clamp100(pet.mood - 8)
        event.text = `${pet.name} 撑到打嗝了——别再喂啦`
        message = '它吃得直打嗝，撑到啦'
        pet.hunger = clamp100(pet.hunger + 6)
      } else {
        pet.hunger = clamp100(pet.hunger + 38)
        pet.mood = clamp100(pet.mood + 4)
        event.text = `${pet.name} 吃掉了一整碗饭，满足地眯起眼`
        message = '吃得津津有味'
      }
      break
    }
    case 'snack': {
      pet.hunger = clamp100(pet.hunger + 12)
      pet.mood = clamp100(pet.mood + 10 * t.snackLove)
      event.text = `${pet.name} 干掉了一块小零食，幸福感爆棚`
      message = t.snackLove >= 1.5 ? '它的尾巴都要摇上天了' : '美滋滋地嚼着零食'
      break
    }
    case 'play': {
      pet.mood = clamp100(pet.mood + 16 * t.sociability)
      pet.hunger = clamp100(pet.hunger - 6)
      pet.hygiene = clamp100(pet.hygiene - 4)
      pet.lastPlayClock = clock
      event.text = `${pet.name} 和你玩了个痛快`
      message = '玩得满地打滚'
      break
    }
    case 'bathe': {
      const before = pet.hygiene
      pet.hygiene = 100
      pet.mood = clamp100(pet.mood + t.bathMood)
      event.text =
        t.bathMood >= 5
          ? `${pet.name} 洗得香喷喷，开心得冒泡`
          : t.bathMood < 0
            ? `${pet.name} 洗干净了，但一脸嫌弃水`
            : `${pet.name} 洗得干干净净`
      message = before < 30 ? '焕然一新！' : '泡泡浴完成'
      break
    }
    case 'medicine': {
      if (pet.illness) {
        delete pet.thresholds.sick
        const name = pet.illness.name
        pet.illness = null
        pet.health = clamp100(pet.health + 12 * t.recovery)
        event.text = `${pet.name} 吃下药，「${name}」痊愈了`
        message = '药到病除'
      } else {
        delete pet.cooldowns.medicine
        event.text = ''
        message = `${pet.name} 很健康，不需要吃药哦`
        return { ok: false, message }
      }
      break
    }
    case 'sleep': {
      pet.forcedSleepUntil = clock + 2 * HOUR
      event.text = `${pet.name} 在你的轻拍中睡着了`
      message = '晚安，做个好梦'
      break
    }
    default:
      return { ok: false, message: '未知操作' }
  }

  // 昏迷中照料有唤醒加成
  if (pet.coma && (actionId === 'feed' || actionId === 'medicine')) {
    pet.health = clamp100(pet.health + 6)
    event.text += '（昏迷中的它感受到了你的照料）'
  }

  return { ok: true, message, event, risk: riskLevel(pet) }
}
