<script setup>
// ============ 舞台：电子宠物机的「屏幕」 ============
// 场景背景 + 骨骼动画画布（spine-webgl）+ 心声气泡 + 状态胶囊 + Zzz/病标。
// WebGL 不可用时自动降级为参数化 SVG 宠物（PetAvatar），玩法不受影响。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SceneBackdrop from './SceneBackdrop.vue'
import PetAvatar from './PetAvatar.vue'
import { createSpinePetPlayer } from '../spine/SpinePetPlayer.js'

const props = defineProps({
  scene: { type: Object, required: true },
  night: { type: Boolean, default: false },
  species: { type: Object, required: true },
  stageKey: { type: String, default: 'adult' },
  mood: { type: Number, default: 70 },
  behavior: { type: String, default: 'idle' }, // SVG 降级模式的行为
  dead: { type: Boolean, default: false },
  coma: { type: Boolean, default: false },
  asleep: { type: Boolean, default: false },
  illness: { type: Object, default: null },
  risk: { type: String, default: 'ok' },
  bubble: { type: Object, default: null }, // { text, ai }
  clockText: { type: String, default: '' },
  petName: { type: String, default: '' }
})

const emit = defineEmits(['touch-pet', 'spine-ready'])

const canvasEl = ref(null)
const spineMode = ref(false)
const player = createSpinePetPlayer()
let resizeObserver = null

const chips = computed(() => {
  const list = []
  if (props.clockText) list.push({ cls: '', text: props.clockText })
  if (props.dead) list.push({ cls: 'bad', text: '回到星尘' })
  else if (props.coma) list.push({ cls: 'bad', text: '昏迷中 · 需要照料' })
  if (props.illness && !props.dead) list.push({ cls: 'warn', text: `生病 · ${props.illness.name}` })
  if (!props.dead && !props.coma && props.risk === 'critical') list.push({ cls: 'bad', text: '状态危急' })
  return list
})

onMounted(async () => {
  // 画布常驻渲染（透明画布在 WebGL 失败时本就不可见，避免 v-show 隐藏导致初始尺寸为 0）
  const ok = player.init(canvasEl.value)
  if (ok) {
    spineMode.value = true
    await player.setSpecies(props.species)
    player.setStageConfig({ groundY: props.scene?.groundY ?? 0.76 })
    player.setAmbient({ stageKey: props.stageKey, illness: props.illness, dead: props.dead })
    // 尺寸自适应：观察画布自身（随布局/旋转变化）+ 初始化后的下一帧校准
    resizeObserver = new ResizeObserver(() => player.resize())
    resizeObserver.observe(canvasEl.value)
    requestAnimationFrame(() => player.resize())
    emit('spine-ready', player)
  }
  // WebGL 不可用：spineMode 保持 false，模板渲染 SVG 降级
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  player.dispose()
})

// ---- 环境态与场景联动 ----
watch(
  () => props.species,
  (sp) => {
    if (spineMode.value && sp) player.setSpecies(sp)
  }
)
watch(
  () => [props.stageKey, props.illness, props.dead],
  ([stageKey, illness, dead]) => {
    if (spineMode.value) player.setAmbient({ stageKey, illness, dead })
  }
)
watch(
  () => props.scene,
  (sc) => {
    if (spineMode.value) player.setStageConfig({ groundY: sc?.groundY ?? 0.76 })
  }
)
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

    <!-- 骨骼动画画布（WebGL；透明画布常驻，无内容时不可见） -->
    <canvas
      ref="canvasEl"
      class="pet-canvas"
      :title="dead ? '' : `摸摸 ${petName}`"
      @click.stop="$emit('touch-pet')"
    />

    <!-- SVG 降级宠物（WebGL 不可用） -->
    <div v-if="!spineMode" class="pet-wrap" @click.stop="$emit('touch-pet')" :title="dead ? '' : `摸摸 ${petName}`">
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
