import type { WorldState } from '../frontend/types';

/** A turn is one player entry followed by its generated story reply. */
export const STORY_REPLY_LIMIT = 60;
/** Openings, side stories and scripted scene beats must not consume reply slots. */
export const STORY_AUXILIARY_LIMIT = 60;
export const STORY_RECORD_LIMIT = STORY_REPLY_LIMIT * 2 + STORY_AUXILIARY_LIMIT;

/** Keep the last 60 actual LLM story turns and a separate bounded set of
 * non-turn entries, always preserving each retained player input + reply pair.
 * No model call, coordinates or keyword matching is involved.
 */
export function retainStoryHistory<T extends WorldState['story'][number]>(rows: readonly T[]): T[] {
  const kept = new Set<number>();
  let replies = 0;
  let auxiliary = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    const paired = rows[index]?.role === 'assistant' && index > 0 && rows[index - 1]?.role === 'user';
    if (paired) {
      if (replies++ < STORY_REPLY_LIMIT) {
        kept.add(index - 1);
        kept.add(index);
      }
      index--; // The preceding user input belongs to this exact reply.
    } else if (auxiliary++ < STORY_AUXILIARY_LIMIT) {
      kept.add(index);
    }
  }
  return rows.filter((_, index) => kept.has(index));
}
