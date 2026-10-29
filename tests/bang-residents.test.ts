import { describe, expect, it } from 'vitest';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getInteriorPeople, getScenePeople } from '../src/runtime/scene-context';
import {
  allResidentCast, AVE_MUJICA_MEMBER_IDS, bangResidentCast, MYGO_MEMBER_IDS,
  residentGroupForNpc, residentPresence,
} from '../src/runtime/npc-cast';
import { majoExpressionFor } from '../src/frontend/majo-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { characterForPerson } from '../src/frontend/character-appearance';

const bandIds = [...MYGO_MEMBER_IDS, ...AVE_MUJICA_MEMBER_IDS];

describe('band residents', () => {
  it('registers the eight canon members without making Soyo or Sakiko residents', () => {
    expect(bangResidentCast.map(person => person.id)).toEqual(bandIds);
    expect(allResidentCast.filter(person => person.id.startsWith('bang-')).map(person => person.id)).toEqual(bandIds);
    expect(bangResidentCast.every(person => person.majorId === null && person.careerId === null)).toBe(true);
    expect(allResidentCast.some(person => person.id === 'soyo' || person.id === 'sakiko')).toBe(false);
  });

  it('seeds only the relationships the worldbook already states', () => {
    const state = enableProtagonists(createInitialState());
    expect(personState(state, 'soyo').contacts.map(contact => contact.id)).toEqual([
      'protagonist-sakiko', 'bang-tomori', 'bang-anon', 'bang-taki', 'bang-rana', 'bang-mutsumi',
    ]);
    expect(personState(state, 'sakiko').contacts.map(contact => contact.id)).toEqual([
      'protagonist-soyo', 'bang-mutsumi', 'bang-uika', 'bang-umiri', 'bang-nyamu',
    ]);
    for (const owner of ['emma', 'renako'] as const) {
      expect(personState(state, owner).contacts.some(contact => contact.id.startsWith('bang-'))).toBe(false);
    }
  });

  it('places Taki at the live house during her shift and the others on authored anchors', () => {
    expect(residentPresence('bang-taki', { hour: 17, minute: 20 })?.locationId).toBe('livehouse');
    expect(getInteriorPeople('livehouse', [], { hour: 17, minute: 20 }).map(person => person.id)).toEqual(['bang-taki']);
    expect(getInteriorPeople('livehouse', [], { hour: 12, minute: 0 })).toEqual([]);
    expect(residentPresence('bang-taki', { hour: 15, minute: 0 })?.anchorId).toBe('bus-west');
    const outside = getScenePeople(
      { x: 40, z: 80, yaw: 0, areaId: 'pocket-park', seed: 'band', encounterId: null },
      [], { hour: 17, minute: 20 },
    );
    expect(outside.some(person => person.id === 'bang-tomori')).toBe(true);
    expect(outside.some(person => person.id === 'bang-taki')).toBe(false);
  });

  it('uses the existing group invite path and the generic portrait fallback', () => {
    expect(residentGroupForNpc('bang-tomori')?.id).toBe('mygo-band');
    expect(residentGroupForNpc('bang-nyamu')?.id).toBe('ave-mujica');
    expect(residentGroupForNpc('majo-hiro')?.id).toBe('majo-circle');
    expect(majoExpressionFor('bang-tomori', 'neutral')).toBeNull();
    const portraitId = characterForPerson('bang-tomori');
    expect(resolveMapCharacterAvatar({ name: '高松灯', personId: 'bang-tomori', portraitId })?.kind).toBe('atlas');
  });

  it('still lets a new game reduce without treating bandmates as strangers on Soyo phone', () => {
    const state = reduceState(enableProtagonists(createInitialState()), {
      type: 'phone_app', owner: 'soyo', requestId: 'band-hello',
      command: { type: 'send_npc_message', npcId: 'bang-tomori', text: '灯，今晚还排练吗？' },
    });
    expect(state.protagonists?.npcPhone?.messages[0]).toEqual(expect.objectContaining({
      owner: 'soyo', targetId: 'bang-tomori', channel: 'npc',
    }));
  });
});
