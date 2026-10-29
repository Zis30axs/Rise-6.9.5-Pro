import { expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stubPath = resolve(root, 'src/frontend/generated/embedded-phone.ts');
const recordsDir = resolve(root, 'agent-edition/records');

const phoneStub = `// Local stand-in so the development server can boot without the private phone bundle.
export const embeddedPhoneRuntimeSource = '/* phone bundle not built */\\n';
export const embeddedPhoneMetadata = { stub: true } as const;
`;

/** Create the missing generated phone module without replacing a real build. */
export function ensurePhoneModule() {
  if (existsSync(stubPath)) {
    const source = readFileSync(stubPath, 'utf8');
    if (source.includes('stub: true') && source.includes('phone bundle not built')) return 'stub' as const;
    return 'existing' as const;
  }
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(stubPath, phoneStub, 'utf8');
  return 'stub' as const;
}

export type Summary = {
  protagonist: string;
  clock: { day: number; hour: number; minute: number };
  locationId: string;
  interior: string | null;
  majorId: string | null;
  subjects: { subjectId: string; points: number }[];
  energy: number;
  balance: number;
  health: number;
  stress: number;
  morale: number;
  satiety: number;
  foodEnergy: number;
  inventory: { itemId: string; quantity: number }[];
  phone: { npcId: string; text: string; read: boolean }[];
  affinities: { id: string; name: string; affinity: number }[];
  storyCount: number;
  storyTail: { role: string; text: string }[];
  enrolled: boolean;
  qualification: string | null;
  boardTitles: string[];
};
export type PendingView = { id: string; kind: string; userInput: string; system: string };
export type Step =
  | { op: 'say'; text: string }
  | { op: 'inject'; rawText: string }
  | { op: 'click'; selector: string }
  | { op: 'clickRole'; name: string }
  | { op: 'select'; selector: string; value: string };

type Status = { ready: boolean; busy: boolean; notice: string; switching: boolean; database: string };

export function diffSummary(before: Summary, after: Summary) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const keys = ['protagonist', 'locationId', 'interior', 'majorId', 'energy', 'balance', 'health', 'stress', 'morale', 'satiety', 'foodEnergy', 'storyCount', 'enrolled', 'qualification'] as const;
  for (const key of keys) {
    if (before[key] !== after[key]) changes[key] = { before: before[key], after: after[key] };
  }
  if (JSON.stringify(before.clock) !== JSON.stringify(after.clock)) changes.clock = { before: before.clock, after: after.clock };
  if (JSON.stringify(before.subjects) !== JSON.stringify(after.subjects)) changes.subjects = { before: before.subjects, after: after.subjects };
  if (JSON.stringify(before.inventory) !== JSON.stringify(after.inventory)) changes.inventory = { before: before.inventory, after: after.inventory };
  if (JSON.stringify(before.phone) !== JSON.stringify(after.phone)) changes.phone = { before: before.phone, after: after.phone };
  if (JSON.stringify(before.affinities) !== JSON.stringify(after.affinities)) changes.affinities = { before: before.affinities, after: after.affinities };
  if (JSON.stringify(before.boardTitles) !== JSON.stringify(after.boardTitles)) changes.boardTitles = { before: before.boardTitles, after: after.boardTitles };
  return changes;
}

async function call<T>(page: Page, method: string, arg?: unknown): Promise<T> {
  return page.evaluate(async ({ method, arg }) => {
    const agent = (window as unknown as { __unreadCityAgent: Record<string, (value?: unknown) => Promise<T> | T> }).__unreadCityAgent;
    if (!agent || typeof agent[method] !== 'function') throw new Error('开发接口不可用：' + method);
    return agent[method](arg);
  }, { method, arg });
}

export class AgentSession {
  readonly errors: string[] = [];
  readonly steps: Step[] = [];
  readonly turns: unknown[] = [];
  phoneModule: 'existing' | 'stub' = 'existing';

  constructor(private readonly page: Page) {
    page.on('pageerror', error => this.errors.push(error.message));
  }

  static async open(page: Page, run = 'emma-play') {
    const phoneModule = ensurePhoneModule();
    await page.route('https://**', route => route.abort('blockedbyclient'));
    await page.route('http://**', route => {
      const url = route.request().url();
      if (url.startsWith('http://127.0.0.1:5191') || url.startsWith('http://localhost:5191')) return route.continue();
      return route.abort('blockedbyclient');
    });
    const session = new AgentSession(page);
    session.phoneModule = phoneModule;
    await page.goto(`/agent-edition/agent.html?run=${encodeURIComponent(run)}&presentation=novel`);
    await page.locator('[data-unread-city-root]').waitFor({ timeout: 120_000 });
    await expect.poll(async () => (await session.status()).ready, { timeout: 30_000 }).toBe(true);
    return session;
  }

  status() { return call<Status>(this.page, 'status'); }
  pending() { return call<PendingView | null>(this.page, 'pending'); }
  summary() { return call<Summary>(this.page, 'summary'); }
  logs() { return call<unknown>(this.page, 'logs'); }
  databaseNames() { return call<string[]>(this.page, 'databaseNames'); }

  async initScene(spec: unknown) {
    const summary = await call<Summary>(this.page, 'initScene', spec);
    await this.page.locator('[data-unread-city-root]').waitFor();
    return summary;
  }
  async newGame() {
    const id = await call<string>(this.page, 'newGame');
    await this.page.locator('[data-academic-setup]').waitFor();
    return id;
  }
  saveScenario(name: string) { return call<{ name: string; chatId: string }>(this.page, 'saveScenario', name); }
  async restoreScenario(name: string) {
    const saved = await call<{ name: string; chatId: string }>(this.page, 'restoreScenario', name);
    await this.page.locator('[data-unread-city-root]').waitFor();
    await expect.poll(async () => (await this.status()).ready, { timeout: 30_000 }).toBe(true);
    return saved;
  }

  async playerSay(text: string) {
    this.steps.push({ op: 'say', text });
    const box = this.page.getByRole('textbox', { name: '接下来，你想做什么？' });
    await box.fill(text);
    await this.page.getByRole('button', { name: /继续故事/ }).click();
  }
  async click(selector: string) {
    this.steps.push({ op: 'click', selector });
    await this.page.locator(selector).click();
  }
  async clickRole(name: string) {
    this.steps.push({ op: 'clickRole', name });
    await this.page.getByRole('button', { name, exact: true }).click();
  }
  async select(selector: string, value: string) {
    this.steps.push({ op: 'select', selector, value });
    await this.page.locator(selector).selectOption(value);
  }
  async shot(name: string) {
    mkdirSync(recordsDir, { recursive: true });
    const file = resolve(recordsDir, name);
    await this.page.screenshot({ path: file, type: 'jpeg', quality: 42 });
    return file;
  }

  private async waitPending(timeout: number, noticeBefore: string, allowTimeout = false) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const pending = await this.pending();
      if (pending) return pending;
      const status = await this.status();
      if (!status.busy && status.notice && status.notice !== noticeBefore) throw new Error(status.notice);
      await this.page.waitForTimeout(40);
    }
    if (allowTimeout) return null;
    throw new Error('游戏没有向开发接口请求上游回复');
  }
  private async waitSettled(requestId: string) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
      const pending = await this.pending();
      const status = await this.status();
      if (pending && pending.id !== requestId) return;
      if (!status.busy && !pending) return;
      if (!status.busy && pending?.id !== requestId) return;
      await this.page.waitForTimeout(40);
    }
    throw new Error('这一轮叙事没有结束');
  }
  private silence(pending: PendingView) {
    if (pending.kind !== 'autonomous_sms' && !pending.userInput.includes('主动短信子任务上下文') && !pending.system.includes('独立运行的私人短信子任务')) {
      throw new Error('出现了剧本没有准备的后续生成。\n' + pending.userInput.slice(0, 500));
    }
    const match = pending.userInput.match(/"id"\s*:\s*"([^"]+)"/);
    if (!match) throw new Error('主动短信任务缺少编号');
    return `<autonomous_sms>{"id":"${match[1]}","text":null}</autonomous_sms>`;
  }
  private async deliver(rawText: string, before: Summary, noticeBefore: string, expectReject = false) {
    this.steps.push({ op: 'inject', rawText });
    const accepted = await call<{ id: string; kind: string }>(this.page, 'injectReply', rawText);
    await this.waitSettled(accepted.id);
    const status = await this.status();
    const after = await this.summary();
    const rejected = !!status.notice && status.notice !== noticeBefore;
    if (expectReject && !rejected) throw new Error('不合协议的回复没有被拒绝');
    if (!expectReject && rejected) {
      this.turns.push({ rawText, notice: status.notice, before, after, diff: diffSummary(before, after) });
      throw new Error(status.notice);
    }
    if (expectReject && (after.storyCount !== before.storyCount || JSON.stringify(after.clock) !== JSON.stringify(before.clock) || after.balance !== before.balance)) {
      throw new Error('拒绝回复后，存档仍然发生了变化');
    }
    const turn = { rawText, notice: status.notice, before, after, diff: diffSummary(before, after), rejected };
    this.turns.push(turn);
    return turn;
  }
  private async drain(after: Summary, notice: string, followup?: (pending: PendingView) => string | null) {
    const extra = [];
    for (let index = 0; index < 3; index += 1) {
      const existing = await this.pending();
      const pending = existing ?? await this.waitPending(2200, notice, true);
      if (!pending) break;
      const custom = followup?.(pending);
      const turn = await this.deliver(custom ?? this.silence(pending), after, notice);
      extra.push(turn);
      after = turn.after;
      notice = turn.notice;
    }
    return extra;
  }

  readState() { return call<Record<string, unknown>>(this.page, 'readState'); }

  /** Type a player line, inject one upstream reply, then answer any real follow-up generation. */
  async play(text: string, reply: string | ((pending: PendingView) => string), options?: { followup?: (pending: PendingView) => string | null }) {
    const before = await this.summary();
    const noticeBefore = (await this.status()).notice;
    await this.playerSay(text);
    const pending = await this.waitPending(20_000, noticeBefore);
    const raw = typeof reply === 'function' ? reply(pending) : reply;
    const turn = await this.deliver(raw, before, noticeBefore);
    const followups = await this.drain(turn.after, turn.notice, options?.followup);
    return { ...turn, pending, followups };
  }
  /** The game has already asked for an upstream reply, for example after a phone button. */
  async answerPending(reply: string | ((pending: PendingView) => string)) {
    const before = await this.summary();
    const noticeBefore = (await this.status()).notice;
    const pending = await this.waitPending(30_000, noticeBefore);
    const raw = typeof reply === 'function' ? reply(pending) : reply;
    const turn = await this.deliver(raw, before, noticeBefore);
    const followups = await this.drain(turn.after, turn.notice);
    return { ...turn, pending, followups };
  }
  async playRejected(text: string, rawText: string) {
    const before = await this.summary();
    const noticeBefore = (await this.status()).notice;
    await this.playerSay(text);
    await this.waitPending(20_000, noticeBefore);
    return this.deliver(rawText, before, noticeBefore, true);
  }
  async clickAndReply(selector: string, reply: (pending: PendingView) => string) {
    const before = await this.summary();
    const noticeBefore = (await this.status()).notice;
    await this.click(selector);
    const pending = await this.waitPending(20_000, noticeBefore);
    const turn = await this.deliver(reply(pending), before, noticeBefore);
    const followups = await this.drain(turn.after, turn.notice);
    return { ...turn, followups };
  }

  async replay(steps: Step[]) {
    const plan = steps.slice();
    for (const step of plan) {
      if (step.op === 'say') await this.playerSay(step.text);
      else if (step.op === 'click') await this.click(step.selector);
      else if (step.op === 'clickRole') await this.clickRole(step.name);
      else if (step.op === 'select') await this.select(step.selector, step.value);
      else if (step.op === 'inject') {
        const pending = await this.pending() ?? await this.waitPending(20_000, (await this.status()).notice);
        if (!pending) throw new Error('重放时没有等待中的上游回复');
        const before = await this.summary();
        const turn = await this.deliver(step.rawText, before, (await this.status()).notice);
        await this.drain(turn.after, turn.notice);
      }
    }
  }

  writeRecord(name: string, extra: Record<string, unknown> = {}) {
    mkdirSync(recordsDir, { recursive: true });
    const file = resolve(recordsDir, name);
    writeFileSync(file, JSON.stringify({
      phoneModule: this.phoneModule,
      errors: this.errors,
      steps: this.steps,
      turns: this.turns,
      ...extra,
    }, null, 2));
    return file;
  }
}
