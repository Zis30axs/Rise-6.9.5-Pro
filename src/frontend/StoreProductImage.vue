<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getStoreProductImage } from './store-product-images';

const props = defineProps<{ itemId: string; name: string }>();
const source = computed(() => getStoreProductImage(props.itemId));
const failedSource = ref<string | null>(null);
watch(source, () => { failedSource.value = null; }, { flush: 'sync' });
function handleImageError(event: Event) {
  const failed = (event.currentTarget as HTMLImageElement).getAttribute('src');
  if (failed === source.value) failedSource.value = failed;
}
</script>

<template>
  <img v-if="source && source !== failedSource" :key="source" class="store-product-image" :src="source" :alt="name" :data-product-image="itemId" draggable="false" decoding="async" @error="handleImageError" />
  <span v-else class="store-product-image store-product-placeholder" role="img" :aria-label="name"><svg v-if="itemId === 'crychic-photo'" data-photo-placeholder viewBox="0 0 64 72" aria-hidden="true"><rect x="6" y="10" width="52" height="52" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 50h40M12 56h26" fill="none" stroke="currentColor" stroke-width="2"/><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="19" cy="26" r="4"/><circle cx="32" cy="23" r="4"/><circle cx="45" cy="26" r="4"/><path d="M12 43v-4a7 7 0 0 1 14 0v4m-1 0V36a7 7 0 0 1 14 0v7m-1 0v-4a7 7 0 0 1 14 0v4"/></g></svg><svg v-else-if="itemId === 'stationery-r27et1'" viewBox="0 0 64 72" aria-hidden="true"><path d="M15 59 45 13l6 4-30 46-10 5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m18 55 6 4M40 22l6 4" fill="none" stroke="currentColor" stroke-width="2"/></svg><svg v-else-if="itemId === 'mutsumi-cucumber'" viewBox="0 0 64 72" aria-hidden="true"><path d="M22 57c-5-4-6-13-1-25 4-9 11-17 17-20 4-2 8 1 8 5 0 8-5 20-11 30-4 7-9 12-13 10Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M38 12c1-4 4-6 8-6m-16 27c2 1 4 3 5 5m-8 4c2 1 3 3 4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><svg v-else viewBox="0 0 64 72" aria-hidden="true"><path d="M15 21h34l5 43H10zM23 23v-8a9 9 0 0 1 18 0v8" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 39h16M24 47h16" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
</template>
