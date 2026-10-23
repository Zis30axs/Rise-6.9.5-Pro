import { describe, expect, it } from 'vitest';
import type { StoryAction, WorldState } from '../src/frontend/types';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { recordInteractionEventCheck } from '../src/runtime/interaction-event-rate';
import { getMargoCafeOffer, stageMargoCafeOffer } from '../src/runtime/margo-cafe';
import { MARGO_CAFE_ROOM_ID } from '../src/runtime/margo-cafe-venue';
import { applyStoryActions, commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { contactProposalContext } from '../src/runtime/npc-phone';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getSceneContext, getScenePeople, hiddenProtagonistPersons } from '../src/runtime/scene-context';
import { parseGeneratedStory } from '../src/runtime/story-protocol';

const room = getCampusInterior(MARGO_CAFE_ROOM_ID)!;
const reload = (state: WorldState) => parseState(JSON.parse(JSON.stringify(state)));

function exterior(hour = 16, minute = 30): WorldState {
  const state = createInitialState();
  state.clock = { day: 1, hour, minute };
  return reduceState(state, { type: 'walk', ...room.entrance, seed: 'margo-cafe-model' });
}

function entered(hour = 16, minute = 30): WorldState {
  return reduceState(exterior(hour, minute), { type: 'enter_interior', roomId: room.id });
}

describe('Margo cafe controlled world actions', () => {
  it.each([
    { hour: 9, minute: 59, open: false },
    { hour: 10, minute: 0, open: true },
    { hour: 1, minute: 59, open: true },
    { hour: 2, minute: 0, open: false },
  ])('enforces the actual entrance at $hour:$minute (open=$open)', ({ hour, minute, open }) => {
    const before = exterior(hour, minute);
    const snapshot = structuredClone(before);
    const enter = () => reduceState(before, { type: 'enter_interior', roomId: room.id });
    if (open) expect(enter().interior?.roomId).toBe(room.id);
    else expect(enter).toThrow(/打烊/);
    expect(before).toEqual(snapshot);
  });

  it('requires the cafe entrance and a real, nearby indoor person before recording a meeting', () => {
    expect(() => reduceState(createInitialState(), { type: 'enter_interior', roomId: room.id })).toThrow(/入口附近/);
    const inside = entered();
    const unknown = { type: 'encounter', personId: 'majo-yuki' } as const;
    expect(() => reduceState(inside, unknown)).toThrow(/不属于当前场景/);
    const far = reduceState(inside, { type: 'interior_walk', x: 5, z: 4.4, yaw: 0 });
    expect(() => reduceState(far, { type: 'encounter', personId: 'majo-emma' })).toThrow(/附近/);
    const near = reduceState(inside, { type: 'interior_walk', x: -3, z: 0, yaw: 0 });
    const met = reduceState(near, { type: 'encounter', personId: 'majo-emma' });
    expect(met.scene?.encounterId).toBe('majo-emma');
    expect(met.protagonists?.npcPhone?.meetings).toEqual([
      expect.objectContaining({ owner: 'soyo', npcId: 'majo-emma', locationId: room.id }),
    ]);
    expect(met.contacts).toEqual(inside.contacts);
    expect(reload(met)).toEqual(met);
    expect(() => parseState({ ...near, scene: { ...near.scene, encounterId: 'majo-yuki' } })).toThrow(/encounterId/);
    expect(() => parseState({ ...far, scene: { ...far.scene, encounterId: 'majo-emma' } })).toThrow(/encounterId/);
    const shopkeeper = reduceState(near, { type: 'encounter', personId: 'majo-margo' });
    const conversation = commitStoryTurn(shopkeeper, '向柜台问好。', {
      text: '玛格放下杯子，抬头回应。', phoneMessages: [],
    }, { userId: 'margo-present-user', assistantId: 'margo-present-assistant' });
    expect(conversation.story.find(row => row.id === 'margo-present-user')?.participantIds).toContain('majo-margo');
    expect(conversation.story.find(row => row.id === 'margo-present-assistant')?.participantIds).toContain('majo-margo');
  });

  it('keeps an inactive saved conversation parseable after the guest has left, without renewing its authority', () => {
    const met = reduceState(enableProtagonists(entered(16, 50)), { type: 'encounter', personId: 'majo-emma' });
    let other = reduceState(met, { type: 'switch_protagonist', target: 'sakiko' });
    other = reduceState(other, { type: 'wait', minutes: 11 });
    expect(other.clock).toEqual({ day: 1, hour: 17, minute: 1 });
    // A saved inactive pose can retain a conversation while its NPC's routine moves on.
    // Restore that pose if autonomous background travel has already moved this actor.
    Object.assign(personState(other, 'soyo'), {
      locationId: met.locationId, scene: structuredClone(met.scene), interior: structuredClone(met.interior),
    });
    const restored = reload(other);
    expect(personState(restored, 'soyo').scene?.encounterId).toBe('majo-emma');
    const returned = reduceState(restored, { type: 'switch_protagonist', target: 'soyo' });
    const context = getSceneContext(returned.scene, returned.interior, returned.contacts, returned.clock, hiddenProtagonistPersons(returned));
    expect(context?.encounter).toBeNull();
    expect(contactProposalContext(returned)).toBeNull();
    expect(() => reduceState(returned, { type: 'encounter', personId: 'majo-emma' })).toThrow(/不属于当前场景/);
    const monologue = commitStoryTurn(returned, '看看窗外。', {
      text: '我安静地看着窗外的街道。', phoneMessages: [],
    }, { userId: 'stale-cafe-user', assistantId: 'stale-cafe-assistant' });
    for (const entry of monologue.story.filter(row => ['stale-cafe-user', 'stale-cafe-assistant'].includes(row.id))) {
      expect(entry.participantIds ?? []).not.toContain('majo-emma');
    }
    const advanced = reduceState(returned, { type: 'wait', minutes: 1 });
    expect(advanced.scene?.encounterId).toBeNull();
    expect(reload(advanced)).toEqual(advanced);
  });

  it.each(['1.11.0', '1.13.0'] as const)('loads an older %s room save with an outdoor encounter without moving that pedestrian indoors', version => {
    const library = getCampusInterior('study-room')!;
    const outside = reduceState(createInitialState(), { type: 'walk', ...library.entrance, seed: 'legacy-library-encounter' });
    const passerby = getScenePeople(outside.scene!).find(person => person.id.startsWith('ped-') &&
      Math.hypot(person.x - outside.scene!.x, person.z - outside.scene!.z) <= 7)!;
    expect(passerby).toBeDefined();
    let old = reduceState(outside, { type: 'enter_interior', roomId: library.id });
    // Historical enter_interior retained this outdoor marker in its saved scene.
    old.scene!.encounterId = passerby.id;
    if (version === '1.13.0') old = enableProtagonists(old);
    expect(old.schema_version).toBe(version);
    const restored = reload(old);
    expect(restored.scene?.encounterId).toBe(passerby.id);
    const live = getSceneContext(restored.scene, restored.interior, restored.contacts, restored.clock, hiddenProtagonistPersons(restored));
    expect(live?.nearbyPeople).toEqual([]);
    expect(live?.encounter).toBeNull();
    expect(contactProposalContext(restored)).toBeNull();
    expect(() => reduceState(restored, { type: 'encounter', personId: passerby.id })).toThrow(/不属于当前场景/);
    const outsideAgain = reduceState(restored, { type: 'leave_interior' });
    expect(outsideAgain.locationId).toBe('library');
    expect(outsideAgain.scene?.encounterId).toBeNull();
  });

  it('clears a conversation when a novel facility approach moves beyond its indoor speaker', () => {
    const near = reduceState(entered(16, 30), { type: 'interior_walk', x: -3, z: 2, yaw: 0 });
    const met = reduceState(near, { type: 'encounter', personId: 'majo-anan' });
    expect(met.scene?.encounterId).toBe('majo-anan');
    const approached = reduceState(met, { type: 'novel_approach', interactionId: 'margo-cafe-cup-display' });
    expect(approached.interior).toMatchObject({ x: 3.3, z: -1.6 });
    expect(approached.scene?.encounterId).toBeNull();
    expect(approached.clock).toEqual(met.clock);
    expect(approached.inventory).toEqual(met.inventory);
    expect(contactProposalContext(approached)).toBeNull();
    expect(reload(approached)).toEqual(approached);
  });

  it('rejects activities and service orders that cross 02:00, yet lets an occupant leave after closing', () => {
    const inside = entered(1, 50);
    const seat = reduceState(inside, { type: 'interior_walk', x: -3.2, z: 1, yaw: 0 });
    const snapshot = structuredClone(seat);
    expect(() => reduceState(seat, { type: 'interior_interact', interactionId: 'margo-cafe-window-seat' })).toThrow(/打烊/);
    expect(() => reduceState(seat, { type: 'location_service', serviceId: 'drink-latte' })).toThrow(/打烊/);
    expect(seat).toEqual(snapshot);
    // Existing service rules allow a ten-minute order to finish exactly at closing.
    const closed = reduceState(seat, { type: 'location_service', serviceId: 'drink-tea' });
    expect(closed.clock).toEqual({ day: 1, hour: 2, minute: 0 });
    expect(() => reduceState(closed, { type: 'location_service', serviceId: 'drink-tea' })).toThrow(/休息中/);
    expect(() => reduceState(closed, { type: 'interior_interact', interactionId: 'margo-cafe-menu' })).toThrow(/打烊/);
    expect(() => reduceState(closed, { type: 'encounter', personId: 'majo-margo' })).toThrow(/不属于当前场景/);
    const outside = reduceState(reload(closed), { type: 'leave_interior' });
    expect(outside.interior).toBeNull();
    expect(outside.locationId).toBe('street-cafe');
    expect(outside.scene?.encounterId).toBeNull();
    expect(outside.clock).toEqual(closed.clock);
    expect(() => reduceState(outside, { type: 'enter_interior', roomId: room.id })).toThrow(/打烊/);
  });

  it('never accepts the internal gift action through story actions or model world_actions', () => {
    const checked = recordInteractionEventCheck(entered(), { type: 'wait', minutes: 1 }, true);
    const offer = getMargoCafeOffer(checked, { type: 'wait', minutes: 1 });
    expect(offer).not.toBeNull();
    const pending = stageMargoCafeOffer(checked, offer!);
    const forged = { type: 'receive_cafe_gift', offerId: offer!.id };
    const snapshot = structuredClone(pending);
    expect(() => applyStoryActions(pending, [forged as unknown as StoryAction])).toThrow();
    expect(() => commitStoryTurn(pending, '领取赠礼', {
      text: '递来一份甜点。', phoneMessages: [], worldActions: [forged as unknown as StoryAction],
    }, { userId: 'forged-gift-user', assistantId: 'forged-gift-assistant' })).toThrow();
    expect(() => parseGeneratedStory(JSON.stringify({ story: '递来一份甜点。', phone_messages: [], world_actions: [forged] }), pending)).toThrow();
    expect(() => parseGeneratedStory(`<story>递来一份甜点。</story><phone_messages>[]</phone_messages><world_actions>${JSON.stringify([forged])}</world_actions>`, pending)).toThrow();
    expect(pending).toEqual(snapshot);
  });
});
