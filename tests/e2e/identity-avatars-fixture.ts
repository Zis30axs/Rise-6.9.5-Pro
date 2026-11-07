import { createApp, h, reactive } from 'vue';
import IdentityCardPanel from '../../src/frontend/IdentityCardPanel.vue';
import MapCharacterAvatar from '../../src/frontend/MapCharacterAvatar.vue';
import '../../src/frontend/identity-card.css';
import '../../src/frontend/campus-map.css';
import { createInitialState } from '../../src/runtime/model';
import type { ShellActions, ShellModel } from '../../src/frontend/types';

const model = reactive({ state: createInitialState() } as ShellModel);
const actions = { dispatch() {} } as unknown as ShellActions;
const people = [
  { personId: 'bang-uika', name: '三角初华' },
  { personId: 'bang-umiri', name: '八幡海铃' },
  { personId: 'bang-nyamu', name: '祐天寺若麦' },
];
createApp({
  render: () => h('main', [
    h('div', { class: 'world-map avatar-samples' }, people.map(person =>
      h('div', { 'data-avatar-sample': person.personId }, [h(MapCharacterAvatar, person), h('p', person.name)]))),
    h(IdentityCardPanel, { model, actions }),
  ]),
}).mount('#app');
