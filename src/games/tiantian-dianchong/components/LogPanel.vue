<script setup>
// ============ 事件日志：最近动态（倒序，最新在上） ============
import { computed } from 'vue'
import { dayOf, periodOfDay, hourOfDay } from '../core/time.js'

const props = defineProps({
  log: { type: Array, default: () => [] }
})

const items = computed(() => [...props.log].reverse().slice(0, 30))

function timeOf(t) {
  const h = hourOfDay(t)
  const p = periodOfDay(h)
  return `第${dayOf(t)}天 ${p.label}`
}
</script>

<template>
  <div class="log-panel">
    <h3>📖 最近动态</h3>
    <div class="log-list">
      <div v-for="(e, i) in items" :key="`${e.t}-${i}`" class="log-item">
        <span class="log-icon">{{ e.icon || '🐾' }}</span>
        <span class="log-time">{{ timeOf(e.t) }}</span>
        <span class="log-text">{{ e.text }}</span>
      </div>
      <div v-if="!items.length" class="log-item">
        <span class="log-icon">🌱</span>
        <span class="log-text">它刚刚来到你的设备里……</span>
      </div>
    </div>
  </div>
</template>
