<script setup lang="ts">
import { computed } from 'vue';
import { parseNovelDialogue, type NovelSegment } from './novel-dialogue';
import { storyDisplayText } from './story-text';

const props = defineProps<{ text: string; role: 'user' | 'assistant' }>();
const emit = defineEmits<{ segment: [segment: NovelSegment] }>();
const blocks = computed(() => {
  const segments = props.role === 'user' ? [{ speaker: '你的行动', emotion: '平静', text: props.text }]
    : parseNovelDialogue(storyDisplayText(props.text));
  const grouped: { dialogue: boolean; segments: NovelSegment[] }[] = [];
  for (const segment of segments) {
    const dialogue = !!segment.speaker;
    const last = grouped.at(-1);
    if (last?.dialogue === dialogue) last.segments.push(segment);
    else grouped.push({ dialogue, segments: [segment] });
  }
  return grouped;
});
function opened(event: Event, segments: NovelSegment[]) {
  if ((event.currentTarget as HTMLDetailsElement).open && segments.length) emit('segment', segments[0]);
}
</script>

<template>
  <template v-for="(block, index) in blocks" :key="index">
    <details v-if="block.dialogue" class="story-dialogue-fold" data-story-dialogue @toggle="opened($event, block.segments)">
      <summary>{{ role === 'user' ? '展开你的行动' : `展开对白 · ${block.segments.length} 句` }}</summary>
      <p v-for="(segment, offset) in block.segments" :key="offset" @click="emit('segment', segment)"><span class="story-speaker">{{ segment.speaker }}</span><br>{{ segment.text }}</p>
    </details>
    <p v-else v-for="(segment, offset) in block.segments" :key="offset" data-story-event>{{ segment.text }}</p>
  </template>
</template>
