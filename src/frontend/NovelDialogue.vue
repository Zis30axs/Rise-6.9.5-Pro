<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { parseNovelDialogue, type NovelSegment } from './novel-dialogue';
import { storyDisplayText } from './story-text';
import { novelPortraitFocus } from './novel-portrait-focus';
import { novelInvitationPortraitFocus, type NovelInvitationPortraitPair, type NovelInvitationPortraitFocus } from './novel-invitation-portraits';
import { protagonistNames } from '../runtime/protagonist-world';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { WorldState } from './types';
import {
  resolveReadingCursor,
  saveNovelReadingProgress,
} from './novel-reading-progress';

const props = defineProps<{
  entries: WorldState['story'];
  busy: boolean;
  active: boolean;
  protagonist: string;
  protagonistId?: ProtagonistId | string;
  memoryScope?: string;
  recognizesSpeaker: (speaker: string) => boolean;
  invitationPair?: NovelInvitationPortraitPair | null;
  focusTarget?: { id: string; token: number };
}>();

const emit = defineEmits<{
  segment: [segment: NovelSegment];
  focus: [focus: { speaker: string; emotion: string; dimmed: boolean }];
  invitationFocus: [focus: NovelInvitationPortraitFocus | null];
  history: [];
  switchSide: [target: ProtagonistId];
}>();

type ViewingRow = NovelSegment & { id: string; entryId: string; viewpoint: string; choiceTargets?: ProtagonistId[] };
const cursor = ref(0);
const rows = computed<ViewingRow[]>(() => props.entries.flatMap(entry => {
  const segments: ViewingRow[] = [];
  const add = (segment: NovelSegment, choiceTargets?: ProtagonistId[], viewpoint = props.protagonist) => {
    segments.push({ ...segment, id: `${entry.id}:${segments.length}`, entryId: entry.id, viewpoint,
      ...(choiceTargets ? { choiceTargets } : {}) });
  };
  if (entry.role === 'user') {
    add({ speaker: '你的行动', emotion: '平静', text: entry.text });
    return segments;
  }
  for (const segment of parseNovelDialogue(storyDisplayText(entry.text))) add(segment);
  if (!entry.otherSideBeats?.length) return segments;
  for (const beat of entry.otherSideBeats) {
    const viewpoint = protagonistNames[beat.protagonists[0]!];
    add({ speaker: '', emotion: '平静',
      text: `与此同时 · ${beat.protagonists.map(id => protagonistNames[id]).join('、')}` }, undefined, viewpoint);
    for (const segment of parseNovelDialogue(storyDisplayText(beat.text))) add(segment, undefined, viewpoint);
  }
  const targets = [...new Set(entry.otherSideBeats.flatMap(beat => beat.protagonists))];
  add({ speaker: '', emotion: '平静', text: '这一侧的故事已发生。回到现在，还是继续另一位主角的视角？' }, targets);
  add({ speaker: '', emotion: '平静', text: `镜头回到${props.protagonist}。` });
  if (entry.returnStory) for (const segment of parseNovelDialogue(storyDisplayText(entry.returnStory))) add(segment);
  return segments;
}));

const current = computed(() => rows.value[cursor.value]);
const sideChoice = computed(() => current.value?.choiceTargets ?? null);
const canAdvance = computed(() => cursor.value < rows.value.length - 1);
const portraitFocus = computed(() => novelPortraitFocus(rows.value, cursor.value, current.value?.viewpoint ?? props.protagonist, props.recognizesSpeaker));
const invitationFocus = computed(() => props.invitationPair ? novelInvitationPortraitFocus(rows.value, cursor.value, props.invitationPair) : null);

const currentProtagonistKey = computed(() => props.protagonistId || props.protagonist);

let lastKnownLatestEntryId: string | null = null;
let lastKnownProtagonistKey = currentProtagonistKey.value;
let lastKnownScope = props.memoryScope;

function persistCurrentProgress() {
  const row = current.value;
  if (!row) return;
  saveNovelReadingProgress(props.memoryScope, currentProtagonistKey.value, {
    entryId: row.entryId,
    segmentId: row.id,
    segmentIndex: cursor.value,
    completed: cursor.value >= rows.value.length - 1,
    updatedAt: Date.now(),
  });
}

function syncCursor() {
  const heroChanged = currentProtagonistKey.value !== lastKnownProtagonistKey;
  const scopeChanged = props.memoryScope !== lastKnownScope;

  if (heroChanged || scopeChanged) {
    lastKnownLatestEntryId = null;
    lastKnownProtagonistKey = currentProtagonistKey.value;
    lastKnownScope = props.memoryScope;
    emittedSegment = '';
  }

  const nextCursor = resolveReadingCursor({
    rows: rows.value,
    entries: props.entries,
    scope: props.memoryScope,
    protagonistId: currentProtagonistKey.value,
    lastKnownLatestEntryId,
    switchedHero: heroChanged,
  });

  cursor.value = nextCursor;
  lastKnownLatestEntryId = props.entries.at(-1)?.id ?? null;
  persistCurrentProgress();
}

watch(
  [() => props.entries.at(-1)?.id, currentProtagonistKey, () => props.memoryScope],
  () => {
    syncCursor();
  },
  { immediate: true }
);

watch(() => props.focusTarget, target => {
  if (!target) return;
  const start = rows.value.findIndex(row => row.entryId === target.id);
  if (start >= 0) {
    cursor.value = start;
    persistCurrentProgress();
  }
}, { immediate: true });

let emittedSegment = '';
watch([current, portraitFocus, invitationFocus, () => props.active], ([row, focus, doubleFocus, active]) => {
  if (active) { emit('focus', focus); emit('invitationFocus', doubleFocus); }
  if (!active) { emittedSegment = ''; return; }
  if (!row || row.id === emittedSegment) return;
  emittedSegment = row.id;
  emit('segment', row);
}, { immediate: true });

function advance() {
  if (canAdvance.value) {
    cursor.value++;
    persistCurrentProgress();
  }
}

function retreat() {
  if (cursor.value > 0) {
    cursor.value--;
    persistCurrentProgress();
  }
}
let lastWheelStepAt = 0;

function onDialogueWheel(event: WheelEvent) {
  const textBox = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('.novel-dialogue-text');
  if (textBox && textBox.scrollHeight > textBox.clientHeight + 2) {
    const canScrollUp = event.deltaY < 0 && textBox.scrollTop > 0;
    const canScrollDown = event.deltaY > 0 && textBox.scrollTop + textBox.clientHeight < textBox.scrollHeight - 1;
    if (canScrollUp || canScrollDown) return;
  }
  if (sideChoice.value || Math.abs(event.deltaY) < 6) return;
  const now = Date.now();
  if (now - lastWheelStepAt < 140) {
    event.preventDefault();
    return;
  }
  if (event.deltaY < 0 && cursor.value > 0) {
    event.preventDefault();
    lastWheelStepAt = now;
    retreat();
  } else if (event.deltaY > 0 && canAdvance.value) {
    event.preventDefault();
    lastWheelStepAt = now;
    advance();
  }
}
</script>

<template>
  <div class="novel-dialogue" data-novel-dialogue :data-segment="cursor" :data-segment-count="rows.length"
    :data-speaker="current?.speaker ?? ''" :data-emotion="current?.emotion ?? ''" @wheel="onDialogueWheel">
    <button class="novel-dialogue-text" aria-label="点击推进剧情" :disabled="!canAdvance || !!sideChoice" @click="advance">
      <span class="novel-speaker">{{ current?.speaker || '旁白' }}</span>
      <span class="novel-speech" aria-live="polite">{{ current?.text || '故事即将开始。' }}</span>
    </button>
    <div v-if="sideChoice" class="other-side-choices" data-other-side-choices aria-label="旁线视角选择">
      <button type="button" data-side-continue @click="advance">继续{{ protagonist }}的视角</button>
      <button v-for="target in sideChoice" :key="target" type="button" :data-side-target="target"
        @click="emit('switchSide', target)">切换到{{ protagonistNames[target] }}的视角</button>
    </div>
    <div class="novel-dialogue-controls">
      <button :disabled="cursor === 0" aria-label="上一句剧情" @click="retreat">上一句</button>
      <button @click="emit('history')">全文回看</button>
      <button v-if="!sideChoice" :disabled="!canAdvance" aria-label="下一句剧情" @click="advance">{{ canAdvance ? '点击继续 ▸' : busy ? '等待下一段…' : '本段已读完' }}</button>
    </div>
  </div>
</template>
