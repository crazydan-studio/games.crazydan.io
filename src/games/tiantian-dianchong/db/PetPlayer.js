// ============ 电宠骨骼动画渲染器（PixiJS + DragonBones） ============
// 消费动作系统的生命周期事件（play/move），把指令的结果实时渲染为
// 2D 骨骼动画：
//   · 预设资产（猫/狗/恐龙）：assets/db/ 下的 DragonBones 5.x JSON + 贴图
//   · 程序化资产（猪/AI 物种）：skeletonFactory 运行时生成骨架与动画数据
//   · 渲染循环：PIXI Ticker → PixiFactory.advanceTime → 骨架世界变换
//   · 舞台移动：0-100 抽象坐标 → 画布像素；armature.flipX 原生镜像
//     （恐龙原画朝左，经 facingBase 基准翻转）
//   · 姿态变换：睡卧旋转 / 播放速率 / 明暗 / 寒颤抖动（弥补预设动画词汇）
//   · 环境态：成长阶段缩放 / 长寿白眉 / 病中眩晕眼（程序化骨架）
//
// ⚠ 历史坑（务必保持的修复）：
//   · 骨架与贴图集 JSON 同名（cat/cat）：解析记帐必须分两个 Set，
//     否则贴图集被跳过 → 插槽全部 1×1 空纹理 → 宠物隐形
//   · 程序化贴图集 name 必须与骨架同名（按骨架名检索贴图集）
//
// WebGL 不可用时 init() 返回 false，由上层降级为 SVG 宠物。

import { Application, Texture } from 'pixi.js'
import { PixiFactory } from 'pixi-dragonbones-runtime'
import { buildPetDragonBones } from './skeletonFactory.js'
import { loadPresetAsset, DB_ASSETS } from './assets.js'
import { resolveAnim } from './animationMap.js'

const WALK_SPEED = 15 // 舞台单位/秒（0-100 坐标系）
const PET_FIT = 0.55 // 宠物高度占画布高度比例
const SIDE_PAD = 0.14 // 左右活动边距（占宽度比例）
const STAGE_SCALES = { baby: 0.72, teen: 0.88, adult: 1, elder: 0.96 }
// 环境表情覆盖仅作用于无表情时间线的姿态（与动画时间线互不踩踏）
const NEUTRAL_ANIMS = ['idle', 'walk', 'stare', '']

export function createDbPetPlayer() {
  let canvas = null
  let app = null
  let ready = false

  let factory = null
  let armature = null // PixiArmatureDisplay
  let assetKey = 'procedural'
  let species = null
  let displayIndexOf = null // 程序化骨架的插槽显示名 → 下标
  let animationNames = []
  let fitScale = 1

  // 当前播放配置（姿态变换随动画切换）
  let currentAnim = ''
  let currentLogical = 'idle'
  let cfg = { name: 'idle', rate: 1, lie: 0, dim: 1, jitter: 0 }

  // 舞台与移动状态
  const stage = { groundY: 0.76, width: 1, height: 1, dpr: 1 }
  const motion = { x: 50, target: null, facing: 1, moving: false, speed: WALK_SPEED }
  const ambient = { stageKey: 'adult', illness: null, dead: false }
  let onArrived = () => {}
  let onFrame = null // 每帧回调（动作系统时间推进）
  let lastReport = 0
  let frames = 0
  let jitterT = 0
  // ⚠ 骨架与贴图集分开记帐：两者的 JSON name 相同（cat/cat），
  //   共用一个 Set 会让贴图集解析被跳过 → 插槽 1×1 空纹理 → 宠物隐形
  const parsedSkeletons = new Set()
  const parsedAtlases = new Set()

  // ---- 尺寸与坐标 ----
  function viewSize() {
    return { w: canvas?.clientWidth || 1, h: canvas?.clientHeight || 1 }
  }

  function stageToPx(x) {
    const { w } = viewSize()
    const pad = w * SIDE_PAD
    return pad + (x / 100) * (w - 2 * pad)
  }

  function groundPx() {
    const { h } = viewSize()
    return h * (1 - stage.groundY) // groundY 为距顶比例
  }

  function petScale() {
    return fitScale * (STAGE_SCALES[ambient.stageKey] ?? 1)
  }

  // ---- 初始化 WebGL（Pixi v8） ----
  async function init(canvasEl) {
    canvas = canvasEl
    try {
      app = new Application()
      await app.init({
        canvas,
        backgroundAlpha: 0,
        antialias: true,
        preference: 'webgl', // 与 WebGL 失败降级 SVG 的语义保持一致
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: false,
        width: Math.max(1, canvas.clientWidth),
        height: Math.max(1, canvas.clientHeight)
      })
      factory = PixiFactory.newInstance(false) // 动画由本播放器手动推进
      app.ticker.add(frame)
      resize()
      ready = true
    } catch (e) {
      ready = false
      console.warn('[dianchong] WebGL 初始化失败，将降级为 SVG 宠物：', e)
    }
    return ready
  }

  function resize() {
    if (!app) return
    const w = Math.max(1, canvas.clientWidth)
    const h = Math.max(1, canvas.clientHeight)
    app.renderer.resize(w, h)
    stage.width = w
    stage.height = h
  }

  // ---- 物种装配 ----
  async function setSpecies(sp) {
    if (!ready || !sp) return false
    const key = DB_ASSETS[sp.rig] ? sp.rig : 'procedural'
    let nextArmature = null
    let nextDisplayIndex = null
    let nextNames = []

    if (key !== 'procedural') {
      // 预设资产：加载 + 解析 + 装配
      const def = DB_ASSETS[key]
      const pack = await loadPresetAsset(key)
      if (pack.skeJson.name && !parsedSkeletons.has(pack.skeJson.name)) {
        factory.parseDragonBonesData(pack.skeJson)
        parsedSkeletons.add(pack.skeJson.name)
      }
      if (!parsedAtlases.has(pack.texJson.name)) {
        factory.parseTextureAtlasData(pack.texJson, pack.texture)
        parsedAtlases.add(pack.texJson.name)
      }
      nextArmature = factory.buildArmatureDisplay(def.armature, pack.skeJson.name)
      nextNames = nextArmature ? Object.keys(nextArmature.animation.animations) : []
      if (!nextArmature) throw new Error(`预设骨架装配失败：${key}`)
    } else {
      // 程序化生成：parts 图集画布 → 贴图 → 骨架数据 → 装配
      const built = buildPetDragonBones(sp)
      const off = document.createElement('canvas')
      built.drawTo(off)
      const texture = Texture.from(off)
      if (!parsedSkeletons.has(built.skeleton.name)) {
        factory.parseDragonBonesData(built.skeleton)
        parsedSkeletons.add(built.skeleton.name)
      }
      if (!parsedAtlases.has(built.textureAtlas.name)) {
        factory.parseTextureAtlasData(built.textureAtlas, texture)
        parsedAtlases.add(built.textureAtlas.name)
      }
      nextArmature = factory.buildArmatureDisplay(sp.id, built.skeleton.name)
      nextDisplayIndex = built.displayIndexOf
      nextNames = nextArmature ? Object.keys(nextArmature.animation.animations) : []
      if (!nextArmature) throw new Error(`程序化骨架装配失败：${sp.id}`)
    }

    disposeArmature()

    assetKey = key
    species = sp
    displayIndexOf = nextDisplayIndex
    armature = nextArmature
    animationNames = nextNames
    app.stage.addChild(armature)

    // 适配缩放：播放 idle 后测量真实边界（aabb 在含道具动画下不可靠）
    currentAnim = ''
    currentLogical = 'idle'
    cfg = { name: 'idle', rate: 1, lie: 0, dim: 1, jitter: 0 }
    armature.animation.play(nextNames.includes('idle') ? 'idle' : nextNames[0], -1)
    PixiFactory.advanceTime(0.02)
    armature.armature.invalidUpdate(null, true)
    const b = armature.getBounds()
    const hFit = (viewSize().h * PET_FIT) / Math.max(1, b.height)
    const wFit = (viewSize().w * 0.82) / Math.max(1, b.width)
    fitScale = Math.max(0.05, Math.min(hFit, wFit))

    applyTransform()
    updateDebug()
    return true
  }

  function disposeArmature() {
    if (!armature) return
    try {
      armature.armature?.dispose?.()
      armature.destroy({ children: true })
    } catch { /* ignore */ }
    armature = null
    species = null
    displayIndexOf = null
    animationNames = []
  }

  // ---- 动画控制 ----
  function play(logicalName, loop = true) {
    if (!armature || !logicalName) return
    if (currentLogical === logicalName) return // 幂等：姿态配置不变
    const next = resolveAnim(assetKey, animationNames, logicalName)
    cfg = next
    currentLogical = logicalName
    currentAnim = next.name
    try {
      armature.animation.timeScale = next.rate
      // once：播放一次并保持（fall/倒地类）；其余循环（时长由动作系统控制）
      armature.animation.play(next.name, next.once ? 1 : -1)
      applyTransform()
      updateDebug()
    } catch (e) {
      console.warn(`[dianchong] 动画切换失败：${logicalName}→${next.name}`, e)
    }
  }

  /** 容器级姿态变换：位置/朝向/缩放/睡卧旋转/明暗 */
  function applyTransform() {
    if (!armature) return
    const s = petScale()
    const jx = cfg.jitter ? Math.sin(jitterT * 55) * cfg.jitter : 0
    armature.position.set(stageToPx(motion.x) + jx, groundPx())
    armature.scale.set(s)
    armature.rotation = (cfg.lie * Math.PI) / 180
    armature.alpha = cfg.dim
    // 朝向镜像：facingBase 为资产原画的朝向基准（正面资产 ±1 等价；恐龙侧视朝左）
    const base = DB_ASSETS[assetKey]?.facingBase ?? 1
    armature.armature.flipX = motion.facing < 0 ? base > 0 : base < 0
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
    applyTransform()
  }

  function setStageConfig(next) {
    Object.assign(stage, next)
    resize()
    applyTransform()
  }

  /**
   * 环境表情覆盖（仅程序化骨架；预设骨架的插槽结构不同，病态由 UI 呈现）。
   * 在 advanceTime 之后、渲染之前调用，覆盖动画时间线写下的 displayIndex。
   */
  function applyAmbientFace() {
    if (!armature || assetKey !== 'procedural' || !displayIndexOf) return
    const neutral = NEUTRAL_ANIMS.includes(currentLogical)
    const dizzy = !!ambient.illness && !ambient.dead && neutral
    try {
      if (dizzy) {
        const di = displayIndexOf('eye-l', 'eye-dizzy')
        armature.armature.getSlot('eye-l').displayIndex = di
        armature.armature.getSlot('eye-r').displayIndex = di
        armature.armature.getSlot('mouth').displayIndex = displayIndexOf('mouth', 'mouth-sick')
      } else if (currentLogical === 'idle' || currentLogical === 'walk') {
        // 病愈复位（动画时间线随后接管眨眼）
        const eyes = armature.armature.getSlot('eye-l')
        if (eyes.displayIndex === displayIndexOf('eye-l', 'eye-dizzy')) {
          armature.armature.getSlot('eye-l').displayIndex = displayIndexOf('eye-l', 'eye-normal')
          armature.armature.getSlot('eye-r').displayIndex = displayIndexOf('eye-r', 'eye-normal')
          armature.armature.getSlot('mouth').displayIndex = displayIndexOf('mouth', 'mouth-smile')
        }
      }
      // 长寿白眉
      const wantBrows = ambient.stageKey === 'elder' && !ambient.dead
      const brows = armature.armature.getSlot('brows')
      if (brows) {
        const bi = displayIndexOf('brows', 'brows')
        if (wantBrows !== (brows.displayIndex === bi)) brows.displayIndex = wantBrows ? bi : -1
      }
    } catch { /* 插槽缺失时静默 */ }
  }

  // ---- 渲染循环（PIXI Ticker 驱动；渲染前完成动画推进与姿态更新） ----
  function frame() {
    if (!ready || !armature || document.hidden) return
    const t = app.ticker.deltaMS / 1000
    const dt = Math.min(0.05, Math.max(0, t || 0.016))

    // 动画推进（手动时钟；rate=0 时 timeScale 冻结）
    PixiFactory.advanceTime(dt)
    jitterT += dt

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

    applyTransform()
    applyAmbientFace()
    frames++

    // 位置回报（100ms 节流）
    const now = performance.now()
    if (now - lastReport > 100) {
      lastReport = now
      onFrame?.(motion.x, motion.facing, currentLogical)
    }
    updateDebug()
  }

  function start(onArrivedCb, onFrameCb) {
    onArrived = onArrivedCb || (() => {})
    onFrame = onFrameCb || null
  }

  function stop() {
    if (app?.ticker) app.ticker.remove(frame)
  }

  function dispose() {
    stop()
    disposeArmature()
    try { app?.destroy({ removeView: false }, { children: true }) } catch { /* ignore */ }
    app = null
    ready = false
    if (typeof window !== 'undefined') {
      if (window.__dbDebug) delete window.__dbDebug
      if (window.__dbApp) delete window.__dbApp
      if (window.__dbArm) delete window.__dbArm
      if (window.__dbFactory) delete window.__dbFactory
    }
  }

  // ---- 调试钩子（E2E 与现场排查用；250ms 节流避免每帧开销） ----
  let lastDebugAt = 0
  function updateDebug() {
    const now = performance.now()
    if (now - lastDebugAt < 250) return
    lastDebugAt = now
    const arm = armature?.armature
    window.__dbDebug = {
      ready,
      engine: 'pixi+dragonbones',
      assetKey,
      speciesId: species?.id ?? null,
      bones: arm ? arm.getBones().length : 0,
      slots: arm ? arm.getSlots().length : 0,
      animations: animationNames,
      currentAnim,
      currentLogical,
      loop: !cfg.once,
      rate: cfg.rate,
      lie: cfg.lie,
      x: Math.round(motion.x * 10) / 10,
      facing: motion.facing,
      moving: motion.moving,
      stageKey: ambient.stageKey,
      frames,
      canvasW: canvas?.width ?? 0,
      canvasH: canvas?.height ?? 0,
      displayCount: arm ? arm.getSlots().filter((s) => s.displayIndex >= 0).length : 0,
      flipX: arm ? !!arm.flipX : false,
      // 变换链路数值健康检查（隐形问题排查）
      fitScale: Math.round(fitScale * 1000) / 1000,
      rotationDeg: armature ? Math.round((armature.rotation * 180) / Math.PI * 10) / 10 : null,
      alpha: armature ? armature.alpha : null,
      posX: armature ? Math.round(armature.position.x * 10) / 10 : null,
      posY: armature ? Math.round(armature.position.y * 10) / 10 : null,
      bounds: armature ? (() => {
        const b = armature.getBounds()
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
      })() : null
    }
    // 活体诊断钩子（仅 E2E 调试）
    if (typeof window !== 'undefined') {
      window.__dbApp = app
      window.__dbArm = armature
      window.__dbFactory = factory
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
    hasSpecies: () => !!armature,
    position: () => ({ x: motion.x, facing: motion.facing, moving: motion.moving }),
    current: () => ({ anim: currentAnim, logical: currentLogical, loop: !cfg.once })
  }
}
