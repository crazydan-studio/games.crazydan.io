<script setup>
// ============ 主页 ============
import { computed } from 'vue'
import Icon from './Icon.vue'
import CatFace from './CatFace.vue'
import { expressions, slots } from '../store/expressions'
import { pwaState, promptInstall } from '../store/pwa'

defineEmits(['start', 'camera', 'manage'])

const usedCount = computed(() => slots.value.filter(Boolean).length)

async function onInstall() {
  const ok = await promptInstall()
  if (!ok) {
    // 未触发安装流（已安装/不支持）：给一句引导
    emitHint()
  }
}

function emitHint() {
  // 无法主动唤起安装面板时，提示用户用浏览器菜单「添加到主屏幕」
  const el = document.querySelector('.install-tip')
  if (el) el.hidden = false
}
</script>

<template>
  <div class="home">
    <div class="hero">
      <div class="hero-cats">
        <div class="hero-cat side"><CatFace :variant="3" /></div>
        <div class="hero-cat main"><CatFace :variant="0" /></div>
        <div class="hero-cat side"><CatFace :variant="5" /></div>
      </div>
      <h1 class="logo">天天消消乐</h1>
      <p class="slogan">收集猫咪「天天」的表情 · 三连消除超上头</p>
    </div>

    <div class="menu">
      <button class="menu-btn primary" @click="$emit('start', 'classic')">
        <Icon name="play" />
        <span>经典闯关</span>
      </button>
      <button class="menu-btn accent" @click="$emit('start', 'time')">
        <Icon name="clock" />
        <span>限时挑战</span>
      </button>
      <button class="menu-btn" @click="$emit('camera')">
        <Icon name="camera" />
        <span>拍摄天天表情</span>
      </button>
      <button class="menu-btn" @click="$emit('manage')">
        <Icon name="image" />
        <span>表情管理 / 导入导出</span>
      </button>
    </div>

    <!-- 特殊元素图例 -->
    <div class="spec-legend" aria-label="特殊元素玩法">
      <div class="spec-item">
        <span class="spec-demo demo-bomb">
          <span class="demo-ring"></span>
          <CatFace :variant="4" />
        </span>
        <span class="spec-text"><b>4 连</b> → 炸弹猫<br /><i>消除它引爆 3×3</i></span>
      </div>
      <div class="spec-item">
        <span class="spec-demo demo-rainbow">
          <span class="demo-disc"></span>
          <CatFace :variant="6" />
        </span>
        <span class="spec-text"><b>5 连 / L 形</b> → 彩虹猫<br /><i>换任意表情清全场同款</i></span>
      </div>
    </div>

    <p class="home-tip">
      <Icon name="paw" />
      已收集 {{ expressions.length }} 个表情 · 正在使用 {{ usedCount }}/6 个元素槽位
    </p>

    <!-- PWA 离线/安装 -->
    <div class="pwa-row">
      <span v-if="!pwaState.online" class="pwa-chip offline">
        <Icon name="wifi-off" /> 离线模式 · 照样能玩
      </span>
      <span v-else-if="pwaState.controlled" class="pwa-chip ready">
        <Icon name="check" /> 已支持离线游玩
      </span>
      <button v-if="pwaState.canInstall" class="pwa-chip install" @click="onInstall">
        <Icon name="download" /> 安装到桌面/主屏
      </button>
    </div>
    <p class="install-tip" hidden>
      在浏览器菜单里选「添加到主屏幕 / 安装应用」，断网也能随时陪天天玩～
    </p>
  </div>
</template>

<style scoped>
.home {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  padding: 24px;
  text-align: center;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.hero-cats {
  display: flex;
  gap: 4px;
  align-items: flex-end;
}

.hero-cat {
  animation: floaty 3.2s ease-in-out infinite;
}

.hero-cat.side {
  width: 62px;
  height: 62px;
}

.hero-cat.side:first-child {
  animation-delay: 0.4s;
}

.hero-cat.main {
  width: 92px;
  height: 92px;
  animation-delay: 0.2s;
}

.logo {
  margin: 8px 0 0;
  font-size: clamp(34px, 9vw, 44px);
  letter-spacing: 2px;
  background: linear-gradient(135deg, #f57c1f, #ffb347 60%, #ff8fa3);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 3px 0 rgba(93, 64, 55, 0.12));
}

.slogan {
  margin: 0;
  color: var(--text-soft);
  font-size: 14px;
}

.menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  width: 100%;
  max-width: 380px;
}

.menu-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 10px;
  border: none;
  border-radius: 20px;
  background: #fff;
  color: var(--text);
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(93, 64, 55, 0.14), 0 3px 0 rgba(93, 64, 55, 0.1);
  transition: transform 0.15s, box-shadow 0.15s;
}

.menu-btn:active {
  transform: translateY(3px);
  box-shadow: 0 4px 12px rgba(93, 64, 55, 0.12);
}

.menu-btn .icon {
  width: 27px;
  height: 27px;
}

.menu-btn.primary {
  background: linear-gradient(135deg, #ffb347, #f07e1d);
  color: #fff;
}

.menu-btn.accent {
  background: linear-gradient(135deg, #ffa3b5, #ff7d95);
  color: #fff;
}

.home-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  color: var(--text-soft);
  background: var(--bg-soft);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  padding: 7px 14px;
}

.home-tip .icon {
  width: 14px;
  height: 14px;
}

@keyframes floaty {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-9px);
  }
}

/* ---- 特殊元素图例 ---- */
.spec-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.spec-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-radius: 16px;
  padding: 10px 14px 10px 10px;
  box-shadow: 0 6px 18px rgba(93, 64, 55, 0.12), 0 2px 0 rgba(93, 64, 55, 0.08);
}

.spec-demo {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 26%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: none;
}

.spec-demo .cat-face {
  width: 86%;
  height: 86%;
}

.demo-bomb {
  background: #ffd9a8;
  box-shadow: 0 0 12px rgba(255, 90, 60, 0.5);
}

.demo-ring {
  position: absolute;
  inset: 6%;
  border-radius: 30%;
  border: 2.5px dashed #ff5a3c;
  animation: ringSpin 3.2s linear infinite;
}

.demo-rainbow {
  background: #fff;
  box-shadow: 0 0 12px rgba(124, 77, 255, 0.4);
}

.demo-disc {
  position: absolute;
  inset: 0;
  border-radius: 26%;
  background: conic-gradient(#ff8fa3, #ffd166, #7bd88f, #4cc9f0, #b28dff, #ff8fa3);
  animation: ringSpin 2.4s linear infinite;
}

.demo-rainbow .cat-face {
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.95));
}

.spec-text {
  font-size: 12.5px;
  line-height: 1.45;
  text-align: left;
}

.spec-text b {
  color: var(--primary-deep);
}

.spec-text i {
  color: var(--text-soft);
  font-style: normal;
  font-size: 11.5px;
}

@keyframes ringSpin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- PWA 徽章 ---- */
.pwa-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.pwa-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--bg-soft);
  color: var(--text-soft);
}

.pwa-chip .icon {
  width: 14px;
  height: 14px;
}

.pwa-chip.offline {
  color: #d84315;
  border-color: #ffccbc;
  background: #fff3e0;
}

.pwa-chip.ready {
  color: #2e7d32;
  border-color: #c8e6c9;
  background: #e8f5e9;
}

button.pwa-chip.install {
  cursor: pointer;
  color: #6a1b9a;
  border-color: #e1bee7;
  background: #f3e5f5;
}

.install-tip {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-soft);
  text-align: center;
  max-width: 320px;
}
</style>
