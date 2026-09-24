<script setup>
// ============ 游戏主屏：HUD + 棋盘 + 结算弹窗 ============
import { computed, onBeforeUnmount, ref } from 'vue'
import { createGame } from '../game/useGame'
import { findPossibleMove } from '../game/engine'
import GameBoard from './GameBoard.vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { playSound, isMuted, toggleMute } from '../utils/sound'

const props = defineProps({
  mode: { type: String, default: 'classic' }
})

const emit = defineEmits(['home', 'camera', 'manage'])

const game = createGame(props.mode)
game.start()

const muted = ref(isMuted())

const pct = computed(() => {
  const p = Math.min(100, Math.round((game.score / game.target) * 100))
  return Math.max(game.score > 0 ? 2 : 0, p)
})

function onMute() {
  muted.value = toggleMute()
  if (!muted.value) playSound('tap')
}

onBeforeUnmount(() => {
  game.destroy()
})

// 开发/测试钩子（仅 DEV）
if (import.meta.env.DEV) {
  window.__TT_TEST__ = {
    game,
    findMove: () => findPossibleMove(game.grid),
    // 强制设置格子类型（"r,c" → type），供 E2E 构造 4 连/5 连场景
    setTypes(map) {
      for (const [key, type] of Object.entries(map)) {
        const [r, c] = key.split(',').map(Number)
        const t = game.grid[r] && game.grid[r][c]
        if (t) {
          t.type = type
          t.kind = 'normal'
        }
      }
      return true
    },
    // 当前棋盘上的特殊块列表
    specials() {
      return game.tiles
        .filter((t) => t.kind !== 'normal')
        .map((t) => ({ id: t.id, kind: t.kind, type: t.type, x: t.x, y: t.y }))
    }
  }
}
</script>

<template>
  <div class="game">
    <header class="game-top">
      <button class="icon-btn" aria-label="回主页" @click="$emit('home')">
        <Icon name="home" />
      </button>
      <div class="mode-title">
        {{ game.isClassic ? `经典闯关 · 第 ${game.level} 关` : '限时挑战' }}
      </div>
      <button class="icon-btn" :aria-label="muted ? '开启音效' : '关闭音效'" @click="onMute">
        <Icon :name="muted ? 'volume-off' : 'volume'" />
      </button>
    </header>

    <div class="stats">
      <div class="stat">
        <span class="stat-label">分数</span>
        <b>{{ game.score }}</b>
      </div>
      <div v-if="game.isClassic" class="progress">
        <div class="prog-head">
          <span>目标 {{ game.target }}</span>
          <span>{{ pct }}%</span>
        </div>
        <div class="prog-bar">
          <i :style="{ width: pct + '%' }"></i>
        </div>
      </div>
      <div v-else class="stat">
        <span class="stat-label">最高</span>
        <b>{{ game.best }}</b>
      </div>
      <div class="stat big">
        <span class="stat-label">{{ game.isClassic ? '剩余步数' : '剩余时间' }}</span>
        <b>{{ game.isClassic ? game.moves : game.timeLeft + 's' }}</b>
      </div>
    </div>

    <div v-if="game.comboNow >= 2" :key="game.comboNow" class="combo-flag">
      连击 ×{{ game.comboNow }}！
    </div>
    <div v-else class="combo-flag placeholder">天天等你来消除～</div>

    <GameBoard :game="game" />

    <div class="action-row">
      <button class="btn ghost tiny" @click="game.showHint()">
        <Icon name="bulb" /> 提示
      </button>
      <button class="btn ghost tiny" @click="game.restart()">
        <Icon name="refresh" /> 重开
      </button>
      <button class="btn accent tiny" @click="$emit('camera')">
        <Icon name="camera" /> 拍天天
      </button>
      <button class="btn ghost tiny" @click="$emit('manage')">
        <Icon name="image" /> 表情
      </button>
    </div>

    <!-- 通关 -->
    <Modal v-if="game.state === 'clear'" :closable="false">
      <div class="result-card">
        <div class="stars">
          <Icon v-for="i in 3" :key="i" :name="i <= game.stars ? 'star-fill' : 'star'" class="star" :class="{ on: i <= game.stars }" />
        </div>
        <h3>第 {{ game.level }} 关完成！</h3>
        <p class="mini">分数 {{ game.score }} · 剩余 {{ game.moves }} 步</p>
        <div class="btn-row">
          <button class="btn primary" @click="game.nextLevel()">下一关</button>
          <button class="btn ghost" @click="$emit('home')">回主页</button>
        </div>
      </div>
    </Modal>

    <!-- 经典模式失败 -->
    <Modal v-if="game.state === 'over' && game.isClassic" :closable="false">
      <div class="result-card">
        <h3>差一点点！</h3>
        <p class="mini">目标 {{ game.target }} 分 · 本次 {{ game.score }} 分</p>
        <p class="mini">换个表情说不定就过了喵～</p>
        <div class="btn-row">
          <button class="btn primary" @click="game.restart()">再玩一次</button>
          <button class="btn ghost" @click="$emit('home')">回主页</button>
        </div>
      </div>
    </Modal>

    <!-- 限时模式结束 -->
    <Modal v-if="game.state === 'over' && !game.isClassic" :closable="false">
      <div class="result-card">
        <div class="stars">
          <Icon name="star-fill" class="star on" />
        </div>
        <h3>时间到！</h3>
        <p class="mini">本次 {{ game.score }} 分 · 历史最高 {{ game.best }} 分</p>
        <div class="btn-row">
          <button class="btn primary" @click="game.restart()">再来一局</button>
          <button class="btn ghost" @click="$emit('home')">回主页</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.game {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  max-width: 520px;
  margin: 0 auto;
  padding: 10px 14px calc(18px + env(safe-area-inset-bottom));
  gap: 10px;
}

.game-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mode-title {
  font-weight: 800;
  font-size: 17px;
  letter-spacing: 0.5px;
}

.stats {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  background: #fff;
  border-radius: 16px;
  padding: 10px 16px;
  box-shadow: 0 8px 24px rgba(93, 64, 55, 0.14);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-soft);
}

.stat b {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat.big b {
  color: var(--primary-deep);
  font-size: 22px;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.prog-head {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-soft);
}

.prog-bar {
  height: 10px;
  background: var(--bg-deep);
  border-radius: 99px;
  overflow: hidden;
}

.prog-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #ffb347, #f07e1d);
  border-radius: 99px;
  transition: width 0.4s;
}

.combo-flag {
  text-align: center;
  font-weight: 900;
  color: var(--primary-deep);
  font-size: 19px;
  text-shadow: 0 2px 0 #fff;
  animation: comboPop 0.4s cubic-bezier(0.3, 1.6, 0.5, 1);
  min-height: 26px;
}

.combo-flag.placeholder {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-soft);
  animation: none;
  text-shadow: none;
}

@keyframes comboPop {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
}

.action-row {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.action-row .btn {
  padding: 9px 15px;
  font-size: 13.5px;
}

.result-card {
  text-align: center;
  padding: 8px 4px;
}

.result-card h3 {
  margin: 10px 0 6px;
  font-size: 21px;
}

.result-card p {
  margin: 4px 0;
}

.stars {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.star {
  width: 34px;
  height: 34px;
  color: #e4cdb2;
}

.star.on {
  color: #ffb347;
  animation: starPop 0.5s cubic-bezier(0.3, 1.8, 0.5, 1) backwards;
}

.star:nth-child(2).on {
  animation-delay: 0.12s;
}

.star:nth-child(3).on {
  animation-delay: 0.24s;
}

@keyframes starPop {
  from {
    transform: scale(0) rotate(-40deg);
    opacity: 0;
  }
}
</style>
