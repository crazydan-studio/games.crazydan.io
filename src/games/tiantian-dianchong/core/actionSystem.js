// ============ 动作系统：电宠的「身体层」 ============
// 消费指令总线送来的指令，维护动作状态机（当前动作 / 接近阶段 / 朝向），
// 并通过生命周期事件驱动骨骼动画（SpinePetPlayer 消费）：
//   · ACTION_START / ACTION_END —— 动作开始与结束（携带动画名与循环标记）
//   · MOVE_TO / ARRIVED —— 移动指令与到达回报（渲染层平滑执行）
//
// 设计约束：本模块为纯逻辑（Node 可单测），不含任何渲染/DOM；
// 位置与时间的推进由外部喂入（tick / updatePosition / arrived）。

export const ACTION_EVENT = {
  START: 'action:start',
  END: 'action:end',
  MOVE: 'move:to',
  ARRIVED: 'arrived'
}

// ---- 动作注册表：动作 → 动画/时长/锚点/体态 ----
// anchor：动作执行前需先走向场景锚点（food=食盆 bed=床铺），无锚点则原地执行
// posture：sleep=躺卧体态（受睡眠门禁保护） gone=死亡体态
export const ACTIONS = {
  idle: { anim: 'idle', loop: true },
  wander: { anim: 'walk', loop: true, wander: true },
  stare: { anim: 'stare', loop: true, duration: 6 },
  beg: { anim: 'beg', duration: 2.4 },
  groom: { anim: 'groom', duration: 2.6 },
  sleep: { anim: 'sleep', loop: true, posture: 'sleep', anchor: 'bed' },
  wake: { anim: 'wake', duration: 0.9 },
  eat: { anim: 'eat', duration: 1.8, anchor: 'food' },
  snack: { anim: 'eat', duration: 1.2, anchor: 'food' },
  play: { anim: 'play', duration: 2.8 },
  bathe: { anim: 'wash', duration: 2.6 },
  medicine: { anim: 'medicine', duration: 1.6 },
  pet: { anim: 'pet', duration: 0.9 },
  happy: { anim: 'happy', duration: 1.2 },
  sad: { anim: 'sad', loop: true, duration: 5 },
  shiver: { anim: 'shiver', duration: 0.8 },
  coma: { anim: 'coma', loop: true, posture: 'sleep', critical: true },
  dead: { anim: 'dead', loop: true, posture: 'gone', critical: true }
}

const ANCHOR_TOLERANCE = 8 // 距锚点 ≤8（0-100 舞台坐标）视为已就位

/**
 * 创建动作系统
 * @param {object} opts
 *   anchors(): {food?:0-100, bed?:0-100} 场景交互器提供的锚点
 *   onEvent(ev): 生命周期事件回调
 *   now(): 毫秒时钟（可注入，单测确定性）
 */
export function createActionSystem({ anchors = () => ({}), onEvent = () => {}, now = () => Date.now() } = {}) {
  const state = {
    action: 'idle',
    phase: 'acting', // moving | acting
    startedAt: 0,
    endsAt: Infinity, // loop / wander 动作为 Infinity
    targetX: 50,
    x: 50,
    facing: 1,
    lastCommandId: null
  }

  const emit = (type, detail) => onEvent({ type, ...detail })
  const def = (name) => ACTIONS[name]
  const postureOf = () => def(state.action)?.posture || 'normal'
  const isSleepingPosture = () => postureOf() === 'sleep' || postureOf() === 'gone'

  function fireStart(name) {
    const d = def(name)
    emit(ACTION_EVENT.START, {
      action: name,
      anim: d.anim,
      loop: !!d.loop,
      posture: d.posture || 'normal'
    })
  }

  function fireEnd(name) {
    emit(ACTION_EVENT.END, { action: name, anim: def(name)?.anim })
  }

  /** 结束当前动作并回落 idle（不发指令，直接切换，避免总线回环） */
  function settleToIdle() {
    if (state.action === 'idle') return
    fireEnd(state.action)
    state.action = 'idle'
    state.phase = 'acting'
    state.startedAt = now()
    state.endsAt = Infinity
    fireStart('idle')
  }

  /** 是否在锚点附近（需先移动才执行动作） */
  function needsApproach(name) {
    const anchorKey = def(name)?.anchor
    if (!anchorKey) return false
    const ax = anchors()[anchorKey]
    if (!Number.isFinite(ax)) return false
    return Math.abs(state.x - ax) > ANCHOR_TOLERANCE
  }

  /** 进入某个动作（跳过锚点接近或到达后调用） */
  function beginAction(name, viaApproach) {
    const d = def(name)
    if (state.action !== 'idle') fireEnd(state.action)
    state.action = name
    state.phase = 'acting'
    state.startedAt = now()
    state.endsAt = d.duration ? state.startedAt + d.duration * 1000 : Infinity
    state.lastViaApproach = !!viaApproach
    fireStart(name)
    if (d.anchor && Number.isFinite(anchors()[d.anchor])) {
      state.targetX = anchors()[d.anchor]
    }
  }

  /** 走向目标位置（wander 自选随机点或锚点） */
  function beginMoving(name, targetX) {
    const d = def(name)
    if (state.action !== name && state.action !== 'idle') fireEnd(state.action)
    state.action = name
    state.phase = 'moving'
    state.startedAt = now()
    state.endsAt = Infinity
    state.targetX = Math.min(100, Math.max(0, targetX))
    state.lastViaApproach = false
    // 移动阶段一律播放行走动画（目标动作的动画在就位后由 START 事件触发）
    emit(ACTION_EVENT.MOVE, { action: name, targetX: state.targetX, anim: 'walk' })
  }

  /**
   * 指令执行入口（由指令总线 onDispatch 调用）
   * @returns {{ ok: boolean, reason?: string }}
   */
  function handleCommand(cmd) {
    if (cmd.type === 'move') {
      // 睡眠/死亡体态不接受移动指令（除非高优先级强制）
      if (isSleepingPosture() && cmd.priority < 10) return { ok: false, reason: '睡眠中，忽略移动' }
      if (postureOf() === 'gone') return { ok: false, reason: '已回到星尘' }
      beginMoving('wander', cmd.targetX)
      state.lastCommandId = cmd.id
      return { ok: true, reason: `走向 ${cmd.targetX}` }
    }

    const name = cmd.action
    const d = def(name)
    if (!d) return { ok: false, reason: `未注册动作：${name}` }

    // —— 死亡是终极状态：幂等接受，其余一律拒绝 ——
    if (postureOf() === 'gone') {
      if (name === 'dead') return { ok: true, reason: '维持现状' }
      return { ok: false, reason: '已回到星尘，无法执行动作' }
    }

    // —— 睡眠体态的门禁 ——
    if (isSleepingPosture()) {
      const allowed = cmd.priority >= 10 || ['wake', 'medicine', 'coma', 'dead'].includes(name)
      if (!allowed) return { ok: false, reason: '睡眠中，仅可唤醒/喂药' }
    }

    // —— 同体态内打断规则 ——
    if (state.action === name && state.phase === 'acting' && d.loop) {
      return { ok: true, reason: '动作已在进行' } // 幂等：睡眠/发呆续态
    }
    const curCritical = !!def(state.action)?.critical
    if (curCritical && !d.critical && cmd.priority < 20) {
      return { ok: false, reason: '危急状态保护中' }
    }
    // 玩家(≥10)可打断普通动作；ambient(0)在忙碌（非 idle 的限时动作）时排队丢弃
    const busy = state.action !== 'idle' && state.phase === 'acting' && Number.isFinite(state.endsAt)
    if (busy && cmd.priority < 10 && name !== 'wake') {
      return { ok: false, reason: `正忙于「${state.action}」` }
    }

    state.lastCommandId = cmd.id

    // —— 锚点接近：先走过去，再执行 ——
    if (needsApproach(name)) {
      beginMoving(name, anchors()[def(name).anchor])
      return { ok: true, reason: `走向${def(name).anchor === 'food' ? '食盆' : '床铺'}再${ACTION_LABEL[name] || name}` }
    }

    // —— wander：自选随机目标 ——
    if (d.wander) {
      const target = wanderTarget()
      if (Math.abs(state.x - target) <= ANCHOR_TOLERANCE) {
        beginAction('wander', false)
        fireEnd('wander')
        settleToIdle()
        return { ok: true, reason: '原地踱步' }
      }
      beginMoving('wander', target)
      return { ok: true, reason: `踱步去 ${Math.round(target)}` }
    }

    beginAction(name, false)
    return { ok: true, reason: ACTION_LABEL[name] || name }
  }

  /** wander 目标点：避开当前所在的小邻域，让踱步可见 */
  function wanderTarget(rng = Math.random) {
    for (let i = 0; i < 5; i++) {
      const t = 12 + rng() * 76
      if (Math.abs(t - state.x) > 14) return t
    }
    return state.x > 50 ? 20 : 80
  }

  /** 渲染层回报当前位置（0-100） */
  function updatePosition(x, facing) {
    if (Number.isFinite(x)) state.x = Math.min(100, Math.max(0, x))
    if (facing === 1 || facing === -1) state.facing = facing
  }

  /** 渲染层到达目标回报 */
  function arrived() {
    if (state.phase !== 'moving') return
    const name = state.action
    const d = def(name)
    if (d.wander) {
      // 踱步完成 → 回 idle
      state.phase = 'acting'
      fireEnd(name)
      settleToIdle()
      return
    }
    if (d.anchor) {
      beginAction(name, true) // 就位，正式执行（eat / sleep 等）
      return
    }
    state.phase = 'acting'
  }

  /** 时间推进：限时动作到期回落（由渲染帧或兜底定时器驱动） */
  function tick() {
    if (state.phase === 'acting' && Number.isFinite(state.endsAt) && now() >= state.endsAt) {
      settleToIdle()
    }
  }

  /** 快照（供 UI / 调试面板） */
  function snapshot() {
    const d = def(state.action)
    return {
      action: state.action,
      phase: state.phase,
      anim: d?.anim || 'idle',
      loop: !!d?.loop,
      posture: d?.posture || 'normal',
      x: Math.round(state.x * 10) / 10,
      facing: state.facing,
      targetX: state.targetX,
      moving: state.phase === 'moving',
      lastCommandId: state.lastCommandId,
      asleep: postureOf() === 'sleep' && state.action !== 'idle',
      gone: postureOf() === 'gone'
    }
  }

  return { handleCommand, updatePosition, arrived, tick, snapshot, wanderTarget, ACTIONS }
}

// ---- 动作中文名（指令审计与 UI 日志用） ----
export const ACTION_LABEL = {
  idle: '安静待着', wander: '踱步闲逛', stare: '望着你发呆', beg: '撒娇讨好',
  groom: '梳洗打扮', sleep: '呼呼大睡', wake: '伸个懒腰醒来', eat: '大快朵颐',
  snack: '享用零食', play: '撒欢玩耍', bathe: '泡泡洗澡', medicine: '乖乖吃药',
  pet: '享受摸摸', happy: '开心蹦跳', sad: '蔫蔫地难过', shiver: '冷得发抖',
  coma: '昏迷不醒', dead: '回到星尘'
}
