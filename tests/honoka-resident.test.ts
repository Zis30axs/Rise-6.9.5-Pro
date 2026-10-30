import { describe, expect, it } from 'vitest';
import { residentById, residentCast, residentGroupForNpc, residentPresence } from '../src/runtime/npc-cast';
import { housingForPerson } from '../src/runtime/majo-housing';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getInteriorPeople, getInteriorPeopleForValidation, getScenePeople } from '../src/runtime/scene-context';
import { emmaInitialFriendContacts } from '../src/runtime/initial-contacts';
import { initialNpcProfessions } from '../src/runtime/npc-professions';
import { majoArtStatus, majoExpressionFor } from '../src/frontend/majo-art';

describe('Kurobe Honoka as a new resident', () => {
  it('registers an adult university graduate separately from the original prisoners', () => {
    const honoka = residentById('majo-honoka')!;
    const nanoka = residentById('majo-nanoka')!;
    expect(honoka.name).toBe('黑部穗奈香');
    expect(honoka.aliases).toContain('黑部穗乃香');
    expect(honoka.profile).toContain('大学学业并毕业');
    expect(honoka.profile).toContain('不是十三名囚人之一');
    expect(nanoka.profile).toContain('黑部穗奈香');
    expect(residentCast).toHaveLength(15);
    expect(residentGroupForNpc(honoka.id)?.id).toBe('majo-circle');
    expect(residentGroupForNpc(honoka.id)?.memberIds).toHaveLength(15);
    expect(initialNpcProfessions().people[honoka.id]).toEqual({
      majorId: null, careerId: null, qualification: null, careerExperience: 0,
    });
  });

  it('puts both sisters in the same real accessible apartment and schedule, not two home markers', () => {
    const honoka = residentById('majo-honoka')!;
    const nanoka = residentById('majo-nanoka')!;
    const home = housingForPerson(honoka.id)!;
    expect(home.id).toBe('nanoka-honoka-home');
    expect(housingForPerson(nanoka.id)?.id).toBe(home.id);
    expect(honoka.home).toBe(home.interiorId);
    expect(nanoka.home).toBe(home.interiorId);
    expect(getCampusInterior(home.interiorId)?.parentLocationId).toBe('home');
    const expected = ['majo-honoka', 'majo-nanoka'];
    expect(getInteriorPeopleForValidation(home.interiorId).map(person => person.id).sort()).toEqual(expected);
    expect(getInteriorPeople(home.interiorId, [], { hour: 8, minute: 30 }).map(person => person.id).sort()).toEqual(expected);
    expect(residentPresence(honoka.id, { hour: 8, minute: 30 })?.locationId).toBe(home.interiorId);
    expect(residentPresence(nanoka.id, { hour: 8, minute: 30 })?.locationId).toBe(home.interiorId);
    expect(getInteriorPeople(home.interiorId, [], { hour: 16, minute: 0 })).toEqual([]);
    expect(residentPresence(honoka.id, { hour: 16, minute: 0 })?.anchorId).toBe('bookshop-west');
    expect(getScenePeople(
      { x: -25, z: 56, yaw: 0, areaId: 'bookshop', seed: 'honoka', encounterId: null },
      [], { hour: 16, minute: 0 },
    ).some(person => person.id === honoka.id)).toBe(true);
  });

  it('does not fabricate prior phone exchanges or a finished portrait', () => {
    expect(emmaInitialFriendContacts().map(person => person.id)).not.toContain('majo-honoka');
    expect(emmaInitialFriendContacts()).toHaveLength(13);
    expect(majoExpressionFor('majo-honoka', 'neutral')).toBeNull();
    expect(majoArtStatus.find(person => person.personId === 'majo-honoka')).toEqual(
      expect.objectContaining({ expressions: 0, complete: false }),
    );
  });
});
