// ============ AI 调用审计：提示词与结果按「生成数据类型」分类存放 ============
// 设计目标（调试友好）：
//   · 每一次 AI 调用的完整提示词（system/user）、模型原始输出、解析结果、
//     校验去向（已采用 / 已降级 / 未采用）都按生成数据类型分类落档
//   · 可按类型浏览、复制单条、导出全部（JSON 文件）、分类或全部清空
//   · 新增 AI 能力时通过 registerAiTaskType() 登记新类型即可全链路复用
// 安全边界：
//   · 只保存接口地址、模型名、提示词与输出；API 密钥绝不入档
//     （记录点位于 provider 层，天然拿不到密钥字段）
//   · 入档文本一律经过密钥形态掩码（sk-… / Bearer …）
// 存储边界：
//   · localStorage['ttdc-ai-audit-v1']，独立于存档与 AI 配置，不随存档导出
//   · 每类 FIFO 上限 + 单字段截断 + 配额不足时淘汰最旧三分之一重试
//   · localStorage 缺席（Node 单测）自动退化为纯内存模式

export const AUDIT_KEY = 'ttdc-ai-audit-v1'
export const AUDIT_VERSION = 1
export const AUDIT_APP = 'tiantian-dianchong-ai-audit'

// ---- 任务类型注册表：按「生成数据类型」分类的唯一权威 ----
export const AI_TASK_TYPES = {
  behavior: { id: 'behavior', label: '行为决策', icon: '🐾', desc: 'AI 生命系统生成的宠物行为与心声', limit: 40 },
  species: { id: 'species', label: '物种设计', icon: '🧬', desc: 'AI 物种设计器生成的新物种定义', limit: 20 },
  scene: { id: 'scene', label: '场景生成', icon: '🏞️', desc: 'AI 场景生成器生成的生活场景', limit: 20 },
  connection: { id: 'connection', label: '连接测试', icon: '🔌', desc: '设置面板发起的 AI 连通性测试', limit: 10 }
}

// ---- 单字段截断上限（字符数） ----
const CAP = { system: 4000, user: 4000, text: 6000, data: 4000 }

// ---- 结果去向词表（annotateAudit 用） ----
export const OUTCOMES = {
  APPLIED: 'applied', // 生成数据通过校验并被采用
  FALLBACK: 'fallback', // 调用失败或校验未过，已降级本地随机系统
  REJECTED: 'rejected', // 生成数据未通过校验，被丢弃
  SKIPPED: 'skipped' // 因宠物睡眠 / 昏迷等原因未发起调用
}

// ---- 内部状态 ----
let cache = null
let persistBroken = false
const listeners = new Set()
let seq = 0

function ls() {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

function load() {
  if (cache) return cache
  let entries = {}
  try {
    const raw = ls()?.getItem(AUDIT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
        entries = parsed.entries
      }
    }
  } catch {
    /* 数据损坏时从空档开始 */
  }
  const clean = {}
  for (const [type, meta] of Object.entries(AI_TASK_TYPES)) {
    const arr = Array.isArray(entries[type]) ? entries[type].filter((e) => e && typeof e === 'object' && e.id && e.at) : []
    clean[type] = arr.slice(-meta.limit)
  }
  cache = { version: AUDIT_VERSION, entries: clean }
  return cache
}

function persist() {
  const store = ls()
  if (!store || persistBroken) return
  try {
    store.setItem(AUDIT_KEY, JSON.stringify(cache))
  } catch {
    // 配额不足：淘汰各类最旧的三分之一后重试一次；仍失败则转入纯内存模式
    for (const arr of Object.values(cache.entries)) {
      arr.splice(0, Math.ceil(arr.length / 3))
    }
    try {
      store.setItem(AUDIT_KEY, JSON.stringify(cache))
    } catch {
      persistBroken = true
    }
  }
}

function notify() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* 订阅方异常不影响审计主流程 */
    }
  }
}

// ---- 密钥掩码与截断 ----
const SECRET_RE = /(sk-[A-Za-z0-9_-]{6,})|(Bearer\s+[A-Za-z0-9._-]{8,})/g

export function scrubSecrets(text) {
  return String(text).replace(SECRET_RE, '***')
}

function capStr(v, n) {
  const s = v == null ? '' : String(v)
  const t = scrubSecrets(s)
  return t.length > n ? `${t.slice(0, n)}…（已截断，原长 ${s.length} 字）` : t
}

function capData(v, n) {
  if (v == null) return null
  let s
  try {
    s = JSON.stringify(v, null, 2)
  } catch {
    return { note: '数据不可序列化' }
  }
  const t = scrubSecrets(s)
  if (t.length > n) return { truncated: true, preview: `${t.slice(0, n)}…` }
  try {
    // 深拷贝解耦：调用方后续修改 res.data 不影响已入档的记录
    return JSON.parse(t)
  } catch {
    return { raw: t.slice(0, n) }
  }
}

function newId(type) {
  seq++
  return `${type}-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 记录一次 AI 调用（由 provider.chat 统一调用，业务模块不直接使用）
 * @param {string} type AI_TASK_TYPES 中登记的类型 id
 * @param {{gameClock?: number, tag?: string, request?: object, response?: object}} info
 * @returns {string|null} 记录 id（类型未登记时返回 null）
 */
export function recordAiCall(type, { gameClock = null, tag = '', request = {}, response = {} } = {}) {
  const meta = AI_TASK_TYPES[type]
  if (!meta) return null
  const store = load()
  const entry = {
    id: newId(type),
    type,
    at: Date.now(),
    gameClock: Number.isFinite(Number(gameClock)) ? Number(gameClock) : null,
    tag: capStr(tag, 40),
    request: {
      baseUrl: capStr(request.baseUrl, 300),
      model: capStr(request.model, 100),
      temperature: Number.isFinite(Number(request.temperature)) ? Number(request.temperature) : null,
      json: !!request.json,
      system: capStr(request.system, CAP.system),
      user: capStr(request.user, CAP.user)
    },
    response: {
      ok: !!response.ok,
      url: capStr(response.url, 300),
      status: Number.isFinite(Number(response.status)) ? Number(response.status) : null,
      error: response.error ? capStr(response.error, 300) : '',
      text: response.text != null ? capStr(response.text, CAP.text) : '',
      data: 'data' in response ? capData(response.data, CAP.data) : null,
      elapsed: Number.isFinite(Number(response.elapsed)) ? Number(response.elapsed) : null,
      usage: response.usage && typeof response.usage === 'object' ? response.usage : null
    },
    outcome: null
  }
  const arr = store.entries[type] || (store.entries[type] = [])
  arr.push(entry)
  if (arr.length > meta.limit) arr.splice(0, arr.length - meta.limit)
  persist()
  notify()
  return entry.id
}

/**
 * 调用方补充「结果去向」：模型返回后经业务校验的落地情况
 * @param {string} id recordAiCall 返回的记录 id
 * @param {{used: string, note?: string}} outcome used 取 OUTCOMES 词表
 */
export function annotateAudit(id, outcome) {
  if (!id || !outcome) return false
  const store = load()
  for (const arr of Object.values(store.entries)) {
    const e = arr.find((x) => x.id === id)
    if (e) {
      e.outcome = {
        used: capStr(outcome.used, 20),
        note: capStr(outcome.note || '', 200),
        at: Date.now()
      }
      persist()
      notify()
      return true
    }
  }
  return false
}

// ---- 查询 ----

/** 按类型取记录（最新在前）；type 为空取全部类型（同样最新在前） */
export function getAuditEntries(type = null) {
  const store = load()
  if (type) {
    if (!AI_TASK_TYPES[type]) return []
    return [...(store.entries[type] || [])].reverse()
  }
  const all = []
  for (const t of Object.keys(AI_TASK_TYPES)) all.push(...(store.entries[t] || []))
  return all.sort((a, b) => b.at - a.at)
}

/** 各分类条数与体积估算（字节为 JSON 序列化长度） */
export function auditStats() {
  const store = load()
  const types = {}
  let count = 0
  let bytes = 0
  for (const [t, meta] of Object.entries(AI_TASK_TYPES)) {
    const arr = store.entries[t] || []
    const b = JSON.stringify(arr).length
    types[t] = { label: meta.label, icon: meta.icon, desc: meta.desc, count: arr.length, bytes: b, limit: meta.limit }
    count += arr.length
    bytes += b
  }
  return { total: { count, bytes }, types }
}

// ---- 清理与导出 ----

/** 清空指定类型（或全部）记录 */
export function clearAudit(type = null) {
  const store = load()
  if (type) {
    if (!AI_TASK_TYPES[type]) return false
    store.entries[type] = []
  } else {
    for (const t of Object.keys(AI_TASK_TYPES)) store.entries[t] = []
  }
  persist()
  notify()
  return true
}

/** 导出全部记录为可读 JSON 文本（不含密钥），用于反馈问题 / 跨设备调试 */
export function exportAudit() {
  const stats = auditStats()
  const text = JSON.stringify(
    {
      app: AUDIT_APP,
      version: AUDIT_VERSION,
      exportedAt: new Date().toISOString(),
      stats: stats.total,
      taskTypes: Object.fromEntries(Object.entries(AI_TASK_TYPES).map(([k, v]) => [k, { label: v.label, desc: v.desc, limit: v.limit }])),
      entries: getAuditEntries()
    },
    null,
    2
  )
  const date = new Date().toISOString().slice(0, 10)
  return { text, filename: `天天电宠-AI调用记录-${date}.json` }
}

// ---- 订阅（UI 实时刷新） ----

export function subscribeAudit(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- 扩展：登记新的生成数据类型（如未来的宠物交互 / 多宠物协调） ----

export function registerAiTaskType(id, meta = {}) {
  if (!id || typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) return null
  if (AI_TASK_TYPES[id]) return AI_TASK_TYPES[id]
  const limit = Math.min(Math.max(Number(meta.limit) || 20, 1), 200)
  AI_TASK_TYPES[id] = {
    id,
    label: capStr(meta.label || id, 12),
    icon: capStr(meta.icon || '🤖', 4),
    desc: capStr(meta.desc || '', 80),
    limit
  }
  return AI_TASK_TYPES[id]
}
