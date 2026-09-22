// ============ 表情包：ZIP 打包导出 / 导入 / 从服务器静态资源加载 ============
// 部署契约（与 public/expressions 示例包一致）：
//   expressions/
//   ├── manifest.json   { app, name, version, exportedAt, items:[{file,name}], slots:[file|null x6] }
//   └── images/xxx.png|svg|jpg|webp
import JSZip from 'jszip'

const PACK_README = `天天消消乐 · 表情包
====================

本压缩包由「天天消消乐」导出，包含：
  manifest.json —— 表情清单与元素槽位映射
  images/       —— 表情图片

线下部署方式：
  1. 解压本压缩包，把整个 expressions/ 文件夹上传到任意静态服务器，
     例如 Nginx / OSS / CDN / GitHub Pages，保证以下地址可访问：
     https://你的域名/expressions/manifest.json
  2. 打开游戏 → 表情管理 → 从服务器导入 → 填入上面的地址
  3. 其他设备即可加载同一套「天天」表情，秒变游戏元素。
`

function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

function extOf(blob) {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/jpeg') return 'jpg'
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/svg+xml') return 'svg'
  if (blob.type === 'image/gif') return 'gif'
  return 'img'
}

// 导出当前全部表情库 + 槽位映射为 zip（下载到本机/手机）
export async function exportPack(exprs, slotIds) {
  const zip = new JSZip()
  const items = []
  const used = new Set()
  for (const e of exprs) {
    let file = `images/tiantian-${String(items.length + 1).padStart(3, '0')}.${extOf(e.blob)}`
    while (used.has(file)) {
      file = file.replace(/(\.\w+)$/, `-${Math.random().toString(36).slice(2, 6)}$1`)
    }
    used.add(file)
    zip.file(file, e.blob)
    items.push({ file, name: e.name })
  }
  const manifest = {
    app: 'tiantian-match',
    name: '天天表情包',
    version: 1,
    exportedAt: new Date().toISOString(),
    slots: slotIds.map((id) => {
      const i = exprs.findIndex((e) => e.id === id)
      return i >= 0 ? items[i].file : null
    }),
    items
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('README.txt', PACK_README)
  const blob = await zip.generateAsync({ type: 'blob' })
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  downloadBlob(blob, `天天表情包-${stamp}.zip`)
}

// 从本地 zip 文件导入（用户在手机上打包后传回，或其他人分享的表情包）
export async function loadPackZip(file) {
  const zip = await JSZip.loadAsync(file)
  const mFile = zip.file('manifest.json')
  if (!mFile) throw new Error('压缩包里没有找到 manifest.json（请选择游戏导出的表情包）')
  const manifest = JSON.parse(await mFile.async('string'))
  const items = []
  for (const it of manifest.items || []) {
    const entry = zip.file(it.file)
    if (!entry) continue
    items.push({ file: it.file, name: it.name, blob: await entry.async('blob') })
  }
  return { manifest, items }
}

// 从服务器静态资源加载（线下部署场景）
// inputUrl 可以是 manifest.json 完整地址、expressions/ 目录地址，
// 也可以是相对路径（基于当前页面解析）或裸域名（自动补 https://）
export async function loadPackFromUrl(inputUrl) {
  let url = String(inputUrl || '').trim()
  if (!url) throw new Error('请输入表情包地址')
  if (!/^https?:\/\//i.test(url)) {
    if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/i.test(url) && !url.startsWith('/')) {
      // 看起来是裸域名：example.com/expressions/manifest.json
      url = `https://${url}`
    } else {
      // 相对路径：基于当前页面解析（./expressions/... / /expressions/... 等）
      url = new URL(url, window.location.href).toString()
    }
  }
  if (!/manifest\.json(\?|$)/.test(url)) url = url.replace(/\/+$/, '') + '/manifest.json'

  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载失败：HTTP ${res.status}`)
  const manifest = await res.json()
  if (!Array.isArray(manifest.items)) throw new Error('manifest.json 格式不正确（缺少 items）')

  const items = []
  for (const it of manifest.items) {
    try {
      const imgRes = await fetch(new URL(it.file, url).toString())
      if (!imgRes.ok) continue
      items.push({ file: it.file, name: it.name, blob: await imgRes.blob() })
    } catch {
      /* 单张失败跳过 */
    }
  }
  return { manifest, items }
}
