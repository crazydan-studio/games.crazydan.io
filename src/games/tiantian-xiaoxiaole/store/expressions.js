// ============ 表情库与元素槽位（全局单例 store） ============
// - 表情图片存 IndexedDB（Blob 持久化，刷新不丢）
// - 6 个元素槽位存 localStorage
// - 槽位 → 棋盘元素实时映射：槽位一变，棋盘立即换脸
import { ref, computed } from 'vue'
import { dbGetAll, dbPut, dbDelete } from '../utils/db'

const SLOTS_KEY = 'ttxsl-slots-v1'

function loadSlots() {
  try {
    const arr = JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null')
    if (Array.isArray(arr) && arr.length === 6) return arr.map((v) => (v == null ? null : String(v)))
  } catch {
    /* 忽略损坏数据 */
  }
  return [null, null, null, null, null, null]
}

// 表情列表：{ id, name, blob, url, createdAt }
export const expressions = ref([])
// 6 个槽位：值为表情 id 或 null（null → 使用默认猫咪表情）
export const slots = ref(loadSlots())

// 槽位对应的图片 URL（给棋盘渲染用），null 表示该槽位用默认猫咪
export const slotImages = computed(() =>
  slots.value.map((id) => {
    if (!id) return null
    const e = expressions.value.find((x) => x.id === id)
    return e ? e.url : null
  })
)

const ready = ref(false)
export const expressionsReady = ready

function saveSlots() {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots.value))
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `e${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// 应用启动时从 IndexedDB 加载
export async function initExpressions() {
  try {
    const rows = await dbGetAll()
    rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    expressions.value = rows.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }))
    // 清理指向已不存在表情的槽位
    let dirty = false
    slots.value = slots.value.map((id) => {
      if (id && !expressions.value.some((e) => e.id === id)) {
        dirty = true
        return null
      }
      return id
    })
    if (dirty) saveSlots()
  } catch {
    expressions.value = []
  }
  ready.value = true
}

// 新增一个表情（blob + 名称），返回表情对象
export async function addExpression(blob, name) {
  const item = {
    id: newId(),
    name: name || '天天表情',
    blob,
    createdAt: Date.now()
  }
  await dbPut({ id: item.id, name: item.name, blob: item.blob, createdAt: item.createdAt })
  item.url = URL.createObjectURL(blob)
  expressions.value.push(item)
  return item
}

// 批量导入（来自 zip 或服务器），返回 file → 新表情 id 的映射
export async function importItems(items) {
  const fileToId = {}
  for (const it of items) {
    const item = await addExpression(it.blob, it.name || '天天表情')
    if (it.file) fileToId[it.file] = item.id
  }
  return fileToId
}

export async function removeExpression(id) {
  try {
    await dbDelete(id)
  } catch {
    /* 删除失败继续清理内存 */
  }
  const i = expressions.value.findIndex((e) => e.id === id)
  if (i >= 0) {
    URL.revokeObjectURL(expressions.value[i].url)
    expressions.value.splice(i, 1)
  }
  slots.value = slots.value.map((s) => (s === id ? null : s))
  saveSlots()
}

export function assignSlot(index, id) {
  slots.value[index] = id
  saveSlots()
}

// 应用表情包自带的槽位映射（file → id）
export function applyPackSlots(slotFiles, fileToId) {
  if (!Array.isArray(slotFiles) || slotFiles.length !== 6) return false
  slotFiles.forEach((file, i) => {
    slots.value[i] = file && fileToId[file] ? fileToId[file] : null
  })
  saveSlots()
  return true
}

// 开发调试钩子（仅 DEV 生效）
if (import.meta.env.DEV) {
  window.__TT_DEBUG__ = { expressions, slots }
}
