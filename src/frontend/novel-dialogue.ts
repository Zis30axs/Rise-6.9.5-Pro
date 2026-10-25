export interface NovelSegment {
  speaker: string;
  emotion: string;
  text: string;
}

const wrappedRow = /\|([^|\r\n]{1,40})\|([^|\r\n]{1,30})\|([^|\r\n]+)\|/g;
const unwrappedLine = /^\|?([^|\r\n]{1,40})\|([^|\r\n]{1,30})\|([^|\r\n]+?)\|?$/;
const knownEmotions = new Set(['平静', '开心', '难过', '生气', '惊讶', '害羞', '思考', '严肃', '安心']);

/** The saved story is plain text; portrait metadata is parsed only for display. */
export function parseNovelDialogue(story: string): NovelSegment[] {
  const segments: NovelSegment[] = [];
  const addRow = (rawSpeaker: string, rawEmotion: string, rawText: string): boolean => {
    const speaker = rawSpeaker.trim(), emotion = rawEmotion.trim(), text = rawText.trim();
    if (speaker.toLowerCase() === 'charac' && emotion.toLowerCase() === 'emot' && text.toLowerCase() === 'says') return true;
    if (!speaker || !emotion || !text) return false;
    segments.push({ speaker: ['旁白', '叙述'].includes(speaker) ? '' : speaker, emotion, text });
    return true;
  };
  const addPlainText = (text: string) => {
    for (const paragraph of text.split(/\n+/).map(value => value.trim()).filter(Boolean)) {
      if (/^\|?[\s:|-]+\|?$/.test(paragraph)) continue;
      // Models sometimes omit one or both outer pipes. Only treat a whole
      // line with a known emotion as a shorthand row; preserve ordinary prose.
      const row = unwrappedLine.exec(paragraph);
      if (row && knownEmotions.has(row[2].trim()) && addRow(row[1], row[2], row[3])) continue;
      if (/^\|?charac\|emot\|says\|?$/i.test(paragraph)) continue;
      segments.push({ speaker: '', emotion: '平静', text: paragraph });
    }
  };
  for (const line of story.split(/\r?\n/)) {
    let cursor = 0;
    for (const match of line.matchAll(wrappedRow)) {
      addPlainText(line.slice(cursor, match.index));
      if (!addRow(match[1], match[2], match[3])) addPlainText(match[0]);
      cursor = match.index! + match[0].length;
    }
    addPlainText(line.slice(cursor));
  }
  return segments;
}

export function readableNovelText(story: string): string {
  return parseNovelDialogue(story).map(segment => segment.speaker ? `${segment.speaker}：${segment.text}` : segment.text).join('\n\n');
}
