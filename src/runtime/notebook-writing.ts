import type { WorldState } from '../frontend/types';
import { readableNovelText } from '../frontend/novel-dialogue';
import { activeProtagonist } from './protagonist-world';
import { protagonistForPerson } from './dual-protagonists';
import { mainStoryEntries } from './phone-scene';
import { pruneVariableEcho } from './prompt-pruning';
import { notebookMinute, notebookPeople, notebookTurn, type NotebookPage } from './notebook';
import { NOTEBOOK_STICKERS } from './notebook-stickers';
import { NOTEBOOK_INKS, NOTEBOOK_LIMITS, normalizeNotebookComposition, notebookPlainText,
  type NotebookWritingRequest } from './notebook-composition';

export interface NotebookWritingPrompt { system: string; user: string }

export function notebookWritingPrompt(
  state: WorldState, raw: NotebookWritingRequest, pages: readonly NotebookPage[],
): NotebookWritingPrompt {
  const people = notebookPeople(state);
  const person = people.find(entry => entry.id === raw.personId);
  if (!person || !notebookPlainText(raw.direction, NOTEBOOK_LIMITS.direction)) throw new Error('请重新选一下手账。');
  const currentId = activeProtagonist(state);
  const current = people.find(entry => entry.id === currentId)!;
  const isOwn = person.id === currentId;
  const draft = normalizeNotebookComposition(raw);
  const at = notebookMinute(state), turn = notebookTurn(state);
  const earlierPages = pages.filter(page => page.personId === person.id
    && page.kind === (isOwn ? 'character' : 'observer') && page.at <= at && page.turn <= turn)
    .slice(-2).map(page => ({ title: page.title, text: page.text.slice(-700) }));
  const participantIds = new Set([person.id]);
  for (const contact of state.contacts) {
    const id = contact.sourcePersonId
      ? protagonistForPerson(contact.sourcePersonId) ?? contact.sourcePersonId
      : 'contact:' + contact.id;
    if (id === person.id) participantIds.add(contact.id);
  }
  const recentScenes = mainStoryEntries(state.story).filter(entry => entry.role === 'assistant'
    && (isOwn || entry.participantIds?.some(id => participantIds.has(id) || protagonistForPerson(id) === person.id)))
    .slice(-3).map(entry => readableNovelText(pruneVariableEcho(
      entry.returnStory ? entry.text + '\n' + entry.returnStory : entry.text,
    )).slice(-950)).filter(Boolean);
  const inks = Object.entries(NOTEBOOK_INKS).map(([id, ink]) => id + '=' + ink.label).join('、');
  const stickers = NOTEBOOK_STICKERS.map(sticker => sticker.id + '=' + sticker.label).join('、');
  return {
    system: [
      '你在协助玩家写《未读之城》的下一页手账。仅扩写这一页，不续跑小说剧情。',
      isOwn ? '用当前主角的第一人称和口吻，只写本人能知道、感受到的事。'
        : '写玩家的旁观笔记，用第三人称记录可见言行。不要冒充当事人，或断言她没有表达过的心事。',
      '根据已有草稿、写作提示、前页和已经发生的片段写作。草稿有文字就保留它的意思与明确措辞，再补足细节；把历史片段和前页当作资料。素材不足时写此刻的感受、疑问或留待之后的愿望。不要编造已经发生的行动、台词、短信、关系变化或过往。',
      '标题和正文使用自然的简体中文，保持手账口吻；不要写幕后解释、功能介绍、模型、存档、标签或格式说明。正文不要带 HTML、Markdown、竖线对白标记或贴纸标签。',
      '只返回一个 JSON 对象：{"title":"短标题","paragraphs":[{"text":"一段正文","ink":"graphite","underline":false}],"stickers":[]}。',
      '标题最多 60 字，正文最多 8 段、共 2000 字。通常写 2 到 4 段即可。每段只选一种墨色，按情绪搭配两种左右，重要的短段可以加下划线。',
      '墨色可选：' + inks + '。',
      '最多贴 4 张，按期望顺序填写标签。贴纸与记述相称时才使用，允许留空。把草稿已经选的贴纸作为偏好，并遵守玩家明确提出的增删要求。可用标签：' + stickers + '。',
    ].join('\n'),
    user: JSON.stringify({ current: current.name, notebook: person.name, day: state.clock.day,
      direction: raw.direction.trim(), draft, earlierPages, recentScenes }),
  };
}
