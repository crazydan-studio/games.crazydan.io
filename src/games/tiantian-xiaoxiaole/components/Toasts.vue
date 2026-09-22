<script setup>
import { toasts } from '../utils/toast'
</script>

<template>
  <div class="toasts">
    <transition-group name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.msg }}</div>
    </transition-group>
  </div>
</template>
