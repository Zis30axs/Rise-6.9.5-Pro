import { describe, expect, it } from 'vitest';
import { selectPromptStory } from '../src/runtime/prompt-pruning';

describe('off-screen perspective and foreground continuation prompt bounds', () => {
  it('keeps the actual return to the current protagonist without leaking a private other-side beat', () => {
    const rows = [{
      role: 'assistant' as const,
      text: '玲奈子在房间里看向窗户。',
      returnStory: '回到现在，玲奈子把手机放回书桌。',
      otherSideBeats: [{ protagonists: ['sakiko'], text: '祥子独自整理了日记。' }],
    }];
    const snapshot = JSON.stringify(rows);
    const result = selectPromptStory(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('玲奈子把手机放回书桌');
    expect(result[0]!.text).not.toContain('祥子独自整理了日记');
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('includes every saved story turn, preserving long prose and return-to-viewpoint text', () => {
    const continuation = '接下来，素世已经回到车站。'.repeat(60);
    const longText = '很久以前的事情。'.repeat(200);
    const rows = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      text: `第${index + 1}楼。` + longText,
      ...(index === 13 ? { returnStory: continuation } : {}),
    }));
    const snapshot = JSON.stringify(rows);
    const result = selectPromptStory(rows);
    expect(result).toHaveLength(14);
    expect(result[0]!.text).toBe(rows[0]!.text);
    expect(result[13]!.text).toContain(continuation);
    expect(result[13]!.text).toContain(longText);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
