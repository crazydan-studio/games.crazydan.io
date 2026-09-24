<script setup>
// ============ 道具坞：常见 3D 宠物游戏的投掷交互入口 ============
// 底部悬浮道具条：按住任意道具拖到舞台上松手即投掷（汉堡/胡萝卜/芝士=投喂，
// 玩具骨头=掷出玩耍）。拖拽期间显示 emoji 幽灵跟随指针；3D 侧由 PetStage
// 调用 player.setDragging 生成「手持道具」网格并计算抛物线初速度。
import { onBeforeUnmount, ref } from 'vue'
import { THROW_ITEMS } from '../b3d/assets.js'

const props = defineProps({
  disabled: { type: Boolean, default: false }, // 死亡/昏迷
  cooldowns: { type: Object, default: () => ({}) } // actionId → 剩余毫秒（feed/snack/play）
})

const emit = defineEmits(['drag-start'])

const items = Object.entries(THROW_ITEMS).map(([id, def]) => ({ id, ...def }))
const ghost = ref(null) // { emoji, x, y }
let dragging = null

function onItemDown(ev, id) {
  if (props.disabled || ghost.value) return
  const def = THROW_ITEMS[id]
  const rest = props.cooldowns?.[def.action] || 0
  if (rest > 0) return // 对应照料操作冷却中
  dragging = id
  ghost.value = { emoji: def.emoji, x: ev.clientX, y: ev.clientY }
  window.addEventListener('pointermove', onGhostMove)
  window.addEventListener('pointerup', onGhostUp)
  emit('drag-start', id)
}

function onGhostMove(ev) {
  if (ghost.value) {
    ghost.value.x = ev.clientX
    ghost.value.y = ev.clientY
  }
}

function onGhostUp() {
  dragging = null
  ghost.value = null
  window.removeEventListener('pointermove', onGhostMove)
  window.removeEventListener('pointerup', onGhostUp)
}

onBeforeUnmount(onGhostUp)

function fmtRest(ms) {
  return ms >= 60000 ? `${Math.ceil(ms / 60000)}分` : `${Math.ceil(ms / 1000)}秒`
}
</script>

<template>
  <div class="item-dock" :class="{ disabled }">
    <button
      v-for="it in items"
      :key="it.id"
      class="dock-item"
      type="button"
      :disabled="disabled || (cooldowns[it.action] || 0) > 0"
      :title="it.label + (cooldowns[it.action] > 0 ? `（休息中 剩 ${fmtRest(cooldowns[it.action])}）` : '——按住拖到舞台上投出去')"
      @pointerdown="onItemDown($event, it.id)"
    >
      <span class="dock-emoji">{{ it.emoji }}</span>
      <span class="dock-label">{{ it.label }}</span>
    </button>
    <span class="dock-hint">按住拖出 · 松手投掷</span>
  </div>

  <!-- 拖拽幽灵（跟随指针的 emoji） -->
  <Teleport to="body">
    <div v-if="ghost" class="dock-ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }">
      {{ ghost.emoji }}
    </div>
  </Teleport>
</template>
