// ============ 3D 舞台搭建（Babylon.js） ============
// 依据 core/scenes.js 的场景定义（sky/ground/night/props）搭建 3D 舞台：
//   · 地面 + （室内场景）背景墙
//   · 昼夜光照：白天 = 半球环境光 + 定向光（阴影）；夜晚 = 压暗 + 暖色点光 + 星月
//   · 道具装载：props（0-1 屏幕坐标）→ 世界坐标；锚点类道具（食盆/床）落在宠物行走线
//   · 程序化装饰：栅栏 / 云朵 / 城市剪影 / 星月 / 皮球（无 GLB 的 PROP_TYPES 用基础几何体）
//   · 爱心粒子纹理（抚摸反馈）
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader'
import '@babylonjs/loaders/glTF' // 注册 glTF 插件（幂等；stage3d 与 PetPlayer3D 双处保险）
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { PROP_MODELS } from './assets.js'

// 世界坐标约定（与 PetPlayer3D 共享）：
//   宠物沿 X 轴行走于 z = PET_Z；舞台宽 ±STAGE_HALF；道具按场景定义落位。
export const STAGE_HALF = 3.4
export const PET_Z = 0.55
export const WALL_Z = -4.6

export const stageXToWorld = (x) => ((x / 100) - 0.5) * 2 * STAGE_HALF
export const worldToStageX = (wx) => Math.min(100, Math.max(0, (wx / (2 * STAGE_HALF) + 0.5) * 100))

// 室内场景（有背景墙）
export const ROOM_SCENES = new Set(['living-room', 'bedroom'])

export function hexToColor3(hex) {
  const h = /^#([0-9a-fA-F]{6})$/.test(hex || '') ? hex : '#cccccc'
  return new Color3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
}

/** GLB 资产导入缓存（同一文件只加载一次；失败也缓存错误避免反复请求） */
const meshCache = new Map()

/** 导入 GLB（带缓存）：{ root, meshes, groups, skeletons }；scene 显式传入避免依赖全局最近创建
 *  ⚠ 历史坑：ImportMeshAsync 会把原始 mesh 直接加入当前 scene 渲染——不禁用的话，
 *    克隆体之外还会渲染一份「幽灵原始模型」（静止在原点、蒙皮姿态异常）。
 *    导入后立即 setEnabled(false)，克隆时再显式启用。 */
export async function importGlb(url, scene) {
  if (!meshCache.has(url)) {
    try {
      const r = await SceneLoader.ImportMeshAsync('', url, '', scene || undefined)
      // GLTF 加载器默认自动播放首个动画组（fox 首组恰为 Attack）——原始骨架会被
      // 永久空转驱动（E2E 实测 57 个 animatable 白耗 CPU）。克隆体独立于此，
      // 统一停掉原始组：可见动画只由克隆体（pet-skel）驱动。
      for (const g of r.animationGroups || []) {
        try { g.stop() } catch { /* ignore */ }
      }
      const pack = { root: r.rootNode ?? r.meshes[0], meshes: r.meshes, groups: r.animationGroups, skeletons: r.skeletons }
      // 原始体禁用（保留对象可供后续 clone；克隆时须显式 setEnabled(true)）
      for (const m of pack.meshes) {
        try { m.setEnabled(false) } catch { /* ignore */ }
        m.isPickable = false
      }
      meshCache.set(url, pack)
    } catch (e) {
      meshCache.set(url, { error: String(e?.message || e) })
      throw e
    }
  }
  const pack = meshCache.get(url)
  if (pack.error) throw new Error(pack.error)
  return pack
}

/** 释放导入缓存（页面卸载可选） */
export function disposeMeshCache() {
  meshCache.clear()
}

// ---- 场景道具装载 ----

function propDefOf(type, prop) {
  const def = PROP_MODELS[type]
  if (!def) return null
  let file = def.file
  if (def.variants?.length) {
    // 用 prop.s 做确定性变体选择（同场景刷新不变）
    const idx = Math.abs(Math.round((prop.s || 1) * def.variants.length) - 1) % def.variants.length
    file = def.variants[idx]
  }
  return { ...def, file }
}

/**
 * 装载场景道具（异步，单项失败不阻塞）：返回 { anchors: { food?: node, bed?: node } }
 * assetBase: assets/b3d/ 的绝对 URL
 */
export async function loadSceneProps(scene, sceneDef, parent, assetBase, shadowGen) {
  const anchors = {}
  const props = Array.isArray(sceneDef?.props) ? sceneDef.props : []
  let natureIdx = 0
  for (const prop of props) {
    const def = propDefOf(prop.type, prop)
    if (!def) continue
    let pack
    try {
      pack = await importGlb(new URL(def.file, assetBase).href, scene)
    } catch { continue }
    const node = new TransformNode(`prop-${prop.type}`, scene)
    node.parent = parent
    for (const m of pack.meshes) {
      if (m === pack.root || m.name === '__root__' || m.name === 'root') continue
      const inst = m.clone(`prop-${prop.type}-${m.name}`, node, true)
      inst.setEnabled(true) // 原始体已禁用，克隆体须显式启用
      inst.isPickable = false
      inst.receiveShadows = true
      if (shadowGen) shadowGen.addShadowCaster(inst)
    }
    // 位置：锚点类道具贴宠物行走线；墙面装饰靠墙（Restaurant Bits 墙窗自地面立起）；
    // yOff = 模型原点高度补偿（乘最终缩放，负值下沉）；其余按 y 推深度
    const s = Math.min(2, Math.max(0.4, Number(prop.s) || 1)) * (def.scale || 1)
    const wx = stageXToWorld(Number.isFinite(prop.x) ? prop.x * 100 : 50)
    let wz = -3.0 + (Number.isFinite(prop.y) ? prop.y : 0.5) * 3.4
    const wy = (def.yOff || 0) * s
    if (def.anchor) wz = PET_Z
    if (def.wall) wz = WALL_Z + 0.2
    node.position.set(wx, wy, wz)
    node.scaling.setAll(s)
    // 自然道具随机朝向（确定性黄金角）
    if (['tree', 'bush', 'rock', 'flower'].includes(prop.type)) {
      node.rotation.y = ((natureIdx * 137.5) % 360) * (Math.PI / 180)
      natureIdx++
    }
    if (def.anchor && prop.type === 'bowl') anchors.food = node
  }
  return anchors
}

// ---- 程序化装饰件 ----

export function buildFence(scene, parent) {
  const mat = new StandardMaterial('fence-mat', scene)
  mat.diffuseColor = new Color3(0.72, 0.55, 0.38)
  const fence = new TransformNode('fence', scene)
  fence.parent = parent
  fence.position.z = WALL_Z + 0.6
  const span = 6.2
  const n = 9
  const gap = (span * 2) / (n - 1)
  for (let i = 0; i < n; i++) {
    const post = MeshBuilder.CreateBox('fence-post', { width: 0.12, height: 0.85, depth: 0.12 }, scene)
    post.material = mat
    post.position.set(-span + i * gap, 0.42, 0)
    post.parent = fence
    post.isPickable = false
  }
  for (const y of [0.3, 0.62]) {
    const rail = MeshBuilder.CreateBox('fence-rail', { width: span * 2 + 0.2, height: 0.09, depth: 0.06 }, scene)
    rail.material = mat
    rail.position.set(0, y, 0)
    rail.parent = fence
    rail.isPickable = false
  }
  return fence
}

export function buildClouds(scene, parent) {
  const mat = new StandardMaterial('cloud-mat', scene)
  mat.diffuseColor = new Color3(1, 1, 1)
  mat.emissiveColor = new Color3(0.75, 0.78, 0.85)
  mat.alpha = 0.92
  const clouds = new TransformNode('clouds', scene)
  clouds.parent = parent
  const spots = [[-5.5, 4.2, -8], [2.5, 5.0, -9], [6.5, 3.6, -7]]
  let i = 0
  for (const [x, y, z] of spots) {
    const c = new TransformNode(`cloud-${i++}`, scene)
    c.parent = clouds
    c.position.set(x, y, z)
    for (let k = 0; k < 3; k++) {
      const b = MeshBuilder.CreateSphere(`cloud-b-${k}`, { segments: 7, diameter: 1.6 - k * 0.35 }, scene)
      b.material = mat
      b.position.set(k * 0.9 - 0.9, (k % 2) * 0.22, 0)
      b.scaling.y = 0.55
      b.parent = c
      b.isPickable = false
    }
  }
  return clouds
}

export function buildStarsAndMoon(scene, parent) {
  const mat = new StandardMaterial('star-mat', scene)
  mat.emissiveColor = new Color3(1, 0.97, 0.85)
  mat.disableLighting = true
  const stars = new TransformNode('stars', scene)
  stars.parent = parent
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < 46; i++) {
    const s = MeshBuilder.CreateBox(`star-${i}`, { size: 0.05 + rnd() * 0.07 }, scene)
    s.material = mat
    s.position.set((rnd() - 0.5) * 22, 3 + rnd() * 8, -12 - rnd() * 8)
    s.parent = stars
    s.isPickable = false
  }
  const moon = MeshBuilder.CreateSphere('moon', { segments: 12, diameter: 1.3 }, scene)
  const mmat = new StandardMaterial('moon-mat', scene)
  mmat.emissiveColor = new Color3(1, 0.96, 0.82)
  mmat.disableLighting = true
  moon.material = mmat
  moon.position.set(5.5, 6.5, -13)
  moon.parent = parent
  moon.isPickable = false
  return stars
}

export function buildCityline(scene, parent) {
  const mat = new StandardMaterial('city-mat', scene)
  mat.diffuseColor = new Color3(0.16, 0.2, 0.34)
  mat.emissiveColor = new Color3(0.08, 0.1, 0.2)
  const city = new TransformNode('cityline', scene)
  city.parent = parent
  let seed = 23
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  let x = -13
  while (x < 13) {
    const w = 0.9 + rnd() * 1.6
    const h = 1.2 + rnd() * 3.4
    const b = MeshBuilder.CreateBox('city-b', { width: w, height: h, depth: w * 0.8 }, scene)
    b.material = mat
    b.position.set(x, h / 2, -13 - rnd() * 2)
    b.parent = city
    b.isPickable = false
    x += w + 0.35 + rnd() * 0.6
  }
  return city
}

export function buildBall(scene, parent, prop) {
  const ball = MeshBuilder.CreateSphere('play-ball', { segments: 14, diameter: 0.55 }, scene)
  const mat = new StandardMaterial('ball-mat', scene)
  mat.diffuseColor = hexToColor3(prop?.color || '#FF6B6B')
  mat.specularColor = new Color3(0.35, 0.35, 0.35)
  ball.material = mat
  ball.position.set(stageXToWorld(((prop?.x ?? 0.5) * 100)), 0.28, PET_Z - 0.25)
  ball.parent = parent
  ball.isPickable = false
  return ball
}

// ---- 昼夜光照 ----

/** 搭建/重建光照：返回 { hemi, dir, lamp?, shadowGen }（lamp 仅夜晚与室内） */
export function setupLighting(scene, { night, isRoom }) {
  for (const name of ['b3d-hemi', 'b3d-dir', 'b3d-lamp']) {
    const l = scene.getLightByName(name)
    if (l) l.dispose()
  }
  const hemi = new HemisphericLight('b3d-hemi', new Vector3(0, 1, 0), scene)
  const dir = new DirectionalLight('b3d-dir', new Vector3(-0.5, -1.4, -0.6), scene)
  dir.position = new Vector3(6, 12, 7)
  // ⚠ 阴影视锥（历史坑）：DirectionalLight 默认正交范围是单位级（±1），
  //   大地面场景下阴影贴图边界会以锯齿状黑色楔形投射到画面 —— 必须
  //   autoUpdateExtends 或手动正交范围覆盖整个舞台
  dir.autoUpdateExtends = true
  dir.shadowMinZ = 1
  dir.shadowMaxZ = 40

  let lamp = null
  if (night) {
    // 夜景亮度校准（历史坑）：PBR 材质无环境贴图，仅靠直射光照明；Quaternius
    // 模型反照率普遍偏暗（狐狸主色 0.37/0.14/0.04），夜灯过弱时宠物会糊成
    // 黑色剪影（E2E 实测宠物区均值仅 rgb(125,105,92)）。提到「月光夜」而非
    // 「烛光夜」：保持氛围的同时宠物轮廓与暖色始终可读。
    hemi.intensity = 0.62
    hemi.diffuse = new Color3(0.66, 0.72, 0.95)
    hemi.groundColor = new Color3(0.24, 0.26, 0.4)
    dir.intensity = 0.75
    dir.diffuse = new Color3(0.74, 0.78, 0.98)
    lamp = new PointLight('b3d-lamp', new Vector3(-1.2, 2.6, -0.5), scene)
    lamp.intensity = 1.15
    lamp.diffuse = new Color3(1, 0.82, 0.55)
    lamp.range = 14
  } else {
    hemi.intensity = 0.85
    hemi.diffuse = new Color3(1, 0.98, 0.92)
    hemi.groundColor = new Color3(0.42, 0.45, 0.42)
    dir.intensity = 1.05
    dir.diffuse = new Color3(1, 0.96, 0.86)
  }

  const shadowGen = new ShadowGenerator(1024, dir)
  shadowGen.useBlurExponentialShadowMap = true
  shadowGen.blurKernel = 16
  shadowGen.darkness = night ? 0.3 : 0.2 // 柔和阴影：过深的低模阴影会被误认成黑块
  return { hemi, dir, lamp, shadowGen }
}

// ---- 爱心粒子纹理（抚摸反馈） ----

let heartTexture = null
export function heartTextureOf(scene) {
  if (heartTexture && !heartTexture.isDisposed()) return heartTexture
  const size = 64
  const dt = new DynamicTexture('heart-tex', { width: size, height: size }, scene, false)
  const ctx = dt.getContext()
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#ff5f8a'
  ctx.beginPath()
  ctx.moveTo(32, 56)
  ctx.bezierCurveTo(6, 38, 6, 16, 22, 12)
  ctx.bezierCurveTo(29, 10, 32, 18, 32, 22)
  ctx.bezierCurveTo(32, 18, 35, 10, 42, 12)
  ctx.bezierCurveTo(58, 16, 58, 38, 32, 56)
  ctx.fill()
  dt.hasAlpha = true
  dt.update()
  heartTexture = dt
  return dt
}

export const __internals = { meshCache }
