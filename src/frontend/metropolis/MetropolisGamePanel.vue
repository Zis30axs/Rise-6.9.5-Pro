<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import MapCharacterAvatar from '../MapCharacterAvatar.vue';
import type { GameDestination, GameDistrict, GameMapContext, GamePerson } from './game-map.types';

const props = withDefaults(defineProps<{
  context: GameMapContext;
  selectedId: GameDestination['id'] | null;
  districtId?: GameDistrict['id'] | null;
  selectedPersonId?: GamePerson['id'] | null;
  busy?: boolean;
  travellingId?: GameDestination['id'] | null;
  error?: string;
}>(), {
  districtId: null,
  selectedPersonId: null,
  busy: false,
  travellingId: null,
  error: '',
});

const emit = defineEmits<{
  select: [locationId: GameDestination['id']];
  travel: [locationId: GameDestination['id']];
  district: [districtId: GameDistrict['id'] | null];
  person: [personId: GamePerson['id']];
}>();

const query = ref('');
const expanded = ref(Boolean(props.selectedId || props.selectedPersonId));
const scrollArea = ref<HTMLElement>();
const contentId = 'metropolis-game-panel-' + useId();
const selected = computed(() => props.context.destinations.find(destination => destination.id === props.selectedId));
const district = computed(() => props.context.districts.find(item => item.id === props.districtId));
const working = computed(() => props.busy || props.context.busy || Boolean(props.travellingId));
const canTravel = computed(() => Boolean(selected.value && !selected.value.current && !selected.value.disabled && !working.value));
const travelLabel = computed(() => {
  if (!selected.value) return '';
  if (selected.value.current) return selected.value.actionLabel;
  if (props.travellingId === selected.value.id) return '正在前往…';
  return working.value ? '请稍候…' : selected.value.actionLabel;
});

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

const filteredDestinations = computed(() => {
  const needle = normalized(query.value);
  return props.context.destinations.filter(destination => {
    if (district.value && destination.districtId !== district.value.id) return false;
    if (!needle) return true;
    const area = props.context.districts.find(item => item.id === destination.districtId);
    return normalized([destination.name, destination.category, area?.name, area?.caption].filter(Boolean).join(' ')).includes(needle);
  });
});

function chooseDestination(id: GameDestination['id']) {
  expanded.value = true;
  emit('select', id);
}

function chooseDistrict(id: GameDistrict['id'] | null) {
  query.value = '';
  expanded.value = true;
  emit('district', id);
}

function choosePerson(id: GamePerson['id']) {
  expanded.value = true;
  emit('person', id);
}

function requestTravel() {
  if (canTravel.value && selected.value) emit('travel', selected.value.id);
}

function personDistrict(person: GamePerson): string {
  return props.context.districts.find(item => item.id === person.districtId)?.caption ?? '';
}

watch(() => props.selectedId, async id => {
  if (!id) return;
  expanded.value = true;
  await nextTick();
  if (scrollArea.value) scrollArea.value.scrollTop = 0;
});

watch(() => props.selectedPersonId, id => {
  if (id) expanded.value = true;
});
</script>

<template>
  <aside class="mgp" :class="{ 'is-expanded': expanded, 'has-selection': selected }" aria-label="城市地点与行程" data-game-panel>
    <header class="mgp-header">
      <div class="mgp-heading"><h2>城市行程</h2><span>{{ context.dayLabel }}</span></div>
      <time class="mgp-clock" :datetime="context.clockLabel">{{ context.clockLabel }}</time>
      <button type="button" class="mgp-toggle" data-game-panel-toggle :aria-expanded="expanded" :aria-controls="contentId" :aria-label="expanded ? '收起地点与行程' : '展开地点与行程'" @click="expanded = !expanded">
        <span>{{ expanded ? '收起' : '选地点' }}</span>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 10 4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </header>

    <button type="button" class="mgp-current" data-game-current :aria-label="'查看当前位置：' + context.currentLocation.name" @click="chooseDestination(context.currentLocation.id)">
      <span class="mgp-avatar mgp-avatar--player"><MapCharacterAvatar :name="context.protagonist.name" :protagonist-id="context.protagonist.id" /></span>
      <span class="mgp-current-copy"><small>{{ context.protagonist.name }}<i aria-hidden="true">·</i>当前位置</small><strong>{{ context.currentLocation.name }}</strong></span>
      <svg class="mgp-locate" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="5.5" stroke="currentColor" /><circle cx="10" cy="10" r="1.8" fill="currentColor" /><path d="M10 1v4m0 10v4M1 10h4m10 0h4" stroke="currentColor" /></svg>
    </button>

    <div :id="contentId" ref="scrollArea" class="mgp-content">
      <p v-if="context.notice" class="mgp-notice">{{ context.notice }}</p>

      <section v-if="selected" class="mgp-selection" :aria-label="selected.name + '的出行信息'" data-game-selection>
        <div class="mgp-selection-top"><span>{{ selected.category }}</span><span v-if="selected.current" class="mgp-current-tag">正在此处</span><span v-else class="mgp-target-tag">目的地</span></div>
        <h3>{{ selected.name }}</h3>
        <p v-if="selected.description" class="mgp-description">{{ selected.description }}</p>
        <div v-if="selected.openState" class="mgp-hours" :class="{ 'is-open': selected.openState.isOpen }">
          <span><i aria-hidden="true"></i>{{ selected.openState.statusLabel }}</span><small>{{ selected.openState.hoursLabel }}</small>
        </div>
        <div v-if="selected.quoteLabel && !selected.current" class="mgp-quote"><span>本次行程</span><p>{{ selected.quoteLabel }}</p></div>
        <p v-if="!selected.current && selected.routeLine.length > 1" class="mgp-direction"><svg viewBox="0 0 20 12" fill="none" aria-hidden="true"><circle cx="3" cy="6" r="2" stroke="currentColor" /><path d="M7 6h10m-3-3 3 3-3 3" stroke="currentColor" stroke-dasharray="2 2" /></svg>出行方向示意</p>
        <p v-if="selected.reason && !selected.current" class="mgp-reason">{{ selected.reason }}</p>
        <p v-if="error" class="mgp-error" role="alert">{{ error }}</p>
        <button type="button" class="mgp-travel" :class="{ 'is-current': selected.current }" :data-game-travel="selected.id" :disabled="!canTravel" :aria-busy="travellingId === selected.id" @click="requestTravel">
          <span>{{ travelLabel }}</span><span aria-hidden="true">{{ selected.current ? '✓' : '↗' }}</span>
        </button>
      </section>
      <p v-else-if="error" class="mgp-error" role="alert">{{ error }}</p>

      <div class="mgp-search">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.3" /><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
        <input v-model="query" type="search" data-game-search :aria-label="district ? '搜索' + district.name + '内的地点' : '搜索城市地点或街区'" :placeholder="district ? '搜索当前城区' : '搜索地点或街区'" autocomplete="off" spellcheck="false" />
        <button v-if="query" type="button" class="mgp-clear" aria-label="清除搜索" @click="query = ''">×</button>
      </div>

      <section class="mgp-district-block" aria-label="选择城区">
        <div class="mgp-section-heading"><h3>城市分区</h3><span>{{ context.districts.length }} 个城区</span></div>
        <nav class="mgp-district-grid" aria-label="城区">
          <button type="button" class="mgp-district-all" :class="{ 'is-active': !district }" :aria-pressed="!district" data-game-district="all" @click="chooseDistrict(null)">全城</button>
          <button v-for="area in context.districts" :key="area.id" type="button" class="mgp-district" :class="{ 'is-active': districtId === area.id, 'is-current': area.current }" :data-game-district="area.id" :aria-pressed="districtId === area.id" :aria-label="area.name + '，' + area.count + '个地点'" :title="area.name" @click="chooseDistrict(area.id)"><span>{{ area.caption }}</span><i v-if="area.current" aria-hidden="true"></i></button>
        </nav>
      </section>

      <section v-if="context.people.length" class="mgp-people" aria-label="可见人物的位置">
        <div class="mgp-section-heading"><h3>熟悉的身影</h3><span>{{ context.people.length }}</span></div>
        <div class="mgp-person-list">
          <button v-for="person in context.people" :key="person.id" type="button" class="mgp-person" :class="{ 'is-active': selectedPersonId === person.id }" :data-game-person="person.id" :aria-pressed="selectedPersonId === person.id" :aria-label="'查看' + person.name + '的位置'" @click="choosePerson(person.id)">
            <span class="mgp-avatar"><MapCharacterAvatar :name="person.name" :person-id="person.personId" :portrait-id="person.portraitId" :protagonist-id="person.protagonistId" /></span>
            <span class="mgp-person-copy"><strong>{{ person.name }}</strong><small>{{ personDistrict(person) }}</small></span>
          </button>
        </div>
      </section>

      <section class="mgp-destinations" aria-label="目的地">
        <div class="mgp-section-heading"><h3>{{ query.trim() ? '查找结果' : district ? district.caption : '全部目的地' }}</h3><span>{{ filteredDestinations.length }} 处</span></div>
        <div v-if="filteredDestinations.length" class="mgp-destination-list">
          <button v-for="destination in filteredDestinations" :key="destination.id" type="button" class="mgp-destination" :class="{ 'is-selected': selectedId === destination.id, 'is-current': destination.current }" :data-game-destination="destination.id" :aria-pressed="selectedId === destination.id" :aria-label="'查看地点：' + destination.name" @click="chooseDestination(destination.id)">
            <span class="mgp-place-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path v-if="destination.kind === 'interior'" d="m3 9 7-6 7 6v8h-5v-5H8v5H3V9Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /><path v-else d="M15.5 8c0 4-5.5 9-5.5 9S4.5 12 4.5 8a5.5 5.5 0 1 1 11 0Z" stroke="currentColor" stroke-width="1.2" /><circle v-if="destination.kind !== 'interior'" cx="10" cy="8" r="1.8" stroke="currentColor" /></svg></span>
            <span class="mgp-destination-copy"><strong>{{ destination.name }}</strong><span><small>{{ destination.category }}</small><small v-if="destination.current" class="mgp-status-current">此刻在这里</small><small v-else-if="destination.openState" :class="{ 'mgp-status-open': destination.openState.isOpen }">{{ destination.openState.statusLabel }}</small></span></span>
            <span class="mgp-destination-arrow" aria-hidden="true">↗</span>
          </button>
        </div>
        <div v-else class="mgp-empty"><p>{{ query.trim() ? '没有找到相符的地点。' : '这个城区暂时没有可查看的地点。' }}</p><button v-if="district" type="button" @click="emit('district', null)">在全城查找 <span aria-hidden="true">↗</span></button><button v-else-if="query" type="button" @click="query = ''">查看全部地点 <span aria-hidden="true">↗</span></button></div>
      </section>
    </div>
  </aside>
</template>
