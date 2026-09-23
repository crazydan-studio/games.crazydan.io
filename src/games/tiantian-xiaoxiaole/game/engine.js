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

// 是否存在可行的一步交换（返回第一个找到的可行动，可用于提示）
// 优先级：彩虹猫配任意邻居 → 炸弹对炸弹 → 普通三连
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
