// ============ 持久化与导入导出 ============
// 存档：localStorage['ttdc-save-v1']；API Key 单独存放、永不导出。
// 导出物为纯 JSON 文件，可读可编辑，用于备份 / 分享 / 跨设备同步。

export const SAVE_KEY = 'ttdc-save-v1'
export const AI_KEY = 'ttdc-ai-key-v1'
export const SAVE_VERSION = 1
export const LOG_LIMIT = 60

const DEFAULT_SETTINGS = {
  timeScale: 1,
  deathEnabled: false, // 死亡可选，默认禁用
  lifeSystem: 'random', // 'random' | 'ai'
  sceneId: 'living-room'
}

const num = (v, fallback, min = 0, max = 100) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// ---- 新存档 ----
export function newSave({ speciesId, name, sceneId = 'living-room' } = {}) {
  const now = Date.now()
  return {
    version: SAVE_VERSION,
    createdAt: new Date(now).toISOString(),
    gameClock: 0,
    lastSeen: now,
    settings: { ...DEFAULT_SETTINGS, sceneId },
    ai: { baseUrl: '', model: '' },
    pet: {
      speciesId,
      name,
      bornClock: 0,
      growth: 0,
      hunger: 92,
      mood: 90,
      hygiene: 95,
      health: 100,
      illness: null,
      dead: false,
      coma: false,
      forcedSleepUntil: 0,
      lastPlayClock: null,
      cooldowns: {},
      thresholds: {}
    },
    log: [],
    customSpecies: {},
    customScenes: {},
    lastStageKey: 'baby'
  }
}

// ---- 存档清洗：载入 / 导入统一走这里，防脏数据 ----
export function sanitizeSave(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.pet || typeof raw.pet !== 'object') return null
  const pet = raw.pet
  if (typeof pet.speciesId !== 'string' || !pet.speciesId) return null

  const settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) }
  settings.timeScale = [1, 60, 600, 3600].includes(settings.timeScale) ? settings.timeScale : 1
  settings.deathEnabled = !!settings.deathEnabled
  settings.lifeSystem = settings.lifeSystem === 'ai' ? 'ai' : 'random'
  settings.sceneId = typeof settings.sceneId === 'string' ? settings.sceneId : 'living-room'

  const save = {
    version: SAVE_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    gameClock: num(raw.gameClock, 0, 0, Number.MAX_SAFE_INTEGER),
    lastSeen: num(raw.lastSeen, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    settings,
    ai: {
      baseUrl: typeof raw.ai?.baseUrl === 'string' ? raw.ai.baseUrl.slice(0, 300) : '',
      model: typeof raw.ai?.model === 'string' ? raw.ai.model.slice(0, 100) : ''
    },
    pet: {
      speciesId: pet.speciesId,
      name: typeof pet.name === 'string' && pet.name.trim() ? pet.name.trim().slice(0, 8) : '小家伙',
      bornClock: num(pet.bornClock, 0, 0, Number.MAX_SAFE_INTEGER),
      growth: num(pet.growth, 0, 0, Number.MAX_SAFE_INTEGER),
      hunger: num(pet.hunger, 50),
      mood: num(pet.mood, 50),
      hygiene: num(pet.hygiene, 50),
      health: num(pet.health, 50),
      illness:
        pet.illness && typeof pet.illness === 'object' && pet.illness.id
          ? { id: String(pet.illness.id).slice(0, 20), name: String(pet.illness.name || '不适').slice(0, 12), since: num(pet.illness.since, 0, 0, Number.MAX_SAFE_INTEGER) }
          : null,
      dead: !!pet.dead,
      coma: !!pet.coma,
      forcedSleepUntil: num(pet.forcedSleepUntil, 0, 0, Number.MAX_SAFE_INTEGER),
      lastPlayClock: Number.isFinite(Number(pet.lastPlayClock)) ? Number(pet.lastPlayClock) : null,
      cooldowns: pet.cooldowns && typeof pet.cooldowns === 'object' ? pet.cooldowns : {},
      thresholds: pet.thresholds && typeof pet.thresholds === 'object' ? pet.thresholds : {}
    },
    log: (Array.isArray(raw.log) ? raw.log : [])
      .filter((e) => e && typeof e.text === 'string')
      .map((e) => ({ t: num(e.t, 0, 0, Number.MAX_SAFE_INTEGER), kind: String(e.kind || 'info').slice(0, 20), text: e.text.slice(0, 80), icon: String(e.icon || '').slice(0, 4) }))
      .slice(-LOG_LIMIT),
    customSpecies: raw.customSpecies && typeof raw.customSpecies === 'object' ? raw.customSpecies : {},
    customScenes: raw.customScenes && typeof raw.customScenes === 'object' ? raw.customScenes : {},
    lastStageKey: typeof raw.lastStageKey === 'string' ? raw.lastStageKey : 'baby'
  }
  return save
}

// ---- 本机持久化 ----
export function loadSave() {
  try {
    const text = localStorage.getItem(SAVE_KEY)
    if (!text) return null
    return sanitizeSave(JSON.parse(text))
  } catch {
    return null
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch { /* 忽略 */ }
}

export function pushLog(save, event) {
  if (!event?.text) return
  save.log.push({ t: event.t ?? save.gameClock, kind: event.kind || 'info', text: event.text.slice(0, 80), icon: event.icon || '' })
  if (save.log.length > LOG_LIMIT) save.log.splice(0, save.log.length - LOG_LIMIT)
}

// ---- 导出 / 导入 ----
export function exportSave(save) {
  const text = JSON.stringify({ app: 'tiantian-dianchong', ...save }, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `天天电宠-存档-${save.pet.name || '小家伙'}-${date}.json`
  return { text, filename }
}

export function parseImportedSave(text) {
  try {
    const raw = JSON.parse(text)
    if (raw && raw.app !== 'tiantian-dianchong' && raw.version !== SAVE_VERSION) {
      return { ok: false, error: '这不是天天电宠的存档文件' }
    }
    const save = sanitizeSave(raw)
    if (!save) return { ok: false, error: '存档内容不完整（缺少宠物数据）' }
    return { ok: true, save }
  } catch {
    return { ok: false, error: '文件不是有效的 JSON 存档' }
  }
}

// ---- AI 配置（密钥独立存放，永不导出） ----
export function loadAiConfig() {
  let cfg = { baseUrl: '', model: '' }
  try {
    const text = localStorage.getItem('ttdc-ai-cfg-v1')
    if (text) cfg = { ...cfg, ...JSON.parse(text) }
  } catch { /* 忽略 */ }
  return cfg
}

export function saveAiConfig(cfg) {
  try {
    localStorage.setItem('ttdc-ai-cfg-v1', JSON.stringify({ baseUrl: String(cfg.baseUrl || '').slice(0, 300), model: String(cfg.model || '').slice(0, 100) }))
  } catch { /* 忽略 */ }
}

export function getApiKey() {
  try {
    return localStorage.getItem(AI_KEY) || ''
  } catch {
    return ''
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(AI_KEY, String(key).slice(0, 200))
    else localStorage.removeItem(AI_KEY)
  } catch { /* 忽略 */ }
}

export function hasApiKey() {
  return !!getApiKey()
}
