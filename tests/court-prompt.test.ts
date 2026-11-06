import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import original from './fixtures/court-prompt-original.json';
import { createTavernBridge, STORY_PROTOCOL, storyProtocolForTurn } from '../src/runtime/bridge';
import { COURT_PROMPT_GROUPS, COURT_PROMPT_RULES as rules, courtPromptPlan } from '../src/runtime/court-prompt';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { initialCourtroom, courtStoryContext } from '../src/runtime/courtroom';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import * as memory from '../src/runtime/long-term-memory';
import type { StoryGenerationOptions, WorldState } from '../src/frontend/types';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const response = '<story>她望向窗外，街道上很安静。</story><phone_messages>[]</phone_messages>';
const memoryKey = 'unread-city:long-term-memory:settings:v1';

function ordinary() {
  const state = createInitialState();
  state.clock = { day: 2, hour: 10, minute: 0 };
  state.story = [];
  state.journal = [];
  return enableProtagonists(state);
}
function office() {
  const state = ordinary(), room = getCampusInterior('legal-office')!;
  state.locationId = room.id;
  state.scene = { ...room.entrance, areaId: room.parentLocationId, seed: 'prompt-test', encounterId: null };
  state.interior = { roomId: room.id, x: 0, z: 2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
  return parseState(state);
}
function trial() {
  const base = office(), context = courtStoryContext(base);
  const categories = context.categories.filter(category => category !== context.dailyPreset!.category);
  const state = applyStoryActions(base, [{ type: 'court_docket', offers: categories.map((category, i) => ({
    id: context.suggestedRandomIds[i], category, title: '公告委托' + i, client: '临时委托人' + i,
    summary: '公开证据中存在需要澄清的疑点。', difficulty: 'easy', rewardYen: 8000, experience: 100, preset: false,
  })) }], 'prompt-docket');
  const id = state.courtroom!.board!.offers.find(offer => offer.preset)!.id;
  return reduceState(state, { type: 'courtroom', phase: 'accept-preset', offerId: id });
}
function afterJudgment() {
  const state = trial();
  return applyStoryActions(state, [
    { type: 'court_step', key: 'proof', kind: 'contradiction', summary: '证据中的矛盾已经澄清。' },
    { type: 'court_finish', verdict: 'win', summary: '证据证明了委托人的主张。' },
  ], 'prompt-judgment');
}
function transport() {
  const generate = vi.fn(async (_config: { user_input: string; injects: { content: string }[] }) => response);
  const script = {
    parent: { SillyTavern: { getContext: () => ({ characterId: 0, characters: { 0: { avatar: 'court-test.png' } }, chatId: 'court-prompt', mainApi: 'openai' }) } },
    getVariables: () => ({}), replaceVariables: vi.fn(), eventOn: vi.fn(), eventRemoveListener: vi.fn(),
    tavern_events: { CHAT_CHANGED: 'chat_changed' }, generate, stopGenerationById: vi.fn(() => true),
  } as unknown as Window;
  const bridge = createTavernBridge(script)!;
  return { generate, bridge };
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(memoryKey, JSON.stringify({ enabled: false }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('verbatim court prompt routing', () => {
  it('preserves every original character, the full protocol, rule order and non-court constraints', () => {
    expect(STORY_PROTOCOL.length).toBe(original.fullProtocol.chars);
    expect(hash(STORY_PROTOCOL)).toBe(original.fullProtocol.sha256);
    expect(Object.values(COURT_PROMPT_GROUPS).flat().sort()).toEqual(Object.keys(rules).sort());
    expect(Object.keys(rules)).toEqual(original.rules.map(row => row.id));
    let position = -1;
    for (const row of original.rules) {
      const text = rules[row.id as keyof typeof rules];
      expect(text.length).toBe(row.chars);
      expect(hash(text)).toBe(row.sha256);
      expect(STORY_PROTOCOL.split(text)).toHaveLength(2);
      expect(STORY_PROTOCOL.indexOf(text)).toBeGreaterThan(position);
      position = STORY_PROTOCOL.indexOf(text);
    }
    const selected = storyProtocolForTurn(ordinary(), '去食堂吃饭');
    const withoutCourt = (text: string) => text.split('\n').filter(line => !Object.values(rules).some(rule => rule === line));
    expect(withoutCourt(selected)).toEqual(withoutCourt(STORY_PROTOCOL));
    for (const rule of Object.values(rules)) if (selected.includes(rule)) expect(selected.split(rule)).toHaveLength(2);
  });

  it.each(['去食堂吃饭', '去便利店买瓶水。', '去图书馆看书', '去校园散步', '逛街', '休息10分钟', '睡10小时', '看看窗外'])('reduces a bounded ordinary request: %s', input => {
    const state = ordinary(), before = structuredClone(state), selected = storyProtocolForTurn(state, input);
    expect(selected).toContain(rules.foundation);
    expect(selected).toContain(rules.qualification);
    expect(selected).toContain(rules.consultation);
    expect(selected).toContain(rules.observation);
    expect(selected).not.toContain(rules.commissions);
    expect(selected).not.toContain(rules.hearing);
    expect(STORY_PROTOCOL.length - selected.length).toBe(4100);
    expect(state).toEqual(before);
  });

  it.each([
    '', '继续', '就这样办', '我同意', '去那里', '她不肯还那笔钱，找个能替我讨说法的人',
    '有人拿走我的东西不还，我该怎么办', '找个懂这方面的人商量如何让她承担责任',
    'Let us take her to court', '我想主動提告', '去那个有审判席的地方坐一会儿',
    '去便利店买瓶水，然后告她', '先去法院，再旁听45分钟', '去法院',
    '先咨询，然后受理，最后开庭', '接受和解并支付赔偿', '雪莉接手后结案',
    '今天不旁听', '如果旁听45分钟会怎样', '回忆昨天的旁听', '睡10小时再去办理',
    '法院规则不用给我', '逛街\n然后处理那件事', '普通日常：其实我要起诉',
  ])('fails open for indirect, compound, multilingual or uncertain intent: %s', input => {
    expect(storyProtocolForTurn(ordinary(), input)).toBe(STORY_PROTOCOL);
  });

  it.each(['去法院旁听45分钟', '在法院大厅旁听676767min', '咨询法律问题', '了解起诉风险'])('includes complete entry rules before any legal travel: %s', input => {
    const prompt = storyProtocolForTurn(ordinary(), input);
    expect(prompt).toContain(rules.observation);
    expect(prompt).toContain(rules.consultation);
    expect(prompt).toContain('允许1–480分钟');
    expect(prompt).toContain('玩家确认后程序才扣起诉费');
  });

  it.each(['查看今日委托', '查看特殊委托', '我决定承接这份委托并直接开庭'])('includes same-turn acceptance/hearing/settlement/judgment successors: %s', input => {
    expect(storyProtocolForTurn(ordinary(), input)).toBe(STORY_PROTOCOL);
  });

  it.each(['legal-office', 'courthouse', 'court-hearing'])('honors legal location even for an ordinary request: %s', locationId => {
    const state = ordinary(); state.locationId = locationId;
    expect(storyProtocolForTurn(state, '休息10分钟')).toBe(STORY_PROTOCOL);
  });

  it('distinguishes public observation from a formal trial', () => {
    const publicSeat = ordinary(); publicSeat.locationId = 'court-hearing';
    expect(storyProtocolForTurn(publicSeat, '旁听45分钟')).not.toContain(rules.hearing);
    expect(storyProtocolForTurn(trial(), '旁听45分钟')).toBe(STORY_PROTOCOL);
  });

  it('keeps all constraints for shared active, quoted, pending-settlement and legacy cases', () => {
    const active = trial();
    active.protagonists!.accounts.active = 'sakiko';
    expect(courtStoryContext(active).active).toBeNull();
    expect(storyProtocolForTurn(active, '逛街')).toBe(STORY_PROTOCOL);
    const quoted = applyStoryActions(office(), [{ type: 'court_quote', defendant: '商店店主', reason: '未履行合同', risk: '需要更多证据',
      category: 'civil', lawyer: null, sherry: false, courtFeeYen: 2000, lawyerFeeYen: 0, sherryFeeYen: 0 }], 'prompt-quote');
    quoted.locationId = 'gate'; quoted.interior = null;
    expect(storyProtocolForTurn(quoted, '去食堂吃饭')).toBe(STORY_PROTOCOL);
    const pending = ordinary(); pending.courtroom = initialCourtroom();
    pending.courtroom.pendingSettlement = { summary: '等待玩家确认', defendantConsented: true, terms: [] };
    expect(storyProtocolForTurn(pending, '逛街')).toBe(STORY_PROTOCOL);
    const legacy = ordinary(); delete legacy.courtroom;
    legacy.lawCareer = { version: 1, owners: { emma: { experience: 0, totalPayout: 0, completedCaseIds: [], lastResult: null,
      active: { caseId: 'gallery-clock', stage: 'cross-examination', round: 0, mistakes: 0, deductions: [] } } } };
    expect(storyProtocolForTurn(legacy, '吃饭')).toBe(STORY_PROTOCOL);
  });

  it.each(['pending', 'fulfilled'] as const)('retains payment/fulfillment constraints for %s agreements, including overdue terms', status => {
    const state = ordinary(); state.courtroom = initialCourtroom();
    state.courtroom.agreements = [{ id: 'a', caseId: 'c', kind: 'judgment', day: 1, summary: '履行义务',
      claimant: { kind: 'protagonist', id: 'soyo', name: '长崎素世' }, defendant: { kind: 'npc', id: 'majo-sherry', name: '橘雪莉' },
      terms: [{ id: 'term-1', kind: 'payment', from: 'defendant', description: '支付赔偿', amountYen: 1000,
        dueDay: 1, status, fulfilledDay: status === 'fulfilled' ? 1 : null }] }];
    const prompt = storyProtocolForTurn(state, '去食堂吃饭');
    for (const key of COURT_PROMPT_GROUPS.enforcement) expect(prompt).toContain(rules[key]);
    expect(prompt).not.toContain(rules.commissions);
  });

  it('keeps future sanctions across a long rest, and saved result/recap relationship boundaries', () => {
    const state = ordinary(); state.courtroom = initialCourtroom();
    state.courtroom.sanctions = [{ id: 's', caseId: 'c', personId: 'majo-sherry', kind: 'custody', startDay: 3, endDay: 4, detail: '执行期间' }];
    expect(storyProtocolForTurn(state, '睡10小时')).toContain(rules.criminal);
    const completed = afterJudgment(); completed.locationId = 'gate'; completed.interior = null; completed.scene = null; completed.journal = [];
    expect(storyProtocolForTurn(completed, '逛街')).toContain(rules.relationships);
    const recap = ordinary(); recap.courtroom = initialCourtroom(); recap.courtroom.pendingRecaps.sakiko = '尚未补叙的结案';
    expect(storyProtocolForTurn(recap, '逛街')).toContain(rules.fulfillment);
  });

  it('covers legal continuity at the end of a long story and in the returned foreground', () => {
    const state = ordinary();
    state.story = [{ id: 'old', role: 'assistant', text: '普通生活。'.repeat(300) + '随后谈起了案件的被告。' }];
    expect(storyProtocolForTurn(state, '喝水')).toBe(STORY_PROTOCOL);
    state.story[0].text = '窗外很安静。'; state.story[0].returnStory = '回到诉讼双方的讨论。';
    expect(storyProtocolForTurn(state, '喝水')).toBe(STORY_PROTOCOL);
  });

  it('handles missing optional old-save fields and prepared interactions without modifying them', () => {
    const state = ordinary(); delete state.courtroom; delete state.lawCareer;
    expect(storyProtocolForTurn(state, '去食堂吃饭').length).toBeLessThan(STORY_PROTOCOL.length);
    const options: StoryGenerationOptions = { kind: 'interaction_event', interaction: { label: '出行中的意外', action: { type: 'novel_travel', locationId: 'gate' } } };
    expect(storyProtocolForTurn(state, '去食堂吃饭', options)).toBe(STORY_PROTOCOL);
  });
});

describe('actual story request integration', () => {
  it.each(['soyo', 'sakiko', 'emma', 'renako'] as const)('preserves %s authoritative projection and knowledge boundaries', async owner => {
    const state = owner === 'soyo' ? ordinary() : reduceState(ordinary(), { type: 'switch_protagonist', target: owner });
    state.story = []; state.journal = [];
    const before = structuredClone(state), h = transport();
    try {
      await h.bridge.generate('去食堂吃饭', state);
      const config = h.generate.mock.calls[0]![0], system = config.injects[0].content;
      expect(h.generate).toHaveBeenCalledTimes(1);
      expect(system).toContain(storyProtocolForTurn(state, '去食堂吃饭'));
      expect(system).toContain('不得把全知信息自动当作任一角色已知事实');
      expect(config.user_input).toContain(JSON.stringify(courtStoryContext(state)));
      expect(system).toContain('<story>'); expect(system).toContain('<phone_messages>');
      expect(state).toEqual(before);
    } finally { h.bridge.dispose(); }
  });

  it.each(['chat', 'responses'] as const)('uses the selected originals on custom %s requests without extra calls', async format => {
    localStorage.setItem('unread-city:story-api:v1', JSON.stringify({ mode: 'custom', format, endpoint: 'https://model.example/v1', model: 'test', preset: 'test-preset' }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(format === 'chat'
      ? { choices: [{ message: { content: response } }] } : { output_text: response }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const h = transport(), state = ordinary();
    try {
      await h.bridge.generate('去食堂吃饭', state);
      expect(h.generate).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body as string);
      const system = format === 'chat' ? body.messages.filter((row: { role: string }) => row.role === 'system').map((row: { content: string }) => row.content).join('\n') : body.input[0].content[0].text;
      expect(system).toContain(storyProtocolForTurn(state, '去食堂吃饭'));
      expect(system).not.toContain(rules.commissions);
    } finally { h.bridge.dispose(); }
  });

  it('restores every rule on a tagged memory continuation that can reveal a legal transition', async () => {
    localStorage.setItem(memoryKey, JSON.stringify({ enabled: true, protocol: 'tags' }));
    const h = transport();
    h.generate.mockResolvedValueOnce('<memory_lookup>{"operation":"search_memory","query":"此前的纠纷"}</memory_lookup>');
    try {
      await h.bridge.generate('去食堂吃饭', ordinary());
      expect(h.generate).toHaveBeenCalledTimes(2);
      expect(h.generate.mock.calls[0]![0].injects[0].content).not.toContain(rules.commissions);
      expect(h.generate.mock.calls[1]![0].injects[0].content).toContain(STORY_PROTOCOL);
    } finally { h.bridge.dispose(); }
  });

  it('includes the full rules when the initial memory retrieval adds unseen legal history', async () => {
    localStorage.setItem(memoryKey, JSON.stringify({ enabled: true, protocol: 'tags' }));
    vi.spyOn(memory, 'memoryPromptContext').mockResolvedValue('此前的纠纷已经进入诉前协商。');
    const h = transport();
    try {
      await h.bridge.generate('去食堂吃饭', ordinary());
      expect(h.generate).toHaveBeenCalledTimes(1);
      expect(h.generate.mock.calls[0]![0].injects[0].content).toContain(STORY_PROTOCOL);
    } finally { h.bridge.dispose(); }
  });

  it('keeps full rules through native memory tools and their follow-up request', async () => {
    localStorage.setItem(memoryKey, JSON.stringify({ enabled: true, protocol: 'tools', maxLookups: 1 }));
    localStorage.setItem('unread-city:story-api:v1', JSON.stringify({ mode: 'custom', format: 'chat', endpoint: 'https://model.example/v1', model: 'test' }));
    const fetched: { messages: { role: string; content: string }[] }[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      fetched.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ choices: [{ message: fetched.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'lookup-1', type: 'function', function: { name: 'search_memory', arguments: '{"query":"之前的纠纷"}' } }] }
        : { role: 'assistant', content: response } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const h = transport();
    try {
      await h.bridge.generate('去食堂吃饭', ordinary());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const request of fetched) expect(request.messages[0].content).toContain(STORY_PROTOCOL);
      expect(fetched[1].messages.some(row => row.role === 'tool')).toBe(true);
      expect(h.generate).not.toHaveBeenCalled();
    } finally { h.bridge.dispose(); }
  });

  it('measures actual assembled prompts against the unchanged full-protocol baseline', async () => {
    // Explicit heuristic, not a provider tokenizer or an API billing claim.
    const estimate = (text: string) => {
      const nonAscii = [...text].filter(char => char.codePointAt(0)! > 127).length;
      return Math.ceil(nonAscii + (text.length - nonAscii) / 4);
    };
    const scenarios = [
      { name: 'campus-meal', input: '去食堂吃饭', state: ordinary() },
      { name: 'shopping', input: '去便利店买瓶水', state: ordinary() },
      { name: 'consultation-entry', input: '咨询法律问题', state: ordinary() },
      { name: 'travel-observation', input: '去法院旁听45分钟', state: ordinary() },
      { name: 'indirect-lawsuit', input: '她不肯还钱，找个能替我讨说法的人', state: ordinary() },
      { name: 'office-docket', input: '查看今日委托', state: office() },
      { name: 'active-hearing', input: '雪莉接手后结案', state: trial() },
      { name: 'post-judgment', input: '逛街', state: (() => { const s = afterJudgment(); s.locationId = 'gate'; s.interior = null; s.scene = null; s.journal = []; return s; })() },
    ];
    const rows = [];
    for (const scenario of scenarios) {
      const h = transport();
      try {
        await h.bridge.generate(scenario.input, scenario.state);
        const sent = h.generate.mock.calls[0]![0], system = sent.injects[0].content;
        const selected = storyProtocolForTurn(scenario.state, scenario.input);
        expect(system).toContain(selected);
        const before = system.replace(selected, () => STORY_PROTOCOL);
        const fullBefore = before + '\n' + sent.user_input, fullAfter = system + '\n' + sent.user_input;
        rows.push({ name: scenario.name, plan: courtPromptPlan(scenario.state, scenario.input),
          systemCharsBefore: before.length, systemCharsAfter: system.length,
          requestCharsBefore: fullBefore.length, requestCharsAfter: fullAfter.length,
          estimatedTokensBefore: estimate(fullBefore), estimatedTokensAfter: estimate(fullAfter),
          savedChars: before.length - system.length });
      } finally { h.bridge.dispose(); }
    }
    expect(rows[0].savedChars).toBe(4100);
    expect(rows.find(row => row.name === 'active-hearing')!.savedChars).toBe(0);
    if (process.env.COURT_PROMPT_REPORT) {
      mkdirSync(dirname(process.env.COURT_PROMPT_REPORT), { recursive: true });
      writeFileSync(process.env.COURT_PROMPT_REPORT, JSON.stringify({ source: original.source,
        methodology: 'Captured Tavern bridge system+user prompts; baseline replaces only the selected protocol with the hash-verified original full protocol. Memory disabled. Estimate = non-ASCII code points + ASCII characters / 4, rounded up. Excludes inherited Tavern presets/lore and model-specific message overhead.', rows }, null, 2) + '\n');
    }
  });
});
