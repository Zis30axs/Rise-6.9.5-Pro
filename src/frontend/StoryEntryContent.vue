<script setup lang="ts">
import { computed, ref } from 'vue';
import { parseNovelDialogue, type NovelSegment } from './novel-dialogue';
import { storyDisplayText } from './story-text';
import { protagonistNames } from '../runtime/protagonist-world';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { WorldState } from './types';

const props = defineProps<{ text: string; role: 'user' | 'assistant'; protagonist: string;
  otherSideBeats?: WorldState['story'][number]['otherSideBeats']; returnStory?: string }>();
const emit = defineEmits<{ segment: [segment: NovelSegment]; switchSide: [target: ProtagonistId] }>();
const returned = ref(false);
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
const scenes = computed(() => (props.otherSideBeats ?? []).map(beat => ({
  ...beat, segments: parseNovelDialogue(storyDisplayText(beat.text)),
  title: beat.protagonists.map(id => protagonistNames[id]).join('、'),
})));
const targets = computed(() => [...new Set((props.otherSideBeats ?? []).flatMap(beat => beat.protagonists))]);
const currentReturn = computed(() => props.returnStory ? parseNovelDialogue(storyDisplayText(props.returnStory)) : []);
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
  <section v-if="scenes.length" class="other-side-inline" data-other-side-inline>
    <div v-for="(scene, i) in scenes" :key="i" class="other-side-scene">
      <h4>与此同时 · {{ scene.title }}</h4>
      <p v-for="(segment, j) in scene.segments" :key="j" data-story-event @click="emit('segment', segment)">
        <strong v-if="segment.speaker">{{ segment.speaker }}：</strong>{{ segment.text }}
      </p>
    </div>
    <div class="other-side-choices" aria-label="旁线视角选择">
      <p>回到现在，还是继续另一位主角的视角？</p>
      <button type="button" data-side-continue @click="returned = true">继续{{ protagonist }}的视角</button>
      <button v-for="target in targets" :key="target" type="button" :data-side-target="target"
        @click="emit('switchSide', target)">切换到{{ protagonistNames[target] }}的视角</button>
    </div>
    <div v-if="returned" data-side-return class="other-side-return">
      <h4>回到现在 · {{ protagonist }}</h4>
      <p v-for="(segment, index) in currentReturn" :key="index" @click="emit('segment', segment)">
        <strong v-if="segment.speaker">{{ segment.speaker }}：</strong>{{ segment.text }}
      </p>
    </div>
  </section>
</template>
