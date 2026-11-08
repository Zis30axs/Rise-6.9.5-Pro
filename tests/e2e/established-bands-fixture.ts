import { createApp, h, reactive } from 'vue';
import FocusTreePanel from '../../src/frontend/FocusTreePanel.vue';
import SocietyPanel from '../../src/frontend/SocietyPanel.vue';
import shellCss from '../../src/frontend/shell.css?inline';
// @ts-expect-error The existing phone renderer is JavaScript without a declaration file.
import { renderBandPanel } from '../../integration/dual-protagonists/phone-messenger.js';
import { createInitialState, parseState, reduceState } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';
import { livehousePhoneView } from '../../src/runtime/livehouse';
import type { ShellActions, ShellModel, WorldAction } from '../../src/frontend/types';

const scenario = new URLSearchParams(location.search).get('scenario');
let state = enableProtagonists(createInitialState());
if (scenario === 'sakiko') state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
if (scenario === 'departed') {
  const strategy = state.protagonists!.strategy!;
  strategy.people.soyo.completed.push('soyo_face_past');
  strategy.people.soyo.active = { id: 'soyo_rebuild_crychic', startedAt: strategy.cursor, progress: 4319 };
  state = reduceState(parseState(state), { type: 'wait', minutes: 1 });
}
const owner = scenario === 'sakiko' ? 'sakiko' : 'soyo';
const model = reactive({ state, busy: false, notice: '' } as ShellModel);
const actions = { dispatch(action: WorldAction) { model.state = reduceState(model.state, action); } } as ShellActions;
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = {
  esc, btn: (action: string, label: string, cls: string, attrs = '') => `<button data-action="${esc(action)}" class="${esc(cls)}" ${attrs}>${esc(label)}</button>`,
  heading: (title: string) => `<h2>${esc(title)}</h2>`, time: (at: number) => `第 ${Math.floor(at / 1440) + 1} 天`,
};
const shadow = document.querySelector('#app')!.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = shellCss + ':host{display:block;color:#dce0e8;font-family:system-ui,sans-serif}main{box-sizing:border-box;max-width:1100px;padding:12px;margin:auto;display:grid;gap:24px;min-width:0}main>section{min-width:0}button,select{font:inherit}';
shadow.append(style);
const mount = document.createElement('div'); shadow.append(mount);
createApp({ render: () => h('main', [
  h(SocietyPanel, { model, actions }), h(FocusTreePanel, { model, actions }),
  h('section', { 'data-testid': 'band-phone', innerHTML: renderBandPanel({ owner, music: livehousePhoneView(model.state, owner) }, helpers) }),
]) }).mount(mount);
