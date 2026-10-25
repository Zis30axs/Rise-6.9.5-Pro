import { describe, expect, it } from 'vitest';
import { createInitialState, reduceState } from '../src/runtime/model';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { enableProtagonists, gameMinute, personState } from '../src/runtime/protagonist-world';
import { omniscientContinuityContext, omniscientNarratorInstructions } from '../src/runtime/protagonist-narrative';

describe('omniscient cross-view story continuity', () => {
  it('preserves Renako playing upstairs after changing to Emma without changing any saved state', () => {
    const initial = enableProtagonists(createInitialState());
    const room = getCampusInterior('amaori-family-home')!;
    const renako = personState(initial, 'renako');
    renako.locationId = room.id;
    renako.scene = { x: room.entrance.x, z: room.entrance.z, yaw: room.entrance.yaw,
      areaId: 'home', seed: renako.scene!.seed, encounterId: null };
    renako.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    renako.story.push({ id: 'renako-upstairs-user', role: 'user', text: '回二楼房间继续打游戏。' });
    renako.story.push({ id: 'renako-upstairs-assistant', role: 'assistant', text: '玲奈子在二楼打起了游戏，没听见楼下的动静。' });
    renako.journal.push({ id: 'renako-upstairs-journal', at: '第 1 天 17:20', text: '在二楼继续打游戏。' });
    const switched = reduceState(initial, { type: 'switch_protagonist', target: 'emma' });
    const before = JSON.stringify(switched);
    const world = omniscientContinuityContext(switched);
    expect(world).toHaveLength(3);
    const other = world.find(entry => entry.id === 'renako')!;
    expect(other.lastCommittedPosition.locationId).toBe('amaori-family-home');
    expect(other.lastCommittedPosition.interior?.roomId).toBe('amaori-family-home');
    expect(other.recentStory.at(-1)?.text).toContain('二楼打起了游戏');
    expect(other.recentJournal.at(-1)?.text).toContain('二楼');
    expect(other.pendingBackgroundAction).toBeNull();
    expect(JSON.stringify(switched)).toBe(before);
  });

  it('shows active background plans as pending rather than completed arrival', () => {
    const state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
    const at = gameMinute(state), life = state.protagonists!.backgroundLife!.people.renako;
    life.pending = { id: 'bg:renako:' + at + ':routine', kind: 'routine', start: at, due: at + 30,
      target: '', label: '在楼上玩游戏', origin: '', calendarKey: '', arrival: null, routeContext: null };
    const before = JSON.stringify(state);
    const renako = omniscientContinuityContext(state).find(entry => entry.id === 'renako')!;
    expect(renako.pendingBackgroundAction).toEqual({
      kind: 'routine', label: '在楼上玩游戏', startedAt: '第 1 天 17:20',
      completesAt: '第 1 天 17:50', plannedDestination: null,
    });
    expect(renako.recentBackgroundEvents).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps narrative omniscience distinct from each protagonist knowledge and scheduler authority', () => {
    const state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
    const rules = omniscientNarratorInstructions(state);
    expect(rules).toContain('甘织玲奈子');
    expect(rules).toContain('当前玩家操纵樱羽艾玛');
    expect(rules).toContain('pendingBackgroundAction');
    expect(rules).toContain('不得代为结算');
    expect(rules).toContain('二楼打游戏');
    expect(rules).toContain('不代表当前主角就知道');
  });
});
