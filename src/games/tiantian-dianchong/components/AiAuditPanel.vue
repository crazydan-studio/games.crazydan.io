<script setup>
// ============ AI 调用记录面板（调试工具） ============
// 按生成数据类型分类展示每一次 AI 调用的完整档案：
//   分类筛选 chips（含各类计数）→ 调用列表（时间 / 成败 / 摘要 / 耗时）
//   → 点开详情（完整提示词 system/user、模型原始输出、解析结果、结果去向）
// 管理：复制单条 JSON / 导出全部 / 按分类或全部清空；订阅审计库实时刷新。
// 安全：面板数据来自审计库，天然不含 API 密钥。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  AI_TASK_TYPES,
  OUTCOMES,
  getAuditEntries,
  auditStats,
  clearAudit,
  exportAudit,
  subscribeAudit
} from '../core/ai/audit.js'
import { BEHAVIORS } from '../core/behaviors.js'
import { fmtGameTime } from '../core/time.js'

const emit = defineEmits(['close'])

// ---- 列表状态（tick 驱动 computed 重算，订阅回调里自增） ----
const filter = ref('all') // 'all' | 任务类型 id
const expanded = ref({})
const tick = ref(0)
const copiedId = ref('')
let unsub = null
let copiedTimer = null

const chips = computed(() => {
  tick.value
  const stats = auditStats()
  return [
    { id: 'all', icon: '🗂️', label: '全部', count: stats.total.count },
    ...Object.values(AI_TASK_TYPES).map((t) => ({
      id: t.id,
      icon: t.icon,
      label: t.label,
      count: stats.types[t.id]?.count || 0
    }))
  ]
})

const entries = computed(() => {
  tick.value
  return getAuditEntries(filter.value === 'all' ? null : filter.value)
})

const statsLine = computed(() => {
  tick.value
  const s = auditStats()
  return `共 ${s.total.count} 条 · 约 ${(s.total.bytes / 1024).toFixed(1)} KB · 仅本机保存`
})

function refresh() {
  tick.value++
}

onMounted(() => {
  unsub = subscribeAudit(refresh)
})
onBeforeUnmount(() => {
  unsub?.()
  clearTimeout(copiedTimer)
})

// ---- 展示辅助 ----
function pick(id) {
  filter.value = id
  expanded.value = {}
}

function toggle(id) {
  expanded.value[id] = !expanded.value[id]
}

function fmtTime(at) {
  const d = new Date(at)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtGame(e) {
  return e.gameClock != null ? fmtGameTime(e.gameClock) : ''
}

function summaryOf(e) {
  const d = e.response?.data
  if (e.type === 'behavior') {
    if (e.response.ok && d && BEHAVIORS[d.behavior]) {
      return `${BEHAVIORS[d.behavior].label} ·「${typeof d.say === 'string' ? d.say : '…'}」`
    }
    return e.response.error || '无有效输出'
  }
  if (e.type === 'species' || e.type === 'scene') {
    if (e.response.ok && d && typeof d === 'object' && d.name) {
      return `${d.emoji ? `${d.emoji} ` : ''}${d.name}`
    }
    return e.response.error || '无有效输出'
  }
  if (e.type === 'connection') return e.response.ok ? '连接成功' : e.response.error || '失败'
  return e.response.ok ? '调用成功' : e.response.error || '调用失败'
}

const OUTCOME_TEXT = {
  [OUTCOMES.APPLIED]: '已采用',
  [OUTCOMES.FALLBACK]: '已降级',
  [OUTCOMES.REJECTED]: '未采用',
  [OUTCOMES.SKIPPED]: '已跳过'
}

function outcomeInfo(e) {
  if (!e.outcome) return { text: '未回执', cls: 'none' }
  return { text: OUTCOME_TEXT[e.outcome.used] || e.outcome.used, cls: e.outcome.used }
}

function typeInfo(id) {
  return AI_TASK_TYPES[id] || { icon: '🤖', label: id }
}

function pretty(v) {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function prettyEntry(e) {
  return JSON.stringify(e, null, 2)
}

function hasData(e) {
  return e.response?.data != null
}

function usageText(e) {
  const u = e.response?.usage
  if (!u) return ''
  const parts = []
  if (u.prompt_tokens != null) parts.push(`输入 ${u.prompt_tokens}`)
  if (u.completion_tokens != null) parts.push(`输出 ${u.completion_tokens}`)
  return parts.length ? `${parts.join(' / ')} tokens` : ''
}

// ---- 管理：复制 / 导出 / 清空 ----
async function copyEntry(e) {
  const text = prettyEntry(e)
  let done = false
  try {
    await navigator.clipboard?.writeText(text)
    done = true
  } catch {
    /* 降级 execCommand */
  }
  if (!done) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0;top:-9999px'
      document.body.appendChild(ta)
      ta.select()
      done = document.execCommand('copy')
      ta.remove()
    } catch {
      done = false
    }
  }
  copiedId.value = e.id
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedId.value = ''
  }, 1600)
}

function doExport() {
  const { text, filename } = exportAudit()
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function doClear() {
  const scope = filter.value === 'all' ? '全部类型的 AI 调用记录' : `「${typeInfo(filter.value).label}」分类的记录`
  if (!entries.value.length) return
  if (!confirm(`确定清空${scope}吗？此操作不可恢复（导出的文件不受影响）。`)) return
  clearAudit(filter.value === 'all' ? null : filter.value)
  expanded.value = {}
}
</script>

<template>
  <div class="overlay audit-overlay" @click.self="emit('close')">
    <div class="modal audit-modal">
      <h2>🧾 AI 调用记录</h2>
      <p class="modal-sub">
        每次调用的提示词与结果按生成数据类型分类存放，用于调试 · {{ statsLine }} · 不含密钥
      </p>

      <!-- 分类筛选 -->
      <div class="audit-chips">
        <button
          v-for="c in chips"
          :key="c.id"
          class="audit-chip"
          :class="{ active: filter === c.id }"
          type="button"
          @click="pick(c.id)"
        >
          <span class="ac-icon">{{ c.icon }}</span>
          <span>{{ c.label }}</span>
          <span class="ac-count">{{ c.count }}</span>
        </button>
      </div>

      <!-- 记录列表 -->
      <div v-if="entries.length" class="audit-list">
        <div v-for="e in entries" :key="e.id" class="audit-item" :class="{ open: expanded[e.id] }">
          <button class="audit-row" type="button" @click="toggle(e.id)">
            <span class="ar-time">{{ fmtTime(e.at) }}</span>
            <span class="ar-type">{{ typeInfo(e.type).icon }} {{ typeInfo(e.type).label }}</span>
            <span class="ar-result" :class="{ ok: e.response.ok, err: !e.response.ok }">
              {{ e.response.ok ? '✓' : '✗' }}
            </span>
            <span class="ar-summary" :title="e.tag ? `标签：${e.tag}` : ''">{{ summaryOf(e) }}</span>
            <span v-if="e.response.elapsed != null" class="ar-elapsed">{{ e.response.elapsed }}ms</span>
            <span class="ar-outcome" :class="outcomeInfo(e).cls">{{ outcomeInfo(e).text }}</span>
            <span class="ar-chevron" aria-hidden="true">{{ expanded[e.id] ? '▾' : '▸' }}</span>
          </button>

          <!-- 详情 -->
          <div v-if="expanded[e.id]" class="audit-detail">
            <div class="kv-grid">
              <div class="kv"><span>生成类型</span><b>{{ typeInfo(e.type).icon }} {{ typeInfo(e.type).label }}（{{ e.type }}）</b></div>
              <div class="kv"><span>模型</span><b>{{ e.request.model || '—' }}</b></div>
              <div class="kv"><span>接口地址</span><b class="break-all">{{ e.request.baseUrl || '—' }}</b></div>
              <div v-if="e.response.url" class="kv"><span>成功端点</span><b class="break-all">{{ e.response.url }}</b></div>
              <div class="kv"><span>温度</span><b>{{ e.request.temperature ?? '—' }}</b></div>
              <div class="kv"><span>耗时</span><b>{{ e.response.elapsed != null ? `${e.response.elapsed} ms` : '—' }}</b></div>
              <div v-if="e.response.status != null" class="kv"><span>状态码</span><b>{{ e.response.status }}</b></div>
              <div v-if="usageText(e)" class="kv"><span>Token 用量</span><b>{{ usageText(e) }}</b></div>
              <div v-if="e.gameClock != null" class="kv"><span>游戏时间</span><b>{{ fmtGame(e) }}</b></div>
              <div v-if="e.tag" class="kv"><span>标签</span><b>{{ e.tag }}</b></div>
            </div>

            <div v-if="e.response.error" class="detail-block err-block">⚠️ {{ e.response.error }}</div>

            <div class="detail-block">
              <div class="db-head">System 提示词</div>
              <pre>{{ e.request.system || '（空）' }}</pre>
            </div>
            <div class="detail-block">
              <div class="db-head">User 提示词</div>
              <pre>{{ e.request.user || '（空）' }}</pre>
            </div>
            <div v-if="e.response.text" class="detail-block">
              <div class="db-head">模型原始输出</div>
              <pre>{{ e.response.text }}</pre>
            </div>
            <div v-if="hasData(e)" class="detail-block">
              <div class="db-head">解析结果（JSON）</div>
              <pre>{{ pretty(e.response.data) }}</pre>
            </div>

            <div class="detail-outcome">
              <span class="badge" :class="outcomeInfo(e).cls">{{ outcomeInfo(e).text }}</span>
              <span v-if="e.outcome?.note" class="do-note">{{ e.outcome.note }}</span>
              <button class="btn tiny ghost copy-btn" type="button" @click="copyEntry(e)">
                {{ copiedId === e.id ? '已复制 ✓' : '复制 JSON' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="audit-empty">
        <div class="ae-icon">🫧</div>
        <p>{{ filter === 'all' ? '还没有任何 AI 调用记录' : `「${typeInfo(filter).label}」分类暂无记录` }}</p>
        <p class="ae-hint">配置好 AI 智能体后，行为决策 / 物种设计 / 连接测试等调用会自动分类存档</p>
      </div>

      <div class="modal-actions audit-actions">
        <span class="audit-tip">提示词与输出仅在调试时本地留存，可随时清空</span>
        <button class="btn tiny ghost" type="button" :disabled="!entries.length" @click="doExport">📤 导出全部</button>
        <button class="btn tiny danger" type="button" :disabled="!entries.length" @click="doClear">🗑 清空{{ filter === 'all' ? '全部' : '本类' }}</button>
        <button class="btn tiny primary" type="button" @click="emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>
