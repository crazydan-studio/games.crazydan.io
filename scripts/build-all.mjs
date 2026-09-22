#!/usr/bin/env node
// ============ 统一构建：主模块（门户）+ 所有游戏子模块 ============
// 构建顺序约定：先构建门户（vite build 会清空根 dist/），再构建各游戏子模块
// （各自输出追加到 dist/games/<name>/），最终 dist/ 即一份可整体静态部署的站点：
//   dist/index.html                 门户入口（各游戏入口列表）
//   dist/games/<name>/index.html    各游戏入口
//
// 用法：
//   node scripts/build-all.mjs               # 门户 + 全部游戏
//   node scripts/build-all.mjs --games-only  # 仅全部游戏
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const gamesOnly = process.argv.includes('--games-only')
const isWindows = process.platform === 'win32'

function run(label, cwdDir, args) {
  console.log(`\n[build] ${label}`)
  const res = spawnSync('pnpm', args, { stdio: 'inherit', cwd: cwdDir, shell: isWindows })
  if (res.status !== 0) {
    console.error(`[build] 失败：${label}（退出码 ${res.status}）`)
    process.exit(res.status ?? 1)
  }
}

// 自动发现 games/ 下的子模块（含 package.json 的目录）
const gameDirs = existsSync(join(root, 'games'))
  ? readdirSync(join(root, 'games')).filter((d) =>
      existsSync(join(root, 'games', d, 'package.json'))
    )
  : []

if (!gamesOnly) {
  run('主模块（门户）', root, ['run', 'build:portal'])
}
for (const game of gameDirs) {
  run(`游戏子模块：${game}`, join(root, 'games', game), ['run', 'build'])
}

console.log('\n[build] 全部构建完成，静态产物位于 dist/：')
console.log('  dist/index.html                          门户入口')
for (const game of gameDirs) {
  console.log(`  dist/games/${game}/index.html            ${game}`)
}
console.log('\n将 dist/ 目录整体上传至任意静态服务器（nginx / OSS / Pages 等）即可完成部署。')
