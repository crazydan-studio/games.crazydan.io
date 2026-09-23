<script setup>
// ============ 操作按键区：电子宠物机的实体按键 ============
import { computed } from 'vue'
import { ACTIONS } from '../core/actions.js'

const props = defineProps({
  cooldowns: { type: Object, default: () => ({}) }, // actionId → 剩余毫秒
  dead: { type: Boolean, default: false },
  coma: { type: Boolean, default: false }
})

const emit = defineEmits(['act'])

const items = computed(() =>
  ACTIONS.map((a) => {
    const rest = props.cooldowns[a.id] || 0
    return { ...a, disabled: props.dead || rest > 0, rest }
  })
)

function fmtRest(ms) {
  if (ms >= 60000) return `${Math.ceil(ms / 60000)} 分钟`
  return `${Math.ceil(ms / 1000)} 秒`
}
</script>

<template>
  <div class="keys">
    <button
      v-for="a in items"
      :key="a.id"
      class="key"
      type="button"
      :disabled="a.disabled"
      :title="a.rest > 0 ? `休息中（剩 ${fmtRest(a.rest)}）` : a.hint"
      @click="emit('act', a.id)"
    >
      <span class="k-emoji">{{ a.emoji }}</span>
      <span>{{ a.label }}</span>
    </button>
  </div>
</template>
