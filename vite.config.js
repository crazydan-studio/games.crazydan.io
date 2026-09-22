import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 主模块（游戏门户）Vite 配置
// - base: './' → 产物可部署到任意子路径（纯静态部署友好）
// - 构建顺序约定：先构建门户（清空 dist/），再构建各游戏子模块
//   （追加到 dist/games/<name>/），由 scripts/build-all.mjs 统一编排
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    allowedHosts: true
  },
  preview: {
    port: 4173,
    allowedHosts: true
  }
})
