import type { NovelSegment } from './novel-dialogue';

export interface NovelPortraitFocus {
  /** Keep the last identifiable character, never the crowd's made-up identity. */
  speaker: string;
  emotion: string;
  dimmed: boolean;
}

const narrationSpeakers = new Set(['', '旁白', '叙述', 'narrator', '你的行动']);

/** Group/anonymous labels are dialogue speakers, but never portrait identities. */
export function isUnidentifiedNovelSpeaker(speaker: string): boolean {
  const name = speaker.trim();
  return /^(?:群众|人群|众人|大家|人们|路人们|观众|观众们|围观者|旁观者|学生们|客人们|路人|陌生人|某人|有人|不明声音|未知声音|匿名声音|未知说话人|不明说话人|人群中有人|人群中的声音|人群里的声音|远处的声音|台下观众|围观群众|路人[甲乙丙丁]|[?？]{2,})$/.test(name);
}

function visiblePortrait(
  segment: NovelSegment,
  protagonist: string,
  recognizes: (speaker: string) => boolean,
): Omit<NovelPortraitFocus, 'dimmed'> | null {
  const speaker = segment.speaker.trim();
  if (narrationSpeakers.has(speaker)) return { speaker: protagonist, emotion: '平静' };
  if (isUnidentifiedNovelSpeaker(speaker) || !recognizes(speaker)) return null;
  return { speaker, emotion: segment.emotion };
}

/**
 * Select from the actual reading position, not a sticky last-emitted portrait:
 * stepping backward through anonymous lines must not pick a future speaker.
 */
export function novelPortraitFocus(
  rows: readonly NovelSegment[],
  cursor: number,
  protagonist: string,
  recognizes: (speaker: string) => boolean,
): NovelPortraitFocus {
  const current = rows[cursor];
  if (!current) return { speaker: protagonist, emotion: '平静', dimmed: false };
  const direct = visiblePortrait(current, protagonist, recognizes);
  if (direct) return { ...direct, dimmed: false };
  for (let index = cursor - 1; index >= 0; index--) {
    const previous = visiblePortrait(rows[index]!, protagonist, recognizes);
    if (previous) return { ...previous, dimmed: true };
  }
  return { speaker: protagonist, emotion: '平静', dimmed: true };
}
