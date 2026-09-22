import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 「天天消消乐」游戏子模块 Vite 配置
// - base: './' → 产物可部署到任意子路径（本游戏线上位于 /games/tiantian-xiaoxiaole/）
// - outDir → 输出合并到仓库根 dist/games/tiantian-xiaoxiaole/，
//   与主模块（门户）产物共同构成一份可整体静态部署的站点
//   （也可单独构建后把 dist/games/tiantian-xiaoxiaole/ 部署到任意子路径）
export default defineConfig({
  plugins: [vue()],
  base: './',
  // dev 端口 5174：与主模块门户 dev（5173）错开，二者可同时启动联调
  server: {
    port: 5174,
    allowedHosts: true
  },
  preview: {
    port: 4174,
    allowedHosts: true
  },
  build: {
    target: 'es2018',
    outDir: '../../dist/games/tiantian-xiaoxiaole',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900
  }
})
