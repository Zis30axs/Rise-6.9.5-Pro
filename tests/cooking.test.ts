import { createApp, nextTick, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import CookingMinigame from '../src/frontend/CookingMinigame.vue';
import type { ShellModel, WorldAction, WorldState } from '../src/frontend/types';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import {
  COOK_TRACK_END, COOK_ZONE_WIDTHS, cookingDishItems, cookingIngredientItems, cookingLlmPayload,
  cookingRecipeOptions, cookingRecipes, judgeCooking, kitchenAt, kitchenResidences, openCookingSession, placeCookingZones,
  zoneWidths, type CookingSession,
} from '../src/runtime/cooking';
import { getInventoryCatalog, getUseItemQuote, storeCatalog } from '../src/runtime/convenience-store';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState, protagonistNames } from '../src/runtime/protagonist-world';
import { TOKYO_DELIVERY_FEE } from '../src/runtime/tokyo-world';

function pantry(quantity = 2): WorldState['inventory'] {
  return cookingIngredientItems.map(item => ({ itemId: item.id, quantity }));
}

function atKitchen(state: WorldState, roomId = 'emma-yuki-home', inventory = pantry()): WorldState {
  const room = getCampusInterior(roomId)!;
  return {
    ...state, locationId: roomId, inventory,
    scene: {
      x: room.entrance.x, z: room.entrance.z, yaw: room.entrance.yaw, areaId: room.parentLocationId,
      seed: state.scene?.seed ?? 'cook-test', encounterId: null,
    },
    interior: { roomId, x: room.spawn.x, z: room.spawn.z, yaw: room.spawn.yaw, activityId: null, lastRest: null, lastStudy: null },
  };
}

function begin(state: WorldState, recipeId = 'miso-soup') {
  return reduceState(atKitchen(state), { type: 'cook_begin', recipeId });
}

function outside(session: CookingSession): number {
  return session.normalLo > 0 ? session.normalLo - 1 : session.normalHi + 1;
}

describe('cooking zones', () => {
  it('narrows both bands as difficulty rises and keeps perfect inside the track', () => {
    const widths = ([1, 2, 3, 4] as const).map(difficulty => zoneWidths(difficulty));
    expect(widths).toEqual(([1, 2, 3, 4] as const).map(difficulty => COOK_ZONE_WIDTHS[difficulty]));
    for (let index = 0; index < widths.length - 1; index++) {
      expect(widths[index]!.normal).toBeGreaterThan(widths[index + 1]!.normal);
      expect(widths[index]!.perfect).toBeGreaterThan(widths[index + 1]!.perfect);
      expect(widths[index]!.perfect).toBeLessThan(widths[index]!.normal);
    }
    const starts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      for (const difficulty of [1, 2, 3, 4] as const) {
        const zones = placeCookingZones(difficulty, `cook-seed-${seed}`);
        const width = zoneWidths(difficulty);
        expect(zones.normalHi - zones.normalLo).toBe(width.normal);
        expect(zones.perfectHi - zones.perfectLo).toBe(width.perfect);
        expect(zones.normalLo).toBeGreaterThanOrEqual(0);
        expect(zones.normalHi).toBeLessThanOrEqual(COOK_TRACK_END);
        expect(zones.perfectLo).toBeGreaterThanOrEqual(zones.normalLo);
        expect(zones.perfectHi).toBeLessThanOrEqual(zones.normalHi);
        if (difficulty === 4) starts.add(zones.normalLo);
      }
    }
    expect(starts.size).toBeGreaterThan(5);
    expect(placeCookingZones(3, 'same-seed')).toEqual(placeCookingZones(3, 'same-seed'));
  });

  it('treats the exact edges of perfect and normal as inside those bands', () => {
    const zones = { normalLo: 100, normalHi: 500, perfectLo: 200, perfectHi: 300 };
    expect(judgeCooking(zones, 200)).toMatchObject({ tier: 'perfect', side: 'left', miss: 0 });
    expect(judgeCooking(zones, 300)).toMatchObject({ tier: 'perfect', side: 'right', miss: 0 });
    expect(judgeCooking(zones, 250)).toMatchObject({ tier: 'perfect', side: 'center', miss: 0 });
    expect(judgeCooking(zones, 199)).toMatchObject({ tier: 'normal', side: 'left', miss: 1 });
    expect(judgeCooking(zones, 301)).toMatchObject({ tier: 'normal', side: 'right', miss: 1 });
    expect(judgeCooking(zones, 100)).toMatchObject({ tier: 'normal', miss: 100 });
    expect(judgeCooking(zones, 500)).toMatchObject({ tier: 'normal', miss: 200 });
    expect(judgeCooking(zones, 99)).toMatchObject({ tier: 'fail', miss: 101 });
    expect(judgeCooking(zones, 501)).toMatchObject({ tier: 'fail', miss: 201 });
    expect(judgeCooking(zones, 0).tier).toBe('fail');
    expect(judgeCooking(zones, COOK_TRACK_END).tier).toBe('fail');
  });
});

describe('cooking settlement', () => {
  it('buys packs and uses the exact recipe portions only on successful settlement', () => {
    const market = { ...createInitialState(), locationId: 'convenience' };
    const bought = reduceState(market, { type: 'buy_item', itemId: 'ingredient-egg', quantity: 1 });
    expect(bought.player.balance).toBe(market.player.balance - 144);
    expect(bought.inventory).toContainEqual({ itemId: 'ingredient-egg', quantity: 6 });
    expect(() => reduceState(bought, { type: 'use_item', itemId: 'ingredient-egg' })).toThrow(/下厨/);

    const ingredients = [{ itemId: 'ingredient-rice', quantity: 1 }, { itemId: 'ingredient-egg', quantity: 1 },
      { itemId: 'ingredient-vegetable', quantity: 1 }, { itemId: 'ingredient-soy', quantity: 1 }];
    const short = atKitchen(bought, 'emma-yuki-home', ingredients);
    const start = { type: 'cook_begin', recipeId: 'egg-fried-rice' } as const;
    const option = cookingRecipeOptions(short).find(recipe => recipe.id === start.recipeId)!;
    expect(option.ingredients).toContainEqual({ id: 'ingredient-egg', name: '鸡蛋', owned: 1, needed: 2 });
    expect(option.ingredientCost).toBe(193);
    expect(option.blockedReason).toMatch(/食材/);
    expect(() => reduceState(short, start)).toThrow(/食材/);

    const stocked = { ...short, inventory: short.inventory.map(row => row.itemId === 'ingredient-egg' ? { ...row, quantity: 3 } : row) };
    const started = reduceState(stocked, start);
    const session = openCookingSession(started)!;
    const stop = { type: 'cook_settle', sessionId: session.id, position: session.perfectHi } as const;
    expect(() => reduceState({ ...started, inventory: ingredients }, stop)).toThrow(/食材/);
    expect(ingredients[0]?.quantity).toBe(1);
    const done = reduceState(started, stop);
    expect(done.inventory.filter(row => row.itemId.startsWith('ingredient-') || row.itemId.startsWith('dish-'))).toEqual([
      { itemId: 'ingredient-egg', quantity: 1 }, { itemId: 'dish-egg-fried-rice-perfect', quantity: 1 },
    ]);
    expect(done.player.balance).toBe(started.player.balance);
    expect(cookingLlmPayload(done)?.ingredients).toContainEqual({ id: 'ingredient-egg', name: '鸡蛋', quantity: 2 });
    const saved = parseState(JSON.parse(JSON.stringify(done)));
    const eaten = reduceState(saved, { type: 'use_item', itemId: 'dish-egg-fried-rice-perfect' });
    expect(eaten.inventory).toEqual(saved.inventory.filter(row => row.itemId !== 'dish-egg-fried-rice-perfect'));
    expect(eaten.player).toEqual(getUseItemQuote(saved, 'dish-egg-fried-rice-perfect').playerAfter);
  });

  it('refuses to start without ingredients and consumes nothing', () => {
    const state = atKitchen(createInitialState(), 'emma-yuki-home', [{ itemId: 'ingredient-miso', quantity: 1 }]);
    expect(cookingRecipeOptions(state).find(recipe => recipe.id === 'miso-soup')?.blockedReason).toMatch(/食材/);
    expect(() => reduceState(state, { type: 'cook_begin', recipeId: 'miso-soup' })).toThrow(/食材/);
    expect(state.inventory).toEqual([{ itemId: 'ingredient-miso', quantity: 1 }]);
    expect(state.cooking).toBeUndefined();
    const away = { ...createInitialState(), inventory: pantry() };
    expect(() => reduceState(away, { type: 'cook_begin', recipeId: 'miso-soup' })).toThrow(/厨房/);
    expect(away.inventory.map(item => item.quantity)).toEqual(pantry().map(item => item.quantity));
  });

  it('settles one stop only once, including a repeated position', () => {
    const started = begin(createInitialState());
    const session = openCookingSession(started)!;
    const before = started.inventory.map(item => ({ ...item }));
    const once = reduceState(started, { type: 'cook_settle', sessionId: session.id, position: session.perfectLo });
    const dish = once.inventory.find(item => item.itemId === 'dish-miso-soup-perfect');
    expect(dish?.quantity).toBe(1);
    expect(once.inventory.find(item => item.itemId === 'ingredient-miso')?.quantity).toBe(1);
    expect(once.clock).toEqual({ day: 1, hour: 17, minute: 32 });
    expect(once.player.energy).toBe(78);
    const twice = reduceState(once, { type: 'cook_settle', sessionId: session.id, position: session.normalLo });
    expect(twice.inventory).toEqual(once.inventory);
    expect(twice.clock).toEqual(once.clock);
    expect(twice.player).toEqual(once.player);
    expect(before.find(item => item.itemId === 'ingredient-tofu')?.quantity).toBe(2);
    expect(started.inventory).toEqual(before);
  });

  it('keeps an unfinished session on its protagonist across a switch', () => {
    const world = atKitchen(parseState(enableProtagonists(createInitialState())));
    const started = reduceState(world, { type: 'cook_begin', recipeId: 'curry-rice' });
    const session = openCookingSession(started)!;
    expect(session.owner).toBe('soyo');
    const switched = reduceState(started, { type: 'switch_protagonist', target: 'sakiko' });
    expect(openCookingSession(switched)).toBeNull();
    expect(openCookingSession(switched, 'soyo')?.id).toBe(session.id);
    expect(() => reduceState(switched, { type: 'cook_settle', sessionId: session.id, position: session.perfectLo })).toThrow(/另一位主角/);
    expect(personState(switched, 'soyo').inventory.find(item => item.itemId === 'ingredient-rice')?.quantity).toBe(2);
    expect(switched.inventory.some(item => item.itemId.startsWith('dish-'))).toBe(false);
    expect(cookingLlmPayload(switched)).toBeNull();
    const back = reduceState(switched, { type: 'switch_protagonist', target: 'soyo' });
    const done = reduceState(back, { type: 'cook_settle', sessionId: session.id, position: session.perfectLo });
    expect(done.inventory.find(item => item.itemId === 'dish-curry-rice-perfect')?.quantity).toBe(1);
    expect(personState(done, 'sakiko').inventory.some(item => item.itemId.startsWith('dish-'))).toBe(false);
    expect(cookingLlmPayload(done)?.cookName).toBe(protagonistNames.soyo);
  });

  it('restores an unfinished session and a settled dish', () => {
    const started = begin(createInitialState(), 'egg-roll');
    const restored = parseState(JSON.parse(JSON.stringify(started)));
    expect(restored.cooking?.sessions).toEqual(started.cooking?.sessions);
    expect(restored.cooking?.sessions[0]?.status).toBe('open');
    const session = openCookingSession(restored)!;
    const done = reduceState(restored, { type: 'cook_settle', sessionId: session.id, position: session.perfectHi });
    const saved = parseState(JSON.parse(JSON.stringify(done)));
    expect(saved.inventory.find(item => item.itemId === 'dish-egg-roll-perfect')?.quantity).toBe(1);
    expect(saved.cooking?.settledIds).toContain(session.id);
    const replay = reduceState(saved, { type: 'cook_settle', sessionId: session.id, position: 0 });
    expect(replay.inventory).toEqual(saved.inventory);
    expect(replay.clock).toEqual(saved.clock);
  });

  it('produces a failed dish and logs the facts without a canned reason', () => {
    const started = begin(createInitialState(), 'hamburg');
    const session = openCookingSession(started)!;
    const position = outside(session);
    expect(judgeCooking(session, position).tier).toBe('fail');
    const done = reduceState(started, { type: 'cook_settle', sessionId: session.id, position });
    expect(done.inventory.find(item => item.itemId === 'dish-hamburg-fail')?.quantity).toBe(1);
    expect(done.inventory.find(item => item.itemId === 'ingredient-meat')?.quantity).toBe(1);
    const entry = done.journal.find(item => item.id === session.id);
    expect(entry?.text).toContain('失败料理');
    expect(entry?.text).toContain('汉堡排');
    expect(entry?.text).toContain('长崎素世');
    expect(entry?.text).not.toMatch(/火候|烧焦|忘了放盐|太咸|夹生/);
    const facts = cookingLlmPayload(done);
    expect(facts).toMatchObject({
      status: 'settled', recipeId: 'hamburg', recipeName: '汉堡排', difficulty: 4,
      tier: 'fail', tierLabel: '失败料理', position, cookId: 'soyo', cookName: '长崎素世',
      kitchenRoomId: 'emma-yuki-home', elapsedMinutes: 40, dishName: '失败的汉堡排',
    });
    expect(facts && facts.status === 'settled' ? facts.ingredients.map(item => item.name) : []).toEqual(['肉', '洋葱', '鸡蛋', '面包粉']);
    expect(facts && facts.status === 'settled' ? [facts.side, facts.miss, facts.time.day] : []).toEqual([
      judgeCooking(session, position).side, judgeCooking(session, position).miss, done.clock.day,
    ]);
    const encoded = JSON.stringify(facts);
    expect(encoded).not.toMatch(/world_actions|buy_item|use_item|cook_settle|cook_begin|扣除|写入背包|消耗食材|inventory|setQuantity/);
    expect(Object.keys(facts ?? {})).not.toContain('inventory');
  });
});

describe('cooking catalog balance', () => {
  it('keeps portions purchasable, provides a reason to cook, and preserves the time trade-off', () => {
    const options = cookingRecipeOptions(atKitchen(createInitialState()));
    const ingredients = new Map(cookingIngredientItems.map(item => [item.id, item]));
    const used = new Set(cookingRecipes.flatMap(recipe => recipe.ingredients.map(item => item.id)));
    expect(used).toEqual(new Set(ingredients.keys()));
    const bento = storeCatalog.find(item => item.id === 'meal-standard')!;
    for (const recipe of cookingRecipes) {
      const { perfect, normal, fail } = recipe.dishes;
      expect(new Set(recipe.ingredients.map(item => item.id)).size).toBe(recipe.ingredients.length);
      for (const { id, quantity } of recipe.ingredients) {
        expect(ingredients.has(id)).toBe(true);
        expect(Number.isInteger(quantity) && quantity > 0).toBe(true);
      }
      expect(fail.kcal).toBeLessThan(normal.kcal);
      expect(normal.kcal).toBeLessThan(perfect.kcal);
      expect(fail.effects.satiety).toBeLessThan(normal.effects.satiety);
      expect(normal.effects.satiety).toBeLessThan(perfect.effects.satiety);
      expect(fail.effects.stress).toBeGreaterThan(0);
      expect(normal.effects.energy - recipe.energyCost).toBeGreaterThan(0);
      if (normal.kcal >= 400) {
        expect(options.find(option => option.id === recipe.id)!.ingredientCost).toBeLessThan(bento.price);
        expect(recipe.minutes + normal.useMinutes).toBeGreaterThan(bento.useMinutes);
        expect(normal.effects.energy - recipe.energyCost).toBeLessThan(bento.effects.energy);
      }
    }
  });

  it('loads previous phone orders and delivers the package size paid for', () => {
    const state = parseState(enableProtagonists(createInitialState()));
    const placed = reduceState(state, { type: 'phone_app', owner: 'soyo', requestId: 'egg-order',
      command: { type: 'order', kind: 'delivery', itemId: 'ingredient-egg', card: 'gpt', quantity: 2, address: state.locationId } });
    expect(placed.protagonists!.orders[0]?.totalCents).toBe((144 * 2 + TOKYO_DELIVERY_FEE) * 100);
    const saved = JSON.stringify(placed);
    const previous = JSON.parse(saved) as WorldState;
    previous.protagonists!.orders[0]!.totalCents = (150 * 2 + TOKYO_DELIVERY_FEE) * 100;
    const invalid = JSON.parse(saved) as WorldState;
    invalid.protagonists!.orders[0]!.totalCents += 1;
    expect(() => parseState(invalid)).toThrow(/订单金额/);
    const receive = (input: WorldState) => reduceState(reduceState(parseState(input), { type: 'wait', minutes: 30 }), {
      type: 'phone_app', owner: 'soyo', requestId: 'egg-receive', command: { type: 'receive_order', id: 'egg-order' },
    });
    expect(receive(JSON.parse(saved)).inventory).toContainEqual({ itemId: 'ingredient-egg', quantity: 12 });
    expect(receive(previous).inventory).toContainEqual({ itemId: 'ingredient-egg', quantity: 2 });
  });
});

describe('cooking entry', () => {
  it('offers the kitchen action only in residences that have a kitchen', () => {
    const rooms = kitchenResidences().map(item => item.roomId);
    expect(rooms).toEqual(expect.arrayContaining([
      'emma-yuki-home', 'nanoka-honoka-home', 'majo-studio', 'majo-highrise-home', 'amaori-family-home', 'sena-family-home',
    ]));
    for (const roomId of ['nikaido-house', 'toyokawa-house', 'dorm-room', 'koko-old-house', 'koto-apartment']) {
      expect(rooms).not.toContain(roomId);
      expect(kitchenAt({ interior: { roomId, x: 0, z: 0, yaw: 0, activityId: null, lastRest: null, lastStudy: null } })).toBeNull();
    }
    expect(kitchenAt({ interior: null })).toBeNull();
    expect(storeCatalog.some(item => item.id === 'ingredient-miso' && item.category === 'ingredient')).toBe(true);
    expect(storeCatalog.some(item => item.id.startsWith('dish-'))).toBe(false);
    const ids = getInventoryCatalog().map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cookingDishItems().map(item => item.id)).toEqual(expect.arrayContaining(['dish-miso-soup-fail', 'dish-hamburg-perfect']));
  });

  it('shows the needle and settles a single stop from the panel', async () => {
    const started = begin(createInitialState());
    const model = reactive({
      mode: 'demo', state: started, busy: false, notice: '', connection: '', externalPhoneAvailable: false,
      externalPhoneOpen: false, phoneStatus: 'idle', phoneError: '', phoneSource: 'none', phoneLinkStatus: 'idle',
      phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [],
    }) as ShellModel;
    const actions = {
      dispatch(action: WorldAction) {
        try {
          model.state = reduceState(model.state, action);
          model.notice = '';
        } catch (error) {
          model.notice = error instanceof Error ? error.message : '失败';
        }
      },
    };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(CookingMinigame, { model, actions, onClose: () => undefined });
    app.mount(host);
    await nextTick();
    expect(host.querySelector('[data-cook-meter]')).toBeTruthy();
    expect(host.querySelector('[data-cook-needle]')).toBeTruthy();
    const stop = host.querySelector<HTMLButtonElement>('[data-cook-stop]');
    expect(stop).toBeTruthy();
    stop!.click();
    stop!.click();
    await nextTick();
    const dishes = model.state.inventory.filter(item => item.itemId.startsWith('dish-miso-soup-'));
    expect(dishes).toHaveLength(1);
    expect(dishes[0]?.quantity).toBe(1);
    expect(host.querySelector('[data-cook-result]')?.textContent).toMatch(/完美|普通|失败料理/);
    app.unmount();
    host.remove();
  });

  it('draws all three dial bands on the needle track with the needle reaching them', async () => {
    const started = begin(createInitialState());
    const model = reactive({
      mode: 'demo', state: started, busy: false, notice: '', connection: '', externalPhoneAvailable: false,
      externalPhoneOpen: false, phoneStatus: 'idle', phoneError: '', phoneSource: 'none', phoneLinkStatus: 'idle',
      phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [],
    }) as ShellModel;
    const actions = {
      dispatch(action: WorldAction) {
        try {
          model.state = reduceState(model.state, action);
          model.notice = '';
        } catch (error) {
          model.notice = error instanceof Error ? error.message : '失败';
        }
      },
    };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(CookingMinigame, { model, actions, onClose: () => undefined });
    app.mount(host);
    await nextTick();
    for (const selector of ['.cook-zone-fail', '.cook-zone-normal', '.cook-zone-perfect']) {
      const path = host.querySelector<SVGPathElement>(selector);
      expect(path).toBeTruthy();
      // Sweep flag 1 draws the arc over the top of the dial (the needle's
      // semicircle); sweep 0 draws it below the viewBox, invisible.
      expect(path!.getAttribute('d')).toContain('A 86 86 0 0 1');
    }
    const needle = host.querySelector<SVGLineElement>('[data-cook-needle]');
    expect(needle).toBeTruthy();
    const dx = 110 - Number(needle!.getAttribute('x2'));
    const dy = 118 - Number(needle!.getAttribute('y2'));
    expect(Math.hypot(dx, dy)).toBeCloseTo(86, 5);
    app.unmount();
    host.remove();
  });
});
