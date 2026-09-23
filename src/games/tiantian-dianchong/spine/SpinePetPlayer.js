// ============ 电宠骨骼动画渲染器（spine-webgl） ============
// 消费动作系统的生命周期事件（play/move），把指令的结果实时渲染为
// 2D 骨骼动画：
//   · 纹理图集：parts.js 运行时 Canvas2D 绘制 → 离屏画布直传 GLTexture（预乘）
//   · 骨架数据：skeletonFactory.js 生成的 Spine JSON（含动画）
//   · 渲染循环：rAF → AnimationState → 世界变换 → SceneRenderer
//   · 舞台移动：0-100 抽象坐标 → 画布像素；朝向翻转；到达回报
//   · 环境态：成长阶段缩放 / 长寿白眉 / 病中眩晕眼（程序化覆盖）
//
// WebGL 不可用时 init() 返回 false，由上层降级为 SVG 宠物。

import * as spine from '@esotericsoftware/spine-webgl'
import { buildPetParts } from './parts.js'
import { buildPetSkeleton } from './skeletonFactory.js'

const WALK_SPEED = 15 // 舞台单位/秒（0-100 坐标系）
const PET_FIT = 0.52 // 宠物高度占画布高度比例
const SIDE_PAD = 0.14 // 左右活动边距（占宽度比例）
const STAGE_SCALES = { baby: 0.72, teen: 0.88, adult: 1, elder: 0.96 }

export function createSpinePetPlayer() {
  let canvas = null
  let ctx = null
  let renderer = null
  let gl = null
  let ready = false

  let species = null
  let skeleton = null
  let animState = null
  let atlas = null
  let texture = null

  // 舞台与移动状态
  const stage = { groundY: 0.76, width: 1, height: 1, dpr: 1 }
  const motion = { x: 50, target: null, facing: 1, moving: false, speed: WALK_SPEED }
  const ambient = { stageKey: 'adult', illness: null, dead: false }
  let currentAnim = ''
  let currentLoop = true
  let animationNames = []
  let onArrived = () => {}
  let onFrame = null // 每帧回调（动作系统时间推进）
  let rafId = 0
  let lastT = 0
  let lastReport = 0
  let frames = 0

  // ---- 尺寸与坐标 ----
  function viewSize() {
    return { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 }
  }

  function stageToPx(x) {
    const { w } = viewSize()
    const pad = w * SIDE_PAD
    return pad + (x / 100) * (w - 2 * pad)
  }

  function petScale() {
    const { h } = viewSize()
    const unit = (h * PET_FIT) / 175 // 成年宠物总高约 175 单位
    return unit * (STAGE_SCALES[ambient.stageKey] ?? 1)
  }

  function groundPx() {
    const { h } = viewSize()
    return h * (1 - stage.groundY) // groundY 为距顶比例
  }

  // ---- 初始化 WebGL ----
  function init(canvasEl) {
    canvas = canvasEl
    try {
      ctx = new spine.ManagedWebGLRenderingContext(canvas, {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
      })
      gl = ctx.gl
      renderer = new spine.SceneRenderer(canvas, ctx, true)
      gl.disable(gl.DEPTH_TEST)
      resize()
      ready = true
    } catch (e) {
      ready = false
      console.warn('[dianchong] WebGL 初始化失败，将降级为 SVG 宠物：', e)
    }
    return ready
  }

  function resize() {
    if (!renderer) return
    const w = Math.max(1, canvas.clientWidth)
    const h = Math.max(1, canvas.clientHeight)
    renderer.resize(spine.ResizeMode.Expand)
    // ⚠️ Vector3.set 需要三个参数：z 缺省会变成 undefined → lookAt 平移行 NaN →
    // 投影矩阵损坏 → 所有顶点被裁剪 → 宠物隐形（曾困扰半天的根因）
    renderer.camera.position.set(canvas.width / 2, canvas.height / 2, 0)
    renderer.camera.zoom = 1
    stage.width = w
    stage.height = h
  }

  // ---- 物种装配（图集画布直接上传：UNPACK_PREMULTIPLY_ALPHA_WEBGL 对
  //      HTMLCanvasElement 源稳定生效，纹理必为预乘，与 PMA 混合一致） ----
  async function setSpecies(sp) {
    if (!ready || !sp) return false
    const parts = buildPetParts(sp)
    const off = document.createElement('canvas')
    parts.drawTo(off)

    const nextTexture = new spine.GLTexture(ctx, off, false)
    const nextAtlas = new spine.TextureAtlas(parts.atlasText)
    nextAtlas.pages[0].setTexture(nextTexture)

    const loader = new spine.AtlasAttachmentLoader(nextAtlas)
    const jsonReader = new spine.SkeletonJson(loader)
    const skeletonData = jsonReader.readSkeletonData(buildPetSkeleton(sp).json)

    const nextSkeleton = new spine.Skeleton(skeletonData)
    const stateData = new spine.AnimationStateData(skeletonData)
    stateData.defaultMix = 0.18
    const nextState = new spine.AnimationState(stateData)

    // 释放旧资源
    disposeSpecies()

    species = sp
    skeleton = nextSkeleton
    animState = nextState
    atlas = nextAtlas
    texture = nextTexture
    animationNames = skeletonData.animations.map((a) => a.name)

    // 初始姿态
    applyAmbientFace(true)
    play('idle', true)
    updateDebug(performance.now())
    return true
  }

  function disposeSpecies() {
    try { texture?.dispose() } catch { /* ignore */ }
    species = null
    animationNames = []
    texture = null
    atlas = null
    skeleton = null
    animState = null
  }

  // ---- 动画控制 ----
  function play(animName, loop = true) {
    if (!animState || !animName) return
    if (currentAnim === animName && currentLoop === loop) return
    try {
      animState.setAnimation(0, animName, loop)
      currentAnim = animName
      currentLoop = loop
      applyAmbientFace(true)
      updateDebug(performance.now())
    } catch (e) {
      console.warn(`[dianchong] 动画切换失败：${animName}`, e)
    }
  }

  // ---- 移动控制 ----
  function moveTo(targetX) {
    const t = Math.min(100, Math.max(0, targetX))
    if (Math.abs(t - motion.x) < 1.5) {
      onArrived()
      return
    }
    motion.target = t
    motion.moving = true
    motion.facing = t > motion.x ? 1 : -1
  }

  function haltMove() {
    motion.target = null
    motion.moving = false
  }

  // ---- 环境态 ----
  function setAmbient(next) {
    Object.assign(ambient, next)
    applyAmbientFace(true)
  }

  function setStageConfig(next) {
    Object.assign(stage, next)
    resize()
  }

  /** 当前插槽附件名（无附件返回 null） */
  function slotAttachmentName(slotName) {
    try {
      return skeleton.findSlot(slotName)?.appliedPose?.attachment?.name ?? null
    } catch {
      return null
    }
  }

  /**
   * 环境表情覆盖：仅作用于无表情时间线的姿态（idle/walk/stare）。
   * 病中 → 眩晕眼 + 病嘴；长寿 → 白眉（动画从不触碰 brows 插槽）。
   */
  function applyAmbientFace(force = false) {
    if (!skeleton) return
    const neutralAnim = ['idle', 'walk', 'stare', ''].includes(currentAnim)
    const dizzy = !!ambient.illness && !ambient.dead && neutralAnim
    if (force || dizzy) {
      try {
        if (dizzy) {
          skeleton.setAttachment('eye-l', 'eye-dizzy')
          skeleton.setAttachment('eye-r', 'eye-dizzy')
          skeleton.setAttachment('mouth', 'mouth-sick')
        } else if (force && slotAttachmentName('eye-l') === 'eye-dizzy') {
          // 病愈复位（动画时间线随后接管眨眼）
          skeleton.setAttachment('eye-l', 'eye-normal')
          skeleton.setAttachment('eye-r', 'eye-normal')
          skeleton.setAttachment('mouth', 'mouth-smile')
        }
      } catch { /* 插槽缺失时静默 */ }
    }
    // 长寿白眉：按插槽「当前」附件判断（getAttachment 查的是皮肤而非当前值）
    try {
      const wantBrows = ambient.stageKey === 'elder' && !ambient.dead
      if (wantBrows !== (slotAttachmentName('brows') !== null)) {
        skeleton.setAttachment('brows', wantBrows ? 'brows' : null)
      }
    } catch { /* ignore */ }
  }

  // ---- 渲染循环 ----
  function frame(t) {
    rafId = requestAnimationFrame(frame)
    if (!ready || !skeleton || document.hidden) {
      lastT = t
      return
    }
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000 || 0.016))
    lastT = t

    // 动画推进
    animState.update(dt)
    animState.apply(skeleton)

    // 舞台移动插值
    if (motion.moving && motion.target !== null) {
      const step = motion.speed * dt
      const d = motion.target - motion.x
      if (Math.abs(d) <= step) {
        motion.x = motion.target
        motion.moving = false
        motion.target = null
        onArrived()
      } else {
        motion.x += Math.sign(d) * step
      }
    }

    // 程序化姿态：位置 / 朝向 / 阶段缩放
    const s = petScale()
    skeleton.x = stageToPx(motion.x)
    skeleton.y = groundPx()
    skeleton.scaleX = motion.facing * s
    skeleton.scaleY = s
    skeleton.updateWorldTransform(spine.Physics.update)

    // 环境表情覆盖（在 apply 之后）
    applyAmbientFace(false)

    // 清屏（透明）+ 绘制
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    renderer.begin()
    renderer.drawSkeleton(skeleton)
    renderer.end()
    frames++

    // 位置回报（100ms 节流）
    if (t - lastReport > 100) {
      lastReport = t
      onFrame?.(motion.x, motion.facing, currentAnim)
    }
    updateDebug(t)
  }

  function start(onArrivedCb, onFrameCb) {
    onArrived = onArrivedCb || (() => {})
    onFrame = onFrameCb || null
    if (!rafId) rafId = requestAnimationFrame(frame)
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  function dispose() {
    stop()
    disposeSpecies()
    try { renderer?.dispose() } catch { /* ignore */ }
    try { ctx?.dispose?.() } catch { /* ignore */ }
    ready = false
    if (window.__spineDebug) delete window.__spineDebug
  }

  // ---- 调试钩子（E2E 与现场排查用；250ms 节流避免每帧开销） ----
  let lastDebugAt = 0
  function updateDebug(now) {
    if (now - lastDebugAt < 250) return
    lastDebugAt = now
    window.__spineDebug = {
      ready,
      engine: 'spine-webgl',
      version: '4.3',
      speciesId: species?.id ?? null,
      bones: skeleton?.bones.length ?? 0,
      slots: skeleton?.slots.length ?? 0,
      animations: animationNames,
      currentAnim,
      loop: currentLoop,
      x: Math.round(motion.x * 10) / 10,
      facing: motion.facing,
      moving: motion.moving,
      stageKey: ambient.stageKey,
      frames,
      canvasW: canvas?.width ?? 0,
      canvasH: canvas?.height ?? 0,
      slotAtt: skeleton ? skeleton.slots.filter((s) => s.appliedPose.attachment).length : 0,
      glErr: gl ? gl.getError() : -1
    }
  }

  return {
    init,
    setSpecies,
    play,
    moveTo,
    haltMove,
    setAmbient,
    setStageConfig,
    start,
    stop,
    dispose,
    resize,
    isReady: () => ready,
    hasSpecies: () => !!skeleton,
    position: () => ({ x: motion.x, facing: motion.facing, moving: motion.moving }),
    current: () => ({ anim: currentAnim, loop: currentLoop })
  }
}
