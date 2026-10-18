import { describe, expect, it } from 'vitest';
import { advanceAirTraffic, AIRLINER_COOLDOWN_MS, AIRLINER_DURATION_MS, canTriggerAirliner, createAirTrafficState, getActiveAirliner, getAirTrafficContext, parseAirTrafficState, triggerAirliner } from '../src/runtime/air-traffic';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { parseGeneratedStory, validateGeneratedStory } from '../src/runtime/story-protocol';

const now = 1_790_000_000_000;
const ids = { userId: 'sky-turn-user', assistantId: 'sky-turn-assistant' };
const reply = { text: '一架远处的客机从高空缓缓经过。', phoneMessages: [], worldEvents: [{ type: 'airliner_pass' as const }] };

describe('bounded persistent air traffic', () => {
  it('schedules the first pass 45–90 seconds ahead without immediately creating a flight', () => {
    const original = createInitialState();
    const scheduled = reduceState(original, { type: 'air_traffic_tick', now });
    expect(scheduled.airTraffic.sequence).toBe(0);
    expect(scheduled.airTraffic.lastFlight).toBeNull();
    expect(scheduled.airTraffic.nextAmbientAt - now).toBeGreaterThanOrEqual(45000);
    expect(scheduled.airTraffic.nextAmbientAt - now).toBeLessThanOrEqual(90000);
    expect(reduceState(scheduled, { type: 'air_traffic_tick', now: now + 1000 })).toEqual(scheduled);
    expect(original.airTraffic).toEqual(createAirTrafficState());
    expect(scheduled.clock).toEqual(original.clock);
    expect(scheduled.player).toEqual(original.player);
    expect(scheduled.story).toEqual(original.story);
    expect(scheduled.phone).toEqual(original.phone);
    expect(scheduled.journal).toEqual(original.journal);
  });

  it('accepts one due ambient pass, persists it, and expires the visual without replaying it', () => {
    const scheduled = advanceAirTraffic(createAirTrafficState(), now, 'sky-session');
    const time = scheduled.nextAmbientAt;
    const flight = advanceAirTraffic(scheduled, time, 'sky-session');
    expect(flight).toMatchObject({ sequence: 1, cooldownUntil: time + AIRLINER_COOLDOWN_MS, lastFlight: { id: 'airliner-ambient-1', source: 'ambient', startedAt: time, durationMs: AIRLINER_DURATION_MS } });
    expect(flight.lastFlight!.routeIndex).toBeGreaterThanOrEqual(0);
    expect(flight.lastFlight!.routeIndex).toBeLessThanOrEqual(3);
    expect(flight.nextAmbientAt - time).toBeGreaterThanOrEqual(180000);
    expect(flight.nextAmbientAt - time).toBeLessThanOrEqual(360000);
    const restored = parseAirTrafficState(JSON.parse(JSON.stringify(flight)));
    expect(restored).toEqual(flight);
    expect(advanceAirTraffic(restored, time + 5000)).toEqual(flight);
    expect(getActiveAirliner(restored, time - 1)).toBeNull();
    expect(getActiveAirliner(restored, time + 39999)?.id).toBe('airliner-ambient-1');
    expect(getActiveAirliner(restored, time + 40000)).toBeNull();
    expect(getAirTrafficContext(restored, time + 40000)).toMatchObject({ count: 1, active: null, lastFlight: flight.lastFlight, canTriggerPass: false, cooldownSeconds: 140 });
    expect(canTriggerAirliner(restored, time + 180000)).toBe(true);
  });

  it('creates only one current pass after suspension and never catches up a missed queue', () => {
    const scheduled = advanceAirTraffic(createAirTrafficState(), now);
    const resumedAt = now + 86_400_000;
    const resumed = advanceAirTraffic(scheduled, resumedAt);
    expect(resumed.sequence).toBe(1);
    expect(resumed.lastFlight?.startedAt).toBe(resumedAt);
    expect(resumed.nextAmbientAt).toBeGreaterThanOrEqual(resumedAt + 180000);
    expect(advanceAirTraffic(resumed, resumedAt + 1)).toEqual(resumed);
    const next = advanceAirTraffic(resumed, resumed.nextAmbientAt);
    expect(next.sequence).toBe(2);
    expect(next.lastFlight?.id).toBe('airliner-ambient-2');
  });

  it('rejects extra keys, invalid identifiers, unsupported routes, impossible schedules and nonfinite times', () => {
    const flight = triggerAirliner(createAirTrafficState(), now, 'story', 'story-flight');
    for (const value of [
      null, { ...flight, unexpected: true }, { ...flight, sequence: -1 }, { ...flight, sequence: 0 }, { ...flight, sequence: 1.5 },
      { ...flight, lastFlight: null }, { ...flight, cooldownUntil: now }, { ...flight, nextAmbientAt: now }, { ...flight, nextAmbientAt: now + 360001 },
      ...[{ id: '<script>' }, { source: 'fighter' }, { durationMs: 100000 }, { startedAt: 0 }, { startedAt: Infinity }, { routeIndex: -1 }, { routeIndex: 4 }, { routeIndex: 1.5 }, { patch: {} }].map(patch => ({ ...flight, lastFlight: { ...flight.lastFlight, ...patch } })),
    ]) expect(() => parseAirTrafficState(value)).toThrow(/存档格式无效/);
    expect(() => parseAirTrafficState(JSON.parse(JSON.stringify(flight).replace('"sequence":', '"__proto__":{},"sequence":')))).toThrow(/字段/);
    for (const time of [0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => advanceAirTraffic(flight, time)).toThrow(/时间无效/);
      expect(canTriggerAirliner(flight, time)).toBe(false);
    }
    expect(() => triggerAirliner(flight, now + 1, 'story', 'other-flight')).toThrow(/冷却/);
    expect(canTriggerAirliner({ ...flight, sequence: 1_000_000_000 }, now + 180000)).toBe(false);
  });

  it('strictly migrates 1.0 and 1.1 saves while preserving every field they supported', () => {
    const current = reduceState(createInitialState(), { type: 'walk', x: 0, z: 18, yaw: 0, seed: 'legacy-sky-seed' });
    current.phone[0].read = true;
    const { airTraffic: _airTraffic, interior: _interior, transit: _transit, ...oldFields } = current;
    const old11 = { ...oldFields, schema_version: '1.1.0' };
    const old11Snapshot = JSON.stringify(old11);
    const migrated11 = parseState(JSON.parse(old11Snapshot));
    expect(migrated11).toEqual({ ...current, schema_version: '1.6.0', airTraffic: createAirTrafficState() });
    expect(JSON.stringify(old11)).toBe(old11Snapshot);
    expect(() => parseState({ ...old11, airTraffic: createAirTrafficState() })).toThrow(/字段/);
    const { scene: _scene, ...old10Fields } = oldFields;
    const old10 = { ...old10Fields, schema_version: '1.0.0', locationId: 'gate' };
    const migrated10 = parseState(old10);
    expect(migrated10).toEqual({ ...current, locationId: 'gate', scene: null, airTraffic: createAirTrafficState() });
    expect(() => parseState({ ...old10, scene: null })).toThrow(/字段/);
    expect(() => parseState({ ...current, airTraffic: undefined })).toThrow(/airTraffic/);
  });
});

describe('validated narrative sky events', () => {
  it('supports old two-field output and the sole optional whitelisted world event', () => {
    const state = createInitialState();
    expect(parseGeneratedStory(JSON.stringify({ story: '风拂过树叶。', phone_messages: [] }), state)).toEqual({ text: '风拂过树叶。', phoneMessages: [] });
    expect(parseGeneratedStory(JSON.stringify({ story: reply.text, phone_messages: [], world_events: [{ type: 'airliner_pass' }] }), state)).toEqual(reply);
    expect(validateGeneratedStory({ ...reply, worldEvents: [] }, state).worldEvents).toEqual([]);
    for (const world_events of [null, {}, [{ type: 'fighter_pass' }], [{ type: 'airliner_pass', id: 'forged' }], [{ type: 'airliner_pass', startedAt: now }], [{ type: 'airliner_pass' }, { type: 'airliner_pass' }], [{ type: 'airliner_pass', position: [1, 2, 3] }]]) {
      expect(() => parseGeneratedStory(JSON.stringify({ story: reply.text, phone_messages: [], world_events }), state)).toThrow(/均未写入/);
    }
    expect(() => parseGeneratedStory('{"story":"正文","phone_messages":[],"world_events":[{"type":"airliner_pass","__proto__":{}}]}', state)).toThrow(/字段/);
  });

  it('atomically saves a stable story event with its text, count and journal record', () => {
    const before = createInitialState();
    const snapshot = JSON.stringify(before);
    const after = commitStoryTurn(before, '抬头望向天空', reply, ids, now);
    expect(after.airTraffic).toMatchObject({ sequence: 1, lastFlight: { id: `${ids.assistantId}:airliner`, source: 'story', startedAt: now } });
    expect(after.journal.at(-1)).toMatchObject({ id: `${ids.assistantId}:airliner`, text: '一架远处的客机在高空平稳经过。' });
    expect(after.story.at(-1)?.text).toBe(reply.text);
    expect(after.clock).toEqual(before.clock);
    expect(after.player).toEqual(before.player);
    expect(after.phone).toEqual(before.phone);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(commitStoryTurn(after, '抬头望向天空', reply, ids, now + 1000)).toEqual(after);
    expect(() => commitStoryTurn(after, '抬头望向天空', { ...reply, worldEvents: [] }, ids, now + 1000)).toThrow(/ID 冲突/);
    const later = reduceState(after, { type: 'air_traffic_tick', now: after.airTraffic.nextAmbientAt });
    expect(later.airTraffic.sequence).toBe(2);
    expect(commitStoryTurn(later, '抬头望向天空', reply, ids, now + 400000)).toEqual(later);
    const noEvent = commitStoryTurn(before, '抬头望向天空', { ...reply, worldEvents: [] }, ids, now);
    expect(() => commitStoryTurn(noEvent, '抬头望向天空', reply, ids, now + 1000)).toThrow(/ID 冲突/);
  });

  it('refuses a cooldown request as a whole turn and preserves text, phone receipts and sky state', () => {
    const active = commitStoryTurn(createInitialState(), '抬头望向天空', reply, ids, now);
    active.phone[0].read = true;
    const snapshot = JSON.stringify(active);
    expect(() => commitStoryTurn(active, '再来一架', { ...reply, phoneMessages: [{ npcId: 'lin', text: '你看天上。' }] }, { userId: 'new-user', assistantId: 'new-assistant' }, now + 5000)).toThrow(/冷却.*均未写入/);
    expect(JSON.stringify(active)).toBe(snapshot);
    const accepted = commitStoryTurn(active, '再来一架', reply, { userId: 'new-user', assistantId: 'new-assistant' }, now + 180000);
    expect(accepted.airTraffic.sequence).toBe(2);
    expect(accepted.airTraffic.lastFlight?.startedAt).toBe(now + 180000);
  });
});
