import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import source from '../assets/circle-livehouse/circle-sandbox.json';
import sandbox from '../assets/models/unread-city-tokyo-sandbox-data.json';
import pack from '../integration/circle-livehouse/pack.json';
import worldbook from '../src/worldbook/circle-livehouse.json';
import { visibleMapBuildings } from '../src/frontend/campus-map-layout';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { getSceneArea } from '../src/runtime/scene-context';
import {
  CIRCLE_PACK_PAYLOAD_SHA256, CIRCLE_PACK_ZIP_BYTES, CIRCLE_PACK_ZIP_SHA256, circleSandboxOverlay, sha256Hex,
} from '../src/frontend/circle-sandbox-pack';
import { MAP_DISTRICT_IDS, districtBounds, locationDistrict } from '../src/frontend/map-districts';
import { tokyoLocationPosition } from '../src/frontend/tokyo-sandbox-map';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import {
  CIRCLE_CAFE_MENU_IDS, circleBorrowedPrice, circleVisitServiceId, isBorrowedLivehouseText,
} from '../src/runtime/circle-venue';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { getLocationServiceQuote, getLocationServices, locationServiceCatalog } from '../src/runtime/location-services';
import { CIRCLE_BILL_SHIFT } from '../src/runtime/circle-visit';
import { liveBill } from '../src/runtime/livehouse-visit';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import type { InteriorPresence, WorldState } from '../src/frontend/types';

function atCircle(state = createInitialState(), roomId: 'circle' | 'circle-cafe' | 'circle-studio' = 'circle'): WorldState {
  const entrance = roomId === 'circle' ? { x: -310, z: -155 } : getCampusInterior(roomId)!.entrance;
  const interior: InteriorPresence | null = roomId === 'circle' ? null : {
    roomId, x: 0, z: -1.4, yaw: 0, activityId: null, lastRest: null, lastStudy: null,
  };
  return {
    ...state,
    locationId: roomId,
    scene: { x: entrance.x, z: entrance.z, yaw: 0, areaId: 'circle', seed: 'circle-test', encounterId: null },
    interior,
  };
}

describe('CiRCLE live house', () => {
  it('loads the scenic district from the offline STORE pack', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const zip = readFileSync(pack.archive);
    expect(zip.byteLength).toBe(CIRCLE_PACK_ZIP_BYTES);
    expect(zip.byteLength).toBe(pack.zipBytes);
    expect(createHash('sha256').update(zip).digest('hex')).toBe(CIRCLE_PACK_ZIP_SHA256);
    expect(pack.payloadSha256).toBe(CIRCLE_PACK_PAYLOAD_SHA256);
    expect(pack.compression).toBe('STORE');
    expect(pack.manifestSchema).toBe('unread-city-lite-assets-v1');
    expect(circleSandboxOverlay).toEqual(source);
    expect(sandbox.buildings.some(building => building.id.includes('circle'))).toBe(false);
    expect(sandbox.districts.find(district => district.id === 'circle')).toEqual(source.districts[0]);
    expect(sandbox.landmarks.find(landmark => landmark.id === 'circle')).toEqual(source.landmarks[0]);
    expect(tokyoLocationPosition('circle')).toEqual({ x: source.landmarks[0]!.x, z: source.landmarks[0]!.z });
    const loader = readFileSync('src/frontend/circle-sandbox-pack.ts', 'utf8');
    expect(loader).not.toMatch(/https?:\/\//);
    expect(readFileSync('scripts/build_card.py', 'utf8')).toContain('src/worldbook');
  });

  it('places the venue beside the large commercial district and keeps both rooms enterable', () => {
    expect(MAP_DISTRICT_IDS).toContain('circle');
    expect(getSceneArea(-310, -155)?.id).toBe('circle');
    expect(locationDistrict('circle-cafe')).toBe('circle');
    expect(locationDistrict('circle-studio')).toBe('circle');
    const bounds = districtBounds('circle');
    for (const roomId of ['circle-cafe', 'circle-studio'] as const) {
      const room = getCampusInterior(roomId)!;
      expect(room.parentLocationId).toBe('circle');
      expect(room.entrance.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(room.entrance.x).toBeLessThanOrEqual(bounds.maxX);
      expect(room.entrance.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(room.entrance.z).toBeLessThanOrEqual(bounds.maxZ);
    }
    expect(visibleMapBuildings('circle').map(building => building.id)).toEqual(expect.arrayContaining([
      'building:circle-hall', 'building:circle-studio',
    ]));
    expect(getAdjacentLocations({ locationId: 'grand-commercial', interior: null }))
      .toContainEqual(expect.objectContaining({ id: 'circle', kind: 'nearby' }));
    const fromCircle = getAdjacentLocations({ locationId: 'circle', interior: null });
    expect(fromCircle).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'circle-cafe', kind: 'enter' }),
      expect.objectContaining({ id: 'circle-studio', kind: 'enter' }),
      expect.objectContaining({ id: 'grand-commercial', kind: 'nearby' }),
    ]));
    const fromCommercial = createInitialState();
    fromCommercial.locationId = 'grand-commercial';
    fromCommercial.scene = { x: -180, z: -150, yaw: 0, areaId: 'grand-commercial', seed: 'circle-test', encounterId: null };
    const trip = getNovelTravelQuote(fromCommercial, 'circle');
    expect(trip.blockedReason).toBeNull();
    expect(trip.rides).toEqual([]);
    expect(trip.fare).toBe(0);
    expect(getNovelBackground('circle', 12).src).toBe(getNovelBackground('bookshop', 12).src);
    expect(getNovelBackground('circle-cafe', 20).src).toBe(getNovelBackground('bookshop', 20).src);
    expect(getNovelBackground('circle-studio', 21).src).toBe(getNovelBackground('livehouse', 21).src);
    expect(worldbook.entries[0]?.keys).toContain('月之森真里');
    expect(worldbook.entries[0]?.content).toContain('11:00');
    expect(worldbook.entries[0]?.extensions).toEqual({});
    expect(readFileSync('src/runtime/npc-cast.ts', 'utf8')).not.toContain('月之森真里');
  });

  it('settles the small cafe menu with the existing service quote and reports structured failures', () => {
    const open = atCircle();
    expect(getLocationServices(open).map(service => service.id)).toEqual(expect.arrayContaining([...CIRCLE_CAFE_MENU_IDS]));
    const inside = atCircle(createInitialState(), 'circle-cafe');
    expect(getLocationServices(inside).map(service => service.id)).toEqual([...CIRCLE_CAFE_MENU_IDS]);
    expect(getLocationServices(atCircle(createInitialState(), 'circle-studio')).some(service =>
      (CIRCLE_CAFE_MENU_IDS as readonly string[]).includes(service.id))).toBe(false);
    const cafe = atCircle();
    cafe.locationId = 'cafe';
    cafe.scene = { x: 14, z: 0.9, yaw: 0, areaId: 'campus-cafe', seed: 'circle-test', encounterId: null };
    for (const serviceId of CIRCLE_CAFE_MENU_IDS) {
      const here = getLocationServiceQuote(open, serviceId);
      const there = getLocationServiceQuote(cafe, serviceId);
      expect(here.blockedReason).toBeNull();
      expect(here.price).toBe(there.price);
      expect(here.minutes).toBe(there.minutes);
      expect(here.changes).toEqual(there.changes);
    }
    const before = structuredClone(open);
    expect(getLocationServiceQuote(open, 'drink-coffee').blockedReason).toBeNull();
    expect(open.player).toEqual(before.player);
    expect(open.clock).toEqual(before.clock);

    const poor = atCircle();
    poor.player = { ...poor.player, balance: 100 };
    const poorQuote = getLocationServiceQuote(poor, 'drink-coffee');
    expect(poorQuote.blockedReason).toMatch(/余额不足/);
    expect(poorQuote.playerAfter.balance).toBe(100);
    expect(() => reduceState(poor, { type: 'location_service', serviceId: 'drink-coffee' })).toThrow(/余额不足/);
    expect(poor.player.balance).toBe(100);

    const closed = atCircle();
    closed.clock = { ...closed.clock, hour: 8, minute: 0 };
    expect(getLocationServiceQuote(closed, 'drink-latte').blockedReason).toMatch(/11:00–22:00/);
    const door = atCircle(closed);
    door.scene = { ...door.scene!, x: -312, z: -157 };
    expect(() => reduceState(door, { type: 'enter_interior', roomId: 'circle-cafe' })).toThrow(/11:00–22:00/);

    const late = atCircle();
    late.clock = { ...late.clock, hour: 21, minute: 55 };
    expect(getLocationServiceQuote(late, 'drink-latte').blockedReason).toMatch(/打烊/);

    let paid = atCircle();
    paid.player = { ...paid.player, balance: 320 };
    const priced = getLocationServiceQuote(paid, 'drink-coffee');
    paid = reduceState(paid, { type: 'location_service', serviceId: 'drink-coffee' });
    expect(paid.player.balance).toBe(0);
    expect(paid.clock).toEqual({ day: 1, hour: 17, minute: 30 });
    expect(paid.player.foodEnergy - createInitialState().player.foodEnergy).toBe(priced.changes.foodEnergy);
    expect(paid.player.satiety - createInitialState().player.satiety).toBe(priced.changes.satiety);
    const replay = structuredClone(paid);
    expect(() => reduceState(replay, { type: 'location_service', serviceId: 'drink-coffee' })).toThrow(/余额不足/);
    expect(replay.player.balance).toBe(0);

    let looking = atCircle(createInitialState(), 'circle-cafe');
    looking.interior = { ...looking.interior!, x: 0, z: -1.6 };
    looking = reduceState(looking, { type: 'interior_interact', interactionId: 'circle-cafe-menu' });
    const noted = looking.journal.length;
    const looked = reduceState(looking, { type: 'interior_interact', interactionId: 'circle-cafe-menu' });
    expect(looked.journal.length).toBe(noted);
    expect(looked.clock).toEqual(looking.clock);
    expect(looked.player.balance).toBe(looking.player.balance);
  });

  it('reuses live-house tickets and practice rental with another price and lineup', () => {
    const livehouse = getCampusInterior('livehouse')!;
    const sourceInteractions = livehouse.interactions.filter(item => isBorrowedLivehouseText(item.id, item.label));
    const mirrored = getCampusInterior('circle-studio')!.interactions.filter(item => item.id.startsWith('circle-borrow-'));
    expect(mirrored).toHaveLength(sourceInteractions.length);
    const ring = locationServiceCatalog.filter(service => service.locationIds.includes('livehouse')
      && (service.id.startsWith('livehouse-watch-') || service.id.startsWith('livehouse-practice-')));
    expect(ring.map(service => service.id)).toEqual(expect.arrayContaining(['livehouse-watch-1800', 'livehouse-practice-1h']));
    for (const service of ring) {
      const copy = locationServiceCatalog.find(item => item.id === circleVisitServiceId(service.id));
      expect(copy?.price).toBe(circleBorrowedPrice(service.price));
      expect(copy?.locationIds).toEqual(['circle', 'circle-studio']);
      expect(copy?.effects).toEqual(service.effects);
      expect(service.locationIds).toEqual(['livehouse']);
    }
    const here = atCircle();
    here.player = { ...here.player, balance: 20000, energy: 100 };
    const bought = getLocationServiceQuote(here, 'circle-watch-1800');
    const ringState = createInitialState();
    ringState.locationId = 'livehouse';
    ringState.player = { ...here.player };
    ringState.clock = { ...here.clock };
    const ringQuote = getLocationServiceQuote(ringState, 'livehouse-watch-1800');
    expect(bought.blockedReason).toBeNull();
    expect(bought.price).toBe(circleBorrowedPrice(ringQuote.price));
    expect(bought.livehouse?.show?.id).toBe(`circle-d${here.clock.day}-1800`);
    expect(bought.livehouse?.show?.actId).toBe(liveBill(here.clock.day + CIRCLE_BILL_SHIFT).find(row => row.key === '1800')?.act.id);
    expect(ringQuote.livehouse?.show?.id).toBe(`d${here.clock.day}-1800`);
    expect(ringQuote.blockedReason).toBeNull();
    const watched = parseState(reduceState(here, { type: 'location_service', serviceId: 'circle-watch-1800' }));
    expect(watched.livehouseVisit?.watched.map(row => row.showId)).toEqual([`circle-d${here.clock.day}-1800`]);
    expect(getLocationServiceQuote(watched, 'circle-watch-1800').blockedReason).toMatch(/已经买过/);
    expect(getLocationServiceQuote(ringState, 'livehouse-watch-1800').blockedReason).toBeNull();
    expect(livehouse.interactions.some(item => item.id.startsWith('circle-'))).toBe(false);
  });
});
