<script setup>
// ============ 设置弹窗 ============
// 时间流速 / 生死开关 / 生命系统（随机·AI）/ AI 智能体配置 /
// 场景切换 / 数据导出导入 / 重新领养
import { ref, computed, watch } from 'vue'
import { TIME_SCALES } from '../core/time.js'
import { testAiConnection } from '../core/ai/provider.js'
import { hasApiKey, getApiKey } from '../core/storage.js'

const props = defineProps({
  save: { type: Object, required: true },
  scenes: { type: Array, default: () => [] },
  aiCfg: { type: Object, default: () => ({ baseUrl: '', model: '' }) }
})

const emit = defineEmits(['close', 'change', 'timescale', 'life', 'save-ai', 'export', 'import', 'reset'])

// ---- AI 表单草稿 ----
const draft = ref({ baseUrl: props.aiCfg.baseUrl || '', model: props.aiCfg.model || '', apiKey: '' })
const aiTest = ref({ status: 'idle', message: '' })

async function testConn() {
  aiTest.value = { status: 'testing', message: '正在连接……' }
  const r = await testAiConnection({
    baseUrl: draft.value.baseUrl,
    apiKey: draft.value.apiKey || getApiKey(),
    model: draft.value.model
  })
  aiTest.value = r.ok
    ? { status: 'ok', message: '连接成功，AI 智能体生命系统可用' }
    : { status: 'err', message: r.error }
}

function saveAi() {
  emit('save-ai', { ...draft.value })
  draft.value.apiKey = ''
}

// ---- 生死开关（开启需二次确认） ----
function toggleDeath() {
  const next = !props.save.settings.deathEnabled
  if (next && !confirm('开启后，当健康耗尽时宠物会真的死亡并离开。\n确定要开启吗？（默认关闭，宠物只会虚弱昏迷）')) {
    return
  }
  props.save.settings.deathEnabled = next
  emit('change')
}

// ---- 场景切换 ----
function pickScene(s) {
  props.save.settings.sceneId = s.id
  emit('change')
}

function onImportFile(e) {
  const file = e.target.files?.[0]
  if (file) emit('import', file)
  e.target.value = ''
}

const aiReady = computed(() => !!(props.aiCfg.baseUrl && props.aiCfg.model && hasApiKey()))
const fileInput = ref(null)
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <h2>⚙️ 设置</h2>
      <p class="modal-sub">一切设定只属于这台设备里的它</p>

      <!-- 时间流速 -->
      <div class="section">
        <h4>⏱️ 时间流速</h4>
        <p class="hint">与现实同步最省心；加速可快速看它成长（切换时会先结算当前进度）</p>
        <div class="seg">
          <button
            v-for="t in TIME_SCALES"
            :key="t.value"
            class="seg-item"
            :class="{ active: save.settings.timeScale === t.value }"
            type="button"
            @click="emit('timescale', t.value)"
          >
            {{ t.label }}
            <small>{{ t.hint }}</small>
          </button>
        </div>
      </div>

      <!-- 生死 -->
      <div class="section">
        <h4>🕯️ 生死设定</h4>
        <div class="switch-row">
          <div>
            <div class="sw-label">宠物会死亡</div>
            <div class="sw-desc">默认关闭：健康耗尽只会昏迷，照料即可苏醒</div>
          </div>
          <button class="switch danger-on" :class="{ on: save.settings.deathEnabled }" type="button" aria-label="切换死亡" @click="toggleDeath" />
        </div>
      </div>

      <!-- 生命系统 -->
      <div class="section">
        <h4>🧬 生命系统</h4>
        <p class="hint">随机系统内置离线可用；AI 智能体由大模型驱动它的行为与心声（失败自动降级）</p>
        <div class="seg">
          <button
            class="seg-item"
            :class="{ active: save.settings.lifeSystem === 'random' }"
            type="button"
            @click="emit('life', 'random')"
          >
            随机生命系统
            <small>内置固化 · 离线可用</small>
          </button>
          <button
            class="seg-item"
            :class="{ active: save.settings.lifeSystem === 'ai' }"
            type="button"
            :disabled="!aiReady"
            @click="emit('life', 'ai')"
          >
            AI 智能体生命系统
            <small>{{ aiReady ? '由大模型驱动' : '需先完成下方 AI 配置' }}</small>
          </button>
        </div>
      </div>

      <!-- AI 配置 -->
      <div class="section">
        <h4>🤖 AI 智能体配置</h4>
        <p class="hint">OpenAI 兼容接口（如 api.openai.com / 各类兼容网关）。密钥只保存在本机浏览器，永不随存档导出</p>
        <div class="field">
          <label>接口地址（Base URL）</label>
          <input v-model.trim="draft.baseUrl" type="url" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="field">
          <label>模型名</label>
          <input v-model.trim="draft.model" placeholder="例如 gpt-4o-mini" />
        </div>
        <div class="field">
          <label>API 密钥（留空则沿用已保存的）</label>
          <input v-model="draft.apiKey" type="password" placeholder="sk-…" autocomplete="off" />
        </div>
        <div class="adopt-actions">
          <button class="btn tiny ghost" type="button" :disabled="aiTest.status === 'testing'" @click="testConn">
            测试连接
          </button>
          <button class="btn tiny primary" type="button" @click="saveAi">保存配置</button>
        </div>
        <p v-if="aiTest.message" class="ai-status" :class="{ ok: aiTest.status === 'ok', err: aiTest.status === 'err' }">
          {{ aiTest.message }}
        </p>
      </div>

      <!-- 场景 -->
      <div class="section">
        <h4>🏞️ 生活场景</h4>
        <div class="seg">
          <button
            v-for="s in scenes"
            :key="s.id"
            class="seg-item"
            :class="{ active: save.settings.sceneId === s.id }"
            type="button"
            @click="pickScene(s)"
          >
            {{ s.name }}
            <small>{{ s.builtin ? '内置' : 'AI 生成' }}</small>
          </button>
        </div>
      </div>

      <!-- 数据 -->
      <div class="section">
        <h4>💾 存档数据</h4>
        <p class="hint">导出 JSON 存档用于备份 / 分享 / 跨设备同步；导入会覆盖当前宠物</p>
        <div class="adopt-actions">
          <button class="btn tiny primary" type="button" @click="emit('export')">📤 导出存档</button>
          <button class="btn tiny ghost" type="button" @click="fileInput && fileInput.click()">📥 导入存档</button>
          <button class="btn tiny danger" type="button" @click="emit('reset')">🌸 重新领养</button>
        </div>
        <input ref="fileInput" type="file" accept="application/json,.json" style="display: none" @change="onImportFile" />
      </div>

      <div class="modal-actions">
        <button class="btn primary" type="button" @click="emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>
