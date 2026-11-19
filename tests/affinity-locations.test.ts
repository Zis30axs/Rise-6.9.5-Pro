import { describe, expect, it } from 'vitest';
import { affinityLocationNotes, affinityLocationRules as rules } from '../src/runtime/affinity-locations';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS } from '../src/runtime/affinity-tiers';
import { createInitialState, novelDestinations, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getInteriorPeople } from '../src/runtime/scene-context';
import { liveBill, practicePartners } from '../src/runtime/livehouse-visit';
import { gameDayFromISO } from '../src/runtime/game-calendar';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { createAgenda, socialMinute } from '../src/runtime/social-agenda';
import type { SocialInvitation } from '../src/runtime/natural-interactions';
import { validateStoryActions } from '../src/runtime/story-actions';
import { worldSceneContext } from '../src/runtime/world-presence';
import venues from '../src/runtime/affinity-venues.json';
import book from '../src/worldbook/affinity-personas.json';

describe('location-specific affinity personas', () => {
  it('resolves every author, place, tier interval and venue override', () => {
    const characters = new Set(book.entries.map(row => row.extensions.affinityPersona.characterId));
    const destinations = new Set(novelDestinations.map(row => row.id));
    const tiers = AFFINITY_TIERS.map(row => row.id);
    expect(rules).toHaveLength(30);
    expect(new Set(rules.map(rule => rule.characterId)).size).toBe(20);
    for (const rule of rules) expect(rule.places.length > 0 || !!rule.inactiveReason).toBe(true);
    for (const rule of rules) {
      expect(characters.has(rule.characterId)).toBe(true);
      for (const place of rule.places) expect(destinations.has(place)).toBe(true);
      for (const map of [rule.placeOccasions, rule.placeConditions, rule.placeEvents]) {
        for (const place of Object.keys(map ?? {})) expect(rule.places).toContain(place);
      }
      for (const reaction of rule.reactions) {
        const first = reaction.from ?? tiers[0]!;
        const last = reaction.through ?? tiers[tiers.length - 1]!;
        expect(tiers).toContain(first);
        expect(tiers).toContain(last);
        expect(tiers.indexOf(first)).toBeLessThanOrEqual(tiers.indexOf(last));
        if (reaction.onlyPlace) expect(rule.places).toContain(reaction.onlyPlace);
      }
    }
  });

  it('travels to each new destination, reloads it and returns via its access point', () => {
    const start = createInitialState();
    for (const venue of venues) {
      const travel = { type: 'travel', locationId: venue.id };
      const schedule = { type: 'schedule', title: '傍晚散步', locationId: venue.id, time: '18:30' };
      expect(validateStoryActions([travel, schedule], start)).toEqual([travel, schedule]);
      const arrived = reduceState(start, { type: 'novel_travel', locationId: venue.id });
      const restored = parseState(JSON.parse(JSON.stringify(arrived)));
      expect(restored.locationId).toBe(venue.id);
      expect(worldSceneContext(restored)?.outdoors).toBe(venue.outdoors);
      expect(reduceState(restored, { type: 'leave_interior' }).locationId).toBe(venue.accessLandmark);
    }
  });

  it('selects just the matching tier, time, weather and branch of an outing', () => {
    const soyo = (tier: string) => affinityLocationNotes('protagonist-soyo', tier, 'asukayama', 12, 'sunny').join('');
    expect(soyo('guarded')).toContain('大幅扣好感');
    expect(affinityLocationNotes('protagonist-soyo', 'confidant', 'asukayama-park', 17, 'sunny').join('')).toContain('自嘲');
    expect(affinityLocationNotes('protagonist-sakiko', 'confidant', 'asukayama-park', 17, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('protagonist-sakiko', 'confidant', 'asukayama', 17, 'sunny').join('')).toContain('喷泉旁');
    expect(soyo('distant')).not.toContain('大幅扣好感');
    expect(soyo('confidant')).toContain('自嘲');
    expect(soyo('confidant')).not.toContain('平静新回忆');
    expect(soyo('bond')).toContain('平静新回忆');
    const bench = (hour: number, weather: 'sunny' | 'snow') =>
      affinityLocationNotes('majo-yuki', 'confidant', 'pocket-park', hour, weather);
    expect(bench(12, 'sunny')).toEqual([]);
    expect(bench(17, 'sunny').join('')).toContain('空气');
    expect(bench(19, 'sunny')).toEqual([]);
    expect(bench(12, 'snow').join('')).toContain('空气');
    expect(affinityLocationNotes('watanare-mai', 'friend', 'queen-rose-street', 12, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('watanare-mai', 'friend', 'ouzuka-residence', 12, 'sunny').join('')).toContain('系上围裙');
    expect(affinityLocationNotes('bang-tomori', 'hostile', 'aquarium', 12, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('bang-taki', 'friend', 'circle-studio', 12, 'sunny')).toEqual([]);
  });

  it('keeps high-school memories and temporary events out of the permanent destination list', () => {
    const ids = novelDestinations.map(place => place.id);
    for (const id of ['haneoka-route', 'haneoka-music', 'ashigaya-rooftop', 'old-school-corridor',
      'queen-rose-street', 'herb-garden', 'arakawa-tram']) {
      expect(ids).not.toContain(id);
      expect(() => validateStoryActions([{ type: 'travel', locationId: id }], createInitialState())).toThrow();
    }
    const bridge = affinityLocationNotes('bang-anon', 'friend', 'chitose-bridge', 17, 'sunny').join('');
    expect(bridge).toContain('高中时');
    expect(bridge).not.toContain('放学路');
    expect(affinityLocationNotes('bang-anon', 'friend', 'teaching', 17, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('watanare-kaho', 'confidant', 'commercial', 12, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('watanare-kaho', 'confidant', 'commercial', 12, 'sunny', ['池袋漫展'])).toEqual([]);
    expect(affinityLocationNotes('watanare-kaho', 'confidant', 'cosplay-convention', 12, 'sunny')).toEqual([]);
    const show = (date: string, hour: number, minute: number, tier: string) =>
      affinityLocationNotes('watanare-kaho', tier, 'cosplay-convention', hour, 'sunny', ['我想去漫展'], { day: gameDayFromISO(date), minute }).join('');
    expect(show('2025-11-07', 12, 0, 'familiar')).toBe('');
    expect(show('2025-11-08', 8, 59, 'familiar')).toBe('');
    expect(show('2025-11-09', 9, 0, 'familiar')).toContain('AGF');
    expect(show('2025-11-08', 16, 59, 'confidant')).not.toContain('摘下隐形眼镜');
    expect(show('2025-11-08', 17, 0, 'confidant')).toContain('摘下隐形眼镜');
    expect(show('2025-11-08', 17, 30, 'confidant')).toBe('');
  });

  it('keeps a venue’s reactions tied to what the companion can do there', () => {
    const note = (id: string, place: string, tier = 'confidant') =>
      affinityLocationNotes(id, tier, place, 14, 'sunny').join('');
    expect(note('bang-anon', 'aquarium', 'familiar')).toContain('企鹅');
    expect(note('bang-anon', 'aquarium', 'familiar')).not.toContain('挑衣服');
    expect(note('bang-anon', 'sunshine-shopping', 'familiar')).toContain('挑衣服');
    expect(note('bang-rana', 'ring-entrance')).not.toContain('冰淇淋');
    expect(note('bang-rana', 'matcha-shop')).toContain('冰淇淋');
    expect(note('watanare-ajisai', 'home')).toBe('');
    expect(note('watanare-ajisai', 'residential-supermarket')).toContain('晚饭');
    expect(getCampusInterior('otsuka-diner')?.outdoors).toBe(false);
    expect(affinityLocationNotes('bang-uika', 'friend', 'observation-roof', 19, 'sunny').join('')).toContain('窗边');
    for (const hour of [2, 14, 21]) expect(affinityLocationNotes('bang-uika', 'friend', 'observation-roof', hour, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('bang-uika', 'friend', 'observation-roof', 19, 'rain')).toEqual([]);
    expect(affinityLocationNotes('fengjin', 'bond', 'pocket-park', 14, 'rain')).toEqual([]);
  });

  it('lets the player find RiNG staff on their shifts in Ikebukuro', () => {
    const onShift = { day: 4, hour: 17, minute: 0 };
    const people = (room: string, clock = onShift) => getInteriorPeople(room, [], clock).map(person => person.id);
    expect(people('ring-desk')).toEqual(expect.arrayContaining(['bang-taki', 'bang-marina']));
    expect(people('livehouse')).not.toContain('bang-taki');
    expect(people('circle-cafe')).not.toContain('bang-marina');
    expect(people('ring-desk', { ...onShift, hour: 22 })).not.toContain('bang-taki');
    const state = createInitialState();
    state.clock = onShift;
    state.locationId = 'livehouse';
    const partner = state.contacts.find(person => person.id === 'bang-taki')!;
    partner.affinity = 90;
    expect(practicePartners(state).find(person => person.id === partner.id)).toMatchObject({ here: false, eligible: false });
    const prompt = (hour: number) => affinityLocationNotes('bang-taki', 'confidant', 'ring-desk', hour, 'sunny', [], onShift).join('');
    expect(prompt(15)).toBe('');
    expect(prompt(17)).toContain('前台');
    expect(prompt(19)).not.toContain('下班');
    expect(prompt(21)).toContain('下班');
    expect(prompt(22)).toBe('');
    const start = createInitialState();
    start.clock = { ...onShift, hour: 16 };
    const desk = parseState(reduceState(enableProtagonists(start), { type: 'novel_travel', locationId: 'ring-desk' }));
    const scene = worldSceneContext(desk);
    expect(scene?.nearbyPeople.some(person => person.contactId === 'bang-taki' && person.canTalk)).toBe(true);
    expect(affinityPersonaPrompt(desk, scene, '我走到柜台前跟立希打招呼。')).toContain('前台探班');
    expect(affinityPersonaPrompt(desk, scene, '给立希发消息', 'phone_reply')).toBe('');
  });

  it('requires the performer’s own upcoming set before suggesting a wait in the foyer', () => {
    const day = Array.from({ length: 100 }, (_, i) => i + 1).find(d =>
      liveBill(d).some(row => row.key === '1800' && row.act.id === 'ave-mujica'))!;
    const note = (hour: number, minute: number, place = 'livehouse') =>
      affinityLocationNotes('bang-mutsumi', 'confidant', place, hour, 'sunny', [], { day, minute });
    expect(note(17, 29)).toEqual([]);
    expect(note(17, 30).join('')).toContain('开演');
    expect(note(18, 0)).toEqual([]);
    expect(note(17, 45, 'ring-desk')).toEqual([]);
  });

  it('keeps the original return point and appointments for reinstated venues', () => {
    const former = {
      'matcha-shop': 'commercial', 'residential-supermarket': 'home', 'book-cafe': 'street-cafe',
      'observation-roof': 'commercial', 'cosplay-convention': 'commercial',
    };
    for (const [id, entrance] of Object.entries(former)) {
      // The first version stored the schematic entrance, room ID and schedule location.
      const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: entrance });
      const room = getCampusInterior(id)!;
      const exterior = room.entrance;
      state.scene = { ...exterior, seed: 'old-visit', areaId: entrance, encounterId: null };
      state.locationId = id;
      state.interior = { roomId: id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
      state.schedule.push({ id: 'again', title: '下次见', time: '12:00', locationId: id, done: false });
      const loaded = parseState(state);
      expect(loaded.interior?.roomId).toBe(id);
      expect(loaded.schedule.at(-1)?.locationId).toBe(id);
      expect(reduceState(loaded, { type: 'leave_interior' }).locationId).toBe(entrance);
    }
  });

  it('restores an old outing at its saved entrance and preserves existing arrangements', () => {
    const outside = reduceState(enableProtagonists(createInitialState()), { type: 'novel_travel', locationId: 'teaching' });
    const old = structuredClone(outside);
    old.locationId = 'haneoka-route';
    old.interior = { roomId: 'haneoka-route', x: 0, z: 3.8, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
    old.schedule.push({ id: 'walk', title: '和爱音散步', locationId: 'haneoka-route', time: '19:00', done: false });
    old.protagonists!.devices.soyo.calendar.push({ id: 'walk', title: '碰面', locationId: 'haneoka-route', start: 1140, duration: 20, reminded: false });
    old.protagonists!.socialInvitations = [{ id: 'walk', owner: 'soyo', targetId: 'bang-anon', targetName: '千早爱音',
      source: 'meeting', locationId: 'haneoka-route', day: 1, time: '19:00', message: '一起走走吧。', status: 'accepted',
      createdAt: socialMinute(old), messageId: null, response: '好呀。' }];
    const loaded = parseState(old);
    expect(loaded.locationId).toBe('teaching');
    expect(loaded.interior).toBeNull();
    expect(loaded.scene).toEqual(outside.scene);
    expect(loaded.clock).toEqual(outside.clock);
    expect(loaded.player).toEqual(outside.player);
    expect(loaded.schedule.at(-1)?.locationId).toBe('teaching');
    expect(loaded.protagonists?.devices.soyo.calendar.at(-1)?.locationId).toBe('teaching');
    expect(loaded.protagonists?.socialInvitations?.[0]?.locationId).toBe('teaching');
    expect(parseState(loaded)).toEqual(loaded);
    const inactive = structuredClone(outside);
    Object.assign(inactive.protagonists!.inactive, { locationId: old.locationId, scene: old.scene, interior: old.interior });
    const other = parseState(inactive).protagonists!.inactive;
    expect(other.locationId).toBe('teaching');
    expect(other.interior).toBeNull();
  });

  it('injects at an actual appointment, then stops when the companion leaves', () => {
    const state = enableProtagonists(createInitialState());
    const invite: SocialInvitation = {
      id: 'bridge-walk', owner: 'soyo', targetId: 'bang-anon', targetName: '千早爱音',
      source: 'meeting', locationId: 'chitose-bridge', day: 1, time: '18:10',
      message: '傍晚去千登世桥走走吧。', status: 'accepted', createdAt: socialMinute(state),
      messageId: null, response: '那就桥上见！',
    };
    invite.agenda = createAgenda({ rationale: '傍晚去桥上会面。', steps: [
      { kind: 'depart', day: 1, time: '18:00', detail: '出发' },
      { kind: 'arrive', day: 1, time: '18:10', detail: '到达桥上' },
      { kind: 'leave', day: 1, time: '18:30', detail: '告别回家' },
    ] }, invite, socialMinute(state));
    state.protagonists!.socialInvitations = [invite];
    const prompt = (s: typeof state, kind?: 'phone_reply' | 'interaction_event') =>
      affinityPersonaPrompt(s, worldSceneContext(s), '和爱音聊起千登世桥。', kind);
    const early = reduceState(state, { type: 'novel_travel', locationId: invite.locationId });
    expect(prompt(early)).not.toContain('自己以前追着大家跑的糗事');
    const minutes = 18 * 60 + 10 - socialMinute(early);
    const together = parseState(reduceState(early, { type: 'wait', minutes }));
    expect(prompt(together, 'interaction_event')).toContain('自己以前追着大家跑的糗事');
    expect(prompt(together, 'phone_reply')).toBe('');
    const later = reduceState(together, { type: 'wait', minutes: 20 });
    expect(prompt(later)).not.toContain('自己以前追着大家跑的糗事');
  });
});
