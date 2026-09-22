import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const r = (p) => fileURLToPath(new URL(p, import.meta.url))

// ============ 统一工程 Vite 配置（门户 + 各游戏，单一工程统一开发与构建） ============
// - base: './' → 产物可部署到任意子路径（纯静态部署友好，全部资源相对引用）
// - MPA 多入口：门户 index.html + 各游戏 <name>/index.html，
//   开发（同一 dev server）与构建（同一次 vite build）均统一完成
// - 各游戏源码位于 src/games/<name>/，静态资源位于 public/<name>/
// - 新增游戏：复制「入口页 + 源码目录 + 静态资源」三件套，并在下方 input 登记
export default defineConfig({
  plugins: [vue()],
  base: './',
  // MPA 模式：无 SPA 兜底，/foo 与 /foo/ 均按目录解析到 foo/index.html
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
        index: r('./index.html'),
        'tiantian-xiaoxiaole': r('./tiantian-xiaoxiaole/index.html')
      }
    }
  }
})
