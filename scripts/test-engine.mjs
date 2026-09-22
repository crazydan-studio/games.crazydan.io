// ============ 引擎单元测试（Node 直接运行，无浏览器依赖） ============
// 覆盖：特殊块判定（4连炸弹/5连彩虹/L形交叉）、连锁展开、可行步、洗牌保护
import assert from 'node:assert'
import {
  BOARD_SIZE,
  makeTile,
  findMatchGroups,
  expandSpecials,
  findPossibleMove,
  reshuffleTypes,
  swapCells
} from '../src/games/tiantian-xiaoxiaole/game/engine.js'

let passed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`)
    process.exit(1)
  }
  passed++
  console.log(`✓ ${msg}`)
}

// 构建棋盘：types 矩阵（null → 空格）
function buildGrid(types) {
  const grid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const t = types[r] && types[r][c]
      if (t != null) {
        const tile = makeTile(Array.isArray(t) ? t[0] : t)
        if (Array.isArray(t)) tile.kind = t[1]
        grid[r][c] = tile
      }
    }
  }
  return grid
}

// ---------- 1. 3 连 → 普通组 ----------
{
  const types = Array.from({ length: 8 }, () => Array(8).fill(0).map(() => 9)) // 9 = 占位（不存在的类型也行，引擎只看相等）
  // 用 0..7 混排避免意外匹配：棋盘默认 type=9 全部相同会形成超大组，这里只需要单行
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r * 8 + c) % 6))
  // 行 0：0,0,0,x,... → 3 连
  rows[0][0] = 5
  rows[0][1] = 5
  rows[0][2] = 5
  // 防止行其他位置同类型相邻成 4（5 在 0..7 的 (0*8+?)%6：c=5 → 5！改掉）
  rows[0][5] = 0
  // 防止列方向 5 连：列 0 原值 (r*8+0)%6 = 2,2,2... 检查 r0..r2 = 2,2,2 且 rows[0][0] 已改 5 → 列 0 顶部是 5,2,2 无匹配 ✓
  const g = buildGrid(rows)
  const groups = findMatchGroups(g)
  const three = groups.find((x) => x.type === 5)
  ok(three && three.special === null && three.cells.length === 3, '3 连 → 普通组（无特殊块）')
}

// ---------- 2. 4 连 → 炸弹猫 ----------
{
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r * 8 + c) % 6))
  // 行 3：c1..c4 = 2,2,2,2 → 4 连
  rows[3][1] = 2
  rows[3][2] = 2
  rows[3][3] = 2
  rows[3][4] = 2
  // 原本 rows[3]: (24+c)%6 = 0,1,2,3,4,5,0,1 → c1=1→2, c2=2(已2), c3=3→2, c4=4→2
  // 列方向检查：列 1 值 (r*8+1)%6: r0=1,r1=3,r2=5,r3=2,r4=1,... 无 3 连 ✓ 列 2: (r*8+2)%6=2,4,0,2,4,0 r2=0? 算：r2→18%6=0, r3=20%6=2 ✓ 无连续3
  const g = buildGrid(rows)
  const groups = findMatchGroups(g)
  const four = groups.find((x) => x.type === 2)
  ok(four && four.special === 'bomb' && four.cells.length === 4, '4 连 → 诞生炸弹猫（special=bomb）')
  ok(four.spawn && four.cells.some((c) => c.r === four.spawn.r && c.c === four.spawn.c), '炸弹出生点在簇内')
}

// ---------- 3. 5 连 → 彩虹猫 ----------
{
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r * 8 + c) % 6))
  rows[5][0] = 1 // 原值 (40)%6=4 会拼成 6 连，改掉保证正好 5 连
  rows[5][6] = 0 // c6 原值 (46)%6=4 同样要避开
  rows[5][1] = 4
  rows[5][2] = 4
  rows[5][3] = 4
  rows[5][4] = 4
  rows[5][5] = 4
  const g = buildGrid(rows)
  const groups = findMatchGroups(g)
  const five = groups.find((x) => x.type === 4)
  ok(five && five.special === 'rainbow' && five.cells.length === 5, '5 连 → 诞生彩虹猫（special=rainbow）')
}

// ---------- 4. L 形交叉 → 彩虹猫（出生点在交叉） ----------
{
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r * 8 + c) % 6))
  // L 形：行 2 c2..c4 = 1；列 4 r3..r4 = 1 → 交叉在 (2,4)，共 5 格
  rows[2][2] = 1
  rows[2][3] = 1
  rows[2][4] = 1
  rows[3][4] = 1
  rows[4][4] = 1
  const g = buildGrid(rows)
  const groups = findMatchGroups(g)
  const lt = groups.find((x) => x.type === 1)
  ok(lt && lt.special === 'rainbow' && lt.cells.length === 5, 'L 形交叉 5 格 → 彩虹猫')
  ok(lt.spawn.r === 2 && lt.spawn.c === 4, 'L 形彩虹出生点在交叉格')
}

// ---------- 5. 彩虹猫（type=-1）不参与匹配 ----------
{
  const g = buildGrid([
    [0, 0, 0, 0, 0, 0, 0, 0],
    [-1, -1, -1, -1, -1, -1, -1, -1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3, 3, 3, 3],
    [4, 4, 4, 4, 4, 4, 4, 4],
    [5, 5, 5, 5, 5, 5, 5, 5],
    [0, 1, 2, 3, 4, 5, 0, 1]
  ])
  // 行 1 全是彩虹（type -1）→ 不成组；行 0 是 8 连 type0（会成 rainbow 组）
  const groups = findMatchGroups(g)
  ok(!groups.some((x) => x.type === -1), '彩虹猫（type=-1）不参与类型匹配')
  const big = groups.find((x) => x.type === 0)
  ok(big && big.length === 8 && big.special === 'rainbow', '8 连 → 彩虹猫')
}

// ---------- 6. 炸弹连锁展开：3×3 ----------
{
  const g = buildGrid([
    [0, 1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [4, [0, 'bomb'], 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [4, 5, 0, 1, 2, 3, 4, 5],
    [0, 1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [4, 5, 0, 1, 2, 3, 4, 5]
  ])
  // 炸弹在 (2,1)，初始消除格 = 炸弹自身
  const { cells, triggers } = expandSpecials(g, [{ r: 2, c: 1 }])
  ok(triggers.length === 1 && triggers[0].kind === 'bomb', '炸弹触发记录')
  const keys = new Set(cells.map((c) => c.r * 8 + c.c))
  let all9 = true
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!keys.has((2 + dr) * 8 + (1 + dc))) all9 = false
    }
  }
  ok(all9 && cells.length === 9, '炸弹引爆 3×3（9 格）')
}

// ---------- 7. 双炸弹连锁（相邻才能互相波及） ----------
{
  const g = buildGrid([
    [0, 1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [4, [0, 'bomb'], [2, 'bomb'], 5, 0, 1, 2, 3],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [4, 5, 0, 1, 2, 3, 4, 5],
    [0, 1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [4, 5, 0, 1, 2, 3, 4, 5]
  ])
  const { triggers } = expandSpecials(g, [{ r: 2, c: 1 }])
  ok(triggers.filter((t) => t.kind === 'bomb').length === 2, '爆炸波及相邻炸弹 → 双连锁')
}

// ---------- 8. 被波及的彩虹猫 → 清一种类型（唯一类型时确定） ----------
{
  const g = buildGrid([
    [0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, [-1, 'rainbow'], 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0]
  ])
  // 初始消除格含彩虹 (2,2)：类型只有 0/1，随机清其中一种（非 0 即 1，数量固定）
  const { cells, triggers } = expandSpecials(g, [{ r: 2, c: 2 }])
  const rb = triggers.find((t) => t.kind === 'rainbow')
  ok(rb && (rb.type === 0 || rb.type === 1), '被波及的彩虹猫随机清一种类型')
  // 全场该类型数（不含已在消除集合中的）：type0 = 32-1? 盘面 0 与 1 各 32，彩虹占 1 格 → 0 有 31? 具体：r2c2 原为 1（(2+2)%2=0）→ type0 32 格含彩虹位 → 彩虹替代 → 0:31,1:32
  // 初始 cells = 彩虹格；若随机选中 0 → +31；选中 1 → +32（其中 (2,2) 已在集合）
  const typeCounts = { 0: 0, 1: 0 }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r][c] && g[r][c].type >= 0) typeCounts[g[r][c].type]++
  ok(cells.length === 1 + (rb.type === 0 ? typeCounts[0] : typeCounts[1]), '彩虹随机清除数量正确（全场该类型）')
}

// ---------- 9. findPossibleMove：彩虹在场必有解 ----------
{
  const g = buildGrid([
    [0, 1, 2, 3, 4, 5, 0, 1],
    [1, 2, 3, 4, 5, 0, 1, 2],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [3, 4, 5, 0, 1, 2, 3, 4],
    [4, 5, 0, 1, 2, 3, 4, 5],
    [5, 0, 1, 2, 3, 4, 5, 0],
    [0, 1, 2, [-1, 'rainbow'], 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3]
  ])
  const mv = findPossibleMove(g)
  ok(mv && ((mv.r === 6 && mv.c === 3) || (mv.r2 === 6 && mv.c2 === 3)), '彩虹猫在场 → 可行步指向彩虹配邻居')
}

// ---------- 10. 洗牌保护特殊块 ----------
{
  const g = buildGrid([
    [0, 1, 2, 3, 4, 5, 0, 1],
    [1, 2, 3, 4, 5, 0, 1, 2],
    [2, 3, 4, [5, 'bomb'], 0, 1, 2, 3],
    [3, 4, 5, 0, 1, 2, 3, 4],
    [4, 5, 0, 1, [-1, 'rainbow'], 4, 5, 0],
    [5, 0, 1, 2, 3, 4, 5, 0],
    [0, 1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3]
  ])
  reshuffleTypes(g)
  ok(g[2][3].kind === 'bomb' && g[2][3].type === 5, '洗牌后炸弹猫保持 kind/type 不变')
  ok(g[4][4].kind === 'rainbow' && g[4][4].type === -1, '洗牌后彩虹猫保持不变（type=-1）')
  // 普通块类型仍在合法范围
  let legal = true
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const t = g[r][c]
      if (t && t.kind === 'normal' && (t.type < 0 || t.type > 5)) legal = false
    }
  }
  ok(legal, '洗牌后普通块类型合法（0~5）')
}

// ---------- 11. preferCells：特殊块出生在玩家落子位 ----------
{
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r * 8 + c) % 6))
  rows[1][1] = 3
  rows[1][2] = 3
  rows[1][3] = 3
  rows[1][4] = 3
  const g = buildGrid(rows)
  const groups = findMatchGroups(g, [{ r: 1, c: 4 }])
  const four = groups.find((x) => x.type === 3)
  ok(four && four.special === 'bomb' && four.spawn.c === 4, '炸弹出生点跟随玩家落子位（preferCells）')
}

// ---------- 12. 交换后判定：swapCells 同步渲染坐标 ----------
{
  const g = buildGrid([
    [0, 1, 2, 3, 4, 5, 0, 1],
    [1, 2, 3, 4, 5, 0, 1, 2],
    [2, 3, 4, 5, 0, 1, 2, 3],
    [3, 4, 5, 0, 1, 2, 3, 4],
    [4, 5, 0, 1, 2, 3, 4, 5],
    [5, 0, 1, 2, 3, 4, 5, 0],
    [0, 1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2, 3]
  ])
  swapCells(g, 0, 0, 1, 0)
  ok(g[0][0].x === 0 && g[0][0].y === 0 && g[1][0].x === 0 && g[1][0].y === 1, 'swapCells 同步 x/y 渲染坐标')
}

console.log(`\n全部 ${passed} 项引擎测试通过 ✅`)
