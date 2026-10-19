import { describe, expect, it } from 'vitest';
import { acknowledgePhoneRead, createInitialState, reduceState } from '../src/runtime/model';
import { hasInteractionEffect, isGameplayInteraction, mergeInteractionReceipts } from '../src/frontend/interaction-controller';

describe('interaction transaction helpers', () => {
  it('merges newer phone reads without replacing prepared activity changes', () => {
    const original = createInitialState();
    const prepared = reduceState(original, { type: 'wait', minutes: 30 });
    const latest = acknowledgePhoneRead(original, [original.phone[0].id]);
    const merged = mergeInteractionReceipts(prepared, original, latest);
    expect(merged.clock).toEqual(prepared.clock);
    expect(merged.player).toEqual(prepared.player);
    expect(merged.phone[0].read).toBe(true);
    expect(original.phone[0].read).toBe(false);
  });
  it('rejects any unrelated world changes instead of overwriting them', () => {
    const original = createInitialState();
    const prepared = reduceState(original, { type: 'wait', minutes: 30 });
    const latest = reduceState(original, { type: 'wait', minutes: 15 });
    expect(() => mergeInteractionReceipts(prepared, original, latest)).toThrow('世界状态已变化');
    const invalidRead = acknowledgePhoneRead(original, [original.phone[0].id]);
    expect(() => mergeInteractionReceipts(prepared, invalidRead, original)).toThrow('世界状态已变化');
  });
  it('requires a gameplay effect beyond narrative, journal and phone messages', () => {
    const before = createInitialState();
    const after = createInitialState();
    after.story.push({ id: 'new-story', role: 'assistant', text: '发生了一件事。' });
    after.journal.push({ id: 'new-journal', at: '现在', text: '遇到了某人。' });
    after.phone[0].read = true;
    expect(hasInteractionEffect(before, after)).toBe(false);
    after.contacts[0].affinity += 1;
    expect(hasInteractionEffect(before, after)).toBe(true);
  });
  it('does not classify setup, pose updates or read receipts as interactions', () => {
    expect(isGameplayInteraction({ type: 'choose_academics', majorId: 'computer-science' })).toBe(false);
    expect(isGameplayInteraction({ type: 'read_phone', id: 'message' })).toBe(false);
    expect(isGameplayInteraction({ type: 'wait', minutes: 15 })).toBe(true);
  });
});
