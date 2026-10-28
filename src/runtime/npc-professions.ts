import type { WorldState } from '../frontend/types';
import { getAcademicMajor } from './academics';
import { PROTAGONIST_PERSON_ID_LIST } from './dual-protagonists';
import { allResidentCast } from './npc-cast';

/** This shared NPC ledger is separate from the four protagonists' chosen academic majors. */
export interface NpcProfessionRecord {
  majorId: string | null;
  careerId: string | null;
  qualification: 'student' | 'trainee' | 'licensed' | null;
  careerExperience: number;
}
export interface NpcProfessions {
  version: 1;
  people: Record<string, NpcProfessionRecord>;
}
const SHERRY_ID = 'majo-sherry';
const controlled = new Set<string>(PROTAGONIST_PERSON_ID_LIST);
const npcResidents = allResidentCast.filter(resident => !controlled.has(resident.id));
const starter = (): NpcProfessions => ({
  version: 1,
  people: Object.fromEntries(npcResidents.map(person => [
    person.id,
    { majorId: person.majorId, careerId: person.careerId,
      qualification: person.qualification === 'trainee' ? 'trainee' : null,
      careerExperience: 0 },
  ])),
});

export function initialNpcProfessions(): NpcProfessions { return starter(); }

/** Missing records gain fresh unset slots; archived saves do not infer professions. */
export function parseNpcProfessions(value: unknown): NpcProfessions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NPC职业存档无效');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).sort().join(',') !== 'people,version' || raw.version !== 1 ||
    !raw.people || typeof raw.people !== 'object' || Array.isArray(raw.people))
    throw new Error('NPC职业存档无效：结构');
  const incoming = raw.people as Record<string, unknown>;
  const defaults = starter();
  const known = new Set(npcResidents.map(item => item.id));
  for (const [id, source] of Object.entries(incoming)) {
    if (!known.has(id) || !source || typeof source !== 'object' || Array.isArray(source))
      throw new Error('NPC职业存档无效：人物');
    const person = source as Record<string, unknown>;
    if (Object.keys(person).sort().join(',') !== 'careerExperience,careerId,majorId,qualification')
      throw new Error('NPC职业存档无效：字段');
    const majorId = person.majorId;
    const careerId = person.careerId;
    const qualification = person.qualification;
    const careerExperience = person.careerExperience;
    if (majorId !== null && (typeof majorId !== 'string' || !getAcademicMajor(majorId)))
      throw new Error('NPC职业存档无效：专业');
    if (careerId !== null && (typeof careerId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(careerId)))
      throw new Error('NPC职业存档无效：职业');
    if (qualification !== null && qualification !== 'student' && qualification !== 'trainee' && qualification !== 'licensed')
      throw new Error('NPC职业存档无效：资格');
    if (typeof careerExperience !== 'number' || !Number.isSafeInteger(careerExperience) ||
      careerExperience < 0 || careerExperience > 10_000_000) throw new Error('NPC职业存档无效：经验');
    defaults.people[id] = {
      majorId: majorId as string | null, careerId: careerId as string | null,
      qualification: qualification as NpcProfessionRecord['qualification'],
      careerExperience,
    };
  }
  // Sherry's law specialization is a user-confirmed fixed character decision.
  const fixed = starter().people[SHERRY_ID]!;
  const assigned = defaults.people[SHERRY_ID];
  if (!assigned || assigned.majorId !== fixed.majorId ||
    assigned.careerId !== fixed.careerId || assigned.qualification !== fixed.qualification)
    throw new Error('橘雪莉的法律专业与律师职业不能更改');
  return defaults;
}

export function npcProfession(state: Pick<WorldState, 'npcProfessions'>, personId: string): NpcProfessionRecord | null {
  return state.npcProfessions?.people[personId] ?? starter().people[personId] ?? null;
}
