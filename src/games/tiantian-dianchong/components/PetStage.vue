<script setup>
// ============ 舞台：电子宠物机的「屏幕」 ============
// 场景背景 + 宠物 + 心声气泡 + 状态胶囊 + 睡眠 Zzz / 病标。
import { computed } from 'vue'
import SceneBackdrop from './SceneBackdrop.vue'
import PetAvatar from './PetAvatar.vue'

const props = defineProps({
  scene: { type: Object, required: true },
  night: { type: Boolean, default: false },
  species: { type: Object, required: true },
  stageKey: { type: String, default: 'adult' },
  mood: { type: Number, default: 70 },
  behavior: { type: String, default: 'idle' },
  dead: { type: Boolean, default: false },
  coma: { type: Boolean, default: false },
  asleep: { type: Boolean, default: false },
  illness: { type: Object, default: null },
  risk: { type: String, default: 'ok' },
  bubble: { type: Object, default: null }, // { text, ai }
  clockText: { type: String, default: '' },
  petName: { type: String, default: '' }
})

const emit = defineEmits(['touch-pet'])

const chips = computed(() => {
  const list = []
  if (props.clockText) list.push({ cls: '', text: props.clockText })
  if (props.dead) list.push({ cls: 'bad', text: '回到星尘' })
  else if (props.coma) list.push({ cls: 'bad', text: '昏迷中 · 需要照料' })
  if (props.illness && !props.dead) list.push({ cls: 'warn', text: `生病 · ${props.illness.name}` })
  if (!props.dead && !props.coma && props.risk === 'critical') list.push({ cls: 'bad', text: '状态危急' })
  return list
})
</script>

<template>
  <div class="screen" @click.self="$emit('touch-pet')">
    <SceneBackdrop :scene="scene" :night="night" />

    <!-- 顶部状态胶囊 -->
    <div class="chips">
      <span v-for="(c, i) in chips" :key="i" class="chip" :class="c.cls">{{ c.text }}</span>
    </div>

    <!-- 心声气泡 -->
    <transition name="fade">
      <div v-if="bubble?.text" class="bubble" :class="{ 'ai-say': bubble.ai }">{{ bubble.text }}</div>
    </transition>

    <!-- 病标 / 昏迷标 -->
    <div v-if="illness && !dead" class="sick-pop">🤒</div>

    <!-- 宠物 -->
    <div class="pet-wrap" @click.stop="$emit('touch-pet')" :title="dead ? '' : `摸摸 ${petName}`">
      <PetAvatar
        :species="species"
        :stage-key="stageKey"
        :mood="mood"
        :behavior="behavior"
        :dead="dead"
        :coma="coma"
        :asleep="asleep"
        :illness="illness"
      />
    </div>

    <!-- 睡眠 Zzz -->
    <template v-if="asleep && !dead">
      <span class="zzz z1">z</span>
      <span class="zzz z2">Z</span>
      <span class="zzz z3">z</span>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active {
  animation: bubbleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-leave-active {
  transition: opacity 0.4s;
}
.fade-leave-to {
  opacity: 0;
}
</style>
