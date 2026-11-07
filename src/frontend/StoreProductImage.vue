<script setup lang="ts">
import { computed } from 'vue';
import { getStoreProductImage } from './store-product-images';

const props = defineProps<{ itemId: string; name: string }>();
const source = computed(() => getStoreProductImage(props.itemId));
</script>

<template>
  <img v-if="source" class="store-product-image" :src="source" :alt="name" :data-product-image="itemId" draggable="false" decoding="async" />
  <span v-else class="store-product-image store-product-placeholder" role="img" :aria-label="name"><svg v-if="itemId === 'stationery-r27et1'" viewBox="0 0 64 72" aria-hidden="true"><path d="M15 59 45 13l6 4-30 46-10 5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m18 55 6 4M40 22l6 4" fill="none" stroke="currentColor" stroke-width="2"/></svg><svg v-else viewBox="0 0 64 72" aria-hidden="true"><path d="M15 21h34l5 43H10zM23 23v-8a9 9 0 0 1 18 0v8" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 39h16M24 47h16" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
</template>
