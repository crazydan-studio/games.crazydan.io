<script setup>
// ============ 舞台：3D 电宠的「游乐场」 ============
// Babylon.js 3D 画布（宠物模型 + 场景道具 + 投掷物理）+ 心声气泡 + 状态胶囊 +
// Zzz/病标 + 道具坞（拖拽投掷）+ 全屏按钮。
// WebGL 不可用时自动降级为参数化 SVG 宠物（PetAvatar + SceneBackdrop），玩法不受影响。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SceneBackdrop from './SceneBackdrop.vue'
import PetAvatar from './PetAvatar.vue'
import ItemDock from './ItemDock.vue'
import { createB3dPetPlayer } from '../b3d/PetPlayer3D.js'

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
  petName: { type: String, default: '' },
  fullscreen: { type: Boolean, default: false },
  cooldowns: { type: Object, default: () => ({}) } // 投掷道具对应操作的冷却
})

const emit = defineEmits([
  'touch-pet', 'bones-ready', 'ground-click', 'item-landed', 'toggle-fullscreen'
])

const canvasEl = ref(null)
const bonesMode = ref(false)
const player = createB3dPetPlayer()
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
  let ok = false
  try {
    ok = await player.init(canvasEl.value)
    if (ok) {
      // 3D 交互桥接：轻点宠物=抚摸 / 轻点地面=走过去 / 投掷物落地=喂食或玩耍
      player.setInteractHandlers({
        onPetTouch: () => emit('touch-pet'),
        onGroundClick: (x) => emit('ground-click', x),
        onItemLanded: (info) => emit('item-landed', info)
      })
      // 宠物模型加载失败（资产缺失/损坏/断网首访）→ 整体降级 SVG，玩法不受影响
      ok = await player.setSpecies(props.species)
    }
  } catch (e) {
    console.warn('[dianchong] 3D 初始化失败，降级 SVG：', e)
    ok = false
  }
  if (ok) {
    bonesMode.value = true
    await player.setStageConfig({ scene: props.scene, night: props.night })
    player.setAmbient({ stageKey: props.stageKey, illness: props.illness, dead: props.dead })
    // 尺寸自适应：观察画布自身（随布局/旋转/全屏变化）
    resizeObserver = new ResizeObserver(() => player.resize())
    resizeObserver.observe(canvasEl.value)
    requestAnimationFrame(() => player.resize())
    emit('bones-ready', player)
  } else {
    player.dispose()
  }
  // WebGL 或模型不可用：bonesMode 保持 false，模板渲染 SVG 降级
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  player.dispose()
})

// ---- 环境态与场景联动 ----
watch(
  () => props.species,
  (sp) => {
    if (bonesMode.value && sp) player.setSpecies(sp)
  }
)
watch(
  () => [props.stageKey, props.illness, props.dead],
  ([stageKey, illness, dead]) => {
    if (bonesMode.value) player.setAmbient({ stageKey, illness, dead })
  }
)
watch(
  () => [props.scene, props.night],
  ([sc, night]) => {
    if (bonesMode.value) player.setStageConfig({ scene: sc, night })
  }
)

function onDockDragStart(itemId) {
  player.setDragging(itemId)
}
</script>

<template>
  <div class="screen b3d" :class="{ 'is-fullscreen': fullscreen }">
    <!-- 3D 画布（Babylon.js：宠物/场景/物理投掷；SVG 降级时透明不可见） -->
    <canvas
      ref="canvasEl"
      class="pet-canvas"
      :title="dead ? '' : `轻点 ${petName} 摸摸它 · 轻点地面让它走过去`"
    />

    <!-- SVG 降级背景（WebGL 不可用） -->
    <SceneBackdrop v-if="!bonesMode" :scene="scene" :night="night" />

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

    <!-- 全屏按钮（常见游戏交互模式：全屏沉浸玩耍） -->
    <button
      class="fullscreen-btn"
      type="button"
      :title="fullscreen ? '退出全屏' : '全屏玩耍'"
      @click.stop="$emit('toggle-fullscreen')"
    >
      {{ fullscreen ? '✕' : '⛶' }}
    </button>

    <!-- 道具坞：拖拽投掷（3D 模式专属交互） -->
    <ItemDock
      v-if="bonesMode && !dead"
      :disabled="coma"
      :cooldowns="cooldowns"
      @drag-start="onDockDragStart"
    />

    <!-- SVG 降级宠物（WebGL 不可用） -->
    <div v-if="!bonesMode" class="pet-wrap" :title="dead ? '' : `摸摸 ${petName}`">
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
