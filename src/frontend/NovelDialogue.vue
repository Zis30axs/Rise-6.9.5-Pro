<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { parseNovelDialogue, type NovelSegment } from './novel-dialogue';
import { storyDisplayText } from './story-text';
import type { WorldState } from './types';

const props = defineProps<{ entries: WorldState['story']; busy: boolean }>();
const emit = defineEmits<{ segment: [segment: NovelSegment]; history: [] }>();
const cursor = ref(0);
const dialogueExpanded = ref(false);
const rows = computed(() => props.entries.flatMap(entry => entry.role === 'assistant'
  ? parseNovelDialogue(storyDisplayText(entry.text)).map((segment, index) => ({ ...segment, id: `${entry.id}:${index}`, entryId: entry.id }))
  : [{ id: `${entry.id}:0`, entryId: entry.id, speaker: '你的行动', emotion: '平静', text: entry.text }]));
const current = computed(() => rows.value[cursor.value]);
const canAdvance = computed(() => cursor.value < rows.value.length - 1);
const latestRows = computed(() => {
  const latest = [...props.entries].reverse().find(entry => entry.role === 'assistant');
  return latest ? rows.value.filter(row => row.entryId === latest.id) : [];
});
const eventRows = computed(() => latestRows.value.filter(row => !row.speaker));
const dialogueCount = computed(() => latestRows.value.filter(row => !!row.speaker).length);
watch(() => props.entries.at(-1)?.id, () => {
  const latest = props.entries.at(-1)?.id;
  const start = rows.value.findIndex(row => row.entryId === latest);
  cursor.value = Math.max(0, start);
  dialogueExpanded.value = false;
}, { immediate: true });
watch([current, dialogueExpanded, latestRows], () => {
  const row = dialogueExpanded.value ? current.value : [...latestRows.value].reverse().find(row => !!row.speaker) ?? current.value;
  if (row) emit('segment', row);
}, { immediate: true });
function advance() { if (canAdvance.value) cursor.value++; }
</script>

<template>
  <div class="novel-dialogue" data-novel-dialogue :data-segment="cursor" :data-segment-count="rows.length">
    <div v-if="!dialogueExpanded" class="novel-event-text" data-event-reading aria-live="polite">
      <p v-for="row in eventRows" :key="row.id">{{ row.text }}</p>
      <p v-if="!eventRows.length" class="dialogue-collapsed-note">{{ dialogueCount ? '这段交流已收起，可以展开对白继续阅读。' : '故事即将开始。' }}</p>
    </div>
    <button v-else class="novel-dialogue-text" aria-label="点击推进剧情" :disabled="!canAdvance" @click="advance">
      <span class="novel-speaker">{{ current?.speaker || '旁白' }}</span>
      <span class="novel-speech" aria-live="polite">{{ current?.text || '故事即将开始。' }}</span>
    </button>
    <div class="novel-dialogue-controls">
      <button v-if="dialogueExpanded" :disabled="cursor === 0" aria-label="上一句剧情" @click="cursor--">上一句</button>
      <button v-if="dialogueCount || dialogueExpanded" data-toggle-dialogue :aria-expanded="dialogueExpanded" @click="dialogueExpanded = !dialogueExpanded">{{ dialogueExpanded ? '收起对白' : `展开对白 · ${dialogueCount} 句` }}</button>
      <button @click="emit('history')">全文回看</button>
      <button v-if="dialogueExpanded" :disabled="!canAdvance" aria-label="下一句剧情" @click="advance">{{ canAdvance ? '点击继续 ▸' : busy ? '等待下一段…' : '本段已读完' }}</button>
    </div>
  </div>
</template>
