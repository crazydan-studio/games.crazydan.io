<script setup>
// ============ 舞台：3D 电宠的「游乐场」 ============
// Babylon.js 3D 画布（宠物模型 + 场景道具 + 投掷物理）+ 心声气泡 + 状态胶囊 +
// Zzz/病标 + 道具坞（拖拽投掷）+ 全屏按钮 + 加载等待遮罩。
// 不做降级/回退：始终采用指定建模渲染；模型与场景加载完毕前显示等待遮罩，
// 加载失败时遮罩转为错误提示（不回退 SVG）。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ItemDock from './ItemDock.vue'
import { createB3dPetPlayer } from '../b3d/PetPlayer3D.js'

const props = defineProps({
  scene: { type: Object, required: true },
  night: { type: Boolean, default: false },
  species: { type: Object, required: true },
  stageKey: { type: String, default: 'adult' },
  mood: { type: Number, default: 70 },
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
// 3D 就绪状态：loading → ready | error（加载完毕前等待遮罩常驻）
const loadState = ref('loading')
const loadError = ref('')
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
  // 画布常驻渲染（等待遮罩覆盖期间不暴露半成品画面）
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
      // 物种建模加载（无回退：失败即错误遮罩，不降级）
      ok = await player.setSpecies(props.species)
      if (ok) await player.setStageConfig({ scene: props.scene, night: props.night })
    }
  } catch (e) {
    console.error('[dianchong] 3D 初始化失败（不做降级）：', e)
    ok = false
    loadError.value = String(e?.message || e)
  }
  if (ok) {
    loadState.value = 'ready'
    player.setAmbient({ stageKey: props.stageKey, illness: props.illness, dead: props.dead })
    // 尺寸自适应：观察画布自身（随布局/旋转/全屏变化）
    resizeObserver = new ResizeObserver(() => player.resize())
    resizeObserver.observe(canvasEl.value)
    requestAnimationFrame(() => player.resize())
    emit('bones-ready', player)
  } else {
    // WebGL 或指定建模不可用：错误遮罩（不降级、不换模型）
    loadState.value = 'error'
    if (!loadError.value) {
      loadError.value = '3D 引擎初始化失败，当前环境不支持 WebGL'
    }
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  player.dispose()
})

// ---- 环境态与场景联动 ----
watch(
  () => props.species,
  (sp) => {
    if (loadState.value === 'ready' && sp) player.setSpecies(sp)
  }
)
watch(
  () => [props.stageKey, props.illness, props.dead],
  ([stageKey, illness, dead]) => {
    if (loadState.value === 'ready') player.setAmbient({ stageKey, illness, dead })
  }
)
watch(
  () => [props.scene, props.night],
  ([sc, night]) => {
    if (loadState.value === 'ready') player.setStageConfig({ scene: sc, night })
  }
)

function onDockDragStart(itemId) {
  player.setDragging(itemId)
}

// 错误遮罩的刷新重试：整页重载，重新走加载流程
function reload() {
  window.location.reload()
}
</script>

<template>
  <div class="screen b3d" :class="{ 'is-fullscreen': fullscreen }">
    <!-- 3D 画布（Babylon.js：宠物/场景/物理投掷，始终渲染） -->
    <canvas
      ref="canvasEl"
      class="pet-canvas"
      :title="dead ? '' : `轻点 ${petName} 摸摸它 · 轻点地面让它走过去`"
    />

    <!-- 加载等待遮罩：建模与场景加载完毕前常驻；失败转为错误提示（无降级） -->
    <transition name="fade">
      <div v-if="loadState !== 'ready'" class="load-mask" role="status">
        <template v-if="loadState === 'loading'">
          <span class="load-spinner" aria-hidden="true"></span>
          <p class="load-title">正在搭建 3D 世界…</p>
          <p class="load-sub">加载{{ species?.name || '宠物' }}的建模与场景</p>
        </template>
        <template v-else>
          <span class="load-emoji" aria-hidden="true">😿</span>
          <p class="load-title">3D 世界加载失败</p>
          <p class="load-sub">{{ loadError }}</p>
          <button class="load-retry" type="button" @click="() => reload()">刷新重试</button>
        </template>
      </div>
    </transition>

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

    <!-- 道具坞：拖拽投掷（3D 就绪后可用） -->
    <ItemDock
      v-if="loadState === 'ready' && !dead"
      :disabled="coma"
      :cooldowns="cooldowns"
      @drag-start="onDockDragStart"
    />

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

<style>
/* 加载等待遮罩（全局样式：b3d 组件样式表中已有 .screen 定义） */
.load-mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(180deg, rgba(8, 24, 26, 0.88), rgba(4, 14, 16, 0.94));
  color: #d7fff2;
  text-align: center;
  padding: 24px;
}

.load-spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 4px solid rgba(64, 224, 180, 0.25);
  border-top-color: #40e0b4;
  animation: spin 0.9s linear infinite;
  margin-bottom: 6px;
}

.load-emoji {
  font-size: 42px;
  margin-bottom: 2px;
}

.load-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.load-sub {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.75;
  max-width: 320px;
  line-height: 1.6;
}

.load-retry {
  margin-top: 10px;
  padding: 8px 22px;
  border: 1.5px solid #40e0b4;
  border-radius: 999px;
  background: transparent;
  color: #40e0b4;
  font-weight: 700;
  cursor: pointer;
}

.load-retry:hover {
  background: rgba(64, 224, 180, 0.12);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
