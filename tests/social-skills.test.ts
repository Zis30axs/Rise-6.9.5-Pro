import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { applySocialSkillTurn, parseSocialSkills, socialSkillOverview } from '../src/runtime/social-skills';
import type { StoryAction } from '../src/frontend/types';

function newWorld() { return parseState(enableProtagonists(createInitialState())); }
const practice = (skillId = 'expression', deviation = 3, npcId?: string): StoryAction => ({
  type: 'social_skill', skillId: skillId as 'expression', deviation: deviation as 3,
  reason: '亲自表达心情并认真等待答复', ...(npcId ? { npcId } : {}),
});

describe('社交 Skills：存档、四主角隔离、正负好感和结算', () => {
  it('初始人格倾向不同，而相同 MBTI 的两位主角仍有独立技能', () => {
    const state = newWorld();
    const skills = state.protagonists!.socialSkills!;
    expect(socialSkillOverview(state, 'soyo').find(skill => skill.id === 'perception')?.level).toBe(3);
    expect(socialSkillOverview(state, 'sakiko').find(skill => skill.id === 'organizing')?.level).toBe(4);
    expect(socialSkillOverview(state, 'emma').find(skill => skill.id === 'empathy')?.level).toBe(4);
    expect(socialSkillOverview(state, 'renako').find(skill => skill.id === 'expression')?.level).toBe(1);
    expect(skills.people.emma.xp.empathy).not.toBe(skills.people.renako.xp.empathy);
  });

  it('旧存档无 socialSkills 时补齐；不触碰原有生命与专业数值', () => {
    const original = newWorld();
    const legacy = structuredClone(original);
    delete legacy.protagonists!.socialSkills;
    const restored = parseState(legacy);
    expect(restored.protagonists?.socialSkills?.people.renako.xp.expression).toBe(0);
    expect(restored.player).toEqual(original.player);
    expect(restored.academics).toEqual(original.academics);
    expect(restored.protagonists?.accounts).toEqual(original.protagonists?.accounts);
    expect(parseState(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
  });

  it('实际练习仅结算一次：偏离本性扣精力、增加压力与有限经验', () => {
    const state = newWorld();
    const action = practice();
    const updated = applyStoryActions(state, [action], 'skill-s1');
    expect(updated.player.energy).toBe(state.player.energy - 5);
    expect(updated.player.stress).toBe(Math.min(100, state.player.stress + 7));
    const oldXp = state.protagonists!.socialSkills!.people.soyo.xp.expression;
    expect(updated.protagonists!.socialSkills!.people.soyo.xp.expression).toBe(oldXp + 6);
    expect(updated.protagonists!.socialSkills!.people.soyo.latest).toMatchObject({ skillId: 'expression', earned: 6 });
    expect(applySocialSkillTurn(updated, [action], 'skill-s1')).toEqual(updated);
    expect(parseState(JSON.parse(JSON.stringify(updated)))).toEqual(updated);
  });

  it('切换主角后经验、精力和压力互不串号', () => {
    const original = newWorld();
    const trained = applyStoryActions(original, [practice()], 'skill-soyo');
    const switched = reduceState(trained, { type: 'switch_protagonist', target: 'renako' });
    expect(switched.protagonists!.socialSkills!.people.renako.xp.expression).toBe(0);
    expect(switched.protagonists!.socialSkills!.people.soyo.xp.expression).toBeGreaterThan(original.protagonists!.socialSkills!.people.soyo.xp.expression);
    expect(switched.player.energy).toBe(original.player.energy);
    const back = reduceState(switched, { type: 'switch_protagonist', target: 'soyo' });
    expect(back.player.energy).toBe(trained.player.energy);
    expect(back.player.stress).toBe(trained.player.stress);
  });

  it('违和行为只折减同对象的正面好感，不削弱负面后果', () => {
    const original = newWorld();
    const npcId = original.contacts[0]!.id;
    const positive = applyStoryActions(original, [
      { type: 'relationship', npcId, delta: 10, reason: '对方认可坦白' },
      practice('expression', 3, npcId),
    ], 'skill-rapport-positive');
    expect(positive.contacts.find(c => c.id === npcId)?.affinity).toBe(6);
    const negative = applyStoryActions(positive, [
      practice('expression', 3, npcId),
      { type: 'relationship', npcId, delta: -10, reason: '对方对威胁感到愤怒' },
    ], 'skill-rapport-negative');
    expect(negative.contacts.find(c => c.id === npcId)?.affinity).toBe(-4);
  });

  it('一天多次社交不会无限刷经验', () => {
    let state = newWorld();
    for (let index = 0; index < 8; index++) {
      state = applyStoryActions(state, [practice('expression', 0)], 'skill-daily-' + index);
    }
    expect(state.protagonists!.socialSkills!.people.soyo.daily.earned).toBe(24);
    expect(state.protagonists!.socialSkills!.people.soyo.xp.expression).toBe(40 + 24);
    const lastDay = structuredClone(state.protagonists!.socialSkills!);
    lastDay.people.soyo.daily = { day: state.clock.day + 1, earned: 0 };
    expect(parseSocialSkills(lastDay).people.soyo.latest?.day).toBe(state.clock.day);
  });

  it('不允许模型发明技能ID、异常偏离度、重复刷同一轮及额外字段', () => {
    const world = newWorld();
    expect(() => applyStoryActions(world, [practice('unknown', 2)], 'skill-invalid-id')).toThrow();
    expect(() => applyStoryActions(world, [practice('expression', 4)], 'skill-invalid-degree')).toThrow();
    expect(() => applyStoryActions(world, [practice(), practice()], 'skill-duplicate')).toThrow();
    expect(() => applyStoryActions(world, [{ ...practice(), secret: 999 } as StoryAction], 'skill-extra')).toThrow();
  });

  it('状态面板入口与内容在代码层独立存在', () => {
    const status = readFileSync(resolve(process.cwd(), 'src/frontend/WorldPanels.vue'), 'utf8');
    const panel = readFileSync(resolve(process.cwd(), 'src/frontend/SocialSkills.vue'), 'utf8');
    expect(status).toContain('<SocialSkills :state="model.state" />');
    expect(panel).toContain('data-status-section="skills"');
    expect(panel).toContain('role="progressbar"');
    expect(panel).not.toContain('Jev');
    expect(panel).not.toContain('LLM');
  });
});
