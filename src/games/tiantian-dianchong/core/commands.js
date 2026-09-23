// ============ 指令系统：协议与总线 ============
// 三层架构的枢纽：生命系统与交互系统都只产出「指令」(PetCommand)，
// 指令经总线校验后交给动作系统执行，由骨骼动画实时呈现。
//
// 指令协议 PetCommand：
//   { id, type: 'act', action, source, priority, reason }
//   { id, type: 'move', targetX(0-100), source, priority, reason }
//
// 优先级约定：
//   0  ambient   —— 生命系统的自发行为（闲逛/打盹/发呆……）
//   5  routine   —— 生理节律（到点入睡/醒来）
//   10 user      —— 玩家交互（喂食/玩耍/洗澡/哄睡……）
//   20 critical  —— 生死攸关（昏迷/死亡/苏醒）

let SEQ = 0

export const COMMAND_SOURCES = ['life', 'user', 'scene', 'prop', 'pet', 'system']

export const PRIORITIES = { ambient: 0, routine: 5, user: 10, critical: 20 }

// 动作白名单（与 actionSystem 的动作注册表保持一致；在此声明供指令层校验）
export const COMMAND_ACTIONS = [
  'idle', 'wander', 'stare', 'beg', 'groom',
  'sleep', 'wake',
  'eat', 'snack', 'play', 'bathe', 'medicine',
  'pet', 'happy', 'sad', 'shiver',
  'coma', 'dead'
]

const isAction = (v) => typeof v === 'string' && COMMAND_ACTIONS.includes(v)

/**
 * 构造一条指令（不派发）。非法字段会被拒绝。
 * @returns {{ ok: boolean, command?: object, error?: string }}
 */
export function createCommand(type, payload = {}, opts = {}) {
  if (type !== 'act' && type !== 'move') return { ok: false, error: `未知指令类型：${type}` }
  const source = COMMAND_SOURCES.includes(opts.source) ? opts.source : 'system'
  const priority = Number.isFinite(opts.priority)
    ? Math.min(20, Math.max(0, opts.priority | 0))
    : PRIORITIES.ambient
  const command = {
    id: `cmd-${++SEQ}`,
    type,
    source,
    priority,
    at: opts.now ?? Date.now(),
    reason: typeof opts.reason === 'string' ? opts.reason.slice(0, 60) : ''
  }
  if (type === 'act') {
    if (!isAction(payload.action)) return { ok: false, error: `未知动作：${payload.action}` }
    command.action = payload.action
  } else {
    const x = Number(payload.targetX)
    if (!Number.isFinite(x) || x < 0 || x > 100) return { ok: false, error: `非法目标位置：${payload.targetX}` }
    command.targetX = Math.round(x * 10) / 10
  }
  return { ok: true, command }
}

/**
 * 指令总线：统一入口 + 环形历史（调试审计）。
 * 总线本身不做调度决策——校验合法的指令原样交给 onDispatch（动作系统）。
 */
export function createCommandBus({ onDispatch, historyLimit = 40 } = {}) {
  const history = []
  const listeners = new Set()
  let dropped = 0

  function record(entry) {
    history.push(entry)
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit)
    for (const fn of listeners) {
      try { fn(entry) } catch { /* 订阅方异常不影响总线 */ }
    }
  }

  function dispatch(command) {
    if (!command || typeof command !== 'object' || !command.id) return { ok: false, error: '非法指令对象' }
    let verdict
    try {
      verdict = onDispatch ? onDispatch(command) : { ok: true }
    } catch (e) {
      verdict = { ok: false, error: String(e) }
    }
    if (!verdict || typeof verdict.ok !== 'boolean') verdict = { ok: !!verdict }
    record({ ...command, accepted: verdict.ok, note: verdict.reason || '' })
    if (!verdict.ok) dropped++
    return verdict
  }

  /** 便捷派发：构造 + 派发一步完成 */
  function send(type, payload, opts) {
    const r = createCommand(type, payload, opts)
    if (!r.ok) {
      dropped++
      record({ id: `bad-${++SEQ}`, type: String(type), source: 'system', priority: -1, at: Date.now(), reason: r.error, accepted: false, note: r.error, invalid: true })
      return r
    }
    const verdict = dispatch(r.command)
    return { ...verdict, command: r.command }
  }

  return {
    dispatch,
    send,
    history: () => [...history],
    recent: (n = 8) => history.slice(-n),
    droppedCount: () => dropped,
    subscribe(fn) {
      if (typeof fn === 'function') listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

/** 生命系统行为 → 动作名映射（供双生命系统共用） */
export const BEHAVIOR_TO_ACTION = {
  idle: 'idle',
  wander: 'wander',
  sleep: 'sleep',
  play: 'play',
  beg: 'beg',
  groom: 'groom',
  stare: 'stare'
}
