<script setup>
// ============ 应用根组件：屏幕路由 + 弹窗编排 ============
// 「经典闯关」/「限时挑战」使用 URL 锚点路由（#classic / #time）：
// - 点击开始游戏 → 写入锚点，hashchange 同步到游戏屏
// - 浏览器回退/前进 → 依据锚点在家屏与游戏屏之间切换
// - 直达链接（含锚点打开）→ 进入对应模式
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import HomeScreen from './components/HomeScreen.vue'
import GameScreen from './components/GameScreen.vue'
import CameraModal from './components/CameraModal.vue'
import ExpressionManager from './components/ExpressionManager.vue'
import Toasts from './components/Toasts.vue'
import { initExpressions } from './store/expressions'
import { uiState } from './store/ui'

const GAME_MODES = ['classic', 'time']

const screen = ref('home') // home | game
const gameMode = ref('classic')
const showCamera = ref(false)
const showManager = ref(false)

// 依据当前 URL 锚点同步屏幕状态（唯一入口）
function syncFromUrl() {
  const hash = (location.hash || '').replace(/^#/, '')
  if (GAME_MODES.includes(hash)) {
    gameMode.value = hash
    screen.value = 'game'
  } else {
    screen.value = 'home'
  }
}

function startGame(mode) {
  // 通过锚点驱动（hashchange → syncFromUrl），保证回退/前进可复现
  if (location.hash === '#' + mode) {
    gameMode.value = mode
    screen.value = 'game'
    return
  }
  location.hash = mode
}

function goHome() {
  // 清掉锚点但不留下 '#' 尾巴；hashchange/popstate 负责同步
  if (location.hash) {
    history.pushState(null, '', location.pathname + location.search)
  }
  syncFromUrl()
}

function openCamera() {
  showManager.value = false
  showCamera.value = true
}

function openManager() {
  showCamera.value = false
  showManager.value = true
}

// 弹窗打开时通知游戏暂停计时（限时模式）
watch(
  [showCamera, showManager],
  () => {
    uiState.overlay = showCamera.value || showManager.value
  },
  { immediate: false }
)

onMounted(() => {
  window.addEventListener('hashchange', syncFromUrl)
  window.addEventListener('popstate', syncFromUrl)
  syncFromUrl() // 支持直达 #classic / #time
  initExpressions()
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncFromUrl)
  window.removeEventListener('popstate', syncFromUrl)
})
</script>

<template>
  <div class="app-shell">
    <HomeScreen
      v-if="screen === 'home'"
      @start="startGame"
      @camera="openCamera"
      @manage="openManager"
    />
    <GameScreen
      v-else
      :key="gameMode + '-' + screen"
      :mode="gameMode"
      @home="goHome"
      @camera="openCamera"
      @manage="openManager"
    />
    <CameraModal v-if="showCamera" @close="showCamera = false" />
    <ExpressionManager
      v-if="showManager"
      @close="showManager = false"
      @camera="openCamera"
    />
    <Toasts />
  </div>
</template>
