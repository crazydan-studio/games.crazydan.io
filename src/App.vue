<script setup>
import GameCard from './components/GameCard.vue'

// ============ 游戏注册表 ============
// 新增游戏子模块时在此追加入口即可（README「新增游戏子模块」有完整步骤）：
// - path      生产构建后的同域子目录（相对路径，任意子路径静态部署均可用）
// - devOrigin 开发态该游戏独立 dev server 的地址（见其 vite.config 端口）
const games = [
  {
    id: 'tiantian-xiaoxiaole',
    name: '天天消消乐',
    tagline: '天天的表情 · 三连消',
    desc: '以宠物猫「天天」的表情为主题的三消游戏：拍下它的各种表情，实时变成棋盘上的消除元素。4 连生成炸弹猫、5 连召唤彩虹猫，支持 PWA 离线畅玩。',
    tags: ['三消', '休闲', '摄像头表情', 'PWA 离线'],
    path: './games/tiantian-xiaoxiaole/',
    devOrigin: 'http://localhost:5174/'
  }
]

function play(game) {
  // 开发态跳转到该游戏的独立 dev server；生产构建后跳转同域游戏子目录
  location.href = import.meta.env.DEV ? game.devOrigin : game.path
}
</script>

<template>
  <div class="page">
    <header class="hero">
      <div class="hero-cat" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CrazyDan Games 吉祥猫">
          <rect x="4" y="4" width="92" height="92" rx="24" fill="#FF9838" />
          <path d="M20 42 28 10 47 31Z" fill="#E8722A" />
          <path d="M80 42 72 10 53 31Z" fill="#E8722A" />
          <path d="M26 36 30 17 40 28Z" fill="#FFC0CB" />
          <path d="M74 36 70 17 60 28Z" fill="#FFC0CB" />
          <circle cx="50" cy="59" r="34" fill="#FFE9C9" />
          <circle cx="38" cy="55" r="4.6" fill="#4A3728" />
          <circle cx="62" cy="55" r="4.6" fill="#4A3728" />
          <circle cx="39.6" cy="53.4" r="1.4" fill="#FFF" />
          <circle cx="63.6" cy="53.4" r="1.4" fill="#FFF" />
          <path d="M46 64h8l-4 5.5Z" fill="#E8756B" />
          <path d="M40 73q5 6 10 0M50 73q5 6 10 0" stroke="#4A3728" stroke-width="2.6" fill="none" stroke-linecap="round" />
          <g stroke="#4A3728" stroke-width="2.4" stroke-linecap="round">
            <line x1="12" y1="60" x2="26" y2="62" />
            <line x1="11" y1="70" x2="26" y2="70" />
            <line x1="88" y1="60" x2="74" y2="62" />
            <line x1="89" y1="70" x2="74" y2="70" />
          </g>
        </svg>
      </div>
      <h1>CrazyDan <span class="grad">Games</span></h1>
      <p class="sub">自研网页小游戏合集 · 即点即玩 · 无需安装</p>
    </header>

    <main class="grid">
      <GameCard v-for="g in games" :key="g.id" :game="g" @play="play(g)" />

      <div class="card coming">
        <div class="coming-face" aria-hidden="true">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="爪印">
            <ellipse cx="50" cy="63" rx="21" ry="17" fill="#E8D5BC" />
            <circle cx="28" cy="43" r="8.5" fill="#E8D5BC" />
            <circle cx="43" cy="34" r="9" fill="#E8D5BC" />
            <circle cx="57" cy="34" r="9" fill="#E8D5BC" />
            <circle cx="72" cy="43" r="8.5" fill="#E8D5BC" />
          </svg>
        </div>
        <h3>更多游戏，敬请期待</h3>
        <p>新的游戏子模块将持续加入这个合集。</p>
      </div>
    </main>

    <footer class="footer">
      <p>
        © 2026 CrazyDan Studio · 代码遵循 <a href="./LICENSE">Apache-2.0</a> 协议 ·
        <a href="https://github.com/crazydan-studio/games.crazydan.io" target="_blank" rel="noreferrer">GitHub</a>
      </p>
    </footer>
  </div>
</template>
