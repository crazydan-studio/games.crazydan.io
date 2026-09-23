// ============ 电宠骨架工厂：物种 → DragonBones 5.5 JSON 骨架 ============
// 骨架为正面 Q 版造型（与 PetAvatar SVG 同源）：
//   root(舞台移动) → body(呼吸/摇晃) → 四腿 + 尾巴两段 + head(点头) → 耳/眼
// 部件贴图来自 parts.js 生成的图集画布；表情（眼睛/嘴巴/腮红/眉毛）通过
// 插槽「显示列表切换」(displayIndex) 实现，可被动画时间线或环境状态驱动。
//
// 坐标系换算（源自 Spine 时代的 y-up 装配 → DragonBones y-down）：
//   · 骨骼/显示 setup：y 取负、旋转角取负（skX = -rot）
//   · 动画增量：translate y 取负、rotate 取负；scale 为乘法系数不变
//   · 时间线数值为相对 setup pose 的增量（translate 加法 / rotate 加法 /
//     scale 乘法），与运行时 Bone.update 的合成公式一致
//   · 图像显示默认锚点为图像中心（pivot 0.5,0.5），与部件绘制原点一致
//
// 动画帧格式（5.5 拆分时间线）：
//   · translateFrame/rotateFrame/scaleFrame/displayFrame
//   · duration 为「该帧持续帧数」，帧值即该帧起始状态，向下一帧插值
//   · 循环动画末尾追加 duration:0 的回环帧（重复首帧值），保证无缝循环
//
// 产出 buildPetDragonBones(species) → {
//   skeleton      // DragonBones 骨架数据（含动画），可直接 parseDragonBonesData
//   textureAtlas  // DragonBones 贴图集 JSON（SubTexture 与 parts.regions 对应）
//   boneNames, slotNames, animationNames,
//   displayIndexOf(slot, name)  // 插槽显示名 → 显示下标（环境表情覆盖用）
// }
// ⚠ 贴图集 name 必须与骨架 name 相同（buildArmatureDisplay 按骨架名检索
//   _textureAtlasDataMap；预设资产均为同名约定：cat/cat、dog/dog、Dragon_1/Dragon_1）

import { buildPetParts } from './parts.js'
import { buildAnimations, ANIMATION_NAMES } from './animations.js'

const FPS = 30
// 循环动画（需要回环闭合帧；与 actionSystem 的 loop 语义对齐）
const LOOP_ANIMS = new Set(['idle', 'walk', 'stare', 'sleep', 'sad', 'coma', 'dead'])

// ---- 骨骼装配表（setup pose；y-down，相对父骨骼） ----
// 耳朵骨骼与附件偏移按耳型适配（直立型在上，垂耳沿头侧下垂）
function rigBones(look) {
  const bone = (name, parent, x, y, rot = 0) => ({
    name,
    ...(parent ? { parent } : {}),
    transform: {
      x: Math.round(x * 100) / 100,
      y: Math.round(-y * 100) / 100, // y 翻转（y-up → y-down）
      ...(rot ? { skX: -rot, skY: -rot } : {})
    }
  })

  const bones = [
    { name: 'root' },
    bone('body', 'root', 0, 58),
    bone('leg-bl', 'body', -31, -37),
    bone('leg-br', 'body', 31, -37),
    bone('tail-1', 'body', 48, 4, 35),
    bone('tail-2', 'tail-1', 26, 0),
    bone('leg-fl', 'body', -22, -39),
    bone('leg-fr', 'body', 22, -39),
    bone('head', 'body', 0, 56),
    bone('eye-l', 'head', -16, 6),
    bone('eye-r', 'head', 16, 6)
  ]

  const EAR_RIG = {
    pointed: { x: 34, y: 22, rot: 8, ay: 12, arot: 12 },
    floppy: { x: 34, y: 38, rot: 8, ay: -14, arot: 6 },
    round: { x: 32, y: 26, rot: 6, ay: 8, arot: 8 },
    horn: { x: 34, y: 30, rot: 8, ay: 10, arot: 12 }
  }
  const ear = EAR_RIG[look.ear] || EAR_RIG.pointed
  // Spine：ear-l rotation -ear.rot / ear-r +ear.rot → DB 取负反转
  bones.push(bone('ear-l', 'head', -ear.x, ear.y, -ear.rot))
  bones.push(bone('ear-r', 'head', ear.x, ear.y, ear.rot))

  return { bones, ear }
}

// ---- 插槽（数组顺序 = 绘制顺序：后→前） ----
// displayIndex：-1 表示默认隐藏（腮红/眉毛按需亮出；卷尾物种尾梢空置）
function rigSlots(look) {
  const slot = (name, parent, displayIndex = 0) => ({
    name,
    parent,
    ...(displayIndex ? { displayIndex } : {})
  })

  const slots = [
    slot('shadow', 'root'),
    slot('tail-2', 'tail-2'),
    slot('tail-1', 'tail-1'),
    slot('leg-bl', 'leg-bl'),
    slot('leg-br', 'leg-br')
  ]

  if (look.extra === 'back-spikes') {
    slots.push(slot('spike-l', 'body'), slot('spike-r', 'body'))
  }

  slots.push(
    slot('body', 'body'),
    slot('leg-fl', 'leg-fl'),
    slot('leg-fr', 'leg-fr'),
    slot('ear-l', 'ear-l'),
    slot('ear-r', 'ear-r'),
    slot('head', 'head'),
    slot('eye-l', 'eye-l'),
    slot('eye-r', 'eye-r'),
    slot('blush-l', 'head', -1),
    slot('blush-r', 'head', -1),
    slot('snout', 'head'),
    slot('mouth', 'head')
  )

  if (look.extra === 'collar') slots.push(slot('collar', 'body'))
  if (look.extra === 'whiskers') slots.push(slot('whisker-l', 'head'), slot('whisker-r', 'head'))
  if (look.extra === 'tusks') slots.push(slot('tusks', 'head'))
  slots.push(slot('brows', 'head', -1)) // 长寿白眉：环境状态按需亮出

  return slots
}

// ---- 表情显示清单（决定各插槽的 displayIndex 语义） ----
const EYE_DISPLAYS = ['eye-normal', 'eye-happy', 'eye-closed', 'eye-low', 'eye-sad', 'eye-dizzy', 'eye-dead']
const MOUTH_DISPLAYS = ['mouth-smile', 'mouth-laugh', 'mouth-flat', 'mouth-sad', 'mouth-sick', 'mouth-sleep', 'mouth-open', 'mouth-chew']

// ---- 默认皮肤（image 显示；中心锚点，镜像用 scX:-1） ----
function rigSkin(look, earRig) {
  const image = (path, o = {}) => ({
    type: 'image',
    name: path,
    path,
    transform: {
      x: Math.round((o.x ?? 0) * 100) / 100,
      y: Math.round(-(o.y ?? 0) * 100) / 100, // y 翻转
      ...(o.rotation ? { skX: -o.rotation, skY: -o.rotation } : {}),
      ...(o.scaleX !== undefined && o.scaleX !== 1 ? { scX: o.scaleX } : {})
    }
  })

  const snoutRig = (style) => {
    const base = {
      cat: { y: -13 },
      dog: { y: -15 },
      pig: { y: -16 },
      dino: { y: -12 }
    }
    return base[style] || base.cat
  }

  const displays = {
    // 尾巴：分段的直立尾 / 猪猪卷尾
    'tail-1': look.tail === 'curly'
      ? [image('tail-curl', { x: 12, y: 2, rotation: -12 })]
      : [image('tail-seg-a', { x: 13, y: 0 })],
    'tail-2': look.tail === 'curly' ? [null] : [image('tail-seg-b', { x: 11, y: 0 })],
    shadow: [image('shadow', { y: 12 })],
    'leg-bl': [image('leg-back')],
    'leg-br': [image('leg-back')],
    'leg-fl': [image('leg-front')],
    'leg-fr': [image('leg-front')],
    body: [image('body', { y: -6 })],
    'ear-l': [image(`ear-${look.ear}`, { y: earRig.ay, rotation: -earRig.arot })],
    'ear-r': [image(`ear-${look.ear}`, { y: earRig.ay, rotation: earRig.arot, scaleX: -1 })],
    head: [image('head')],
    'eye-l': EYE_DISPLAYS.map((n) => image(n)),
    'eye-r': EYE_DISPLAYS.map((n) => image(n)),
    'blush-l': [image('blush', { x: -30, y: -12 })],
    'blush-r': [image('blush', { x: 30, y: -12, scaleX: -1 })],
    snout: [image(`snout-${look.snout}`, snoutRig(look.snout))],
    mouth: MOUTH_DISPLAYS.map((n) => image(n)),
    brows: [image('brows', { y: 24 })]
  }

  // 附加件
  if (look.extra === 'back-spikes') {
    displays['spike-l'] = [image('side-spikes', { x: -46, y: 6 })]
    displays['spike-r'] = [image('side-spikes', { x: 46, y: 6, scaleX: -1 })]
  }
  if (look.extra === 'collar') displays.collar = [image('collar', { y: 16 })]
  if (look.extra === 'whiskers') {
    displays['whisker-l'] = [image('whiskers', { x: -44, y: -6, scaleX: -1 })]
    displays['whisker-r'] = [image('whiskers', { x: 44, y: -6 })]
  }
  if (look.extra === 'tusks') displays.tusks = [image('tusks', { y: -34 })]

  const skinSlot = (name) => ({ name, display: displays[name] })
  return [{ slot: Object.keys(displays).map(skinSlot) }]
}

// ---- 中性时间线 → DragonBones 帧 ----
const fr = (t) => Math.round(t * FPS)

/**
 * 把一条关键帧数组转为帧数组（duration 累进）
 *  循环动画：末尾追加 duration:0 的回环帧（重复首帧值，无缓动）
 *  一次性动画：末帧带真实 duration 且无缓动（保持末值，避免回漂）
 */
function toFrames(keyframes, isLoop, pickValues) {
  const frames = []
  const times = keyframes.map((k) => fr(k.time))
  const last = keyframes.length - 1
  for (let i = 0; i < keyframes.length; i++) {
    const isEnd = i === last
    const isClosure = isEnd && isLoop
    let duration
    if (isClosure) {
      duration = 0 // 回环帧：标记循环点，本身不占时长
    } else if (isEnd) {
      duration = 1 // 一次性末帧：至少占 1 帧，保持末值到动画结束
    } else {
      duration = Math.max(1, times[i + 1] - times[i])
    }
    const kf = isClosure ? keyframes[0] : keyframes[i]
    frames.push({
      duration,
      ...(isEnd ? {} : { tweenEasing: 0 }),
      ...pickValues(kf)
    })
  }
  return frames
}

/** 单条骨骼时间线（translate/rotate/scale 之一） */
function boneTimelineFrames(prop, keyframes, isLoop) {
  const pick = {
    translate: (k) => ({ x: Math.round(k.x * 100) / 100, y: Math.round(-k.y * 100) / 100 }),
    rotate: (k) => ({ rotate: Math.round(-k.angle * 100) / 100 }),
    scale: (k) => ({ x: Math.round(k.x * 1000) / 1000, y: Math.round(k.y * 1000) / 1000 })
  }[prop]
  return toFrames(keyframes, isLoop, pick)
}

/** 转换一个动画（中性 → DragonBones） */
function convertAnimation(name, neutral, displayIndexOf) {
  const isLoop = LOOP_ANIMS.has(name)
  const boneEntries = []
  for (const [boneName, timelines] of Object.entries(neutral.bones || {})) {
    const entry = { name: boneName }
    let has = false
    if (timelines.translate?.length) {
      entry.translateFrame = boneTimelineFrames('translate', timelines.translate, isLoop)
      has = true
    }
    if (timelines.rotate?.length) {
      entry.rotateFrame = boneTimelineFrames('rotate', timelines.rotate, isLoop)
      has = true
    }
    if (timelines.scale?.length) {
      entry.scaleFrame = boneTimelineFrames('scale', timelines.scale, isLoop)
      has = true
    }
    if (has) boneEntries.push(entry)
  }

  // 插槽显示切换时间线
  const slotEntries = []
  for (const [slotName, tl] of Object.entries(neutral.slots || {})) {
    const kfs = tl.attachment || []
    if (!kfs.length) continue
    const frames = toFrames(kfs, isLoop, (k) => {
      const idx = k.name === null ? -1 : displayIndexOf(slotName, k.name)
      return { value: idx }
    })
    slotEntries.push({ name: slotName, displayFrame: frames })
  }

  // 总时长 = 骨骼/插槽帧 duration 之和的最大值
  let duration = 0
  for (const b of boneEntries) {
    for (const key of ['translateFrame', 'rotateFrame', 'scaleFrame']) {
      if (b[key]) duration = Math.max(duration, b[key].reduce((s, f) => s + f.duration, 0))
    }
  }
  for (const s of slotEntries) {
    duration = Math.max(duration, s.displayFrame.reduce((s2, f) => s2 + f.duration, 0))
  }

  const anim = { name, duration: Math.max(1, duration), playTimes: 0 }
  if (boneEntries.length) anim.bone = boneEntries
  if (slotEntries.length) anim.slot = slotEntries
  return anim
}

/**
 * 构建物种的完整 DragonBones 骨架数据（含全部动画）与贴图集
 */
export function buildPetDragonBones(species) {
  const look = species.look
  const parts = buildPetParts(species)
  const { bones, ear } = rigBones(look)
  const slots = rigSlots(look)
  const skin = rigSkin(look, ear)
  const neutral = buildAnimations(species)

  // 插槽显示名 → 下标（表情覆盖与动画 displayFrame 共用的语义源）
  const indexMaps = {}
  for (const s of skin[0].slot) {
    indexMaps[s.name] = {}
    s.display.forEach((d, i) => {
      if (d) indexMaps[s.name][d.name] = i
    })
  }
  const displayIndexOf = (slotName, displayName) => {
    const idx = indexMaps[slotName]?.[displayName]
    if (idx === undefined) throw new Error(`物种 ${species.id} 插槽 ${slotName} 无显示 ${displayName}`)
    return idx
  }

  const animations = ANIMATION_NAMES.map((name) =>
    convertAnimation(name, neutral[name] || { bones: {}, slots: {} }, displayIndexOf)
  )

  const skeleton = {
    frameRate: FPS,
    name: species.id,
    version: '5.5',
    compatibleVersion: '5.5',
    type: 'DragonBones',
    armature: [
      {
        type: 'Armature',
        frameRate: FPS,
        name: species.id,
        aabb: { x: -95, y: -178, width: 190, height: 175 },
        bone: bones,
        slot: slots,
        skin,
        animation: animations
      }
    ]
  }

  const textureAtlas = {
    // ⚠ 贴图集名必须与骨架同名（buildArmatureDisplay 按骨架名查找
    // _textureAtlasDataMap；预设资产均为同名约定）
    name: species.id,
    imagePath: parts.pageName,
    width: parts.width,
    height: parts.height,
    SubTexture: parts.subTextures
  }

  return {
    skeleton,
    textureAtlas,
    boneNames: bones.map((b) => b.name),
    slotNames: slots.map((s) => s.name),
    animationNames: ANIMATION_NAMES.slice(),
    displayIndexOf,
    drawTo: parts.drawTo,
    textureSize: { width: parts.width, height: parts.height }
  }
}

export const RIG_BONES = ['root', 'body', 'leg-bl', 'leg-br', 'tail-1', 'tail-2', 'leg-fl', 'leg-fr', 'head', 'ear-l', 'ear-r', 'eye-l', 'eye-r']
