import { describe, expect, it } from 'vitest';
import { selectPromptStory, PROMPT_CONTEXT_LIMITS } from '../src/runtime/prompt-pruning';

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

  it('trims old foreground prose before the resumed scene, never the other way around', () => {
    const continuation = '接下来，素世已经回到车站。';
    const result = selectPromptStory([{
      role: 'assistant',
      text: '很久以前的事情。'.repeat(200),
      returnStory: continuation,
    }]);
    expect(result[0]!.text).toContain(continuation);
    expect(result[0]!.text.length).toBeLessThanOrEqual(PROMPT_CONTEXT_LIMITS.storyText);
  });
});
