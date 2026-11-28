<script lang="ts">
import { onScopeDispose, ref, shallowRef } from 'vue';
import { live2dPack } from '../runtime/live2d-pack';

// Keep an ongoing import visible if the player closes and reopens settings.
export const live2dPackBusy = ref(false);
const notice = ref('');
const errorDetail = ref('');
</script>

<script setup lang="ts">
const api = live2dPack();
const state = shallowRef(api?.status());
const input = ref<HTMLInputElement>();
if (api) onScopeDispose(api.subscribe(() => { state.value = api.status(); }));

async function perform(operation: () => Promise<void>) {
  if (live2dPackBusy.value) return;
  live2dPackBusy.value = true;
  notice.value = '正在处理…';
  errorDetail.value = '';
  try {
    await operation();
    notice.value = '已完成';
  } catch (error) {
    notice.value = '未完成，请重试';
    if (error && typeof error === 'object' && 'message' in error) errorDetail.value = String(error.message);
    console.warn('[UnreadCity Live2D]', error);
  } finally {
    live2dPackBusy.value = false;
  }
}
function selectFile(event: Event) {
  const picker = event.currentTarget as HTMLInputElement;
  const file = picker.files?.[0];
  picker.value = '';
  if (file && api) void perform(() => api.install(file, progress => { notice.value = progress; }));
}
</script>

<template>
  <section v-if="api && state" class="uc-narrative-settings" aria-label="Live2D 素材">
    <div class="uc-narrative-heading"><h2>Live2D 素材</h2></div>
    <input ref="input" type="file" accept=".zip,application/zip" style="display:none" @change="selectFile">
    <div class="uc-narrative-buttons">
      <button type="button" :disabled="live2dPackBusy || state.hydrating" @click="input?.click()">{{ state.installed ? '更换' : '安装' }} Live2D 素材 ZIP</button>
      <template v-if="state.installed">
        <button type="button" :disabled="live2dPackBusy" @click="perform(() => api!.setEnabled(!state!.enabled))">{{ state.enabled ? '停用' : '启用' }}</button>
        <button type="button" :disabled="live2dPackBusy" @click="perform(() => api!.remove())">移除</button>
      </template>
    </div>
    <p v-if="notice" class="uc-narrative-notice" role="status" :title="errorDetail || undefined">{{ notice }}</p>
  </section>
</template>
