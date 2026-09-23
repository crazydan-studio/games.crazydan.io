// ============ 电宠部件图集：运行时 Canvas2D 绘制 ============
// 依据物种 look 参数（配色/耳型/尾型/鼻吻/附加件）把宠物的所有
// 骨骼动画「贴图部件」绘制到一张离线画布上：
//   · 零外部资源文件：图集随物种即时生成，AI 新物种即刻拥有骨骼动画
//   · 造型与 PetAvatar SVG 同源（同一套配色与形体语言）
//   · regions 即 DragonBones 贴图集 SubTexture 的矩形数据源
// 画布坐标 y 向下；部件以所在单元中心为原点绘制（即图像中心锚点）。
//
// 产出：
//   buildPetParts(species) → {
//     pageName, width, height, regions, subTextures, drawTo(canvas)
//   }

const INK = '#4A3728'

// ---- 单元布局 ----
const CELL = 128
const COLS = 8
const ROWS = 6

// 部件清单：name → { w, h, draw(ctx, look) }（在中心原点局部坐标绘制）
function defineParts(look) {
  const body = look.body
  const belly = look.belly
  const accent = look.accent
  const eyeW = 4.5

  const strokeInk = (ctx, w = eyeW) => {
    ctx.strokeStyle = INK
    ctx.lineWidth = w
    ctx.lineCap = 'round'
  }

  return {
    body: {
      w: 96, h: 80,
      draw(ctx) {
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.ellipse(0, -6, 43, 33, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = belly
        ctx.beginPath()
        ctx.ellipse(0, 4, 25, 19, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    head: {
      w: 92, h: 92,
      draw(ctx) {
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(0, 0, 44, 0, Math.PI * 2)
        ctx.fill()
        // 下半浅色区（脸蛋）
        ctx.fillStyle = belly
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        ctx.ellipse(0, 10, 40, 32, 0, 0, Math.PI)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    shadow: {
      w: 90, h: 16,
      draw(ctx) {
        ctx.fillStyle = 'rgba(30,60,50,0.13)'
        ctx.beginPath()
        ctx.ellipse(0, 0, 44, 7, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    },

    // ---- 耳朵（右侧附件用 scaleX:-1 镜像复用） ----
    'ear-pointed': {
      w: 30, h: 38,
      draw(ctx) {
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.moveTo(-13, 17)
        ctx.lineTo(-4, -19)
        ctx.lineTo(13, 3)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.75
        ctx.beginPath()
        ctx.moveTo(-8, 9)
        ctx.lineTo(-4, -8)
        ctx.lineTo(6, 1)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    'ear-floppy': {
      w: 28, h: 50,
      draw(ctx) {
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.ellipse(0, 1, 13, 24, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = body
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.ellipse(2, 6, 7, 15, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    'ear-round': {
      w: 30, h: 30,
      draw(ctx) {
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(0, 0, 14, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.arc(0, 0, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    'ear-horn': {
      w: 22, h: 30,
      draw(ctx) {
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.moveTo(-9, 14)
        ctx.lineTo(-1, -14)
        ctx.lineTo(10, 6)
        ctx.closePath()
        ctx.fill()
      }
    },

    // ---- 尾巴 ----
    'tail-seg-a': {
      w: 32, h: 16,
      draw(ctx) {
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.ellipse(2, 0, 15, 7.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    'tail-seg-b': {
      w: 28, h: 16,
      draw(ctx) {
        if (look.tail === 'striped') {
          ctx.fillStyle = body
          ctx.beginPath()
          ctx.ellipse(2, 0, 13, 7, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = INK
          ctx.lineWidth = 4
          ctx.lineCap = 'round'
          ctx.globalAlpha = 0.55
          ctx.beginPath()
          ctx.moveTo(-2, -6); ctx.quadraticCurveTo(1, 0, -2, 6)
          ctx.moveTo(6, -5); ctx.quadraticCurveTo(9, 0, 6, 5)
          ctx.stroke()
          ctx.globalAlpha = 1
        } else if (look.tail === 'spikes') {
          ctx.fillStyle = body
          ctx.beginPath()
          ctx.ellipse(1, 0, 13, 8, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = accent
          ctx.beginPath()
          ctx.moveTo(-6, -6); ctx.lineTo(-1, -16); ctx.lineTo(4, -6)
          ctx.closePath()
          ctx.fill()
        } else {
          // wag：亮色尾尖
          ctx.fillStyle = accent
          ctx.globalAlpha = 0.85
          ctx.beginPath()
          ctx.ellipse(2, 0, 12, 8, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
    },
    'tail-curl': {
      w: 38, h: 34,
      draw(ctx) {
        ctx.strokeStyle = accent
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-12, 12)
        ctx.quadraticCurveTo(6, 8, 6, -4)
        ctx.quadraticCurveTo(6, -13, -3, -11)
        ctx.quadraticCurveTo(-9, -9, -6, -3)
        ctx.stroke()
      }
    },

    // ---- 腿 ----
    'leg-front': {
      w: 20, h: 32,
      draw(ctx) {
        ctx.fillStyle = belly
        ctx.beginPath()
        ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = accent
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        if (look.snout === 'dino') {
          ctx.fillStyle = belly
          ctx.beginPath()
          ctx.moveTo(-8, 12); ctx.lineTo(-4, 18); ctx.lineTo(0, 12)
          ctx.moveTo(-1, 12); ctx.lineTo(3, 18); ctx.lineTo(7, 12)
          ctx.closePath()
          ctx.fill()
        }
      }
    },
    'leg-back': {
      w: 20, h: 32,
      draw(ctx) {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },

    // ---- 眼睛（左右共用贴图） ----
    'eye-normal': {
      w: 22, h: 16,
      draw(ctx) {
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.arc(-2, 0, 6.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(0, -2.5, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    'eye-happy': {
      w: 22, h: 14,
      draw(ctx) {
        strokeInk(ctx)
        ctx.beginPath()
        ctx.moveTo(-9, 4)
        ctx.quadraticCurveTo(0, -8, 9, 4)
        ctx.stroke()
      }
    },
    'eye-closed': {
      w: 22, h: 12,
      draw(ctx) {
        strokeInk(ctx)
        ctx.beginPath()
        ctx.moveTo(-9, -2)
        ctx.quadraticCurveTo(0, 7, 9, -2)
        ctx.stroke()
      }
    },
    'eye-low': {
      w: 22, h: 12,
      draw(ctx) {
        strokeInk(ctx, 4)
        ctx.beginPath()
        ctx.moveTo(-9, -2); ctx.lineTo(9, -2)
        ctx.stroke()
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.moveTo(-9, -2)
        ctx.quadraticCurveTo(0, 3, 9, -2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    },
    'eye-sad': {
      w: 24, h: 18,
      draw(ctx) {
        strokeInk(ctx)
        ctx.beginPath()
        ctx.moveTo(-9, 2)
        ctx.quadraticCurveTo(0, 9, 9, 2)
        ctx.stroke()
        strokeInk(ctx, 3.5)
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.moveTo(-10, -7)
        ctx.quadraticCurveTo(-2, -10, 8, -7)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    },
    'eye-dizzy': {
      w: 26, h: 14,
      draw(ctx) {
        strokeInk(ctx)
        ctx.beginPath()
        ctx.moveTo(-11, -5); ctx.lineTo(1, 3)
        ctx.moveTo(1, -5); ctx.lineTo(-11, 3)
        ctx.stroke()
      }
    },
    'eye-dead': {
      w: 24, h: 16,
      draw(ctx) {
        strokeInk(ctx)
        ctx.beginPath()
        ctx.moveTo(-10, -6); ctx.lineTo(2, 6)
        ctx.moveTo(2, -6); ctx.lineTo(-10, 6)
        ctx.stroke()
      }
    },

    // ---- 嘴 ----
    'mouth-smile': {
      w: 22, h: 10,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-9, -2)
        ctx.quadraticCurveTo(0, 5, 9, -2)
        ctx.stroke()
      }
    },
    'mouth-laugh': {
      w: 24, h: 16,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-11, -5)
        ctx.quadraticCurveTo(0, 9, 11, -5)
        ctx.stroke()
        ctx.fillStyle = '#F2808C'
        ctx.beginPath()
        ctx.ellipse(0, 3, 5, 4, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    'mouth-flat': {
      w: 20, h: 8,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-8, 0); ctx.lineTo(8, 0)
        ctx.stroke()
      }
    },
    'mouth-sad': {
      w: 22, h: 10,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-9, 4)
        ctx.quadraticCurveTo(0, -3, 9, 4)
        ctx.stroke()
      }
    },
    'mouth-sick': {
      w: 20, h: 10,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-8, 0)
        ctx.quadraticCurveTo(-3, 4, 0, 0)
        ctx.quadraticCurveTo(3, -4, 6, 0)
        ctx.stroke()
      }
    },
    'mouth-sleep': {
      w: 16, h: 12,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-6, 0)
        ctx.quadraticCurveTo(0, 6, 6, 0)
        ctx.quadraticCurveTo(0, 2, -6, 0)
        ctx.stroke()
      }
    },
    'mouth-open': {
      w: 22, h: 18,
      draw(ctx) {
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#F2808C'
        ctx.beginPath()
        ctx.ellipse(0, 4, 6, 3.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    'mouth-chew': {
      w: 18, h: 10,
      draw(ctx) {
        strokeInk(ctx, 3.6)
        ctx.beginPath()
        ctx.moveTo(-7, 0); ctx.lineTo(7, 0)
        ctx.stroke()
        ctx.beginPath()
        ctx.ellipse(0, 1, 4, 2.5, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    },

    // ---- 鼻吻 ----
    'snout-cat': {
      w: 18, h: 14,
      draw(ctx) {
        ctx.fillStyle = '#E88AA0'
        ctx.beginPath()
        ctx.moveTo(-7, -5)
        ctx.lineTo(7, -5)
        ctx.lineTo(0, 5)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.arc(-2, -3, 1.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    'snout-dog': {
      w: 36, h: 24,
      draw(ctx) {
        ctx.fillStyle = belly
        ctx.beginPath()
        ctx.ellipse(0, 2, 16, 11, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.ellipse(0, -3, 7.5, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.arc(-2.5, -5, 1.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    'snout-pig': {
      w: 32, h: 24,
      draw(ctx) {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.8
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.ellipse(-5, 0, 2.6, 3.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(5, 0, 2.6, 3.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    'snout-dino': {
      w: 18, h: 12,
      draw(ctx) {
        ctx.fillStyle = INK
        ctx.globalAlpha = 0.85
        ctx.beginPath()
        ctx.arc(-5, 0, 2.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(5, 0, 2.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },

    // ---- 附加件 ----
    whiskers: {
      w: 38, h: 22,
      draw(ctx) {
        strokeInk(ctx, 2)
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        ctx.moveTo(-2, 0); ctx.lineTo(19, 0)
        ctx.moveTo(-2, 3); ctx.lineTo(18, 7)
        ctx.moveTo(-2, -3); ctx.lineTo(18, -7)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    },
    collar: {
      w: 64, h: 22,
      draw(ctx) {
        ctx.strokeStyle = '#E85D5D'
        ctx.lineWidth = 8
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-28, -6)
        ctx.quadraticCurveTo(0, 8, 28, -6)
        ctx.stroke()
        ctx.fillStyle = '#FFD34E'
        ctx.beginPath()
        ctx.arc(0, 7, 6.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#E0A800'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    },
    tusks: {
      w: 22, h: 16,
      draw(ctx) {
        ctx.fillStyle = '#FFFDF5'
        ctx.strokeStyle = '#E8E0C8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(-8, -7)
        ctx.quadraticCurveTo(-9, 1, -11, 4)
        ctx.quadraticCurveTo(-7, 5, -5, 1)
        ctx.quadraticCurveTo(-4, -3, -5, -7)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(8, -7)
        ctx.quadraticCurveTo(9, 1, 11, 4)
        ctx.quadraticCurveTo(7, 5, 5, 1)
        ctx.quadraticCurveTo(4, -3, 5, -7)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    },
    'side-spikes': {
      w: 26, h: 26,
      draw(ctx) {
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.moveTo(-10, 12); ctx.lineTo(-3, -10); ctx.lineTo(4, 12)
        ctx.moveTo(1, 12); ctx.lineTo(8, -6); ctx.lineTo(13, 12)
        ctx.closePath()
        ctx.fill()
      }
    },
    blush: {
      w: 20, h: 14,
      draw(ctx) {
        ctx.fillStyle = '#FFB6C1'
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
    brows: {
      w: 48, h: 12,
      draw(ctx) {
        ctx.strokeStyle = '#F5F2E8'
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-21, 2)
        ctx.quadraticCurveTo(-13, -4, -5, 0)
        ctx.moveTo(3, -1)
        ctx.quadraticCurveTo(11, -5, 20, 3)
        ctx.stroke()
      }
    }
  }
}

// 物种实际需要绘制的部件集合（其余不占图集空间）
function requiredParts(look) {
  const parts = [
    'body', 'head', 'shadow',
    `ear-${look.ear}`,
    'tail-seg-a', 'leg-front', 'leg-back',
    'eye-normal', 'eye-happy', 'eye-closed', 'eye-low', 'eye-sad', 'eye-dizzy', 'eye-dead',
    'mouth-smile', 'mouth-laugh', 'mouth-flat', 'mouth-sad', 'mouth-sick', 'mouth-sleep',
    'mouth-open', 'mouth-chew',
    `snout-${look.snout}`,
    'blush', 'brows'
  ]
  if (look.tail === 'curly') parts.push('tail-curl')
  else parts.push('tail-seg-b')
  if (look.extra === 'whiskers') parts.push('whiskers')
  if (look.extra === 'collar') parts.push('collar')
  if (look.extra === 'tusks') parts.push('tusks')
  if (look.extra === 'back-spikes') parts.push('side-spikes')
  return parts
}

/**
 * 绘制物种部件图集
 * @returns {{ pageName, width, height, regions, subTextures, drawTo(canvas) }}
 */
export function buildPetParts(species) {
  const look = species.look
  const all = defineParts(look)
  const names = requiredParts(look)
  const width = COLS * CELL
  const height = ROWS * CELL
  const regions = {}

  names.forEach((name, i) => {
    const col = i % COLS
    const row = (i / COLS) | 0
    const cellX = col * CELL
    const cellY = row * CELL
    const part = all[name]
    const x = cellX + Math.floor((CELL - part.w) / 2)
    const y = cellY + Math.floor((CELL - part.h) / 2)
    regions[name] = { x, y, w: part.w, h: part.h, cx: cellX + CELL / 2, cy: cellY + CELL / 2 }
  })

  const drawTo = (canvas) => {
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    for (const name of names) {
      const r = regions[name]
      ctx.save()
      ctx.translate(r.cx, r.cy)
      all[name].draw(ctx, look)
      ctx.restore()
    }
    return regions
  }

  // DragonBones 贴图集 SubTexture（部件即全部内容，无裁剪补偿）
  const subTextures = names.map((name) => {
    const r = regions[name]
    return { name, x: r.x, y: r.y, width: r.w, height: r.h }
  })

  return { pageName: `${species.id}-parts.png`, width, height, regions, subTextures, drawTo }
}

export const PARTS_DEBUG = { CELL, COLS, ROWS, INK }
