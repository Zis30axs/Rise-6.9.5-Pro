<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { scenePersonLabel } from '../runtime/scene-context';
import { worldMapRadarPeople } from '../runtime/world-presence';
import type { WorldState } from './types';

const props = defineProps<{
  state: WorldState;
  resolveLocation: (locationId: string) => string | undefined;
}>();
const emit = defineEmits<{ locate: [locationId: string]; close: [] }>();
const query = ref('');
const input = ref<HTMLInputElement>();

const people = computed(() => worldMapRadarPeople(props.state).flatMap(row => {
  for (const locationId of [row.locationId, row.placeId]) {
    const place = props.resolveLocation(locationId);
    if (place) return [{ id: row.person.id, name: scenePersonLabel(row.person), locationId, place }];
  }
  return [];
}));
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, '');
const matches = computed(() => {
  const term = normalize(query.value);
  return people.value.filter(person => normalize(person.name).includes(term));
});
onMounted(() => input.value?.focus({ preventScroll: true }));
</script>

<template>
  <section class="map-person-search" aria-label="人物搜索" @keydown.esc.prevent.stop="emit('close')">
    <div class="map-person-input">
      <input ref="input" v-model="query" type="search" placeholder="输入人物姓名" aria-label="搜索人物姓名">
      <button type="button" aria-label="关闭人物搜索" @click="emit('close')">关闭</button>
    </div>
    <ul v-if="matches.length" class="map-person-results" aria-label="人物搜索结果">
      <li v-for="person in matches" :key="person.id">
        <button type="button" @click="emit('locate', person.locationId)">
          <strong>{{ person.name }}</strong>
          <small>{{ person.place }}</small>
        </button>
      </li>
    </ul>
    <p v-else role="status">{{ people.length ? '没有找到这个名字。' : '此刻没有可定位的人物。' }}</p>
  </section>
</template>
