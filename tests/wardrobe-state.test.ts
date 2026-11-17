import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, commitStoryTurn } from '../src/runtime/model';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { chooseLive2dOutfit } from '../src/runtime/live2d-wardrobe';
import { commitWardrobeUpdates, parseWardrobeState, seedWardrobe, validateWardrobeUpdates, wardrobeStoryContext } from '../src/runtime/wardrobe-state';
import type { Live2dPackStatus } from '../src/runtime/live2d-pack';
import { worldSceneContext } from '../src/runtime/world-presence';

const modelStatus: Live2dPackStatus = {
  installed: true, enabled: true, generation: 1, pack: 'wardrobe-test',
  models: [
    { id: 'look-school', person: 'soyo', label: '制服', description: '制服上衣与裙子', tags: ['school'], definitionSha: null, bundledSoyo: false },
    { id: 'look-casual', person: 'soyo', label: '便服', description: '薄毛衣与长裙', tags: ['casual'], definitionSha: null, bundledSoyo: false },
  ],
};
describe('wardrobe world state and narrative integration', () => {
  it('keeps old saves valid and accepts bounded clothing records', () => {
    expect(parseState(createInitialState()).wardrobe).toBeUndefined();
    expect(parseWardrobeState({ soyo: { category: 'casual', details: { top: '白色衬衫', underwear: '棉质贴身裤' } } })
      .soyo?.details?.underwear).toBe('棉质贴身裤');
    expect(() => parseWardrobeState({ nobody: { category: 'casual' } })).toThrow();
    expect(() => parseWardrobeState({ soyo: { details: { unknown: 'x' } } })).toThrow();
  });
  it('only allows in-scene narrative changes; does not let the LLM select asset paths', () => {
    const state = createInitialState();
    expect(validateWardrobeUpdates([{ person:'soyo', category:'casual', details:{ top:'米白色针织衫' } }], state))
      .toHaveLength(1);
    expect(() => validateWardrobeUpdates([{ person:'soyo', outfitId:'other' }], state)).toThrow();
    expect(() => validateWardrobeUpdates([{ person:'nyamu', category:'school' }], state)).toThrow();
  });
  it('preserves manual choices, keeps other details, and does not reinitialize them', () => {
    const state = createInitialState();
    state.wardrobe = { soyo:{ outfitId:'look-school', category:'school', details:{ hair:'棕色长发' } } };
    const seeded = seedWardrobe(state, { soyo:{ outfitId:'look-casual', category:'casual' } });
    expect(seeded.wardrobe?.soyo?.outfitId).toBe('look-school');
    const next = commitWardrobeUpdates(seeded, [{person:'soyo',category:'casual',details:{top:'米白色针织衫'}}], 'assistant:1');
    expect(next.wardrobe?.soyo?.outfitId).toBeUndefined();
    expect(next.wardrobe?.soyo?.details).toEqual({ hair:'棕色长发', top:'米白色针织衫' });
    expect(parseState(next).wardrobe?.soyo?.category).toBe('casual');
  });
  it('stabilizes a selected category against time and location reselection', () => {
    const state = createInitialState();
    state.wardrobe = { soyo: { category:'casual' } };
    const original = chooseLive2dOutfit('wardrobe-test-category',state,'soyo',modelStatus);
    expect(original?.outfit.id).toBe('look-casual');
    state.clock.hour = 23;
    state.clock.day = 12;
    const again = chooseLive2dOutfit('wardrobe-test-category',state,'soyo',modelStatus);
    expect(again?.outfit.id).toBe(original?.outfit.id);
  });
  it('parses the extra tagged block and saves it with the story', () => {
    const state = createInitialState();
    const reply = parseGeneratedStory(
      '<story>素世换上了米白色针织衫。</story><phone_messages>[]</phone_messages>' +
      '<wardrobe_updates>[{"person":"soyo","category":"casual","details":{"top":"米白色针织衫"}}]</wardrobe_updates>',
      state,
    );
    expect(reply.wardrobeUpdates?.[0]?.category).toBe('casual');
    const saved = commitStoryTurn(state, '换上便服', reply, { userId:'wardrobe-user:1', assistantId:'wardrobe-assistant:1' });
    expect(saved.wardrobe?.soyo?.details?.top).toBe('米白色针织衫');
    expect(saved.story.at(-1)?.role).toBe('assistant');
  });
  it('lets the model establish an in-scene static NPC outfit and reloads it by person ID', () => {
    const state = parseState({
      ...createInitialState(),
      locationId: 'margo-cafe-room',
      scene: { x: 48, z: 55.5, yaw: 0, areaId: 'street-cafe', seed: 'wardrobe-margo', encounterId: null },
      interior: { roomId: 'margo-cafe-room', x: 0, z: 3.8, yaw: 0, activityId: null, lastRest: null, lastStudy: null },
    });
    const nearby = worldSceneContext(state)!.nearbyPeople;
    expect(wardrobeStoryContext(state, nearby)).toContainEqual({ person: 'majo-margo', name: '宝生玛格' });
    const reply = parseGeneratedStory(
      '<story>玛格卷了卷墨绿色衬衫的袖子。</story><phone_messages>[]</phone_messages>' +
      '<wardrobe_updates>[{"person":"majo-margo","details":{"top":"墨绿色衬衫"}}]</wardrobe_updates>',
      state,
    );
    const saved = commitStoryTurn(state, '跟玛格打招呼', reply, { userId: 'margo-user:1', assistantId: 'margo-reply:1' });
    expect(parseState(saved).wardrobe?.['majo-margo']?.details?.top).toBe('墨绿色衬衫');
    expect(wardrobeStoryContext(saved, nearby)).toContainEqual({
      person: 'majo-margo', name: '宝生玛格', clothing: '上身：墨绿色衬衫',
    });
  });
});
