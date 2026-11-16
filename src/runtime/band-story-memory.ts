import arcs from '../worldbook/story-arcs-relationships.json' with { type: 'json' };
import canon from './bang-dream-episodes.json' with { type: 'json' };
import type { StoryGenerationOptions } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';

const brief = arcs.entries.filter(entry => entry.name.startsWith('邦邦前史 · '))
  .map(entry => entry.content).join('\n');
const detailed = canon.series.map(series => [
  series.title,
  ...series.episodes.map(({ episode, title, summary }) => '第' + episode + '集 · ' + title + '：' + summary),
].join('\n')).join('\n\n');

const bandProtagonists = new Set<ProtagonistId>(['soyo', 'sakiko']);
const namedBandProtagonist = /素世|祥子|\b(?:soyo|sakiko)\b/i;

export function bandStoryMemoryPrompt(
  protagonist: ProtagonistId,
  counterpartsInScene: readonly { id: ProtagonistId }[],
  input: string,
  kind?: StoryGenerationOptions['kind'],
): string {
  if (kind && kind !== 'interaction_event') return '';

  const useDetailed = bandProtagonists.has(protagonist)
    || counterpartsInScene.some(person => bandProtagonists.has(person.id))
    || namedBandProtagonist.test(input.normalize('NFKC'));

  return [
    '【乐队前史】',
    '这是全知叙事者用来理解当前人物的过往。用亲历、可感知的现场或已有来源的交流判断各人的认知。提到某人、与她同场或看过公开演出，都不会让角色自动知道她的私事。丰川家的处境、若叶睦的内心经历、三角初音的真实身份与私人告白尤其要遵循各自的知情范围。',
    '以当前世界设定和已发生的存档为准。原作时期的学籍、住所与关系只用于理解当时的事件。需要回忆时自然承接当下，不把资料标题、分集编号或梗概直接写进正文，不凭前史重演事件或推进游戏状态。',
    useDetailed ? detailed : brief,
  ].join('\n');
}
