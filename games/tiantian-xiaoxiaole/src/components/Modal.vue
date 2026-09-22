<script setup>
// 基础弹窗（Teleport 到 body）
defineProps({
  wide: { type: Boolean, default: false },
  closable: { type: Boolean, default: true }
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" @click.self="closable && $emit('close')">
      <div class="modal-card" :class="{ wide }">
        <slot />
      </div>
    </div>
  </Teleport>
</template>
