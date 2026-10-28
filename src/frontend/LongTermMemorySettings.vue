<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { DEFAULT_MEMORY_SETTINGS, loadMemorySettings, memoryApiKey, saveMemoryApiKey, saveMemorySettings } from '../runtime/long-term-memory/settings';
import type { MemorySettings } from '../runtime/long-term-memory/settings';
import { exportMemory, importMemory, rebuildMemoryEntityIndex, rows } from '../runtime/long-term-memory/storage';
import type { MemoryEvent } from '../runtime/long-term-memory/types';
import { memoryStatus, pauseMemoryWork, runMemoryNow } from '../runtime/long-term-memory/scheduler';
import { memoryArchiveSafe, memoryOutboxWarning } from '../runtime/long-term-memory';

const props = defineProps<{ scope: string }>();
const settings = ref<MemorySettings>(loadMemorySettings());
const assistantKey = ref(memoryApiKey('assistant'));
const embeddingKey = ref(memoryApiKey('embedding'));
const notice = ref('');
const working = ref(false);
const outboxOverflow = ref(0);
const history = ref<MemoryEvent[]>([]);
const search = ref('');
const editId = ref('');
const editSummary = ref('');
const status = ref<{ sources: number; events: number; pending: number; costUsd: number; lastTurn: number; lastError: string } | null>(null);
async function refresh() {
  if (!props.scope) return;
  try {
    status.value = await memoryStatus(props.scope);
    outboxOverflow.value = memoryOutboxWarning(props.scope);
  }
  catch { status.value = null; }
}
function save() {
  try {
    saveMemorySettings(settings.value);
    if (!settings.value.enabled && props.scope) pauseMemoryWork(props.scope);
    saveMemoryApiKey('assistant', assistantKey.value.trim());
    saveMemoryApiKey('embedding', embeddingKey.value.trim());
    notice.value = '长期记忆设置已保存。';
  } catch (error) { notice.value = error instanceof Error ? error.message : '设置保存失败'; }
}
async function runNow() {
  if (working.value || !props.scope) return;
  if (!memoryArchiveSafe(props.scope)) {
    notice.value = '长期记忆正在核对存档，暂时不能整理，请重新进入聊天后再试。';
    return;
  }
  save();
  working.value = true;
  try {
    await runMemoryNow(props.scope);
    await refresh();
    notice.value = '已尝试整理待归档历史，请查看任务状态。';
  } catch (error) { notice.value = error instanceof Error ? error.message : '整理失败'; }
  finally { working.value = false; }
}
async function exportBackup() {
  if (!props.scope) return;
  try {
    const data = await exportMemory(props.scope);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'unread-city-memory-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    notice.value = '长期记忆备份已导出。';
  } catch (error) { notice.value = error instanceof Error ? error.message : '导出失败'; }
}
async function importBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !props.scope) return;
  try {
    if (file.size > 24 * 1024 * 1024) throw new Error('备份文件超过 24 MB');
    await importMemory(props.scope, JSON.parse(await file.text()));
    await refresh();
    notice.value = '长期记忆数据已导入。';
  } catch (error) { notice.value = error instanceof Error ? error.message : '导入失败'; }
  finally { input.value = ''; }
}
async function browseHistory() {
  if (!props.scope) return;
  try {
    const all = await rows<MemoryEvent>('events', props.scope);
    history.value = all.filter(item => !search.value.trim()
      || (item.summary + item.entities.join(' ') + item.participants.join(' '))
        .toLowerCase().includes(search.value.trim().toLowerCase()))
      .sort((a, b) => b.at - a.at || b.turn - a.turn).slice(0, 40);
    notice.value = history.value.length ? '' : '没有找到匹配的历史事件。';
  } catch (error) { notice.value = error instanceof Error ? error.message : '无法浏览长期记忆'; }
}
function chooseEvent(event: MemoryEvent) {
  editId.value = event.id;
  editSummary.value = event.summary;
}
async function repairIndex() {
  if (!props.scope || working.value) return;
  working.value = true;
  try {
    await pauseMemoryWork(props.scope);
    await rebuildMemoryEntityIndex(props.scope);
    notice.value = '当前聊天的实体关系索引已重建。已定稿记忆保持不变。';
  } catch (error) { notice.value = error instanceof Error ? error.message : '索引重建失败'; }
  finally { working.value = false; }
}
function reset() { settings.value = { ...DEFAULT_MEMORY_SETTINGS }; assistantKey.value = ''; embeddingKey.value = ''; save(); }
onMounted(() => { void refresh(); });
</script>

<template>
  <details class="uc-memory-settings" data-memory-settings>
    <summary>长期记忆</summary>
    <div class="uc-memory-settings-content">
      <label class="uc-memory-row"><input v-model="settings.enabled" type="checkbox" data-memory-enabled /> 启用长期记忆旁路</label>
      <label class="uc-memory-row"><input v-model="settings.passive" type="checkbox" /> 自动注入相关往事</label>
      <label>整理间隔（已保存的小说楼数，5–100）
        <input v-model.number="settings.interval" type="number" min="5" max="100" step="1" data-memory-interval />
      </label>
      <div class="uc-narrative-buttons">
        <button v-for="preset in [10, 20, 30]" :key="preset" type="button" @click="settings.interval = preset">每 {{ preset }} 楼</button>
      </div>
      <label class="uc-memory-row"><input v-model="settings.important" type="checkbox" data-memory-important /> 重大剧情提前整理</label>
      <label>主模型检索方式
        <select v-model="settings.protocol" data-memory-protocol>
          <option value="tools">原生 Tools</option><option value="tags">兼容标签</option>
        </select>
      </label>
      <p class="uc-narrative-note">原生 Tools 需要独立叙事 API 支持工具调用；酒馆模型请选兼容标签。记忆故障不影响游戏。</p>
      <label>回忆返回上限（近似 Token）<input v-model.number="settings.tokenBudget" type="number" min="200" max="4000" step="100" /></label>
      <label>单轮检索次数上限<input v-model.number="settings.maxLookups" type="number" min="1" max="2" /></label>
      <h3>整理模型</h3>
      <label>接口格式
        <select v-model="settings.assistantFormat"><option value="chat">Chat Completions</option><option value="responses">Responses</option></select>
      </label>
      <label>API 地址<input v-model="settings.assistantEndpoint" type="url" placeholder="https://example.com/v1" autocomplete="off" /></label>
      <label>模型 ID<input v-model="settings.assistantModel" placeholder="低价整理模型" autocomplete="off" /></label>
      <label>API Key（当前标签页会话）<input v-model="assistantKey" type="password" autocomplete="off" /></label>
      <h3>向量检索（可选）</h3>
      <label>Embedding API 地址<input v-model="settings.embeddingEndpoint" type="url" autocomplete="off" /></label>
      <label>Embedding 模型<input v-model="settings.embeddingModel" autocomplete="off" /></label>
      <label>Embedding Key（当前标签页会话）<input v-model="embeddingKey" type="password" autocomplete="off" /></label>
      <h3>使用量与预算</h3>
      <label>费用预算（美元，0 = 不设限）<input v-model.number="settings.budgetUsd" type="number" min="0" max="1000" step="0.01" /></label>
      <label>整理输入每百万 Token 单价（美元）<input v-model.number="settings.inputPrice" type="number" min="0" step="0.01" /></label>
      <label>整理输出每百万 Token 单价（美元）<input v-model.number="settings.outputPrice" type="number" min="0" step="0.01" /></label>
      <label>Embedding 每百万 Token 单价（美元）<input v-model.number="settings.embeddingPrice" type="number" min="0" step="0.01" /></label>
      <label>单批输入预算（估算 Token）<input v-model.number="settings.inputBudget" type="number" min="2000" max="24000" step="1000" /></label>
      <label>单批输出预算（Token）<input v-model.number="settings.outputBudget" type="number" min="200" max="4000" step="100" /></label>
      <p v-if="status" class="uc-narrative-note">已归档 {{ status.sources }} 条来源 · 已整理 {{ status.events }} 条事件 · 待处理 {{ status.pending }} 批 · 累计费用估算 USD {{ status.costUsd.toFixed(4) }}</p>
      <p v-if="outboxOverflow" class="uc-narrative-note" role="alert">待归档箱已超过本地存档容量：至少 {{ outboxOverflow }} 个来源无法写入同步待办。请及时导出数据库备份，减少连续未整理的楼数。</p>
      <p v-if="status?.lastError" class="uc-narrative-note" role="status">最近一次整理失败：{{ status.lastError }}。重新整理可能产生新的 API 费用。</p>
      <p v-else-if="!status" class="uc-narrative-note">记忆数据库尚未就绪，普通剧情不受影响。</p>
      <div class="uc-narrative-buttons">
        <button type="button" data-memory-save @click="save">保存记忆设置</button>
        <button type="button" :disabled="working" @click="runNow">整理待办／重试</button>
        <button type="button" @click="refresh">刷新状态</button>
        <button type="button" @click="exportBackup">导出备份</button>
        <label class="uc-memory-import">导入备份 <input type="file" accept=".json,application/json" @change="importBackup" /></label>
        <button type="button" @click="reset">重置记忆配置</button>
      </div>
      <details class="uc-memory-manager">
        <summary>长期历史档案</summary>
        <p class="uc-narrative-note">整理成功后摘要就是已定稿的历史记忆，不会由后续模型重新审判或改写。原始来源保留供查询具体对白；当前状态仍由 MVU 决定。</p>
        <label>查找旧事件 <input v-model="search" type="search" maxlength="200" placeholder="人物、物品、关系或关键词" /></label>
        <div class="uc-narrative-buttons">
          <button type="button" :disabled="working" @click="browseHistory">查询历史</button>
          <button type="button" :disabled="working" @click="repairIndex">重建实体索引</button>
        </div>
        <div v-if="history.length" class="uc-memory-history">
          <button v-for="item in history" :key="item.key" type="button"
            :class="{ 'uc-memory-selected': editId === item.id }"
            @click="chooseEvent(item)">
            <small>第 {{ Math.floor(item.at / 1440) + 1 }} 天 · {{ item.kind }}</small>
            <span>{{ item.summary }}</span>
          </button>
        </div>
        <div v-if="editId" class="uc-memory-editor">
          <label>已定稿的历史摘要（只读）
            <textarea :value="editSummary" rows="4" readonly />
          </label>
        </div>
      </details>
      <p v-if="notice" role="status" class="uc-narrative-notice">{{ notice }}</p>
    </div>
  </details>
</template>

<style scoped>
.uc-memory-settings { border:1px solid #b5c3a83f; border-radius:10px; padding:12px; margin-top:14px; }
.uc-memory-settings summary { cursor:pointer; font-weight:700; color:#f1dfb5; }
.uc-memory-settings-content { display:grid; gap:10px; margin-top:12px; }
.uc-memory-settings-content label:not(.uc-memory-row) { display:grid; gap:5px; color:#dcdcc9; font-size:12px; }
.uc-memory-settings-content h3 { margin:8px 0 0; font-size:13px; color:#f1dfb5; }
.uc-memory-settings-content input:not([type='checkbox']):not([type='file']), .uc-memory-settings-content select { width:100%; min-height:44px; background:#12291f; border:1px solid #bed0b75e; color:#f8f4df; border-radius:8px; padding:8px; font-size:14px; }
.uc-memory-row { display:flex; gap:8px; align-items:center; }
.uc-memory-row input { width:18px; height:18px; }
.uc-memory-import { border:1px solid #bed0b75e; border-radius:8px; padding:8px 12px; cursor:pointer; }
.uc-memory-import input { max-width:100%; font-size:11px; }
.uc-memory-manager { margin-top:12px; border-top:1px solid #bed0b75e; padding-top:10px; }
.uc-memory-manager summary { cursor:pointer; font-weight:650; }
.uc-memory-history { display:grid; gap:6px; max-height:320px; overflow:auto; margin:8px 0; }
.uc-memory-history button { display:grid; gap:4px; text-align:left; color:inherit; background:#10261c; border:1px solid #bed0b735; border-radius:6px; padding:8px; }
.uc-memory-history small { color:#bbd3bd; }
.uc-memory-history .uc-memory-selected { border-color:#dfd9aa; }
.uc-memory-editor { display:grid; gap:8px; }
.uc-memory-editor textarea { width:100%; background:#12291f; border:1px solid #bed0b75e; color:#f8f4df; border-radius:8px; padding:8px; }
</style>
