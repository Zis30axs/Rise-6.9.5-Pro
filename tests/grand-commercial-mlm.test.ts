import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists } from '../src/runtime/protagonist-world';
import { getCampusInterior, getMlmWorkBlockedReason, MLM_WORK_STRESS_LIMIT } from '../src/runtime/campus-interiors';
import { locationServiceCatalog } from '../src/runtime/location-services';
import { districtMapPlaces, locationDistrict } from '../src/frontend/map-districts';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { streetRoutes } from '../src/frontend/scene-world';

describe('grand-commercial mlm office interior and mechanics', () => {
  function world() {
    const enabled = enableProtagonists(createInitialState());
    return parseState(enabled);
  }

  function enterMlmOffice(state: any, x = 0, z = 1.5) {
    const room = getCampusInterior('mlm-office')!;
    state.locationId = room.id;
    state.scene = {
      x: room.entrance.x,
      z: room.entrance.z,
      yaw: room.entrance.yaw,
      areaId: room.parentLocationId,
      seed: 'seed-test-mlm',
      encounterId: null,
    };
    state.interior = {
      roomId: 'mlm-office',
      x,
      z,
      yaw: 0,
      activityId: null,
      lastRest: null,
      lastStudy: null,
    };
    return parseState(state);
  }

  it('registers mlm-office in grand-commercial district and scene routes', () => {
    const room = getCampusInterior('mlm-office')!;
    expect(room).toBeDefined();
    expect(room.parentLocationId).toBe('grand-commercial');
    expect(room.label).toBe('启航商贸（传销咨询）');
    expect(locationDistrict('mlm-office')).toBe('grand-commercial');

    const places = districtMapPlaces('grand-commercial');
    expect(places.some(p => p.id === 'mlm-office')).toBe(true);

    const routes = streetRoutes['grand-commercial'];
    expect(routes.some(r => r.label === '启航商贸写字楼门前')).toBe(true);

    const bg = getNovelBackground('mlm-office', 14);
    expect(bg.src).toContain('data:image/');
    expect(bg.imagePhase).toBe('day');
  });

  it('exposes entrance from grand-commercial and exit from inside mlm-office', () => {
    const outdoor = { locationId: 'grand-commercial', interior: null };
    const adjacent = getAdjacentLocations(outdoor as any);
    expect(adjacent.some(a => a.id === 'mlm-office' && a.kind === 'enter')).toBe(true);

    const indoor = { locationId: 'mlm-office', interior: { roomId: 'mlm-office' } };
    const insideAdjacent = getAdjacentLocations(indoor as any);
    expect(insideAdjacent).toEqual([{ id: 'grand-commercial', label: '新宿·大型商业娱乐区', kind: 'exit' }]);
  });

  it('allows making money through phone sales with a large stress surge and ledger sync', () => {
    let state = enterMlmOffice(world(), -3.0, 0.8);
    const initialBalance = state.player.balance;
    const initialStress = state.player.stress;
    const initialMorale = state.player.morale;
    const initialEnergy = state.player.energy;

    state = reduceState(state, { type: 'interior_interact', interactionId: 'mlm-phone-sales' });

    // Balance increased by 1600 yen
    expect(state.player.balance).toBe(initialBalance + 1600);
    // Stress increased significantly (+25)
    expect(state.player.stress).toBe(Math.min(100, initialStress + 25));
    // Morale decreased (-10)
    expect(state.player.morale).toBe(Math.max(0, initialMorale - 10));
    // Energy decreased (-12)
    expect(state.player.energy).toBe(initialEnergy - 12);

    // Ledger card balance increased accordingly
    const owner = activeProtagonist(state);
    const cardBalance = state.protagonists!.accounts.people[owner].cards.gpt;
    expect(cardBalance).toBeGreaterThanOrEqual(1600);

    // Journal contains note about income and stress change
    const lastJournal = state.journal[state.journal.length - 1];
    expect(lastJournal.text).toContain('1600');
    expect(lastJournal.text).toContain('压力+25');
  });

  it('executes attend rally and fold flyers with proper rewards and heavy stress', () => {
    let state = enterMlmOffice(world(), 0, 1.5);
    const balanceBefore = state.player.balance;
    const stressBefore = state.player.stress;

    state = reduceState(state, { type: 'interior_interact', interactionId: 'mlm-attend-rally' });
    expect(state.player.balance).toBe(balanceBefore + 600);
    expect(state.player.stress).toBe(Math.min(100, stressBefore + 20));

    // Move to desk and fold flyers
    state.interior!.x = 2.8;
    state.interior!.z = 1.0;
    const balanceBeforeFold = state.player.balance;
    const stressBeforeFold = state.player.stress;

    state = reduceState(state, { type: 'interior_interact', interactionId: 'mlm-fold-flyers' });
    expect(state.player.balance).toBe(balanceBeforeFold + 800);
    expect(state.player.stress).toBe(Math.min(100, stressBeforeFold + 15));
  });

  it('keeps company wages within range of construction, with extra psychological cost', () => {
    const office = getCampusInterior('mlm-office')!;
    const paid = office.interactions.filter(item => (item.balanceDelta ?? 0) > 0);
    const construction = locationServiceCatalog.find(item => item.id === 'construction-clear')!;
    expect(construction.payout).toBe(3200);
    expect(paid).toHaveLength(3);
    expect(paid.map(item => item.balanceDelta)).toEqual([1600, 600, 800]);
    expect(paid.every(item => item.balanceDelta! / item.minutes <= (construction.payout! / construction.minutes) * 1.5)).toBe(true);
    expect(paid.every(item => (item.stressDelta ?? 0) >= 15)).toBe(true);
    expect(MLM_WORK_STRESS_LIMIT).toBe(70);
  });

  it('blocks repeated paid company work under high stress without charging time or wages', () => {
    const office = getCampusInterior('mlm-office')!;
    const sale = office.interactions.find(item => item.id === 'mlm-phone-sales')!;
    const board = office.interactions.find(item => item.id === 'mlm-observe-board')!;
    expect(getMlmWorkBlockedReason(sale, 69)).toBeNull();
    expect(getMlmWorkBlockedReason(sale, 70)).toMatch(/压力过高/);
    expect(getMlmWorkBlockedReason(board, 100)).toBeNull();

    const before = enterMlmOffice(world(), -3.0, 0.8);
    before.player.stress = 69;
    const earned = reduceState(before, { type: 'interior_interact', interactionId: 'mlm-phone-sales' });
    expect(earned.player.stress).toBe(94);
    expect(earned.player.balance - before.player.balance).toBe(1600);
    const snapshot = structuredClone(earned);
    expect(() => reduceState(earned, { type: 'interior_interact', interactionId: 'mlm-phone-sales' }))
      .toThrow(/压力过高/);
    expect(earned).toEqual(snapshot);

    const inspected = enterMlmOffice(world(), 0, -3.2);
    inspected.player.stress = 100;
    const after = reduceState(inspected, { type: 'interior_interact', interactionId: 'mlm-observe-board' });
    expect(after.player.balance).toBe(inspected.player.balance);
    expect(after.player.stress).toBe(100);
  });

  it('allows zero-cost inspection of the whiteboard distribution chart', () => {
    let state = enterMlmOffice(world(), 0, -3.2);
    const balanceBefore = state.player.balance;
    const stressBefore = state.player.stress;
    const energyBefore = state.player.energy;

    state = reduceState(state, { type: 'interior_interact', interactionId: 'mlm-observe-board' });
    expect(state.player.balance).toBe(balanceBefore);
    expect(state.player.stress).toBe(stressBefore);
    expect(state.player.energy).toBe(energyBefore);
    expect(state.journal[state.journal.length - 1].text).toContain('未消耗时间或精力');
  });

  it('supports other protagonists (Sakiko, Emma, Renako) independently participating and earning', () => {
    let state = world();
    // Switch to Sakiko
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    expect(activeProtagonist(state)).toBe('sakiko');

    state = enterMlmOffice(state, -3.0, 0.8);
    const sakiBal = state.player.balance;
    const sakiStress = state.player.stress;

    state = reduceState(state, { type: 'interior_interact', interactionId: 'mlm-phone-sales' });
    expect(state.player.balance).toBe(sakiBal + 1600);
    expect(state.player.stress).toBe(Math.min(100, sakiStress + 25));
    expect(state.protagonists!.accounts.people.sakiko.cards.gpt).toBeGreaterThanOrEqual(1600);

    // Switch to Renako
    state = reduceState(state, { type: 'switch_protagonist', target: 'renako' });
    expect(activeProtagonist(state)).toBe('renako');

    state = enterMlmOffice(state, 0, 1.5);
    const renakoBal = state.player.balance;
    state = reduceState(state, { type: 'interior_interact', interactionId: 'mlm-attend-rally' });
    expect(state.player.balance).toBe(renakoBal + 600);
    expect(state.protagonists!.accounts.people.renako.cards.gpt).toBeGreaterThanOrEqual(600);
  });

  it('rejects interactions when energy is insufficient', () => {
    let state = enterMlmOffice(world(), -3.0, 0.8);
    state.player.energy = 5; // requires 12
    expect(() => reduceState(state, { type: 'interior_interact', interactionId: 'mlm-phone-sales' }))
      .toThrow('精力不足，请先休息。');
  });
});
