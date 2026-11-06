import { describe, expect, it } from 'vitest';
import { californiaPlaces, internationalConnections, PRO200_CLAIM_SERVICE_ID, PRO200_RESELL_SERVICE_ID, PRO200_GAME_ITEM_ID, PRO200_RESALE_YEN, pro200ClaimBlocked } from '../src/runtime/california';
import { getStoreItem, getPurchaseQuote, getUseItemQuote } from '../src/runtime/convenience-store';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { getLocationServiceQuote, getLocationServices, getLocationStatus } from '../src/runtime/location-services';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { validateStoryActions } from '../src/runtime/story-actions';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { appiePayBalance } from '../src/runtime/dual-protagonists';

function fundedState() {
  const state = createInitialState();
  state.player.balance = 300000;
  return state;
}

describe('California airport and fictional Pro200 trade', () => {
  it('requires a real four-stop route from Tokyo and charges each leg', () => {
    expect(californiaPlaces.map(place => place.id)).toEqual([
      'haneda-airport', 'sfo-airport', 'california-openai', 'california-market',
    ]);
    const base = fundedState();
    const stop = reduceState(base, { type: 'novel_travel', locationId: 'bus-stop' });
    expect(getAdjacentLocations(stop).map(place => place.id)).toContain('haneda-airport');
    expect(getNovelTravelQuote(stop, 'sfo-airport').blockedReason).toMatch(/机场|接驳|逐站/);

    const hanedaQuote = getNovelTravelQuote(stop, 'haneda-airport');
    expect(hanedaQuote.blockedReason).toBeNull();
    expect(hanedaQuote.fare).toBe(1200);
    const haneda = reduceState(stop, { type: 'novel_travel', locationId: 'haneda-airport' });
    expect(haneda.scene).toBeNull();
    expect(haneda.player.balance).toBe(stop.player.balance - 1200);
    expect(getAdjacentLocations(haneda).map(place => place.id)).toContain('sfo-airport');

    const flightQuote = getNovelTravelQuote(haneda, 'sfo-airport');
    expect(flightQuote.fare).toBe(48000);
    expect(flightQuote.minutes).toBe(600);
    const sfo = reduceState(haneda, { type: 'novel_travel', locationId: 'sfo-airport' });
    expect(sfo.locationId).toBe('sfo-airport');
    expect(sfo.player.balance).toBe(haneda.player.balance - 48000);
    expect(sfo.journal.at(-1)?.text).toContain('国际航班');
    expect(getAdjacentLocations(sfo).map(place => place.id)).toContain('california-openai');

    const office = reduceState(sfo, { type: 'novel_travel', locationId: 'california-openai' });
    expect(office.locationId).toBe('california-openai');
    const market = reduceState(office, { type: 'novel_travel', locationId: 'california-market' });
    expect(market.locationId).toBe('california-market');
    expect(internationalConnections('california-market').map(leg => leg.to)).toEqual(['california-openai']);
    expect(() => reduceState(market, { type: 'novel_travel', locationId: 'bus-stop' })).toThrow(/国际旅行只能/);
    expect(parseState(market)).toEqual(market);
  });

  it('forbids boarding a flight without funds or physically being at the airport', () => {
    const poor = createInitialState();
    poor.locationId = 'haneda-airport';
    expect(getNovelTravelQuote(poor, 'sfo-airport').blockedReason).toMatch(/余额不足/);
    expect(() => reduceState(poor, { type: 'novel_travel', locationId: 'sfo-airport' })).toThrow(/余额不足/);
    const far = fundedState();
    expect(getNovelTravelQuote(far, 'california-openai').blockedReason).toMatch(/国际旅行只能/);
  });

  it('claims a real voucher with a saved 7-day cooldown, then sells exactly one', () => {
    const office = fundedState();
    office.locationId = 'california-openai';
    office.scene = null;
    office.clock = { day: 2, hour: 5, minute: 0 }; // 13:00 in fictional California local time.
    expect(getLocationStatus('california-openai', office.clock)?.isOpen).toBe(true);
    expect(getLocationServices(office).map(service => service.id)).toContain(PRO200_CLAIM_SERVICE_ID);
    expect(getLocationServiceQuote(office, PRO200_CLAIM_SERVICE_ID).blockedReason).toBeNull();

    const claimed = reduceState(office, { type: 'location_service', serviceId: PRO200_CLAIM_SERVICE_ID });
    expect(claimed.inventory).toContainEqual({ itemId: PRO200_GAME_ITEM_ID, quantity: 1 });
    expect(claimed.california?.claims.soyo).toBe(2);
    expect(parseState(claimed)).toEqual(claimed);
    expect(getLocationServiceQuote(claimed, PRO200_CLAIM_SERVICE_ID).blockedReason).toMatch(/已经领取/);
    expect(() => reduceState(claimed, { type: 'location_service', serviceId: PRO200_CLAIM_SERVICE_ID })).toThrow(/已经领取/);
    expect(pro200ClaimBlocked(claimed, 'sakiko')).toBeNull();
    const nextWeek = parseState({ ...claimed, clock: { ...claimed.clock, day: 9 } });
    expect(getLocationServiceQuote(nextWeek, PRO200_CLAIM_SERVICE_ID).blockedReason).toBeNull();

    const market = parseState({ ...claimed, locationId: 'california-market' });
    const quote = getLocationServiceQuote(market, PRO200_RESELL_SERVICE_ID);
    expect(quote.blockedReason).toBeNull();
    expect(quote.payout).toBe(PRO200_RESALE_YEN);
    const sold = reduceState(market, { type: 'location_service', serviceId: PRO200_RESELL_SERVICE_ID });
    expect(sold.inventory.some(entry => entry.itemId === PRO200_GAME_ITEM_ID)).toBe(false);
    expect(sold.player.balance).toBe(market.player.balance + PRO200_RESALE_YEN);
    expect(getLocationServiceQuote(sold, PRO200_RESELL_SERVICE_ID).blockedReason).toMatch(/没有可出售/);
    expect(() => reduceState(sold, { type: 'location_service', serviceId: PRO200_RESELL_SERVICE_ID })).toThrow(/没有可出售/);
    expect(parseState(sold)).toEqual(sold);
  });

  it('credits the active Appie Pay ledger without altering the other characters', () => {
    const owned = enableProtagonists(fundedState());
    owned.locationId = 'california-openai';
    owned.scene = null;
    owned.clock = { day: 2, hour: 5, minute: 0 };
    const beforeBalances = Object.fromEntries(['soyo', 'sakiko', 'emma', 'renako']
      .map(id => [id, appiePayBalance(owned.protagonists!.accounts, id as 'soyo' | 'sakiko' | 'emma' | 'renako')]));
    const claimed = reduceState(owned, { type: 'location_service', serviceId: PRO200_CLAIM_SERVICE_ID });
    expect(claimed.california?.claims.soyo).toBe(2);
    const market = parseState({ ...claimed, locationId: 'california-market' });
    const sold = reduceState(market, { type: 'location_service', serviceId: PRO200_RESELL_SERVICE_ID });
    expect(appiePayBalance(sold.protagonists!.accounts, 'soyo')).toBe(beforeBalances.soyo + PRO200_RESALE_YEN * 100);
    for (const id of ['sakiko', 'emma', 'renako'] as const)
      expect(appiePayBalance(sold.protagonists!.accounts, id)).toBe(beforeBalances[id]);
    expect(parseState(sold)).toEqual(sold);
  });

  it('does not allow buying, using, or inventing vouchers outside their dedicated services', () => {
    const state = fundedState();
    expect(getStoreItem(PRO200_GAME_ITEM_ID)?.category).toBe('collectible');
    expect(getPurchaseQuote(state, PRO200_GAME_ITEM_ID).blockedReason).toBeTruthy();
    expect(getUseItemQuote({ ...state, inventory: [{ itemId: PRO200_GAME_ITEM_ID, quantity: 1 }] }, PRO200_GAME_ITEM_ID).blockedReason).toMatch(/不能直接使用/);
    expect(validateStoryActions([{ type: 'service', serviceId: PRO200_CLAIM_SERVICE_ID }], state)).toHaveLength(1);
    expect(validateStoryActions([{ type: 'service', serviceId: PRO200_RESELL_SERVICE_ID }], state)).toHaveLength(1);
    expect(() => validateStoryActions([{ type: 'buy', itemId: PRO200_GAME_ITEM_ID, quantity: 1 }], state)).toThrow();
    expect(() => reduceState(state, { type: 'location_service', serviceId: PRO200_CLAIM_SERVICE_ID })).toThrow(/当前地点/);
  });
});
