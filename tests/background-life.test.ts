import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/frontend/types';
import { commitStoryTurn, createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { appiePayBalance, type ProtagonistId } from '../src/runtime/dual-protagonists';
import { activeProtagonist, enableProtagonists, gameMinute, otherProtagonist, personState } from '../src/runtime/protagonist-world';
import { backgroundLifeSummary } from '../src/runtime/background-life';
import { getStoreItem } from '../src/runtime/convenience-store';

function world(active: ProtagonistId = 'soyo'): WorldState {
  let state = enableProtagonists(createInitialState());
  if (active !== 'soyo') state = reduceState(state, { type: 'switch_protagonist', target: active });
  return state;
}

function reload(state: WorldState): WorldState {
  return parseState(JSON.parse(JSON.stringify(state)));
}

function setMoney(state: WorldState, owner: ProtagonistId, amount: number) {
  state.protagonists!.accounts.people[owner].cards = { gpt: amount, claude: 0, gemini: 0 };
  personState(state, owner).player.balance = amount / 100;
}

describe('both protagonists continue their own daily lives', () => {
  it.each(['soyo', 'sakiko'] as const)('%s can remain the player while the other protagonist progresses and resumes', active => {
    const initial = world(active);
    const other = otherProtagonist(active);
    const original = structuredClone(initial);
    const after = reduceState(initial, { type: 'wait', minutes: 90 });
    const events = backgroundLifeSummary(after, other);
    expect(activeProtagonist(after)).toBe(active);
    expect(gameMinute(after) - gameMinute(initial)).toBe(90);
    expect(events.length).toBeGreaterThan(0);
    expect(backgroundLifeSummary(after, active)).toEqual([]);
    expect(initial).toEqual(original);
    const switched = reduceState(reload(after), { type: 'switch_protagonist', target: other });
    expect(backgroundLifeSummary(switched)).toEqual(expect.arrayContaining(events));
    expect(backgroundLifeSummary(switched).filter(event => event.id.endsWith(':handoff')).length).toBeLessThanOrEqual(1);
    expect(switched.journal.some(entry => events.some(event => event.id === entry.id))).toBe(true);
    expect(switched.story).toEqual(personState(after, other).story);
  });

  it('reloading, switching and real-time sky ticks do not replay money, messages or completed events', () => {
    let state = reduceState(world(), { type: 'wait', minutes: 90 });
    // The first switch returns a pending plan to its owner once; subsequent
    // toggles must not replay that handoff or any completed economic action.
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    const saved = structuredClone(state);
    const events = backgroundLifeSummary(state, 'sakiko');
    for (let index = 0; index < 3; index++) {
      state = reload(state);
      state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
      state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    }
    state = reduceState(state, { type: 'air_traffic_tick', now: 1_792_540_800_000 });
    expect(state.clock).toEqual(saved.clock);
    expect(backgroundLifeSummary(state, 'sakiko')).toEqual(events);
    expect(state.protagonists!.accounts).toEqual(saved.protagonists!.accounts);
    expect(state.protagonists!.orders).toEqual(saved.protagonists!.orders);
    expect(state.phone).toEqual(saved.phone);
    expect(personState(state, 'sakiko').phone).toEqual(personState(saved, 'sakiko').phone);
  });

  it('settles the same private life when an hour is advanced in one action or six actions', () => {
    const initial = world();
    const once = reduceState(initial, { type: 'wait', minutes: 60 });
    let split = initial;
    for (let index = 0; index < 6; index++) split = reduceState(split, { type: 'wait', minutes: 10 });
    expect(personState(split, 'sakiko')).toEqual(personState(once, 'sakiko'));
    expect(split.protagonists!.orders).toEqual(once.protagonists!.orders);
    expect(split.protagonists!.accounts.ledger).toEqual(once.protagonists!.accounts.ledger);
    expect(backgroundLifeSummary(split, 'sakiko')).toEqual(backgroundLifeSummary(once, 'sakiko'));
  });

  it.each(['soyo', 'sakiko'] as const)('keeps %s delivery and calendar reminder timestamps identical across time subdivisions', owner => {
    let initial = world(owner);
    initial = reduceState(initial, { type: 'phone_app', owner, requestId: 'foreground-delivery', command: {
      type: 'order', kind: 'delivery', itemId: 'meal-basic', quantity: 1, card: 'gpt', address: initial.locationId,
    } });
    const start = gameMinute(initial) + 15;
    initial = reduceState(initial, { type: 'phone_app', owner, requestId: 'foreground-reminder', command: {
      type: 'calendar_save', id: 'receipt-reminder', title: '核对自己的收货记录', locationId: initial.locationId, start, duration: 15,
    } });
    const once = reduceState(initial, { type: 'wait', minutes: 90 });
    let split = initial;
    for (let index = 0; index < 9; index++) split = reduceState(split, { type: 'wait', minutes: 10 });
    expect(split.protagonists!.orders).toEqual(once.protagonists!.orders);
    expect(split.protagonists!.devices).toEqual(once.protagonists!.devices);
    expect(split.protagonists!.accounts).toEqual(once.protagonists!.accounts);
    const order = once.protagonists!.orders.find(row => row.owner === owner)!;
    const notifications = once.protagonists!.devices[owner].notifications;
    const arrival = notifications.filter(row => row.id === `order:${order.id}:arrived`);
    expect(arrival).toHaveLength(1);
    expect(arrival[0].at).toBe(order.due);
    expect(notifications.find(row => row.id === `calendar:receipt-reminder:${start}`)!.at).toBe(start);
  });

  it('advances background nutrition once across partial activity intervals', () => {
    const initial = world();
    const before = personState(initial, 'sakiko').player;
    const after = personState(reduceState(initial, { type: 'wait', minutes: 20 }), 'sakiko').player;
    expect(after.foodEnergy).toBe(before.foodEnergy - 40);
    // 17:20 -> 17:40 crosses one absolute quarter-hour boundary.
    expect(after.satiety).toBe(before.satiety - 1);
  });

  it('uses the shared absolute clock across midnight and keeps events ordered after reload', () => {
    const initial = world();
    initial.clock = { day: 4, hour: 23, minute: 40 };
    delete initial.protagonists!.backgroundLife;
    const after = reduceState(reload(initial), { type: 'wait', minutes: 60 });
    expect(after.clock).toEqual({ day: 5, hour: 0, minute: 40 });
    const events = backgroundLifeSummary(after, 'sakiko');
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(event => event.at > gameMinute(initial) && event.at <= gameMinute(after))).toBe(true);
    expect(events.map(event => event.at)).toEqual(events.map(event => event.at).sort((a, b) => a - b));
    expect(backgroundLifeSummary(reload(after), 'sakiko')).toEqual(events);
  });

  it('initializes an existing 1.12 save at its current time without replaying old days', () => {
    const old = world();
    old.clock = { day: 90, hour: 17, minute: 20 };
    delete old.protagonists!.backgroundLife;
    const oldPeople = { active: structuredClone(old.player), inactive: structuredClone(old.protagonists!.inactive) };
    const oldAccounts = structuredClone(old.protagonists!.accounts);
    const migrated = reload(old);
    expect(migrated.player).toEqual(oldPeople.active);
    expect(migrated.protagonists!.inactive).toEqual(oldPeople.inactive);
    expect(migrated.protagonists!.accounts).toEqual(oldAccounts);
    expect(backgroundLifeSummary(migrated, 'soyo')).toEqual([]);
    expect(backgroundLifeSummary(migrated, 'sakiko')).toEqual([]);
    const progressed = reduceState(migrated, { type: 'wait', minutes: 60 });
    expect(backgroundLifeSummary(progressed, 'sakiko').every(event => event.at >= gameMinute(old))).toBe(true);
  });

  it.each(['soyo', 'sakiko'] as const)('a hungry background %s orders, pays, receives and eats from her own resources', owner => {
    const initial = world(otherProtagonist(owner));
    const other = activeProtagonist(initial);
    personState(initial, owner).schedule = [];
    personState(initial, owner).player.satiety = 30;
    setMoney(initial, owner, 50000);
    const activeMoney = appiePayBalance(initial.protagonists!.accounts, other);
    const activeInventory = structuredClone(initial.inventory);
    const address = personState(initial, owner).locationId;
    const after = reduceState(initial, { type: 'wait', minutes: 120 });
    const orders = after.protagonists!.orders.filter(order => order.owner === owner);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ actor: owner, owner, kind: 'delivery', address, status: 'received' });
    const item = getStoreItem(orders[0].itemId)!;
    expect(orders[0].totalCents).toBe((item.price + 60) * 100);
    expect(appiePayBalance(after.protagonists!.accounts, owner)).toBe(50000 - orders[0].totalCents);
    expect(appiePayBalance(after.protagonists!.accounts, other)).toBe(activeMoney);
    expect(after.inventory).toEqual(activeInventory);
    expect(personState(after, owner).player.satiety).toBeGreaterThan(30);
    expect(after.protagonists!.accounts.ledger.every(entry => entry.actor === owner)).toBe(true);
    expect(after.protagonists!.orders).toEqual(reload(after).protagonists!.orders);
  });

  it('eats existing personal food before buying and never consumes the active inventory', () => {
    const initial = world();
    personState(initial, 'sakiko').player.satiety = 20;
    personState(initial, 'sakiko').inventory = [{ itemId: 'meal-standard', quantity: 1 }];
    initial.inventory = [{ itemId: 'meal-premium', quantity: 2 }];
    const after = reduceState(initial, { type: 'wait', minutes: 60 });
    expect(personState(after, 'sakiko').inventory).toEqual([]);
    expect(after.inventory).toEqual(initial.inventory);
    expect(after.protagonists!.orders).toEqual([]);
    expect(after.protagonists!.accounts.ledger).toEqual([]);
    expect(personState(after, 'sakiko').player.satiety).toBeGreaterThan(20);
  });

  it('feeds a very hungry Soyo before starting her default scheduled journey', () => {
    const initial = world('sakiko');
    const soyo = personState(initial, 'soyo');
    expect(soyo.schedule.length).toBeGreaterThan(0);
    soyo.player.satiety = 20;
    const beforeMoney = appiePayBalance(initial.protagonists!.accounts, 'soyo');
    const after = reduceState(initial, { type: 'wait', minutes: 10 });
    expect(after.protagonists!.orders).toHaveLength(1);
    const order = after.protagonists!.orders[0];
    expect(order).toMatchObject({ actor: 'soyo', owner: 'soyo', address: soyo.locationId, status: 'paid' });
    expect(personState(after, 'soyo').locationId).toBe(soyo.locationId);
    expect(appiePayBalance(after.protagonists!.accounts, 'soyo')).toBe(beforeMoney - order.totalCents);
    expect(appiePayBalance(after.protagonists!.accounts, 'sakiko')).toBe(appiePayBalance(initial.protagonists!.accounts, 'sakiko'));
  });

  it('does not borrow the active protagonist’s balance when the background wallet is empty', () => {
    const initial = world();
    personState(initial, 'sakiko').player.satiety = 20;
    setMoney(initial, 'sakiko', 0);
    const after = reduceState(initial, { type: 'wait', minutes: 120 });
    expect(after.protagonists!.orders).toEqual([]);
    expect(after.protagonists!.accounts.ledger).toEqual([]);
    expect(appiePayBalance(after.protagonists!.accounts, 'soyo')).toBe(appiePayBalance(initial.protagonists!.accounts, 'soyo'));
    expect(appiePayBalance(after.protagonists!.accounts, 'sakiko')).toBe(0);
    expect(after.protagonists!.inactive.player.balance).toBe(0);
  });

  it('preserves an authored important calendar event as a pending choice', () => {
    let initial = world('sakiko');
    initial = reduceState(initial, { type: 'phone_app', owner: 'sakiko', requestId: 'important-event', command: {
      type: 'calendar_save', id: 'family-choice', title: '决定是否与家族和解', locationId: 'toyokawa-house',
      start: gameMinute(initial) + 15, duration: 30,
    } });
    initial = reduceState(initial, { type: 'switch_protagonist', target: 'soyo' });
    const story = structuredClone(personState(initial, 'sakiko').story);
    const after = reduceState(initial, { type: 'wait', minutes: 90 });
    expect(after.protagonists!.devices.sakiko.calendar.find(event => event.id === 'family-choice')!.title).toBe('决定是否与家族和解');
    expect(personState(after, 'sakiko').story).toEqual(story);
    expect(backgroundLifeSummary(after, 'sakiko').some(event => /待|尚未|自行决定/.test(event.text))).toBe(true);
    expect(after.journal.some(entry => entry.text.includes('家族和解'))).toBe(false);
  });

  it('persists a cross-district trip before arrival and charges only its owner after the real travel time', () => {
    let initial = world('sakiko');
    const quote = getNovelTravelQuote(initial, 'library');
    expect(quote.blockedReason).toBeNull();
    expect(quote.minutes).toBeGreaterThan(30);
    expect(quote.fare).toBeGreaterThan(0);
    initial = reduceState(initial, { type: 'phone_app', owner: 'sakiko', requestId: 'library-trip', command: {
      type: 'calendar_save', id: 'private-library-plan', title: '归还自己的书', locationId: 'library',
      start: gameMinute(initial) + quote.minutes + 10, duration: 30,
    } });
    initial = reduceState(initial, { type: 'switch_protagonist', target: 'soyo' });
    const address = personState(initial, 'sakiko').locationId;
    const money = appiePayBalance(initial.protagonists!.accounts, 'sakiko');
    const active = structuredClone({ locationId: initial.locationId, scene: initial.scene, inventory: initial.inventory });
    const inTransit = reduceState(initial, { type: 'wait', minutes: 30 });
    expect(inTransit.protagonists!.backgroundLife!.people.sakiko.pending).toMatchObject({ kind: 'travel', target: 'library' });
    expect(personState(inTransit, 'sakiko').locationId).toBe(address);
    expect(appiePayBalance(inTransit.protagonists!.accounts, 'sakiko')).toBe(money);
    expect(inTransit.protagonists!.accounts.ledger).toEqual([]);
    const restored = reload(inTransit);
    expect(restored.protagonists!.backgroundLife).toEqual(inTransit.protagonists!.backgroundLife);
    const due = restored.protagonists!.backgroundLife!.people.sakiko.pending!.due;
    const justBeforeArrival = reduceState(restored, { type: 'wait', minutes: due - gameMinute(restored) - 1 });
    expect(personState(justBeforeArrival, 'sakiko').locationId).toBe(address);
    expect(appiePayBalance(justBeforeArrival.protagonists!.accounts, 'sakiko')).toBe(money);
    const after = reduceState(reload(justBeforeArrival), { type: 'wait', minutes: 1 });
    expect(personState(after, 'sakiko').locationId).toBe('library');
    expect(appiePayBalance(after.protagonists!.accounts, 'sakiko')).toBe(money - quote.fare * 100);
    expect(after.protagonists!.accounts.ledger).toHaveLength(1);
    expect(after.protagonists!.accounts.ledger[0]).toMatchObject({ actor: 'sakiko', deltaCents: -quote.fare * 100 });
    expect({ locationId: after.locationId, scene: after.scene, inventory: after.inventory }).toEqual(active);
    expect(backgroundLifeSummary(after, 'sakiko').filter(event => event.kind === 'travel')).toHaveLength(1);
    expect(reload(after).protagonists!.accounts).toEqual(after.protagonists!.accounts);
  });

  it('hands the scene back to the foreground when the background protagonist arrives beside her', () => {
    let initial = reduceState(world(), { type: 'walk', x: 0, z: 29, yaw: 0, seed: 'narrative-test' });
    initial = reduceState(initial, { type: 'switch_protagonist', target: 'sakiko' });
    const quote = getNovelTravelQuote(initial, 'gate');
    initial = reduceState(initial, { type: 'phone_app', owner: 'sakiko', requestId: 'gate-trip', command: {
      type: 'calendar_save', id: 'gate-plan', title: '到南门整理资料', locationId: 'gate',
      start: gameMinute(initial) + quote.minutes + 10, duration: 30,
    } });
    initial = reduceState(initial, { type: 'switch_protagonist', target: 'soyo' });
    const after = reduceState(initial, { type: 'wait', minutes: 120 });
    const life = after.protagonists!.backgroundLife!.people.sakiko;
    const arrival = life.events.find(event => event.kind === 'travel');
    expect(arrival).toBeDefined();
    expect(personState(after, 'sakiko').locationId).toBe(after.locationId);
    expect(life.pending).toBeNull();
    expect(life.events.every(event => event.at <= arrival!.at)).toBe(true);
    expect(after.protagonists!.backgroundLife!.cursor).toBe(gameMinute(after));
  });

  it('rests a tired background protagonist without altering the foreground inventory or position', () => {
    const initial = world('sakiko');
    personState(initial, 'soyo').schedule = [];
    personState(initial, 'soyo').player.energy = 10;
    const after = reduceState(initial, { type: 'wait', minutes: 50 });
    expect(personState(after, 'soyo').player.energy).toBeGreaterThan(10);
    expect(backgroundLifeSummary(after, 'soyo').some(event => event.kind === 'rest')).toBe(true);
    expect(after.locationId).toBe(initial.locationId);
    expect(after.inventory).toEqual(initial.inventory);
  });

  it('does not overflow a full recipient inbox with an automatic evening greeting', () => {
    const initial = world();
    initial.phone = Array.from({ length: 200 }, (_, index) => ({
      id: `existing-message-${index}`, npcId: initial.contacts[0].id, text: `已有消息 ${index}`, read: true, at: '第 1 天 17:20',
    }));
    const after = reduceState(reload(initial), { type: 'wait', minutes: 120 });
    expect(after.phone).toEqual(initial.phone);
    expect(backgroundLifeSummary(after, 'sakiko').some(event => event.kind === 'message')).toBe(false);
    expect(reload(after).phone).toHaveLength(200);
  });

  it('rejects a stored background cursor that disagrees with the authoritative world clock', () => {
    const invalid = world();
    invalid.protagonists!.backgroundLife!.cursor -= 1;
    expect(() => reload(invalid)).toThrow(/后台/);
  });

  it('does not replay background consequences when the same story turn is committed twice', () => {
    const initial = world();
    const reply = { text: '你静静等了一个小时。', phoneMessages: [], worldActions: [{ type: 'rest' as const, kind: 'wait' as const, minutes: 60 }] };
    const ids = { userId: 'same-user-turn', assistantId: 'same-assistant-turn' };
    const after = commitStoryTurn(initial, '等一小时', reply, ids, 0);
    const twice = commitStoryTurn(after, '等一小时', reply, ids, 0);
    expect(twice).toEqual(after);
  });
});
