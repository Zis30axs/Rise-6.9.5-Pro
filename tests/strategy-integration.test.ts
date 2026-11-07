import { describe, it, expect } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';

describe('offline strategy state integration', () => {
  it('migrates an older save without strategy and round-trips', () => {
    const state = enableProtagonists(createInitialState());
    const legacy = structuredClone(state);
    delete legacy.protagonists!.strategy;
    const parsed = parseState(legacy);
    expect(parsed.protagonists?.strategy?.people.soyo.traits).toContain('soyo_crychic_obsession');
    expect(parseState(JSON.parse(JSON.stringify(parsed))).protagonists?.strategy).toEqual(parsed.protagonists?.strategy);
  });
  it('supports independent settings and advances focus with canonical game time', () => {
    const state = enableProtagonists(createInitialState());
    const configured = reduceState(state, { type: 'strategy', requestId: 'test-auto-on',
      command: { type: 'set_control', owner: 'emma', controller: 'auto', includeInPrompt: false } });
    expect(configured.protagonists?.strategy?.people.emma.controller).toBe('auto');
    const moved = reduceState(configured, { type: 'wait', minutes: 60 });
    expect(moved.protagonists?.strategy?.people.emma.active?.id).toBe('emma_daily_circle');
    expect(moved.protagonists?.strategy?.people.emma.active?.progress).toBe(60);
    expect(moved.protagonists?.strategy?.people.soyo.active).toBeNull();
    expect(parseState(moved).protagonists?.strategy?.cursor).toBe(moved.clock.hour * 60 + moved.clock.minute + (moved.clock.day - 1) * 1440);
  });
  it('rejects conflicting retries without changing state', () => {
    const state = enableProtagonists(createInitialState());
    const command = { type: 'set_control' as const, owner: 'renako' as const, controller: 'auto' as const, includeInPrompt: false };
    const first = reduceState(state, { type: 'strategy', requestId: 'same-id', command });
    expect(reduceState(first, { type: 'strategy', requestId: 'same-id', command })).toEqual(first);
    expect(() => reduceState(first, { type: 'strategy', requestId: 'same-id',
      command: { ...command, includeInPrompt: true } })).toThrow(/重复请求/);
  });
});
