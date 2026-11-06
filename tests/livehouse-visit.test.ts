import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getLocationServiceQuote, getLocationServices } from '../src/runtime/location-services';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { instrumentSkill, liveBill, livehouseBill, PRACTICE_AFFINITY_MIN } from '../src/runtime/livehouse-visit';
import type { WorldState } from '../src/frontend/types';

function inside(hour: number, minute = 0, day = 4): WorldState {
  const room = getCampusInterior('livehouse')!;
  const seeded = createInitialState();
  seeded.clock = { day, hour, minute };
  const state = enableProtagonists(seeded);
  state.locationId = 'livehouse';
  state.scene = { x: room.entrance.x, z: room.entrance.z, yaw: 0, areaId: room.parentLocationId, seed: 'live-visit', encounterId: null };
  state.interior = { roomId: 'livehouse', ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
  return parseState(state);
}

describe('live house tickets and practice rooms', () => {
  it('rotates acts from the game date and keeps the two slots different', () => {
    const first = liveBill(4).map(row => row.act.id);
    const again = liveBill(4).map(row => row.act.id);
    expect(again).toEqual(first);
    expect(first[0]).not.toBe(first[1]);
    const later = [5, 6, 7, 8, 9].map(day => liveBill(day).map(row => row.act.id).join());
    expect(later.some(row => row !== first.join())).toBe(true);
    const names = liveBill(4).flatMap(row => [row.act.name, ...row.act.members.map(member => member.name)]);
    expect(names.join('')).not.toMatch(/[\u3040-\u30ff]/);
  });

  it('sells the 18:00 ticket only before curtain, then remembers it', () => {
    let state = inside(17, 0);
    expect(getLocationServices(state).map(service => service.id)).toEqual(expect.arrayContaining([
      'livehouse-watch-1800', 'livehouse-watch-1930', 'livehouse-practice-1h', 'livehouse-practice-1h-band',
    ]));
    const quote = getLocationServiceQuote(state, 'livehouse-watch-1800');
    expect(quote.blockedCode).toBeNull();
    expect(quote.price).toBe(2800);
    expect(quote.minutes).toBe(140);
    expect(quote.livehouse?.takiOnDuty).toBe(true);
    expect(quote.livehouse?.show?.actName).toBe(liveBill(4)[0]!.act.name);
    const balance = state.player.balance;
    state = reduceState(state, { type: 'location_service', serviceId: 'livehouse-watch-1800' });
    expect(state.player.balance).toBe(balance - 2800);
    expect(state.clock).toMatchObject({ hour: 19, minute: 20 });
    expect(state.livehouseVisit?.watched).toEqual([{ owner: 'soyo', showId: 'd4-1800' }]);
    expect(state.journal.at(-1)?.text).toContain(liveBill(4)[0]!.act.name);
    expect(() => reduceState(state, { type: 'location_service', serviceId: 'livehouse-watch-1800' })).toThrow(/已经买过/);
    const late = getLocationServiceQuote(inside(18, 10), 'livehouse-watch-1800');
    expect(late.blockedCode).toBe('show_started');
    const poor = inside(17, 0);
    poor.player.balance = 100;
    expect(getLocationServiceQuote(poor, 'livehouse-watch-1800').blockedCode).toBe('insufficient_balance');
  });

  it('raises instrument skill with diminishing returns and keeps old saves at 0', () => {
    expect(instrumentSkill(createInitialState())).toBe(0);
    const bare = JSON.parse(JSON.stringify(createInitialState())) as WorldState;
    expect(instrumentSkill(parseState(bare))).toBe(0);
    let state = inside(17, 0);
    const quote = getLocationServiceQuote(state, 'livehouse-practice-1h');
    expect(quote.blockedReason).toBeNull();
    expect(quote.livehouse?.skillGain).toBe(6);
    expect(quote.price).toBe(1600);
    state = reduceState(state, { type: 'location_service', serviceId: 'livehouse-practice-1h' });
    expect(instrumentSkill(state)).toBe(6);
    state.livehouseVisit!.skill.soyo = 80;
    const later = getLocationServiceQuote(state, 'livehouse-practice-1h');
    expect(later.livehouse?.skillGain).toBe(1);
    state.livehouseVisit!.skill.soyo = 100;
    expect(getLocationServiceQuote(state, 'livehouse-practice-2h').livehouse?.skillGain).toBe(0);
    const saved = parseState(JSON.parse(JSON.stringify(state)));
    expect(instrumentSkill(saved)).toBe(100);
    expect(personState(saved, 'sakiko').player.balance).toBeGreaterThan(0);
    expect(saved.livehouseVisit?.skill.sakiko).toBe(0);
  });

  it('practices with MyGO contacts at or above the familiar line and leaves Taki out', () => {
    const state = inside(17, 20);
    const quote = getLocationServiceQuote(state, 'livehouse-practice-1h-band');
    const joined = quote.livehouse?.partners.filter(person => person.affinityDelta > 0) ?? [];
    expect(joined.map(person => person.id).sort()).toEqual(['bang-anon', 'bang-rana', 'bang-tomori']);
    expect(quote.livehouse?.partners.find(person => person.id === 'bang-taki')?.eligible).toBe(false);
    expect(quote.livehouse?.skillGain).toBe(7);
    const tomori = state.contacts.find(contact => contact.id === 'bang-tomori')!;
    expect(tomori.affinity).toBeGreaterThanOrEqual(PRACTICE_AFFINITY_MIN);
    const next = reduceState(state, { type: 'location_service', serviceId: 'livehouse-practice-1h-band' });
    expect(next.contacts.find(contact => contact.id === 'bang-tomori')?.affinity).toBe(tomori.affinity + 2);
    expect(next.contacts.find(contact => contact.id === 'bang-taki')?.affinity).toBe(state.contacts.find(contact => contact.id === 'bang-taki')?.affinity);
    expect(instrumentSkill(next)).toBe(7);
    const alone = inside(12, 0);
    expect(getLocationServiceQuote(alone, 'livehouse-practice-1h').livehouse?.takiOnDuty).toBe(false);
    expect(getLocationServiceQuote(alone, 'livehouse-practice-1h-band').blockedCode).toBe('closed');
  });

  it('gives the narrator the bill and the blocked code, not a private story branch', () => {
    const state = inside(17, 0);
    const bill = livehouseBill(state);
    expect(bill.takiOnDuty).toBe(true);
    expect(bill.shows).toHaveLength(2);
    expect(bill.rule).toContain('service');
    expect(readFileSync('src/runtime/bridge.ts', 'utf8')).toContain('livehouseBill: livehouseBill(snapshot)');
    expect(readFileSync('src/frontend/WorldPanels.vue', 'utf8')).toContain('data-player-stat="instrument"');
    const watched = inside(17, 0);
    watched.livehouseVisit = {
      watched: [{ owner: 'soyo', showId: 'd4-1800' }],
      skill: { soyo: 0, sakiko: 0, emma: 0, renako: 0 },
    };
    const quote = getLocationServiceQuote(parseState(JSON.parse(JSON.stringify(watched))), 'livehouse-watch-1800');
    expect(quote.blockedCode).toBe('already_watched');
    expect(quote.livehouse?.commit).toBeNull();
  });
});
