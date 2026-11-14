<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist } from '../runtime/protagonist-world';
import {
  exportNotebook, importNotebook, makeComposedNotebookPage, notebookMinute,
  notebookPeople, notebookTurn, readNotebook, writeNotebook, type NotebookPage,
} from '../runtime/notebook';
import {
  NOTEBOOK_INKS, NOTEBOOK_LIMITS, notebookPageParagraphs, type NotebookComposition, type NotebookParagraph,
} from '../runtime/notebook-composition';
import { NOTEBOOK_STICKERS, type NotebookStickerId } from '../runtime/notebook-stickers';
import notebookFont from '../../assets/notebook/lxgw-wenkai-lite.woff2?inline';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const scope = computed(() => props.model.memoryScope || (props.model.mode === 'demo' ? 'demo:notebook' : ''));
const people = computed(() => notebookPeople(props.model.state));
const current = computed(() => activeProtagonist(props.model.state));
const selectedId = ref<string>(current.value);
const search = ref('');
const pages = ref<NotebookPage[]>([]);
const notice = ref('');
const loading = ref(false);
const saving = ref(false);
const writing = ref(false);
const panel = ref<HTMLElement>();
const pageTitle = ref<HTMLInputElement>();
let readNumber = 0;
let writeNumber = 0;
let disposed = false;
let handwriting: FontFace | undefined;
let fonts: FontFaceSet | undefined;

const images = import.meta.glob<string>('../../assets/stickers/*/*.png', {
  eager: true, import: 'default', query: '?inline',
});
const stickers = NOTEBOOK_STICKERS.map(sticker => ({
  ...sticker, url: images['../../assets/stickers/' + sticker.file]!,
}));
const stickerById = new Map<NotebookStickerId, (typeof stickers)[number]>(stickers.map(sticker => [sticker.id, sticker]));

type WorkingPage = NotebookComposition & { direction: string };
const blankParagraph = (): NotebookParagraph => ({ text: '', ink: 'graphite', underline: false });
const blankPage = (): WorkingPage => ({ title: '', paragraphs: [blankParagraph()], stickers: [], direction: '' });
const drafts = reactive(new Map<string, WorkingPage>([[selectedId.value, blankPage()]]));
const draft = computed(() => drafts.get(selectedId.value)!);
const selected = computed(() => people.value.find(person => person.id === selectedId.value));
const isOwn = computed(() => selectedId.value === current.value);
const now = computed(() => notebookMinute(props.model.state));
const turn = computed(() => notebookTurn(props.model.state));
const roster = computed(() => people.value.filter(person =>
  !search.value.trim() || person.name.includes(search.value.trim())));
const visiblePages = computed(() => pages.value
  .filter(page => page.personId === selectedId.value && page.at <= now.value && page.turn <= turn.value)
  .slice().reverse().map(page => ({ ...page, paragraphs: notebookPageParagraphs(page) })));
const pageCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const page of pages.value) {
    if (page.at > now.value || page.turn > turn.value) continue;
    counts.set(page.personId, (counts.get(page.personId) ?? 0) + 1);
  }
  return counts;
});
const bodyLength = computed(() => draft.value.paragraphs.map(paragraph => paragraph.text.trim()).filter(Boolean).join('\n\n').length);
const canSave = computed(() => !saving.value && !writing.value && !!scope.value
  && !!draft.value.title.trim() && bodyLength.value > 0 && bodyLength.value <= NOTEBOOK_LIMITS.body);
const dayLabel = (at: number) => {
  const day = Math.floor(at / 1440) + 1;
  const minute = at % 1440;
  return '第 ' + day + ' 天 ' + String(Math.floor(minute / 60)).padStart(2, '0')
    + ':' + String(minute % 60).padStart(2, '0');
};

function cancelWriting() {
  if (!writing.value) return;
  writeNumber++;
  writing.value = false;
  props.actions.cancelNotebookWriting?.();
}

function selectPerson(id: string) {
  if (id === selectedId.value) return;
  cancelWriting();
  if (!drafts.has(id)) drafts.set(id, blankPage());
  selectedId.value = id;
  notice.value = '';
}

async function reload() {
  const number = ++readNumber;
  if (!scope.value) {
    pages.value = [];
    loading.value = false;
    notice.value = '暂时打不开手账。';
    return false;
  }
  loading.value = true;
  try {
    const data = await readNotebook(scope.value);
    if (number !== readNumber || disposed) return false;
    pages.value = data;
    return true;
  } catch {
    if (number === readNumber && !disposed) notice.value = '暂时打不开手账，请稍后再试。';
    return false;
  } finally {
    if (number === readNumber) loading.value = false;
  }
}

async function expandPage() {
  if (!props.actions.writeNotebookDraft || props.model.busy || saving.value || writing.value
    || !scope.value || bodyLength.value > NOTEBOOK_LIMITS.body) return;
  const number = ++writeNumber;
  writing.value = true;
  notice.value = '';
  const { title, direction, paragraphs, stickers } = draft.value;
  try {
    const composition = await props.actions.writeNotebookDraft({
      personId: selectedId.value, title, direction, paragraphs: paragraphs.map(item => ({ ...item })), stickers: [...stickers],
    });
    if (number !== writeNumber || disposed) return;
    Object.assign(draft.value, composition);
  } catch {
    if (number === writeNumber && !disposed) notice.value = '这一页没写好，可以再试一次。';
  } finally {
    if (number === writeNumber) writing.value = false;
  }
  if (number === writeNumber && !notice.value) {
    await nextTick();
    pageTitle.value?.focus({ preventScroll: true });
  }
}

function toggleSticker(id: NotebookStickerId) {
  const list = draft.value.stickers;
  const index = list.indexOf(id);
  if (index !== -1) list.splice(index, 1);
  else if (list.length < NOTEBOOK_LIMITS.stickers) list.push(id);
}

async function savePage() {
  if (!canSave.value || !selected.value) return;
  const id = selectedId.value;
  const book = scope.value;
  saving.value = true;
  notice.value = '';
  try {
    const page = makeComposedNotebookPage(props.model.state, id, draft.value);
    await writeNotebook(book, [page]);
    if (disposed || book !== scope.value) return;
    drafts.set(id, blankPage());
    if (await reload() && selectedId.value === id) notice.value = '这一页收好了。';
  } catch {
    if (!disposed && book === scope.value) notice.value = '这一页没存好，可以再试一次。';
  } finally { saving.value = false; }
}

async function downloadBackup() {
  try {
    const content = await exportNotebook(scope.value);
    if (disposed) return;
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = '未读之城-手账备份.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      notice.value = '手账备份已备好。';
    } finally {
      // Safari/WebView may not start the download until after the click task.
      setTimeout(() => URL.revokeObjectURL(url), 15_000);
    }
  } catch { if (!disposed) notice.value = '手账备份没能导出。'; }
}

async function uploadBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const book = scope.value;
  const state = props.model.state;
  saving.value = true;
  try {
    const raw = await file.text();
    if (disposed || book !== scope.value) return;
    const added = await importNotebook(book, raw, state);
    if (disposed || book !== scope.value) return;
    if (await reload()) notice.value = added ? '找回了 ' + added + ' 页手账。' : '没有要补进来的页面。';
  } catch {
    if (!disposed && book === scope.value) notice.value = '读不了这份备份，请换一份试试。';
  } finally {
    input.value = '';
    saving.value = false;
  }
}

watch(scope, () => {
  cancelWriting();
  drafts.clear();
  drafts.set(current.value, blankPage());
  selectedId.value = current.value;
  pages.value = [];
  notice.value = '';
  void reload();
});
watch(() => [props.model.state.story.at(-1)?.id, props.model.busy], () => {
  if (!props.model.busy) void reload();
});
watch(people, items => {
  if (!items.some(person => person.id === selectedId.value)) selectPerson(current.value);
});
onMounted(() => {
  void reload();
  const doc = panel.value?.ownerDocument;
  const Font = doc?.defaultView?.FontFace;
  if (Font && doc.fonts) {
    fonts = doc.fonts;
    handwriting = new Font('Notebook WenKai', 'url("' + notebookFont + '")');
    fonts.add(handwriting);
  }
});
onBeforeUnmount(() => {
  disposed = true;
  cancelWriting();
  if (handwriting) fonts?.delete(handwriting);
});
</script>

<template>
  <section ref="panel" class="uc-notebook" data-notebook>
    <header class="nb-heading">
      <strong>大家的手账</strong>
      <div class="nb-backup">
        <button type="button" :disabled="!scope || saving || writing" data-notebook-export @click="downloadBackup">导出备份</button>
        <label class="nb-import">导入备份<input type="file" accept=".json,application/json" :disabled="!scope || saving || writing" data-notebook-import @change="uploadBackup"></label>
      </div>
    </header>
    <div class="nb-layout">
      <aside class="nb-roster" aria-label="人物手账目录">
        <label class="nb-search">查找人物<input v-model="search" type="search" placeholder="输入姓名…" data-notebook-search></label>
        <div class="nb-people">
          <button v-for="person in roster" :key="person.id" type="button"
            :aria-pressed="selectedId === person.id" :class="{ selected: selectedId === person.id }"
            :data-notebook-person="person.id" @click="selectPerson(person.id)">
            <span class="nb-avatar">{{ person.name.slice(-2) }}</span>
            <span class="nb-person-name"><b>{{ person.name }}</b><small>{{ person.group }}</small></span>
            <span class="nb-count">{{ pageCounts.get(person.id) ?? 0 }}</span>
          </button>
          <p v-if="!roster.length" class="nb-empty">没有找到人物。</p>
        </div>
      </aside>
      <div v-if="selected" class="nb-book">
        <div class="nb-cover">
          <span class="nb-cover-mark" aria-hidden="true">✿</span>
          <small>私人手账</small>
          <h2>{{ selected.name }}</h2>
        </div>
        <form class="nb-editor" @submit.prevent="savePage">
          <h3>{{ isOwn ? '写下一页' : '添加旁观备注' }}</h3>
          <fieldset class="nb-draft" :disabled="saving || writing">
            <input ref="pageTitle" v-model="draft.title" type="text" :maxlength="NOTEBOOK_LIMITS.title" placeholder="这一页的标题" aria-label="手账标题" data-notebook-title>
            <div v-for="(paragraph, index) in draft.paragraphs" :key="index" class="nb-paragraph">
              <textarea v-model="paragraph.text" class="nb-handwriting" :class="{ 'nb-underlined': paragraph.underline }"
                :style="{ color: NOTEBOOK_INKS[paragraph.ink].color }" rows="3" :maxlength="NOTEBOOK_LIMITS.body"
                placeholder="想记下什么…" :aria-label="'正文第 ' + (index + 1) + ' 段'" data-notebook-body></textarea>
              <div class="nb-paragraph-actions">
                <label>墨色 <select v-model="paragraph.ink" data-notebook-ink>
                  <option v-for="(ink, id) in NOTEBOOK_INKS" :key="id" :value="id">{{ ink.label }}</option>
                </select></label>
                <button type="button" :aria-pressed="paragraph.underline" data-notebook-underline @click="paragraph.underline = !paragraph.underline">下划线</button>
                <button v-if="draft.paragraphs.length > 1" type="button" @click="draft.paragraphs.splice(index, 1)">删去此段</button>
              </div>
            </div>
            <div class="nb-paragraph-actions">
              <button type="button" :disabled="draft.paragraphs.length >= NOTEBOOK_LIMITS.paragraphs" @click="draft.paragraphs.push(blankParagraph())">添一段</button>
              <span v-if="bodyLength > NOTEBOOK_LIMITS.body" class="nb-overflow">这一页最多写两千字。</span>
            </div>
            <details class="nb-sticker-picker">
              <summary>贴纸 <small v-if="draft.stickers.length">{{ draft.stickers.length }} 张</small></summary>
              <div class="nb-stickers">
                <button v-for="sticker in stickers" :key="sticker.id" type="button" :title="sticker.label" :aria-label="sticker.label"
                  :aria-pressed="draft.stickers.includes(sticker.id)" :data-notebook-sticker="sticker.id"
                  :disabled="draft.stickers.length >= NOTEBOOK_LIMITS.stickers && !draft.stickers.includes(sticker.id)" @click="toggleSticker(sticker.id)">
                  <img :src="sticker.url" width="42" height="42" alt="" loading="lazy">
                </button>
              </div>
            </details>
            <label v-if="actions.writeNotebookDraft" class="nb-direction">写作提示
              <input v-model="draft.direction" :maxlength="NOTEBOOK_LIMITS.direction" placeholder="比如：写写今天的排练，末尾贴一张若叶睦。" data-notebook-direction>
            </label>
          </fieldset>
          <div class="nb-editor-actions">
            <button v-if="writing" type="button" data-notebook-cancel @click="cancelWriting">停笔</button>
            <button v-else-if="actions.writeNotebookDraft" type="button" :disabled="saving || model.busy || !scope || bodyLength > NOTEBOOK_LIMITS.body"
              data-notebook-expand @click="expandPage">帮我续写</button>
            <span v-if="writing" role="status">正在写这一页…</span>
            <button type="submit" class="nb-save" :disabled="!canSave" data-notebook-save>
              {{ saving ? '正在保存…' : '保存这一页' }}
            </button>
          </div>
          <p v-if="notice" class="nb-notice" role="status">{{ notice }}</p>
        </form>
        <div class="nb-pages">
          <article v-for="page in visiblePages" :key="page.id" class="nb-page" :data-notebook-page="page.id">
            <div class="nb-meta"><time>{{ dayLabel(page.at) }}</time>
              <span>{{ page.kind === 'observer' ? '旁观备注' : '本人手账' }}</span>
            </div>
            <h3 class="nb-handwriting">{{ page.title }}</h3>
            <p v-for="(paragraph, index) in page.paragraphs" :key="index"
              class="nb-handwriting" :class="{ 'nb-underlined': paragraph.underline }"
              :style="{ color: NOTEBOOK_INKS[paragraph.ink].color }">{{ paragraph.text }}</p>
            <div v-if="page.format?.stickers.length" class="nb-page-stickers">
              <img v-for="id in page.format.stickers" :key="id" :src="stickerById.get(id)?.url"
                :alt="stickerById.get(id)?.label" width="54" height="54" loading="lazy">
            </div>
          </article>
          <p v-if="!loading && !visiblePages.length" class="nb-empty">还没有写下的页面。</p>
        </div>
      </div>
    </div>
  </section>
</template>
