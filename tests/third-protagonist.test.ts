import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, otherProtagonist, otherProtagonists, personState, protagonistNames } from '../src/runtime/protagonist-world';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { getScenePeople, hiddenProtagonistPersons } from '../src/runtime/scene-context';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { applyNpcPhoneCommand, npcPhoneView } from '../src/runtime/npc-phone';
import { residentCast, watanareResidentCast, WATANARE_GROUP_ID, WATANARE_GROUP_NAME } from '../src/runtime/npc-cast';
import { protagonistOpening } from '../src/runtime/viewpoint-openings';
import { majoEmotions } from '../src/frontend/majo-art';
import { housingForPerson, watanareHousings } from '../src/runtime/majo-housing';
import { resolveWatanareExpressionPortrait, resolveWatanareSpeaker, watanareExpressionSets, watanareRenakoExpressions } from '../src/frontend/watanare-art';
import { resolveNovelNpcEmotion } from '../src/frontend/novel-npc-emotions';
import card from '../src/card.json';
import { applyPhoneReply } from '../src/runtime/protagonist-world';

function world() {
  const enabled = enableProtagonists(createInitialState());
  return parseState(enabled);
}
function atGate() {
  return reduceState(world(), { type: 'walk', x: 0, z: 29, yaw: 0, seed: 'third-protagonist' });
}

describe('third and fourth protagonist accounts and timeline', () => {
  it('starts all four viewpoints with their own novel opening, calendar and journal', () => {
    const state = world();
    const soyo = personState(state, 'soyo');
    const sakiko = personState(state, 'sakiko');
    const emma = personState(state, 'emma');
    const renako = personState(state, 'renako');
    const openings = [soyo.story[0].text, sakiko.story[0].text, emma.story[0].text, renako.story[0].text];
    expect(new Set(openings).size).toBe(4);
    expect(card.data.first_mes).toBe(protagonistOpening('soyo', state.clock));
    expect(card.data.first_mes).not.toContain('开发占位');
    expect(card.data.scenario).toContain('东京');
    expect(openings[0]).toContain('长崎素世');
    expect(openings[1]).toContain('丰川祥子');
    expect(openings[2]).toContain('樱羽艾玛');
    expect(openings[3]).toContain('甘织玲奈子');
    expect(openings[0]).toContain('高田校园的南门');
    expect(openings[1]).toContain('目白台');
    expect(openings[2]).toContain('杂司谷住宅区');
    expect(openings[3]).toContain('杂司谷住宅区');
    expect(openings[0]).not.toMatch(/月代雪|牢屋敷/);
    expect(openings[1]).not.toMatch(/月代雪|魔女裁判/);
    expect(openings[2]).not.toMatch(/CRYCHIC|Ave Mujica/);
    for (const personal of [soyo, sakiko, emma, renako]) {
      expect(personal.journal[0].at).toBe('第 1 天 17:20');
      expect(personal.story[0].role).toBe('assistant');
      expect(personal.story[0].text).toContain('2025年8月28日，周四，17:20');
    }
    const switched = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(switched.story[0].text).toBe(emma.story[0].text);
    expect(switched.journal[0]).toEqual(emma.journal[0]);
    expect(personState(switched, 'soyo').story[0].text).toBe(soyo.story[0].text);
    expect(switched.contacts.map(contact => contact.id).sort()).toEqual(
      residentCast.filter(person => person.id !== 'majo-emma').map(person => person.id).sort()
    );
  });

  it('uses the shared clock for subsequent viewpoint initialization', () => {
    const initial = createInitialState();
    initial.clock = { day: 9, hour: 10, minute: 5 };
    const state = enableProtagonists(initial);
    for (const owner of ['sakiko', 'emma', 'renako'] as const) {
      const personal = personState(state, owner);
      expect(personal.story[0].text).toContain('2025年9月5日，周五，10:05');
      expect(personal.journal[0].at).toBe('第 9 天 10:05');
    }
  });

  it('seeds only the intended contacts and leaves all demo messages and schedules out of a new game', () => {
    const initial = createInitialState();
    expect(initial.contacts.map(contact => contact.id)).toEqual(['protagonist-sakiko']);
    expect(initial.phone).toEqual([]);
    expect(initial.schedule).toEqual([]);
    expect(initial.story[0].text).not.toContain('手机轻震了两下');

    const state = world();
    expect(personState(state, 'soyo').contacts.map(contact => contact.id)).toEqual(['protagonist-sakiko']);
    expect(personState(state, 'sakiko').contacts.map(contact => contact.id)).toEqual(['protagonist-soyo']);
    expect(personState(state, 'soyo').phone).toEqual([]);
    expect(personState(state, 'sakiko').phone).toEqual([]);

    const emma = personState(state, 'emma');
    const expected = residentCast.filter(person => person.id !== 'majo-emma').map(person => person.id).sort();
    expect(expected).toHaveLength(13);
    expect(emma.contacts.map(contact => contact.id).sort()).toEqual(expected);
    expect(emma.contacts.every(contact => contact.sourcePersonId === contact.id && contact.isMain)).toBe(true);
    expect(emma.contacts.find(contact => contact.id === 'majo-yuki')?.name).toBe('月代雪');
    expect(emma.phone).toEqual([]);
    expect(emma.schedule).toEqual([]);

    const renako = personState(state, 'renako');
    const expectedRenako = watanareResidentCast.filter(person => person.id !== 'watanare-renako').map(person => person.id).sort();
    expect(expectedRenako).toHaveLength(19);
    expect(renako.contacts.map(contact => contact.id).sort()).toEqual(expectedRenako);
    expect(renako.contacts.find(contact => contact.id === 'watanare-haruna')?.name).toBe('甘织遥奈');
    expect(renako.contacts.find(contact => contact.id === 'watanare-mai')?.name).toBe('王冢真唯');
    expect(renako.contacts.find(contact => contact.id === 'watanare-ajisai')?.name).toBe('濑名紫阳花');

    const switched = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(npcPhoneView(switched, 'emma').contacts).toHaveLength(13);
    const sent = reduceState(switched, { type: 'phone_app', owner: 'emma', requestId: 'seeded-yuki-friend',
      command: { type: 'send_npc_message', npcId: 'majo-yuki', text: '雪酱，晚上一起回家吗？' } });
    expect(sent.protagonists!.npcPhone!.messages).toEqual([expect.objectContaining({
      owner: 'emma', targetId: 'majo-yuki', channel: 'npc', direction: 'outgoing',
    })]);
    expect(parseState(sent)).toEqual(sent);

    const switchedRenako = reduceState(sent, { type: 'switch_protagonist', target: 'renako' });
    expect(npcPhoneView(switchedRenako, 'renako').contacts).toHaveLength(19);
    expect(npcPhoneView(switchedRenako, 'renako').groups).toEqual([
      { id: WATANARE_GROUP_ID, name: WATANARE_GROUP_NAME, memberCount: 5 },
    ]);
    const groupSent = reduceState(switchedRenako, { type: 'phone_app', owner: 'renako', requestId: 'renako-quintet-msg',
      command: { type: 'send_group_message', groupId: WATANARE_GROUP_ID, text: '大家放学后去天台还是家庭餐厅？' } });
    expect(groupSent.protagonists!.npcPhone!.messages.at(-1)).toMatchObject({
      owner: 'renako', targetId: WATANARE_GROUP_ID, channel: 'group', direction: 'outgoing',
    });
    expect(parseState(groupSent)).toEqual(groupSent);
  });

  it('registers four accounts, devices and separate personal states', () => {
    const state = world();
    expect(state.schema_version).toBe('1.13.0');
    expect(state.protagonists!.accounts.active).toBe('soyo');
    expect(Object.keys(state.protagonists!.accounts.people).sort()).toEqual(['emma', 'renako', 'sakiko', 'soyo']);
    expect(Object.keys(state.protagonists!.devices).sort()).toEqual(['emma', 'renako', 'sakiko', 'soyo']);
    expect(state.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
    expect(state.protagonists!.accounts.people.emma.theme).toBe('emma-soft');
    expect(state.protagonists!.accounts.people.renako.deviceId).toBe('unread-city-phone-renako');
    expect(state.protagonists!.accounts.people.renako.theme).toBe('renako-soft');
    expect(activeProtagonist(state)).toBe('soyo');
    expect(otherProtagonists('soyo')).toEqual(['sakiko', 'emma', 'renako']);
    expect(otherProtagonist('emma')).toBe('soyo');
    expect(otherProtagonist('renako')).toBe('soyo');
    expect(personState(state, 'emma').locationId).toBe('home');
    expect(personState(state, 'renako').locationId).toBe('home');
    expect(protagonistNames.emma).toBe('樱羽艾玛');
    expect(protagonistNames.renako).toBe('甘织玲奈子');
    expect(appiePayBalance(state.protagonists!.accounts, 'emma')).toBe(1200000);
    expect(appiePayBalance(state.protagonists!.accounts, 'renako')).toBe(950000);
  });

  it('registers Renako 9-expression lossless WebP sprites and resolves all 9 emotions', () => {
    expect(Object.keys(watanareRenakoExpressions)).toEqual([...majoEmotions]);
    expect(new Set(Object.values(watanareRenakoExpressions)).size).toBe(9);
    for (const src of Object.values(watanareRenakoExpressions)) expect(src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(resolveWatanareSpeaker('甘织玲奈子')).toBe('watanare-renako');
    expect(resolveWatanareSpeaker('玲奈子')).toBe('watanare-renako');
    expect(watanareHousings).toHaveLength(12);
    for (const person of watanareResidentCast) {
      const h = housingForPerson(person.id);
      expect(h, person.id).not.toBeNull();
      expect(h!.id).toBe(person.home);
    }
    for (const label of ['常态', '开心', '害羞', '惊讶', '慌张', '疑惑', '生气', '难过', '无语']) {
      const emotion = resolveNovelNpcEmotion(label);
      expect(resolveWatanareExpressionPortrait('甘织玲奈子', emotion)).toEqual({
        personId: 'watanare-renako', src: watanareRenakoExpressions[emotion], width: 1024, height: 1536, exact: true,
      });
    }
    expect(Object.keys(watanareExpressionSets)).toEqual([
      'watanare-renako', 'watanare-mai', 'watanare-ajisai', 'watanare-satsuki', 'watanare-kaho', 'watanare-haruna',
    ]);
    for (const [speaker, id, width, height, thirdEmotion] of [
      ['王冢真唯', 'watanare-mai', 1024, 1536, 'shy'],
      ['濑名紫阳花', 'watanare-ajisai', 1024, 1536, 'shy'],
      ['琴纱月', 'watanare-satsuki', 1024, 1536, 'shy'],
      ['小柳香穗', 'watanare-kaho', 512, 1024, 'thinking'],
      ['甘织遥奈', 'watanare-haruna', 360, 1024, 'shy'],
    ] as const) {
      expect(resolveWatanareExpressionPortrait(speaker, 'neutral')).toMatchObject({ personId: id, width, height, exact: true });
      expect(resolveWatanareExpressionPortrait(speaker, 'happy')).toMatchObject({ personId: id, width, height, exact: true });
      expect(resolveWatanareExpressionPortrait(speaker, thirdEmotion)).toMatchObject({ personId: id, width, height, exact: true });
      expect(resolveWatanareExpressionPortrait(speaker, 'sad')).toMatchObject({ personId: id, width, height, exact: false });
    }
    for (const roomId of ['amaori-family-home', 'ouzuka-residence', 'sena-family-home', 'koto-apartment', 'koyanagi-home']) {
      const room = getCampusInterior(roomId);
      expect(room, roomId).toBeDefined();
      const arrived = reduceState(world(), { type: 'novel_travel', locationId: roomId });
      expect(arrived.locationId).toBe(roomId);
      expect(arrived.interior?.roomId).toBe(roomId);
    }
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

  it('migrates a 1.12 dual save exactly once and adds Emma and Renako without duplicating them', () => {
    const state = world();
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    raw.schema_version = '1.12.0';
    const p = raw.protagonists as Record<string, any>;
    delete p.third;
    delete p.fourth;
    delete p.accounts.people.emma;
    delete p.accounts.people.renako;
    delete p.devices.emma;
    delete p.devices.renako;
    delete p.npcPhone?.contacts;
    if (p.backgroundLife) {
      delete p.backgroundLife.people.emma;
      delete p.backgroundLife.people.renako;
    }
    const beforeInactive = JSON.parse(JSON.stringify(p.inactive));
    const migrated = parseState(raw);
    expect(migrated.schema_version).toBe('1.13.0');
    expect(migrated.protagonists!.inactive).toEqual(beforeInactive);
    expect(migrated.protagonists!.third.locationId).toBe('home');
    expect(migrated.protagonists!.fourth.locationId).toBe('home');
    expect(migrated.protagonists!.accounts.people.emma.cards.gpt).toBe(1200000);
    expect(migrated.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
    expect(migrated.protagonists!.accounts.people.renako.cards.gpt).toBe(950000);
    expect(migrated.protagonists!.accounts.people.renako.deviceId).toBe('unread-city-phone-renako');
    expect(Object.keys(migrated.protagonists!.backgroundLife!.people)).toEqual(['soyo', 'sakiko', 'emma', 'renako']);
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
    expect(visibleForSoyo.some(person => person.id === 'watanare-renako')).toBe(true);
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    const visibleForEmma = getScenePeople(state.scene!, state.contacts, state.clock, hiddenProtagonistPersons(state));
    expect(visibleForEmma.some(person => person.id === 'majo-emma')).toBe(false);
    // Emma is not on the scene while she's the viewpoint, so an NPC DM to her is rejected.
    expect(() => {
      const copy = structuredClone(state);
      applyNpcPhoneCommand(copy, 'emma', { type: 'send_npc_message', npcId: 'majo-emma', text: '你好' }, 'blocked-emma-npc');
    }).toThrow(/由玩家控制/);
    state = reduceState(state, { type: 'switch_protagonist', target: 'renako' });
    const visibleForRenako = getScenePeople(state.scene!, state.contacts, state.clock, hiddenProtagonistPersons(state));
    expect(visibleForRenako.some(person => person.id === 'watanare-renako')).toBe(false);
  });

  it('does not ship residential prototype disclaimers in player-facing descriptions', () => {
    for (const id of ['emma-yuki-home','koko-old-house','nikaido-house','anan-noa-milia-home','majo-highrise-home','majo-studio']) {
      const room = getCampusInterior(id)!;
      expect(room.description).not.toMatch(/游戏原型|官方住宅|设定声明|住宅原型|不代表官方/);
      expect(room.label).not.toMatch(/原型/);
    }
  });

  it('keeps background lives settling while Emma is in the foreground', () => {
    let state = reduceState(world(), { type: 'switch_protagonist', target: 'emma' });
    const start = state.protagonists!.backgroundLife!.cursor;
    state = reduceState(state, { type: 'wait', minutes: 60 });
    expect(state.protagonists!.backgroundLife!.cursor).toBe(start + 60);
    expect(parseState(state)).toEqual(state);
  });
});
