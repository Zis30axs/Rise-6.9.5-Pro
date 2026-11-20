import type { WorldState } from '../frontend/types';
import { affinityTier } from './affinity-tiers';
import { matchingLocationReactions } from './affinity-locations';
import { getStoreItem, INVENTORY_ITEM_LIMIT } from './convenience-store';
import { worldSceneContext } from './world-presence';

export function sceneGiftOffers(state: WorldState, scene = worldSceneContext(state)) {
  if (!scene) return [];
  return scene.nearbyPeople.flatMap(person => {
    if (!person.canTalk || !person.contactId) return [];
    const contact = state.contacts.find(row => row.id === person.contactId);
    if (!contact) return [];
    const npcId = contact.sourcePersonId ?? contact.id;
    const matches = matchingLocationReactions(npcId, affinityTier(contact.affinity).id, scene.areaId,
      state.clock.hour, scene.weather.id, [], state.clock);
    const ids = new Set(matches.flatMap(match => match.reactions.flatMap(reaction => reaction.giftItems ?? [])));
    return [...ids].flatMap(itemId => {
      const item = getStoreItem(itemId);
      const owned = state.inventory.find(row => row.itemId === itemId)?.quantity ?? 0;
      return item && owned < INVENTORY_ITEM_LIMIT ? [{ npcId, itemId, name: item.name, unit: item.useUnit }] : [];
    });
  });
}

export function sceneGiftInstruction(offers: ReturnType<typeof sceneGiftOffers>): string {
  const first = offers[0];
  if (!first) return '';
  const example = JSON.stringify({ type: 'receive_scene_gift', npcId: first.npcId, itemId: first.itemId });
  return `sceneGiftOffers 列出此刻在场人物可以递出的地点礼物。按人物意愿与对话决定是否送出。当面递交且主角收下时，在 <world_actions> 提交对应行动，例如 ${example}。每项按清单中的 npcId 和 itemId 入包一个单位。只是挑选、展示、提议、回忆或拒收时省略。若当场吃喝，同轮先收下再用 use 消耗那一份。已结算的交付无需再次提交。`;
}
