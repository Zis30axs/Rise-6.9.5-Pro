<script setup lang="ts">
defineEmits<{ dismiss: [] }>();
</script>

<template>
  <button type="button" class="receipt-close" aria-label="关闭提示" @click="$emit('dismiss')">×</button>
</template>
