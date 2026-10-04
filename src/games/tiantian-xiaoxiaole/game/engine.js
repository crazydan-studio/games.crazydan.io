// ============ 消消乐核心引擎（纯逻辑，无 DOM 依赖） ============
// 棋盘：默认 8×8（可配置为 6×8 / 6×6 等，行列数直接从 grid 读取），元素类型 0~5（对应 6 个表情槽位）
// tile 结构：{ id, type, kind, x, y, removing, shake, born, blasted, rainbowBlast }
//   - x/y 仅用于渲染定位（列/行），逻辑判断一律以 grid 下标为准
//   - kind: 'normal' | 'bomb' | 'rainbow'
//     · bomb（炸弹猫）：保留原 type，照常参与普通匹配；被消除时引爆 3×3（可连锁）
//     · rainbow（彩虹猫）：type 恒为 -1，不参与匹配；与任意相邻块交换即触发
//       「清除全场同款」；两枚彩虹猫交换 → 清空全场
//
// 特殊块诞生规则：
//   · 单线正好 4 连            → 炸弹猫（在玩家落子位 / 线中点诞生）
//   · 单线 ≥5 连 或 L/T 交叉 ≥5 → 彩虹猫（在交叉点 / 线中点诞生）
//
// 计分规则（纯函数，供状态机 useGame.js 调用）：
//   · 连消（连锁）从第 2 波起，每波在「基础分 × 波次」乘数之外额外给予奖励分，
//     波数越多、本波基础分越高，奖励分越高（见文件末尾 comboBonusOf）
//   · 特殊块按稀有度与威力分三档奖励：炸弹猫（60 + 15×波及格）< 彩虹猫（40×清除格）
//     < 双彩虹（50×清除格），见文件末尾 bombBonusOf / rainbowBonusOf

export const BOARD_SIZE = 8 // 默认棋盘尺寸（引擎函数自身从 grid 读取行列数）
export const ELEMENT_COUNT = 6

let tileSeq = 0

export function makeTile(type, kind = 'normal') {
  tileSeq += 1
  return {
    id: tileSeq,
    type,
    kind,
    x: 0,
    y: 0,
    removing: false,
    shake: false,
    born: false,
    blasted: false,
    rainbowBlast: false
  }
}

export function randType() {
  return Math.floor(Math.random() * ELEMENT_COUNT)
}

// 格子的唯一键（列数参与编码，兼容非方阵棋盘）
const cellKey = (r, c, cols) => r * cols + c

// 棋盘行列数（约定：所有格子均为同尺寸二维数组）
const dims = (grid) => ({ rows: grid.length, cols: grid[0].length })

function createsImmediateMatch(grid, r, c, type) {
  if (c >= 2 && grid[r][c - 1] && grid[r][c - 2] && grid[r][c - 1].type === type && grid[r][c - 2].type === type) {
    return true
  }
  if (r >= 2 && grid[r - 1][c] && grid[r - 2][c] && grid[r - 1][c].type === type && grid[r - 2][c].type === type) {
    return true
  }
  return false
}

// 生成一张无初始匹配、且至少存在一步可行交换的棋盘
export function createBoard(rows = BOARD_SIZE, cols = BOARD_SIZE) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let type = randType()
        let guard = 0
        while (guard < 40 && createsImmediateMatch(grid, r, c, type)) {
          type = randType()
          guard++
        }
        grid[r][c] = makeTile(type)
      }
    }
    if (findPossibleMove(grid)) return grid
  }
  // 兜底：极小概率事件
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => makeTile((r + c) % ELEMENT_COUNT))
  )
}

// ---------- 匹配扫描 ----------

// 扫描所有 ≥3 的同类型连续线段（水平 + 垂直）
// 彩虹猫（type = -1）不参与任何匹配
function scanRuns(grid) {
  const runs = []
  const { rows, cols } = dims(grid)

  // 水平方向
  for (let r = 0; r < rows; r++) {
    let start = 0
    for (let c = 1; c <= cols; c++) {
      const prev = grid[r][c - 1]
      const cur = c < cols ? grid[r][c] : null
      const broken = !prev || prev.type < 0 || !cur || cur.type < 0 || cur.type !== prev.type
      if (broken) {
        if (prev && prev.type >= 0 && c - start >= 3) {
          const cells = []
          for (let k = start; k < c; k++) cells.push({ r, c: k })
          runs.push({ cells, type: prev.type, dir: 'h', length: c - start })
        }
        start = c
      }
    }
  }

  // 垂直方向
  for (let c = 0; c < cols; c++) {
    let start = 0
    for (let r = 1; r <= rows; r++) {
      const prev = grid[r - 1][c]
      const cur = r < rows ? grid[r][c] : null
      const broken = !prev || prev.type < 0 || !cur || cur.type < 0 || cur.type !== prev.type
      if (broken) {
        if (prev && prev.type >= 0 && r - start >= 3) {
          const cells = []
          for (let k = start; k < r; k++) cells.push({ r: k, c })
          runs.push({ cells, type: prev.type, dir: 'v', length: r - start })
        }
        start = r
      }
    }
  }

  return runs
}

// 扫描匹配簇：把共享格子的同类型线段合并为簇（处理 L 形 / T 形交叉）
// preferCells: 优先作为特殊块出生点的格子（玩家落子位），按顺序尝试
// 返回 group: { cells, type, dir, length, special, spawn }
//   special: null | 'bomb' | 'rainbow'
export function findMatchGroups(grid, preferCells) {
  const runs = scanRuns(grid)
  if (!runs.length) return []
  const { cols } = dims(grid)

  const used = runs.map(() => false)
  const groups = []

  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue
    used[i] = true
    const type = runs[i].type
    const cellMap = new Map()
    const runList = [runs[i]]
    for (const cell of runs[i].cells) cellMap.set(cellKey(cell.r, cell.c, cols), cell)

    // 反复合并共享格子的同类型线段
    let grew = true
    while (grew) {
      grew = false
      for (let j = 0; j < runs.length; j++) {
        if (used[j] || runs[j].type !== type) continue
        if (runs[j].cells.some((cell) => cellMap.has(cellKey(cell.r, cell.c, cols)))) {
          used[j] = true
          runList.push(runs[j])
          for (const cell of runs[j].cells) cellMap.set(cellKey(cell.r, cell.c, cols), cell)
          grew = true
        }
      }
    }

    const cells = [...cellMap.values()]
    const maxLen = runList.reduce((m, run) => Math.max(m, run.length), 0)

    // 特殊块判定：≥5 连或 L/T 交叉 → 彩虹猫；正好 4 连 → 炸弹猫
    let special = null
    if (maxLen >= 5 || cells.length >= 5) special = 'rainbow'
    else if (cells.length === 4) special = 'bomb'

    // 出生点：优先玩家落子位 → L/T 交叉点 → 最长线中点
    let spawn = null
    if (preferCells && preferCells.length) {
      for (const p of preferCells) {
        const k = cellKey(p.r, p.c, cols)
        if (cellMap.has(k)) {
          spawn = cellMap.get(k)
          break
        }
      }
    }
    if (!spawn && special === 'rainbow' && runList.length >= 2) {
      for (const cell of cells) {
        const hits = runList.filter((run) => run.cells.some((x) => x.r === cell.r && x.c === cell.c)).length
        if (hits >= 2) {
          spawn = cell
          break
        }
      }
    }
    if (!spawn) {
      const longest = runList.reduce((a, b) => (b.length > a.length ? b : a))
      spawn = longest.cells[Math.floor(longest.cells.length / 2)]
    }

    groups.push({
      cells,
      type,
      dir: runList.length > 1 ? 'x' : runList[0].dir,
      length: cells.length,
      special,
      spawn
    })
  }

  return groups
}

// ---------- 特殊块连锁展开 ----------

// 从初始待消除格子出发展开连锁：
//   · 炸弹猫被消除 → 引爆 3×3，波及格一并消除（炸弹互相连锁）
//   · 彩虹猫被波及 → 随机清除一种类型（全场）
// skipIds: 本轮刚诞生的特殊块（受保护，不参与连锁）
// silentIds: 只移除、不触发的块 id（已被主动激活的彩虹猫）
// 返回 { cells, triggers }，trigger: { kind, r, c, type, cleared }
export function expandSpecials(grid, initialCells, skipIds = new Set(), silentIds = new Set()) {
  const { rows, cols } = dims(grid)
  const pending = [...initialCells]
  const removal = new Map()
  for (const cell of initialCells) removal.set(cellKey(cell.r, cell.c, cols), cell)
  const fired = new Set()
  const triggers = []

  while (pending.length) {
    const { r, c } = pending.shift()
    const t = grid[r] && grid[r][c]
    if (!t || fired.has(t.id) || silentIds.has(t.id)) continue

    if (t.kind === 'bomb') {
      fired.add(t.id)
      const added = []
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
          const k = cellKey(rr, cc, cols)
          if (removal.has(k)) continue
          const tt = grid[rr][cc]
          if (!tt || skipIds.has(tt.id)) continue
          removal.set(k, { r: rr, c: cc })
          pending.push({ r: rr, c: cc })
          added.push({ r: rr, c: cc })
        }
      }
      triggers.push({ kind: 'bomb', r, c, type: t.type, cleared: added.length })
    } else if (t.kind === 'rainbow') {
      fired.add(t.id)
      // 被波及的彩虹猫：随机挑一种在场类型全部清除
      const counts = new Map()
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          const tt = grid[rr][cc]
          if (tt && tt.type >= 0 && !removal.has(cellKey(rr, cc, cols)) && !skipIds.has(tt.id)) {
            counts.set(tt.type, (counts.get(tt.type) || 0) + 1)
          }
        }
      }
      const types = [...counts.keys()]
      let pick = -1
      let added = 0
      if (types.length) {
        pick = types[Math.floor(Math.random() * types.length)]
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const tt = grid[rr][cc]
            const k = cellKey(rr, cc, cols)
            if (tt && tt.type === pick && !removal.has(k) && !skipIds.has(tt.id)) {
              removal.set(k, { r: rr, c: cc })
              pending.push({ r: rr, c: cc })
              added++
            }
          }
        }
      }
      triggers.push({ kind: 'rainbow', r, c, type: pick, cleared: added })
    }
  }

  return { cells: [...removal.values()], triggers }
}

// ---------- 基础操作 ----------

// 交换两个格子（同步更新渲染坐标 x/y：a 去往 (r2,c2)，b 去往 (r1,c1)）
export function swapCells(grid, r1, c1, r2, c2) {
  const a = grid[r1][c1]
  const b = grid[r2][c2]
  grid[r1][c1] = b
  grid[r2][c2] = a
  if (a) {
    a.x = c2
    a.y = r2
  }
  if (b) {
    b.x = c1
    b.y = r1
  }
}

// 是否存在可行的一步交换（返回第一个找到的可行动）
// 优先级：彩虹猫配任意邻居 → 炸弹对炸弹 → 普通三连
// 仅用于存在性判定（开局生成 / 死局检测 / 洗牌保护）；提示请用 findBestMove（最高分支优先）
export function findPossibleMove(grid) {
  const { rows, cols } = dims(grid)
  const fourDirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0]
  ]
  let bombPair = null
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = grid[r][c]
      if (!t) continue
      if (t.kind === 'rainbow') {
        for (const [dr, dc] of fourDirs) {
          const r2 = r + dr
          const c2 = c + dc
          if (r2 >= 0 && r2 < rows && c2 >= 0 && c2 < cols && grid[r2][c2]) {
            return { r, c, r2, c2 }
          }
        }
      }
      if (t.kind === 'bomb' && !bombPair) {
        const r2 = r
        const c2 = c + 1
        const r3 = r + 1
        if (c2 < cols && grid[r][c2] && grid[r][c2].kind === 'bomb') {
          bombPair = { r, c, r2, c2 }
        } else if (r3 < rows && grid[r3][c] && grid[r3][c].kind === 'bomb') {
          bombPair = { r, c, r2: r3, c2: c }
        }
      }
    }
  }
  if (bombPair) return bombPair

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) continue
      const dirs = [
        [0, 1],
        [1, 0]
      ]
      for (const [dr, dc] of dirs) {
        const r2 = r + dr
        const c2 = c + dc
        if (r2 >= rows || c2 >= cols) continue
        if (!grid[r2][c2]) continue
        swapCells(grid, r, c, r2, c2)
        const hit = findMatchGroups(grid).length > 0
        swapCells(grid, r, c, r2, c2)
        if (hit) return { r, c, r2, c2 }
      }
    }
  }
  return null
}

// 重力下落 + 顶部补充新块
// - 已有方块下落时同步更新其 x/y（触发位移动画）
// - 新方块只写入 grid，渲染坐标交给调用方（先摆到棋盘上方再落入）
// 返回 spawned: [{ tile, r, c }]
export function collapseColumns(grid) {
  const { rows, cols } = dims(grid)
  const spawned = []
  for (let c = 0; c < cols; c++) {
    let write = rows - 1
    for (let r = rows - 1; r >= 0; r--) {
      const t = grid[r][c]
      if (t) {
        if (write !== r) {
          grid[write][c] = t
          grid[r][c] = null
          t.x = c
          t.y = write
        }
        write--
      }
    }
    for (let r = write; r >= 0; r--) {
      const t = makeTile(randType())
      grid[r][c] = t
      spawned.push({ tile: t, r, c })
    }
  }
  return spawned
}

// 洗牌：只重排普通块的 type（特殊块的 kind/type 保持不动），直到存在可行步
export function reshuffleTypes(grid) {
  const { rows, cols } = dims(grid)
  const normals = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] && grid[r][c].kind === 'normal') normals.push(grid[r][c])
    }
  }
  for (let i = 0; i < 60; i++) {
    const types = normals.map((t) => t.type)
    // Fisher-Yates 洗牌
    for (let k = types.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1))
      ;[types[k], types[j]] = [types[j], types[k]]
    }
    normals.forEach((t, k) => {
      t.type = types[k]
    })
    if (findPossibleMove(grid)) return true
  }
  return false
}

// ---------- 连消奖励分 ----------
// 连消（连锁消除）从第 2 波起，每一波在既有「基础分 × 波次」乘数之外额外给予奖励分：
//   奖励 = 固定成长部分 30 ×（波次 − 1） + 本波基础分 × 25% ×（波次 − 1）
// 即连消波数越多、本波消除的基础分越高，奖励分就越高；首波（玩家直接匹配）无奖励。
// 炸弹/彩虹等特殊块的触发分不计入基础分基数（它们各自已享受 × 波次乘数）。
export const COMBO_BONUS_STEP = 30 // 每多一波的固定奖励增量
export const COMBO_BONUS_RATE = 0.25 // 奖励随本波基础分浮动的比例

export function comboBonusOf(rawBase, combo) {
  if (!Number.isFinite(rawBase) || rawBase < 0) return 0
  if (!Number.isFinite(combo) || combo < 2) return 0
  const waves = Math.floor(combo) - 1 // 连消波次（第 2 波起算 1）
  return COMBO_BONUS_STEP * waves + Math.round(rawBase * COMBO_BONUS_RATE * waves)
}

// ---------- 特殊块奖励分（炸弹 / 彩虹分档） ----------
// 炸弹与彩虹猫按稀有度与威力分三档给予不同程度的奖励分（不含连消波次乘数 ×combo，
// 由调用方叠加）：
//   · 炸弹猫（4 连诞生，3×3 局部爆破）：固定登场奖励 + 战果分随波及格数递增
//     奖励 = BOMB_BONUS_BASE + BOMB_BONUS_PER_CELL × 引爆波及格数
//   · 彩虹猫（≥5 连诞生，全场级清除）：稀有度更高，每清除 1 格的单价高于炸弹
//     奖励 = RAINBOW_BONUS_PER_CELL × 清除格数
//   · 双彩虹（两枚彩虹猫交换，清空全场）：爆发上限档
//     奖励 = SUPER_RAINBOW_BONUS_PER_CELL × 清除格数
// 三档单位奖励严格递增：炸弹 15/格 < 彩虹 40/格 < 双彩虹 50/格，
// 威力与稀有度越高，回报越高。
export const BOMB_BONUS_BASE = 60 // 炸弹引爆的固定登场奖励
export const BOMB_BONUS_PER_CELL = 15 // 炸弹每波及 1 格追加的战果奖励
export const RAINBOW_BONUS_PER_CELL = 40 // 彩虹猫每清除 1 格的奖励
export const SUPER_RAINBOW_BONUS_PER_CELL = 50 // 双彩虹每清除 1 格的奖励

// 炸弹猫引爆一次的奖励分（cleared = 3×3 内新波及的格数，可为 0）
export function bombBonusOf(cleared) {
  const n = Number.isFinite(cleared) && cleared > 0 ? Math.floor(cleared) : 0
  return BOMB_BONUS_BASE + BOMB_BONUS_PER_CELL * n
}

// 彩虹猫清除一次的奖励分（cleared = 清除格数；isSuper = 双彩虹清空全场）
export function rainbowBonusOf(cleared, isSuper = false) {
  const n = Number.isFinite(cleared) && cleared > 0 ? Math.floor(cleared) : 0
  return (isSuper ? SUPER_RAINBOW_BONUS_PER_CELL : RAINBOW_BONUS_PER_CELL) * n
}

// ---------- 提示：最高分支优先 ----------
// 把每个可行交换视作一条「分支」，用与实际计分同口径的静态估值为每条分支打分，
// 提示估值最高的一条；随机补充方块带来的后续连锁不可预估，不计入估值。
// 分支含金量（由高到低）：双彩虹 > 彩虹配同款大部队/炸弹 > 炸弹对 >
// 5 连/L/T > 4 连 > 3 连；同估值取扫描顺序靠前的分支（结果确定，便于测试）。
const BOMB_BLAST_AVG = 4 // 估算「被波及引爆的炸弹」的平均战果格数（3×3 扣除已在消除集的格子）

// 被波及的彩虹猫随机清除一种类型：按剩余各类型的平均格数估算期望战果
function averageTypeCount(grid, removedKeys) {
  const { rows, cols } = dims(grid)
  const counts = new Map()
  let total = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = grid[r][c]
      if (!t || t.type < 0 || removedKeys.has(cellKey(r, c, cols))) continue
      counts.set(t.type, (counts.get(t.type) || 0) + 1)
      total++
    }
  }
  return counts.size ? total / counts.size : 0
}

// 单次交换的即时战果估值（只读棋盘，读完即还原，不落子）：
//   · 彩虹猫分支：双彩虹按「全场格数 × 双彩虹单价 + 场上炸弹威力」；
//     彩虹配普通块/炸弹按「该类型在场格数（含彩虹猫自身）× 彩虹单价 + 同款炸弹连环」
//   · 炸弹对炸弹：两枚 3×3 的战果
//   · 普通交换：模拟落子后的匹配簇基础分 + 被波及炸弹/彩虹的威力
//     （本波新诞生的特殊块受保护，不计入）
function estimateSwapValue(grid, r1, c1, r2, c2) {
  const { rows, cols } = dims(grid)
  const a = grid[r1][c1]
  const b = grid[r2][c2]
  if (!a || !b) return 0

  // —— 彩虹猫分支 ——
  if (a.kind === 'rainbow' || b.kind === 'rainbow') {
    if (a.kind === 'rainbow' && b.kind === 'rainbow') {
      // 双彩虹：清空全场，场上炸弹全部随之引爆
      let tiles = 0
      let bombs = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!grid[r][c]) continue
          tiles++
          if (grid[r][c].kind === 'bomb') bombs++
        }
      }
      return rainbowBonusOf(tiles, true) + bombs * bombBonusOf(BOMB_BLAST_AVG)
    }
    // 彩虹猫配普通块/炸弹：清除全场该类型（同款炸弹会连环引爆）
    const targetType = (a.kind === 'rainbow' ? b : a).type
    let cnt = 0
    let bombs = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = grid[r][c]
        if (!t || t.type !== targetType || t.kind === 'rainbow') continue
        cnt++
        if (t.kind === 'bomb') bombs++
      }
    }
    return rainbowBonusOf(cnt + 1) + bombs * bombBonusOf(BOMB_BLAST_AVG)
  }

  // —— 炸弹对炸弹：双双引爆 ——
  if (a.kind === 'bomb' && b.kind === 'bomb') {
    return 2 * bombBonusOf(BOMB_BLAST_AVG)
  }

  // —— 普通交换：模拟落子找匹配簇，读完即还原 ——
  swapCells(grid, r1, c1, r2, c2)
  let value = 0
  const groups = findMatchGroups(grid)
  if (groups.length) {
    const baseCells = []
    const skipIds = new Set()
    for (const g of groups) {
      value += g.length * 10 + (g.length - 3) * 20
      if (g.special) {
        const t = grid[g.spawn.r][g.spawn.c]
        if (t) skipIds.add(t.id)
        for (const cell of g.cells) {
          if (cell.r === g.spawn.r && cell.c === g.spawn.c) continue
          baseCells.push(cell)
        }
      } else {
        baseCells.push(...g.cells)
      }
    }
    // 被波及的炸弹/彩虹猫威力（同口径三档奖励分估算）
    const removedKeys = new Set(baseCells.map((x) => cellKey(x.r, x.c, cols)))
    const avgType = averageTypeCount(grid, removedKeys)
    for (const cell of baseCells) {
      const t = grid[cell.r][cell.c]
      if (!t || skipIds.has(t.id)) continue
      if (t.kind === 'bomb') value += bombBonusOf(BOMB_BLAST_AVG)
      else if (t.kind === 'rainbow') value += rainbowBonusOf(avgType)
    }
  }
  swapCells(grid, r1, c1, r2, c2)
  return value
}

// 最高分支优先：枚举全部相邻交换，返回即时战果估值最高的一条（供提示使用）；
// 无可行步返回 null。估值口径与实际计分一致（见 estimateSwapValue），
// 因此「最高分支」= 即时战果期望最大的一步。
export function findBestMove(grid) {
  const { rows, cols } = dims(grid)
  let best = null
  let bestValue = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0]
      ]) {
        const r2 = r + dr
        const c2 = c + dc
        if (r2 >= rows || c2 >= cols) continue
        const v = estimateSwapValue(grid, r, c, r2, c2)
        if (v > bestValue) {
          bestValue = v
          best = { r, c, r2, c2 }
        }
      }
    }
  }
  return best
}
