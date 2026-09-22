// ============ 游戏状态机（Vue 组合式函数） ============
// 负责动画时序编排、计分/连击、关卡进度、限时模式与提示
// 以及特殊块（炸弹猫 / 彩虹猫）的诞生、激活与连锁
import { reactive, ref, computed } from 'vue'
import {
  BOARD_SIZE,
  createBoard,
  findMatchGroups,
  findPossibleMove,
  swapCells,
  collapseColumns,
  reshuffleTypes,
  expandSpecials
} from './engine'
import { playSound } from '../utils/sound'
import { toast } from '../utils/toast'
import { uiState } from '../store/ui'

const SWAP_MS = 200 // 交换动画
const POP_MS = 300 // 消除动画
const FALL_MS = 300 // 下落动画
const INTRO_MS = 420 // 开局落场动画
const MOVES_PER_LEVEL = 25
const TIME_LIMIT = 60

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const raf2 = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

export function createGame(mode) {
  const modeRef = ref(mode) // 'classic' | 'time'
  const grid = reactive(
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
  )
  const tiles = reactive([]) // 渲染用扁平列表，元素与 grid 中共用同一对象
  const score = ref(0)
  const moves = ref(MOVES_PER_LEVEL)
  const level = ref(1)
  const timeLeft = ref(TIME_LIMIT)
  const best = ref(Number(localStorage.getItem('ttxsl-best') || 0))
  const state = ref('idle') // idle | busy | clear | over
  const selectedId = ref(null)
  const hint = ref(null) // { a: tileId, b: tileId }
  const popups = reactive([])
  const comboNow = ref(0)
  let popSeq = 0
  let idleTimer = null
  let tickTimer = null

  const target = computed(() => 800 + (level.value - 1) * 600)
  const stars = computed(() => (moves.value >= 12 ? 3 : moves.value >= 6 ? 2 : 1))
  const isClassic = computed(() => modeRef.value === 'classic')

  function clearAllTimers() {
    clearTimeout(idleTimer)
    clearInterval(tickTimer)
  }

  function loadBoard() {
    const g = createBoard()
    tiles.length = 0
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const t = g[r][c]
        t.x = c
        t.y = r - BOARD_SIZE - 1 // 初始摆在棋盘上方 → 开局整体落入
        grid[r][c] = t
        tiles.push(t)
      }
    }
  }

  async function playIntro() {
    state.value = 'busy'
    await raf2()
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c].y = r
      }
    }
    await wait(INTRO_MS)
    state.value = 'idle'
    resetIdleTimer()
  }

  function startTimer() {
    tickTimer = setInterval(() => {
      if (uiState.overlay || state.value === 'clear') return // 弹窗覆盖时暂停
      timeLeft.value--
      if (timeLeft.value <= 0) {
        timeLeft.value = 0
        clearInterval(tickTimer)
        if (score.value > best.value) {
          best.value = score.value
          localStorage.setItem('ttxsl-best', String(score.value))
        }
        state.value = 'over'
        selectedId.value = null
        playSound('over')
      }
    }, 1000)
  }

  function resetRound({ keepLevel = true } = {}) {
    clearAllTimers()
    score.value = 0
    moves.value = MOVES_PER_LEVEL
    timeLeft.value = TIME_LIMIT
    selectedId.value = null
    hint.value = null
    comboNow.value = 0
    state.value = 'idle'
    loadBoard()
    if (modeRef.value === 'time') startTimer()
    playIntro()
  }

  function start() {
    resetRound()
  }

  function restart() {
    resetRound()
    toast(modeRef.value === 'classic' ? '新的一局开始！' : '挑战重新开始！')
  }

  function nextLevel() {
    level.value += 1
    resetRound()
  }

  function destroy() {
    clearAllTimers()
  }

  // ---------- 提示（闲置 5 秒自动亮起） ----------
  function resetIdleTimer() {
    clearTimeout(idleTimer)
    hint.value = null
    if (state.value !== 'idle') return
    idleTimer = setTimeout(() => {
      if (state.value !== 'idle' || uiState.overlay) return
      const mv = findPossibleMove(grid)
      if (mv) hint.value = { a: grid[mv.r][mv.c].id, b: grid[mv.r2][mv.c2].id }
    }, 5000)
  }

  function onInteract() {
    resetIdleTimer()
  }

  function showHint() {
    if (state.value !== 'idle') return
    const mv = findPossibleMove(grid)
    if (mv) {
      hint.value = { a: grid[mv.r][mv.c].id, b: grid[mv.r2][mv.c2].id }
      setTimeout(() => {
        if (hint.value) hint.value = null
      }, 2600)
    } else {
      toast('暂时没有可行步，马上帮你洗牌～')
    }
  }

  // ---------- 计分与飘字 ----------
  function groupPoints(g) {
    return g.length * 10 + (g.length - 3) * 20
  }

  function pushPopup(r, c, text) {
    const id = ++popSeq
    popups.push({
      id,
      left: `${((c + 0.5) / BOARD_SIZE) * 100}%`,
      top: `${((r + 0.5) / BOARD_SIZE) * 100}%`,
      text
    })
    setTimeout(() => {
      const i = popups.findIndex((p) => p.id === id)
      if (i >= 0) popups.splice(i, 1)
    }, 950)
  }

  function applyScore(groups, combo) {
    let gained = 0
    for (const g of groups) gained += groupPoints(g)
    gained *= combo
    score.value += gained
    for (const g of groups) {
      const cx = g.cells.reduce((s, cell) => s + cell.c, 0) / g.cells.length
      const cy = g.cells.reduce((s, cell) => s + cell.r, 0) / g.cells.length
      const pts = groupPoints(g) * combo
      pushPopup(cy, cx, `+${pts}${combo > 1 ? ` ×${combo}` : ''}`)
    }
  }

  // 特殊块连锁的计分与飘字（炸弹 +120 / 被波及的彩虹猫 +40×格数）
  function applySpecialScore(triggers, combo) {
    for (const tr of triggers) {
      const pts = tr.kind === 'bomb' ? 120 * combo : 40 * (tr.cleared || 0) * combo
      if (pts <= 0) continue
      score.value += pts
      const label = tr.kind === 'bomb' ? '轰！' : '彩虹猫！'
      pushPopup(tr.r, tr.c, `${label}+${pts}${combo > 1 ? ` ×${combo}` : ''}`)
    }
  }

  // 首次诞生特殊块时给一句教学提示
  function notifySpecialBorn(kind) {
    const key = kind === 'bomb' ? 'ttxsl-seen-bomb' : 'ttxsl-seen-rainbow'
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {
      /* 隐私模式下忽略 */
    }
    toast(kind === 'bomb' ? '炸弹猫诞生！消除它会引爆 3×3 喵！' : '彩虹猫诞生！和任意表情交换可清除全场同款！')
  }

  // ---------- 消除后的统一收尾：等待动画 → 移除 → 下落补充 ----------
  async function flushRemovals(cells, extraMs = 0) {
    const ids = []
    for (const { r, c } of cells) {
      const t = grid[r][c]
      if (t && t.removing) ids.push(t.id)
    }
    await wait(POP_MS + extraMs)
    for (const { r, c } of cells) {
      const t = grid[r][c]
      if (t && t.removing) grid[r][c] = null
    }
    for (const id of ids) {
      const i = tiles.findIndex((t) => t.id === id)
      if (i >= 0) tiles.splice(i, 1)
    }
    await collapseAndFall()
  }

  async function collapseAndFall() {
    const spawned = collapseColumns(grid)
    if (spawned.length) {
      const perCol = {}
      for (const s of spawned) perCol[s.c] = (perCol[s.c] || 0) + 1
      for (const s of spawned) {
        const t = grid[s.r][s.c] // 通过 reactive grid 取代理，保证后续修改能触发渲染
        t.x = s.c
        t.y = s.r - perCol[s.c] - 0.25 // 先摆到棋盘上方
        tiles.push(t)
      }
      await raf2()
      for (const s of spawned) {
        grid[s.r][s.c].y = s.r
      }
      await wait(FALL_MS)
    } else {
      await wait(60)
    }
  }

  // ---------- 消除连锁主循环 ----------
  async function resolveCascades(preferCells) {
    let combo = 0
    for (;;) {
      const groups = findMatchGroups(grid, preferCells)
      preferCells = null // 落子偏好只作用于首轮
      if (!groups.length) break
      combo++
      comboNow.value = combo
      applyScore(groups, combo)

      // 基础消除格 + 特殊块转化（特殊块在出生点诞生，不参与本轮消除）
      const baseCells = []
      const transforms = []
      const skipIds = new Set()
      for (const g of groups) {
        if (g.special) {
          const t = grid[g.spawn.r][g.spawn.c]
          if (t) {
            transforms.push({ kind: g.special, type: g.special === 'bomb' ? g.type : -1, tile: t })
            skipIds.add(t.id)
          }
          for (const cell of g.cells) {
            if (cell.r === g.spawn.r && cell.c === g.spawn.c) continue
            baseCells.push(cell)
          }
        } else {
          baseCells.push(...g.cells)
        }
      }

      // 连锁展开：命中的炸弹引爆 3×3、被波及的彩虹猫随机清一种类型
      const { cells, triggers } = expandSpecials(grid, baseCells, skipIds)
      applySpecialScore(triggers, combo)

      // 音效
      if (triggers.some((x) => x.kind === 'rainbow')) playSound('rainbow')
      else if (triggers.length) playSound('bomb')
      else playSound(combo >= 2 ? 'combo' : 'pop')

      // 标记动画：基础消除正常 pop，连锁波及闪白
      const baseKeys = new Set(baseCells.map((x) => x.r * BOARD_SIZE + x.c))
      for (const cell of cells) {
        const t = grid[cell.r][cell.c]
        if (t) {
          t.removing = true
          if (!baseKeys.has(cell.r * BOARD_SIZE + cell.c)) t.blasted = true
        }
      }

      // 特殊块诞生（与消除动画同场播放）
      if (transforms.length) {
        playSound('born')
        for (const tr of transforms) {
          tr.tile.kind = tr.kind
          tr.tile.type = tr.type
          tr.tile.born = true
          notifySpecialBorn(tr.kind)
          const tileRef = tr.tile
          setTimeout(() => {
            tileRef.born = false
          }, 700)
        }
      }

      await flushRemovals(cells, triggers.length ? 140 : 0)
    }
    comboNow.value = 0
    return combo
  }

  // ---------- 彩虹猫激活 ----------
  async function activateRainbow(rb, partner) {
    const rp = posOf(rb)
    const isSuper = partner.kind === 'rainbow'

    let initial = []
    if (isSuper) {
      // 双彩虹：清空全场
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (grid[r][c]) initial.push({ r, c })
        }
      }
    } else {
      // 与普通块/炸弹交换：清除全场该类型（同类型炸弹会连锁引爆）
      const targetType = partner.type
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const t = grid[r][c]
          if (t && (t.type === targetType || t === rb)) initial.push({ r, c })
        }
      }
    }

    // 主动激活的彩虹猫不再二次触发；双彩虹时其他彩虹猫也静默
    const silentIds = new Set([rb.id])
    if (isSuper) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const t = grid[r][c]
          if (t && t.kind === 'rainbow') silentIds.add(t.id)
        }
      }
    }

    const { cells, triggers } = expandSpecials(grid, initial, new Set(), silentIds)
    const pts = (isSuper ? 30 : 25) * cells.length
    score.value += pts
    applySpecialScore(triggers, 1)
    if (rp) pushPopup(rp.r, rp.c, isSuper ? `超级彩虹猫！+${pts}` : `彩虹猫！+${pts}`)
    playSound(isSuper ? 'super' : 'rainbow')

    for (const cell of cells) {
      const t = grid[cell.r][cell.c]
      if (t) {
        t.removing = true
        t.blasted = true
      }
    }
    if (rp) {
      const t = grid[rp.r][rp.c]
      if (t) {
        t.rainbowBlast = true
        t.blasted = false
      }
    }

    await flushRemovals(cells, isSuper ? 260 : 200)
  }

  // ---------- 炸弹猫对炸弹猫：双双引爆 ----------
  async function activateBombPair(cells) {
    const { cells: expanded, triggers } = expandSpecials(grid, cells)
    applySpecialScore(triggers, 1)
    playSound('bomb')
    for (const cell of expanded) {
      const t = grid[cell.r][cell.c]
      if (t) {
        t.removing = true
        t.blasted = true
      }
    }
    await flushRemovals(expanded, 160)
  }

  function posOf(tile) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (grid[r][c] === tile) return { r, c }
      }
    }
    return null
  }

  // ---------- 交换 ----------
  async function trySwap(r1, c1, r2, c2) {
    if (state.value !== 'idle') return false
    const a = grid[r1][c1]
    const b = grid[r2][c2]
    if (!a || !b) return false
    state.value = 'busy'
    selectedId.value = null
    hint.value = null
    playSound('swap')

    swapCells(grid, r1, c1, r2, c2)
    await wait(SWAP_MS + 30)

    // —— 彩虹猫交换：无条件有效 ——
    if (a.kind === 'rainbow' || b.kind === 'rainbow') {
      const rb = a.kind === 'rainbow' ? a : b
      const partner = rb === a ? b : a
      if (modeRef.value === 'classic') moves.value--
      await activateRainbow(rb, partner)
      await resolveCascades()
      await afterTurnChecks()
      return true
    }

    // —— 炸弹猫对炸弹猫：无条件有效，双双引爆 ——
    if (a.kind === 'bomb' && b.kind === 'bomb') {
      if (modeRef.value === 'classic') moves.value--
      await activateBombPair([posOf(a), posOf(b)])
      await resolveCascades()
      await afterTurnChecks()
      return true
    }

    // —— 普通交换：必须形成匹配 ——
    const prefer = [{ r: r2, c: c2 }, { r: r1, c: c1 }]
    const groups = findMatchGroups(grid, prefer)
    if (!groups.length) {
      // 无效交换：换回去 + 抖动提示
      swapCells(grid, r1, c1, r2, c2)
      a.shake = true
      b.shake = true
      playSound('fail')
      await wait(340)
      a.shake = false
      b.shake = false
      state.value = 'idle'
      resetIdleTimer()
      return false
    }

    if (modeRef.value === 'classic') moves.value--
    await resolveCascades(prefer)
    await afterTurnChecks()
    return true
  }

  async function afterTurnChecks() {
    // 死局检测 → 自动洗牌
    if (!findPossibleMove(grid)) {
      toast('没有可以消除的组合啦，天天帮你重新洗牌～')
      reshuffleTypes(grid)
      await wait(450)
    }
    if (modeRef.value === 'classic') {
      if (score.value >= target.value) {
        state.value = 'clear'
        playSound('clear')
      } else if (moves.value <= 0) {
        state.value = 'over'
        playSound('over')
      } else {
        state.value = 'idle'
      }
    } else {
      if (state.value !== 'over') state.value = 'idle' // 限时模式由计时器判定结束
    }
    resetIdleTimer()
  }

  // ---------- 点选交互 ----------
  function tileAt(r, c) {
    return grid[r]?.[c] || null
  }

  function findSelectedPos() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (grid[r][c] && grid[r][c].id === selectedId.value) return { r, c }
      }
    }
    return null
  }

  function tapCell(r, c) {
    if (state.value !== 'idle') return
    resetIdleTimer()
    const t = tileAt(r, c)
    if (!t) return
    if (selectedId.value == null) {
      selectedId.value = t.id
      playSound('tap')
      return
    }
    if (selectedId.value === t.id) {
      selectedId.value = null
      return
    }
    const p = findSelectedPos()
    if (p && Math.abs(p.r - r) + Math.abs(p.c - c) === 1) {
      trySwap(p.r, p.c, r, c)
    } else {
      selectedId.value = t.id
      playSound('tap')
    }
  }

  // 用 reactive 包装 API：模板与子组件访问 game.state / game.score
  // 等属性时自动解包 ref，无需 .value
  return reactive({
    // 状态
    grid,
    tiles,
    score,
    moves,
    level,
    target,
    stars,
    timeLeft,
    best,
    state,
    selectedId,
    hint,
    popups,
    comboNow,
    isClassic,
    // 动作
    start,
    restart,
    nextLevel,
    destroy,
    tapCell,
    trySwap,
    onInteract,
    showHint
  })
}
