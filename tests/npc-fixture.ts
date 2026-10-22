import type { GeneratedStory, WorldState } from '../src/frontend/types';
import { createInitialState, parseState, reduceState, commitStoryTurn } from '../src/runtime/model';
import { activeProtagonist } from '../src/runtime/protagonist-world';
import { getScenePeople, getSceneArea, sceneLocationId } from '../src/runtime/scene-context';
const reload = (s: WorldState) => parseState(JSON.parse(JSON.stringify(s)));
export function meeting(npcId = 'majo-emma', initial = createInitialState()) {
  const s = reload(initial);
  const seed = s.scene?.seed ?? 'npc-contact-tests';
  const scene = { x: 0, z: 18, yaw: 0, areaId: 'promenade', seed, encounterId: null };
  const person = getScenePeople(scene, [], s.clock).find(p => p.id === npcId)!;
  s.scene = { ...scene, x: person.x, z: person.z, areaId: getSceneArea(person.x, person.z)!.id };
  s.locationId = sceneLocationId(s.scene.areaId); s.interior = null;
  return reduceState(s, { type: 'encounter', personId: npcId });
}
export const contactQuote = '可以加个手机好友吗？以后有事方便联系。';
export function proposal(s = meeting(), kind: 'contact' | 'group' = 'contact', token = 'meet-1') {
  const npcId = s.scene!.encounterId!, name = getScenePeople(s.scene!, [], s.clock).find(p => p.id === npcId)!.name;
  const quote = kind === 'contact' ? contactQuote : '要不要加入我们的群聊，大家都在群里？';
  const result: GeneratedStory = { text: '|' + name + '|平静|' + quote + '|', phoneMessages: [],
    contactRequests: [{ kind, npcId, evidenceId: 'current', quote }] };
  const input = '|' + activeProtagonist(s) + '|平静|你好，很高兴认识你。|';
  const ids = { userId: token + '-user', assistantId: token + '-assistant' };
  return { state: commitStoryTurn(s, input, result, ids), result, input, ids };
}
export function accept(s: WorldState, token = 'accept-1') {
  const request = s.protagonists!.npcPhone!.requests.find(q => q.status === 'pending')!;
  return reduceState(s, { type: 'phone_app', owner: activeProtagonist(s), requestId: token,
    command: { type: 'resolve_contact_request', id: request.id, accept: true } });
}
export function sendNpc(s: WorldState, token = 'sms-1', npcId = 'majo-emma') {
  return reduceState(s, { type: 'phone_app', owner: activeProtagonist(s), requestId: token,
    command: { type: 'send_npc_message', npcId, text: '今天方便聊天吗？' } });
}
export function groupMember(s = accept(proposal().state), token = 'invite-1', acceptedToken = 'join-1') { return accept(proposal(s, 'group', token).state, acceptedToken); }

