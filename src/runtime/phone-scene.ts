import type { WorldState } from '../frontend/types';
import { STATE_LIMITS, parseState } from './model';
import { activeProtagonist, enableProtagonists } from './protagonist-world';

export const PHONE_SCENE_PREFIX = 'phone-scene:';

/** Stable, bounded save IDs even for long group-message responder IDs. */
export function phoneSceneId(messageId: string): string {
  const clean = messageId.replace(/[^A-Za-z0-9._:-]/g, '_');
  if ((PHONE_SCENE_PREFIX + clean).length <= 100) return PHONE_SCENE_PREFIX + clean;
  let hash = 2166136261;
  for (let i = 0; i < messageId.length; i++) hash = Math.imul(hash ^ messageId.charCodeAt(i), 16777619) >>> 0;
  return PHONE_SCENE_PREFIX + clean.slice(0, 70) + ':' + hash.toString(16).padStart(8, '0');
}

const emotions = new Set(['平静', '开心', '难过', '生气', '惊讶', '害羞', '思考', '严肃', '安心']);
function phoneSceneEmotion(tone: string): string {
  if (emotions.has(tone)) return tone;
  if (/sad|cry|tear|sorrow/i.test(tone)) return '难过';
  if (/angry|rage|furious/i.test(tone)) return '生气';
  if (/surpris|shock|startl/i.test(tone)) return '惊讶';
  if (/whisper|sweet|blush|shy|embarrass/i.test(tone)) return '害羞';
  if (/confiden|cheer|happy|laugh|joy|smil/i.test(tone)) return '开心';
  if (/think|ponder|hesitat/i.test(tone)) return '思考';
  if (/possess|serious|stern|firm|cold/i.test(tone)) return '严肃';
  if (/relief|reassur|calm/i.test(tone)) return '安心';
  return '平静';
}

/** Retain the authored prose, but translate old inline TTS cues into portrait
 * dialogue rows. Remove a preceding duplicate quotation rather than showing it
 * twice. This conversion does not produce world actions or NPC knowledge.
 */
export function phoneSceneToNovel(raw: string): string {
  let written = '', cursor = 0;
  for (const match of raw.matchAll(/<tts>([^<>]*)<\/tts>/gi)) {
    written += raw.slice(cursor, match.index);
    cursor = match.index! + match[0].length;
    const parts = match[1]!.split('|');
    if (parts.length !== 3) { written += match[1]; continue; }
    const [speakerRaw, toneRaw, speechRaw] = parts;
    const speaker = speakerRaw!.trim(), speech = speechRaw!.trim();
    if (!speaker || !speech || speaker.length > 40 || speech.includes('|') || /[\r\n|]/.test(speaker)) {
      written += speech; continue;
    }
    const previousRow = /\|([^|\r\n]{1,40})\|([^|\r\n]{1,30})\|([^|\r\n]+)\|\s*$/.exec(written);
    if (previousRow && previousRow[1]!.trim() === speaker && previousRow[3]!.trim() === speech) continue;
    const quoted = /[“「『"']([^“”「」『』"'\r\n]{1,1000})[”」』"']\s*$/.exec(written);
    if (quoted && quoted[1]!.trim() === speech) written = written.slice(0, quoted.index);
    written += '\n|' + speaker + '|' + phoneSceneEmotion(toneRaw!.trim()) + '|' + speech + '|\n';
  }
  return (written + raw.slice(cursor)).trim();
}

/** Append only a canonical, already-saved incoming reply's optional narrative.
 * It remains an assistant story entry, not a message, journal action or NPC fact.
 */
export function appendPhoneReplyScene(state: WorldState, replyMessageId: string, rawScene: string): WorldState {
  if (!rawScene.trim()) return state;
  const next = enableProtagonists(state), owner = activeProtagonist(next);
  const fromProtagonist = next.protagonists?.conversations?.some(row =>
    row.id === replyMessageId && row.to === owner && row.replyTo !== null);
  const fromNpc = next.protagonists?.npcPhone?.messages.some(row =>
    row.id === replyMessageId && row.owner === owner && row.direction === 'incoming' && row.replyTo !== null);
  if (!fromProtagonist && !fromNpc) throw new Error('离屏剧情未对应当前主角真实收到的短信。');
  const sceneId = phoneSceneId(replyMessageId);
  const text = phoneSceneToNovel(rawScene);
  if (!text || text.length > STATE_LIMITS.storyText || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw new Error('短信后的小说正文无效或过长。');
  const previous = next.story.find(row => row.id === sceneId);
  if (previous) {
    if (previous.role !== 'assistant' || previous.text !== text) throw new Error('离屏剧情记录 ID 冲突。');
    return next;
  }
  next.story.push({ id: sceneId, role: 'assistant', text });
  next.story = next.story.slice(-STATE_LIMITS.story);
  return parseState(next);
}
