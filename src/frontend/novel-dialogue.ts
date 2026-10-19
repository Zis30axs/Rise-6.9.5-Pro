export interface NovelSegment {
  speaker: string;
  emotion: string;
  text: string;
}

/** Parse display rows as data. Unknown or malformed rows remain readable text. */
export function parseNovelDialogue(story: string): NovelSegment[] {
  const segments: NovelSegment[] = [];
  const row = /\|([^|\r\n]{1,40})\|([^|\r\n]{1,30})\|([^|\r\n]+)\|/g;
  let cursor = 0;
  const narration = (text: string) => {
    for (const paragraph of text.split(/\n+/).map(value => value.trim()).filter(Boolean)) {
      if (/^\|?[\s:|-]+\|?$/.test(paragraph)) continue;
      segments.push({ speaker: '', emotion: '平静', text: paragraph });
    }
  };
  for (const match of story.matchAll(row)) {
    narration(story.slice(cursor, match.index));
    cursor = match.index! + match[0].length;
    const [, rawSpeaker, rawEmotion, rawText] = match;
    const speaker = rawSpeaker.trim(), emotion = rawEmotion.trim(), text = rawText.trim();
    if (speaker.toLowerCase() === 'charac' && emotion.toLowerCase() === 'emot' && text.toLowerCase() === 'says') continue;
    if (!speaker || !emotion || !text) { narration(match[0]); continue; }
    segments.push({ speaker: ['旁白', '叙述'].includes(speaker) ? '' : speaker, emotion, text });
  }
  narration(story.slice(cursor));
  return segments;
}

export function readableNovelText(story: string): string {
  return parseNovelDialogue(story).map(segment => segment.speaker ? `${segment.speaker}：${segment.text}` : segment.text).join('\n\n');
}
