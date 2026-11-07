import { describe, expect, it } from 'vitest';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getStoreItem, getPurchaseQuote, getUseItemQuote } from '../src/runtime/convenience-store';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { getLocationStatus } from '../src/runtime/location-services';
import { internationalConnections } from '../src/runtime/california';
import {
  SECOND_MYSTERY_VISITOR_ID, MYSTERY_VISITOR_ONE_IN,
  MAX20X_ITEM_ID, KYC_ITEM_ID, LAST_DECISION_ITEM_ID,
  FULL_RESET_ITEM_ID, PRO500_ITEM_ID, secondMysteryVisitorPresent,
} from '../src/runtime/mystery-visitor';
import anthropicWorldbook from '../src/worldbook/anthropic-visitor.json';

function rareSecondVisitor() {
  const state = createInitialState();
  state.clock = { day: 2, hour: 8, minute: 30 };
  state.locationId = 'gate';
  state.scene = { x: 0, z: 31, yaw: 0, areaId: 'south-gate', seed: 'visitor-test-10745', encounterId: null };
  return parseState(state);
}

describe('second mystery visitor and the fictional Anthropic center', () => {
  it('is a separate rare visitor with a stable independent roll', () => {
    const state = rareSecondVisitor();
    expect(SECOND_MYSTERY_VISITOR_ID).not.toBe('rare-mysterious-visitor');
    expect(MYSTERY_VISITOR_ONE_IN).toBe(20_000);
    expect(secondMysteryVisitorPresent(state)).toBe(true);
    expect(secondMysteryVisitorPresent(parseState(JSON.parse(JSON.stringify(state))))).toBe(true);
    expect(secondMysteryVisitorPresent({ ...state, clock: { ...state.clock, hour: 23 } })).toBe(true);
    expect(secondMysteryVisitorPresent({ ...state, scene: { ...state.scene!, seed: 'ordinary-walk' } })).toBe(false);
    expect(secondMysteryVisitorPresent({ ...state, interior: { roomId: 'placeholder' } as typeof state.interior })).toBe(false);
  });

  it('grants exactly Max 20x, KYC and Last Decision, but not the original visitor rewards', () => {
    const original = rareSecondVisitor();
    const received = reduceState(original, { type: 'claim_second_mystery_gift' });
    expect(received.inventory).toEqual([
      ...original.inventory, { itemId: MAX20X_ITEM_ID, quantity: 1 },
      { itemId: KYC_ITEM_ID, quantity: 1 },
      { itemId: LAST_DECISION_ITEM_ID, quantity: 1 },
    ]);
    expect(received.anthropicVisitor?.claimedBy.soyo).toBe(true);
    expect(received.mysteryVisitor?.claimedBy.soyo).toBeUndefined();
    expect(received.inventory.some(item => item.itemId === FULL_RESET_ITEM_ID || item.itemId === PRO500_ITEM_ID)).toBe(false);
    expect(received.journal.at(-1)?.text).toContain('Max 20x ×1');
    expect(received.story.at(-1)?.text).toContain('Last Decision ×1');
    expect(secondMysteryVisitorPresent(received)).toBe(false);
    expect(parseState(JSON.parse(JSON.stringify(received)))).toEqual(received);
    expect(() => reduceState(received, { type: 'claim_second_mystery_gift' })).toThrow(/神秘访客/);
    expect(original.inventory).toEqual([{ itemId: 'crychic-photo', quantity: 1 }]);
  });

  it('preserves claimant isolation and refuses unearned rewards', () => {
    const state = rareSecondVisitor();
    expect(() => reduceState(createInitialState(), { type: 'claim_second_mystery_gift' })).toThrow(/神秘访客/);
    expect(() => reduceState({ ...state, scene: { ...state.scene!, seed: 'ordinary-walk' } }, { type: 'claim_second_mystery_gift' })).toThrow(/神秘访客/);
    const active = reduceState(enableProtagonists(state), { type: 'claim_second_mystery_gift' });
    const switched = reduceState(active, { type: 'switch_protagonist', target: 'sakiko' });
    expect(switched.anthropicVisitor?.claimedBy.soyo).toBe(true);
    expect(switched.anthropicVisitor?.claimedBy.sakiko).toBeUndefined();
    expect(switched.inventory.some(item => item.itemId === KYC_ITEM_ID)).toBe(false);
    const restored = reduceState(switched, { type: 'switch_protagonist', target: 'soyo' });
    expect(restored.inventory).toContainEqual({ itemId: KYC_ITEM_ID, quantity: 1 });
    expect(restored.anthropicVisitor?.claimedBy.soyo).toBe(true);
    expect(parseState(restored)).toEqual(restored);
  });

  it('adds the Anthropic stop to real California connections with a return path', () => {
    const center = 'california-anthropic';
    expect(getLocationStatus(center, { day: 2, hour: 5, minute: 0 })?.label).toBe('Anthropic 访客中心');
    expect(internationalConnections(center).map(leg => leg.to)).toEqual(['california-openai', 'california-market']);
    const start = createInitialState();
    start.clock = { day: 2, hour: 5, minute: 0 };
    start.locationId = 'california-openai';
    start.scene = null;
    start.player.balance = 300_000;
    expect(getNovelTravelQuote(start, center).fare).toBe(450);
    const arrived = reduceState(start, { type: 'novel_travel', locationId: center });
    expect(arrived.player.balance).toBe(start.player.balance - 450);
    expect(getAdjacentLocations(arrived).map(location => location.id)).toContain('california-market');
    expect(getNovelTravelQuote(arrived, 'bus-stop').blockedReason).toMatch(/国际旅行只能/);
    const market = reduceState(arrived, { type: 'novel_travel', locationId: 'california-market' });
    expect(market.player.balance).toBe(arrived.player.balance - 350);
    expect(parseState(market)).toEqual(market);
  });

  it('can also appear overseas without Tokyo world coordinates', () => {
    const state = createInitialState();
    state.locationId = 'california-anthropic';
    state.clock = { day: 11344, hour: 14, minute: 0 };
    state.scene = null;
    expect(secondMysteryVisitorPresent(state)).toBe(true);
    expect(secondMysteryVisitorPresent({ ...state, clock: { ...state.clock, hour: 23 } })).toBe(true);
  });

  it('keeps all three premium rewards as offline, unpurchasable collectibles', () => {
    const state = rareSecondVisitor();
    for (const itemId of [MAX20X_ITEM_ID, KYC_ITEM_ID, LAST_DECISION_ITEM_ID]) {
      expect(getStoreItem(itemId)?.category).toBe('collectible');
      expect(getPurchaseQuote(state, itemId).blockedReason).toBeTruthy();
      expect(getUseItemQuote({ ...state, inventory: [{ itemId, quantity: 1 }] }, itemId).blockedReason).toMatch(/无法直接使用/);
    }
    expect(anthropicWorldbook.entries).toHaveLength(2);
    for (const row of anthropicWorldbook.entries) {
      expect(row.constant).toBe(false);
      expect(row.enabled).toBe(true);
      expect(row.keys.length).toBeGreaterThan(0);
    }
  });
});
