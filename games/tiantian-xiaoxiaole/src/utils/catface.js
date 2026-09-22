// ============ 默认猫咪表情（「天天」的 6 款手绘 SVG 表情） ============
// 同一份代码既被 CatFace.vue 渲染，也被 scripts/gen-sample-pack.mjs
// 生成示例表情包静态资源 —— 单一数据源。
const FUR = '#FFC98F'
const FUR_DARK = '#E89B54'
const LINE = '#5D4037'
const BLUSH = '#FFB3C1'
const NOSE = '#FF8FA3'
const STRIPE = '#F0A05A'
const INNER_EAR = '#FFDFC4'

function svgWrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${inner}</svg>`
}

function base() {
  return (
    `<path d="M27 46 L34 13 L59 31 Z" fill="${FUR}" stroke="${FUR_DARK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M93 46 L86 13 L61 31 Z" fill="${FUR}" stroke="${FUR_DARK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M34 39 L38 22 L49 30 Z" fill="${INNER_EAR}"/>` +
    `<path d="M86 39 L82 22 L71 30 Z" fill="${INNER_EAR}"/>` +
    `<circle cx="60" cy="68" r="42" fill="${FUR}" stroke="${FUR_DARK}" stroke-width="4"/>` +
    `<path d="M48 42 q3 -5 6 0 M57 38 q3 -5 6 0 M66 42 q3 -5 6 0" fill="none" stroke="${STRIPE}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<ellipse cx="32" cy="78" rx="7" ry="4.5" fill="${BLUSH}" opacity="0.75"/>` +
    `<ellipse cx="88" cy="78" rx="7" ry="4.5" fill="${BLUSH}" opacity="0.75"/>` +
    `<path d="M22 70 h-10 M24 78 l-10 4 M98 70 h10 M96 78 l10 4" stroke="#D89B66" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M56 73 L64 73 L60 79 Z" fill="${NOSE}"/>`
  )
}

const eyes = {
  happy: `<circle cx="44" cy="66" r="6" fill="${LINE}"/><circle cx="76" cy="66" r="6" fill="${LINE}"/><circle cx="46" cy="63.5" r="2" fill="#fff"/><circle cx="78" cy="63.5" r="2" fill="#fff"/>`,
  surprised: `<circle cx="44" cy="66" r="9" fill="#fff" stroke="${LINE}" stroke-width="3"/><circle cx="76" cy="66" r="9" fill="#fff" stroke="${LINE}" stroke-width="3"/><circle cx="44" cy="67" r="3.6" fill="${LINE}"/><circle cx="76" cy="67" r="3.6" fill="${LINE}"/>`,
  sleepy: `<path d="M37 66 q7 8 14 0 M69 66 q7 8 14 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>`,
  wink: `<path d="M37 66 q7 -8 14 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/><circle cx="76" cy="66" r="6.5" fill="${LINE}"/><circle cx="78" cy="63.5" r="2" fill="#fff"/>`,
  grumpy: `<path d="M34 57 l16 6 M86 57 l-16 6" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/><circle cx="44" cy="68" r="5" fill="${LINE}"/><circle cx="76" cy="68" r="5" fill="${LINE}"/>`,
  love: `<path d="M44 60 c-5 -6 -13 -1 -9 5 l9 8 l9 -8 c4 -6 -4 -11 -9 -5z" fill="#FF6B81"/><path d="M76 60 c-5 -6 -13 -1 -9 5 l9 8 l9 -8 c4 -6 -4 -11 -9 -5z" fill="#FF6B81"/>`,
  // 彩虹猫：金色星星瞳 + 周身星光
  rainbow:
    `<path d="M44 58 L45.9 63.4 L51.6 63.5 L47 67 L48.7 72.5 L44 69.2 L39.3 72.5 L41 67 L36.4 63.5 L42.1 63.4 Z" fill="#FFB020" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M76 58 L77.9 63.4 L83.6 63.5 L79 67 L80.7 72.5 L76 69.2 L71.3 72.5 L73 67 L68.4 63.5 L74.1 63.4 Z" fill="#FFB020" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M12 45 L14 50 L19 52 L14 54 L12 59 L10 54 L5 52 L10 50 Z" fill="#FFD166"/>` +
    `<path d="M107 52 L108.6 56 L113 57.6 L108.6 59.2 L107 63.2 L105.4 59.2 L101 57.6 L105.4 56 Z" fill="#4CC9F0"/>` +
    `<path d="M99 26 L100.4 29.4 L104 30.8 L100.4 32.2 L99 35.6 L97.6 32.2 L94 30.8 L97.6 29.4 Z" fill="#FF8FA3"/>`
}

const mouths = {
  happy: `<path d="M50 84 q5 7 10 0 q5 7 10 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>`,
  surprised: `<ellipse cx="60" cy="86" rx="5" ry="6" fill="${LINE}"/>`,
  sleepy:
    `<path d="M52 84 q8 6 16 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<text x="90" y="40" font-size="14" font-weight="700" fill="#8D6E63" font-family="sans-serif">z</text>` +
    `<text x="99" y="29" font-size="10" font-weight="700" fill="#8D6E63" font-family="sans-serif">z</text>`,
  wink:
    `<path d="M50 82 q10 10 20 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M56 85 q4 8 8 0 z" fill="${NOSE}"/>`,
  grumpy: `<path d="M50 88 q5 -7 10 0 q5 -7 10 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>`,
  love: `<path d="M50 84 q5 7 10 0 q5 7 10 0" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>`,
  // 彩虹猫：开心到大张嘴 + 小舌头
  rainbow:
    `<path d="M49 81 q11 15 22 0 z" fill="${LINE}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M55 88 q5 6 10 0 z" fill="#FF8FA3"/>`
}

export const FACE_NAMES = ['开心', '惊讶', '犯困', '调皮', '生气', '撒娇', '彩虹']

const KEYS = ['happy', 'surprised', 'sleepy', 'wink', 'grumpy', 'love', 'rainbow']

// 彩虹猫专用表情变体（棋盘特殊块使用）
export const RAINBOW_VARIANT = 6

// variant: 0~5 普通表情；6 = 彩虹猫
export function catFaceSvg(variant = 0) {
  const k = KEYS[Math.abs(variant) % KEYS.length]
  return svgWrap(base() + eyes[k] + mouths[k])
}
