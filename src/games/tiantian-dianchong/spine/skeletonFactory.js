// ============ 电宠骨架工厂：物种 → Spine JSON 骨架 ============
// 骨架为正面 Q 版造型（与 PetAvatar SVG 同源）：
//   root(舞台移动) → body(呼吸/摇晃) → 四腿 + 尾巴两段 + head(点头) → 耳/眼
// 部件贴图来自 parts.js 生成的图集；表情（眼睛/嘴巴/腮红/眉毛）通过
// 附件换装 (attachment swap) 实现，可被动画时间线或环境状态驱动。
//
// 产出 buildPetSkeleton(species) → {
//   json: Spine 骨架数据（含动画），width/height, boneNames, slotNames
// }
// 坐标系：Spine y 向上，地面 y=0；成年宠物总高约 170 单位。

import { buildAnimations } from './animations.js'

// ---- 骨骼装配表（setup pose；y-up，相对父骨骼） ----
// earBones/earAttach 因耳型差异单独参数化
function rigBones(look) {
  const bones = [
    { name: 'root' },
    { name: 'body', parent: 'root', x: 0, y: 58, length: 40 },
    { name: 'leg-bl', parent: 'body', x: -31, y: -37, length: 22 },
    { name: 'leg-br', parent: 'body', x: 31, y: -37, length: 22 },
    { name: 'tail-1', parent: 'body', x: 48, y: 4, rotation: 35, length: 26 },
    { name: 'tail-2', parent: 'tail-1', x: 26, y: 0, length: 22 },
    { name: 'leg-fl', parent: 'body', x: -22, y: -39, length: 22 },
    { name: 'leg-fr', parent: 'body', x: 22, y: -39, length: 22 },
    { name: 'head', parent: 'body', x: 0, y: 56, length: 36 },
    { name: 'eye-l', parent: 'head', x: -16, y: 6 },
    { name: 'eye-r', parent: 'head', x: 16, y: 6 }
  ]

  // 耳朵骨骼与附件偏移按耳型适配（直立型在上，垂耳沿头侧下垂）
  const EAR_RIG = {
    pointed: { x: 34, y: 22, rot: 8, ay: 12, arot: 12 },
    floppy: { x: 34, y: 38, rot: 8, ay: -14, arot: 6 },
    round: { x: 32, y: 26, rot: 6, ay: 8, arot: 8 },
    horn: { x: 34, y: 30, rot: 8, ay: 10, arot: 12 }
  }
  const ear = EAR_RIG[look.ear] || EAR_RIG.pointed
  bones.push({ name: 'ear-l', parent: 'head', x: -ear.x, y: ear.y, rotation: -ear.rot, length: 28 })
  bones.push({ name: 'ear-r', parent: 'head', x: ear.x, y: ear.y, rotation: ear.rot, length: 28 })

  return { bones, ear }
}

// ---- 插槽（数组顺序 = 绘制顺序：后→前） ----
// 注意：未声明 attachment 的插槽，Spine 只会匹配「与插槽同名」的皮肤附件——
// 尾巴附件名（tail-seg-a/b、tail-curl）与插槽名不同，必须显式声明默认附件，
// 否则宠物会没有尾巴（卷尾物种的尾梢插槽有意留空）。
function rigSlots(look) {
  const slots = [
    { name: 'shadow', bone: 'root', attachment: 'shadow' },
    { name: 'tail-2', bone: 'tail-2', ...(look.tail !== 'curly' ? { attachment: 'tail-seg-b' } : {}) },
    { name: 'tail-1', bone: 'tail-1', attachment: look.tail === 'curly' ? 'tail-curl' : 'tail-seg-a' },
    { name: 'leg-bl', bone: 'leg-bl', attachment: 'leg-back' },
    { name: 'leg-br', bone: 'leg-br', attachment: 'leg-back' }
  ]

  if (look.extra === 'back-spikes') {
    slots.push({ name: 'spike-l', bone: 'body', attachment: 'side-spikes' })
    slots.push({ name: 'spike-r', bone: 'body', attachment: 'side-spikes' })
  }

  slots.push(
    { name: 'body', bone: 'body', attachment: 'body' },
    { name: 'leg-fl', bone: 'leg-fl', attachment: 'leg-front' },
    { name: 'leg-fr', bone: 'leg-fr', attachment: 'leg-front' },
    { name: 'ear-l', bone: 'ear-l', attachment: `ear-${look.ear}` },
    { name: 'ear-r', bone: 'ear-r', attachment: `ear-${look.ear}` },
    { name: 'head', bone: 'head', attachment: 'head' },
    { name: 'eye-l', bone: 'eye-l', attachment: 'eye-normal' },
    { name: 'eye-r', bone: 'eye-r', attachment: 'eye-normal' },
    { name: 'blush-l', bone: 'head' },
    { name: 'blush-r', bone: 'head' },
    { name: 'snout', bone: 'head', attachment: `snout-${look.snout}` },
    { name: 'mouth', bone: 'head', attachment: 'mouth-smile' }
  )

  if (look.extra === 'collar') slots.push({ name: 'collar', bone: 'body', attachment: 'collar' })
  if (look.extra === 'whiskers') {
    slots.push({ name: 'whisker-l', bone: 'head', attachment: 'whiskers' })
    slots.push({ name: 'whisker-r', bone: 'head', attachment: 'whiskers' })
  }
  if (look.extra === 'tusks') slots.push({ name: 'tusks', bone: 'head', attachment: 'tusks' })
  slots.push({ name: 'brows', bone: 'head' }) // 长寿白眉：环境状态按需挂载

  return slots
}

// ---- 默认皮肤（region 附件；镜像用 scaleX:-1） ----
function rigSkin(look, earRig) {
  const region = (path, o = {}) => ({
    type: 'region',
    path,
    x: o.x ?? 0,
    y: o.y ?? 0,
    rotation: o.rotation ?? 0,
    width: o.width,
    height: o.height,
    ...(o.scaleX !== undefined ? { scaleX: o.scaleX } : {})
  })

  const att = {
    // 尾巴：分段的直立尾 / 猪猪卷尾
    'tail-1': {
      'tail-seg-a': region('tail-seg-a', { x: 13, y: 0, width: 32, height: 16 })
    },
    'tail-2': {
      ...(look.tail === 'curly' ? {} : {
        'tail-seg-b': region('tail-seg-b', { x: 11, y: 0, width: 28, height: 16 })
      })
    },
    shadow: { shadow: region('shadow', { x: 0, y: 12, width: 90, height: 16 }) },
    'leg-bl': { 'leg-back': region('leg-back', { width: 20, height: 32 }) },
    'leg-br': { 'leg-back': region('leg-back', { width: 20, height: 32 }) },
    'leg-fl': { 'leg-front': region('leg-front', { width: 20, height: 32 }) },
    'leg-fr': { 'leg-front': region('leg-front', { width: 20, height: 32 }) },
    body: { body: region('body', { y: -6, width: 96, height: 80 }) },
    'ear-l': {
      [`ear-${look.ear}`]: region(`ear-${look.ear}`, {
        y: earRig.ay, rotation: -earRig.arot,
        width: earWidth(look.ear), height: earHeight(look.ear)
      })
    },
    'ear-r': {
      [`ear-${look.ear}`]: region(`ear-${look.ear}`, {
        y: earRig.ay, rotation: earRig.arot, scaleX: -1,
        width: earWidth(look.ear), height: earHeight(look.ear)
      })
    },
    head: { head: region('head', { width: 92, height: 92 }) },
    'eye-l': { 'eye-normal': region('eye-normal', { width: 22, height: 16 }) },
    'eye-r': { 'eye-normal': region('eye-normal', { width: 22, height: 16 }) },
    'blush-l': { blush: region('blush', { x: -30, y: -12, width: 20, height: 14 }) },
    'blush-r': { blush: region('blush', { x: 30, y: -12, scaleX: -1, width: 20, height: 14 }) },
    snout: { [`snout-${look.snout}`]: region(`snout-${look.snout}`, snoutRig(look.snout)) },
    mouth: { 'mouth-smile': region('mouth-smile', { y: -24, width: 22, height: 10 }) },
    brows: { brows: region('brows', { y: 24, width: 48, height: 12 }) }
  }

  // 卷尾：贴在 tail-1 根部
  if (look.tail === 'curly') {
    att['tail-1'] = { 'tail-curl': region('tail-curl', { x: 12, y: 2, rotation: -12, width: 38, height: 34 }) }
  }

  // 附加件
  if (look.extra === 'back-spikes') {
    att['spike-l'] = { 'side-spikes': region('side-spikes', { x: -46, y: 6, width: 26, height: 26 }) }
    att['spike-r'] = { 'side-spikes': region('side-spikes', { x: 46, y: 6, scaleX: -1, width: 26, height: 26 }) }
  }
  if (look.extra === 'collar') {
    att.collar = { collar: region('collar', { y: 16, width: 64, height: 22 }) }
  }
  if (look.extra === 'whiskers') {
    att['whisker-l'] = { whiskers: region('whiskers', { x: -44, y: -6, scaleX: -1, width: 38, height: 22 }) }
    att['whisker-r'] = { whiskers: region('whiskers', { x: 44, y: -6, width: 38, height: 22 }) }
  }
  if (look.extra === 'tusks') {
    att.tusks = { tusks: region('tusks', { y: -34, width: 22, height: 16 }) }
  }

  return [{ name: 'default', attachments: att }]
}

const earWidth = (style) => ({ pointed: 30, floppy: 28, round: 30, horn: 22 })[style] || 30
const earHeight = (style) => ({ pointed: 38, floppy: 50, round: 30, horn: 30 })[style] || 38

function snoutRig(style) {
  const base = {
    cat: { y: -13, width: 18, height: 14 },
    dog: { y: -15, width: 36, height: 24 },
    pig: { y: -16, width: 32, height: 24 },
    dino: { y: -12, width: 18, height: 12 }
  }
  return base[style] || base.cat
}

/**
 * 构建物种的完整 Spine 骨架数据（含全部动画）
 */
export function buildPetSkeleton(species) {
  const look = species.look
  const { bones, ear } = rigBones(look)
  const slots = rigSlots(look)
  const skins = rigSkin(look, ear)
  const animations = buildAnimations(species)

  const json = {
    skeleton: {
      spine: '4.3',
      hash: '',
      version: '4.3',
      x: -90,
      y: 0,
      width: 180,
      height: 175,
      fps: 30
    },
    bones,
    slots,
    skins,
    animations
  }

  return {
    json,
    boneNames: bones.map((b) => b.name),
    slotNames: slots.map((s) => s.name),
    animationNames: Object.keys(animations)
  }
}

export const RIG_BONES = ['root', 'body', 'leg-bl', 'leg-br', 'tail-1', 'tail-2', 'leg-fl', 'leg-fr', 'head', 'ear-l', 'ear-r', 'eye-l', 'eye-r']
