<script setup>
// ============ 领养页：选物种（含 AI 生成新物种）+ 取名 + 开局 ============
import { ref, computed } from 'vue'
import PetAvatar from './PetAvatar.vue'
import AiAuditPanel from './AiAuditPanel.vue'
import { speciesList, speciesSummary, BUILTIN_SPECIES } from '../core/species.js'
import { generateSpeciesByAi } from '../core/ai/species.js'
import { hasApiKey } from '../core/storage.js'

const props = defineProps({
  customSpeciesLib: { type: Object, default: () => ({}) },
  aiCfg: { type: Object, default: () => ({ baseUrl: '', model: '' }) }
})

const emit = defineEmits(['adopt', 'adopt-custom'])

const species = computed(() => speciesList(props.customSpeciesLib))
const selectedId = ref('cat')
const petName = ref('')

const selected = computed(
  () => species.value.find((s) => s.id === selectedId.value) || BUILTIN_SPECIES.cat
)

const nameValid = computed(() => petName.value.trim().length >= 1 && petName.value.trim().length <= 8)

// ---- AI 生成新物种 ----
const aiOpen = ref(false)
const aiName = ref('')
const aiIdea = ref('')
const aiBusy = ref(false)
const aiErr = ref('')
const aiDraft = ref(null) // { species } 待采用预览
const auditOpen = ref(false) // AI 调用记录面板

async function genSpecies() {
  if (aiBusy.value) return
  aiErr.value = ''
  if (!aiName.value.trim()) {
    aiErr.value = '先给它起个名字吧'
    return
  }
  aiBusy.value = true
  const key = hasApiKey()
  const r = await generateSpeciesByAi(
    { name: aiName.value.trim(), idea: aiIdea.value.trim() },
    { baseUrl: props.aiCfg.baseUrl, apiKey: key, model: props.aiCfg.model }
  )
  aiBusy.value = false
  if (!r.ok) {
    aiErr.value = r.error
    return
  }
  aiDraft.value = r.species
}

function useDraft() {
  if (!aiDraft.value) return
  emit('adopt-custom', { species: aiDraft.value, name: (petName.value.trim() || aiName.value.trim()).slice(0, 8) })
}

function adoptNow() {
  if (!nameValid.value) return
  emit('adopt', { speciesId: selected.value.id, name: petName.value.trim().slice(0, 8) })
}
</script>

<template>
  <div class="page">
    <div class="adopt-hero">
      <div class="hero-egg" aria-hidden="true">
        <svg viewBox="0 0 100 100" width="86" height="86" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 6 C74 6 88 34 88 58 a38 38 0 0 1 -76 0 C12 34 26 6 50 6 Z" fill="#DFF6EE" stroke="#26B99A" stroke-width="4" />
          <path d="M34 30 q8 -8 16 0" stroke="#26B99A" stroke-width="4" fill="none" stroke-linecap="round" />
          <path d="M50 30 q8 -8 16 0" stroke="#26B99A" stroke-width="4" fill="none" stroke-linecap="round" />
          <path d="M42 46 q8 8 16 0" stroke="#1B9379" stroke-width="4" fill="none" stroke-linecap="round" />
        </svg>
      </div>
      <h1>天天电宠</h1>
      <p>领养一只住在电波里的小伙伴，它会饿、会困、会撒娇，也会慢慢长大</p>
    </div>

    <!-- 物种选择 -->
    <div class="species-grid">
      <button
        v-for="s in species"
        :key="s.id"
        class="species-card"
        :class="{ active: selectedId === s.id }"
        type="button"
        @click="selectedId = s.id"
      >
        <div class="sp-face">
          <PetAvatar :species="s" stage-key="adult" :mood="85" behavior="idle" />
        </div>
        <h3>{{ s.emoji }} {{ s.name }}</h3>
        <p class="sp-summary">{{ speciesSummary(s) }}</p>
        <p class="sp-intro">{{ s.intro }}</p>
        <div class="sp-tags">
          <span v-for="t in s.personality" :key="t" class="tag">{{ t }}</span>
        </div>
      </button>
    </div>

    <!-- 取名 + 开始 -->
    <div class="adopt-form">
      <div class="field">
        <label>给它取个名字（{{ selected.name }}，最多 8 个字）</label>
        <input v-model="petName" maxlength="8" placeholder="比如：天天" @keyup.enter="adoptNow" />
      </div>
      <div class="adopt-actions">
        <button class="btn primary" type="button" :disabled="!nameValid" @click="adoptNow">
          带它回家 🏠
        </button>
        <button class="btn ghost" type="button" @click="aiOpen = !aiOpen">
          ✨ AI 生成新物种
        </button>
      </div>

      <!-- AI 物种设计器 -->
      <div v-if="aiOpen" class="ai-panel">
        <div class="ai-head">
          <span>🧬 AI 物种设计器</span>
          <span class="ai-head-right">
            <span class="ai-status" :class="aiCfg.baseUrl ? 'ok' : 'err'">
              {{ aiCfg.baseUrl ? 'AI 已配置' : '未配置（可在领养后于设置中配置）' }}
            </span>
            <button class="btn tiny ghost" type="button" @click="auditOpen = true">🧾 记录</button>
          </span>
        </div>
        <p class="hint" style="margin: 6px 0 8px">
          描述一个你想要的物种，AI 会为它设计完整的生命系统、行为模式与外形（需要已配置 AI 智能体）
        </p>
        <div class="field">
          <label>物种名</label>
          <input v-model="aiName" maxlength="6" placeholder="例如：火狐狸" />
        </div>
        <div class="field">
          <label>灵感描述</label>
          <input v-model="aiIdea" maxlength="60" placeholder="例如：尾巴燃着暖火、热情但怕水" @keyup.enter="genSpecies" />
        </div>
        <div class="adopt-actions">
          <button class="btn tiny primary" type="button" :disabled="aiBusy" @click="genSpecies">
            {{ aiBusy ? '生成中……' : '开始设计' }}
          </button>
        </div>
        <p v-if="aiErr" class="ai-status err">{{ aiErr }}</p>

        <!-- 生成结果预览 -->
        <div v-if="aiDraft" class="species-card active" style="margin-top: 10px; cursor: default">
          <div class="sp-face">
            <PetAvatar :species="aiDraft" stage-key="adult" :mood="80" behavior="idle" />
          </div>
          <h3>{{ aiDraft.emoji }} {{ aiDraft.name }}</h3>
          <p class="sp-summary">{{ speciesSummary(aiDraft) }}</p>
          <p class="sp-intro">{{ aiDraft.intro }}</p>
          <div class="sp-tags">
            <span v-for="t in aiDraft.personality" :key="t" class="tag">{{ t }}</span>
          </div>
          <div class="adopt-actions" style="justify-content: center">
            <button class="btn tiny primary" type="button" @click="useDraft">就它了，带回家</button>
            <button class="btn tiny ghost" type="button" @click="genSpecies">重新生成</button>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 调用记录（调试）：生成失败时可在此查阅完整提示词与输出 -->
    <AiAuditPanel v-if="auditOpen" @close="auditOpen = false" />
  </div>
</template>
