<script setup>
// ============ 应用根组件：屏幕路由 + 弹窗编排 ============
import { onMounted, ref, watch } from 'vue'
import HomeScreen from './components/HomeScreen.vue'
import GameScreen from './components/GameScreen.vue'
import CameraModal from './components/CameraModal.vue'
import ExpressionManager from './components/ExpressionManager.vue'
import Toasts from './components/Toasts.vue'
import { initExpressions } from './store/expressions'
import { uiState } from './store/ui'

const screen = ref('home') // home | game
const gameMode = ref('classic')
const showCamera = ref(false)
const showManager = ref(false)

function startGame(mode) {
  gameMode.value = mode
  screen.value = 'game'
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
  initExpressions()
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
      @home="screen = 'home'"
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
