<script setup>
// ============ 游戏入口卡片 ============
// 头图 preview 按游戏注册表的 preview 字段渲染专属动画：
// - match3：渐变背景 + 主角猫 + 漂浮的三消元素砖（消消乐）
// - pet：电子宠物照顾循环 —— 状态条衰减 → 照顾气泡 → 宠物开心成长（电宠）
defineProps({
  game: { type: Object, required: true }
})
defineEmits(['play'])
</script>

<template>
  <article class="card game-card">
    <!-- 头图（电宠）：12s 照顾循环动画，同步讲完一轮回合：
         开心 → 状态衰减/宠物难过 → 喂食🍚/玩耍🎾/洗澡🛁 → 恢复开心 + 喵呜～ + 成长 -->
    <div v-if="game.preview === 'pet'" class="preview preview--pet" aria-hidden="true">
      <div class="pet-preview">
        <!-- 电波涟漪（电波里的生命） -->
        <i class="pet-wave" />
        <i class="pet-wave w2" />

        <!-- 宠物猫：与游戏内 PetAvatar 同款造型，CSS 驱动呼吸/尾巴/眨眼/情绪切换 -->
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="100" cy="188" rx="44" ry="7" fill="rgba(30,60,50,0.13)" />
          <g class="pet-body">
            <g class="pet-tail">
              <path d="M148 138 Q186 122 176 82" fill="none" stroke="#C2447F" stroke-width="11" stroke-linecap="round" />
              <path d="M168 96 q6 10 2 18 M174 82 q4 8 1 14" fill="none" stroke="#4A3728" stroke-width="4" stroke-linecap="round" opacity="0.55" />
            </g>
            <ellipse cx="100" cy="142" rx="43" ry="33" fill="#E85D9E" />
            <ellipse cx="100" cy="152" rx="25" ry="19" fill="#FBD9E8" />
            <path d="M58 58 L66 16 L92 40 Z" fill="#E85D9E" />
            <path d="M142 58 L134 16 L108 40 Z" fill="#E85D9E" />
            <path d="M65 50 L69 28 L83 41 Z" fill="#C2447F" opacity="0.75" />
            <path d="M135 50 L131 28 L117 41 Z" fill="#C2447F" opacity="0.75" />
            <circle cx="100" cy="86" r="44" fill="#E85D9E" />
            <path d="M64 96 a44 44 0 0 0 72 0 a40 40 0 0 1 -72 0 Z" fill="#FBD9E8" opacity="0.55" />
            <g class="pet-eyes">
              <g class="eye-happy" stroke="#4A3728" stroke-width="4.5" fill="none">
                <path d="M75 82 q9 -12 18 0" />
                <path d="M107 82 q9 -12 18 0" />
              </g>
              <g class="eye-sad" stroke="#4A3728" stroke-width="4.5" fill="none">
                <path d="M75 84 q9 8 18 0 M107 84 q9 8 18 0" />
                <path d="M74 68 q9 -5 19 -1 M107 67 q10 -4 19 1" opacity="0.65" stroke-width="3.5" />
              </g>
            </g>
            <g class="pet-blush">
              <ellipse cx="68" cy="98" rx="8" ry="5" fill="#FFB6C1" opacity="0.6" />
              <ellipse cx="132" cy="98" rx="8" ry="5" fill="#FFB6C1" opacity="0.6" />
            </g>
            <path d="M94 95 L106 95 L100 103 Z" fill="#E88AA0" />
            <circle cx="97" cy="98" r="1.2" fill="#fff" opacity="0.7" />
            <path class="mouth-happy" d="M91 110 q9 7 18 0" fill="none" stroke="#4A3728" stroke-width="3.6" stroke-linecap="round" />
            <path class="mouth-sad" d="M91 113 q9 -7 18 0" fill="none" stroke="#4A3728" stroke-width="3.6" stroke-linecap="round" />
            <g stroke="#4A3728" stroke-width="2" stroke-linecap="round" opacity="0.55">
              <path d="M62 94 h-16 M62 100 l-16 4 M62 88 l-15 -4" fill="none" />
              <path d="M138 94 h16 M138 100 l16 4 M138 88 l15 -4" fill="none" />
            </g>
          </g>
        </svg>

        <!-- 说话气泡：恢复开心后向玩家撒娇 -->
        <span class="pet-say">喵呜～</span>
      </div>

      <!-- 照顾气泡：饿了投喂 / 陪它玩耍 / 洗得干干净净（同游戏内六操作） -->
      <span class="care-bubble b-feed">🍚</span>
      <span class="care-bubble b-play">🎾</span>
      <span class="care-bubble b-bathe">🛁</span>
      <span class="care-heart h1">💖</span>
      <span class="care-heart h2">💖</span>

      <!-- 迷你状态面板：同游戏内四维状态条，随循环衰减与照顾回升 -->
      <div class="mini-status">
        <div class="mini-stat s-hunger"><span class="ms-icon">🍽️</span><div class="ms-track"><i /></div></div>
        <div class="mini-stat s-mood"><span class="ms-icon">💖</span><div class="ms-track"><i /></div></div>
        <div class="mini-stat s-health"><span class="ms-icon">❤️</span><div class="ms-track"><i /></div></div>
        <div class="mini-stat s-hygiene"><span class="ms-icon">🫧</span><div class="ms-track"><i /></div></div>
      </div>

      <!-- 成长进度：时间流逝，慢慢长大 -->
      <div class="grow-chip">
        <span class="gc-emoji">🌱</span>
        <div class="gc-bar"><i /></div>
        <span class="gc-text">成长中</span>
      </div>
    </div>

    <!-- 头图（消消乐）：渐变背景 + 主角猫 + 漂浮的三消元素砖 -->
    <div v-else class="preview" aria-hidden="true">
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
