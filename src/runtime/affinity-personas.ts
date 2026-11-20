import book from '../worldbook/affinity-personas.json' with { type: 'json' };
import type { StoryGenerationOptions, WorldState } from '../frontend/types';
import { affinityTier, availablePromotion, contactRelationNote } from './affinity-tiers';
import { affinityLocationNotes } from './affinity-locations';
import { PROTAGONISTS } from './dual-protagonists';
import { getCampusInterior, INTERIOR_ENTRANCE_RANGE } from './campus-interiors';
import { residentById } from './npc-cast';
import { activeProtagonist, gameMinute, personState, protagonistNames } from './protagonist-world';
import { protagonistSceneId, type worldSceneContext } from './world-presence';

interface PersonaEntry {
  name: string;
  content: string;
  extensions: { affinityPersona: { characterId: string; tier: string; viewpoint?: string } };
}

const personaEntries: readonly PersonaEntry[] = book.entries;
const entriesByCharacter = new Map<string, PersonaEntry[]>();
for (const entry of personaEntries) {
  const content = entry.content.trim();
  if (!content || content === '【待补】') continue;
  const { characterId } = entry.extensions.affinityPersona;
  const entries = entriesByCharacter.get(characterId) ?? [];
  entries.push(entry);
  entriesByCharacter.set(characterId, entries);
}

function explicitlyNamed(input: string, name: string): boolean {
  const normalized = name.normalize('NFKC').trim().toLowerCase();
  if (normalized.length < 2) return false;
  if (/[^\x00-\x7f]/.test(normalized)) return input.includes(normalized);
  const literal = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9_-])${literal}(?:$|[^a-z0-9_-])`).test(input);
}

function outingActivity(state: WorldState, characterId: string) {
  if (characterId === 'bang-mutsumi' && state.interior?.roomId === 'residential-mutsumi'
    && state.interior.activityId === 'wakaba-tend-vines') return 'wakaba-gardening';
  if (characterId !== 'protagonist-sakiko' || !state.protagonists) return;
  const sakiko = personState(state, 'sakiko');
  const office = getCampusInterior('mlm-office')!;
  const inOffice = sakiko.interior?.roomId === office.id;
  const outside = !sakiko.interior && sakiko.locationId === office.parentLocationId && sakiko.scene
    && Math.hypot(sakiko.scene.x - office.entrance.x, sakiko.scene.z - office.entrance.z) <= INTERIOR_ENTRANCE_RANGE;
  if (!inOffice && !outside) return;
  // Only successful paid work writes these receipts into Sakiko's personal journal.
  const paid = office.interactions.filter(item => (item.balanceDelta ?? 0) > 0);
  const now = gameMinute(state);
  const recentWork = sakiko.journal.some(entry => {
    if (!paid.some(item => entry.text.startsWith(item.result))) return false;
    const stamp = /^entry-(\d+)-(\d+)-(\d+)-/.exec(entry.id);
    if (!stamp) return false;
    const elapsed = now - ((Number(stamp[1]) - 1) * 1440 + Number(stamp[2]) * 60 + Number(stamp[3]));
    return elapsed >= 0 && elapsed <= 60;
  });
  if (recentWork) return 'sakiko-office-work';
}

export function affinityPersonaPrompt(
  state: WorldState,
  scene: ReturnType<typeof worldSceneContext>,
  input: string,
  kind?: StoryGenerationOptions['kind'],
): string {
  if (kind && kind !== 'interaction_event') return '';

  const viewpoint = activeProtagonist(state);
  const now = gameMinute(state);
  const currentEvents = state.protagonists?.devices[viewpoint].calendar
    .filter(event => event.locationId === state.locationId && event.start <= now && now < event.start + event.duration)
    .map(event => event.title) ?? [];
  const presentContacts = new Set(scene?.nearbyPeople.filter(person => person.canTalk).map(person => person.contactId));
  const action = input.normalize('NFKC').toLowerCase();
  const selected = new Map<string, string>();
  const locationNotes = new Map<string, string>();
  const offers: string[] = [];
  for (const contact of state.contacts) {
    const personId = contact.sourcePersonId ?? contact.id;
    const protagonist = PROTAGONISTS.find(id => personId === protagonistSceneId(id) || contact.id === `protagonist-${id}`);
    if (protagonist === viewpoint) continue;
    const characterId = protagonist ? protagonistSceneId(protagonist) : personId;
    const nextTier = availablePromotion(contact.affinity);
    if (nextTier) offers.push(`${contact.name}（${contact.id}） ${affinityTier(contact.affinity).label} → ${nextTier.label}`);
    const entries = entriesByCharacter.get(characterId);
    if (!entries) continue;

    const inScene = presentContacts.has(contact.id);
    if (!inScene) {
      const canonicalName = protagonist ? protagonistNames[protagonist] : '';
      const aliases = residentById(characterId)?.aliases ?? [];
      const names = [contact.name, ...aliases, canonicalName, canonicalName.slice(2), protagonist ?? ''];
      if (selected.has(characterId) || !names.some(name => explicitlyNamed(action, name))) continue;
    }

    const tier = affinityTier(contact.affinity).id;
    if (inScene && scene) {
      const notes = affinityLocationNotes(characterId, tier, scene.areaId, state.clock.hour, scene.weather.id, currentEvents, state.clock, outingActivity(state, characterId));
      if (notes.length) locationNotes.set(characterId, [contact.name + '（' + contact.id + '）', ...notes].join('\n'));
    }
    const matching = entries.filter(entry => entry.extensions.affinityPersona.tier === tier);
    const entry = matching.find(row => row.extensions.affinityPersona.viewpoint === viewpoint)
      ?? matching.find(row => row.extensions.affinityPersona.viewpoint === undefined);
    if (entry) {
      const note = contactRelationNote(contact);
      selected.set(characterId, `${entry.name}（${characterId}）\n${entry.content.trim()}${note ? `\n已存关系：${note}` : ''}`);
    }
  }
  const sections = [];
  if (selected.size) sections.push(
    '\n【本轮好感分阶段人设】',
    `以下条目用于面对${protagonistNames[viewpoint]}时的称呼、语气和相处。人物身份、家庭关系、已存关系与真实经历优先。恋人称呼、亲密行为和共同经历只在世界书或存档已有相应前提、本轮场景与双方意愿也允许时采用。从知心档起可以主动追求、告白，无需玩家先开口；告白例句只供角色确实动心并选择开口时参考，平日仍按原有关系相处。告白后留给玩家接受、拒绝或暂缓，等候期间不催问，遭拒后依其性格相处。已交往者延续既有约定。学籍、现职和住址逐人参照当前档案。地点举例不能替代当前存档位置或确定现职，风堇在东京任职于街区全科诊所。举例不代表已经发生、在场或知情。正文省略分数与机制。`,
    ...selected.values(),
  );
  if (locationNotes.size) sections.push(
    '\n【当前地点的互动】',
    '以下只供本轮在场人物参考。按实际进行的活动、当下意愿和已发生的细节选择反应。日历中的活动仍须本轮实际参加。按这个人物当前的学籍、班次和到访缘由写校园、工作与私宅。提到、回忆、拒绝出游或仅到场时不结算好感。真实互动发生后，按文字所示方向和幅度使用既有 relationship 行动，同一件事只结算一次，赠礼走已有 gift。天色、物品、班次、家人或恋人身份仍以当前场景和存档为准。',
    ...locationNotes.values(),
  );
  if (offers.length) sections.push(
    '\n【当前主角可突破的关系】',
    ...offers,
    '以上联系人已在当前档上限。本轮若有符合人物性格、足以改变关系的具体进展，可在 world_actions 用 {"type":"promote_relationship","npcId":"上列联系人ID","reason":"具体进展"} 晋升一档；也可省略，留待以后。名单不表示在场，不必编造会面或告白。普通加分止于本档上限，扣分直接生效。',
  );
  return sections.join('\n\n');
}

export const CONFESSION_INSTRUCTION = '好感和交往各自记录。从知心档起，NPC 可以按自身意愿主动追求、告白。若本轮当面、通话或真实来信向玩家表明心意，用 {"type":"confession","npcId":"联系人ID","outcome":"pending","quote":"该角色对白或来信中的完整告白原话"} 记录。若玩家明确回答已收到的告白，outcome 用 dating 或 declined，quote 原样复制玩家本轮完整输入，依整段语义判断答复，不能截取否定句中的肯定字眼；推迟或沉默保留 pending。本轮文字若只续写、犹豫、提问、假设或转述，一律保留待答复。模拟或回忆中的告白不登记。家人、孩子及师生医患按实际关系演绎，工作上的关怀不能算告白；不能替玩家答应，也不能把其他主角的关系套到本视角。';
