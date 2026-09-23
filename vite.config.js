import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const r = (p) => fileURLToPath(new URL(p, import.meta.url))

// 参与构建的游戏（入口页 src/games/<name>/index.html + 静态资源 public/<name>/）
const GAME_ENTRIES = ['tiantian-xiaoxiaole', 'tiantian-dianchong']

// ============ 游戏页面插件：入口页随源码放在 src/games/<name>/，线上仍挂 /<name>/ ============
// 构建侧：把 HTML 入口登记为「虚拟路径」<root>/<name>/index.html（磁盘上不存在），
//   由 resolveId/load 钩子映射到真实文件 src/games/<name>/index.html —— Vite 的
//   html 构建管线即按虚拟路径计算产物位置（dist/<name>/index.html）与相对产物
//   引用（../assets/…），无需任何构建后处理
// 开发侧：Vite 按「URL → 磁盘路径」服务 html，src 内的入口页无法经 /<name>/ 访问 ——
//   由 configureServer 把 /<name>/ 映射到 src/games/<name>/index.html（经
//   transformIndexHtml 注入 /@vite/client），/<name> 无尾斜杠时 308 重定向；
//   游戏清单自动发现（src/games/ 下含 index.html 的子目录）
function gamePages() {
  // 虚拟入口路径（= 线上 URL 结构）→ 真实源码文件
  const virtualHtml = new Map(
    GAME_ENTRIES.map((name) => [
      join(ROOT, name, 'index.html'),
      join(ROOT, 'src/games', name, 'index.html')
    ])
  )
  return {
    name: 'game-pages',
    enforce: 'pre',
    resolveId(id) {
      if (virtualHtml.has(id)) return id
    },
    load(id) {
      const real = virtualHtml.get(id)
      if (real) return readFileSync(real, 'utf8')
    },
    configureServer(server) {
      const srcGames = join(server.config.root, 'src', 'games')
      const gameDirs = new Set(
        existsSync(srcGames)
          ? readdirSync(srcGames, { withFileTypes: true })
              .filter((e) => e.isDirectory() && existsSync(join(srcGames, e.name, 'index.html')))
              .map((e) => e.name)
          : []
      )
      server.middlewares.use((req, res, next) => {
        const match = /^\/([\w-]+)\/?$/.exec(req.url || '')
        if (!match || !gameDirs.has(match[1])) return next()
        const htmlPath = join(srcGames, match[1], 'index.html')
        const withSlash = (req.url || '').endsWith('/') ? req.url : `${req.url}/`
        if (req.url !== withSlash) {
          res.writeHead(308, { Location: withSlash })
          return res.end()
        }
        server.transformIndexHtml(withSlash, readFileSync(htmlPath, 'utf8')).then(
          (html) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(html)
          },
          next
        )
      })
    }
  }
}

// ============ 统一工程 Vite 配置（门户 + 各游戏，单一工程统一开发与构建） ============
// - base: './' → 产物可部署到任意子路径（纯静态部署友好，全部资源相对引用）
// - 门户：根 index.html（HTML 入口）→ src/portal/
// - 各游戏：入口页与源码同目录（src/games/<name>/，模块自成一体），
//   静态资源（favicon/PWA/SW/表情包等）位于 public/<name>/（构建后同目录输出）
// - 新增游戏：新建 src/games/<name>/（入口页 + 源码）与 public/<name>/（静态资源），
//   把游戏名加入 GAME_ENTRIES，再在门户注册表添加入口卡片即可
export default defineConfig({
  plugins: [vue(), gamePages()],
  base: './',
  // MPA 模式：无 SPA 兜底；游戏页面由 gamePages 插件映射到 src/games/<name>/
  appType: 'mpa',
  server: {
    port: 5173,
    allowedHosts: true
  },
  preview: {
    port: 4173,
    allowedHosts: true
  },
  build: {
    target: 'es2018',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        // 门户：HTML 入口（构建时替换为 hash 产物引用）
        index: r('./index.html'),
        // 各游戏：虚拟入口路径（磁盘上不存在），由 gamePages 插件映射到
        // src/games/<name>/index.html —— 产物自然落于 dist/<name>/index.html
        ...Object.fromEntries(GAME_ENTRIES.map((name) => [name, r(`./${name}/index.html`)]))
      }
    }
  }
})
