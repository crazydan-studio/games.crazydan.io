<script setup>
// ============ 状态面板：四维状态条 + 成长信息 ============
import { computed } from 'vue'

const props = defineProps({
  pet: { type: Object, required: true },
  species: { type: Object, required: true },
  stageLabel: { type: String, default: '' },
  ageText: { type: String, default: '' },
  lifeLabel: { type: String, default: '' },
  growthPct: { type: Number, default: 0 } // 当前阶段成长进度 0-1
})

const stats = computed(() => [
  { key: 'hunger', icon: '🍽️', label: '饱食', value: props.pet.hunger },
  { key: 'mood', icon: '💖', label: '心情', value: props.pet.mood },
  { key: 'health', icon: '❤️', label: '健康', value: props.pet.health },
  { key: 'hygiene', icon: '🫧', label: '清洁', value: props.pet.hygiene }
])

function level(v) {
  if (v < 20) return 'bad'
  if (v < 40) return 'warn'
  return ''
}
</script>

<template>
  <div class="status-panel">
    <div v-for="s in stats" :key="s.key" class="stat" :class="level(s.value)">
      <div class="stat-head">
        <span>{{ s.icon }} {{ s.label }}</span>
        <b>{{ Math.round(s.value) }}</b>
      </div>
      <div class="bar"><i :style="{ width: `${Math.max(2, s.value)}%` }" /></div>
    </div>

    <div class="growth-row">
      <span>🌱 <b>{{ species.name }}</b> · {{ stageLabel }} · 陪你 {{ ageText }}</span>
      <span>{{ lifeLabel }}</span>
    </div>
  </div>
</template>
