<script setup>
// ============ 天天电宠 · 应用编排 ============
// 生命循环（每秒按真实时间差结算）+ 行为循环（随机 / AI 双生命系统）+
// 持久化（5s 防抖 + 离开页面即存）+ 存档导入导出 + 离线结算摘要 + 死亡纪念。
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import PetStage from './components/PetStage.vue'
import StatusPanel from './components/StatusPanel.vue'
import ActionBar from './components/ActionBar.vue'
import LogPanel from './components/LogPanel.vue'
import SettingsModal from './components/SettingsModal.vue'
import AdoptScreen from './components/AdoptScreen.vue'

import { advance, offlineSummary, riskLevel, isAsleep, stageOf } from './core/life.js'
import { decideRandom } from './core/randomLife.js'
import { decideAi } from './core/ai/life.js'
import { performAction } from './core/actions.js'
import { getSpecies } from './core/species.js'
import { getScene, sceneList } from './core/scenes.js'
import {
  loadSave, persistSave, newSave, clearSave, pushLog, exportSave, parseImportedSave,
  loadAiConfig, saveAiConfig, getApiKey, setApiKey, hasApiKey
} from './core/storage.js'
import { fmtGameTime, periodNow, dayOf } from './core/time.js'

// ---- 全局状态 ----
const save = ref(null)
const customSpeciesLib = ref({}) // 重新领养时保留已生成物种库
const currentBehavior = ref('idle')
const bubble = ref(null)
const toasts = ref([])
const settingsOpen = ref(false)
const welcome = ref(null)
const cooldownRest = ref({})
const aiCfg = ref(loadAiConfig())
const aiKeyTick = ref(0)

let tid = 0
let bubbleTimer = null
let lifeTimer = null
let persistTimer = null
let behaviorTimer = null
let aiFailCount = 0
let aiCooldownUntil = 0
let lastTouchAt = 0

// ---- 派生视图 ----
const pet = computed(() => save.value?.pet)
const species = computed(() =>
  save.value ? getSpecies(save.value.pet.speciesId, save.value.customSpecies) : null
)
const scene = computed(() =>
  save.value ? getScene(save.value.settings.sceneId, save.value.customScenes) : null
)
const night = computed(() => {
  if (!save.value) return false
  return !!scene.value?.night || periodNow(save.value.gameClock).night
})
const stage = computed(() => (save.value ? stageOf(save.value.pet.growth) : { key: 'baby', label: '幼年' }))
const asleep = computed(() =>
  save.value && species.value ? isAsleep(save.value.pet, species.value, save.value.gameClock) : false
)
const risk = computed(() => (save.value ? riskLevel(save.value.pet) : 'ok'))
const clockText = computed(() => (save.value ? fmtGameTime(save.value.gameClock) : ''))
const ageText = computed(() =>
  save.value ? `${Math.max(1, dayOf(save.value.gameClock - save.value.pet.bornClock))} 天` : ''
)
const lifeLabel = computed(() => {
  if (!save.value) return ''
  if (save.value.pet.dead) return '🕯️ 已回到星尘'
  if (save.value.pet.coma) return '💤 昏迷中'
  return save.value.settings.lifeSystem === 'ai' ? '🤖 AI 生命中' : '🎲 随机生命中'
})
const scenes = computed(() => (save.value ? sceneList(save.value.customScenes) : []))
const aiReady = computed(() => {
  aiKeyTick.value // 依赖刷新
  return !!(save.value?.ai?.baseUrl && save.value?.ai?.model && hasApiKey())
})

// ---- Toast ----
function toast(text, kind = '') {
  const id = ++tid
  toasts.value.push({ id, text, kind })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 3400)
}

// ---- 心声气泡 ----
function setBubble(text, ai = false) {
  if (!text) return
  bubble.value = { text, ai }
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubble.value = null
  }, 3800)
}

// ---- 生命循环：每秒按真实时间差结算 ----
function lifeTick() {
  const s = save.value
  if (!s) return
  const events = advance(s, Date.now())
  if (events.length) handleEvents(events)
  refreshCooldowns()
}

function handleEvents(events) {
  const s = save.value
  for (const e of events) {
    pushLog(s, e)
    if (['coma', 'dead', 'wake', 'grow', 'sick', 'starving'].includes(e.kind)) {
      toast(e.text, e.kind === 'dead' ? 'bad' : e.kind === 'grow' || e.kind === 'wake' ? '' : 'warn')
    }
  }
}

function refreshCooldowns() {
  const s = save.value
  if (!s) return
  const clock = s.gameClock
  const scale = s.settings.timeScale || 1
  const map = {}
  for (const [k, until] of Object.entries(s.pet.cooldowns || {})) {
    const rest = until - clock
    if (rest > 0) map[k] = rest / scale
  }
  cooldownRest.value = map
}

// ---- 行为循环：随机 / AI 双生命系统 ----
function scheduleBehavior() {
  clearTimeout(behaviorTimer)
  const delay = 6000 + Math.random() * 8000
  behaviorTimer = setTimeout(async () => {
    await decideBehavior()
    scheduleBehavior()
  }, delay)
}

async function decideBehavior() {
  const s = save.value
  if (!s || s.pet.dead || document.hidden) return
  const sp = getSpecies(s.pet.speciesId, s.customSpecies)
  if (!sp) return
  const clock = s.gameClock

  if (s.settings.lifeSystem === 'ai' && aiReady.value) {
    if (Date.now() < aiCooldownUntil) {
      applyBehavior(decideRandom(s.pet, sp, clock), false)
      return
    }
    const r = await decideAi(s.pet, sp, clock, { baseUrl: s.ai.baseUrl, apiKey: getApiKey(), model: s.ai.model }, {
      recentEvents: s.log
    })
    if (r.source === 'ai') {
      aiFailCount = 0
    } else {
      aiFailCount++
      if (aiFailCount >= 3) aiCooldownUntil = Date.now() + 60000
    }
    applyBehavior(r, r.source === 'ai')
  } else {
    applyBehavior(decideRandom(s.pet, sp, clock), false)
  }
}

function applyBehavior({ behavior, say }, ai) {
  currentBehavior.value = behavior
  setBubble(say, ai)
}

// ---- 玩家操作 ----
function onAct(actionId) {
  const s = save.value
  if (!s || s.pet.dead) return
  const sp = getSpecies(s.pet.speciesId, s.customSpecies)
  if (!sp) return
  const r = performAction(s.pet, sp, actionId, s.gameClock)
  if (r.event?.text) pushLog(s, r.event)
  if (r.ok) {
    setBubble(r.message)
    if (actionId === 'play') currentBehavior.value = 'play'
    if (actionId === 'sleep') currentBehavior.value = 'sleep'
    persistSave(s)
  } else {
    toast(r.message, 'warn')
  }
  refreshCooldowns()
}

// ---- 摸头彩蛋 ----
function onTouchPet() {
  const s = save.value
  if (!s || s.pet.dead || s.pet.coma) return
  const now = Date.now()
  if (now - lastTouchAt < 15000) {
    setBubble('（舒服地眯起了眼）')
    return
  }
  lastTouchAt = now
  s.pet.mood = Math.min(100, s.pet.mood + 2)
  pushLog(s, { t: s.gameClock, kind: 'touch', text: `你摸了摸 ${s.pet.name} 的头`, icon: '🤚' })
  setBubble('（开心地蹭了蹭你的手心）')
  currentBehavior.value = 'beg'
}

// ---- 领养 ----
function onAdopt({ speciesId, name }) {
  beginLife(newSave({ speciesId, name }), name)
}

function onAdoptCustom({ species: sp, name }) {
  const lib = { ...customSpeciesLib.value, [sp.id]: sp }
  customSpeciesLib.value = lib
  const s = newSave({ speciesId: sp.id, name })
  s.customSpecies = lib
  beginLife(s, name)
}

function beginLife(s, name) {
  // 保留「环境资产」：AI 配置与已生成物种 / 场景库
  s.ai = save.value?.ai || s.ai
  if (!Object.keys(s.customSpecies || {}).length) {
    s.customSpecies = customSpeciesLib.value
  } else {
    customSpeciesLib.value = s.customSpecies
  }
  s.customScenes = save.value?.customScenes || {}
  pushLog(s, { t: 0, kind: 'adopt', text: `${name} 来到了你的设备里`, icon: '🏠' })
  save.value = reactive(s)
  persistSave(s)
  startLoops()
  toast(`欢迎回家，${name}！`)
}

// ---- 设置事件 ----
function onTimescale(v) {
  const s = save.value
  if (!s) return
  advance(s, Date.now()) // 先按旧速率结算，避免跳变
  s.settings.timeScale = v
  persistSave(s)
  toast('时间流速已切换')
}

function onLife(v) {
  const s = save.value
  if (!s) return
  if (v === 'ai' && !aiReady.value) {
    toast('请先完成 AI 智能体配置', 'warn')
    return
  }
  s.settings.lifeSystem = v
  persistSave(s)
  toast(v === 'ai' ? 'AI 智能体生命系统已接管' : '已切换为随机生命系统')
}

function onSaveAi(cfg) {
  saveAiConfig({ baseUrl: cfg.baseUrl, model: cfg.model })
  if (cfg.apiKey) setApiKey(cfg.apiKey)
  aiCfg.value = { baseUrl: cfg.baseUrl, model: cfg.model }
  if (save.value) {
    save.value.ai = { baseUrl: cfg.baseUrl, model: cfg.model }
    persistSave(save.value)
  }
  aiKeyTick.value++
  toast('AI 配置已保存')
}

// ---- 导入导出 ----
function doExport() {
  const s = save.value
  if (!s) return
  const { text, filename } = exportSave(s)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  toast(`存档已导出：${filename}`)
}

async function doImport(file) {
  let text
  try {
    text = await file.text()
  } catch {
    toast('文件读取失败', 'bad')
    return
  }
  const r = parseImportedSave(text)
  if (!r.ok) {
    toast(r.error, 'bad')
    return
  }
  if (save.value && !confirm(`导入「${r.save.pet.name}」将覆盖当前的 ${save.value.pet.name}，确定吗？`)) return
  const s = reactive(r.save)
  const events = advance(s, Date.now())
  save.value = s
  persistSave(s)
  startLoops()
  for (const e of events) pushLog(s, e)
  toast(`「${s.pet.name}」回来了！`)
}

function doReset() {
  if (!confirm('重新领养会送别当前的它，存档将被清空（建议先导出备份）。确定吗？')) return
  stopLoops()
  // 保留自定义物种库，领养页仍可选择
  customSpeciesLib.value = save.value?.customSpecies || customSpeciesLib.value
  clearSave()
  save.value = null
  welcome.value = null
  settingsOpen.value = false
}

// ---- 循环管理 ----
function startLoops() {
  stopLoops()
  lifeTimer = setInterval(lifeTick, 1000)
  persistTimer = setInterval(() => {
    if (save.value) persistSave(save.value)
  }, 5000)
  scheduleBehavior()
}

function stopLoops() {
  clearInterval(lifeTimer)
  clearInterval(persistTimer)
  clearTimeout(behaviorTimer)
}

function onVisibility() {
  if (document.hidden && save.value) persistSave(save.value)
}

// ---- 挂载：载入存档 → 离线结算 → 欢迎回来 ----
onMounted(async () => {
  const loaded = loadSave()
  if (!loaded) return
  const s = reactive(loaded)
  const realNow = Date.now()
  const events = advance(s, realNow)
  save.value = s
  for (const e of events) pushLog(s, e)

  const sum = offlineSummary(s, events, realNow)
  if (sum) {
    welcome.value = {
      title: `欢迎回来 · ${sum.title}`,
      detail: sum.detail,
      events: events.slice(-6)
    }
  }
  persistSave(s)
  startLoops()

  if (s.pet.dead) {
    toast(`${s.pet.name} 已经回到了星尘……`, 'bad')
  }
})

onBeforeUnmount(() => {
  stopLoops()
  if (save.value) persistSave(save.value)
  document.removeEventListener('visibilitychange', onVisibility)
})

document.addEventListener('visibilitychange', onVisibility)
window.addEventListener('beforeunload', () => {
  if (save.value) persistSave(save.value)
})
</script>

<template>
  <div class="app-shell">
    <!-- Toast -->
    <div class="toasts">
      <transition-group name="fade">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
      </transition-group>
    </div>

    <!-- 领养页 -->
    <AdoptScreen
      v-if="!save"
      :custom-species-lib="customSpeciesLib"
      :ai-cfg="aiCfg"
      @adopt="onAdopt"
      @adopt-custom="onAdoptCustom"
    />

    <!-- 主界面 -->
    <div v-else class="page">
      <div class="topbar">
        <div class="title">
          <h1>天天电宠</h1>
          <span class="sub">{{ pet.name }} · {{ species?.name }}</span>
        </div>
        <button class="icon-btn" type="button" aria-label="设置" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div class="device" :class="{ dead: pet.dead }">
        <PetStage
          :scene="scene"
          :night="night"
          :species="species"
          :stage-key="stage.key"
          :mood="pet.mood"
          :behavior="currentBehavior"
          :dead="pet.dead"
          :coma="pet.coma"
          :asleep="asleep"
          :illness="pet.illness"
          :risk="risk"
          :bubble="bubble"
          :clock-text="clockText"
          :pet-name="pet.name"
          @touch-pet="onTouchPet"
        />

        <StatusPanel
          :pet="pet"
          :species="species"
          :stage-label="stage.label"
          :age-text="ageText"
          :life-label="lifeLabel"
        />

        <ActionBar :cooldowns="cooldownRest" :dead="pet.dead" :coma="pet.coma" @act="onAct" />
      </div>

      <LogPanel :log="save.log" />

      <!-- 死亡纪念 -->
      <div v-if="pet.dead" class="overlay">
        <div class="modal memorial">
          <div class="m-emoji">🕯️</div>
          <h2>{{ pet.name }} 回到了星尘</h2>
          <p>它陪伴了你 {{ ageText }}，从一只小小 {{ species?.name }} 长成{{ stage.label }}的模样。</p>
          <p>日志里还留着它的故事。若想再养一只，随时重新领养。</p>
          <div class="modal-actions" style="justify-content: center">
            <button class="btn ghost" type="button" @click="doExport">导出纪念存档</button>
            <button class="btn danger" type="button" @click="doReset">重新领养</button>
          </div>
        </div>
      </div>

      <!-- 欢迎回来（离线摘要） -->
      <div v-if="welcome && !pet.dead" class="overlay" @click.self="welcome = null">
        <div class="modal">
          <h2>{{ welcome.title }}</h2>
          <p class="modal-sub">{{ welcome.detail }}</p>
          <div class="log-list" style="margin: 8px 0">
            <div v-for="(e, i) in welcome.events" :key="i" class="log-item">
              <span class="log-icon">{{ e.icon }}</span>
              <span class="log-text">{{ e.text }}</span>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn primary" type="button" @click="welcome = null">回到它身边</button>
          </div>
        </div>
      </div>

      <!-- 设置 -->
      <SettingsModal
        v-if="settingsOpen"
        :save="save"
        :scenes="scenes"
        :ai-cfg="aiCfg"
        @close="settingsOpen = false"
        @change="persistSave(save)"
        @timescale="onTimescale"
        @life="onLife"
        @save-ai="onSaveAi"
        @export="doExport"
        @import="doImport"
        @reset="doReset"
      />
    </div>
  </div>
</template>
