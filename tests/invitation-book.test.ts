import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { invitationBookFixtureState } from './e2e/invitation-book-state';
import InvitationBook from '../src/frontend/InvitationBook.vue';
import { invitationCards, invitationDraftError, invitationDraftText, defaultInvitationTime } from '../src/frontend/invitation-book';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { startSocialAgenda } from '../src/runtime/social-agenda';
import type { SocialInvitation } from '../src/runtime/natural-interactions';
import type { ShellModel, WorldState } from '../src/frontend/types';

vi.mock('../src/frontend/MapCharacterAvatar.vue', () => ({ default: { props: ['name'], template: '<span class="cms-avatar-face">{{ name }}</span>' } }));
const world = () => { const state = parseState(enableProtagonists(createInitialState())); state.clock = { day: 2, hour: 18, minute: 0 }; return state; };
const invite = (values: Partial<SocialInvitation> = {}): SocialInvitation => ({ id: 'book-1', owner: 'soyo', targetId: 'watanare-mai', targetName: '王冢真唯', source: 'meeting', locationId: 'cafe', day: 2, time: '19:30', message: '一起喝杯咖啡吧。', status: 'accepted', createdAt: 2500, messageId: null, response: '好，晚上见。', ...values });
let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ''; });
function mount(state: WorldState) {
  const model = reactive({ state, busy: false, notice: '', memoryScope: 'book-test' } as ShellModel);
  const compose = vi.fn(), travel = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  app = createApp(InvitationBook, { model, novelMode: true, nearbyPersonIds: [], onCompose: compose, onTravel: travel });
  app.mount(host);
  return { host, model, compose, travel };
}
async function click(host: HTMLElement, selector: string) { (host.querySelector(selector) as HTMLButtonElement).click(); await nextTick(); }

describe('邀约簿的本人记录与知情边界', () => {
  it('显示发出和收到的邀约，排除其他主角与第三人的约定', () => {
    const state = world();
    state.protagonists!.socialInvitations = [invite(), invite({ id: 'received', owner: 'sakiko', targetId: 'soyo', targetName: '长崎素世' }), invite({ id: 'private', owner: 'emma' })];
    const rows = invitationCards(state);
    expect(rows.map(row => row.id)).toEqual(['book-1', 'received']);
    expect(rows[1]).toMatchObject({ name: '丰川祥子', protagonistId: 'sakiko', personId: 'sakiko', incoming: true });
  });
  it('未公开的迟到、取消和爽约计划不进入界面，也不会被界面读取后改写', () => {
    const state = world(), row = invite();
    state.protagonists!.socialInvitations = [row];
    startSocialAgenda(state, row, { rationale: '秘密准备礼物', steps: [
      { kind: 'prepare', day: 2, time: '18:15', detail: '秘密买花' },
      { kind: 'depart', day: 2, time: '19:10', detail: '秘密出发' },
      { kind: 'arrive', day: 2, time: '19:45', detail: '秘密晚到' },
      { kind: 'leave', day: 2, time: '20:30', detail: '秘密离开' },
    ] });
    row.agenda!.status = 'no_show';
    const before = JSON.stringify(state);
    const { host } = mount(state);
    expect(host.textContent).toContain('19:30');
    expect(host.textContent).not.toMatch(/秘密|19:45|爽约|no_show|world_actions|调度器|模型/);
    expect(JSON.stringify(invitationCards(state))).not.toContain('agenda');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('往期只标注时间已过，不凭空宣布成功赴约；待回应和婉拒分开', () => {
    const state = world();
    state.protagonists!.socialInvitations = [invite({ time: '14:00' }), invite({ id: 'pending', status: 'pending', response: null }), invite({ id: 'declined', status: 'declined' })];
    const rows = invitationCards(state);
    expect(rows.find(row => row.id === 'book-1')).toMatchObject({ shelf: 'history', statusLabel: '已过约定时间' });
    expect(rows.find(row => row.id === 'pending')?.shelf).toBe('pending');
    expect(rows.find(row => row.id === 'declined')?.shelf).toBe('history');
  });
  it('没有邀约字段的旧存档仍可打开', () => {
    const state = world(); delete state.protagonists!.socialInvitations;
    expect(invitationCards(state)).toEqual([]);
    expect(mount(state).host.textContent).toContain('还没有约好的见面');
  });
});

describe('新的邀请和赴约快捷入口', () => {
  it('浏览器夹具是可保存的真实世界，前往操作沿用正式旅行结算', () => {
    const state = invitationBookFixtureState();
    const after = reduceState(state, { type: 'novel_travel', locationId: 'cafe' });
    expect(after.locationId).toBe('cafe');
    expect(after.clock).not.toEqual(state.clock);
    expect(parseState(after).protagonists?.socialInvitations).toHaveLength(4);
  });
  it('采用游戏日期，跨午夜的默认邀请在明天，并拒绝过去时间', () => {
    const state = world(); state.clock = { day: 2, hour: 23, minute: 40 };
    expect(defaultInvitationTime(state)).toEqual({ date: '2025-08-30', time: '00:40' });
    const draft = { name: '丰川祥子', source: 'sms' as const, date: '2025-08-29', time: '18:00', location: '街角咖啡店', activity: '喝咖啡' };
    expect(invitationDraftError(draft, state)).toContain('晚于现在');
    draft.date = '2025-08-30';
    expect(invitationDraftError(draft, state)).toBe('');
    expect(invitationDraftText(draft)).toBe('给丰川祥子发短信，约在2025年8月30日 18:00，在街角咖啡店见面。想一起做的事：喝咖啡');
  });
  it('填表只交还一份正文草稿，不创建同意记录或自动推进世界', async () => {
    const state = world(), before = JSON.stringify(state);
    const { host, compose } = mount(state);
    await click(host, '[data-new-invitation]');
    await click(host, '[data-invite-contact]');
    const textarea = host.querySelector('textarea')!; textarea.value = '吃完饭一起散步。'; textarea.dispatchEvent(new Event('input'));
    await nextTick();
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await nextTick();
    expect(compose).toHaveBeenCalledOnce();
    expect(compose.mock.calls[0][0]).toContain('发短信');
    expect(compose.mock.calls[0][0]).toContain('吃完饭一起散步。');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('所有联系人都可选，搜索后的无结果与不能当面邀请状态可见', async () => {
    const state = world(), base = state.contacts[0];
    state.contacts = Array.from({ length: 17 }, (_, n) => ({ ...base, id: 'friend-' + n, sourcePersonId: null, name: '朋友' + n }));
    const { host } = mount(state); await click(host, '[data-new-invitation]');
    expect(host.querySelectorAll('[data-invite-contact]')).toHaveLength(17);
    await click(host, '[data-invite-contact="friend-16"]');
    expect((host.querySelector('.ib-channel button:last-child') as HTMLButtonElement).disabled).toBe(true);
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = '不存在'; search.dispatchEvent(new Event('input')); await nextTick();
    expect(host.textContent).toContain('没有找到这个名字');
  });
  it('赴约只向父组件发出已有邀请 ID，忙碌和已在场时不可重复前往', async () => {
    const state = world(); state.protagonists!.socialInvitations = [invite()];
    const { host, model, travel } = mount(state);
    await click(host, '[data-invitation-travel]'); expect(travel).toHaveBeenCalledWith('book-1');
    model.busy = true; await nextTick();
    expect((host.querySelector('[data-invitation-travel]') as HTMLButtonElement).disabled).toBe(true);
    model.busy = false; model.state.locationId = 'cafe'; model.state.interior = null; await nextTick();
    expect(host.querySelector('[data-invitation-travel]')?.textContent).toBe('已在约定地点');
    expect((host.querySelector('[data-invitation-travel]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('独立入口接到现有旅行与正文流程，且保留用户已有草稿', () => {
    const shell = readFileSync('src/frontend/App.vue', 'utf8');
    expect(shell).toContain("id: 'invitations', title: '邀约簿'");
    expect(shell).toContain('@compose="prepareInvitationAction" @travel="travelFromInvitationBook"');
    expect(shell).toContain("[draft.value.trim(), text].filter(Boolean).join('\\n')");
    expect(shell).toContain('if (await travelToMeeting(invite)) closeWindow(false)');
  });
});
