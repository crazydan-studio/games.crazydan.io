// ============ 电宠 3D 渲染器（Babylon.js） ============
// 消费动作系统的生命周期事件（play/move），把指令的结果实时渲染为 3D 动画：
//   · 宠物模型：public/assets/b3d/ 的 CC0 GLB（骨骼动画）
//     —— 宠物建模 = Quaternius Ultimate Animated Animals
//     —— 怪兽建模 = Quaternius Ultimate Monsters
//   · 场景：stage3d 依据 core/scenes.js 场景定义搭建（地面/墙/道具/昼夜光照）
//     —— 室内场景道具 = KayKit Restaurant Bits
//   · 游戏化交互（常见 3D 宠物游戏模式）：
//       - 轻点宠物 → 抚摸（爱心粒子 + onPetTouch）
//       - 轻点地面 → 走过去（onGroundClick → move 指令）
//       - 从道具坞拖拽投掷 → 抛物线 + 弹跳物理 → 落地事件（App 结算喂食/玩耍）
//       - 拖拽空白 → ArcRotateCamera 旋转视角；滚轮/双指 → 缩放
//   · 姿态变换：睡卧旋转 / 播放速率 / 明暗 / 寒颤抖动 / 下沉（弥补模型动画词汇）
//
// 与旧 db/PetPlayer 相同的接口契约：init / setSpecies / play / moveTo / haltMove /
// setAmbient / setStageConfig / start / stop / dispose / resize / isReady /
// hasSpecies / position / current。
//
// ⚠ 历史坑（务必保持的修复，继承自 2D 版经验）：
//   · 坐标换算集中在 stage3d 的 stageXToWorld/worldToStageX，禁止二处实现
//   · 骨骼网格克隆必须同步克隆 Skeleton 与 AnimationGroup（targetConverter 按骨骼名映射），
//     否则多实例共享旧骨架状态 → 动画错乱
//   · scene.pick / createPickingRay 的屏幕坐标 = clientXY 减画布 rect（勿直接用 clientXY）
//
// ⚠ 不做建模降级/回退：物种必须绑定 PET_MODELS 白名单模型，
//   无效绑定或加载失败 → setSpecies 返回 false，由上层以加载失败呈现（等待遮罩/错误），
//   绝不静默替换为其他模型；WebGL 初始化失败同理（init 返回 false，无 SVG 降级）

import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'
import '@babylonjs/core/Culling/ray' // Ray side-effect（Babylon 9 深路径导入约定；拾取已改自写射线，此处为保险）
import '@babylonjs/loaders/glTF'

import { PET_MODELS, THROW_ITEMS, modelKeyOf, assetBaseUrl } from './assets.js'
import { resolveAnim } from './animationMap.js'
import {
  importGlb, loadSceneProps, setupLighting, buildFence, buildClouds, buildStarsAndMoon,
  buildCityline, buildBall, heartTextureOf, hexToColor3, disposeMeshCache,
  STAGE_HALF, PET_Z, WALL_Z, ROOM_SCENES, stageXToWorld, worldToStageX
} from './stage3d.js'

const WALK_SPEED = 13 // 舞台单位/秒（0-100 坐标系）
const STAGE_SCALES = { baby: 0.72, teen: 0.88, adult: 1, elder: 0.96 }
// ⚠ 相机方位（历史坑）：ArcRotateCamera 的 alpha=+π/2 才位于 +Z 玩家侧看向 -Z 墙侧；
//   alpha=-π/2 会把相机放到背景墙后面（墙背面被剔除 → 满屏雾色「黑屏」）
const CAM_ALPHA = Math.PI / 2

/** GLB 网格克隆：mesh + skeleton + animationGroups 三同步 */
function clonePetPack(pack, scene) {
  const skeleton = pack.skeletons?.[0] ? pack.skeletons[0].clone('pet-skel') : null
  const meshMap = new Map()
  const root = new TransformNode('pet-model', scene)
  for (const m of pack.meshes) {
    if (m === pack.root || m.name === '__root__' || m.name === 'root') continue
    const c = m.clone(`pet-${m.name}`, root)
    c.setEnabled(true) // 原始体已禁用，克隆体须显式启用
    c.isPickable = true
    if (skeleton && c.skeleton) c.skeleton = skeleton
    meshMap.set(m, c)
  }
  const boneOf = (target) => {
    if (skeleton && target?.name) {
      const b = skeleton.bones.find((x) => x.name === target.name)
      if (b) return b
    }
    return meshMap.get(target) || target
  }
  const groups = (pack.groups || []).map((g) => {
    try {
      // 保持原动画名（animationMap 的家族词汇表按原名匹配；前缀会导致解析失败 → 宠物冻结）
      return g.clone(g.name, boneOf)
    } catch {
      return null
    }
  }).filter(Boolean)
  return { root, meshes: [...meshMap.values()], groups, skeleton }
}

export function createB3dPetPlayer() {
  let canvas = null
  let engine = null
  let scene = null
  let camera = null
  let ready = false

  // ---- 宠物实例 ----
  let petRoot = null // 位置 / 朝向 / 抖动（舞台层）
  let modelRoot = null // 归一化缩放 / 睡卧旋转 / 下沉（模型层）
  let petMeshes = []
  let animGroups = []
  let animNames = []
  let activeGroup = null
  let family = 'uaa'
  let bbMinY = 0 // 归一化后模型最低点（贴地偏移基准）
  let petHeight = 1

  // ---- 播放配置 ----
  let currentAnim = ''
  let currentLogical = 'idle'
  let cfg = { name: '', rate: 1, once: false }

  // ---- 舞台与移动 ----
  const motion = { x: 50, target: null, facing: 1, moving: false, speed: WALK_SPEED }
  let yawCurrent = 0 // 模型 glTF +Z 朝前 = 面向 +Z 玩家侧相机；向 ±X 走时旋转 ±π/2
  const ambient = { stageKey: 'adult', illness: null, dead: false }
  let onArrived = () => {}
  let onFrame = null
  let lastReport = 0
  let jitterT = 0

  // ---- 场景构建状态 ----
  let stageRoot = null
  let groundMesh = null
  let shadowGen = null
  let sceneKeyCache = ''

  // ---- 交互 ----
  const interact = { onPetTouch: null, onGroundClick: null, onItemLanded: null }
  let hearts = null

  // ---- 投掷道具 ----
  const drag = { itemId: null, mesh: null, history: [] }
  const thrownItems = []

  // ---- 初始化 WebGL ----
  function init(canvasEl) {
    canvas = canvasEl
    try {
      engine = new Engine(canvas, true, { stencil: false }, false)
      engine.setHardwareScalingLevel(1 / Math.min(2, window.devicePixelRatio || 1))
      scene = new Scene(engine)
      scene.clearColor = new Color4(0.76, 0.88, 0.96, 1)

      camera = new ArcRotateCamera('cam', CAM_ALPHA, 1.12, 7.6, new Vector3(0, 0.75, 0), scene)
      camera.lowerBetaLimit = 0.5
      camera.upperBetaLimit = 1.42
      camera.lowerRadiusLimit = 4
      camera.upperRadiusLimit = 14
      camera.upperAlphaLimit = CAM_ALPHA + 1.25
      camera.lowerAlphaLimit = CAM_ALPHA - 1.25
      camera.panningSensibility = 0
      camera.wheelDeltaPercentage = 0.02
      camera.pinchDeltaPercentage = 0.01
      camera.attachControl(canvas, true)

      const lights = setupLighting(scene, { night: false, isRoom: false })
      shadowGen = lights.shadowGen
      buildGround(new Color3(0.72, 0.82, 0.62))
      bindPointer()
      engine.runRenderLoop(renderFrame)
      ready = true
    } catch (e) {
      ready = false
      console.error('[dianchong] WebGL 初始化失败（不做降级，上层将显示错误遮罩）：', e)
      try { engine?.dispose() } catch { /* ignore */ }
      engine = null
      scene = null
    }
    return ready
  }

  function resize() {
    engine?.resize()
  }

  // ---- 地面 ----
  function buildGround(color) {
    if (groundMesh) groundMesh.dispose()
    groundMesh = MeshBuilder.CreateGround('b3d-ground', { width: 30, height: 26 }, scene)
    groundMesh.isPickable = true
    const mat = new StandardMaterial('ground-mat', scene)
    mat.diffuseColor = color
    mat.specularColor = new Color3(0.05, 0.05, 0.05)
    groundMesh.material = mat
    groundMesh.receiveShadows = true
  }

  // ---- 场景搭建 ----
  async function setStageConfig(next) {
    if (!ready || !scene) return
    const def = next?.scene || next
    if (!def) return
    const night = !!next?.night
    const key = `${def.id}|${night}`
    if (sceneKeyCache === key) return
    sceneKeyCache = key

    // 旧舞台整体拆除
    if (stageRoot) {
      try { stageRoot.dispose(false, true) } catch { /* ignore */ }
      stageRoot = null
    }
    if (groundMesh) {
      try { groundMesh.dispose() } catch { /* ignore */ }
      groundMesh = null
    }
    stageRoot = new TransformNode('stage-root', scene)

    const isRoom = ROOM_SCENES.has(def.id)
    // 天空 / 雾
    const skyTop = hexToColor3(def.sky?.[0] || '#BFE6FF')
    const skyBottom = hexToColor3(def.sky?.[1] || '#E3F6DC')
    let skyMix = new Color3(
      (skyTop.r + skyBottom.r) / 2,
      (skyTop.g + skyBottom.g) / 2,
      (skyTop.b + skyBottom.b) / 2
    )
    // 夜晚时段（游戏时钟深夜）：天空/雾同步压暗偏蓝，与夜晚灯光协调，
    // 避免「白天色天空 + 黑暗宠物」的割裂
    if (night) skyMix = skyMix.scale(0.3).add(new Color3(0.02, 0.03, 0.09))
    scene.clearColor = new Color4(skyMix.r, skyMix.g, skyMix.b, 1)
    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = skyMix
    scene.fogStart = 16
    scene.fogEnd = 34

    // 光照（旧的阴影发生器随旧灯光一起释放）
    shadowGen?.dispose()
    const lights = setupLighting(scene, { night, isRoom })
    shadowGen = lights.shadowGen

    // 地面
    buildGround(hexToColor3(def.ground?.[0] || '#83C15C'))
    groundMesh.parent = stageRoot

    // 背景墙（室内）
    if (isRoom) {
      const wall = MeshBuilder.CreateBox('b3d-wall', { width: 12, height: 4.2, depth: 0.3 }, scene)
      wall.position.set(0, 2.1, WALL_Z)
      const wmat = new StandardMaterial('wall-mat', scene)
      wmat.diffuseColor = night ? new Color3(0.34, 0.32, 0.42) : new Color3(0.93, 0.88, 0.8)
      wmat.specularColor = new Color3(0.02, 0.02, 0.02)
      wall.material = wmat
      wall.parent = stageRoot
      wall.isPickable = false
      shadowGen.addShadowCaster(wall)
    }

    // GLB 道具 + 程序化装饰
    const base = assetBaseUrl()
    const decorTypes = new Set(['cloud', 'star', 'moon', 'cityline', 'fence', 'ball', 'butterfly'])
    const glbProps = (def.props || []).filter((p) => !decorTypes.has(p.type))
    await loadSceneProps(scene, { ...def, props: glbProps }, stageRoot, base, shadowGen)
    let builtStars = false
    for (const p of def.props || []) {
      if (p.type === 'fence') buildFence(scene, stageRoot)
      if (p.type === 'cloud') buildClouds(scene, stageRoot)
      if (p.type === 'star' || p.type === 'moon') { buildStarsAndMoon(scene, stageRoot); builtStars = true }
      if (p.type === 'cityline') buildCityline(scene, stageRoot)
      if (p.type === 'ball') buildBall(scene, stageRoot, p)
    }
    if (night && !builtStars) buildStarsAndMoon(scene, stageRoot)

    // 场景重建会换 ShadowGenerator：已在场的宠物重新登记为阴影投射者
    if (shadowGen) for (const m of petMeshes) shadowGen.addShadowCaster(m)
  }

  // ---- 物种装配 ----
  async function setSpecies(sp) {
    if (!ready || !sp) return false
    // 严格解析：物种必须绑定 PET_MODELS 白名单模型（无回退，无效直接失败）
    let key
    try {
      key = modelKeyOf(sp).key
    } catch (e) {
      console.error('[dianchong] 物种建模绑定无效：', e)
      return false
    }
    const def = PET_MODELS[key]
    disposePet()
    family = def.family

    let pack
    try {
      pack = await importGlb(new URL(def.file, assetBaseUrl()).href, scene)
    } catch (e) {
      console.error('[dianchong] 宠物模型加载失败：', key, e)
      return false
    }

    const cloned = clonePetPack(pack, scene)

    petRoot = new TransformNode('pet-root', scene)
    modelRoot = cloned.root
    modelRoot.parent = petRoot
    petMeshes = cloned.meshes
    animGroups = cloned.groups
    animNames = cloned.groups.map((g) => g.name)

    // 归一化：层级包围盒高度 → targetHeight，并计算贴地偏移
    const bb = modelRoot.getHierarchyBoundingVectors()
    const h = Math.max(0.001, bb.max.y - bb.min.y)
    const fit = (def.targetHeight || 1) / h
    petHeight = def.targetHeight || 1
    modelRoot.scaling.setAll(fit)
    bbMinY = bb.min.y * fit
    modelRoot.position.y = -bbMinY
    for (const m of petMeshes) {
      // ⚠ 宠物不接收阴影：场景重建会 dispose 旧 ShadowGenerator，
      //   receiveShadows 的 mesh 引用悬空 shadow map 会渲染成黑色块
      m.receiveShadows = false
      shadowGen?.addShadowCaster(m)
    }

    // 停全部动画 → idle
    for (const g of animGroups) g.stop()
    activeGroup = null
    currentAnim = ''
    currentLogical = ''
    cfg = { name: '', rate: 1, once: false }
    play('idle', true)

    petRoot.position.set(stageXToWorld(motion.x), 0, PET_Z)
    petRoot.rotation.y = yawCurrent
    applyTransform()
    updateDebug()
    return true
  }
  function disposePet() {
    if (!petRoot) return
    try { petRoot.dispose(false, true) } catch { /* ignore */ }
    petRoot = null
    modelRoot = null
    petMeshes = []
    animGroups = []
    animNames = []
    activeGroup = null
  }

  // ---- 动画控制 ----
  function play(logicalName, loop = true) {
    if (!petRoot || !animGroups.length || !logicalName) return
    if (currentLogical === logicalName) return // 幂等：姿态配置不变
    const next = resolveAnim(family, animNames, logicalName)
    cfg = next
    currentLogical = logicalName
    currentAnim = next.name
    try {
      if (activeGroup) activeGroup.stop()
      const g = animGroups.find((x) => x.name === next.name)
      if (g) {
        activeGroup = g
        g.speedRatio = Math.max(0, next.rate ?? 1)
        // 一律循环：时长由动作系统控制（once 类动作到期回落 idle）；
        // 死亡/昏迷的「定格」由低速率 + 躺卧/暗化/下沉姿态共同保证
        g.start(true)
      } else {
        activeGroup = null
      }
      applyTransform()
      updateDebug()
    } catch (e) {
      console.warn(`[dianchong] 3D 动画切换失败：${logicalName}→${next.name}`, e)
    }
  }

  /** 姿态变换：位置 / 朝向 / 睡卧旋转 / 明暗 / 下沉 / 抖动 */
  function applyTransform() {
    if (!petRoot) return
    const s = STAGE_SCALES[ambient.stageKey] ?? 1
    const jx = cfg.jitter ? Math.sin(jitterT * 55) * cfg.jitter : 0
    petRoot.position.set(stageXToWorld(motion.x) + jx, 0, PET_Z)
    petRoot.scaling.setAll(s)
    if (modelRoot) {
      modelRoot.rotation.z = ((cfg.lie || 0) * Math.PI) / 180
      modelRoot.position.y = -bbMinY - (cfg.sink || 0)
      modelRoot.position.x = (cfg.lie || 0) > 0 ? 0.1 : 0 // 侧躺时轻微偏移防穿地
    }
    const vis = cfg.dim ?? 1
    for (const m of petMeshes) {
      if (m.visibility !== vis) m.visibility = vis
    }
  }

  // ---- 移动 ----
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

  // ---- 指针交互 ----
  // ⚠ Babylon 9 深路径导入下 picking 的 side-effect 注册不稳定（pick/createPickingRay
  //   的原型替换可能缺失）—— 自写「屏幕 → 世界」逆投影射线，与 y=0 地面求交 +
  //   宠物胶囊命中，完全绕开 Babylon picking。
  function screenRay(px, py) {
    const w = engine.getRenderWidth()
    const h = engine.getRenderHeight()
    const invVP = camera.getTransformationMatrix().invert() // view×proj 复合的逆（乘序反了会得到原点附近的假射线）
    const nx = (2 * px) / w - 1
    const ny = 1 - (2 * py) / h
    const near = Vector3.TransformCoordinates(new Vector3(nx, ny, -1), invVP)
    const far = Vector3.TransformCoordinates(new Vector3(nx, ny, 1), invVP)
    // ⚠ dir 必须归一化：点线距离公式 d²=|oc|²-(oc·û)² 依赖单位向量，
    //   未归一化时 d² 变大负数 → 任何点击都「命中宠物」
    return { near, dir: far.subtract(near).normalize() }
  }

  /** 点击命中判定：先宠物（胶囊近似），后地面（y=0 平面求交） */
  function hitTest(px, py) {
    const { near, dir } = screenRay(px, py)
    // 宠物：中轴胶囊（中心 = 位置 + 高度一半，半径 ~0.62×阶段缩放）
    if (petRoot) {
      const scale = STAGE_SCALES[ambient.stageKey] ?? 1
      const center = new Vector3(petRoot.position.x, (petHeight * scale) / 2, petRoot.position.z)
      const radius = 0.62 * scale + 0.08
      const oc = center.subtract(near)
      const proj = Vector3.Dot(oc, dir)
      const d2 = Vector3.Dot(oc, oc) - proj * proj
      if (d2 <= radius * radius && proj > 0) return { pet: true }
    }
    // 地面：与 y=0 平面求交
    if (Math.abs(dir.y) > 1e-5) {
      const t = (0 - near.y) / dir.y
      if (t > 0) {
        const hit = near.add(dir.scale(t))
        if (Math.abs(hit.x) <= STAGE_HALF + 2 && hit.z < 5 && hit.z > -12) {
          return { pet: false, x: worldToStageX(hit.x) }
        }
      }
    }
    return null
  }

  function bindPointer() {
    // ⚠ Babylon 9 事件坑：POINTERTAP(0x20) 在部分环境下不派发（软渲染/合成指针），
    //   稳定方案 = POINTERDOWN 记位置 + POINTERUP 自查位移 < 6px 判定轻点
    let downPos = null
    scene.onPointerObservable.add((pi) => {
      // ⚠ Babylon 9 PointerInfo 的原生事件属性名为 pi.event（旧文档的 pointerEvent 是 undefined）
      const ev = pi.event
      if (!ev) return
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        downPos = { x: ev.clientX, y: ev.clientY }
      } else if (pi.type === PointerEventTypes.POINTERUP && downPos && !drag.itemId) {
        const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y)
        downPos = null
        if (moved > 6) return // 拖拽视角，不是轻点
        const rect = canvas.getBoundingClientRect()
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top
        if (px < 0 || py < 0 || px > rect.width || py > rect.height) return
        const hit = hitTest(px, py)
        if (hit?.pet) {
          heartsBurst()
          interact.onPetTouch?.()
        } else if (hit && !hit.pet) {
          interact.onGroundClick?.(hit.x)
        }
      }
    })
  }

  /** 爱心粒子（抚摸反馈） */
  function heartsBurst() {
    if (!scene || !petRoot) return
    try {
      if (!hearts) {
        hearts = new ParticleSystem('hearts', 40, scene)
        hearts.particleTexture = heartTextureOf(scene)
        hearts.emitter = new Vector3(0, 1.4, 0)
        hearts.minEmitBox = new Vector3(-0.3, 0, -0.1)
        hearts.maxEmitBox = new Vector3(0.3, 0.2, 0.1)
        hearts.color1 = new Color4(1, 0.42, 0.58, 1)
        hearts.color2 = new Color4(1, 0.62, 0.75, 1)
        hearts.colorDead = new Color4(1, 0.42, 0.58, 0)
        hearts.minSize = 0.12
        hearts.maxSize = 0.24
        hearts.minLifeTime = 0.6
        hearts.maxLifeTime = 1.1
        hearts.direction1 = new Vector3(-0.6, 1.6, 0)
        hearts.direction2 = new Vector3(0.6, 2.2, 0.3)
        hearts.gravity = new Vector3(0, -0.4, 0)
      }
      const head = new Vector3(petRoot.position.x, petHeight * 1.05 + 0.25, petRoot.position.z)
      hearts.emitter = head
      hearts.manualEmitCount = 14
      if (!hearts.isStarted()) hearts.start()
      setTimeout(() => hearts?.stop(), 900)
    } catch { /* 粒子失败不影响玩法 */ }
  }

  // ---- 投掷道具：拖拽 → 抛物线 + 弹跳物理 ----

  /** 开始拖拽投掷物（窗口级指针监听，画布外释放也能正确处理） */
  async function setDragging(itemId) {
    cancelDrag()
    const def = THROW_ITEMS[itemId]
    if (!def) return
    drag.itemId = itemId
    drag.history = []
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerCancel)
    try {
      const pack = await importGlb(new URL(def.file, assetBaseUrl()).href, scene)
      if (!drag.itemId) return // 已取消
      const node = new TransformNode('held-item', scene)
      for (const m of pack.meshes) {
        if (m === pack.root || m.name === 'root' || m.name === '__root__') continue
        const c = m.clone(`held-${m.name}`, node)
        c.setEnabled(true) // 原始体已禁用，克隆体须显式启用
        c.isPickable = false
      }
      node.scaling.setAll(def.scale || 0.6)
      node.position.set(0, 2.0, PET_Z + 0.8)
      drag.mesh = node
    } catch (e) {
      console.warn('[dianchong] 投掷道具加载失败：', itemId, e)
      cancelDrag()
    }
  }

  function onWindowPointerMove(ev) {
    if (!drag.itemId || !drag.mesh) return
    const rect = canvas.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const py = ev.clientY - rect.top
    const { near, dir } = screenRay(px, py)
    const planeY = 1.5
    if (Math.abs(dir.y) < 1e-4) return
    const t = (planeY - near.y) / dir.y
    if (t <= 0) return
    const wx = near.x + dir.x * t
    const wz = near.z + dir.z * t
    const cx = Math.min(STAGE_HALF + 1.2, Math.max(-STAGE_HALF - 1.2, wx))
    const cz = Math.min(2.4, Math.max(-2.8, wz))
    drag.mesh.position.set(cx, planeY, cz)
    drag.mesh.rotation.y += 0.05
    drag.history.push({ t: performance.now(), x: cx, z: cz })
    if (drag.history.length > 30) drag.history.shift()
  }

  function onWindowPointerUp() {
    if (!drag.itemId) return
    releaseDrag()
  }

  function onWindowPointerCancel() {
    cancelDrag()
  }

  function cancelDrag() {
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerCancel)
    if (drag.mesh) { try { drag.mesh.dispose(false, true) } catch { /* ignore */ } }
    drag.itemId = null
    drag.mesh = null
    drag.history = []
  }

  /** 释放投掷：最近 ~150ms 轨迹计算初速度；无轨迹也给一个默认抛出 */
  function releaseDrag() {
    if (!drag.itemId) return
    const def = THROW_ITEMS[drag.itemId]
    const mesh = drag.mesh
    const itemId = drag.itemId
    const hist = drag.history
    drag.itemId = null
    drag.mesh = null
    drag.history = []
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerCancel)
    if (!mesh) return

    let vel
    const recent = hist.length ? hist.filter((p) => performance.now() - p.t < 180) : []
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      const dt = Math.max(0.05, (last.t - first.t) / 1000)
      let vx = (last.x - first.x) / dt
      let vz = (last.z - first.z) / dt
      const speed = Math.hypot(vx, vz)
      const cap = 7.5
      if (speed > cap) { vx *= cap / speed; vz *= cap / speed }
      vel = new Vector3(vx, 3.0 + Math.min(1.8, speed * 0.14), vz)
    } else {
      vel = new Vector3((Math.random() - 0.5) * 2.2, 3.4, 1.0)
    }

    const radius = 0.2 * (def.scale || 0.6) + 0.12
    thrownItems.push({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId,
      kind: def.kind,
      mesh,
      vel,
      radius,
      landed: false,
      spin: new Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
      born: performance.now()
    })
  }

  /** 抛物线 + 地面弹跳 + 摩擦 + 宠物接近吃掉/拾起 */
  function stepItems(dt) {
    for (let i = thrownItems.length - 1; i >= 0; i--) {
      const it = thrownItems[i]
      const age = (performance.now() - it.born) / 1000
      if (!it.landed) {
        it.vel.y -= 9.8 * dt
        it.mesh.position.addInPlace(it.vel.scale(dt))
        it.mesh.rotation.addInPlace(it.spin.scale(dt))
        const r = it.radius
        if (it.mesh.position.y <= r) {
          it.mesh.position.y = r
          if (Math.abs(it.vel.y) > 1.2) {
            it.vel.y = Math.abs(it.vel.y) * 0.42 // 弹跳
            it.vel.x *= 0.72
            it.vel.z *= 0.72
          } else {
            it.vel.setAll(0)
            it.mesh.rotation.set(0, it.mesh.rotation.y, 0)
            it.landed = true
            interact.onItemLanded?.({
              id: it.id,
              itemId: it.itemId,
              kind: it.kind,
              x: worldToStageX(it.mesh.position.x)
            })
          }
        }
        if (Math.abs(it.mesh.position.x) > STAGE_HALF + 3.5 || it.mesh.position.z > 5) {
          it.mesh.dispose(false, true)
          thrownItems.splice(i, 1)
          continue
        }
      } else {
        // 宠物接近 → 吃掉/拾起（缩小消失）
        if (petRoot && Math.abs(petRoot.position.x - it.mesh.position.x) < 0.55) {
          const s = Math.max(0.01, 1 - dt * 3)
          it.mesh.scaling.scaleInPlace(s)
          if (it.mesh.scaling.x < 0.06) {
            it.mesh.dispose(false, true)
            thrownItems.splice(i, 1)
            continue
          }
        }
        if (age > 45) {
          it.mesh.dispose(false, true)
          thrownItems.splice(i, 1)
        }
      }
    }
  }

  // ---- 渲染循环 ----
  function renderFrame() {
    if (!ready || !scene || document.hidden) return
    const t = engine.getDeltaTime() / 1000
    const dt = Math.min(0.05, Math.max(0, t || 0.016))
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

    // 朝向平滑旋转（+X 行走 → yaw=+π/2；-X → -π/2；静立 → 面向 +Z 玩家）
    const yawTarget = motion.facing === 1 ? Math.PI / 2 : -Math.PI / 2
    let dyaw = yawTarget - yawCurrent
    if (dyaw > Math.PI) dyaw -= Math.PI * 2
    if (dyaw < -Math.PI) dyaw += Math.PI * 2
    yawCurrent += dyaw * Math.min(1, dt * 9)
    if (petRoot) petRoot.rotation.y = yawCurrent

    applyTransform()
    stepItems(dt)
    scene.render()

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
    engine?.stopRenderLoop()
  }

  function dispose() {
    stop()
    cancelDrag()
    for (const it of thrownItems) { try { it.mesh.dispose(false, true) } catch { /* ignore */ } }
    thrownItems.length = 0
    disposePet()
    try { stageRoot?.dispose(false, true) } catch { /* ignore */ }
    try { hearts?.dispose() } catch { /* ignore */ }
    try { engine?.dispose() } catch { /* ignore */ }
    // ⚠ meshCache 是模块级缓存，其中的网格属于当前（即将销毁的）scene；
    //   不清空的话，重新领养/重挂载后新 scene 从旧缓存克隆出的网格不会注册进
    //   新 scene（可见节点存在但不渲染 → 道具全部消失）。销毁时必须连同清空。
    disposeMeshCache()
    engine = null
    scene = null
    camera = null
    ready = false
    stageRoot = null
    if (typeof window !== 'undefined' && window.__b3dDebug) delete window.__b3dDebug
  }

  // ---- 调试钩子（E2E 与现场排查；250ms 节流） ----
  let lastDebugAt = 0
  function updateDebug() {
    if (typeof window === 'undefined') return
    const now = performance.now()
    if (now - lastDebugAt < 250) return
    lastDebugAt = now
    // E2E 排查钩子（只读引用）
    window.__b3dScene = scene
    window.__b3dShadow = shadowGen
    window.__b3dDebug = {
      ready,
      engine: 'babylonjs',
      family,
      animNames,
      currentAnim,
      currentLogical,
      rate: cfg.rate,
      lie: cfg.lie || 0,
      dim: cfg.dim ?? 1,
      x: Math.round(motion.x * 10) / 10,
      facing: motion.facing,
      moving: motion.moving,
      stageKey: ambient.stageKey,
      canvasW: canvas?.width ?? 0,
      canvasH: canvas?.height ?? 0,
      thrownItems: thrownItems.map((i) => ({
        id: i.id, itemId: i.itemId, landed: i.landed,
        x: Math.round(worldToStageX(i.mesh.position.x) * 10) / 10
      })),
      dragItemId: drag.itemId,
      fps: engine?.getFps?.() ?? 0
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
    hasSpecies: () => !!petRoot,
    position: () => ({ x: motion.x, facing: motion.facing, moving: motion.moving }),
    current: () => ({ anim: currentAnim, logical: currentLogical, loop: true }),
    // ---- 3D 交互扩展 ----
    setInteractHandlers(handlers) {
      Object.assign(interact, handlers || {})
    },
    setDragging,
    releaseDrag,
    cancelDrag,
    heartsBurst,
    isDragging: () => !!drag.itemId
  }
}
