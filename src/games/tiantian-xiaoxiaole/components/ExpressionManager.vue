<script setup>
// ============ 表情管理：槽位分配 / 表情库 / 打包导出 / 导入（zip、图片、服务器） ============
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import CatFace from './CatFace.vue'
import {
  expressions,
  slots,
  assignSlot,
  removeExpression,
  importItems,
  applyPackSlots
} from '../store/expressions'
import { exportPack, loadPackZip, loadPackFromUrl } from '../utils/pack'
import { toast } from '../utils/toast'
import { playSound } from '../utils/sound'

const emit = defineEmits(['close', 'camera'])

const pickingSlot = ref(-1)
const urlInput = ref(false)
const serverUrl = ref('./expressions/manifest.json')
const busy = ref(false)

const slotExprs = computed(() =>
  slots.value.map((id) => expressions.value.find((e) => e.id === id) || null)
)

function onSlotClick(i) {
  if (pickingSlot.value === i) {
    pickingSlot.value = -1
    return
  }
  pickingSlot.value = i
}

function setSlot(i, id) {
  assignSlot(i, id)
  pickingSlot.value = -1
  playSound('tap')
  toast(id ? `元素 ${i + 1} 已更新，棋盘实时生效` : `元素 ${i + 1} 已恢复默认猫咪`)
}

async function onRemove(e) {
  if (!window.confirm(`删除表情「${e.name}」？此操作不可恢复。`)) return
  await removeExpression(e.id)
  toast('已删除')
}

// 导出：全部表情库 + 槽位映射 → zip 下载（可传到手机）
async function onExport() {
  if (!expressions.value.length) {
    toast('还没有表情，先去拍摄天天吧', 'error')
    return
  }
  busy.value = true
  try {
    await exportPack(expressions.value, slots.value)
    toast('表情包已开始下载！传到手机或解压部署到服务器均可')
    playSound('save')
  } catch (err) {
    toast('导出失败：' + (err?.message || '未知错误'), 'error')
  } finally {
    busy.value = false
  }
}

// 导入：支持 zip 表情包 / 多张图片
async function onImportFiles(ev) {
  const files = [...(ev.target.files || [])]
  ev.target.value = ''
  if (!files.length) return
  busy.value = true
  try {
    let added = 0
    const zips = files.filter((f) => /\.zip$/i.test(f.name) || f.type === 'application/zip')
    const imgs = files.filter((f) => f.type && f.type.startsWith('image/'))
    for (const f of zips) {
      const { manifest, items } = await loadPackZip(f)
      if (!items.length) continue
      const fileToId = await importItems(items)
      added += items.length
      if (applyPackSlots(manifest.slots, fileToId)) {
        toast(`已导入 ${items.length} 个表情，并应用了表情包的元素槽位`)
      }
    }
    if (imgs.length) {
      await importItems(imgs.map((f) => ({ blob: f, name: f.name.replace(/\.\w+$/, '') })))
      added += imgs.length
    }
    if (added > 0) {
      toast(`成功导入 ${added} 个表情！`)
      playSound('save')
    } else {
      toast('没有识别到可导入的内容', 'error')
    }
  } catch (err) {
    toast('导入失败：' + (err?.message || '未知错误'), 'error')
  } finally {
    busy.value = false
  }
}

// 从服务器静态资源加载（线下部署场景）
async function onLoadFromServer() {
  busy.value = true
  try {
    const { manifest, items } = await loadPackFromUrl(serverUrl.value)
    if (!items.length) {
      toast('这个表情包里还没有表情', 'error')
      return
    }
    const fileToId = await importItems(items)
    let slotApplied = false
    if (Array.isArray(manifest.slots) && manifest.slots.length === 6) {
      slotApplied = applyPackSlots(manifest.slots, fileToId)
    }
    toast(
      slotApplied
        ? `已从服务器加载 ${items.length} 个表情，并应用到元素槽位！`
        : `已从服务器加载 ${items.length} 个表情！`
    )
    playSound('save')
  } catch (err) {
    toast('加载失败：' + (err?.message || '未知错误'), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal wide @close="$emit('close')">
    <div class="manager">
      <header class="manager-head">
        <h3><Icon name="image" /> 表情管理</h3>
        <button class="icon-btn" aria-label="关闭" @click="$emit('close')">
          <Icon name="close" />
        </button>
      </header>

      <!-- 元素槽位 -->
      <section>
        <h4>
          游戏元素槽位
          <span class="mini">点击槽位更换 · 更换后棋盘实时生效</span>
        </h4>
        <div class="slots">
          <div
            v-for="(expr, i) in slotExprs"
            :key="i"
            class="slot-card"
            :class="{ active: pickingSlot === i }"
            @click="onSlotClick(i)"
          >
            <div class="slot-face" :data-type="i">
              <img v-if="expr" :src="expr.url" :alt="expr.name" />
              <CatFace v-else :variant="i" />
            </div>
            <span class="slot-name">{{ expr ? '自定义' : '默认' }}·{{ i + 1 }}</span>
          </div>
        </div>

        <!-- 槽位选择面板 -->
        <div v-if="pickingSlot >= 0" class="picker">
          <div class="picker-title">为元素 {{ pickingSlot + 1 }} 选择表情：</div>
          <div class="picker-list">
            <div class="picker-item" @click="setSlot(pickingSlot, null)">
              <div class="picker-face"><CatFace :variant="pickingSlot" /></div>
              <span>默认猫咪</span>
            </div>
            <div v-for="e in expressions" :key="e.id" class="picker-item" @click="setSlot(pickingSlot, e.id)">
              <div class="picker-face">
                <img :src="e.url" :alt="e.name" />
              </div>
              <span>{{ e.name }}</span>
            </div>
          </div>
          <button class="btn tiny ghost" @click="pickingSlot = -1">取消</button>
        </div>
      </section>

      <!-- 我的表情库 -->
      <section>
        <h4>
          我的表情库
          <span class="mini">{{ expressions.length }} 个 · 只保存在这台设备的浏览器里</span>
        </h4>

        <div v-if="!expressions.length" class="empty">
          <CatFace :variant="3" />
          <p>还没有天天的表情，快去拍摄吧！</p>
          <button class="btn primary tiny" @click="$emit('camera')">
            <Icon name="camera" /> 去拍摄
          </button>
        </div>

        <div v-else class="lib-grid">
          <div v-for="e in expressions" :key="e.id" class="lib-card">
            <img :src="e.url" :alt="e.name" />
            <div class="lib-name" :title="e.name">{{ e.name }}</div>
            <div class="lib-slots">
              <button
                v-for="i in 6"
                :key="i"
                class="slot-chip"
                :class="{ on: slots[i - 1] === e.id }"
                :title="`设为元素 ${i}`"
                @click="assignSlot(i - 1, e.id)"
              >
                {{ i }}
              </button>
            </div>
            <button class="lib-del" :aria-label="`删除 ${e.name}`" @click="onRemove(e)">
              <Icon name="trash" />
            </button>
          </div>
        </div>
      </section>

      <!-- 打包与部署 -->
      <section>
        <h4>表情包 · 打包与部署</h4>
        <p class="mini pack-desc">
          导出 zip 保存到手机 → 解压后把 <code>expressions/</code> 文件夹上传到任意静态服务器
          → 在下方通过 URL 导入，其他设备也能用同一套天天表情。
        </p>
        <div class="pack-actions">
          <button class="btn tiny" :disabled="busy" @click="onExport">
            <Icon name="download" /> 导出表情包
          </button>
          <label class="btn tiny" :class="{ disabled: busy }">
            <Icon name="upload" /> 导入 zip / 图片
            <input type="file" accept=".zip,image/*" multiple hidden @change="onImportFiles" />
          </label>
          <button class="btn tiny" :class="{ primary: urlInput }" @click="urlInput = !urlInput">
            <Icon name="globe" /> 从服务器导入
          </button>
        </div>
        <div v-if="urlInput" class="url-row">
          <input
            v-model="serverUrl"
            class="text"
            spellcheck="false"
            placeholder="https://你的域名/expressions/manifest.json"
          />
          <button class="btn tiny primary" :disabled="busy" @click="onLoadFromServer">加载</button>
        </div>
        <div v-if="busy" class="mini loading-row">处理中…</div>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.manager-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.manager-head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 18px;
}

section h4 {
  margin: 20px 0 8px;
  font-size: 14.5px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

/* ---- 槽位 ---- */
.slots {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.slot-card {
  background: var(--bg-soft);
  border: 2px solid var(--line);
  border-radius: 14px;
  padding: 8px 4px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.slot-card.active {
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(240, 126, 29, 0.22);
}

.slot-face {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tc);
}

.slot-face[data-type='0'] { --tc: #ffd9a8; }
.slot-face[data-type='1'] { --tc: #c9ebd3; }
.slot-face[data-type='2'] { --tc: #c4dff5; }
.slot-face[data-type='3'] { --tc: #e3d2f1; }
.slot-face[data-type='4'] { --tc: #fcefc3; }
.slot-face[data-type='5'] { --tc: #fbd3de; }

.slot-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slot-face :deep(.cat-face) {
  width: 92%;
  height: 92%;
}

.slot-name {
  font-size: 10.5px;
  color: var(--text-soft);
  white-space: nowrap;
}

/* ---- 选择面板 ---- */
.picker {
  margin-top: 10px;
  background: var(--bg-soft);
  border-radius: 14px;
  padding: 10px;
}

.picker-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}

.picker-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 8px;
}

.picker-item {
  flex: 0 0 auto;
  width: 62px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-soft);
  text-align: center;
}

.picker-face {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--line);
}

.picker-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picker-face :deep(.cat-face) {
  width: 92%;
  height: 92%;
}

.picker-item span {
  width: 62px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 表情库 ---- */
.lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(122px, 1fr));
  gap: 12px;
}

.lib-card {
  background: #fff;
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 6px 16px rgba(93, 64, 55, 0.12);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lib-card > img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 11px;
  object-fit: cover;
  background: var(--bg-deep);
}

.lib-name {
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}

.lib-slots {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.slot-chip {
  width: 25px;
  height: 25px;
  border-radius: 8px;
  border: 1.5px solid var(--line);
  background: var(--bg-soft);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-soft);
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}

.slot-chip.on {
  background: linear-gradient(135deg, #ffb347, #f07e1d);
  border-color: #f07e1d;
  color: #fff;
}

.lib-del {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(93, 64, 55, 0.82);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.lib-del .icon {
  width: 14px;
  height: 14px;
}

/* ---- 打包工具 ---- */
.pack-desc {
  margin: 0 0 10px;
  line-height: 1.7;
}

.pack-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.pack-actions label.btn {
  cursor: pointer;
}

.url-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.loading-row {
  margin-top: 8px;
}

@media (max-width: 420px) {
  .slots {
    gap: 5px;
  }

  .slot-face {
    width: 36px;
    height: 36px;
  }
}
</style>
