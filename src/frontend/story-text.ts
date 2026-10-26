const quotePairs = [['“', '”'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]] as const;

function unquote(text: string): string {
  const pair = quotePairs.find(([open, close]) => text.startsWith(open) && text.endsWith(close));
  return pair ? text.slice(pair[0].length, -pair[1].length) : text;
}

/** Readable text only: the original story remains saved, and Vue still escapes this output. */
export function storyDisplayText(text: string): string {
  let result = '', cursor = 0;
  for (const match of text.matchAll(/<tts>([^<>]*)<\/tts>/g)) {
    result += text.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    const payload = match[1];
    const first = payload.indexOf('|'), second = payload.indexOf('|', first + 1);
    if (first <= 0 || second < 0 || !payload.slice(0, first).trim() || !payload.slice(first + 1, second).trim()) {
      result += match[0]; continue;
    }
    const speech = payload.slice(second + 1).trim();
    if (!speech) { result += match[0]; continue; }
    const previous = result.trimEnd();
    const dialogue = unquote(speech);
    // Old <tts> metadata can follow an already-renderable |speaker|emotion|speech| row.
    // Its trailing pipe means endsWith(speech) alone misses the duplicate.
    const priorTag = /\|([^|\r\n]{1,40})\|([^|\r\n]{1,30})\|([^|\r\n]+)\|\s*$/.exec(previous);
    const taggedEcho = priorTag?.[1].trim() === payload.slice(0, first).trim()
      && unquote(priorTag[3].trim()) === dialogue;
    const repeated = dialogue.length > 0 && (taggedEcho || previous.endsWith(speech) || previous.endsWith(dialogue)
      || quotePairs.some(([open, close]) => previous.endsWith(`${open}${dialogue}${close}`)));
    if (!repeated) result += speech;
  }
  return result + text.slice(cursor);
}
