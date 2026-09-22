// ============ 生成示例表情包静态资源（public/tiantian-xiaoxiaole/expressions/） ============
// 与游戏模块的 CatFace.vue 共用 catface.js —— 单一数据源。
// 运行：node scripts/gen-sample-pack.mjs（或 pnpm gen:pack）
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { catFaceSvg, FACE_NAMES } from '../src/games/tiantian-xiaoxiaole/utils/catface.js'

// 路径相对本脚本定位，任意工作目录下运行均有效
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tiantian-xiaoxiaole', 'expressions')

mkdirSync(join(OUT_DIR, 'images'), { recursive: true })

const items = []
FACE_NAMES.forEach((name, i) => {
  const file = `images/face-${String(i + 1).padStart(2, '0')}.svg`
  writeFileSync(join(OUT_DIR, file), catFaceSvg(i))
  items.push({ file, name: `天天·${name}` })
})

const manifest = {
  app: 'tiantian-match',
  name: '天天表情包（示例）',
  version: 1,
  exportedAt: new Date().toISOString(),
  items,
  slots: items.map((it) => it.file)
}

writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(OUT_DIR, 'README.txt'),
  `这是「天天消消乐」的示例表情包目录（6 款手绘天天表情）。

部署方式：
  把整个 expressions/ 目录上传到任意静态服务器根目录，
  在游戏「表情管理 → 从服务器导入」中填入：
  https://你的域名/expressions/manifest.json

你也可以用游戏导出的真实表情包（天天照片）替换这个目录：
  expressions/manifest.json  —— 清单与槽位映射
  expressions/images/        —— 表情图片
`
)

console.log(`示例表情包已生成：${items.length} 款表情 → public/expressions/`)
