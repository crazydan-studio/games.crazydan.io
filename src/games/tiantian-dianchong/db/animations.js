// ============ 电宠动画库：参数化生成骨骼动画时间线 ============
// 产出「中性时间线数据」（与运行时格式解耦），由 skeletonFactory.js
// 转换为 DragonBones JSON 动画：
//   · 时间线数值为相对 setup pose 的增量（y 向上、逆时针为正）
//   · 全部动画按「标准骨骼名」生成（root/body/head/ear-l/ear-r/tail-1/
//     tail-2/leg-fl/leg-fr/leg-bl/leg-br），任何物种（内置或 AI 生成）
//     共用同一套装配，因此同一份生成器适配所有 look 变体。
//
// 物种特质 → 动画风格（生命系统的参数「看得见」）：
//   metabolism     呼吸幅度（代谢越快呼吸越明显）
//   moodVolatility 尾巴摆幅（情绪越烈尾巴越欢）
//   sociability    弹跳高度与乞怜灵动（越黏人越活泼）
//   illnessRate    ——不影响风格（保留给未来的病态动画细节）
//
// 时间线单位：秒 / 度 / 单位。一次性动画结尾回到 setup pose，
// 循环动画首尾关键帧对齐保证无缝循环。

// ---- 时间线构造辅助 ----
const rot = (frames) => frames.map(([time, angle]) => ({ time, angle }))
const trans = (frames) => frames.map(([time, x, y]) => ({ time, x, y }))
const scale = (frames) => frames.map(([time, x, y]) => ({ time, x, y }))
const attach = (frames) => frames.map(([time, name]) => ({ time, name }))

function bonesOf(bones) {
  return bones
}
function slotsOf(slots) {
  const out = {}
  for (const [slot, timelines] of Object.entries(slots)) {
    if (timelines.attachment) out[slot] = { attachment: attach(timelines.attachment) }
  }
  return out
}

/**
 * 生成物种的完整动画集合
 * @returns {object} 中性动画时间线集合（供 skeletonFactory 转换为 DragonBones 动画）
 */
export function buildAnimations(species) {
  const t = species.traits || {}
  const breath = 0.024 + (t.metabolism ?? 1) * 0.009 // 呼吸幅度
  const tailAmp = 0.7 + (t.moodVolatility ?? 1) * 0.3 // 摆尾幅度系数
  const bounce = 0.72 + (t.sociability ?? 1) * 0.32 // 弹跳高度系数
  const wag = (base) => Math.round(base * tailAmp * 10) / 10
  const hop = (h) => Math.round(h * bounce * 10) / 10

  const A = {}

  // ---- 待机：呼吸 + 摇尾 + 周期眨眼（4s 循环） ----
  A.idle = {
    bones: bonesOf({
      body: {
        scale: scale([[0, 1, 1], [1.6, 1, 1 + breath], [3.2, 1, 1], [4, 1, 1 + breath * 0.4], [4, 1, 1]]),
        translate: trans([[0, 0, 0], [1.6, 0, 1.2], [3.2, 0, 0], [4, 0, 0]])
      },
      head: { rotate: rot([[0, 0], [1.8, 1.5], [3.4, -1], [4, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [1, wag(9)], [2.2, wag(-7)], [3.2, wag(6)], [4, 0]]) },
      'tail-2': { rotate: rot([[0, 0], [1.2, wag(12)], [2.4, wag(-10)], [3.4, wag(8)], [4, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [2.3, -14], [2.55, 0], [4, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-normal'], [1.7, 'eye-closed'], [1.84, 'eye-normal'], [4, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-normal'], [1.7, 'eye-closed'], [1.84, 'eye-normal'], [4, 'eye-normal']] }
    })
  }

  // ---- 行走：四腿交替 + 身体起伏摇摆（0.8s 循环） ----
  A.walk = {
    bones: bonesOf({
      'leg-fl': { rotate: rot([[0, 0], [0.2, 17], [0.4, 0], [0.6, -13], [0.8, 0]]) },
      'leg-fr': { rotate: rot([[0, 0], [0.2, -13], [0.4, 0], [0.6, 17], [0.8, 0]]) },
      'leg-bl': { rotate: rot([[0, 0], [0.2, -13], [0.4, 0], [0.6, 17], [0.8, 0]]) },
      'leg-br': { rotate: rot([[0, 0], [0.2, 17], [0.4, 0], [0.6, -13], [0.8, 0]]) },
      body: {
        translate: trans([[0, 0, 0], [0.2, 0, -2.6], [0.4, 0, 0], [0.6, 0, -2.6], [0.8, 0, 0]]),
        rotate: rot([[0, 0], [0.2, 2], [0.4, 0], [0.6, -2], [0.8, 0]])
      },
      head: { rotate: rot([[0, 0], [0.2, 2.5], [0.4, 0], [0.6, -2.5], [0.8, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.2, wag(11)], [0.4, 0], [0.6, wag(-9)], [0.8, 0]]) },
      'tail-2': { rotate: rot([[0, 0], [0.2, wag(13)], [0.4, 0], [0.6, wag(-11)], [0.8, 0]]) }
    })
  }

  // ---- 进食：低头啃咬 + 嘴部开合（1.8s） ----
  A.eat = {
    bones: bonesOf({
      head: {
        rotate: rot([[0, 0], [0.3, 14], [0.6, 10], [0.9, 16], [1.2, 10], [1.8, 0]]),
        translate: trans([[0, 0, 0], [0.3, 0, -9], [0.6, 0, -7], [0.9, 0, -11], [1.2, 0, -7], [1.8, 0, 0]])
      },
      body: { rotate: rot([[0, 0], [0.4, 3], [1.2, 2], [1.8, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.5, wag(10)], [1, wag(-8)], [1.5, wag(9)], [1.8, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.5, 5], [1, 0], [1.4, 5], [1.8, 0]]) }
    }),
    slots: slotsOf({
      mouth: { attachment: [[0, 'mouth-open'], [0.35, 'mouth-chew'], [0.7, 'mouth-open'], [1.05, 'mouth-chew'], [1.4, 'mouth-open'], [1.7, 'mouth-smile'], [1.8, 'mouth-smile']] }
    })
  }

  // ---- 睡眠：伏低 + 深呼吸 + 闭眼（3.6s 循环） ----
  A.sleep = {
    bones: bonesOf({
      body: {
        scale: scale([[0, 1, 0.94], [1.8, 1, 0.965], [3.6, 1, 0.94]]),
        translate: trans([[0, 0, -10], [3.6, 0, -10]])
      },
      head: { rotate: rot([[0, 10], [1.8, 12], [3.6, 10]]) },
      'tail-1': { rotate: rot([[0, -20], [1.8, -14], [3.6, -20]]) },
      'tail-2': { rotate: rot([[0, -8], [1.8, -4], [3.6, -8]]) },
      'leg-fl': { rotate: rot([[0, 6], [3.6, 6]]) },
      'leg-fr': { rotate: rot([[0, -6], [3.6, -6]]) },
      'ear-l': { rotate: rot([[0, 0], [3.6, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [3.6, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-closed'], [3.6, 'eye-closed']] },
      'eye-r': { attachment: [[0, 'eye-closed'], [3.6, 'eye-closed']] },
      mouth: { attachment: [[0, 'mouth-sleep'], [3.6, 'mouth-sleep']] }
    })
  }

  // ---- 醒来：舒展伸腰（0.9s） ----
  A.wake = {
    bones: bonesOf({
      body: {
        scale: scale([[0, 1, 0.94], [0.5, 1, 1.05], [0.9, 1, 1]]),
        translate: trans([[0, 0, -10], [0.6, 0, 1], [0.9, 0, 0]])
      },
      head: { rotate: rot([[0, 10], [0.4, -7], [0.9, 0]]) },
      'tail-1': { rotate: rot([[0, -20], [0.6, wag(12)], [0.9, 0]]) },
      'leg-fl': { rotate: rot([[0, 6], [0.9, 0]]) },
      'leg-fr': { rotate: rot([[0, -6], [0.9, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.35, -12], [0.6, 0], [0.9, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.35, 12], [0.6, 0], [0.9, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-closed'], [0.55, 'eye-closed'], [0.6, 'eye-normal'], [0.9, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-closed'], [0.55, 'eye-closed'], [0.6, 'eye-normal'], [0.9, 'eye-normal']] },
      mouth: { attachment: [[0, 'mouth-sleep'], [0.6, 'mouth-smile'], [0.9, 'mouth-smile']] }
    })
  }

  // ---- 撒娇乞怜：坐姿仰望 + 前爪抬起（2.4s） ----
  A.beg = {
    bones: bonesOf({
      body: {
        rotate: rot([[0, 0], [0.4, -6], [1.8, -5], [2.4, 0]]),
        translate: trans([[0, 0, 0], [0.4, 0, -5], [1.8, 0, -4], [2.4, 0, 0]])
      },
      head: { rotate: rot([[0, 0], [0.4, -10], [1, -6], [1.6, -11], [2.4, 0]]) },
      'leg-fl': { rotate: rot([[0, 0], [0.5, -32], [1.8, -28], [2.4, 0]]) },
      'leg-fr': { rotate: rot([[0, 0], [0.5, 32], [1.8, 28], [2.4, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.4, -10], [2, -8], [2.4, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.4, 10], [2, 8], [2.4, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.5, wag(14)], [1.2, wag(-12)], [1.9, wag(13)], [2.4, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-normal'], [0.35, 'eye-happy'], [2.1, 'eye-happy'], [2.4, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-normal'], [0.35, 'eye-happy'], [2.1, 'eye-happy'], [2.4, 'eye-normal']] },
      mouth: { attachment: [[0, 'mouth-smile'], [0.45, 'mouth-laugh'], [2.1, 'mouth-laugh'], [2.4, 'mouth-smile']] },
      'blush-l': { attachment: [[0, null], [0.5, 'blush'], [2, 'blush'], [2.4, null]] },
      'blush-r': { attachment: [[0, null], [0.5, 'blush'], [2, 'blush'], [2.4, null]] }
    })
  }

  // ---- 玩耍：蹦跳两长一小 + 落地压扁回弹（2.8s） ----
  A.play = {
    bones: bonesOf({
      body: {
        translate: trans([[0, 0, 0], [0.32, 0, hop(-22)], [0.62, 0, 0], [0.95, 0, hop(-22)], [1.25, 0, 0], [1.6, 0, hop(-13)], [1.85, 0, 0], [2.8, 0, 0]]),
        scale: scale([[0, 1, 1], [0.3, 1, 0.94], [0.62, 1, 1.06], [0.95, 1, 0.94], [1.25, 1, 1.06], [1.6, 1, 0.96], [1.85, 1, 1], [2.8, 1, 1]])
      },
      head: { rotate: rot([[0, 0], [0.3, -5], [0.62, 4], [0.95, -5], [1.25, 4], [1.9, 0], [2.8, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.3, 16], [0.62, -12], [0.95, 16], [1.25, -12], [1.9, 0], [2.8, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.3, -16], [0.62, 12], [0.95, -16], [1.25, 12], [1.9, 0], [2.8, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.3, wag(16)], [0.62, wag(-14)], [0.95, wag(16)], [1.25, wag(-14)], [1.6, wag(12)], [2.8, 0]]) },
      'tail-2': { rotate: rot([[0, 0], [0.4, wag(14)], [0.9, wag(-12)], [1.4, wag(13)], [2.8, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-happy'], [2.2, 'eye-happy'], [2.8, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-happy'], [2.2, 'eye-happy'], [2.8, 'eye-normal']] },
      mouth: { attachment: [[0, 'mouth-laugh'], [2.2, 'mouth-laugh'], [2.8, 'mouth-smile']] }
    })
  }

  // ---- 梳洗：歪头舔爪（2.6s） ----
  A.groom = {
    bones: bonesOf({
      head: {
        rotate: rot([[0, 0], [0.5, 10], [1, 20], [1.7, 20], [2.2, 10], [2.6, 0]]),
        translate: trans([[0, 0, 0], [0.5, 2, -2], [1.7, 2, -2], [2.6, 0, 0]])
      },
      'leg-fl': { rotate: rot([[0, 0], [0.5, 42], [1.7, 62], [2.2, 40], [2.6, 0]]) },
      body: { rotate: rot([[0, 0], [1, 3], [1.7, 3], [2.6, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.8, -8], [2, -6], [2.6, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [1, wag(8)], [1.8, wag(-6)], [2.6, 0]]) }
    }),
    slots: slotsOf({
      mouth: { attachment: [[0, 'mouth-smile'], [0.7, 'mouth-chew'], [1.6, 'mouth-chew'], [2.2, 'mouth-smile'], [2.6, 'mouth-smile']] }
    })
  }

  // ---- 凝视主人：歪头好奇（4.8s 循环） ----
  A.stare = {
    bones: bonesOf({
      head: {
        rotate: rot([[0, 0], [0.6, 6], [4.2, 6], [4.8, 0]]),
        translate: trans([[0, 0, 0], [0.6, 3, 1], [4.2, 3, 1], [4.8, 0, 0]])
      },
      body: { scale: scale([[0, 1, 1], [2.4, 1, 1 + breath], [4.8, 1, 1]]) },
      'tail-1': { rotate: rot([[0, 0], [1.2, wag(6)], [2.8, wag(-5)], [4.4, wag(5)], [4.8, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [3.1, -12], [3.4, 0], [4.8, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-normal'], [2.5, 'eye-closed'], [2.64, 'eye-normal'], [4.8, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-normal'], [2.5, 'eye-closed'], [2.64, 'eye-normal'], [4.8, 'eye-normal']] }
    })
  }

  // ---- 洗澡：全身甩水（2.6s） ----
  A.wash = {
    bones: bonesOf({
      body: {
        rotate: rot([[0, 0], [0.35, 5], [0.7, -5], [1.05, 5], [1.4, -5], [1.75, 4], [2.1, -4], [2.6, 0]]),
        translate: trans([[0, 0, 0], [0.35, 2, -1], [0.7, -2, -1], [1.05, 2, -1], [1.4, -2, -1], [2.6, 0, 0]])
      },
      head: { rotate: rot([[0, 0], [0.35, 6], [0.7, -6], [1.05, 6], [1.4, -6], [1.75, 4], [2.1, -4], [2.6, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.35, 20], [0.7, -14], [1.05, 20], [1.4, -14], [2.1, 0], [2.6, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.35, -20], [0.7, 14], [1.05, -20], [1.4, 14], [2.1, 0], [2.6, 0]]) },
      'leg-fl': { rotate: rot([[0, 0], [0.35, 8], [0.7, -8], [1.05, 8], [1.4, -8], [2.6, 0]]) },
      'leg-fr': { rotate: rot([[0, 0], [0.35, -8], [0.7, 8], [1.05, -8], [1.4, 8], [2.6, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.4, wag(14)], [1.2, wag(-12)], [2, wag(10)], [2.6, 0]]) }
    }),
    slots: slotsOf({
      mouth: { attachment: [[0, 'mouth-smile'], [0.6, 'mouth-laugh'], [2, 'mouth-laugh'], [2.6, 'mouth-smile']] }
    })
  }

  // ---- 喂药：仰头吞咽（1.6s） ----
  A.medicine = {
    bones: bonesOf({
      head: {
        rotate: rot([[0, 0], [0.35, -18], [0.8, -12], [1.1, -4], [1.6, 0]]),
        translate: trans([[0, 0, 0], [0.35, 0, 4], [1.1, 0, 1], [1.6, 0, 0]])
      },
      body: { rotate: rot([[0, 0], [0.4, -3], [1, -2], [1.6, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.35, -8], [1, -5], [1.6, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.35, 8], [1, 5], [1.6, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.6, wag(6)], [1.2, wag(-4)], [1.6, 0]]) }
    }),
    slots: slotsOf({
      mouth: { attachment: [[0, 'mouth-smile'], [0.25, 'mouth-open'], [0.6, 'mouth-chew'], [0.95, 'mouth-open'], [1.3, 'mouth-smile'], [1.6, 'mouth-smile']] }
    })
  }

  // ---- 摸头：受用地眯眼 + 腮红（0.9s） ----
  A.pet = {
    bones: bonesOf({
      body: {
        scale: scale([[0, 1, 1], [0.25, 1, 1.07], [0.55, 1, 0.96], [0.9, 1, 1]]),
        translate: trans([[0, 0, 0], [0.25, 0, -2], [0.9, 0, 0]])
      },
      head: { rotate: rot([[0, 0], [0.2, -5], [0.6, 3], [0.9, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.3, -10], [0.6, 0], [0.9, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.3, 10], [0.6, 0], [0.9, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.3, wag(12)], [0.7, wag(-8)], [0.9, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-normal'], [0.12, 'eye-happy'], [0.75, 'eye-happy'], [0.9, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-normal'], [0.12, 'eye-happy'], [0.75, 'eye-happy'], [0.9, 'eye-normal']] },
      mouth: { attachment: [[0, 'mouth-smile'], [0.15, 'mouth-laugh'], [0.8, 'mouth-laugh'], [0.9, 'mouth-smile']] },
      'blush-l': { attachment: [[0, null], [0.1, 'blush'], [0.85, 'blush'], [0.9, null]] },
      'blush-r': { attachment: [[0, null], [0.1, 'blush'], [0.85, 'blush'], [0.9, null]] }
    })
  }

  // ---- 开心蹦跳（1.2s） ----
  A.happy = {
    bones: bonesOf({
      body: {
        translate: trans([[0, 0, 0], [0.3, 0, hop(-24)], [0.6, 0, 0], [1.2, 0, 0]]),
        scale: scale([[0, 1, 1], [0.25, 1, 0.95], [0.6, 1, 1.05], [1.2, 1, 1]])
      },
      head: { rotate: rot([[0, 0], [0.3, -6], [0.7, 2], [1.2, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.3, 14], [0.8, 0], [1.2, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.3, -14], [0.8, 0], [1.2, 0]]) },
      'tail-1': { rotate: rot([[0, 0], [0.3, wag(16)], [0.7, wag(-12)], [1.2, 0]]) },
      'tail-2': { rotate: rot([[0, 0], [0.4, wag(14)], [0.9, wag(-10)], [1.2, 0]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-happy'], [1, 'eye-happy'], [1.2, 'eye-normal']] },
      'eye-r': { attachment: [[0, 'eye-happy'], [1, 'eye-happy'], [1.2, 'eye-normal']] },
      mouth: { attachment: [[0, 'mouth-laugh'], [1.05, 'mouth-laugh'], [1.2, 'mouth-smile']] },
      'blush-l': { attachment: [[0, null], [0.15, 'blush'], [1.05, 'blush'], [1.2, null]] },
      'blush-r': { attachment: [[0, null], [0.15, 'blush'], [1.05, 'blush'], [1.2, null]] }
    })
  }

  // ---- 难过：垂头耷耳（3.6s 循环） ----
  A.sad = {
    bones: bonesOf({
      body: { scale: scale([[0, 1, 0.975], [1.8, 1, 0.99], [3.6, 1, 0.975]]) },
      head: { rotate: rot([[0, 13], [1.8, 15], [3.6, 13]]) },
      'ear-l': { rotate: rot([[0, -32], [1.8, -28], [3.6, -32]]) },
      'ear-r': { rotate: rot([[0, 32], [1.8, 28], [3.6, 32]]) },
      'tail-1': { rotate: rot([[0, -24], [1.8, -19], [3.6, -24]]) },
      'tail-2': { rotate: rot([[0, -12], [1.8, -8], [3.6, -12]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-sad'], [3.6, 'eye-sad']] },
      'eye-r': { attachment: [[0, 'eye-sad'], [3.6, 'eye-sad']] },
      mouth: { attachment: [[0, 'mouth-sad'], [3.6, 'mouth-sad']] }
    })
  }

  // ---- 寒颤：快速抖动（0.8s） ----
  A.shiver = {
    bones: bonesOf({
      body: {
        rotate: rot([[0, 0], [0.12, 2.5], [0.24, -2.5], [0.36, 2.5], [0.48, -2.5], [0.6, 2], [0.8, 0]]),
        translate: trans([[0, 0, 0], [0.12, 1.5, -1], [0.24, -1.5, -1], [0.36, 1.5, -1], [0.48, -1.5, -1], [0.8, 0, 0]])
      },
      head: { rotate: rot([[0, 0], [0.12, 3], [0.24, -3], [0.36, 3], [0.48, -3], [0.8, 0]]) },
      'ear-l': { rotate: rot([[0, 0], [0.12, 8], [0.24, -8], [0.36, 8], [0.48, -8], [0.8, 0]]) },
      'ear-r': { rotate: rot([[0, 0], [0.12, -8], [0.24, 8], [0.36, -8], [0.48, 8], [0.8, 0]]) }
    }),
    slots: slotsOf({
      mouth: { attachment: [[0, 'mouth-sick'], [0.8, 'mouth-sick']] }
    })
  }

  // ---- 昏迷：伏地不起 + 极缓呼吸（4s 循环） ----
  A.coma = {
    bones: bonesOf({
      body: {
        scale: scale([[0, 1, 0.9], [2, 1, 0.915], [4, 1, 0.9]]),
        translate: trans([[0, 0, -14], [4, 0, -14]])
      },
      head: { rotate: rot([[0, 20], [4, 20]]) },
      'tail-1': { rotate: rot([[0, -28], [4, -28]]) },
      'leg-fl': { rotate: rot([[0, 10], [4, 10]]) },
      'leg-fr': { rotate: rot([[0, -10], [4, -10]]) },
      'ear-l': { rotate: rot([[0, -20], [4, -20]]) },
      'ear-r': { rotate: rot([[0, 20], [4, 20]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-closed'], [4, 'eye-closed']] },
      'eye-r': { attachment: [[0, 'eye-closed'], [4, 'eye-closed']] },
      mouth: { attachment: [[0, 'mouth-sleep'], [4, 'mouth-sleep']] }
    })
  }

  // ---- 死亡：侧身倒地（6s 循环，0.7s 内完成倒下后定格） ----
  A.dead = {
    bones: bonesOf({
      body: {
        rotate: rot([[0, 0], [0.7, 75], [6, 75]]),
        translate: trans([[0, 0, 0], [0.7, 8, -34], [6, 8, -34]])
      },
      head: { rotate: rot([[0, 0], [0.7, 8], [6, 8]]) },
      'tail-1': { rotate: rot([[0, 0], [0.7, -30], [6, -30]]) },
      'leg-fl': { rotate: rot([[0, 0], [0.7, 25], [6, 25]]) },
      'leg-fr': { rotate: rot([[0, 0], [0.7, -25], [6, -25]]) },
      'ear-l': { rotate: rot([[0, 0], [0.7, -30], [6, -30]]) },
      'ear-r': { rotate: rot([[0, 0], [0.7, 30], [6, 30]]) }
    }),
    slots: slotsOf({
      'eye-l': { attachment: [[0, 'eye-normal'], [0.45, 'eye-dead'], [6, 'eye-dead']] },
      'eye-r': { attachment: [[0, 'eye-normal'], [0.45, 'eye-dead'], [6, 'eye-dead']] },
      mouth: { attachment: [[0, 'mouth-smile'], [0.5, 'mouth-flat'], [6, 'mouth-flat']] }
    })
  }

  return A
}

// 动画语义表（动作系统 → 动画名；调试与校验用）
export const ANIMATION_FOR = {
  idle: 'idle', walk: 'walk', eat: 'eat', sleep: 'sleep', wake: 'wake',
  beg: 'beg', play: 'play', groom: 'groom', stare: 'stare', wash: 'wash',
  medicine: 'medicine', pet: 'pet', happy: 'happy', sad: 'sad',
  shiver: 'shiver', coma: 'coma', dead: 'dead'
}

export const ANIMATION_NAMES = Object.keys(ANIMATION_FOR)
