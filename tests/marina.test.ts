import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getInteriorPeople } from '../src/runtime/scene-context';
import { marinaOnDuty, residentPresence } from '../src/runtime/npc-cast';
import { getLocationServiceQuote } from '../src/runtime/location-services';
import {
  isMarinaSpeaker, resolveMarinaExpressionPortrait,
} from '../src/frontend/marina-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';

describe('月岛麻里奈', () => {
  it('uses the corrected name and keeps a new acquaintance off the opening phone book', () => {
    expect(readFileSync('assets/circle-livehouse/circle-sandbox.json', 'utf8')).not.toContain('月之森真里');
    expect(readFileSync('assets/circle-livehouse/circle-sandbox.json', 'utf8')).toContain('月岛麻里奈');
    const state = enableProtagonists(createInitialState());
    for (const owner of ['soyo', 'sakiko', 'emma', 'renako'] as const) {
      expect(personState(state, owner).contacts.some(contact => contact.id === 'bang-marina')).toBe(false);
    }
  });

  it('works the CiRCLE counter, rests every seventh day, and helps RiNG on the fourth', () => {
    expect(residentPresence('bang-marina', { day: 1, hour: 17, minute: 20 })?.locationId).toBe('circle-cafe');
    expect(marinaOnDuty({ day: 1, hour: 17, minute: 20 })).toBe(true);
    expect(getInteriorPeople('circle-cafe', [], { day: 1, hour: 17, minute: 20 }).map(person => person.id)).toEqual(['bang-marina']);
    expect(getInteriorPeople('circle-cafe', [], { day: 1, hour: 8, minute: 0 })).toEqual([]);
    expect(residentPresence('bang-marina', { day: 7, hour: 17, minute: 0 })?.available).toBe(false);
    expect(marinaOnDuty({ day: 7, hour: 17, minute: 0 })).toBe(false);
    expect(residentPresence('bang-marina', { day: 4, hour: 16, minute: 0 })?.locationId).toBe('livehouse');
    expect(getInteriorPeople('livehouse', [], { day: 4, hour: 16, minute: 0 }).map(person => person.id)).toEqual(['bang-taki', 'bang-marina']);
    expect(getInteriorPeople('livehouse', [], { hour: 17, minute: 20 }).map(person => person.id)).toEqual(['bang-taki']);
  });

  it('shows the cut-out sprites for the four supplied moods', () => {
    expect(isMarinaSpeaker('月岛麻里奈')).toBe(true);
    expect(isMarinaSpeaker('麻里奈')).toBe(true);
    expect(isMarinaSpeaker('Marina')).toBe(true);
    expect(isMarinaSpeaker('bang-marina')).toBe(true);
    expect(isMarinaSpeaker('椎名立希')).toBe(false);
    const portrait = (emotion: 'neutral' | 'happy' | 'surprised' | 'relieved') => resolveMarinaExpressionPortrait('月岛麻里奈', emotion);
    for (const emotion of ['neutral', 'happy', 'surprised', 'relieved'] as const) {
      const art = portrait(emotion)!;
      expect(art.exact).toBe(true);
      expect(art.src.startsWith('data:image/webp;base64,')).toBe(true);
      expect(art.width).toBe(768);
      expect(art.height).toBe(1344);
      expect(art.personId).toBe('bang-marina');
    }
    expect(portrait('happy')!.src).not.toBe(portrait('neutral')!.src);
    expect(portrait('surprised')!.src).not.toBe(portrait('relieved')!.src);
    expect(resolveMarinaExpressionPortrait('月岛麻里奈', 'angry')?.exact).toBe(false);
    expect(resolveMarinaExpressionPortrait('月岛麻里奈', 'angry')?.src).toBe(portrait('neutral')!.src);
    expect(resolveSceneCharacterArt('月岛麻里奈', '开心')?.src).toBe(portrait('happy')!.src);
    expect(resolveMapCharacterAvatar({ name: '月岛麻里奈', personId: 'bang-marina' })).toEqual({
      kind: 'sprite', src: portrait('neutral')!.src,
    });
  });

  it('puts her duty into the CiRCLE ticket facts', () => {
    const state = createInitialState();
    state.locationId = 'circle';
    state.clock = { day: 1, hour: 17, minute: 20 };
    state.scene = { x: -310, z: -155, yaw: 0, areaId: 'circle', seed: 'marina', encounterId: null };
    state.player = { ...state.player, balance: 20000, energy: 100 };
    const open = getLocationServiceQuote(state, 'circle-watch-1800');
    expect(open.livehouse?.marinaOnDuty).toBe(true);
    expect(open.livehouse?.summary).toContain('月岛麻里奈正在店里当班');
    const rest = createInitialState();
    rest.locationId = 'circle-studio';
    rest.clock = { day: 7, hour: 17, minute: 20 };
    rest.scene = { x: -306, z: -153, yaw: 0, areaId: 'circle', seed: 'marina', encounterId: null };
    rest.interior = { roomId: 'circle-studio', x: 0, z: 2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
    rest.player = { ...state.player };
    const closedShift = getLocationServiceQuote(rest, 'circle-practice-1h');
    expect(closedShift.livehouse?.marinaOnDuty).toBe(false);
    expect(closedShift.livehouse?.summary).toContain('月岛麻里奈此刻不在店里当班');
  });
});