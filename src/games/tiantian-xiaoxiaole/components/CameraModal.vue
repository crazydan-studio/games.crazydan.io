<script setup>
// ============ 摄像头拍摄「天天」的表情 ============
// - getUserMedia 预览：默认后置摄像头（拍天天更顺手；桌面无后置时浏览器自动回落内置摄像头）
// - 前摄镜像 / 后摄正常，可随时切换；多摄设备按 deviceId 精确轮换（部分平台对 facingMode 支持不稳）
// - 切换安全：先完整停流（含 video 元素解绑）并留出硬件释放窗口再重开；
//   以请求序号防竞态，过期流一律立即关闭 —— 杜绝孤儿流把摄像头占死
//   （安卓 Chrome 连续开流会报 Starting videoinput failed，且可能须重启浏览器才能恢复）
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
const facing = ref('environment') // 请求的摄像头朝向：默认后置
const actualFacing = ref('environment') // 实际打开的朝向（读轨道设置）：驱动镜像 / 标签 / 拍摄翻转
const currentDeviceId = ref('') // 当前使用的视频设备 id（多摄设备切换时按 id 轮换）
const pendingDeviceId = ref('') // 下一次打开要精确使用的设备 id（一次性，用后即清）
const error = ref('')
const captured = ref(null) // { blob, url }
const name = ref('')
const saving = ref(false)

// 请求序号：仅最新一次 start 的结果生效；过期结果立即停轨，防止流泄漏占死摄像头
let startSeq = 0
// 最近一次停流时间：重开前保证足够的硬件释放窗口
let lastStopAt = 0

function defaultName() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `天天 ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 停流：先解绑 video 元素再停轨道，帮助浏览器完整释放摄像头管线
function stopStream() {
  if (videoEl.value) {
    try {
      videoEl.value.pause()
    } catch {
      /* 忽略：未开始播放等 */
    }
    videoEl.value.srcObject = null
  }
  if (stream.value) {
    stream.value.getTracks().forEach((t) => t.stop())
    stream.value = null
    lastStopAt = Date.now()
  }
}

// 作废在途请求并停流（关闭弹窗 / 页面隐藏时调用，防止孤儿流占住摄像头）
function cancelStart() {
  startSeq++
  stopStream()
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
  if (err?.name === 'NotReadableError' || err?.name === 'AbortError') {
    return '摄像头被其他应用/标签页占用，或启动失败：请关闭占用方后重试'
  }
  return '摄像头启动失败：' + (err?.message || '未知错误')
}

// 打开摄像头：优先 deviceId 精确指定（多摄设备切换最可靠），失败或无目标设备时
// 回落 facingMode（ideal 语义：请求后置；无后置的桌面会自动使用内置摄像头）
async function openCamera() {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 } }
  if (pendingDeviceId.value) {
    const id = pendingDeviceId.value
    pendingDeviceId.value = ''
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...video, deviceId: { exact: id } },
        audio: false
      })
    } catch {
      /* 设备 id 已失效等 → 回落 facingMode */
    }
  }
  return navigator.mediaDevices.getUserMedia({
    video: { ...video, facingMode: { ideal: facing.value } },
    audio: false
  })
}

async function start() {
  const seq = ++startSeq
  error.value = ''
  stopStream()
  // 安卓 Chrome 停轨后摄像头是异步释放的：距上次停流不足 300ms 就重开，
  // 会报「Starting videoinput failed」甚至卡死摄像头服务（须重启浏览器才能恢复）
  const wait = lastStopAt ? 300 - (Date.now() - lastStopAt) : 0
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  if (seq !== startSeq) return // 等待期间已有更新的请求
  try {
    const s = await openCamera()
    if (seq !== startSeq) {
      // 结果已过期（等待期间又发起了新请求）：立即关闭，防止占死摄像头
      s.getTracks().forEach((t) => t.stop())
      return
    }
    stream.value = s
    const settings = s.getVideoTracks()[0]?.getSettings?.() || {}
    currentDeviceId.value = settings.deviceId || ''
    const fm = settings.facingMode
    actualFacing.value = fm === 'user' || fm === 'environment' ? fm : facing.value
    facing.value = actualFacing.value // 请求态与实际态对齐，下一次切换从真实状态出发
    if (videoEl.value) {
      videoEl.value.srcObject = s
      videoEl.value.play().catch(() => {})
    }
  } catch (err) {
    if (seq === startSeq) error.value = friendlyError(err)
  }
}

async function switchCamera() {
  facing.value = facing.value === 'user' ? 'environment' : 'user'
  if (captured.value) return // 拍摄结果页仅记录切换意图，重拍时生效
  // 多摄设备：轮换到下一枚视频设备（deviceId 精确，比 facingMode 在部分平台更可靠）
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'videoinput'
    )
    if (devices.length > 1 && currentDeviceId.value) {
      const idx = devices.findIndex((d) => d.deviceId === currentDeviceId.value)
      if (idx >= 0) pendingDeviceId.value = devices[(idx + 1) % devices.length].deviceId
    }
  } catch {
    /* 枚举失败 → 走 facingMode 切换 */
  }
  start()
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
  if (actualFacing.value === 'user') {
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
  if (document.hidden && !captured.value) cancelStart()
  else if (!document.hidden && !captured.value && !stream.value) start()
}

onMounted(() => {
  start()
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  // 作废在途请求：弹窗关闭后不允许任何摄像头流存活或新开（否则摄像头被占死）
  cancelStart()
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
          :class="{ mirror: actualFacing === 'user' }"
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
        <span>{{ actualFacing === 'user' ? '前置' : '后置' }}</span>
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
