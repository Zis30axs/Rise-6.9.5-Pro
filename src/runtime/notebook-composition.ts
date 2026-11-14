import type { NotebookPage } from './notebook';
import { NOTEBOOK_STICKERS, type NotebookStickerId } from './notebook-stickers';

export const NOTEBOOK_INKS = {
  graphite: { label: '铅灰', color: '#493c46' },
  rose: { label: '玫瑰红', color: '#963c61' },
  blue: { label: '靛蓝', color: '#365b90' },
  green: { label: '松绿', color: '#386b52' },
  violet: { label: '藤紫', color: '#745087' },
} as const;

export const NOTEBOOK_LIMITS = { title: 60, body: 2000, paragraphs: 8, stickers: 4, direction: 240 } as const;
export type NotebookInk = keyof typeof NOTEBOOK_INKS;
export interface NotebookParagraphStyle { ink: NotebookInk; underline: boolean }
export interface NotebookParagraph extends NotebookParagraphStyle { text: string }
export interface NotebookComposition {
  title: string;
  paragraphs: NotebookParagraph[];
  stickers: NotebookStickerId[];
}
export interface NotebookWritingRequest extends NotebookComposition {
  personId: string;
  direction: string;
}
export interface NotebookPageFormat { paragraphs: NotebookParagraphStyle[]; stickers: NotebookStickerId[] }

const stickerIds = new Set<unknown>(NOTEBOOK_STICKERS.map(sticker => sticker.id));
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const nonDiaryMarkup = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?\s*\/?>|```|\|[^|\r\n]+\|[^|\r\n]+\|[^|\r\n]+\|/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const isInk = (value: unknown): value is NotebookInk => typeof value === 'string' && Object.hasOwn(NOTEBOOK_INKS, value);
const isSticker = (value: unknown): value is NotebookStickerId => stickerIds.has(value);
export const notebookPlainText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit && !controlCharacters.test(value);
const paragraphText = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n(?:[ \t]*\n)+/g, '\n').trim();

export function normalizeNotebookComposition(raw: NotebookComposition): NotebookComposition {
  if (!notebookPlainText(raw.title, NOTEBOOK_LIMITS.title) || raw.paragraphs.length > NOTEBOOK_LIMITS.paragraphs
    || raw.stickers.length > NOTEBOOK_LIMITS.stickers || raw.stickers.some(id => !isSticker(id))) {
    throw new Error('请检查这一页的内容。');
  }
  const paragraphs = raw.paragraphs.map(paragraph => {
    if (!notebookPlainText(paragraph.text, NOTEBOOK_LIMITS.body) || !isInk(paragraph.ink) || typeof paragraph.underline !== 'boolean') {
      throw new Error('请检查这一页的内容。');
    }
    return { text: paragraphText(paragraph.text), ink: paragraph.ink, underline: paragraph.underline };
  }).filter(paragraph => paragraph.text);
  if (paragraphs.map(paragraph => paragraph.text).join('\n\n').length > NOTEBOOK_LIMITS.body) {
    throw new Error('这一页最多写两千字。');
  }
  return { title: raw.title.trim(), paragraphs, stickers: [...new Set(raw.stickers)] };
}

export function validNotebookFormat(value: unknown, text: string): value is NotebookPageFormat {
  const format = record(value);
  return !!format && Array.isArray(format.paragraphs) && format.paragraphs.length <= NOTEBOOK_LIMITS.paragraphs
    && format.paragraphs.length === text.split('\n\n').length
    && format.paragraphs.every(item => {
      const style = record(item);
      return !!style && Object.keys(style).sort().join(',') === 'ink,underline'
        && isInk(style.ink) && typeof style.underline === 'boolean';
    })
    && Array.isArray(format.stickers) && format.stickers.length <= NOTEBOOK_LIMITS.stickers
    && format.stickers.every(isSticker) && new Set(format.stickers).size === format.stickers.length;
}

export function notebookPageParagraphs(page: NotebookPage): NotebookParagraph[] {
  const format = page.format;
  if (!format) return [{ text: page.text, ink: 'graphite', underline: false }];
  const paragraphs = page.text.split('\n\n');
  return format.paragraphs.map(({ ink, underline }, index) => ({ text: paragraphs[index]!, ink, underline }));
}

export function parseNotebookComposition(response: unknown): NotebookComposition {
  if (typeof response !== 'string' || response.length > 16_000) throw new Error('这一页没写好，请再试一次。');
  const content = response.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { throw new Error('这一页没写好，请再试一次。'); }
  const raw = record(value);
  if (!raw || Object.keys(raw).sort().join(',') !== 'paragraphs,stickers,title'
    || !notebookPlainText(raw.title, NOTEBOOK_LIMITS.title) || !raw.title.trim() || nonDiaryMarkup.test(raw.title)
    || !Array.isArray(raw.paragraphs) || !Array.isArray(raw.stickers)
    || raw.paragraphs.length > NOTEBOOK_LIMITS.paragraphs || raw.stickers.length > NOTEBOOK_LIMITS.stickers) {
    throw new Error('这一页没写好，请再试一次。');
  }
  const paragraphs = raw.paragraphs.map((item: unknown): NotebookParagraph => {
    const paragraph = record(item);
    if (!paragraph || Object.keys(paragraph).sort().join(',') !== 'ink,text,underline'
      || !notebookPlainText(paragraph.text, NOTEBOOK_LIMITS.body) || !paragraph.text.trim()
      || nonDiaryMarkup.test(paragraph.text)) throw new Error('这一页没写好，请再试一次。');
    return { text: paragraph.text, ink: isInk(paragraph.ink) ? paragraph.ink : 'graphite', underline: paragraph.underline === true };
  });
  if (!paragraphs.length) throw new Error('这一页没写好，请再试一次。');
  return normalizeNotebookComposition({ title: raw.title, paragraphs, stickers: raw.stickers.filter(isSticker) });
}
