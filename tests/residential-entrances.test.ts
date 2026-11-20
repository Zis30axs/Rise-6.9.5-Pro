import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { districtMapPlaces, locationDistrict } from '../src/frontend/map-districts';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { housingForPerson } from '../src/runtime/majo-housing';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { residentById, residentPresence } from '../src/runtime/npc-cast';
import { getInteriorPeople, getInteriorPeopleForValidation } from '../src/runtime/scene-context';
import { createAgenda, socialMinute } from '../src/runtime/social-agenda';
import { worldScenePeople } from '../src/runtime/world-presence';
import type { SocialInvitation } from '../src/runtime/natural-interactions';
import { enableProtagonists } from '../src/runtime/protagonist-world';

const tenants = [
  'bang-tomori', 'bang-anon', 'bang-taki', 'bang-rana', 'bang-uika', 'bang-umiri', 'bang-nyamu', 'bang-marina',
  'majo-leia', 'majo-margo', 'majo-arisa', 'majo-meruru',
  'watanare-seira', 'watanare-youko', 'watanare-michiru', 'watanare-himiko', 'watanare-suzuran', 'watanare-chizuru', 'watanare-miki',
  'fengjin', 'toyokawa-sadaharu',
];

describe('居民住宅入口', () => {
  it.each(tenants)('%s 的住宅可从街区到达、读档和离开', personId => {
    const home = housingForPerson(personId)!;
    const room = getCampusInterior(home.interiorId)!;
    expect(room.id).toBe(residentById(personId)?.home);
    expect(districtMapPlaces(locationDistrict(room.id)).some(place => place.id === room.id)).toBe(true);
    expect(getAdjacentLocations({ locationId: home.parentLocationId, interior: null }).some(p => p.id === room.id)).toBe(true);
    const initial = enableProtagonists(createInitialState());
    expect(getNovelTravelQuote(initial, room.id).blockedReason).toBeNull();
    const inside = reduceState(initial, { type: 'novel_travel', locationId: room.id });
    const detail = room.interactions[0];
    const close = reduceState(inside, { type: 'novel_approach', interactionId: detail.id });
    const saved = parseState(reduceState(close, { type: 'interior_interact', interactionId: detail.id }));
    expect(saved.interior).toMatchObject({ roomId: room.id, activityId: detail.id });
    expect(getNovelBackground(room.id, 10).source).not.toBe('legacy');
    expect(getInteriorPeopleForValidation(room.id).map(p => p.id)).toContain(personId);
    expect(residentPresence(personId, { day: 1, hour: 3, minute: 0 })?.locationId).toBe(room.id);
    expect(reduceState(saved, { type: 'leave_interior' }).locationId).toBe(home.parentLocationId);
  });

  it.each([['clinic', 'clinic-room'], ['onigawara-laundry', 'onigawara-laundry-home']])('从 %s 直接往返生活区', (front, back) => {
    const initial = enableProtagonists(createInitialState());
    const entered = reduceState(initial, { type: 'novel_travel', locationId: front });
    expect(getAdjacentLocations(entered).map(p => p.id)).toContain(back);
    const atHome = reduceState(entered, { type: 'novel_travel', locationId: back });
    expect(getAdjacentLocations(atHome).map(p => p.id)).toContain(front);
    expect(getNovelTravelQuote(atHome, front)).toMatchObject({ fare: 0, minutes: 0 });
    expect(reduceState(atHome, { type: 'novel_travel', locationId: front }).interior?.roomId).toBe(front);
  });

  it('门诊、打工场所及总裁楼按日程显示角色', () => {
    const names = (room: string, hour: number) => getInteriorPeople(room, [], { day: 1, hour, minute: 15 }).map(p => p.id);
    expect(names('clinic', 10)).toContain('fengjin');
    expect(names('clinic-room', 10)).not.toContain('fengjin');
    expect(names('clinic-room', 22)).toContain('fengjin');
    expect(names('clinic', 22)).not.toContain('fengjin');
    expect(names('toyokawa-executive-tower', 10)).toContain('toyokawa-sadaharu');
    expect(names('toyokawa-executive-tower', 23)).not.toContain('toyokawa-sadaharu');
    expect(names('residential-taki', 17)).not.toContain('bang-taki');
    expect(names('ring-desk', 17)).toContain('bang-taki');
    expect(housingForPerson('toyokawa-mizuho')?.id).toBe('mizuho-apartment');
    expect(getNovelTravelQuote(enableProtagonists(createInitialState()), 'mizuho-apartment').blockedReason).toContain('约好');
  });

  it('祥子能按约去瑞穗家，见到她并从同一街区离开', () => {
    let state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, { type: 'novel_travel', locationId: 'downtown' });
    const home = 'mizuho-apartment';
    const visit: SocialInvitation = {
      id: 'mizuho-tea', owner: 'sakiko', targetId: 'toyokawa-mizuho', targetName: '丰川瑞穗',
      locationId: home, day: 1, time: '18:30', source: 'meeting', status: 'accepted',
      message: '晚上来我家喝茶吧。', createdAt: socialMinute(state), messageId: null, response: '好的。',
    };
    visit.agenda = createAgenda({ rationale: '在家里喝茶', steps: [
      { kind: 'depart', day: 1, time: '18:10', detail: '回公寓' },
      { kind: 'arrive', day: 1, time: '18:30', detail: '在家等祥子' },
      { kind: 'leave', day: 1, time: '19:30', detail: '道别' },
    ] }, visit, socialMinute(state));
    state.protagonists!.socialInvitations = [visit];
    state = reduceState(state, { type: 'wait', minutes: 18 * 60 + 30 - socialMinute(state) });
    state = parseState(reduceState(state, { type: 'novel_travel', locationId: home }));
    expect(worldScenePeople(state).map(person => person.id)).toContain('toyokawa-mizuho');
    expect(reduceState(state, { type: 'leave_interior' }).locationId).toBe('downtown');
  });

  it('总裁楼离线模型与小说昼夜背景均已打包', () => {
    const file = readFileSync('assets/models/toyokawa-executive-tower.glb');
    expect(file.toString('ascii', 0, 4)).toBe('glTF');
    expect(file.readUInt32LE(8)).toBe(file.length);
    const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
    expect(gltf.buffers[0].uri).toBeUndefined();
    expect(gltf.meshes.length).toBeGreaterThan(5);
    const day = getNovelBackground('toyokawa-executive-tower', 12);
    const night = getNovelBackground('toyokawa-executive-tower', 23);
    expect(day.src).toMatch(/^data:image\/webp;base64,/);
    expect(night.src).not.toBe(day.src);
  });
});
