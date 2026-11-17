import arcs from '../worldbook/story-arcs-relationships.json' with { type: 'json' };
import watanareArcs from '../worldbook/watanare-story-arcs.json' with { type: 'json' };
import band from './bang-dream-episodes.json' with { type: 'json' };
import majo from './majo-story-chapters.json' with { type: 'json' };
import watanare from './watanare-story-chapters.json' with { type: 'json' };
import type { StoryGenerationOptions } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';

function brief(entries: readonly { name: string; content: string }[], prefix: string): string {
  return entries.filter(entry => entry.name.startsWith(prefix)).map(entry => entry.content).join('\n');
}

function chapterText(chapters: readonly { title: string; summary: string }[]): string {
  return chapters.map(({ title, summary }) => title + '：' + summary).join('\n');
}

interface StoryMemory {
  title: string;
  owners: readonly ProtagonistId[];
  names: RegExp;
  brief: string;
  detailed: string;
}

const memories: readonly StoryMemory[] = [
  {
    title: '乐队前史',
    owners: ['soyo', 'sakiko'],
    names: /素世|祥子|\b(?:soyo|sakiko)\b/i,
    brief: brief(arcs.entries, '邦邦前史 · '),
    detailed: band.series.map(series => [
      series.title,
      ...series.episodes.map(({ episode, title, summary }) => '第' + episode + '集 · ' + title + '：' + summary),
    ].join('\n')).join('\n\n'),
  },
  {
    title: '魔裁前史',
    owners: ['emma'],
    names: /艾玛|\b(?:emma|ema)\b/i,
    brief: brief(arcs.entries, '魔裁前史 · '),
    detailed: chapterText(majo.chapters),
  },
  {
    title: '渡奈前史',
    owners: ['renako'],
    names: /玲奈(?:子|酱|蹦)|\brenako\b/i,
    brief: brief(watanareArcs.entries, '渡奈前史 · '),
    detailed: chapterText(watanare.chapters),
  },
];

export function storyMemoryPrompt(
  protagonist: ProtagonistId,
  counterpartsInScene: readonly { id: ProtagonistId }[],
  input: string,
  kind?: StoryGenerationOptions['kind'],
): string {
  if (kind && kind !== 'interaction_event') return '';

  const inScene = new Set<ProtagonistId>([protagonist, ...counterpartsInScene.map(({ id }) => id)]);
  const action = input.normalize('NFKC');
  const history = memories.map(memory => {
    const detailed = memory.owners.some(owner => inScene.has(owner)) || memory.names.test(action);
    return '【' + memory.title + '】\n' + (detailed ? memory.detailed : memory.brief);
  });

  return [
    '【剧情前史】',
    '这些是全知叙事者的资料。人物只知道本人亲历、实际听见或经可靠交流得知的事情。同场、点名、看到公开表演或和另一个知情者同处一地，都不会让角色自动知道私事。乐队成员的家庭与身份秘密、魔裁各轮的经历、芦谷五人组的私下承诺均遵守原有知情范围。',
    '以当前世界设定和已发生的存档为准。原作时期的学籍、住所与关系只用于理解当时；魔裁旧轮次并非全员记忆，东京后日谈遵守角色卡的幸存与魔法设定。按当下剧情需要自然承接前史，把资料标题和分集编号留在正文之外。',
    ...history,
  ].join('\n\n');
}
