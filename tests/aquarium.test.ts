import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getLocationServices, getLocationServiceQuote, getLocationStatus } from '../src/runtime/location-services';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { createInitialState, getNovelTravelQuote, locations, novelDestinations, reduceState } from '../src/runtime/model';
import aquariumWorldbook from '../src/worldbook/tokyo-aquarium.json';

describe('sunshine aquarium (pure novel mode)', () => {
  it('registers aquarium background art and interior destination', () => {
    const bgDay = getNovelBackground('aquarium', 14);
    const bgNight = getNovelBackground('aquarium', 20);
    expect(bgDay.id).toBe('aquarium-day');
    expect(bgDay.source).toBe('user-art');
    expect(bgDay.src).toBeTruthy();
    expect(bgNight.id).toBe('aquarium-day');

    const room = getCampusInterior('aquarium');
    expect(room).toBeDefined();
    expect(room?.label).toBe('阳光水族馆');
    expect(room?.parentLocationId).toBe('commercial');

    expect(locations.some(loc => loc.id === 'aquarium')).toBe(true);
    expect(novelDestinations.some(dest => dest.id === 'aquarium')).toBe(true);
  });

  it('allows traveling to aquarium and using its location services and indoor interactions', () => {
    let state = createInitialState();
    state = { ...state, clock: { day: 1, hour: 14, minute: 0 }, player: { ...state.player, balance: 10000, stress: 50, morale: 50, energy: 70 } };

    const travelQuote = getNovelTravelQuote(state, 'aquarium');
    expect(travelQuote.blockedReason).toBeNull();

    state = reduceState(state, { type: 'novel_travel', locationId: 'aquarium' });
    expect(state.locationId).toBe('aquarium');
    expect(state.interior?.roomId).toBe('aquarium');

    const status = getLocationStatus('aquarium', state.clock);
    expect(status?.isOpen).toBe(true);
    expect(status?.hoursLabel).toBe('10:00–20:00');

    const services = getLocationServices(state).map(s => s.id);
    expect(services).toEqual(expect.arrayContaining(['aquarium-visit', 'aquarium-penguin', 'aquarium-soda']));

    const visitQuote = getLocationServiceQuote(state, 'aquarium-visit');
    expect(visitQuote.blockedReason).toBeNull();
    expect(visitQuote.price).toBe(2400);

    const afterVisit = reduceState(state, { type: 'location_service', serviceId: 'aquarium-visit' });
    expect(afterVisit.player.balance).toBe(state.player.balance - 2400);
    expect(afterVisit.player.morale).toBeGreaterThan(state.player.morale);
    expect(afterVisit.player.stress).toBeLessThan(state.player.stress);

    const adjacentFromAquarium = getAdjacentLocations(afterVisit);
    expect(adjacentFromAquarium.some(item => item.id === 'commercial' && item.kind === 'exit')).toBe(true);
  });

  it('includes worldbook entry for east ikebukuro sunshine aquarium', () => {
    expect(aquariumWorldbook.entries.length).toBeGreaterThan(0);
    expect(aquariumWorldbook.entries[0]?.keys).toContain('阳光水族馆');
    expect(aquariumWorldbook.entries[0]?.content).toContain('水母');
  });
});
