<script setup>
// ============ 棋盘：渲染 + 手势交互（点击选择 / 滑动交换） ============
// 特殊块：炸弹猫（虚线警戒环）/ 彩虹猫（旋转彩虹盘）
// 棋盘行列数由 game.rows / game.cols 提供（支持 8×8 / 6×8 / 6×6 等矩阵）
import { computed, ref } from 'vue'
import CatFace from './CatFace.vue'
import Icon from './Icon.vue'
import { RAINBOW_VARIANT } from '../utils/catface'
import { slotImages } from '../store/expressions'
import { settings } from '../store/settings'

const props = defineProps({
  game: { type: Object, required: true }
})

const boardEl = ref(null)
const drag = ref(null) // { r, c, px, py, moved }

const rows = computed(() => props.game.rows || 8)
const cols = computed(() => props.game.cols || 8)

// 棋盘动态样式：宽高比 + 网格底纹随行列数变化
const boardStyle = computed(() => ({
  aspectRatio: `${cols.value} / ${rows.value}`,
  backgroundSize: `${100 / cols.value}% ${100 / rows.value}%`
}))

function cellSizePx() {
  return boardEl.value ? boardEl.value.clientWidth / cols.value : 50
}

function cellFromEvent(e) {
  if (!boardEl.value) return null
  const rect = boardEl.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  const c = Math.min(cols.value - 1, Math.max(0, Math.floor((x / rect.width) * cols.value)))
  const r = Math.min(rows.value - 1, Math.max(0, Math.floor((y / rect.height) * rows.value)))
  return { r, c }
}

function onPointerDown(e) {
  if (props.game.state !== 'idle') return
  const cell = cellFromEvent(e)
  if (!cell) return
  drag.value = { ...cell, px: e.clientX, py: e.clientY, moved: false }
  props.game.onInteract()
  if (boardEl.value && e.pointerId != null) {
    try {
      boardEl.value.setPointerCapture(e.pointerId)
    } catch {
      /* 捕获失败不影响点击流程 */
    }
  }
}

function onPointerMove(e) {
  const d = drag.value
  if (!d || d.moved) return
  const dx = e.clientX - d.px
  const dy = e.clientY - d.py
  const th = Math.max(14, cellSizePx() * 0.28)
  if (Math.abs(dx) < th && Math.abs(dy) < th) return
  d.moved = true
  let dr = 0
  let dc = 0
  if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1
  else dr = dy > 0 ? 1 : -1
  const r2 = d.r + dr
  const c2 = d.c + dc
  if (r2 >= 0 && r2 < rows.value && c2 >= 0 && c2 < cols.value) {
    props.game.trySwap(d.r, d.c, r2, c2)
  }
}

function onPointerUp() {
  const d = drag.value
  drag.value = null
  if (!d || d.moved) return
  props.game.tapCell(d.r, d.c) // 原地点击 → 走选择流程
}

function isHinted(t) {
  const h = props.game.hint
  return !!h && (t.id === h.a || t.id === h.b)
}

function tileStyle(t) {
  return {
    width: `${100 / cols.value}%`,
    height: `${100 / rows.value}%`,
    transform: `translate(${t.x * 100}%, ${t.y * 100}%)`,
    zIndex: t.removing ? 6 : undefined
  }
}
</script>

<template>
  <div class="board-wrap">
    <div
      ref="boardEl"
      class="board"
      data-testid="board"
      :style="boardStyle"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div
        v-for="t in game.tiles"
        :key="t.id"
        class="tile"
        :style="tileStyle(t)"
      >
        <div
          class="tile-inner"
          :class="{
            removing: t.removing,
            shake: t.shake,
            selected: game.selectedId === t.id,
            hinted: isHinted(t),
            bomb: t.kind === 'bomb',
            rainbow: t.kind === 'rainbow',
            born: t.born,
            blasted: t.blasted,
            rainbowBlast: t.rainbowBlast
          }"
          :data-type="t.type"
        >
          <!-- 彩虹盘（垫底旋转） -->
          <span v-if="t.kind === 'rainbow'" class="rainbow-ring" aria-hidden="true"></span>
          <!-- 炸弹警戒环（顶层旋转） -->
          <span v-if="t.kind === 'bomb'" class="bomb-ring" aria-hidden="true"></span>

          <template v-if="t.kind === 'rainbow'">
            <CatFace :variant="RAINBOW_VARIANT" />
          </template>
          <template v-else>
            <img
              v-if="slotImages[t.type]"
              :src="slotImages[t.type]"
              :alt="`天天表情${t.type + 1}`"
              draggable="false"
            />
            <CatFace v-else :variant="t.type" />
          </template>

          <i v-if="settings.corner && t.kind !== 'rainbow'" class="type-dot"></i>
          <span v-if="t.kind === 'bomb'" class="spec-glyph glyph-bomb" aria-hidden="true">
            <Icon name="bomb" />
          </span>
          <span v-else-if="t.kind === 'rainbow'" class="spec-glyph glyph-rainbow" aria-hidden="true">
            <Icon name="rainbow" />
          </span>
        </div>
      </div>

      <div class="pop-layer">
        <div
          v-for="p in game.popups"
          :key="p.id"
          class="score-pop"
          :style="{ left: p.left, top: p.top }"
        >
          {{ p.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-wrap {
  width: min(100%, 470px);
  margin: 0 auto;
}

.board {
  position: relative;
  width: 100%;
  border-radius: 22px;
  background: #ffefda;
  background-image:
    linear-gradient(rgba(93, 64, 55, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(93, 64, 55, 0.05) 1px, transparent 1px);
  /* aspect-ratio 与 background-size 由棋盘行列数动态注入（boardStyle） */
  box-shadow:
    inset 0 3px 12px rgba(93, 64, 55, 0.1),
    0 8px 24px rgba(93, 64, 55, 0.14);
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

/* ---- 元素类型配色（保证任意表情图下都可辨识） ---- */
.tile-inner[data-type='0'] {
  --tc: #ffd9a8;
  --ts: #f2a65a;
}
.tile-inner[data-type='1'] {
  --tc: #c9ebd3;
  --ts: #7cc79a;
}
.tile-inner[data-type='2'] {
  --tc: #c4dff5;
  --ts: #7aa7d9;
}
.tile-inner[data-type='3'] {
  --tc: #e3d2f1;
  --ts: #ac8cd0;
}
.tile-inner[data-type='4'] {
  --tc: #fcefc3;
  --ts: #d9b95c;
}
.tile-inner[data-type='5'] {
  --tc: #fbd3de;
  --ts: #de89a6;
}

.tile {
  position: absolute;
  left: 0;
  top: 0;
  /* 宽高由棋盘行列数动态注入（tileStyle） */
  padding: 3px;
  transition: transform 0.3s cubic-bezier(0.25, 0.9, 0.35, 1.12);
  will-change: transform;
}

.tile-inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 26%;
  background: var(--tc, #ffd9a8);
  box-shadow:
    0 2px 0 rgba(93, 64, 55, 0.15),
    inset 0 -2px 0 rgba(93, 64, 55, 0.06);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tile-inner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.tile-inner .cat-face {
  width: 88%;
  height: 88%;
}

.type-dot {
  position: absolute;
  right: 7%;
  bottom: 7%;
  width: 15%;
  height: 15%;
  min-width: 6px;
  min-height: 6px;
  border-radius: 50%;
  background: var(--ts, #f2a65a);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
}

/* ---- 状态动画 ---- */
.tile-inner.selected {
  animation: bob 0.6s ease-in-out infinite alternate;
  box-shadow:
    0 0 0 3px #fff,
    0 0 0 6px var(--primary, #ff9f43);
}

.tile-inner.hinted {
  animation: pulse 1s ease-in-out infinite;
}

/* 注意：.removing 必须先于 .blasted/.rainbowBlast 声明，
   否则同优先级下普通 pop 动画会覆盖特殊消失动画 */
.tile-inner.removing {
  animation: pop 0.3s ease-in forwards;
}

/* ---- 特殊块：炸弹猫 ---- */
.tile-inner.bomb {
  box-shadow:
    0 2px 0 rgba(93, 64, 55, 0.15),
    0 0 14px rgba(255, 90, 60, 0.55);
}

.bomb-ring {
  position: absolute;
  inset: 4%;
  border-radius: 30%;
  border: 2.5px dashed #ff5a3c;
  pointer-events: none;
  z-index: 3;
  animation: ringSpin 3.2s linear infinite;
}

/* ---- 特殊块：彩虹猫 ---- */
.tile-inner.rainbow {
  background: #fff;
  box-shadow:
    0 2px 0 rgba(93, 64, 55, 0.15),
    0 0 16px rgba(124, 77, 255, 0.45);
}

.rainbow-ring {
  position: absolute;
  inset: 0;
  border-radius: 26%;
  background: conic-gradient(
    #ff8fa3,
    #ffd166,
    #7bd88f,
    #4cc9f0,
    #b28dff,
    #ff8fa3
  );
  animation: ringSpin 2.4s linear infinite;
  pointer-events: none;
  z-index: 0;
}

.tile-inner.rainbow .cat-face {
  width: 78%;
  height: 78%;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.95));
}

/* 角落特殊块小徽章 */
.spec-glyph {
  position: absolute;
  top: 3%;
  right: 5%;
  width: 26%;
  height: 26%;
  z-index: 4;
  display: flex;
  pointer-events: none;
}

.spec-glyph :deep(svg) {
  width: 100%;
  height: 100%;
}

.glyph-bomb {
  color: #e53935;
  filter: drop-shadow(0 1px 1.5px rgba(255, 255, 255, 0.9));
}

.glyph-rainbow {
  color: #7c4dff;
  filter: drop-shadow(0 1px 1.5px rgba(255, 255, 255, 0.9));
}

/* 特殊块诞生 */
.tile-inner.born {
  animation: bornIn 0.55s cubic-bezier(0.3, 1.6, 0.5, 1);
}

/* 连锁波及：闪白消失 */
.tile-inner.blasted {
  animation: blastFlash 0.34s ease-in forwards;
}

/* 彩虹猫主动激活：旋转升天 */
.tile-inner.rainbowBlast {
  animation: rbBlast 0.52s ease-in forwards;
}

@keyframes ringSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes bornIn {
  0% {
    transform: scale(0.2) rotate(-100deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.24) rotate(10deg);
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

@keyframes blastFlash {
  0% {
    filter: brightness(1);
  }
  30% {
    filter: brightness(2.3) saturate(0.25);
    transform: scale(1.14);
  }
  100% {
    filter: brightness(3);
    transform: scale(0);
    opacity: 0;
  }
}

@keyframes rbBlast {
  0% {
    transform: scale(1) rotate(0deg);
    filter: brightness(1);
  }
  40% {
    transform: scale(1.5) rotate(180deg);
    filter: brightness(1.7) hue-rotate(180deg);
  }
  100% {
    transform: scale(0) rotate(360deg);
    opacity: 0;
  }
}

.tile-inner.shake {
  animation: shake 0.32s ease;
}

@keyframes pop {
  40% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(0);
    opacity: 0;
  }
}

@keyframes bob {
  from {
    transform: scale(1.06);
  }
  to {
    transform: scale(1.16);
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-14%) rotate(-4deg);
  }
  75% {
    transform: translateX(14%) rotate(4deg);
  }
}

/* ---- 得分飘字 ---- */
.pop-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.score-pop {
  position: absolute;
  transform: translate(-50%, -50%);
  font-weight: 800;
  color: #f07e1d;
  text-shadow: 0 2px 0 #fff;
  font-size: clamp(14px, 4.2vw, 22px);
  animation: floatUp 0.9s ease-out forwards;
  white-space: nowrap;
}

@keyframes floatUp {
  from {
    opacity: 0;
    transform: translate(-50%, -30%) scale(0.6);
  }
  20% {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: translate(-50%, -160%) scale(1.15);
  }
}
</style>
