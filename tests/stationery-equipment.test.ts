import { describe, expect, it, vi } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { R27ET1_ITEM_ID, getPurchaseQuote, getStationeryAvailability, getUseItemQuote } from '../src/runtime/convenience-store';
import { CRYCHIC_PHOTO, equippedItem, r27et1Equipped, studyPointsWithEquipment } from '../src/runtime/equipment';

const fresh = () => {
  const state = createInitialState();
  state.clock = { day: 1, hour: 10, minute: 0 };
  state.locationId = 'bookshop';
  return state;
};
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('R-27ET1 stationery and equipment slots', () => {
  it('is sold for 500 yen at the street-side stationery counter, not the convenience store', () => {
    const state = fresh();
    expect(getStationeryAvailability(state).available).toBe(true);
    const quote = getPurchaseQuote(state, R27ET1_ITEM_ID, 2);
    expect(quote.totalPrice).toBe(1000);
    expect(quote.unitsAdded).toBe(2);
    const next = reduceState(state, { type: 'buy_item', itemId: R27ET1_ITEM_ID, quantity: 2 });
    expect(next.player.balance).toBe(state.player.balance - 1000);
    expect(next.inventory.find(item => item.itemId === R27ET1_ITEM_ID)?.quantity).toBe(2);
    state.locationId = 'convenience';
    expect(getPurchaseQuote(state, R27ET1_ITEM_ID).blockedReason).toContain('文具店');
    state.locationId = 'bookshop';
    state.clock.hour = 23;
    expect(getPurchaseQuote(state, R27ET1_ITEM_ID).blockedReason).toContain('打烊');
  });

  it('needs a permanent slot and cannot be consumed, packed or placed in the special slot', () => {
    let state = fresh();
    state = reduceState(state, { type: 'buy_item', itemId: R27ET1_ITEM_ID, quantity: 1 });
    expect(getUseItemQuote(state, R27ET1_ITEM_ID).blockedReason).toContain('装备');
    expect(() => reduceState(state, { type: 'use_item', itemId: R27ET1_ITEM_ID })).toThrow();
    expect(() => reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: 'special' })).toThrow();
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: 'permanent-1' });
    expect(equippedItem(state, 'permanent-1')).toBe(R27ET1_ITEM_ID);
    expect(equippedItem(state, 'permanent-2')).toBeNull();
    expect(equippedItem(state, 'special')).toBeNull();
    expect(r27et1Equipped(state)).toBe(true);
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: 'permanent-2' });
    expect(equippedItem(state, 'permanent-1')).toBeNull();
    expect(equippedItem(state, 'permanent-2')).toBe(R27ET1_ITEM_ID);
    expect(parseState(roundTrip(state))).toEqual(state);
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: null });
    expect(equippedItem(state, 'permanent-2')).toBeNull();
    expect(state.inventory.some(item => item.itemId === R27ET1_ITEM_ID)).toBe(true);
  });

  it('adds 25% to bookshop learning and retains its receipt after unequipping', () => {
    let state = fresh();
    state = reduceState(state, { type: 'choose_academics', majorId: 'computer-science' });
    state = reduceState(state, { type: 'buy_item', itemId: R27ET1_ITEM_ID, quantity: 2 });
    expect(studyPointsWithEquipment(state, 20)).toBe(20);
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: 'permanent-1' });
    expect(studyPointsWithEquipment(state, 20)).toBe(25);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      state = reduceState(state, { type: 'read_subject', subjectId: 'cs-programming', optionId: 'study-short' });
      expect(state.academics?.lastGain?.minutes).toBe(15);
      expect(state.academics?.lastGain?.points).toBe(19);
      expect(state.academics?.lastGain?.equipmentId).toBe(R27ET1_ITEM_ID);
      expect(parseState(roundTrip(state))).toEqual(state);
      state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: null });
      expect(parseState(roundTrip(state))).toEqual(state);
      expect(state.academics?.lastGain?.points).toBe(19);
    } finally {
      random.mockRestore();
    }
  });

  it('keeps item ownership and equipment isolated for each protagonist', () => {
    let state = enableProtagonists(fresh());
    state = reduceState(state, { type: 'buy_item', itemId: R27ET1_ITEM_ID, quantity: 1 });
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: 'permanent-1' });
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    expect(equippedItem(state, 'permanent-1')).toBeNull();
    expect(state.inventory.some(item => item.itemId === R27ET1_ITEM_ID)).toBe(false);
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(equippedItem(state, 'permanent-1')).toBe(R27ET1_ITEM_ID);
    expect(parseState(roundTrip(state))).toEqual(state);
  });

  it('rejects forged slot metadata and does not turn consumables into equipment', () => {
    const state = fresh();
    state.inventory.push({ itemId: 'meal-basic', quantity: 1 });
    expect(() => reduceState(state, { type: 'equip_item', itemId: 'meal-basic', slot: 'permanent-1' })).toThrow();
    state.inventory[0] = { itemId: R27ET1_ITEM_ID, quantity: 1, equipped: 'special' };
    expect(() => parseState(state)).toThrow();
  });
  it('keeps a CRYCHIC photo in the special slot while stationery occupies a permanent slot', () => {
    let state = enableProtagonists(fresh());
    state = reduceState(state, { type: 'choose_academics', majorId: 'music' });
    state = reduceState(state, { type: 'buy_item', itemId: R27ET1_ITEM_ID, quantity: 1 });
    state = reduceState(state, { type: 'equip_item', itemId: CRYCHIC_PHOTO });
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: 'permanent-1' });
    expect(equippedItem(state, 'special')).toBe(CRYCHIC_PHOTO);
    expect(equippedItem(state, 'permanent-1')).toBe(R27ET1_ITEM_ID);
    expect(state.inventory.find(item => item.itemId === CRYCHIC_PHOTO)?.equipped).toBe(true);
    expect(r27et1Equipped(state)).toBe(true);
    expect(parseState(roundTrip(state))).toEqual(state);
    state = reduceState(state, { type: 'equip_item', itemId: R27ET1_ITEM_ID, slot: null });
    expect(equippedItem(state, 'special')).toBe(CRYCHIC_PHOTO);
    expect(equippedItem(state, 'permanent-1')).toBeNull();
  });

});
