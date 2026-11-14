import { describe, expect, it } from 'vitest';
import atlas from '../assets/beijing-sandbox/sandbox.json';
import { beijingConnections, beijingLocalTime, beijingPlaces, beijingTravelLeg, isBeijingLocation } from '../src/runtime/beijing';
import { novelDestinations } from '../src/runtime/model';

describe('Beijing map-to-state integration', () => {
  it('registers every uploaded location as a novel destination', () => {
    expect(beijingPlaces).toHaveLength(33);
    const ids = new Set(beijingPlaces.map(place => place.id));
    expect(ids.size).toBe(33);
    for (const place of beijingPlaces) {
      expect(isBeijingLocation(place.id)).toBe(true);
      expect(novelDestinations.some(dest => dest.id === place.id)).toBe(true);
    }
  });
  it('keeps authored paths reversible and never allows remote teleports', () => {
    expect(atlas.routes).toHaveLength(48);
    for (const route of atlas.routes) {
      const a = beijingTravelLeg(route.from, route.to);
      const b = beijingTravelLeg(route.to, route.from);
      expect(a?.minutes).toBe(route.minutes);
      expect(b?.minutes).toBe(route.minutes);
      expect(a?.fare).toBe(b?.fare);
      expect(beijingConnections(route.from).some(leg => leg.to === route.to)).toBe(true);
    }
    expect(beijingTravelLeg('california-openai', 'beijing-forbidden-city')).toBeNull();
    expect(beijingTravelLeg('haneda-airport', 'beijing-beijing-station')).not.toBeNull();
  });
  it('derives Beijing clock without mutating the host clock', () => {
    const host = { hour: 0, minute: 18 };
    expect(beijingLocalTime(host)).toEqual({ hour: 23, minute: 18 });
    expect(host.hour).toBe(0);
  });
});
