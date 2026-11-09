import type { WorldState } from '../frontend/types';
import { STORY_OUTPUT_LIMITS } from './story-protocol';

/** Edit the displayed story only. Never replay actions, rewrite receipts or rewind game time. */
export function editStoryEntry(
  state: WorldState,
  entryId: string,
  expectedText: string,
  revisedText: string,
): WorldState {
  if (!entryId || typeof expectedText !== 'string') throw new Error('未找到可编辑的剧情记录。');
  const index = state.story.findIndex(row => row.id === entryId);
  if (index < 0 || state.story.some((row, offset) => offset !== index && row.id === entryId)) {
    throw new Error('剧情记录不存在或 ID 重复，未进行修改。');
  }
  const entry = state.story[index]!;
  if (entry.text !== expectedText) {
    throw new Error('这条剧情已被其他操作更新，请重新打开编辑器，避免覆盖新内容。');
  }
  const max = entry.role === 'user' ? STORY_OUTPUT_LIMITS.inputText : STORY_OUTPUT_LIMITS.storyText;
  if (typeof revisedText !== 'string' || !revisedText.trim() || revisedText.length > max || revisedText.includes('\u0000')) {
    throw new Error(`修改内容不能为空，且不能超过 ${max} 字。`);
  }
  const text = revisedText.trim();
  if (text === entry.text) return state;
  return { ...state, story: state.story.map((row, offset) => offset === index ? { ...row, text } : row) };
}
