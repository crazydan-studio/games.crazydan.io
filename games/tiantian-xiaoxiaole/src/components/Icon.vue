<script setup>
// 轻量内联 SVG 图标集（stroke 风格）
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true }
})

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  camera: '<path d="M4 8h3.2L9 5.5h6L16.8 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  flip: '<path d="M20 5v5h-5"/><path d="M4 19v-5h5"/><path d="M19.5 10A8 8 0 0 0 5.7 7.7"/><path d="M4.5 14a8 8 0 0 0 13.8 2.3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-4 3.5 2.5L16 13l4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>',
  'star-fill': '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z" fill="currentColor"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.6.5-1 1.2-1 2.1h-5c0-.9-.4-1.6-1-2.1A6 6 0 0 1 12 3z"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13.5h9l1-13.5"/><path d="M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v11"/><path d="M8 10.5l4 4 4-4"/><path d="M4 20h16"/>',
  upload: '<path d="M12 21V10"/><path d="M8 13.5l4-4 4 4"/><path d="M4 4h16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9z"/>',
  volume: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
  'volume-off': '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  paw: '<circle cx="7" cy="8" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="8" r="2"/><circle cx="4.8" cy="12.5" r="1.7"/><circle cx="19.2" cy="12.5" r="1.7"/><path d="M12 11c2.8 0 5 2.3 5 4.6 0 1.6-1.1 2.6-2.3 2.6-.9 0-1.6-.5-2.7-.5s-1.8.5-2.7.5c-1.2 0-2.3-1-2.3-2.6 0-2.3 2.2-4.6 5-4.6z"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bomb: '<circle cx="10.5" cy="14" r="6.5"/><path d="M15.1 9.4l2.3-2.3"/><path d="M17.8 3.6l.8 1.5 1.5.8-1.5.8-.8 1.5-.8-1.5-1.5-.8 1.5-.8z"/>',
  rainbow: '<path d="M4.5 17a7.5 7.5 0 0 1 15 0"/><path d="M8 17a4 4 0 0 1 8 0"/><path d="M2.5 17h2M19.5 17h2"/>',
  'wifi-off': '<path d="M3 3l18 18"/><path d="M4.5 10a13 13 0 0 1 3.5-2.5"/><path d="M9.5 6.3a13 13 0 0 1 6.5.9"/><path d="M16.5 8.3a13 13 0 0 1 3 1.7"/><path d="M7 14a8 8 0 0 1 2-1.4"/><path d="M13.5 12.9a8 8 0 0 1 3.5 1.1"/><path d="M12 18.5h.01"/>'
}

const html = computed(() => ICONS[props.name] || '')
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="html"
  ></svg>
</template>
