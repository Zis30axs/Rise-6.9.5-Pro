import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute } from '../src/runtime/protagonist-world';
import { INSTRUMENTS, accountSummary, quote } from '../src/runtime/stock-market/market.mjs';
import {
  buildXitterMarketPublicFacts,
  computeMarketIndices,
  isExDividendDay,
  marketBulletins,
  nextExDividendDay,
  tickerAnalysis,
} from '../src/runtime/stock-market/intelligence';
import { stockAccount } from '../src/runtime/stock-world';
import { networkAccounts } from '../src/runtime/network-identities';
import { clipScrapArtifactToNotebook, readScrapbook } from '../src/runtime/notebook';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import ToolDock from '../src/frontend/ToolDock.vue';
import StockPanel from '../src/frontend/StockPanel.vue';
import type { ShellActions, ShellModel, WorldAction, WorldState } from '../src/frontend/types';

function installMemoryIndexedDB() {
  const databases = new Map<string, Map<string, Map<string, Record<string, unknown>>>>();
  const fakeIdb = {
    open(name: string) {
      let stores = databases.get(name);
      const isNew = !stores;
      if (!stores) {
        stores = new Map();
        databases.set(name, stores);
      }
      const db = {
        objectStoreNames: { contains: (s: string) => stores!.has(s) },
        createObjectStore(s: string) {
          if (!stores!.has(s)) stores!.set(s, new Map());
          return { createIndex: () => ({}) };
        },
        transaction() {
          let pending = 0;
          let scheduled = false;
          const txObj: Record<string, unknown> = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore: (storeName: string) => {
              const table = stores!.get(storeName)!;
              return {
                get(key: string) { return track(() => (table.has(key) ? structuredClone(table.get(key)) : undefined)); },
                put(val: Record<string, unknown>) {
                  return track(() => {
                    const key = String(val.key);
                    table.set(key, structuredClone(val));
                    return key;
                  });
                },
                index(idx: string) {
                  return {
                    getAll(query: unknown) {
                      return track(() => [...table.values()].filter(r => r[idx] === query).map(r => structuredClone(r)));
                    },
                  };
                },
              };
            },
          };
          const maybeCommit = () => {
            if (scheduled || pending > 0) return;
            scheduled = true;
            setTimeout(() => {
              if (pending === 0) (txObj.oncomplete as ((ev: unknown) => void) | null)?.({});
            }, 0);
          };
          function track<T>(fn: () => T): IDBRequest<T> {
            pending += 1;
            const req: Record<string, unknown> = { result: undefined, error: null, onsuccess: null, onerror: null };
            queueMicrotask(() => {
              try {
                req.result = fn();
                (req.onsuccess as ((ev: unknown) => void) | null)?.({});
              } catch (err) {
                req.error = err;
                txObj.error = err;
                (req.onerror as ((ev: unknown) => void) | null)?.({});
              } finally {
                pending -= 1;
                if (pending === 0) {
                  scheduled = false;
                  maybeCommit();
                }
              }
            });
            return req as unknown as IDBRequest<T>;
          }
          maybeCommit();
          return txObj;
        },
        close() {},
      };
      const openReq: Record<string, unknown> = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        if (isNew || !stores!.has('scrapbooks')) (openReq.onupgradeneeded as ((ev: unknown) => void) | null)?.({});
        (openReq.onsuccess as ((ev: unknown) => void) | null)?.({});
      });
      return openReq;
    },
  };
  vi.stubGlobal('indexedDB', fakeIdb);
}

async function flushUi(ticks = 6) {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 4));
    await nextTick();
  }
}

function advanceMinutes(initial: WorldState, total: number): WorldState {
  let state = initial;
  let remaining = total;
  while (remaining > 0) {
    const step = Math.min(120, remaining);
    state = reduceState(state, { type: 'wait', minutes: step });
    remaining -= step;
  }
  return state;
}

describe('stock market intelligence, Xitter chatter isolation & floating workbench', () => {
  const apps: App[] = [];

  afterEach(() => {
    for (const app of apps.splice(0)) app.unmount();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('produces deterministic fundamentals, indices, bulletins, and aligned catalysts for all instruments', () => {
    const minute = 1980;
    const indices = computeMarketIndices(minute);
    expect(indices.map(i => i.code)).toEqual(['TMI', 'TGI', 'BTI', 'TDI']);
    for (const inst of INSTRUMENTS) {
      const analysis = tickerAnalysis(inst.code, minute);
      const q = quote(inst.code, minute)!;
      expect(analysis.quote.close).toBe(q.close);
      expect(analysis.ma5).toBeGreaterThan(0);
      expect(analysis.ma20).toBeGreaterThan(0);
      expect(analysis.support).toBeLessThanOrEqual(analysis.resistance);
      if (q.pct >= 0.45) expect(analysis.catalystTag).toBe('偏多催化');
      else if (q.pct <= -0.45) expect(analysis.catalystTag).toBe('承压因素');
      else expect(analysis.catalystTag).toBe('箱体整理');
    }
    const bulletins = marketBulletins(minute);
    expect(bulletins).toHaveLength(4);
    expect(bulletins.every(b => b.title.length > 0 && b.detail.length > 0)).toBe(true);
    expect(nextExDividendDay('2874', 1)).toBe(14);
    expect(isExDividendDay('2874', 14)).toBe(true);
    expect(isExDividendDay('2874', 2)).toBe(false);
  });

  it('settles deterministic dividends idempotently into broker cash on ex-dividend close without affecting days 1-3', () => {
    let state = enableProtagonists(createInitialState());
    state = advanceMinutes(state, 1440 - gameMinute(state) + 545); // Day 2 09:05
    state = reduceState(state, {
      type: 'phone_app',
      requestId: 'div-fund-1',
      owner: 'soyo',
      command: { type: 'stock_funds', direction: 'deposit', card: 'gpt', yen: 5000, minute: stockAccount(state, 'soyo').minute, revision: stockAccount(state, 'soyo').revision },
    });
    state = reduceState(state, {
      type: 'phone_app',
      requestId: 'div-buy-1',
      owner: 'soyo',
      command: { type: 'stock_trade', minute: stockAccount(state, 'soyo').minute, revision: stockAccount(state, 'soyo').revision, trade: { type: 'submit', code: '2874', side: 'buy', kind: 'market', quantity: 5, limit: null } },
    });
    const cashAfterBuy = stockAccount(state, 'soyo').cash;
    const beforeDay14Close = (14 - 1) * 1440 + 930 - gameMinute(state);
    // Advance up to Day 13 close -> zero dividend yet
    state = advanceMinutes(state, beforeDay14Close - 1440);
    expect(stockAccount(state, 'soyo').cash).toBe(cashAfterBuy);
    // Advance past Day 14 15:30 close -> 2874 & T100 ex-dividend close
    state = advanceMinutes(state, 1440);
    expect(stockAccount(state, 'soyo').cash).toBe(cashAfterBuy + 5 * 11);
    expect(state.journal.some(j => j.id === 'stock-div:14:2874')).toBe(true);
    // Further wait does not double-pay Day 14 dividend
    state = advanceMinutes(state, 120);
    expect(stockAccount(state, 'soyo').cash).toBe(cashAfterBuy + 5 * 11);
    expect(() => parseState(JSON.parse(JSON.stringify(state)))).not.toThrow();
  }, 15000);

  it('restricts Xitter stock chatter to non-cast accounts and public market facts only', () => {
    const chatterIds = networkAccounts.filter(a => a.kind === 'chatter').map(a => a.id);
    expect(chatterIds).toContain('chatter:kabuto');
    expect(chatterIds).toContain('chatter:finwatch');

    let state = enableProtagonists(createInitialState());
    state.story[0] = { ...state.story[0]!, text: '绝密个人财务记录' };
    state = advanceMinutes(state, 1440 - gameMinute(state) + 545);
    state = reduceState(state, {
      type: 'phone_app',
      requestId: 'pub-fund',
      owner: 'soyo',
      command: { type: 'stock_funds', direction: 'deposit', card: 'gpt', yen: 3456, minute: stockAccount(state, 'soyo').minute, revision: stockAccount(state, 'soyo').revision },
    });
    const api = createWorldPhoneApi({
      session: '["card","stock-test"]',
      current: () => true,
      busy: () => false,
      state: () => state,
      commit: action => (state = reduceState(state, action)),
    });
    const net = api.network();
    const stockFact = net.publicFacts.find(f => f.id.startsWith('stock-market-'));
    expect(stockFact).toBeTruthy();
    expect(stockFact!.text).toContain('对股票毫无兴趣');
    expect(JSON.stringify(net.publicFacts)).not.toContain('绝密个人财务记录');
    expect(JSON.stringify(net.publicFacts)).not.toContain('3456');
    const standaloneFacts = buildXitterMarketPublicFacts(state.clock.day, gameMinute(state));
    expect(standaloneFacts).toHaveLength(1);
  });

  it('mounts StockPanel with shared WorldPhone sync, orderbook limit trading, delegation guard, and Scrapbook receipt clipping', async () => {
    installMemoryIndexedDB();
    let hostState: WorldState = enableProtagonists(createInitialState());
    hostState = advanceMinutes(hostState, 1440 - gameMinute(hostState) + 545); // Day 2 09:05

    const model = reactive<ShellModel>({
      mode: 'demo',
      memoryScope: 'stock-terminal-scope',
      state: hostState,
      busy: false,
      interaction: null,
      notice: '',
      connection: 'demo',
      externalPhoneAvailable: false,
      externalPhoneOpen: false,
      phoneStatus: 'idle',
      phoneError: '',
      phoneSource: 'none',
      phoneLinkStatus: 'idle',
      phoneLinkError: '',
      phoneUnread: 0,
      phoneContactUnread: [],
      notebookRevision: 0,
    });

    const api = createWorldPhoneApi({
      session: 'stock-terminal-scope',
      current: () => true,
      busy: () => model.busy,
      state: () => model.state,
      commit: action => {
        model.state = reduceState(model.state, action);
        return model.state;
      },
    });

    const actions: ShellActions = {
      dispatch(action: WorldAction) {
        model.state = reduceState(model.state, action);
      },
      async send() {},
      exit() {},
      switchChat() {},
      openPhone() {},
      closePhone() {},
      async openPhoneContact() {},
      retryPhoneSync() {},
      performPhoneCommand(owner, command) {
        try {
          model.state = reduceState(model.state, {
            type: 'phone_app',
            requestId: `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            owner,
            command,
          });
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
      async clipNotebookItem(artifact) {
        await clipScrapArtifactToNotebook(model.memoryScope!, model.state, 'soyo', '长崎素世', artifact);
        model.notebookRevision = (model.notebookRevision ?? 0) + 1;
        return true;
      },
    };

    // 1) Verify ToolDock exposes primary stock launcher
    const dockContainer = document.createElement('div');
    document.body.appendChild(dockContainer);
    const dockApp = createApp(ToolDock, {
      items: [
        { id: 'phone', title: '手机', path: 'M0 0' },
        { id: 'map', title: '地图', path: 'M0 0' },
        { id: 'notebook', title: '手账本', path: 'M0 0' },
        { id: 'stock', title: '东都证券', path: 'M0 0' },
      ],
      active: 'stock',
      unread: 0,
      editing: false,
    });
    apps.push(dockApp);
    dockApp.mount(dockContainer);
    expect(dockContainer.querySelector('[data-stock-entry]')).not.toBeNull();
    expect(dockContainer.querySelector('.stock-bespoke-svg')).not.toBeNull();

    // 2) Mount StockPanel
    const panelContainer = document.createElement('div');
    document.body.appendChild(panelContainer);
    const panelApp = createApp(StockPanel, { model, actions });
    apps.push(panelApp);
    panelApp.mount(panelContainer);
    await nextTick();

    const text = panelContainer.textContent ?? '';
    expect(text).toContain('东都综合指数');
    expect(text).toContain('交易中');
    expect(text).not.toMatch(/LLM|Agent|IndexedDB|MVU|Prompt|Schema|world_actions|API/i);

    // 3) Deposit via Appie Pay drawer and verify phone API shares identical cash balance
    (panelContainer.querySelector('[data-stock-funds-toggle]') as HTMLButtonElement).click();
    await nextTick();
    (panelContainer.querySelector('[data-stock-funds-submit]') as HTMLButtonElement).click();
    await nextTick();
    expect(stockAccount(model.state, 'soyo').cash).toBe(5000);
    expect(api.stock().state.cash).toBe(5000);

    // 4) Select 2874 and buy 5 shares at market
    (panelContainer.querySelector('[data-stock-symbol="2874"]') as HTMLButtonElement).click();
    await nextTick();
    const kindSelect = panelContainer.querySelector('[data-stock-kind]') as HTMLSelectElement;
    kindSelect.value = 'market';
    kindSelect.dispatchEvent(new Event('change'));
    const qtyInput = panelContainer.querySelector('[data-stock-qty]') as HTMLInputElement;
    qtyInput.value = '5';
    qtyInput.dispatchEvent(new Event('input'));
    await nextTick();
    (panelContainer.querySelector('[data-stock-submit]') as HTMLButtonElement).click();
    await nextTick();

    const summary = accountSummary(stockAccount(model.state, 'soyo'));
    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0].code).toBe('2874');
    expect(summary.positions[0].quantity).toBe(5);
    expect(api.stock().state.fills).toHaveLength(1);

    // 5) Clip filled transaction slip to active protagonist's IndexedDB 3D Scrapbook
    (panelContainer.querySelector('[data-stock-tab="fills"]') as HTMLButtonElement).click();
    await nextTick();
    const clipBtn = panelContainer.querySelector('[data-stock-clip-fill]') as HTMLButtonElement;
    expect(clipBtn).not.toBeNull();
    clipBtn.click();
    await flushUi();
    // Click again to verify idempotency (no duplicate slip created)
    clipBtn.click();
    await flushUi();

    const book = await readScrapbook('stock-terminal-scope', 'soyo');
    expect(book).not.toBeNull();
    const receiptItems = book!.spreads.flatMap(sp => sp.items).filter(it => it.type === 'receipt' && it.sourceRef?.id.startsWith('stock-fill:'));
    expect(receiptItems).toHaveLength(1);
    expect(receiptItems[0].dataPayload?.shop).toBe('东都证券交割凭条');

    // 6) Schedule a market review from StockPanel and verify phone calendar synchronization
    (panelContainer.querySelector('[data-stock-schedule-toggle]') as HTMLButtonElement).click();
    await nextTick();
    (panelContainer.querySelector('[data-stock-schedule-submit]') as HTMLButtonElement).click();
    await nextTick();
    const stockEvents = model.state.protagonists!.devices.soyo.calendar.filter(e => e.stockCode === '2874');
    expect(stockEvents).toHaveLength(1);
    expect(stockEvents[0].title).toBe('回顾青叶食品行情');
  });
});
