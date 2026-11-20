import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { createHighlandModel } from '../src/frontend/highland-geometry';
import { districtMapPlaces } from '../src/frontend/map-districts';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { createAgenda, socialMinute } from '../src/runtime/social-agenda';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { worldSceneContext } from '../src/runtime/world-presence';
import type { SocialInvitation } from '../src/runtime/natural-interactions';

const home = 'residential-mutsumi';
const prompt = (state: ReturnType<typeof createInitialState>) => affinityPersonaPrompt(state, worldSceneContext(state), '聊聊吧。');

describe('高原住宅区与启航商贸探班', () => {
  it('places the villa and its cucumber trellises on the district model', () => {
    const model = createHighlandModel();
    const house = model.getObjectByName('Wakaba-house-and-balcony')!;
    const vines = model.getObjectByName('Cucumber-planters-and-trellises')!;
    const bounds = new Box3().setFromObject(model);
    expect(bounds.containsBox(new Box3().setFromObject(house))).toBe(true);
    expect(new Box3().setFromObject(vines).min.y).toBeGreaterThan(6);
    expect(districtMapPlaces('highland').map(place => place.id)).toEqual(['highland', home]);
  });

  it('travels to the district, honors the host’s appointment, gardens and reloads', () => {
    let state = reduceState(enableProtagonists(createInitialState()), { type: 'novel_travel', locationId: 'highland' });
    expect(state.locationId).toBe('highland');
    expect(state.transit.lastRide?.toStopId).toBe('highland');
    expect(getNovelTravelQuote(state, home).blockedReason).toContain('约好');
    expect(() => reduceState(state, { type: 'novel_travel', locationId: home })).toThrow('约好');
    const invite: SocialInvitation = { id: 'garden', owner: activeProtagonist(state), targetId: 'bang-mutsumi', targetName: '若叶睦',
      source: 'meeting', locationId: home, day: 1, time: '18:30', message: '到我家看看黄瓜。', status: 'accepted',
      createdAt: socialMinute(state), messageId: null, response: '好呀。' };
    invite.agenda = createAgenda({ rationale: '一起照料阳台花箱', steps: [
      { kind: 'depart', day: 1, time: '18:15', detail: '出发' },
      { kind: 'arrive', day: 1, time: '18:30', detail: '迎客' },
      { kind: 'leave', day: 1, time: '19:40', detail: '告别' },
    ] }, invite, socialMinute(state));
    state.protagonists!.socialInvitations = [invite];
    state = reduceState(state, { type: 'wait', minutes: 18 * 60 + 30 - socialMinute(state) });
    const otherGuest = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    expect(getNovelTravelQuote(otherGuest, home).blockedReason).toContain('约好');
    expect(getNovelTravelQuote(state, home).blockedReason).toBeNull();
    state = reduceState(state, { type: 'novel_travel', locationId: home });
    expect(state.interior?.roomId).toBe(home);
    expect(prompt(state)).not.toContain('受邀到高原住宅区的若叶家，陪睦');
    state = reduceState(state, { type: 'novel_approach', interactionId: 'wakaba-tend-vines' });
    state = parseState(reduceState(state, { type: 'interior_interact', interactionId: 'wakaba-tend-vines' }));
    expect(prompt(state)).toContain('受邀到高原住宅区的若叶家，陪睦');
    expect(reduceState(state, { type: 'leave_interior' }).locationId).toBe('highland');
  });

  it('uses Sakiko’s own recent paid work when another protagonist visits her', () => {
    let s = enableProtagonists(createInitialState());
    s.contacts.find(person => person.id === 'protagonist-sakiko')!.affinity = 65;
    s = reduceState(s, { type: 'novel_travel', locationId: 'mlm-office' });
    s = reduceState(s, { type: 'switch_protagonist', target: 'sakiko' });
    s = reduceState(s, { type: 'novel_travel', locationId: 'mlm-office' });
    const asSoyo = (state: typeof s) => reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    s = reduceState(s, { type: 'novel_approach', interactionId: 'mlm-observe-board' });
    s = reduceState(s, { type: 'interior_interact', interactionId: 'mlm-observe-board' });
    expect(prompt(asSoyo(s))).not.toContain('在新宿启航商贸探班');
    s = reduceState(s, { type: 'novel_approach', interactionId: 'mlm-phone-sales' });
    s = reduceState(s, { type: 'interior_interact', interactionId: 'mlm-phone-sales' });
    s = parseState(asSoyo(s));
    expect(personState(s, 'sakiko').interior?.roomId).toBe('mlm-office');
    expect(prompt(s)).toContain('在新宿启航商贸探班');
    expect(prompt(reduceState(s, { type: 'wait', minutes: 61 }))).not.toContain('在新宿启航商贸探班');
  });
});
