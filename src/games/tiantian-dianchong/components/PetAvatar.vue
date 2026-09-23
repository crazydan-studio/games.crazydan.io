<script setup>
// ============ 参数化 SVG 宠物 ============
// look（物种造型参数）驱动外形：耳/尾/鼻吻/附加件 + 配色；
// stage 驱动体型缩放；mood/illness/dead 驱动表情；behavior 驱动 CSS 动画。
import { computed } from 'vue'

const props = defineProps({
  species: { type: Object, required: true },
  stageKey: { type: String, default: 'adult' },
  mood: { type: Number, default: 70 },
  behavior: { type: String, default: 'idle' },
  dead: { type: Boolean, default: false },
  coma: { type: Boolean, default: false },
  asleep: { type: Boolean, default: false },
  illness: { type: Object, default: null }
})

const look = computed(() => props.species.look)
const stageScale = computed(
  () => ({ baby: 0.72, teen: 0.88, adult: 1, elder: 0.96 }[props.stageKey] ?? 1)
)
const bodyTransform = computed(
  () => `translate(${(1 - stageScale.value) * 100} ${(1 - stageScale.value) * 190}) scale(${stageScale.value})`
)

const rootClass = computed(() => ({
  [`act-${props.behavior}`]: true,
  'is-gone': props.dead || props.coma,
  'is-elder': props.stageKey === 'elder',
  'is-sick': !!props.illness && !props.dead
}))

// ---- 眼睛形态 ----
const eyeKind = computed(() => {
  if (props.dead) return 'dead'
  if (props.asleep || props.coma) return 'closed'
  if (props.illness) return 'dizzy'
  if (props.mood >= 70) return 'happy'
  if (props.mood >= 40) return 'normal'
  if (props.mood >= 20) return 'low'
  return 'sad'
})

// ---- 嘴巴形态 ----
const mouthKind = computed(() => {
  if (props.dead) return 'flat'
  if (props.asleep || props.coma) return 'sleep'
  if (props.illness) return 'sick'
  if (props.mood >= 70) return 'laugh'
  if (props.mood >= 40) return 'smile'
  if (props.mood >= 20) return 'flat'
  return 'sad'
})

const mouthPath = computed(() => {
  switch (mouthKind.value) {
    case 'laugh': return 'M88 108 q12 12 24 0'
    case 'smile': return 'M91 110 q9 7 18 0'
    case 'flat': return 'M92 111 h16'
    case 'sad': return 'M91 113 q9 -7 18 0'
    case 'sick': return 'M94 110 q6 5 12 0'
    case 'sleep': return 'M95 110 q5 4 10 0'
    default: return 'M92 111 h16'
  }
})

const ink = '#4A3728'
const happyBlush = computed(() => props.mood >= 70 && !props.dead && !props.coma)
</script>

<template>
  <svg class="pet-svg pet-root" :class="rootClass" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" :aria-label="species.name">
    <!-- 地面影 -->
    <ellipse cx="100" cy="188" rx="44" ry="7" fill="rgba(30,60,50,0.13)" />

    <g class="pet-body" :transform="bodyTransform">
      <!-- ===== 尾巴 ===== -->
      <!-- 猫：上翘条纹尾 -->
      <path
        v-if="look.tail === 'striped'"
        d="M148 138 Q186 122 176 82" fill="none" :stroke="look.accent" stroke-width="11" stroke-linecap="round"
      />
      <path
        v-if="look.tail === 'striped'"
        d="M168 96 q6 10 2 18 M174 82 q4 8 1 14" fill="none" :stroke="ink" stroke-width="4" stroke-linecap="round" opacity="0.55"
      />
      <!-- 狗：摇摆尾 -->
      <g v-if="look.tail === 'wag'" class="tail-wag">
        <path d="M148 132 Q184 98 170 62" fill="none" :stroke="look.body" stroke-width="13" stroke-linecap="round" />
        <path d="M170 62 q6 8 4 16" fill="none" :stroke="look.accent" stroke-width="12" stroke-linecap="round" opacity="0.5" />
      </g>
      <!-- 猪：卷卷尾 -->
      <path
        v-if="look.tail === 'curly'"
        d="M150 130 q18 -8 12 -20 q-5 -10 -16 -3 q-6 5 -1 10" fill="none" :stroke="look.accent" stroke-width="7" stroke-linecap="round"
      />
      <!-- 恐龙：刺尾 -->
      <g v-if="look.tail === 'spikes'">
        <path d="M146 136 Q182 116 172 84" fill="none" :stroke="look.body" stroke-width="14" stroke-linecap="round" />
        <path d="M158 122 l14 -2 -7 -12 Z M164 104 l14 -1 -5 -12 Z" :fill="look.accent" />
      </g>

      <!-- ===== 背刺（恐龙附加件） ===== -->
      <g v-if="look.extra === 'back-spikes'">
        <path d="M78 112 l7 -18 7 18 Z M97 106 l7 -20 7 20 Z M116 112 l7 -18 7 18 Z" :fill="look.accent" />
      </g>

      <!-- ===== 身体 ===== -->
      <ellipse cx="100" cy="142" rx="43" ry="33" :fill="look.body" />
      <ellipse cx="100" cy="152" rx="25" ry="19" :fill="look.belly" />

      <!-- ===== 项圈（狗附加件） ===== -->
      <g v-if="look.extra === 'collar'">
        <path d="M72 118 q28 14 56 0" fill="none" stroke="#E85D5D" stroke-width="8" stroke-linecap="round" />
        <circle cx="100" cy="130" r="6.5" fill="#FFD34E" stroke="#E0A800" stroke-width="2" />
      </g>

      <!-- ===== 耳朵 ===== -->
      <!-- 尖耳（猫） -->
      <g v-if="look.ear === 'pointed'">
        <path d="M58 58 L66 16 L92 40 Z" :fill="look.body" />
        <path d="M142 58 L134 16 L108 40 Z" :fill="look.body" />
        <path d="M65 50 L69 28 L83 41 Z" :fill="look.accent" opacity="0.75" />
        <path d="M135 50 L131 28 L117 41 Z" :fill="look.accent" opacity="0.75" />
      </g>
      <!-- 垂耳（狗） -->
      <g v-if="look.ear === 'floppy'">
        <ellipse cx="63" cy="62" rx="13" ry="25" :fill="look.accent" transform="rotate(-14 63 62)" />
        <ellipse cx="137" cy="62" rx="13" ry="25" :fill="look.accent" transform="rotate(14 137 62)" />
      </g>
      <!-- 圆耳（猪） -->
      <g v-if="look.ear === 'round'">
        <circle cx="70" cy="50" r="14" :fill="look.body" />
        <circle cx="130" cy="50" r="14" :fill="look.body" />
        <circle cx="70" cy="50" r="7" :fill="look.accent" opacity="0.7" />
        <circle cx="130" cy="50" r="7" :fill="look.accent" opacity="0.7" />
      </g>
      <!-- 角（恐龙） -->
      <g v-if="look.ear === 'horn'">
        <path d="M74 48 L68 22 L88 40 Z" :fill="look.accent" />
        <path d="M126 48 L132 22 L112 40 Z" :fill="look.accent" />
      </g>

      <!-- ===== 头 ===== -->
      <circle cx="100" cy="86" r="44" :fill="look.body" />
      <!-- 头部浅色区 -->
      <path d="M64 96 a44 44 0 0 0 72 0 a40 40 0 0 1 -72 0 Z" :fill="look.belly" opacity="0.55" />

      <!-- ===== 眼睛 ===== -->
      <g class="pet-eyes" stroke-linecap="round">
        <!-- 死亡 ✕✕ -->
        <g v-if="eyeKind === 'dead'" :stroke="ink" stroke-width="4.5">
          <path d="M76 72 l12 12 M88 72 l-12 12" fill="none" />
          <path d="M112 72 l12 12 M124 72 l-12 12" fill="none" />
        </g>
        <!-- 闭眼 -->
        <g v-else-if="eyeKind === 'closed'" :stroke="ink" stroke-width="4.5" fill="none">
          <path d="M75 80 q9 8 18 0" />
          <path d="M107 80 q9 8 18 0" />
        </g>
        <!-- 生病 > < -->
        <g v-else-if="eyeKind === 'dizzy'" :stroke="ink" stroke-width="4.5" fill="none">
          <path d="M75 74 l14 8 M89 74 l-14 8" />
          <path d="M111 74 l14 8 M125 74 l-14 8" />
        </g>
        <!-- 开心 ^ ^ -->
        <g v-else-if="eyeKind === 'happy'" :stroke="ink" stroke-width="4.5" fill="none">
          <path d="M75 82 q9 -12 18 0" />
          <path d="M107 82 q9 -12 18 0" />
        </g>
        <!-- 普通圆眼 -->
        <g v-else-if="eyeKind === 'normal'">
          <circle cx="84" cy="80" r="6.5" :fill="ink" />
          <circle cx="116" cy="80" r="6.5" :fill="ink" />
          <circle cx="86" cy="77.5" r="2" fill="#fff" />
          <circle cx="118" cy="77.5" r="2" fill="#fff" />
        </g>
        <!-- 半闭 -->
        <g v-else-if="eyeKind === 'low'" :stroke="ink" stroke-width="4.5" fill="none">
          <path d="M75 79 h18 M107 79 h18" />
          <path d="M75 79 q9 4 18 0 M107 79 q9 4 18 0" opacity="0.7" />
        </g>
        <!-- 难过下垂 -->
        <g v-else :stroke="ink" stroke-width="4.5" fill="none">
          <path d="M75 84 q9 8 18 0 M107 84 q9 8 18 0" />
          <path d="M74 68 q9 -5 19 -1 M107 67 q10 -4 19 1" opacity="0.65" stroke-width="3.5" />
        </g>
      </g>

      <!-- 腮红 -->
      <ellipse v-if="happyBlush" cx="68" cy="98" rx="8" ry="5" fill="#FFB6C1" opacity="0.6" />
      <ellipse v-if="happyBlush" cx="132" cy="98" rx="8" ry="5" fill="#FFB6C1" opacity="0.6" />

      <!-- ===== 鼻吻 ===== -->
      <!-- 猫：三角鼻 -->
      <g v-if="look.snout === 'cat'">
        <path d="M94 95 L106 95 L100 103 Z" fill="#E88AA0" />
        <circle cx="97" cy="98" r="1.2" fill="#fff" opacity="0.7" />
      </g>
      <!-- 狗：大鼻头吻部 -->
      <g v-if="look.snout === 'dog'">
        <ellipse cx="100" cy="99" rx="16" ry="11" :fill="look.belly" />
        <ellipse cx="100" cy="94" rx="7.5" ry="6" :fill="ink" />
        <circle cx="97.5" cy="92" r="1.5" fill="#fff" opacity="0.65" />
      </g>
      <!-- 猪：大猪鼻 -->
      <g v-if="look.snout === 'pig'">
        <ellipse cx="100" cy="97" rx="14" ry="10" :fill="look.accent" opacity="0.9" />
        <ellipse cx="95" cy="97" rx="2.6" ry="3.6" :fill="ink" opacity="0.8" />
        <ellipse cx="105" cy="97" rx="2.6" ry="3.6" :fill="ink" opacity="0.8" />
      </g>
      <!-- 恐龙：双鼻孔 -->
      <g v-if="look.snout === 'dino'">
        <circle cx="92" cy="94" r="2.8" :fill="ink" opacity="0.85" />
        <circle cx="108" cy="94" r="2.8" :fill="ink" opacity="0.85" />
      </g>

      <!-- ===== 嘴 ===== -->
      <path :d="mouthPath" fill="none" :stroke="ink" stroke-width="3.6" stroke-linecap="round" />
      <!-- 开心吐舌（狗） -->
      <path
        v-if="mouthKind === 'laugh' && look.snout === 'dog'"
        d="M96 111 q4 8 8 0 q4 8 8 0" fill="#F2808C" stroke="#D96070" stroke-width="2" stroke-linejoin="round"
      />
      <!-- 恐龙小尖牙 -->
      <g v-if="mouthKind === 'laugh' && look.snout === 'dino'" fill="#fff">
        <path d="M92 109 l3 5 3 -5 Z" />
        <path d="M102 109 l3 5 3 -5 Z" />
      </g>

      <!-- ===== 胡须（猫附加件） ===== -->
      <g v-if="look.extra === 'whiskers'" :stroke="ink" stroke-width="2" stroke-linecap="round" opacity="0.55">
        <path d="M62 94 h-16 M62 100 l-16 4 M62 88 l-15 -4" fill="none" />
        <path d="M138 94 h16 M138 100 l16 4 M138 88 l15 -4" fill="none" />
      </g>
      <!-- ===== 獠牙（猪附加件） ===== -->
      <g v-if="look.extra === 'tusks'" fill="#FFFDF5" stroke="#E8E0C8" stroke-width="1">
        <path d="M90 112 q-1 7 -3 9 q4 1 6 -3 q1 -4 0 -7 Z" />
        <path d="M110 112 q1 7 3 9 q-4 1 -6 -3 q-1 -4 0 -7 Z" />
      </g>
    </g>

    <!-- 长寿白眉 -->
    <g v-if="stageKey === 'elder' && !dead" stroke="#F5F2E8" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.95">
      <path d="M76 66 q9 -6 17 -2" />
      <path d="M107 64 q9 -4 17 2" />
    </g>
  </svg>
</template>
