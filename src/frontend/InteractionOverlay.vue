<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const anchor = ref<HTMLElement>();
const dialog = ref<HTMLElement>();
const interaction = computed(() => props.model.interaction);
const progress = computed(() => Math.round(Math.max(0, Math.min(100, interaction.value?.progress ?? 0))));
let previousFocus: HTMLElement | null = null;
let previousReplyId = '';
watch(() => interaction.value?.phase, async (phase, previous) => {
  if (phase && !previous) {
    previousReplyId = props.model.state.story.filter(entry => entry.role === 'assistant').at(-1)?.id ?? '';
    const root = anchor.value?.getRootNode() as ShadowRoot | Document | undefined;
    const active = root?.activeElement ?? anchor.value?.ownerDocument.activeElement;
    previousFocus = active && typeof (active as HTMLElement).focus === 'function' ? active as HTMLElement : null;
  }
  await nextTick();
  if (!phase) {
    const latestReplyId = props.model.state.story.filter(entry => entry.role === 'assistant').at(-1)?.id ?? '';
    if (latestReplyId === previousReplyId && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null; previousReplyId = ''; return;
  }
  if (phase === 'choice' || phase === 'error') dialog.value?.querySelector<HTMLElement>('[data-interaction-reject]')?.focus({ preventScroll: true });
  else dialog.value?.focus({ preventScroll: true });
});
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.actions.cancelInteraction?.(); return; }
  if (event.key !== 'Tab' || !dialog.value) return;
  const controls = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled)'));
  const first = controls[0], last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && (event.target === first || event.target === dialog.value)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (event.target === last || event.target === dialog.value)) { event.preventDefault(); first.focus(); }
}
onBeforeUnmount(() => { previousFocus = null; });
</script>

<template>
  <div ref="anchor" style="display: contents">
  <div v-if="interaction" class="interaction-overlay" data-interaction-overlay :data-interaction-phase="interaction.phase">
    <section ref="dialog" class="interaction-dialog" role="dialog" aria-modal="true" aria-labelledby="uc-interaction-heading" tabindex="-1" @keydown="keydown">
      <header><small>此刻的行动</small><button type="button" aria-label="取消本次交互" data-interaction-cancel @click="actions.cancelInteraction?.()">×</button></header>
      <h2 id="uc-interaction-heading">{{ interaction.label }}</h2>
      <div class="interaction-progress" :class="{ 'is-generating': interaction.phase === 'generating' }" role="progressbar" aria-label="交互进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress" data-interaction-progress><span :style="{ width: progress + '%' }"></span></div>
      <template v-if="interaction.phase === 'choice'">
        <p class="interaction-question">似乎出现了不同寻常的事……<br>需要继续吗？</p>
        <div class="interaction-choices"><button type="button" class="interaction-secondary" data-interaction-reject @click="actions.resolveInteraction?.(false)">否，正常进行</button><button type="button" class="interaction-primary" data-interaction-accept @click="actions.resolveInteraction?.(true)">是，继续看看</button></div>
      </template>
      <template v-else-if="interaction.phase === 'error'">
        <p class="interaction-error" role="alert">{{ interaction.error || '本次交互尚未保存，请重试。' }}</p>
        <div class="interaction-choices"><button type="button" class="interaction-secondary" data-interaction-reject @click="actions.resolveInteraction?.(false)">正常完成原交互</button><button type="button" class="interaction-primary" data-interaction-retry @click="actions.resolveInteraction?.(true)">重试突发事件</button></div>
        <small>也可取消，本次行动不会结算。</small>
      </template>
      <p v-else class="interaction-status" role="status">{{ interaction.phase === 'generating' ? '故事正在发生，稍候片刻……' : '正在进行……' }}</p>
    </section>
  </div>
  </div>
</template>
