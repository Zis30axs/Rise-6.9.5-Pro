import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getStoreItem, getPurchaseQuote, getUseItemQuote } from '../src/runtime/convenience-store';
import {
  MYSTERY_VISITOR_ID, MYSTERY_VISITOR_ONE_IN, FULL_RESET_ITEM_ID, PRO500_ITEM_ID,
  mysteryVisitorPresent, mysteryVisitorClaimed, parseMysteryVisitorState,
} from '../src/runtime/mystery-visitor';

function rareTokyo() {
  const state = createInitialState();
  state.clock = { day: 2, hour: 8, minute: 30 };
  state.locationId = 'gate';
  state.scene = { x: 0, z: 31, yaw: 0, areaId: 'south-gate', seed: 'test-19022', encounterId: null };
  return parseState(state);
}

describe('extremely rare mysterious visitor and its local gift', () => {
  it('has a stable one-in-20000 roll, without rerolling on refresh or opening panels', () => {
    const rare = rareTokyo();
    expect(MYSTERY_VISITOR_ONE_IN).toBe(20_000);
    expect(MYSTERY_VISITOR_ID).toBe('rare-mysterious-visitor');
    expect(mysteryVisitorPresent(rare)).toBe(true);
    expect(mysteryVisitorPresent(parseState(JSON.parse(JSON.stringify(rare))))).toBe(true);
    expect(mysteryVisitorPresent({ ...rare, clock: { ...rare.clock, hour: 22 } })).toBe(true);
    expect(mysteryVisitorPresent({ ...rare, scene: { ...rare.scene!, seed: 'ordinary-walk' } })).toBe(false);
    expect(mysteryVisitorPresent({ ...rare, interior: { roomId: 'placeholder' } as typeof rare.interior })).toBe(false);
  });

  it('grants ten Full Reset plus one Pro 500 to the backpack and records the claim', () => {
    const original = rareTokyo();
    const awarded = reduceState(original, { type: 'claim_mystery_gift' });
    expect(awarded.inventory).toContainEqual({ itemId: FULL_RESET_ITEM_ID, quantity: 10 });
    expect(awarded.inventory).toContainEqual({ itemId: PRO500_ITEM_ID, quantity: 1 });
    expect(awarded.mysteryVisitor?.claimedBy.soyo).toBe(true);
    expect(awarded.journal.at(-1)?.text).toContain('Full Reset ×10');
    expect(awarded.story.at(-1)?.text).toContain('Pro 500 ×1');
    expect(mysteryVisitorPresent(awarded)).toBe(false);
    expect(mysteryVisitorClaimed(awarded)).toBe(true);
    expect(parseState(JSON.parse(JSON.stringify(awarded)))).toEqual(awarded);
    expect(() => reduceState(awarded, { type: 'claim_mystery_gift' })).toThrow(/神秘访客/);
    expect(original.inventory).toEqual([]);
  });

  it('does not let anyone claim items without finding the visitor', () => {
    const ordinary = createInitialState();
    expect(mysteryVisitorPresent(ordinary)).toBe(false);
    expect(() => reduceState(ordinary, { type: 'claim_mystery_gift' })).toThrow(/神秘访客/);
    const blocked = rareTokyo();
    blocked.scene = { ...blocked.scene!, seed: 'ordinary-walk' };
    expect(() => reduceState(blocked, { type: 'claim_mystery_gift' })).toThrow(/神秘访客/);
  });

  it('preserves one-time receipts across character switching without leaking inventory', () => {
    const before = enableProtagonists(rareTokyo());
    const awarded = reduceState(before, { type: 'claim_mystery_gift' });
    const other = reduceState(awarded, { type: 'switch_protagonist', target: 'sakiko' });
    expect(other.mysteryVisitor?.claimedBy.soyo).toBe(true);
    expect(other.mysteryVisitor?.claimedBy.sakiko).toBeUndefined();
    expect(other.inventory.some(item => item.itemId === FULL_RESET_ITEM_ID)).toBe(false);
    const restored = reduceState(other, { type: 'switch_protagonist', target: 'soyo' });
    expect(restored.inventory).toContainEqual({ itemId: FULL_RESET_ITEM_ID, quantity: 10 });
    expect(restored.inventory).toContainEqual({ itemId: PRO500_ITEM_ID, quantity: 1 });
    expect(restored.mysteryVisitor?.claimedBy.soyo).toBe(true);
    expect(parseState(restored)).toEqual(restored);
  });

  it('also supports California with the same rarity and no Tokyo scene coordinates', () => {
    const state = createInitialState();
    state.locationId = 'sfo-airport';
    state.clock = { day: 38867, hour: 8, minute: 0 };
    state.scene = null;
    expect(mysteryVisitorPresent(state)).toBe(true);
    const received = reduceState(state, { type: 'claim_mystery_gift' });
    expect(received.inventory).toContainEqual({ itemId: FULL_RESET_ITEM_ID, quantity: 10 });
    expect(received.mysteryVisitor?.claimedBy.soyo).toBe(true);
  });

  it('keeps the special vouchers collectible, not purchasable or usable as real services', () => {
    const state = rareTokyo();
    for (const itemId of [FULL_RESET_ITEM_ID, PRO500_ITEM_ID]) {
      expect(getStoreItem(itemId)?.category).toBe('collectible');
      expect(getPurchaseQuote(state, itemId).blockedReason).toBeTruthy();
      expect(getUseItemQuote({ ...state, inventory: [{ itemId, quantity: 1 }] }, itemId).blockedReason).toMatch(/无法直接使用/);
    }
    expect(parseMysteryVisitorState({ claimedBy: { soyo: true } }).claimedBy.soyo).toBe(true);
    expect(() => parseMysteryVisitorState({ claimedBy: { sakiko: false } })).toThrow();
    expect(() => parseMysteryVisitorState({ claimedBy: { hacker: true } })).toThrow();
  });
});
