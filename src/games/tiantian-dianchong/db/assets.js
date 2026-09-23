// ============ DragonBones 预设资产：清单与加载 ============
// 猫/狗/恐龙使用「全网检索导入」的预设骨骼数据（许可见 assets/db/ATTRIBUTION.md）；
// 猪/AI 物种无预设资产（全网无许可合规的猪形 DragonBones 资产），走程序化生成。
//
// 加载与缓存策略：
//   · 首次加载后缓存在模块级 Map（切换物种不重复请求）
//   · 纹理经 PIXI Assets 加载（走浏览器缓存与 SW 缓存优先策略）
//   · 同一 PixiFactory 单例解析全部数据（newInstance(false)，动画由播放器手动推进）

import { Assets, Texture } from 'pixi.js'

// ---- 预设资产清单（dir 为 assets/db/ 下的子目录名） ----
export const DB_ASSETS = {
  cat: {
    dir: 'cat',
    ske: 'cat_ske.json',
    tex: 'cat_tex.json',
    png: 'cat_tex.png',
    armature: 'cat',
    label: '猫咪'
  },
  dog: {
    dir: 'dog',
    ske: 'dog_ske.json',
    tex: 'dog_tex.json',
    png: 'dog_tex.png',
    armature: 'dog',
    label: '狗狗'
  },
  dino: {
    dir: 'dino',
    ske: 'dragon_boy_ske.json',
    tex: 'dragon_boy_tex.json',
    png: 'dragon_boy_tex.png',
    armature: 'DragonBoy',
    facingBase: -1, // 原画为侧视且朝左：面向右时需镜像
    label: '恐龙怪兽'
  }
}

const loaded = new Map() // key → { skeJson, texJson, texture }

/** 资产基础地址（相对当前页面，兼容子路径部署与 dev 虚拟入口） */
export function assetBaseUrl() {
  return new URL('assets/db/', document.baseURI).href
}

/**
 * 加载预设资产（带缓存）
 * @param {string} key DB_ASSETS 键
 * @returns {Promise<{skeJson: object, texJson: object, texture: Texture} | null>}
 */
export async function loadPresetAsset(key) {
  const def = DB_ASSETS[key]
  if (!def) return null
  if (loaded.has(key)) return loaded.get(key)

  const base = assetBaseUrl()
  const [skeJson, texJson, texture] = await Promise.all([
    fetch(new URL(`${def.dir}/${def.ske}`, base)).then((r) => {
      if (!r.ok) throw new Error(`骨架加载失败 ${def.ske}: ${r.status}`)
      return r.json()
    }),
    fetch(new URL(`${def.dir}/${def.tex}`, base)).then((r) => {
      if (!r.ok) throw new Error(`贴图集加载失败 ${def.tex}: ${r.status}`)
      return r.json()
    }),
    Assets.load(new URL(`${def.dir}/${def.png}`, base).href)
  ])

  const pack = { skeJson, texJson, texture: texture instanceof Texture ? texture : Texture.from(texture) }
  loaded.set(key, pack)
  return pack
}

/** 释放全部缓存纹理（页面卸载时可选调用） */
export function disposePresetAssets() {
  for (const pack of loaded.values()) {
    try { pack.texture?.destroy(true) } catch { /* ignore */ }
  }
  loaded.clear()
}
