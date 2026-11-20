import { describe, expect, it } from 'vitest';
import background from '../src/worldbook/background-characters.json';
import canon from '../src/worldbook/bang-dream-canon.json';
import arcs from '../src/worldbook/story-arcs-relationships.json';
import { residentById, residentPresence } from '../src/runtime/npc-cast';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { stageAutonomousSms, autonomousSmsContext } from '../src/runtime/autonomous-sms';

describe('丰川瑞穗存活世界线', () => {
  it('preserves the canonical identity and rewrites each Toyokawa history', () => {
    const mother = background.entries.find(e => e.name === '丰川瑞穗')!;
    expect(mother.extensions.personId).toBe('toyokawa-mizuho');
    expect(mother.extensions.networkAccount).toBe(false);
    expect(mother.extensions.publicProfile).toContain('始终在世');
    for (const name of ['丰川清告', '丰川定治', '丰川瑞穗']) {
      const text = background.entries.find(e => e.name === name)!.content;
      expect(text).toContain('瑞穗');
      expect(text).not.toMatch(/瑞穗病逝|瑞穗已故/);
    }
    expect(canon.entries.find(e => e.name === '丰川祥子')!.content).toContain('母亲瑞穗始终在世');
    expect(arcs.entries.find(e => e.name.includes('CRYCHIC 的盛夏'))!.content).toContain('没有跟随');
  });

  it('registers a real NPC at her own apartment and preserves her public visits', () => {
    const mother = residentById('toyokawa-mizuho')!;
    expect(mother).toBeTruthy();
    expect(mother.home).toBe('mizuho-apartment');
    const atPublicVisit = residentPresence(mother.id, { day: 2, hour: 15, minute: 0 })!;
    expect(atPublicVisit).toMatchObject({ anchorId: 'downtown-fountain', locationId: 'downtown', available: true });
    expect(atPublicVisit.housing).toBe(mother.home);
    const away = residentPresence(mother.id, { day: 2, hour: 20, minute: 0 })!;
    expect(away).toMatchObject({ anchorId: null, available: false, locationId: mother.home });
  });

  it('provides the already-known family contact only in new Sakiko saves', () => {
    const newGame = enableProtagonists(createInitialState());
    const mother = personState(newGame, 'sakiko').contacts.find(c => c.id === 'toyokawa-mizuho')!;
    expect(mother.sourcePersonId).toBe('toyokawa-mizuho');
    expect(mother.affinity).toBe(50);
    expect(personState(newGame, 'soyo').contacts.some(c => c.id === 'toyokawa-mizuho')).toBe(false);
    const older = enableProtagonists(createInitialState());
    const saved = personState(older, 'sakiko');
    saved.contacts.splice(saved.contacts.findIndex(c => c.id === 'toyokawa-mizuho'), 1);
    expect(personState(parseState(older), 'sakiko').contacts.some(c => c.id === 'toyokawa-mizuho')).toBe(false);
  });

  it('allows an unsolicited family message using existing cooldown and private NPC prompt', () => {
    const sakiko = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'sakiko' });
    const advanced = reduceState(sakiko, { type: 'wait', minutes: 120 });
    const next = stageAutonomousSms(sakiko, advanced, () => 0);
    const ticket = next.autonomousSms?.pending;
    expect(ticket).toMatchObject({ owner: 'sakiko', kind: 'npc', peerId: 'toyokawa-mizuho' });
    const prompt = autonomousSmsContext(next, ticket!.id);
    expect(prompt.actor.personality).toContain('瑞穗');
    expect(JSON.stringify(prompt)).not.toContain('weeklyMemory');
    expect(parseState(next)).toEqual(next);
  });
});
