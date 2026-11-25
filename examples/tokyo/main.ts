import { createApp, defineComponent, h, reactive } from 'vue';
import WorldMap from '../../src/frontend/MapView.vue';
import { createInitialState, reduceState } from '../../src/runtime/model';
import type {
  ShellModel,
  ShellActions,
  WorldAction,
} from '../../src/frontend/types';
import mapStyle from '../../src/frontend/world-map.css?inline';
import campusStyle from '../../src/frontend/campus-map.css?inline';
import zoneStyle from '../../src/frontend/sandbox-zone-overlay.css?inline';
import style from './viewer.css?inline';

const key = 'unread-city-tokyo-diorama-v1';
function initial() {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.clock && s.scene && s.locationId) return s;
    }
  } catch {}
  return createInitialState();
}
const model = reactive({
  state: initial(),
  busy: false,
  notice: '',
}) as ShellModel;
const actions = {
  dispatch(action: WorldAction) {
    try {
      model.state = reduceState(model.state, action);
      model.notice = '';
      try {
        localStorage.setItem(key, JSON.stringify(model.state));
      } catch {}
    } catch (e) {
      model.notice = e instanceof Error ? e.message : String(e);
    }
  },
} as ShellActions;
const css = document.createElement('style');
css.textContent = [mapStyle, campusStyle, zoneStyle, style].join('\n');
document.head.append(css);
createApp(
  defineComponent({
    setup() {
      return () =>
        h('main', { class: 'tokyo-atlas' }, [
          h('header', { class: 'atlas-mast' }, [
            h('div', { class: 'atlas-brand' }, [
              h('i', { 'aria-hidden': 'true' }, '東'),
              h('div', [
                h('strong', '未读之城'),
                h('small', 'TOKYO CITY ATLAS'),
              ]),
            ]),
            h(
              'div',
              { class: 'atlas-clock' },
              '第 ' +
                model.state.clock.day +
                ' 天　' +
                String(model.state.clock.hour).padStart(2, '0') +
                '∶' +
                String(model.state.clock.minute).padStart(2, '0')
            ),
          ]),
          h(WorldMap, { model, actions, novelMode: true, tokyoOnly: true }),
          model.notice ? h('p', { role: 'status' }, model.notice) : null,
        ]);
    },
  })
).mount('#app');
