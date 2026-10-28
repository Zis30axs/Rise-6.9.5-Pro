import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { CONSTRUCTION_BACKEND_JOB_ID, getLocationServiceQuote, getLocationServices } from '../src/runtime/location-services';
import { appiePayBalance, PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { validateStoryActions } from '../src/runtime/story-actions';

function atSite(owner: (typeof PROTAGONISTS)[number] = 'soyo') {
  let state = enableProtagonists(createInitialState());
  if (owner !== 'soyo') state = reduceState(state, { type: 'switch_protagonist', target: owner });
  state.clock = { day: 2, hour: 8, minute: 0 };
  state.locationId = 'construction-site';
  state.scene = null;
  state.player.energy = 95;
  if (state.protagonists?.backgroundLife) {
    const minute = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    state.protagonists.backgroundLife.cursor = minute;
    for (const p of Object.values(state.protagonists.backgroundLife.people)) p.nextDecisionAt = Math.max(p.nextDecisionAt, minute);
  }
  return parseState(state);
}
const computerStudent = (owner: (typeof PROTAGONISTS)[number] = 'soyo') =>
  reduceState(atSite(owner), { type: 'choose_academics', majorId: 'computer-science' });

describe('construction backend recruitment twist', () => {
  it('advertises all backend skills without revealing unloading to non-applicants', () => {
    const unchosen = atSite();
    expect(getLocationServices(unchosen).map(s => s.id)).toEqual(['construction-clear', 'construction-carry']);
    expect(getLocationServiceQuote(unchosen, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/计算机专业/);
    expect(() => reduceState(unchosen, { type: 'location_service', serviceId: CONSTRUCTION_BACKEND_JOB_ID })).toThrow(/计算机专业/);
    const wrongMajor = reduceState(unchosen, { type: 'choose_academics', majorId: 'law' });
    expect(getLocationServices(wrongMajor).some(s => s.id === CONSTRUCTION_BACKEND_JOB_ID)).toBe(false);
    const listing = getLocationServices(computerStudent()).find(s => s.id === CONSTRUCTION_BACKEND_JOB_ID)!;
    expect(listing.label).toMatch(/后端开发/);
    expect(listing.label).not.toMatch(/卸车|水泥/);
    for (const item of ['两名', 'Java', 'Python', 'Go', 'Node.js', 'Spring Boot', 'Django', 'Gin', '高并发', '分布式', '数据库优化', 'Docker', 'Kubernetes', 'CI/CD', 'Rust', '区块链', '双倍', '不用带电脑']) {
      expect(listing.description).toContain(item);
    }
    expect(listing.description).not.toMatch(/4900|水泥|卸车|200 元/);
    expect(listing.reveal).toContain('4900 袋水泥');
    expect(listing.reveal).toContain('200 元/人');
    expect(listing.reveal).toContain('6800 日元');
    expect(listing.payout).toBe(6800);
    expect(listing.completionDescription).toContain('4900 袋水泥');
    expect(getLocationServices(computerStudent()).map(s => s.id)).toEqual(['construction-clear', 'construction-carry', CONSTRUCTION_BACKEND_JOB_ID]);
  });

  it('requires explicit player acceptance instead of letting story actions skip the reveal', () => {
    const student = computerStudent();
    expect(() => validateStoryActions([{ type: 'service', serviceId: CONSTRUCTION_BACKEND_JOB_ID }], student)).toThrow(/地点服务/);
    expect(validateStoryActions([{ type: 'service', serviceId: 'construction-clear' }], student)).toEqual([
      { type: 'service', serviceId: 'construction-clear' },
    ]);
  });

  it('reuses worksite hours, time, health, exhaustion, money cap and existing shifts', () => {
    const student = computerStudent();
    const q = getLocationServiceQuote(student, CONSTRUCTION_BACKEND_JOB_ID);
    expect(q.blockedReason).toBeNull();
    expect(q.minutes).toBe(240);
    expect(q.payout).toBe(6800);
    expect(q.changes.energy).toBe(-75);
    const away = structuredClone(student); away.locationId = 'bookshop';
    expect(getLocationServiceQuote(away, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/当前地点/);
    const early = structuredClone(student); early.clock.hour = 6;
    expect(getLocationServiceQuote(early, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/未开放|开放时间/);
    const late = structuredClone(student); late.clock.hour = 15;
    expect(getLocationServiceQuote(late, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/打烊/);
    const tired = structuredClone(student); tired.player.energy = 74;
    expect(getLocationServiceQuote(tired, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/精力不足/);
    const sick = structuredClone(student); sick.player.health = 30;
    expect(getLocationServiceQuote(sick, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/感冒|重体力|畏寒/);
    expect(() => reduceState(sick, { type: 'location_service', serviceId: CONSTRUCTION_BACKEND_JOB_ID })).toThrow();
    const capped = structuredClone(student); capped.player.balance = 19_999_000;
    expect(getLocationServiceQuote(capped, CONSTRUCTION_BACKEND_JOB_ID).blockedReason).toMatch(/余额已接近上限/);
    expect(getLocationServiceQuote(student, 'construction-clear').blockedReason).toBeNull();
    expect(getLocationServiceQuote(student, 'construction-carry').blockedReason).toBeNull();
  });

  it('pays the active one of four protagonists in JPY and preserves the other three', () => {
    for (const owner of PROTAGONISTS) {
      const before = computerStudent(owner);
      const snapshot = structuredClone(before);
      const balances = Object.fromEntries(PROTAGONISTS.map(id => [id, appiePayBalance(before.protagonists!.accounts, id)]));
      const next = reduceState(before, { type: 'location_service', serviceId: CONSTRUCTION_BACKEND_JOB_ID });
      expect(next.clock).toEqual({ day: 2, hour: 12, minute: 0 });
      expect(next.player.energy).toBe(20);
      expect(next.player.balance - before.player.balance).toBe(6800);
      expect(appiePayBalance(next.protagonists!.accounts, owner) - balances[owner]).toBe(680000);
      expect(next.journal.at(-1)?.text).toContain('领取工资 6800 日元');
      expect(next.journal.at(-1)?.text).toContain('4900 袋水泥');
      expect(next.journal.at(-1)?.text).not.toContain('熟悉 Java');
      for (const other of PROTAGONISTS) {
        if (other === owner) continue;
        expect(appiePayBalance(next.protagonists!.accounts, other)).toBe(balances[other]);
        expect(personState(next, other).academics).toEqual(personState(before, other).academics);
        expect(personState(next, other).player).toEqual(personState(before, other).player);
      }
      expect(before).toEqual(snapshot);
      expect(parseState(next)).toEqual(next);
    }
  });
});
