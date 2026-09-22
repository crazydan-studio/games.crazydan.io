<script setup>
// ============ 摄像头拍摄「天天」的表情 ============
// - getUserMedia 预览（前摄镜像 / 后摄正常，可切换）
// - 中心方形裁剪 + 缩放到 256px PNG
// - 保存进浏览器 IndexedDB，并自动占用第一个空元素槽位（棋盘实时换脸）
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import { addExpression, assignSlot, slots } from '../store/expressions'
import { toast } from '../utils/toast'
import { playSound } from '../utils/sound'

const emit = defineEmits(['close'])

const videoEl = ref(null)
const stream = ref(null)
const facing = ref('user')
const error = ref('')
const captured = ref(null) // { blob, url }
const name = ref('')
const saving = ref(false)

function defaultName() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `天天 ${p(d.getHours())}:${p(d.getMinutes())}`
}

function stopStream() {
  if (stream.value) {
    stream.value.getTracks().forEach((t) => t.stop())
    stream.value = null
  }
}

function friendlyError(err) {
  if (!window.isSecureContext) {
    return '当前页面不是安全上下文：摄像头需要 HTTPS（或本地 localhost 开发环境）'
  }
  if (err?.name === 'NotAllowedError') {
    return '摄像头权限被拒绝，请在浏览器地址栏/设置中允许后重试'
  }
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
    return '未检测到可用摄像头（或当前设备不支持该摄像头方向）'
  }
  return '摄像头启动失败：' + (err?.message || '未知错误')
}

async function start() {
  error.value = ''
  stopStream()
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facing.value,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })
    if (videoEl.value) {
      videoEl.value.srcObject = stream.value
      videoEl.value.play().catch(() => {})
    }
  } catch (err) {
    error.value = friendlyError(err)
  }
}

function switchCamera() {
  facing.value = facing.value === 'user' ? 'environment' : 'user'
  if (!captured.value) start()
}

function capture() {
  const v = videoEl.value
  if (!v || !v.videoWidth) return
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const side = Math.min(v.videoWidth, v.videoHeight)
  const sx = (v.videoWidth - side) / 2
  const sy = (v.videoHeight - side) / 2
  const ctx = canvas.getContext('2d')
  if (facing.value === 'user') {
    ctx.translate(S, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(v, sx, sy, side, side, 0, 0, S, S)
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        toast('拍摄失败，请重试', 'error')
        return
      }
      captured.value = { blob, url: URL.createObjectURL(blob) }
      name.value = defaultName()
      stopStream()
      playSound('save')
    },
    'image/png'
  )
}

async function save() {
  if (!captured.value || saving.value) return
  saving.value = true
  try {
    const item = await addExpression(captured.value.blob, name.value.trim() || defaultName())
    const emptySlot = slots.value.findIndex((s) => !s)
    if (emptySlot >= 0) {
      assignSlot(emptySlot, item.id)
      toast(`已保存！并设为元素 ${emptySlot + 1}，棋盘已实时换脸`)
    } else {
      toast('已保存到表情库！可在「表情管理」中设为元素')
    }
    emit('close')
  } catch (err) {
    toast('保存失败：' + (err?.message || '未知错误'), 'error')
  } finally {
    saving.value = false
  }
}

function retake() {
  if (captured.value) URL.revokeObjectURL(captured.value.url)
  captured.value = null
  start()
}

function onVisibility() {
  if (document.hidden && !captured.value) stopStream()
  else if (!document.hidden && !captured.value && !stream.value) start()
}

onMounted(() => {
  start()
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  stopStream()
  document.removeEventListener('visibilitychange', onVisibility)
  if (captured.value) URL.revokeObjectURL(captured.value.url)
})
</script>

<template>
  <div class="cam-modal">
    <header class="cam-head">
      <div class="cam-title">
        <Icon name="camera" /> 拍摄天天
      </div>
      <button class="cam-close" aria-label="关闭" @click="$emit('close')">
        <Icon name="close" />
      </button>
    </header>

    <div class="cam-stage">
      <!-- 取景框 -->
      <div class="cam-frame" :class="{ ears: !captured && !error }">
        <video
          v-show="!captured && !error"
          ref="videoEl"
          class="cam-video"
          :class="{ mirror: facing === 'user' }"
          autoplay
          playsinline
          muted
        ></video>

        <div v-if="!captured && !error" class="grid-guide"></div>
        <div class="guide-tip" v-if="!captured && !error">对准天天的脸，居中更容易变成好元素</div>

        <img v-if="captured" :src="captured.url" alt="刚拍摄的天天表情" class="cam-shot" />

        <div v-if="error" class="cam-error">
          <Icon name="camera" />
          <p>{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- 拍摄后：命名 + 保存 -->
    <div v-if="captured" class="cam-review">
      <input v-model="name" class="text" maxlength="20" placeholder="给这个表情起个名字" />
      <div class="btn-row">
        <button class="btn ghost" @click="retake">
          <Icon name="refresh" /> 重拍
        </button>
        <button class="btn primary" :disabled="saving" @click="save">
          <Icon name="check" /> {{ saving ? '保存中…' : '保存到浏览器' }}
        </button>
      </div>
      <p class="cam-hint">保存后会自动占用一个空的元素槽位，棋盘立即使用这个表情</p>
    </div>

    <!-- 拍摄控制 -->
    <div v-else class="cam-actions">
      <button class="cam-side" aria-label="切换摄像头" @click="switchCamera">
        <Icon name="flip" />
        <span>{{ facing === 'user' ? '前置' : '后置' }}</span>
      </button>
      <button class="shutter" aria-label="拍摄" :disabled="!!error" @click="capture"></button>
      <div class="cam-side placeholder-side"></div>
    </div>
  </div>
</template>

<style scoped>
.cam-modal {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(38, 22, 12, 0.95);
  display: flex;
  flex-direction: column;
  padding: 16px 18px calc(20px + env(safe-area-inset-bottom));
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
}

.cam-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #fff;
}

.cam-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 17px;
}

.cam-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cam-stage {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 26px 0;
}

.cam-frame {
  position: relative;
  width: min(86vw, 400px);
  aspect-ratio: 1;
  border-radius: 26px;
  overflow: hidden;
  background: #1d1109;
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.18),
    0 14px 44px rgba(0, 0, 0, 0.45);
}

/* 猫耳装饰 */
.cam-frame.ears::before,
.cam-frame.ears::after {
  content: '';
  position: absolute;
  top: -22px;
  width: 64px;
  height: 46px;
  background: #ffc98f;
  border-radius: 14px 14px 6px 6px;
  z-index: 2;
}

.cam-frame.ears::before {
  left: 16%;
  transform: rotate(-18deg);
}

.cam-frame.ears::after {
  right: 16%;
  transform: rotate(18deg);
}

.cam-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cam-video.mirror {
  transform: scaleX(-1);
}

.grid-guide {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px);
  background-size: 33.34% 33.34%;
  pointer-events: none;
}

.guide-tip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  text-align: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12.5px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.cam-shot {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cam-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #ffd1c4;
  text-align: center;
  padding: 30px 22px;
  font-size: 14px;
  line-height: 1.7;
}

.cam-error .icon {
  width: 38px;
  height: 38px;
  opacity: 0.8;
}

.cam-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 22px;
}

.shutter {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: #fff;
  border: 6px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: transform 0.12s;
  flex: none;
}

.shutter:active {
  transform: scale(0.9);
}

.shutter:disabled {
  opacity: 0.4;
}

.cam-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.9;
  width: 76px;
}

.cam-side .icon {
  width: 26px;
  height: 26px;
}

.placeholder-side {
  width: 76px;
}

.cam-review {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 6px 8px;
}

.cam-review input {
  background: #fff;
}

.cam-review .btn-row {
  margin-top: 0;
}

.cam-hint {
  margin: 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;
}
</style>
