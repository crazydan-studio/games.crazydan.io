<script setup>
// ============ 场景背景（参数化 SVG：渐变天空/地面 + 装饰件组合） ============
// 内置场景与 AI 生成场景共用同一渲染管线（scene 数据结构一致）。
import { computed } from 'vue'

const props = defineProps({
  scene: { type: Object, required: true },
  night: { type: Boolean, default: false } // 时段夜晚：叠加暮色
})

const gid = computed(() => `sc-${props.scene.id}`)
const groundTop = computed(() => (props.scene.groundY ?? 0.72) * 300)

function tf(p) {
  return `translate(${p.x * 400} ${p.y * 300}) scale(${p.s ?? 1})`
}
</script>

<template>
  <svg class="scene-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient :id="`${gid}-sky`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="scene.sky[0]" />
        <stop offset="1" :stop-color="scene.sky[1]" />
      </linearGradient>
      <linearGradient :id="`${gid}-ground`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="scene.ground[0]" />
        <stop offset="1" :stop-color="scene.ground[1]" />
      </linearGradient>
    </defs>

    <!-- 天空 -->
    <rect x="0" y="0" width="400" height="300" :fill="`url(#${gid}-sky)`" />

    <!-- 装饰件（远景→近景按 y 排序渲染） -->
    <g v-for="(p, i) in [...scene.props].sort((a, b) => a.y - b.y)" :key="i" :transform="tf(p)">
      <!-- 云 -->
      <g v-if="p.type === 'cloud'" class="prop-float">
        <ellipse cx="0" cy="0" rx="34" ry="14" fill="#FFFFFF" opacity="0.92" />
        <ellipse cx="-20" cy="5" rx="18" ry="10" fill="#FFFFFF" opacity="0.92" />
        <ellipse cx="20" cy="5" rx="20" ry="11" fill="#FFFFFF" opacity="0.92" />
      </g>
      <!-- 树 -->
      <g v-else-if="p.type === 'tree'">
        <rect x="-7" y="-30" width="14" height="46" rx="4" fill="#8A5A3B" />
        <circle cx="0" cy="-46" r="26" fill="#5FA85C" />
        <circle cx="-20" cy="-34" r="18" fill="#6FB86A" />
        <circle cx="20" cy="-34" r="18" fill="#54A052" />
        <circle cx="-4" cy="-58" r="12" fill="#7CC47A" opacity="0.85" />
      </g>
      <!-- 花 -->
      <g v-else-if="p.type === 'flower'">
        <path d="M0 12 q4 -12 2 -22" stroke="#5FA85C" stroke-width="3" fill="none" />
        <path d="M0 4 q-8 -2 -10 4 q8 2 10 -4 Z M1 0 q7 -4 10 1 q-7 4 -10 -1 Z" fill="#5FA85C" />
        <circle cx="0" cy="-24" r="5" :fill="p.color || '#FF8FA3'" />
        <circle cx="-7" cy="-20" r="4.5" :fill="p.color || '#FF8FA3'" />
        <circle cx="7" cy="-20" r="4.5" :fill="p.color || '#FF8FA3'" />
        <circle cx="-4" cy="-13" r="4.5" :fill="p.color || '#FF8FA3'" />
        <circle cx="4" cy="-13" r="4.5" :fill="p.color || '#FF8FA3'" />
        <circle cx="0" cy="-18" r="3.4" fill="#FFE9A8" />
      </g>
      <!-- 蝴蝶 -->
      <g v-else-if="p.type === 'butterfly'" class="prop-float">
        <ellipse cx="-8" cy="-4" rx="9" ry="7" fill="#FFC4D0" transform="rotate(-24 -8 -4)" />
        <ellipse cx="8" cy="-4" rx="9" ry="7" fill="#FFC4D0" transform="rotate(24 8 -4)" />
        <ellipse cx="0" cy="0" rx="2.4" ry="7" fill="#8A5A3B" />
      </g>
      <!-- 月亮 -->
      <g v-else-if="p.type === 'moon'">
        <path
          d="M0 -22 a22 22 0 1 0 0.1 0 Z M6 -18 a17 17 0 1 1 -0.1 0 Z"
          fill="#FFF3C2" fill-rule="evenodd" stroke="#F5D878" stroke-width="2"
        />
        <circle cx="-4" cy="-2" r="2" fill="#F0D080" opacity="0.6" />
        <circle cx="3" cy="6" r="1.4" fill="#F0D080" opacity="0.6" />
      </g>
      <!-- 星星 -->
      <g v-else-if="p.type === 'star'" class="prop-twinkle">
        <path d="M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z" fill="#FFF7D6" />
      </g>
      <!-- 城市剪影 -->
      <g v-else-if="p.type === 'cityline'" fill="#2E4058" opacity="0.85">
        <rect x="-90" y="-40" width="22" height="40" rx="2" />
        <rect x="-62" y="-62" width="26" height="62" rx="2" />
        <rect x="-30" y="-34" width="20" height="34" rx="2" />
        <rect x="-4" y="-52" width="30" height="52" rx="2" />
        <rect x="32" y="-30" width="22" height="30" rx="2" />
        <rect x="60" y="-46" width="26" height="46" rx="2" />
        <g fill="#FFE9A0" opacity="0.9">
          <rect x="-58" y="-54" width="4" height="5" /><rect x="-50" y="-46" width="4" height="5" /><rect x="-58" y="-38" width="4" height="5" />
          <rect x="2" y="-44" width="4" height="5" /><rect x="12" y="-36" width="4" height="5" /><rect x="18" y="-44" width="4" height="5" />
          <rect x="66" y="-38" width="4" height="5" />
        </g>
      </g>
      <!-- 栅栏 -->
      <g v-else-if="p.type === 'fence'">
        <rect x="-70" y="-12" width="140" height="7" rx="3" fill="#C9A06B" />
        <rect x="-70" y="-26" width="140" height="7" rx="3" fill="#C9A06B" />
        <rect x="-64" y="-30" width="9" height="36" rx="3" fill="#B8905B" />
        <rect x="-28" y="-30" width="9" height="36" rx="3" fill="#B8905B" />
        <rect x="8" y="-30" width="9" height="36" rx="3" fill="#B8905B" />
        <rect x="44" y="-30" width="9" height="36" rx="3" fill="#B8905B" />
      </g>
      <!-- 皮球 -->
      <g v-else-if="p.type === 'ball'">
        <circle cx="0" cy="0" r="13" :fill="p.color || '#FF8FA3'" />
        <path d="M-13 0 a13 13 0 0 1 26 0" fill="#FFFFFF" opacity="0.55" />
        <path d="M-13 0 a13 13 0 0 0 26 0" :fill="p.color || '#FF8FA3'" />
        <circle cx="-4" cy="-4" r="3" fill="#FFFFFF" opacity="0.7" />
      </g>
      <!-- 食盆 -->
      <g v-else-if="p.type === 'bowl'">
        <path d="M-16 -6 a16 10 0 0 0 32 0 Z" fill="#5B7FA6" />
        <ellipse cx="0" cy="-6" rx="16" ry="5" fill="#7C9CC0" />
        <ellipse cx="0" cy="-6" rx="11" ry="3.4" fill="#C9A06B" />
      </g>
      <!-- 落地灯 -->
      <g v-else-if="p.type === 'lamp'">
        <rect x="-3" y="-44" width="6" height="48" rx="2" fill="#8A5A3B" />
        <path d="M-16 -44 L16 -44 L9 -58 L-9 -58 Z" fill="#F5D878" stroke="#D9B84F" stroke-width="2" />
        <circle v-if="night" cx="0" cy="-40" r="26" fill="#FFE9A0" opacity="0.25" />
      </g>
      <!-- 窗户 -->
      <g v-else-if="p.type === 'window'">
        <rect x="-26" y="-32" width="52" height="58" rx="8" fill="#B7DCF2" stroke="#FFFFFF" stroke-width="6" />
        <g :stroke="'#FFFFFF'" stroke-width="5">
          <line x1="0" y1="-30" x2="0" y2="24" />
          <line x1="-24" y1="-4" x2="24" y2="-4" />
        </g>
        <g v-if="night" fill="#FFF3C2">
          <circle cx="14" cy="12" r="5" />
        </g>
        <g v-else fill="#FFFFFF" opacity="0.85">
          <ellipse cx="-12" cy="8" rx="8" ry="4" />
        </g>
      </g>
      <!-- 地毯 -->
      <g v-else-if="p.type === 'rug'">
        <ellipse cx="0" cy="0" rx="72" ry="20" :fill="p.color || '#F2B279'" opacity="0.9" />
        <ellipse cx="0" cy="0" rx="56" ry="14.5" fill="#FFFFFF" opacity="0.5" />
        <ellipse cx="0" cy="0" rx="38" ry="9" :fill="p.color || '#F2B279'" opacity="0.75" />
      </g>
      <!-- 小床 -->
      <g v-else-if="p.type === 'bed'">
        <rect x="-34" y="-6" width="68" height="20" rx="6" fill="#E8A0A8" />
        <rect x="-34" y="-12" width="68" height="10" rx="5" fill="#FBD0D6" />
        <ellipse cx="-20" cy="-10" rx="11" ry="6" fill="#FFFFFF" />
        <rect x="-30" y="12" width="7" height="14" rx="2" fill="#C98090" />
        <rect x="23" y="12" width="7" height="14" rx="2" fill="#C98090" />
      </g>
      <!-- 沙发 -->
      <g v-else-if="p.type === 'sofa'">
        <rect x="-38" y="-16" width="76" height="22" rx="10" fill="#7FB3A0" />
        <rect x="-38" y="-34" width="76" height="22" rx="10" fill="#8FC3AE" />
        <rect x="-44" y="-24" width="12" height="26" rx="6" fill="#6BA28F" />
        <rect x="32" y="-24" width="12" height="26" rx="6" fill="#6BA28F" />
        <rect x="-22" y="-26" width="20" height="16" rx="5" fill="#A8D5C2" />
        <rect x="2" y="-26" width="20" height="16" rx="5" fill="#A8D5C2" />
      </g>
    </g>

    <!-- 地面 -->
    <rect x="0" :y="groundTop" width="400" :height="300 - groundTop" :fill="`url(#${gid}-ground)`" />
    <ellipse cx="200" :cy="groundTop + 8" rx="220" ry="10" :fill="scene.ground[0]" opacity="0.6" />

    <!-- 时段夜晚：暮色叠加 -->
    <rect v-if="night" x="0" y="0" width="400" height="300" fill="#1B2A5E" opacity="0.22" />
  </svg>
</template>
