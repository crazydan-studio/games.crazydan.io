// 生成一个测试用表情包 zip（模拟用户从手机传回的部署包）
// 用法：在仓库根目录下执行 node scripts/make-test-pack.mjs [输出路径]
import JSZip from 'jszip'
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] || join(REPO_ROOT, '.tmp', 'test-pack.zip')
const zip = new JSZip()

// 复用示例表情（SVG），模拟一个 3 张图的表情包
const faces = ['face-01.svg', 'face-04.svg', 'face-06.svg']
const items = faces.map((f, i) => {
  const file = `images/test-${String(i + 1).padStart(2, '0')}.svg`
  zip.file(file, readFileSync(join(REPO_ROOT, 'public/tiantian-xiaoxiaole/expressions/images', f)))
  return { file, name: `测试包表情${i + 1}` }
})

zip.file(
  'manifest.json',
  JSON.stringify(
    {
      app: 'tiantian-match',
      name: '测试表情包',
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      slots: [items[0].file, null, items[1].file, null, null, items[2].file]
    },
    null,
    2
  )
)

const buf = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync(out, buf)
console.log(`测试表情包已生成: ${out} (${buf.length} bytes, ${items.length} 张表情)`)
