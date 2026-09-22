<script setup>
// 默认猫咪表情（天天）：无照片时的棋盘元素
import { computed } from 'vue'
import { catFaceSvg } from '../utils/catface'

const props = defineProps({
  variant: { type: Number, default: 0 }
})

const html = computed(() => catFaceSvg(props.variant))
</script>

<template>
  <div class="cat-face" v-html="html"></div>
</template>

<style scoped>
.cat-face {
  width: 86%;
  height: 86%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cat-face :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
