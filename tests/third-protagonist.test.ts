import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, otherProtagonist, otherProtagonists, personState, protagonistNames } from '../src/runtime/protagonist-world';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { getScenePeople, hiddenProtagonistPersons } from '../src/runtime/scene-context';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { applyNpcPhoneCommand } from '../src/runtime/npc-phone';
import { applyPhoneReply } from '../src/runtime/protagonist-world';

function world() {
  const enabled = enableProtagonists(createInitialState());
  return parseState(enabled);
}
function atGate() {
  return reduceState(world(), { type: 'walk', x: 0, z: 29, yaw: 0, seed: 'third-protagonist' });
}

describe('third protagonist accounts and timeline', () => {
  it('registers three accounts, devices and separate personal states', () => {
    const state = world();
    expect(state.schema_version).toBe('1.13.0');
    expect(state.protagonists!.accounts.active).toBe('soyo');
    expect(Object.keys(state.protagonists!.accounts.people).sort()).toEqual(['emma', 'sakiko', 'soyo']);
    expect(Object.keys(state.protagonists!.devices).sort()).toEqual(['emma', 'sakiko', 'soyo']);
    expect(state.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
    expect(state.protagonists!.accounts.people.emma.theme).toBe('emma-soft');
    expect(activeProtagonist(state)).toBe('soyo');
    expect(otherProtagonists('soyo')).toEqual(['sakiko', 'emma']);
    expect(otherProtagonist('emma')).toBe('soyo');
    expect(personState(state, 'emma').locationId).toBe('home');
    expect(protagonistNames.emma).toBe('樱羽艾玛');
    expect(appiePayBalance(state.protagonists!.accounts, 'emma')).toBe(1200000);
  });

  it('switches to Emma and back without losing position, wallet, phone, schedule or story', () => {
    let state = atGate();
    state.player.balance = 123.45;
    state.protagonists!.accounts.people.soyo.cards.gpt = 12345;
    state.journal.push({ id: 'soyo-only', at: '第 1 天 17:20', text: 'SOYO_PRIVATE' });
    state.story.push({ id: 'soyo-story', role: 'assistant', text: 'SOYO_STORY' });
    const emmaBefore = structuredClone(personState(state, 'emma'));
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(activeProtagonist(state)).toBe('emma');
    expect(state.locationId).toBe('home');
    expect(state.player.balance).toBe(12000);
    state.player.balance = 777;
    state.protagonists!.accounts.people.emma.cards.gpt = 77700;
    state.journal.push({ id: 'emma-only', at: '第 1 天 17:20', text: 'EMMA_PRIVATE' });
    const emmaAfter = structuredClone(state);
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    expect(activeProtagonist(state)).toBe('sakiko');
    expect(state.locationId).toBe('downtown');
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(activeProtagonist(state)).toBe('soyo');
    expect(state.player.balance).toBe(123.45);
    expect(state.journal.some(row => row.id === 'soyo-only')).toBe(true);
    expect(state.journal.some(row => row.id === 'emma-only')).toBe(false);
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(state.locationId).toBe(emmaAfter.locationId);
    expect(state.player.balance).toBe(777);
    expect(state.journal.some(row => row.id === 'emma-only')).toBe(true);
    expect(state.story.some(row => row.id === 'soyo-story')).toBe(false);
    expect(emmaBefore.locationId).toBe('home');
    expect(parseState(state)).toEqual(state);
  });

  it('migrates a 1.12 dual save exactly once and adds Emma without duplicating her', () => {
    const state = world();
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    raw.schema_version = '1.12.0';
    const p = raw.protagonists as Record<string, any>;
    delete p.third;
    delete p.accounts.people.emma;
    delete p.devices.emma;
    delete p.npcPhone?.contacts;
    if (p.backgroundLife) delete p.backgroundLife.people.emma;
    const beforeInactive = JSON.parse(JSON.stringify(p.inactive));
    const migrated = parseState(raw);
    expect(migrated.schema_version).toBe('1.13.0');
    expect(migrated.protagonists!.inactive).toEqual(beforeInactive);
    expect(migrated.protagonists!.third.locationId).toBe('home');
    expect(migrated.protagonists!.accounts.people.emma.cards.gpt).toBe(1200000);
    expect(migrated.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
    expect(Object.keys(migrated.protagonists!.backgroundLife!.people)).toEqual(['soyo', 'sakiko', 'emma']);
    expect(parseState(migrated)).toEqual(migrated);
    expect(migrated.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
  });

  it('keeps each protagonist phone conversation addressable through explicit recipients', () => {
    let state = reduceState(world(), { type: 'switch_protagonist', target: 'emma' });
    state = reduceState(state, {
      type: 'phone_app', owner: 'emma', requestId: 'emma-to-sakiko',
      command: { type: 'send_message', to: 'sakiko', text: '祥子，晚上有空吗？' },
    });
    expect(state.protagonists!.conversations).toEqual([
      expect.objectContaining({ from: 'emma', to: 'sakiko', text: '祥子，晚上有空吗？', expectsReply: true }),
    ]);
    const emmaState = state;
    const messageId = state.protagonists!.conversations![0]!.id;
    state = applyPhoneReply(state, messageId, '有，晚点联系。');
    expect(state.protagonists!.conversations![1]).toMatchObject({ from: 'sakiko', to: 'emma', replyTo: messageId, expectsReply: false });
    expect(personState(state, 'emma').phone.some(row => row.text === '有，晚点联系。')).toBe(true);
    expect(emmaState.protagonists!.conversations![0]!.expectsReply).toBe(true);
  });

  it('removes the controlled resident from NPC projection and blocks her NPC auto replies', () => {
    let state = atGate();
    const visibleForSoyo = getScenePeople(state.scene!, state.contacts, state.clock, hiddenProtagonistPersons(state));
    expect(visibleForSoyo.some(person => person.id === 'majo-emma')).toBe(true);
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    const visibleForEmma = getScenePeople(state.scene!, state.contacts, state.clock, hiddenProtagonistPersons(state));
    expect(visibleForEmma.some(person => person.id === 'majo-emma')).toBe(false);
    // Emma is not on the scene while she's the viewpoint, so an NPC DM to her is rejected.
    expect(() => {
      const copy = structuredClone(state);
      applyNpcPhoneCommand(copy, 'emma', { type: 'send_npc_message', npcId: 'majo-emma', text: '你好' }, 'blocked-emma-npc');
    }).toThrow(/由玩家控制/);
  });

  it('does not ship residential prototype disclaimers in player-facing descriptions', () => {
    for (const id of ['emma-yuki-home','koko-old-house','nikaido-house','anan-noa-milia-home','majo-highrise-home','majo-studio']) {
      const room = getCampusInterior(id)!;
      expect(room.description).not.toMatch(/游戏原型|官方住宅|设定声明|住宅原型|不代表官方/);
      expect(room.label).not.toMatch(/原型/);
    }
  });

  it('keeps two background lives settling while Emma is in the foreground', () => {
    let state = reduceState(world(), { type: 'switch_protagonist', target: 'emma' });
    const start = state.protagonists!.backgroundLife!.cursor;
    state = reduceState(state, { type: 'wait', minutes: 60 });
    expect(state.protagonists!.backgroundLife!.cursor).toBe(start + 60);
    expect(parseState(state)).toEqual(state);
  });
});
