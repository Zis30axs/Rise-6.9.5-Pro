import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, otherProtagonist, otherProtagonists, personState, protagonistNames } from '../src/runtime/protagonist-world';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { getScenePeople, hiddenProtagonistPersons } from '../src/runtime/scene-context';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { applyNpcPhoneCommand, npcPhoneView } from '../src/runtime/npc-phone';
import { residentCast } from '../src/runtime/npc-cast';
import { protagonistOpening } from '../src/runtime/viewpoint-openings';
import { initializeBackgroundLife } from '../src/runtime/background-life';
import card from '../src/card.json';
import { applyPhoneReply } from '../src/runtime/protagonist-world';

function world() {
  const enabled = enableProtagonists(createInitialState());
  return parseState(enabled);
}
function atGate() {
  return reduceState(world(), { type: 'walk', x: 0, z: 29, yaw: 0, seed: 'third-protagonist' });
}

describe('third protagonist accounts and timeline', () => {
  it('starts all three viewpoints with their own novel opening, calendar and journal', () => {
    const state = world();
    const soyo = personState(state, 'soyo');
    const sakiko = personState(state, 'sakiko');
    const emma = personState(state, 'emma');
    const openings = [soyo.story[0].text, sakiko.story[0].text, emma.story[0].text];
    expect(new Set(openings).size).toBe(3);
    expect(card.data.first_mes).toBe(protagonistOpening('soyo', state.clock));
    expect(card.data.first_mes).not.toContain('开发占位');
    expect(card.data.scenario).toContain('东京');
    expect(openings[0]).toContain('长崎素世');
    expect(openings[1]).toContain('丰川祥子');
    expect(openings[2]).toContain('樱羽艾玛');
    expect(openings[0]).toContain('高田校园的南门');
    expect(openings[1]).toContain('目白台');
    expect(openings[2]).toContain('杂司谷住宅区');
    expect(openings[0]).not.toMatch(/月代雪|牢屋敷/);
    expect(openings[1]).not.toMatch(/月代雪|魔女裁判/);
    expect(openings[2]).not.toMatch(/CRYCHIC|Ave Mujica/);
    for (const personal of [soyo, sakiko, emma]) {
      expect(personal.journal[0].at).toBe('第 1 天 17:20');
      expect(personal.story[0].role).toBe('assistant');
      expect(personal.story[0].text).toContain('2025年8月28日，周四，17:20');
    }
    const switched = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(switched.story[0].text).toBe(emma.story[0].text);
    expect(switched.journal[0]).toEqual(emma.journal[0]);
    expect(personState(switched, 'soyo').story[0].text).toBe(soyo.story[0].text);
    expect(switched.contacts.map(contact => contact.id).sort()).toEqual(
      residentCast.filter(person => person.id !== 'majo-emma' && person.id !== 'majo-honoka').map(person => person.id).sort()
    );
  });

  it.each([
    { hour: 6, minute: 15, scene: /清晨/ },
    { hour: 10, minute: 5, scene: /白日/ },
    { hour: 17, minute: 20, scene: /街灯渐次亮起|和平的傍晚/ },
    { hour: 23, minute: 40, scene: /夜色/ },
    { hour: 0, minute: 5, scene: /夜色/ },
  ])('uses the shared clock and matching prose for subsequent initialization at $hour:$minute', ({ hour, minute, scene }) => {
    const initial = createInitialState();
    const savedSoyo = structuredClone({ story: initial.story, journal: initial.journal });
    initial.clock = { day: 9, hour, minute };
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const state = enableProtagonists(initial);
    expect(state.clock).toEqual(initial.clock);
    expect(state.story).toEqual(savedSoyo.story);
    expect(state.journal).toEqual(savedSoyo.journal);
    for (const owner of ['sakiko', 'emma'] as const) {
      const personal = personState(state, owner);
      expect(personal.story[0].text).toContain(`2025年9月5日，周五，${time}`);
      expect(personal.story[0].text).toMatch(scene);
      if (hour !== 17) expect(personal.story[0].text).not.toMatch(/傍晚|晚风|街灯渐次亮起/);
      expect(personal.journal[0].at).toBe(`第 9 天 ${time}`);
    }
  });

  it('preserves saved openings and stories across reload, re-enabling and viewpoint switches at a later time', () => {
    const state = world();
    const saved = Object.fromEntries((['soyo', 'sakiko', 'emma'] as const).map(owner => {
      const personal = personState(state, owner);
      personal.story.push({ id: `${owner}-saved-story`, role: 'assistant', text: `${owner} 已有的后续故事。` });
      return [owner, structuredClone({ story: personal.story, journal: personal.journal })];
    }));
    state.clock = { day: 9, hour: 10, minute: 5 };
    state.protagonists!.backgroundLife = initializeBackgroundLife(state);
    let restored = enableProtagonists(parseState(JSON.parse(JSON.stringify(state))));
    for (const target of ['sakiko', 'emma', 'soyo', 'emma'] as const) {
      restored = reduceState(restored, { type: 'switch_protagonist', target });
      expect(restored.clock).toEqual(state.clock);
      for (const owner of ['soyo', 'sakiko', 'emma'] as const) {
        expect(personState(restored, owner).story).toEqual(saved[owner].story);
        expect(personState(restored, owner).journal).toEqual(saved[owner].journal);
      }
      restored = parseState(JSON.parse(JSON.stringify(restored)));
    }
  });

  it('retains 60 LLM reply turns plus their inputs for each protagonist across reload and switches', () => {
    const state = world();
    const owners = ['soyo', 'sakiko', 'emma', 'renako'] as const;
    for (const owner of owners) {
      const personal = personState(state, owner);
      const opening = personal.story[0]!;
      // A 61st generated turn must expire the oldest pair, not the opening
      // or half of a user/reply exchange.
      personal.story = [opening, ...Array.from({ length: 61 }, (_, index) => [
        { id: `round-${owner}-${index + 1}-user`, role: 'user' as const, text: `${owner} 第 ${index + 1} 轮玩家输入。` },
        { id: `round-${owner}-${index + 1}-assistant`, role: 'assistant' as const, text: `${owner} 第 ${index + 1} 轮模型回复。` },
      ]).flat()];
    }
    let current = parseState(JSON.parse(JSON.stringify(state)));
    for (const target of ['sakiko', 'emma', 'renako', 'soyo'] as const) {
      current = reduceState(current, { type: 'switch_protagonist', target });
      expect(current.story).toHaveLength(121);
      expect(current.story[0]!.id).toContain('opening');
      expect(current.story[1]!.id).toBe(`round-${target}-2-user`);
      expect(current.story[2]!.id).toBe(`round-${target}-2-assistant`);
      expect(current.story[119]!.id).toBe(`round-${target}-61-user`);
      expect(current.story[120]!.id).toBe(`round-${target}-61-assistant`);
      current = parseState(JSON.parse(JSON.stringify(current)));
      for (const owner of owners) {
        expect(personState(current, owner).story).toHaveLength(121);
      }
    }
    const overLimit = structuredClone(current);
    overLimit.story.push(...Array.from({ length: 60 }, (_, index) => ({
      id: `oversize-${index}`, role: 'user' as const, text: '超出结构化存档的安全容量。',
    })));
    expect(() => parseState(overLimit)).toThrow();
  });

  it('seeds only the intended contacts and leaves all demo messages and schedules out of a new game', () => {
    const initial = createInitialState();
    expect(initial.contacts.map(contact => contact.id)).toEqual(['protagonist-sakiko', 'bang-tomori', 'bang-anon', 'bang-taki', 'bang-rana', 'bang-mutsumi', 'nagasaki-mother']);
    expect(initial.phone).toEqual([]);
    expect(initial.schedule).toEqual([]);
    expect(initial.story[0].text).not.toContain('手机轻震了两下');

    const state = world();
    expect(personState(state, 'soyo').contacts.map(contact => contact.id)).toEqual(['protagonist-sakiko', 'bang-tomori', 'bang-anon', 'bang-taki', 'bang-rana', 'bang-mutsumi', 'nagasaki-mother']);
    expect(personState(state, 'sakiko').contacts.map(contact => contact.id)).toEqual(['protagonist-soyo', 'bang-mutsumi', 'bang-uika', 'bang-umiri', 'bang-nyamu']);
    expect(personState(state, 'soyo').phone).toEqual([]);
    expect(personState(state, 'sakiko').phone).toEqual([]);

    const emma = personState(state, 'emma');
    const expected = residentCast.filter(person => person.id !== 'majo-emma' && person.id !== 'majo-honoka').map(person => person.id).sort();
    expect(expected).toHaveLength(13);
    expect(emma.contacts.map(contact => contact.id).sort()).toEqual(expected);
    expect(emma.contacts.every(contact => contact.sourcePersonId === contact.id && contact.isMain)).toBe(true);
    expect(emma.contacts.find(contact => contact.id === 'majo-yuki')?.name).toBe('月代雪');
    expect(emma.phone).toEqual([]);
    expect(emma.schedule).toEqual([]);

    const switched = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(npcPhoneView(switched, 'emma').contacts).toHaveLength(13);
    const sent = reduceState(switched, { type: 'phone_app', owner: 'emma', requestId: 'seeded-yuki-friend',
      command: { type: 'send_npc_message', npcId: 'majo-yuki', text: '雪酱，晚上一起回家吗？' } });
    expect(sent.protagonists!.npcPhone!.messages).toEqual([expect.objectContaining({
      owner: 'emma', targetId: 'majo-yuki', channel: 'npc', direction: 'outgoing',
    })]);
    expect(parseState(sent)).toEqual(sent);
  });

  it('registers three accounts, devices and separate personal states', () => {
    const state = world();
    expect(state.schema_version).toBe('1.13.0');
    expect(state.protagonists!.accounts.active).toBe('soyo');
    expect(Object.keys(state.protagonists!.accounts.people).sort()).toEqual(['emma', 'renako', 'sakiko', 'soyo']);
    expect(Object.keys(state.protagonists!.devices).sort()).toEqual(['emma', 'renako', 'sakiko', 'soyo']);
    expect(state.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
    expect(state.protagonists!.accounts.people.emma.theme).toBe('emma-soft');
    expect(activeProtagonist(state)).toBe('soyo');
    expect(otherProtagonists('soyo')).toEqual(['sakiko', 'emma', 'renako']);
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
    state.clock = { day: 9, hour: 10, minute: 5 };
    state.protagonists!.backgroundLife = initializeBackgroundLife(state);
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
    expect(migrated.clock).toEqual(raw.clock);
    expect(migrated.story).toEqual(state.story);
    expect(migrated.protagonists!.third.story[0].text).toContain('2025年9月5日，周五，10:05');
    expect(migrated.protagonists!.third.story[0].text).toContain('白日');
    expect(migrated.protagonists!.third.story[0].text).not.toMatch(/傍晚|晚风/);
    expect(migrated.protagonists!.third.locationId).toBe('home');
    expect(migrated.protagonists!.accounts.people.emma.cards.gpt).toBe(1200000);
    expect(migrated.protagonists!.accounts.people.emma.deviceId).toBe('unread-city-phone-emma');
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

describe('viewpoint opening time-of-day prose', () => {
  const times = [
    { hour: 0, minute: 0, period: 'night' },
    { hour: 4, minute: 59, period: 'night' },
    { hour: 5, minute: 0, period: 'morning' },
    { hour: 8, minute: 59, period: 'morning' },
    { hour: 9, minute: 0, period: 'day' },
    { hour: 10, minute: 5, period: 'day' },
    { hour: 12, minute: 0, period: 'day' },
    { hour: 16, minute: 59, period: 'day' },
    { hour: 17, minute: 0, period: 'evening' },
    { hour: 17, minute: 20, period: 'evening' },
    { hour: 18, minute: 59, period: 'evening' },
    { hour: 19, minute: 0, period: 'night' },
    { hour: 23, minute: 59, period: 'night' },
  ] as const;
  const cues = { morning: /清晨/, day: /白日|阳光/, evening: /傍晚|街灯渐次亮起/, night: /夜色/ };
  const characters = {
    soyo: { place: '高田校园的南门', memory: '那些已经走散的旧友', privateToOthers: /月代雪|牢屋敷/ },
    sakiko: { place: '目白台', memory: '既然已经亲手戴上了假面', privateToOthers: /月代雪|牢屋敷/ },
    emma: { place: '杂司谷住宅区', memory: '只要一想起雪，再想起希罗', privateToOthers: /CRYCHIC|Ave Mujica/ },
    renako: { place: '杂司谷住宅区', memory: '芦谷五人组', privateToOthers: /CRYCHIC|Ave Mujica|牢屋敷/ },
  };
  for (const owner of ['soyo', 'sakiko', 'emma', 'renako'] as const) {
    it.each(times)(`${owner} matches $period at $hour:$minute without changing the clock`, ({ hour, minute, period }) => {
      const clock = Object.freeze({ day: 9, hour, minute });
      const opening = protagonistOpening(owner, clock);
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      expect(opening).toContain(`2025年9月5日，周五，${time}`);
      const prose = opening.split('\n\n').slice(1).join('\n\n');
      expect(prose).toMatch(cues[period]);
      if (period !== 'evening') expect(prose).not.toMatch(/傍晚|晚风|街灯渐次亮起/);
      if (period === 'night') expect(prose).not.toMatch(/清晨|白日|阳光|无论做什么都还来得及|站在喧嚣的路边/);
      expect(opening).toContain(protagonistNames[owner]);
      expect(opening).toContain(characters[owner].place);
      expect(prose).toContain(characters[owner].memory);
      expect(prose).not.toMatch(characters[owner].privateToOthers);
      expect(clock).toEqual({ day: 9, hour, minute });
    });
  }
});
