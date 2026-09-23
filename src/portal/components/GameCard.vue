<script setup>
// ============ 游戏入口卡片 ============
defineProps({
  game: { type: Object, required: true }
})
defineEmits(['play'])
</script>

<template>
  <article class="card game-card">
    <!-- 头图：渐变背景 + 主角猫 + 漂浮的三消元素砖 -->
    <div class="preview">
      <div class="preview-cat" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="92" height="92" rx="24" fill="#FFF3DF" />
          <path d="M20 42 28 10 47 31Z" fill="#E8722A" />
          <path d="M80 42 72 10 53 31Z" fill="#E8722A" />
          <path d="M26 36 30 17 40 28Z" fill="#FFC0CB" />
          <path d="M74 36 70 17 60 28Z" fill="#FFC0CB" />
          <circle cx="50" cy="59" r="34" fill="#FFE9C9" />
          <path d="M30 54q7-9 14 0" stroke="#4A3728" stroke-width="4" fill="none" stroke-linecap="round" />
          <path d="M56 54q7-9 14 0" stroke="#4A3728" stroke-width="4" fill="none" stroke-linecap="round" />
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

      <div class="mini-tile t1" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#FF7EB0" />
          <circle cx="38" cy="46" r="5" fill="#4A3728" />
          <circle cx="62" cy="46" r="5" fill="#4A3728" />
          <path d="M42 60q8 9 16 0" stroke="#4A3728" stroke-width="5" fill="none" stroke-linecap="round" />
        </svg>
      </div>
      <div class="mini-tile t2" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#FFD34E" />
          <circle cx="38" cy="46" r="5" fill="#4A3728" />
          <circle cx="62" cy="46" r="5" fill="#4A3728" />
          <ellipse cx="50" cy="62" rx="6" ry="7" fill="#4A3728" />
        </svg>
      </div>
      <div class="mini-tile t3" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#7EC9FF" />
          <path d="M30 46q8-10 16 0" stroke="#4A3728" stroke-width="5" fill="none" stroke-linecap="round" />
          <path d="M54 46q8-10 16 0" stroke="#4A3728" stroke-width="5" fill="none" stroke-linecap="round" />
          <path d="M42 60q8 8 16 0" stroke="#4A3728" stroke-width="5" fill="none" stroke-linecap="round" />
        </svg>
      </div>
    </div>

    <!-- 正文 -->
    <div class="body">
      <div class="title-row">
        <h3>{{ game.name }}</h3>
        <span class="tagline">{{ game.tagline }}</span>
      </div>
      <p class="desc">{{ game.desc }}</p>
      <div class="tags">
        <span v-for="t in game.tags" :key="t" class="tag">{{ t }}</span>
      </div>
    </div>

    <!-- 操作条 -->
    <footer class="foot">
      <span class="play-hint">无需安装 · 打开即玩</span>
      <button class="play-btn" type="button" @click="$emit('play')">
        开始游戏
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </footer>
  </article>
</template>
