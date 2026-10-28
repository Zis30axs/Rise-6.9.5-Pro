import { describe, expect, it } from 'vitest';
import { createApp, reactive, nextTick } from 'vue';
import LocationServices from '../src/frontend/LocationServices.vue';
import PlaceActions from '../src/frontend/PlaceActions.vue';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { CONSTRUCTION_BACKEND_JOB_ID } from '../src/runtime/location-services';

function mount(Component, extra = {}) {
  let state = enableProtagonists(createInitialState());
  state = reduceState(state, { type: 'choose_academics', majorId: 'computer-science' });
  state.clock = { day: 2, hour: 8, minute: 0 };
  state.locationId = 'construction-site';
  state.scene = null;
  state.player.energy = 95;
  if (state.protagonists?.backgroundLife) {
    const minute = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    state.protagonists.backgroundLife.cursor = minute;
    for (const p of Object.values(state.protagonists.backgroundLife.people)) p.nextDecisionAt = Math.max(p.nextDecisionAt, minute);
  }
  const model = reactive({ state, busy: false, notice: '' }), calls = [];
  const actions = {
    dispatch(action) { calls.push(action); model.state = reduceState(model.state, action); },
    interact: async action => { calls.push(action); model.state = reduceState(model.state, action); return true; },
  };
  const target = document.createElement('div'); document.body.append(target);
  const app = createApp(Component, { model, actions, novelMode: true, ...extra }); app.mount(target);
  return { target, model, calls, cleanup() { app.unmount(); target.remove(); } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('backend recruitment UI', () => {
  it('reveals the concrete job only after applying; cancellation costs nothing', async () => {
    const x = mount(LocationServices); await nextTick();
    const id = CONSTRUCTION_BACKEND_JOB_ID;
    const card = x.target.querySelector(`[data-location-service="${id}"]`);
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Java');
    expect(card.textContent).toContain('Kubernetes');
    expect(card.textContent).toContain('不用带电脑');
    expect(card.textContent).not.toMatch(/4900|6800|水泥/);
    const money = x.model.state.player.balance;
    card.querySelector(`[data-use-location-service="${id}"]`).click();
    await nextTick();
    expect(x.calls).toHaveLength(0);
    expect(x.model.state.player.balance).toBe(money);
    const revealed = card.querySelector(`[data-job-reveal="${id}"]`);
    expect(revealed.textContent).toContain('4900 袋水泥');
    expect(revealed.textContent).toContain('200 元/人');
    expect(revealed.textContent).toContain('6800 日元');
    card.querySelector(`[data-cancel-backend-job="${id}"]`).click();
    await nextTick();
    expect(x.calls).toHaveLength(0);
    expect(x.model.state.clock.hour).toBe(8);
    expect(card.querySelector('[data-job-reveal]')).toBeNull();
    card.querySelector(`[data-use-location-service="${id}"]`).click();
    await nextTick();
    card.querySelector(`[data-confirm-backend-job="${id}"]`).click();
    await tick(); await nextTick();
    expect(x.calls).toEqual([{ type: 'location_service', serviceId: id }]);
    expect(x.model.state.clock.hour).toBe(12);
    expect(x.model.state.player.balance - money).toBe(6800);
    x.cleanup();
  });

  it('lets an ill applicant read the advert first without exposing heavy labor until application', async () => {
    const x = mount(LocationServices); await nextTick();
    x.model.state.player.health = 30;
    await nextTick();
    const card = x.target.querySelector(`[data-location-service="${CONSTRUCTION_BACKEND_JOB_ID}"]`);
    expect(card.textContent).not.toMatch(/感冒|重体力|4900|水泥|75 点精力/);
    const apply = card.querySelector('[data-use-location-service]');
    expect(apply.disabled).toBe(false);
    apply.click(); await nextTick();
    expect(card.textContent).toContain('4900 袋水泥');
    expect(card.textContent).toMatch(/感冒|重体力|畏寒/);
    expect(card.querySelector('[data-confirm-backend-job]').disabled).toBe(true);
    expect(x.calls).toHaveLength(0);
    x.cleanup();
  });

  it('keeps the quick action from spoiling the wages and cargo', async () => {
    const emitted = [];
    const x = mount(PlaceActions, { catalog: true, onService: id => emitted.push(id) });
    await nextTick();
    const quick = x.target.querySelector(`[data-quick-service="${CONSTRUCTION_BACKEND_JOB_ID}"]`);
    expect(quick).toBeTruthy();
    expect(quick.disabled).toBe(false);
    expect(quick.textContent).toContain('后端开发');
    expect(quick.textContent).not.toMatch(/4900|6800|水泥/);
    quick.click();
    expect(emitted).toEqual([CONSTRUCTION_BACKEND_JOB_ID]);
    x.cleanup();
  });
});
