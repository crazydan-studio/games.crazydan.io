// ============ 生成 PWA 图标的 HTML 画布 ============
// 复用 src/utils/catface.js 的「开心天天」表情作为图标主体
// 之后由 agent-browser 以精确视口截图导出 PNG
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { catFaceSvg } from '../src/utils/catface.js'

// 路径相对本脚本定位，任意工作目录下运行均有效
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(SCRIPT_DIR, '..', 'public', 'icons')

const SPARK = 'M12 2 L14 9.5 21.5 12 14 14.5 12 22 10 14.5 2.5 12 10 9.5 Z'

const ICONS = [
  { size: 192, catPct: 76, name: 'icon-192' },
  { size: 512, catPct: 76, name: 'icon-512' },
  // maskable：满幅背景 + 更小的猫（留出系统圆形遮罩安全区）
  { size: 512, catPct: 56, name: 'icon-maskable-512' }
]

mkdirSync(OUT_DIR, { recursive: true })

for (const cfg of ICONS) {
  const s = cfg.size
  const cat = Math.round((s * cfg.catPct) / 100)
  const sparkBig = Math.round(s * 0.14)
  const sparkSmall = Math.round(s * 0.09)
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: ${s}px; height: ${s}px; overflow: hidden; }
  .icon {
    position: relative;
    width: ${s}px;
    height: ${s}px;
    background: linear-gradient(150deg, #ffc46b 0%, #ffb347 42%, #f07e1d 100%);
  }
  .icon::after {
    content: '';
    position: absolute;
    left: 0; top: 0; right: 0;
    height: 45%;
    background: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.36), transparent 72%);
  }
  .cat {
    position: absolute;
    left: 50%; top: 50%;
    width: ${cat}px; height: ${cat}px;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 ${Math.round(s * 0.018)}px ${Math.round(s * 0.03)}px rgba(93,64,55,0.38));
  }
  .cat svg { width: 100%; height: 100%; display: block; }
  svg.spark { position: absolute; fill: #fff6e3; opacity: 0.95; }
</style>
</head>
<body>
  <div class="icon">
    <svg class="spark" style="right:${Math.round(s * 0.07)}px; top:${Math.round(s * 0.06)}px;"
         width="${sparkBig}" height="${sparkBig}" viewBox="0 0 24 24"><path d="${SPARK}"/></svg>
    <svg class="spark" style="left:${Math.round(s * 0.06)}px; bottom:${Math.round(s * 0.07)}px;"
         width="${sparkSmall}" height="${sparkSmall}" viewBox="0 0 24 24"><path d="${SPARK}"/></svg>
    <div class="cat">${catFaceSvg(0)}</div>
  </div>
</body>
</html>`
  writeFileSync(`${SCRIPT_DIR}/.icon-${cfg.name}.html`, html)
}

console.log('icon canvases written:', ICONS.map((i) => i.name).join(', '))
