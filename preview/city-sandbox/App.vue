<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import WorldMap from '../../src/frontend/WorldMap.vue';
import type { ShellActions, ShellModel, WorldAction } from '../../src/frontend/types';
import { createInitialState, novelDestinations, reduceState } from '../../src/runtime/model';
import { gameCalendar } from '../../src/runtime/game-calendar';

/** The preview owns one disposable world, entirely separate from a Tavern host. */
function createPreviewState() {
  const state = createInitialState();
  state.clock = { ...state.clock, hour: 17, minute: 30 };
  return state;
}

const model = reactive<ShellModel>({
  mode: 'demo',
  state: createPreviewState(),
  busy: false,
  notice: '',
  connection: '',
  externalPhoneAvailable: false,
  externalPhoneOpen: false,
  phoneStatus: 'idle',
  phoneError: '',
  phoneSource: 'none',
  phoneLinkStatus: 'idle',
  phoneLinkError: '',
  phoneUnread: 0,
  phoneContactUnread: [],
});
const mapSession = ref(0);
const announcement = ref('');
const locationName = computed(() => novelDestinations.find(place => place.id === model.state.locationId)?.name ?? '城市街区');
const calendar = computed(() => gameCalendar(model.state.clock.day));
const clockLabel = computed(() => `${String(model.state.clock.hour).padStart(2, '0')}:${String(model.state.clock.minute).padStart(2, '0')}`);

function dispatch(action: WorldAction): boolean {
  if (model.busy) return false;
  // WorldMap's explicit destination actions use the same deterministic reducer
  // as the card. In particular, novel_travel delegates to planNovelTravel,
  // retaining its route, time, fare, energy, interior and availability rules.
  if (!['novel_travel', 'travel', 'leave_interior'].includes(action.type)) return false;
  model.notice = '';
  announcement.value = '';
  model.busy = true;
  try {
    model.state = reduceState(model.state, action);
    announcement.value = `已抵达${locationName.value}，现在是 ${clockLabel.value}。`;
    return true;
  } catch (error) {
    model.notice = error instanceof Error ? error.message : '这次出行未能完成，请重试。';
    return false;
  } finally {
    model.busy = false;
  }
}

// Host-only controls are intentionally unavailable in this map-only entry.
// WorldMap never calls these methods; no host, phone, generation or save bridge
// is mounted, and there is no timer that advances the world's clock.
const actions: ShellActions = {
  dispatch: action => { dispatch(action); },
  interact: async action => dispatch(action),
  send: async () => {},
  exit() {},
  switchChat() {},
  openPhone() {},
  closePhone() {},
  openPhoneContact: async () => {},
  retryPhoneSync() {},
};

function startAgain() {
  model.state = createPreviewState();
  model.notice = '';
  announcement.value = '已回到南门，新的旅程从暮色开始。';
  mapSession.value += 1;
}
</script>

<template>
  <div class="uc-shell city-preview">
    <a class="preview-skip" href="#city-map">前往城市地图</a>
    <header class="preview-masthead">
      <a class="preview-brand" href="./" aria-label="未读之城，重新开始">
        <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M3 23V9l6-4v18M11 23V3l6 4v16M19 23V12l6-4v15M1 25h26"/><path d="M5.5 11h1M5.5 15h1M13.5 9h1M13.5 13h1M13.5 17h1M21.5 14h1M21.5 18h1"/></svg>
        <span><strong>未读之城</strong><small>UNREAD CITY</small></span>
      </a>
      <div class="preview-now" aria-label="当前游戏时间和地点">
        <span class="preview-location"><i aria-hidden="true" />{{ locationName }}</span>
        <time :datetime="`${calendar.iso}T${clockLabel}`">{{ calendar.month }}.{{ String(calendar.date).padStart(2, '0') }} <b>{{ clockLabel }}</b></time>
      </div>
      <button class="preview-reset" type="button" :disabled="model.busy" @click="startAgain"><span aria-hidden="true">↻</span> 重新漫游</button>
    </header>
    <main id="city-map" class="preview-map" tabindex="-1" aria-label="城市沙盘">
      <WorldMap :key="mapSession" :model="model" :actions="actions" novel-mode />
    </main>
    <p class="preview-announcement" role="status" aria-live="polite">{{ announcement }}</p>
    <aside v-if="model.notice" class="preview-notice" role="alert">
      <p>{{ model.notice }}</p><button type="button" aria-label="关闭提示" @click="model.notice = ''">×</button>
    </aside>
    <footer class="preview-footer"><span>街巷之间，下一段故事正在等待。</span><span>UNREAD CITY · CITY ATLAS</span></footer>
  </div>
</template>
