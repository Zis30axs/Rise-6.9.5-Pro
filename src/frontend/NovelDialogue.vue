<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { parseNovelDialogue, type NovelSegment } from './novel-dialogue';
import { storyDisplayText } from './story-text';
import { novelPortraitFocus } from './novel-portrait-focus';
import type { WorldState } from './types';

const props = defineProps<{ entries: WorldState['story']; busy: boolean; active: boolean; protagonist: string; recognizesSpeaker: (speaker: string) => boolean }>();
const emit = defineEmits<{ segment: [segment: NovelSegment]; focus: [focus: { speaker: string; emotion: string; dimmed: boolean }]; history: [] }>();
const cursor = ref(0);
const rows = computed(() => props.entries.flatMap(entry => entry.role === 'assistant'
  ? parseNovelDialogue(storyDisplayText(entry.text)).map((segment, index) => ({ ...segment, id: `${entry.id}:${index}`, entryId: entry.id }))
  : [{ id: `${entry.id}:0`, entryId: entry.id, speaker: '你的行动', emotion: '平静', text: entry.text }]));
const current = computed(() => rows.value[cursor.value]);
const canAdvance = computed(() => cursor.value < rows.value.length - 1);
const portraitFocus = computed(() => novelPortraitFocus(rows.value, cursor.value, props.protagonist, props.recognizesSpeaker));
watch(() => props.entries.at(-1)?.id, () => {
  const latest = props.entries.at(-1)?.id;
  const start = rows.value.findIndex(row => row.entryId === latest);
  cursor.value = Math.max(0, start);
}, { immediate: true });
let emittedSegment = '';
watch([current, portraitFocus, () => props.active], ([row, focus, active]) => {
  if (active) emit('focus', focus);
  if (!active) { emittedSegment = ''; return; }
  if (!row || row.id === emittedSegment) return;
  emittedSegment = row.id;
  emit('segment', row);
}, { immediate: true });
function advance() { if (canAdvance.value) cursor.value++; }
</script>

<template>
  <div class="novel-dialogue" data-novel-dialogue :data-segment="cursor" :data-segment-count="rows.length"
    :data-speaker="current?.speaker ?? ''" :data-emotion="current?.emotion ?? ''">
    <button class="novel-dialogue-text" aria-label="点击推进剧情" :disabled="!canAdvance" @click="advance">
      <span class="novel-speaker">{{ current?.speaker || '旁白' }}</span>
      <span class="novel-speech" aria-live="polite">{{ current?.text || '故事即将开始。' }}</span>
    </button>
    <div class="novel-dialogue-controls">
      <button :disabled="cursor === 0" aria-label="上一句剧情" @click="cursor--">上一句</button>
      <button @click="emit('history')">全文回看</button>
      <button :disabled="!canAdvance" aria-label="下一句剧情" @click="advance">{{ canAdvance ? '点击继续 ▸' : busy ? '等待下一段…' : '本段已读完' }}</button>
    </div>
  </div>
</template>
