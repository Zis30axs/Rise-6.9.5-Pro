<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ShellModel } from './types';
import { activeProtagonist } from '../runtime/protagonist-world';
import {
  exportNotebook, importNotebook, makePersonalNotebookPage, notebookMinute,
  notebookPeople, notebookTurn, readNotebook, writeNotebook,
  type NotebookPage,
} from '../runtime/notebook';

const props = defineProps<{ model: ShellModel }>();
const scope = computed(() => props.model.memoryScope
  || (props.model.mode === 'demo' ? 'demo:notebook' : ''));
const people = computed(() => notebookPeople(props.model.state));
const selectedId = ref<string>(activeProtagonist(props.model.state));
const search = ref('');
const title = ref('');
const body = ref('');
const pages = ref<NotebookPage[]>([]);
const notice = ref('');
const loading = ref(false);
const saving = ref(false);
let requestNumber = 0;

const selected = computed(() => people.value.find(p => p.id === selectedId.value));
const current = computed(() => activeProtagonist(props.model.state));
const isOwn = computed(() => selectedId.value === current.value);
const now = computed(() => notebookMinute(props.model.state));
const turn = computed(() => notebookTurn(props.model.state));
const roster = computed(() => people.value.filter(p =>
  !search.value.trim() || (p.name + p.id).toLowerCase().includes(search.value.trim().toLowerCase())));
const visiblePages = computed(() => pages.value
  .filter(page => page.personId === selectedId.value && page.at <= now.value && page.turn <= turn.value)
  .slice().reverse());
const pageCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const page of pages.value) {
    if (page.at > now.value || page.turn > turn.value) continue;
    counts.set(page.personId, (counts.get(page.personId) ?? 0) + 1);
  }
  return counts;
});
const dayLabel = (at: number) => {
  const day = Math.floor(at / 1440) + 1;
  const minute = at % 1440;
  return '第 ' + day + ' 天 ' + String(Math.floor(minute / 60)).padStart(2, '0')
    + ':' + String(minute % 60).padStart(2, '0');
};

async function reload() {
  const number = ++requestNumber;
  notice.value = '';
  if (!scope.value) {
    pages.value = [];
    notice.value = '无法识别当前聊天，手账暂不可读写。';
    return;
  }
  loading.value = true;
  try {
    const data = await readNotebook(scope.value);
    if (number === requestNumber) pages.value = data;
  } catch (error) {
    if (number === requestNumber) notice.value =
      error instanceof Error ? error.message : '无法读取手账。';
  } finally {
    if (number === requestNumber) loading.value = false;
  }
}
async function savePage() {
  if (saving.value || !scope.value || !selected.value || !title.value.trim() || !body.value.trim()) return;
  saving.value = true;
  try {
    const page = makePersonalNotebookPage(props.model.state, selectedId.value, title.value, body.value);
    await writeNotebook(scope.value, [page]);
    title.value = '';
    body.value = '';
    await reload();
    notice.value = '这一页已经保存。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '这一页未能保存。';
  } finally { saving.value = false; }
}
async function downloadBackup() {
  try {
    const content = await exportNotebook(scope.value);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = '未读之城-手账备份.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      notice.value = '已准备好手账备份文件。';
    } finally { URL.revokeObjectURL(url); }
  } catch (error) { notice.value = error instanceof Error ? error.message : '导出失败。'; }
}
async function uploadBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  saving.value = true;
  try {
    const added = await importNotebook(scope.value, await file.text(), props.model.state);
    await reload();
    notice.value = '已导入 ' + added + ' 页，新旧记录均已保留。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '导入失败，原记录未修改。';
  } finally {
    input.value = '';
    saving.value = false;
  }
}
watch(scope, () => { pages.value = []; void reload(); });
watch(() => props.model.state.story.at(-1)?.id, () => { void reload(); });
watch(people, items => {
  if (!items.some(p => p.id === selectedId.value)) selectedId.value = current.value;
});
onMounted(() => { void reload(); });
</script>

<template>
  <section class="uc-notebook" data-notebook>
    <header class="nb-heading">
      <div><strong>大家的手账</strong><p>一本本慢慢写下来的生活</p></div>
      <div class="nb-backup">
        <button type="button" :disabled="!scope || saving" data-notebook-export @click="downloadBackup">导出备份</button>
        <label class="nb-import">导入备份<input type="file" accept=".json,application/json" :disabled="!scope || saving" data-notebook-import @change="uploadBackup"></label>
      </div>
    </header>
    <div class="nb-layout">
      <aside class="nb-roster" aria-label="人物手账目录">
        <label class="nb-search">查找人物<input v-model="search" type="search" placeholder="输入姓名…" data-notebook-search></label>
        <div class="nb-people">
          <button v-for="person in roster" :key="person.id" type="button"
            :aria-pressed="selectedId === person.id" :class="{ selected: selectedId === person.id }"
            :data-notebook-person="person.id" @click="selectedId = person.id; title = ''; body = ''; notice = ''">
            <span class="nb-avatar">{{ person.name.slice(-2) }}</span>
            <span class="nb-person-name"><b>{{ person.name }}</b><small>{{ person.group }}</small></span>
            <span class="nb-count">{{ pageCounts.get(person.id) ?? 0 }}</span>
          </button>
          <p v-if="!roster.length" class="nb-empty">没有找到人物。</p>
        </div>
      </aside>
      <main class="nb-book" aria-live="off">
        <template v-if="selected">
          <div class="nb-cover">
            <span class="nb-cover-mark">✿</span>
            <small>{{ selected.group }} · 私人手账</small>
            <h2>{{ selected.name }}</h2>
            <p>过去的每一页，都还在这里。</p>
          </div>
          <p class="nb-privacy">这里是玩家的旁观查阅视角。翻看别人的手账不会让当前主角自动获知其中的内容。</p>
          <div class="nb-pages">
            <article v-for="page in visiblePages" :key="page.id" class="nb-page" :data-notebook-page="page.id">
              <div class="nb-meta"><time>{{ dayLabel(page.at) }}</time>
                <span>{{ page.kind === 'observer' ? '旁观备注' : '本人手账' }}</span>
              </div>
              <h3>{{ page.title }}</h3>
              <p>{{ page.text }}</p>
            </article>
            <p v-if="!loading && !visiblePages.length" class="nb-empty">还没有写下的页面。空白也属于生活的一部分。</p>
          </div>
          <form class="nb-editor" @submit.prevent="savePage">
            <h3>{{ isOwn ? '写下一页' : '添加旁观备注' }}</h3>
            <p v-if="!isOwn">你可以留下自己的观察；这不是代替对方写日记。</p>
            <input v-model="title" type="text" maxlength="60" placeholder="这一页的标题" aria-label="手账标题" data-notebook-title>
            <textarea v-model="body" rows="4" maxlength="2000" placeholder="今天想记下什么…" aria-label="手账正文" data-notebook-body></textarea>
            <button type="submit" :disabled="saving || !scope || !title.trim() || !body.trim()" data-notebook-save>
              {{ saving ? '正在保存…' : '保存这一页' }}
            </button>
          </form>
        </template>
      </main>
    </div>
    <p v-if="notice" class="nb-notice" role="status">{{ notice }}</p>
    <p class="nb-footnote">页面保存在本设备的当前聊天档案中；更换设备或清理网站数据前，请导出备份。回到较早存档时，未来日期的页面暂时不会显示。</p>
  </section>
</template>

<style scoped>
.uc-notebook{display:flex;flex-direction:column;gap:12px;min-height:0;color:#473b4b;font-size:14px;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif}
.nb-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#fff6fa;padding:12px 16px;border:1px solid #eed7e1;border-radius:16px}
.nb-heading strong{font-size:18px}.nb-heading p{margin:3px 0 0;color:#866f7b;font-size:12px}
.nb-backup{display:flex;gap:8px;align-items:center}
.nb-backup button,.nb-import{border:1px solid #d4b2c2;border-radius:10px;background:white;padding:7px 10px;color:#603e54;cursor:pointer;font-size:12px}
.nb-import input{display:none}.nb-layout{display:grid;grid-template-columns:minmax(174px,30%) minmax(0,1fr);gap:12px;min-height:380px}
.nb-roster{background:#f7eef5;border-radius:14px;padding:10px;min-width:0;max-height:68vh;display:flex;flex-direction:column;gap:8px}
.nb-search{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#6a5664}
.nb-search input,.nb-editor input,.nb-editor textarea{box-sizing:border-box;width:100%;border:1px solid #d9bfc8;border-radius:9px;background:#fffefa;color:#40313d;padding:9px;font:inherit}
.nb-people{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:4px}
.nb-people button{display:flex;align-items:center;text-align:left;gap:8px;padding:7px;background:transparent;border:1px solid transparent;border-radius:10px;color:inherit;cursor:pointer;min-width:0}
.nb-people button.selected{border-color:#dcaebd;background:#fffafd}
.nb-avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#e7d1dd;flex:none;color:#725265;font-size:12px}
.nb-person-name{display:flex;flex:1;min-width:0;flex-direction:column}.nb-person-name b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nb-person-name small,.nb-count{color:#8f7985;font-size:11px}
.nb-book{min-width:0;display:flex;flex-direction:column;gap:10px}
.nb-cover{border-radius:15px;background:linear-gradient(135deg,#f9dce8,#faf3ed);border:1px solid #e3c9d0;padding:16px 20px;position:relative}
.nb-cover-mark{position:absolute;right:20px;top:14px;font-size:29px;color:#c17a9a}
.nb-cover small{color:#9c667d}.nb-cover h2{font-size:23px;font-weight:600;margin:7px 0}.nb-cover p{margin:0;color:#907985}
.nb-privacy,.nb-footnote{color:#806c78;font-size:12px;margin:0;line-height:1.65}
.nb-pages{display:flex;flex-direction:column;gap:9px;min-height:80px;max-height:45vh;overflow:auto}
.nb-page{padding:13px 17px;border:1px solid #ead3d9;border-radius:13px;background:repeating-linear-gradient(#fffefa,#fffefa 27px,#f0e3e7 28px);overflow-wrap:anywhere}
.nb-meta{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#927080}
.nb-page h3{font-size:16px;margin:10px 0 7px}.nb-page p{white-space:pre-wrap;line-height:1.9;margin:0}
.nb-empty{padding:20px 8px;color:#977c89;text-align:center;font-size:13px}
.nb-editor{display:flex;flex-direction:column;gap:8px;padding:12px;background:#f9f0f5;border-radius:13px}
.nb-editor h3{margin:0;font-size:15px}.nb-editor p{margin:0;color:#89707c;font-size:12px}
.nb-editor textarea{min-height:94px;resize:vertical}
.nb-editor button{align-self:flex-end;border:0;border-radius:9px;padding:9px 16px;background:#995a78;color:white;cursor:pointer}
.nb-editor button:disabled,.nb-backup button:disabled{opacity:.45;cursor:not-allowed}
.nb-notice{margin:0;padding:8px 11px;border-radius:10px;background:#f4e5ed;color:#6c3852}
@media(max-width:650px){.nb-layout{grid-template-columns:minmax(0,1fr)}.nb-roster{max-height:180px}.nb-people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.nb-pages{max-height:40vh}.nb-heading{padding:10px}}
@media(prefers-reduced-motion:reduce){.uc-notebook *{scroll-behavior:auto}}
</style>
