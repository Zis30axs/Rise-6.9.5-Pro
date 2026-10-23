import { describe, expect, it } from 'vitest';
import type { WorldAction, WorldState } from '../src/frontend/types';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';
import { INVENTORY_ITEM_LIMIT } from '../src/runtime/convenience-store';
import { canCheckInteractionEvent, recordInteractionEventCheck } from '../src/runtime/interaction-event-rate';
import {
  applyMargoCafeGift, dismissMargoCafeOffer, getMargoCafeOffer, parseMargoCafeState, stageMargoCafeOffer,
} from '../src/runtime/margo-cafe';
import { MARGO_CAFE_ROOM_ID } from '../src/runtime/margo-cafe-venue';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';

const visit = { type: 'enter_interior', roomId: MARGO_CAFE_ROOM_ID } as const;
const wait = { type: 'wait', minutes: 1 } as const;

function cafe(hour = 15, minute = 30, owner: ProtagonistId = 'soyo'): WorldState {
  let state = reduceState(createInitialState(), { type: 'novel_travel', locationId: MARGO_CAFE_ROOM_ID });
  state.clock = { day: 3, hour, minute };
  const presence = { locationId: state.locationId, scene: structuredClone(state.scene), interior: structuredClone(state.interior) };
  state = enableProtagonists(state);
  if (owner !== 'soyo') state = { ...reduceState(state, { type: 'switch_protagonist', target: owner }), ...presence };
  return parseState(state);
}

function prepared(state = cafe(), action: WorldAction = visit) {
  const checked = recordInteractionEventCheck(state, action, true);
  const offer = getMargoCafeOffer(checked, action)!;
  expect(offer).not.toBeNull();
  return { checked, offer, state: stageMargoCafeOffer(checked, offer) };
}

function findGiver(giverId: string, owner: ProtagonistId = 'soyo') {
  for (let hour = 14; hour < 20; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const state = recordInteractionEventCheck(cafe(hour, minute, owner), visit, true);
      const offer = getMargoCafeOffer(state, visit);
      if (offer?.giverId === giverId) return { state: stageMargoCafeOffer(state, offer), offer };
    }
  }
  throw new Error(`No offer for ${giverId}`);
}

describe('Margo cafe controlled daily gifts', () => {
  it('requires an offered shared cooldown check and an open cafe interior', () => {
    const state = cafe();
    expect(getMargoCafeOffer(state, visit)).toBeNull();
    const missed = recordInteractionEventCheck(state, visit, false);
    expect(getMargoCafeOffer(missed, visit)).toBeNull();
    expect(canCheckInteractionEvent(missed, wait)).toBe(false);
    const closed = cafe(2, 0);
    expect(getMargoCafeOffer(recordInteractionEventCheck(closed, visit, true), visit)).toBeNull();
    const outside = reduceState(state, { type: 'leave_interior' });
    expect(getMargoCafeOffer(recordInteractionEventCheck(outside, wait, true), wait)).toBeNull();
    const openAfterMidnight = prepared(cafe(1, 59));
    expect(openAfterMidnight.offer.giverId).toBe('majo-margo');
  });

  it('uses one stable personality-specific authored gift with no model-supplied item or quantity', () => {
    const expectedItems: Record<string, string> = {
      'majo-margo': 'takeaway-eat-dessert', 'majo-emma': 'takeaway-eat-dessert',
      'majo-hiro': 'takeaway-drink-tea', 'majo-anan': 'takeaway-eat-dessert', 'majo-noa': 'takeaway-drink-latte',
    };
    const texts = new Set<string>();
    for (const giverId of Object.keys(expectedItems)) {
      const { state, offer } = findGiver(giverId);
      texts.add(offer.text);
      expect(offer.itemId).toBe(expectedItems[giverId]);
      expect(getMargoCafeOffer(state, visit)).toEqual(offer);
      const result = reduceState(state, { type: 'receive_cafe_gift', offerId: offer.id });
      expect(result.inventory.find(row => row.itemId === offer.itemId)?.quantity).toBe(1);
      expect(result.player).toEqual(state.player);
      expect(result.clock).toEqual(state.clock);
      expect(result.contacts).toEqual(state.contacts);
      expect(result.story.at(-1)).toMatchObject({ id: offer.id, role: 'assistant', text: offer.text, participantIds: [giverId] });
      expect(result.journal.at(-1)?.text).toContain('已放入背包');
      expect(result.margoCafeDaily?.pending).toBeUndefined();
    }
    expect(texts.size).toBe(5);
  });

  it('makes acceptance idempotent through saved reloads and limits a protagonist to one gift per day', () => {
    const { state, offer } = prepared();
    const result = reduceState(state, { type: 'receive_cafe_gift', offerId: offer.id });
    const saved = parseState(JSON.parse(JSON.stringify(result)));
    expect(applyMargoCafeGift(saved, offer.id)).toEqual(saved);
    expect(saved.margoCafeDaily?.receipts).toHaveLength(1);
    let later = reduceState(saved, { type: 'leave_interior' });
    later = reduceState(later, { type: 'novel_travel', locationId: MARGO_CAFE_ROOM_ID });
    later.clock = { ...later.clock, hour: 20, minute: 0 };
    expect(canCheckInteractionEvent(later, wait)).toBe(true);
    const secondCheck = recordInteractionEventCheck(later, wait, true);
    expect(getMargoCafeOffer(secondCheck, wait)).toBeNull();
    expect(secondCheck.inventory).toEqual(saved.inventory);
    const tomorrow = { ...saved, clock: { day: 4, hour: 15, minute: 30 } };
    expect(getMargoCafeOffer(recordInteractionEventCheck(tomorrow, visit, true), visit)).not.toBeNull();
  });

  it('clears declined tokens while preserving the cooldown and prompt count', () => {
    const { state, offer } = prepared();
    const declined = parseState(dismissMargoCafeOffer(state));
    expect(declined.inventory).toEqual(state.inventory);
    expect(declined.margoCafeDaily?.pending).toBeUndefined();
    expect(canCheckInteractionEvent(declined, wait)).toBe(false);
    expect(declined.interactionEventRate?.checks.at(-1)?.offered).toBe(true);
    expect(() => applyMargoCafeGift(declined, offer.id)).toThrow('选择已失效');
  });

  it('cannot use a gift to bypass the shared daily prompt or per-location arrival limits', () => {
    const { state, offer } = prepared();
    const declined = dismissMargoCafeOffer(state);
    const later = { ...declined, clock: { day: 3, hour: 19, minute: 0 } };
    expect(canCheckInteractionEvent(later, visit)).toBe(false);
    expect(canCheckInteractionEvent(later, wait)).toBe(true);
    const second = recordInteractionEventCheck(later, wait, true);
    expect(getMargoCafeOffer(second, wait)).not.toBeNull();
    const evening = { ...second, clock: { day: 3, hour: 23, minute: 0 } };
    expect(canCheckInteractionEvent(evening, wait)).toBe(false);
    expect(() => applyMargoCafeGift(evening, offer.id)).toThrow('选择已失效');
  });

  it('rejects stale, forged, full-inventory and switched-protagonist claims without mutating input', () => {
    const { state, offer } = prepared();
    const original = structuredClone(state);
    expect(() => applyMargoCafeGift(state, `${offer.id}:forged`)).toThrow('选择已失效');
    expect(state).toEqual(original);
    const full = structuredClone(state);
    full.inventory = [{ itemId: offer.itemId, quantity: INVENTORY_ITEM_LIMIT }];
    expect(() => applyMargoCafeGift(full, offer.id)).toThrow();
    const expired = { ...state, clock: { ...state.clock, minute: state.clock.minute + 1 } };
    expect(() => applyMargoCafeGift(expired, offer.id)).toThrow('选择已失效');
    const wrongOwner = structuredClone(state);
    wrongOwner.protagonists!.accounts.active = 'sakiko';
    expect(() => applyMargoCafeGift(wrongOwner, offer.id)).toThrow('选择已失效');
    const wrongItem = structuredClone(state);
    wrongItem.margoCafeDaily!.pending!.itemId = 'meal-premium';
    expect(() => applyMargoCafeGift(wrongItem, offer.id)).toThrow();
    expect(state).toEqual(original);
  });

  it('does not trigger for protagonist switches, phone or contact editing', () => {
    const { checked } = prepared();
    expect(getMargoCafeOffer(checked, { type: 'switch_protagonist', target: 'emma' })).toBeNull();
    expect(getMargoCafeOffer(checked, { type: 'read_phone', id: 'anything' })).toBeNull();
    expect(getMargoCafeOffer(checked, { type: 'phone_app', requestId: 'anything', owner: 'soyo', command: { type: 'inspect', section: 'messages' } })).toBeNull();
  });

  it('preserves separate inventories and daily receipts when switching protagonists and returning', () => {
    const first = prepared();
    const soyo = reduceState(first.state, { type: 'receive_cafe_gift', offerId: first.offer.id });
    let sakiko = reduceState(soyo, { type: 'switch_protagonist', target: 'sakiko' });
    sakiko = reduceState(sakiko, { type: 'novel_travel', locationId: MARGO_CAFE_ROOM_ID });
    const second = prepared(sakiko);
    sakiko = reduceState(second.state, { type: 'receive_cafe_gift', offerId: second.offer.id });
    expect(sakiko.margoCafeDaily?.receipts.map(row => row.owner)).toEqual(['soyo', 'sakiko']);
    expect(sakiko.inventory).toEqual([{ itemId: second.offer.itemId, quantity: 1 }]);
    const restored = parseState(reduceState(sakiko, { type: 'switch_protagonist', target: 'soyo' }));
    expect(restored.inventory).toEqual(soyo.inventory);
    expect(restored.margoCafeDaily?.receipts).toHaveLength(2);
    expect(getMargoCafeOffer(restored, wait)).toBeNull();
    expect(canCheckInteractionEvent(restored, wait)).toBe(false);
  });

  it('keeps Emma out of her own NPC gifts and uses only her established relationship with Hiro', () => {
    const hiro = findGiver('majo-hiro', 'emma');
    expect(hiro.offer.text).toContain('艾玛');
    const stranger = findGiver('majo-hiro', 'soyo');
    expect(stranger.offer.text).not.toContain('艾玛');
    for (let minute = 0; minute < 60; minute++) {
      const state = recordInteractionEventCheck(cafe(15, minute, 'emma'), visit, true);
      expect(getMargoCafeOffer(state, visit)?.giverId).not.toBe('majo-emma');
    }
    expect(findGiver('majo-anan').offer.text).toContain('速写本');
    expect(findGiver('majo-anan').offer.text).toContain('吾辈');
    expect(findGiver('majo-anan', 'emma').offer.text).toContain('给艾玛');
    const emma = prepared(cafe(15, 30, 'emma'));
    const savedEmma = parseState(reduceState(emma.state, { type: 'receive_cafe_gift', offerId: emma.offer.id }));
    expect(savedEmma.margoCafeDaily?.receipts[0]?.owner).toBe('emma');
    expect(savedEmma.inventory).toEqual([{ itemId: emma.offer.itemId, quantity: 1 }]);
  });

  it('does not read story secrets, private phone content or another protagonist diary when choosing gifts', () => {
    const { checked, offer } = prepared();
    const privateState = structuredClone(checked);
    const secret = '绝不能进入咖啡馆对白的私人秘密';
    privateState.story.push({ id: 'private-story', role: 'user', text: secret });
    privateState.journal.push({ id: 'private-journal', text: secret, at: '第 3 天 15:30' });
    privateState.phone = privateState.phone.map(row => ({ ...row, text: secret }));
    privateState.protagonists!.inactive.journal.push({ id: 'other-private-diary', text: secret, at: '第 3 天 15:30' });
    privateState.protagonists!.conversations = [{ id: 'private-conversation', from: 'sakiko', to: 'emma', at: 1000, text: secret, replyTo: null, expectsReply: false }];
    expect(getMargoCafeOffer(privateState, visit)).toEqual(offer);
    expect(offer.text).not.toContain(secret);
    expect(offer.text).not.toMatch(/死亡回溯|バルーン|魔女杀手|私聊|日记/);
  });

  it('strictly parses bounded receipts while preserving old saves without cafe data', () => {
    expect(parseState(createInitialState()).margoCafeDaily).toBeUndefined();
    const { state, offer } = prepared();
    expect(parseState(state).margoCafeDaily?.pending?.id).toBe(offer.id);
    const saved = applyMargoCafeGift(state, offer.id);
    expect(parseMargoCafeState(saved.margoCafeDaily, saved.clock)).toEqual(saved.margoCafeDaily);
    const unknown = structuredClone(saved.margoCafeDaily!);
    (unknown.receipts[0] as unknown as Record<string, unknown>).quantity = 20;
    expect(() => parseMargoCafeState(unknown, saved.clock)).toThrow('margoCafeDaily');
    const duplicate = structuredClone(saved.margoCafeDaily!);
    duplicate.receipts.push({ ...duplicate.receipts[0]! });
    expect(() => parseMargoCafeState(duplicate, saved.clock)).toThrow('margoCafeDaily');
    const future = structuredClone(saved.margoCafeDaily!);
    future.receipts[0]!.at += 1440;
    expect(() => parseMargoCafeState(future, saved.clock)).toThrow('margoCafeDaily');
  });
});
