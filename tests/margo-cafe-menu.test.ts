import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getStoreItem, INVENTORY_ITEM_LIMIT } from '../src/runtime/convenience-store';
import { validateStoryActions } from '../src/runtime/story-actions';
import { getStoreProductImage } from '../src/frontend/store-product-images';
import { getMargoCafeOffer } from '../src/runtime/margo-cafe';
import {
  CAFE_DAILY_SPECIAL_ID, CAFE_DAILY_SPECIAL_PRICE, CAFE_EMMA_DRINK_ID, EMMA_CAFE_SERVING_TEXT,
  cafeInventoryItems, dailySpecialDrink, getCafeMenu,
} from '../src/runtime/margo-cafe-menu';
import type { WorldState } from '../src/frontend/types';

function atCafe(seed = 'save-alpha', day = 1, hour = 14): WorldState {
  const base = createInitialState();
  return parseState({
    ...base,
    locationId: 'street-cafe',
    clock: { day, hour, minute: 0 },
    scene: { x: 48, z: 56, yaw: 0, areaId: 'street-cafe', seed, encounterId: null },
  });
}

describe('margo cafe menu', () => {
  it('buys a listed drink into inventory and keeps the convenience store rules', () => {
    const open = atCafe();
    const latte = getStoreItem('cafe-latte')!;
    expect(latte.price).toBe(440);
    expect(getStoreProductImage('cafe-latte')).toMatch(/^data:image\/svg\+xml,/);
    const bought = reduceState(open, { type: 'buy_item', itemId: 'cafe-latte', quantity: 1 });
    expect(bought.player.balance).toBe(open.player.balance - 440);
    expect(bought.inventory).toContainEqual({ itemId: 'cafe-latte', quantity: 1 });

    expect(() => reduceState({ ...open, clock: { ...open.clock, hour: 3 } }, { type: 'buy_item', itemId: 'cafe-latte', quantity: 1 })).toThrow(/还没开门/);
    const store = { ...open, locationId: 'convenience', scene: { x: 21, z: 56, yaw: 0, areaId: 'convenience', seed: 'save-alpha', encounterId: null } };
    expect(() => reduceState(store, { type: 'buy_item', itemId: 'cafe-latte', quantity: 1 })).toThrow(/玛格咖啡馆/);
    expect(() => reduceState(open, { type: 'buy_item', itemId: 'meal-basic', quantity: 1 })).toThrow(/便利店/);
    expect(() => reduceState({ ...open, player: { ...open.player, balance: 10 } }, { type: 'buy_item', itemId: 'cafe-latte', quantity: 1 })).toThrow(/余额不足/);
    const full = { ...open, inventory: [{ itemId: 'cafe-latte', quantity: INVENTORY_ITEM_LIMIT }] };
    expect(() => reduceState(full, { type: 'buy_item', itemId: 'cafe-latte', quantity: 1 })).toThrow(/最多保存/);

    const indoors = parseState({
      ...open,
      locationId: 'margo-cafe-room',
      interior: { roomId: 'margo-cafe-room', x: 0, z: 3.8, yaw: 0, activityId: null, lastRest: null, lastStudy: null },
    });
    expect(reduceState(indoors, { type: 'buy_item', itemId: 'cafe-espresso', quantity: 2 }).inventory).toContainEqual({ itemId: 'cafe-espresso', quantity: 2 });
    expect(getMargoCafeOffer(bought, { type: 'wait', minutes: 1 })).toBeNull();
  });

  it('keeps the daily special stable for a day, changes later, and sells one cup per protagonist', () => {
    const first = atCafe('save-alpha', 1);
    const drink = dailySpecialDrink(first);
    expect(dailySpecialDrink(atCafe('save-alpha', 1)).item.id).toBe(drink.item.id);
    expect(drink.item.price).toBe(CAFE_DAILY_SPECIAL_PRICE);
    let later = drink.item.id;
    for (let day = 2; day < 40 && later === drink.item.id; day++) later = dailySpecialDrink(atCafe('save-alpha', day)).item.id;
    expect(later).not.toBe(drink.item.id);
    let otherSeed = drink.item.id;
    for (const seed of ['save-beta', 'dual-world-v1', 'novel-world-v1', 'cafe-seed-9']) {
      otherSeed = dailySpecialDrink(atCafe(seed, 1)).item.id;
      if (otherSeed !== drink.item.id) break;
    }
    expect(otherSeed).not.toBe(drink.item.id);

    const bought = reduceState(first, { type: 'buy_item', itemId: CAFE_DAILY_SPECIAL_ID, quantity: 1 });
    expect(bought.player.balance).toBe(first.player.balance - CAFE_DAILY_SPECIAL_PRICE);
    expect(bought.inventory).toContainEqual({ itemId: drink.item.id, quantity: 1 });
    expect(getCafeMenu(bought).find(row => row.kind === 'daily')).toMatchObject({ soldOut: true, itemId: drink.item.id });
    expect(() => reduceState(bought, { type: 'buy_item', itemId: CAFE_DAILY_SPECIAL_ID, quantity: 1 })).toThrow(/卖完/);
    expect(() => reduceState(first, { type: 'buy_item', itemId: CAFE_DAILY_SPECIAL_ID, quantity: 2 })).toThrow(/一杯/);

    const reloaded = parseState(JSON.parse(JSON.stringify(bought)));
    expect(getCafeMenu(reloaded).find(row => row.kind === 'daily')?.soldOut).toBe(true);
    const legacy = parseState({ ...first, margoCafeDaily: { version: 1, receipts: [] } });
    expect(legacy.margoCafeDaily).toEqual({ version: 1, receipts: [] });

    const nextDay = parseState({ ...bought, clock: { ...bought.clock, day: 2 } });
    expect(getCafeMenu(nextDay).find(row => row.kind === 'daily')?.soldOut).toBe(false);
    const again = reduceState(nextDay, { type: 'buy_item', itemId: CAFE_DAILY_SPECIAL_ID, quantity: 1 });
    expect(again.margoCafeDaily?.specials).toEqual([{ owner: 'soyo', day: 2, itemId: dailySpecialDrink(nextDay).item.id }]);
  });

  it('shows Emma her signature cup and hides it from everyone else', () => {
    const soyo = atCafe();
    expect(getCafeMenu(soyo).some(row => row.purchaseId === CAFE_EMMA_DRINK_ID)).toBe(false);
    expect(() => validateStoryActions([{ type: 'buy', itemId: CAFE_EMMA_DRINK_ID, quantity: 1 }], soyo)).toThrow(/商品/);
    expect(() => reduceState(soyo, { type: 'buy_item', itemId: CAFE_EMMA_DRINK_ID, quantity: 1 })).toThrow(/不在菜单上/);

    const switched = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
    const emma = parseState({
      ...switched,
      locationId: 'margo-cafe-room',
      scene: { ...switched.scene!, x: 48, z: 55.5, areaId: 'street-cafe', seed: 'emma-save', encounterId: null },
      interior: { roomId: 'margo-cafe-room', x: 0, z: 3.8, yaw: 0, activityId: null, lastRest: null, lastStudy: null },
    });
    const menu = getCafeMenu(emma);
    expect(menu.some(row => row.purchaseId === CAFE_EMMA_DRINK_ID && row.name === '粉樱热可可')).toBe(true);
    expect(getStoreProductImage(CAFE_EMMA_DRINK_ID)).toMatch(/^data:image\/svg\+xml,/);
    expect(validateStoryActions([{ type: 'buy', itemId: CAFE_EMMA_DRINK_ID, quantity: 1 }], emma)[0]).toMatchObject({ itemId: CAFE_EMMA_DRINK_ID });
    const price = getStoreItem(CAFE_EMMA_DRINK_ID)!.price;
    const served = reduceState(emma, { type: 'buy_item', itemId: CAFE_EMMA_DRINK_ID, quantity: 1 });
    expect(served.player.balance).toBe(emma.player.balance - price);
    expect(served.inventory).toEqual([{ itemId: CAFE_EMMA_DRINK_ID, quantity: 1 }]);
    expect(served.story.some(row => row.text === EMMA_CAFE_SERVING_TEXT && row.text.includes('|宝生玛格|开心|'))).toBe(true);
    expect(getCafeMenu(served).some(row => row.kind === 'emma')).toBe(true);
    expect(cafeInventoryItems().map(item => item.id)).toEqual(expect.arrayContaining(['cafe-latte', 'cafe-special-citrus', CAFE_EMMA_DRINK_ID]));
  });
});
