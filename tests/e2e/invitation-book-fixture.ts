import { createApp, reactive, toRaw } from 'vue';
import App from '../../src/frontend/App.vue';
import '../../src/frontend/shell.css';
import { reduceState } from '../../src/runtime/model';
import { invitationBookFixtureState } from './invitation-book-state';
import type { ShellActions, ShellModel } from '../../src/frontend/types';

localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
const state = invitationBookFixtureState();
const model = reactive<ShellModel>({ state, busy: false, mode: 'demo', notice: '', memoryScope: 'invitation-layout', connection: '', externalPhoneAvailable: false, externalPhoneOpen: false, phoneStatus: 'idle', phoneError: '', phoneSource: 'none', phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] });
const dispatched: unknown[] = [], sent: string[] = [];
const actions: ShellActions = {
  dispatch(action) { dispatched.push(action); model.state = reduceState(toRaw(model.state), action); },
  async send(text) { sent.push(text); },
  exit() {}, switchChat() {}, openPhone() {}, closePhone() {}, async openPhoneContact() {}, retryPhoneSync() {},
};
Object.assign(window, { invitationFixture: { model, dispatched, sent } });
createApp(App, { model, actions }).mount('#app');
