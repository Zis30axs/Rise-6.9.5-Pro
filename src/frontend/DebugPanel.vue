<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { locations } from '../runtime/model';
import { parisPlaces } from '../runtime/paris';
import { beijingPlaces, isBeijingLocation } from '../runtime/beijing';
import { californiaPlaces, isInternationalLocation } from '../runtime/california';
import { campusInteriors } from '../runtime/campus-interiors';
import { activeProtagonist, protagonistNames, type CalendarEvent } from '../runtime/protagonist-world';
import { formatGameDate, gameCalendar } from '../runtime/game-calendar';
import { sceneLandmarks } from './scene-layout';
import type { ShellActions, ShellModel, WorldState } from './types';

type DebugTab = 'stats' | 'world' | 'schedule';
type DraftScheduleRow = { id: string; title: string; locationId: string; time: string; done: boolean };
type DraftCalendarRow = {
  id: string;
  title: string;
  locationId: string;
  day: number;
  time: string;
  duration: number;
  reminded: boolean;
  stockCode?: string;
  reviewed?: boolean;
};

const CORE_CALENDAR_IDS = [
  'gate', 'library', 'cafe', 'dorm', 'teaching', 'sports',
  'junction', 'bookshop', 'convenience', 'street-cafe', 'pocket-park', 'bus-stop',
];

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ close: []; openMap: [] }>();

const activeTab = ref<DebugTab>('stats');
const feedback = ref('');
const errorText = ref('');
let seq = 1;

const protagonist = computed(() => activeProtagonist(props.model.state));
const protagonistName = computed(() => protagonistNames[protagonist.value]);

// Group teleport targets logically so players can jump straight into any sandbox.
const tokyoOutdoors = computed(() =>
  locations.filter(item =>
    !campusInteriors.some(room => room.id === item.id)
    && !isBeijingLocation(item.id)
    && !isInternationalLocation(item.id),
  ),
);
const tokyoInteriors = campusInteriors;
const calendarLocationOptions = computed(() => {
  const seen = new Set<string>();
  const rows: { id: string; name: string }[] = [];
  const push = (id: string, name: string) => {
    if (!seen.has(id)) { seen.add(id); rows.push({ id, name }); }
  };
  for (const id of CORE_CALENDAR_IDS) {
    const loc = locations.find(l => l.id === id);
    if (loc) push(id, loc.name);
  }
  for (const room of campusInteriors) push(room.id, `室内 · ${room.label}`);
  for (const lm of sceneLandmarks) push(lm.id, lm.label);
  return rows;
});

const balance = ref(0);
const energy = ref(80);
const health = ref(80);
const morale = ref(70);
const stress = ref(20);
const satiety = ref(80);
const foodEnergy = ref(1200);
const clockDay = ref(1);
const clockHour = ref(8);
const clockMinute = ref(0);
const teleportLocationId = ref('gate');

const scheduleDraft = ref<DraftScheduleRow[]>([]);
const newSchTitle = ref('');
const newSchLocation = ref('gate');
const newSchTime = ref('10:00');

const calendarDraft = ref<DraftCalendarRow[]>([]);
const newCalTitle = ref('');
const newCalLocation = ref('gate');
const newCalDay = ref(1);
const newCalTime = ref('10:00');
const newCalDuration = ref(60);

function toDayAndTime(startMinute: number): { day: number; time: string } {
  const clamped = Math.max(0, startMinute);
  const day = Math.floor(clamped / 1440) + 1;
  const mod = clamped % 1440;
  const hh = String(Math.floor(mod / 60)).padStart(2, '0');
  const mm = String(mod % 60).padStart(2, '0');
  return { day, time: `${hh}:${mm}` };
}

function toStartMinute(day: number, hhmm: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  const h = match ? Number(match[1]) : 9;
  const m = match ? Number(match[2]) : 0;
  return (Math.max(1, Math.min(365000, Math.round(day))) - 1) * 1440 + h * 60 + m;
}

function syncDraftsFromState(state: WorldState) {
  balance.value = state.player.balance;
  energy.value = state.player.energy;
  health.value = state.player.health;
  morale.value = state.player.morale;
  stress.value = state.player.stress;
  satiety.value = state.player.satiety;
  foodEnergy.value = state.player.foodEnergy;
  clockDay.value = state.clock.day;
  clockHour.value = state.clock.hour;
  clockMinute.value = state.clock.minute;
  teleportLocationId.value = state.locationId;
  scheduleDraft.value = state.schedule.map(item => ({ ...item }));
  const events = state.protagonists?.devices[activeProtagonist(state)]?.calendar ?? [];
  calendarDraft.value = events.map(ev => {
    const dt = toDayAndTime(ev.start);
    return {
      id: ev.id,
      title: ev.title,
      locationId: ev.locationId,
      day: dt.day,
      time: dt.time,
      duration: ev.duration,
      reminded: ev.reminded,
      ...(ev.stockCode !== undefined ? { stockCode: ev.stockCode, reviewed: ev.reviewed } : {}),
    };
  });
  newCalDay.value = state.clock.day;
}

watch(() => props.model.state, syncDraftsFromState, { immediate: true, deep: false });

const clockDatePreview = computed(() => {
  const safeDay = Math.max(1, Math.min(365000, Math.round(Number(clockDay.value) || 1)));
  try {
    const info = gameCalendar(safeDay);
    return `${formatGameDate(safeDay)} · ${info.weekdayLabel}`;
  } catch {
    return `第 ${safeDay} 天`;
  }
});

const currentLocationLabel = computed(
  () => locations.find(l => l.id === props.model.state.locationId)?.name ?? props.model.state.locationId,
);

function dispatchDebug(payload: Omit<Extract<Parameters<ShellActions['dispatch']>[0], { type: 'debug_update' }>, 'type'>, successMessage: string): boolean {
  if (props.model.busy) return false;
  feedback.value = '';
  errorText.value = '';
  props.model.notice = '';
  props.actions.dispatch({ type: 'debug_update', ...payload });
  if (props.model.notice) {
    errorText.value = props.model.notice;
    return false;
  }
  syncDraftsFromState(props.model.state);
  feedback.value = successMessage;
  return true;
}

function applyStatsAndClock() {
  dispatchDebug({
    player: {
      balance: Number(balance.value),
      energy: Number(energy.value),
      health: Number(health.value),
      morale: Number(morale.value),
      stress: Number(stress.value),
      satiety: Number(satiety.value),
      foodEnergy: Number(foodEnergy.value),
    },
    clock: {
      day: Number(clockDay.value),
      hour: Number(clockHour.value),
      minute: Number(clockMinute.value),
    },
  }, '已更新数值与时间并保存到当前存档。');
}

function setRichFunds(amount: number) {
  balance.value = amount;
  dispatchDebug({
    player: { balance: amount },
  }, `已将余额调整为 ¥${amount.toLocaleString()}（Appie Pay 已同步）。`);
}

function fillFullStatus() {
  energy.value = 100;
  health.value = 100;
  morale.value = 100;
  stress.value = 0;
  satiety.value = 100;
  foodEnergy.value = 2400;
  dispatchDebug({
    player: {
      energy: 100,
      health: 100,
      morale: 100,
      stress: 0,
      satiety: 100,
      foodEnergy: 2400,
    },
  }, '已恢复满状态并清空压力。');
}

function stepClockMinutes(delta: number) {
  const total = Math.max(
    0,
    Math.min(
      365000 * 1440 - 1,
      (Math.round(Number(clockDay.value) || 1) - 1) * 1440
        + (Math.round(Number(clockHour.value) || 0) * 60)
        + (Math.round(Number(clockMinute.value) || 0))
        + delta,
    ),
  );
  clockDay.value = Math.floor(total / 1440) + 1;
  clockHour.value = Math.floor((total % 1440) / 60);
  clockMinute.value = total % 60;
}

function setTimeOfDay(hour: number, minute: number) {
  clockHour.value = hour;
  clockMinute.value = minute;
}

function teleportTo(locationId: string, openMapAfter = false, ensureFunds = false) {
  const nextBalance = ensureFunds ? Math.max(Number(balance.value) || 0, 1_000_000) : undefined;
  const ok = dispatchDebug({
    locationId,
    ...(nextBalance !== undefined ? { player: { balance: nextBalance } } : {}),
  }, `已传送至 ${locations.find(l => l.id === locationId)?.name ?? locationId}。`);
  if (ok && openMapAfter) emit('openMap');
}

function addScheduleRow() {
  const title = newSchTitle.value.trim();
  if (!title) { errorText.value = '请输入日程标题。'; return; }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newSchTime.value.trim())) {
    errorText.value = '日程时间需使用 HH:MM（如 14:30）。';
    return;
  }
  scheduleDraft.value.push({
    id: `debug-sch-${Date.now()}-${seq++}`,
    title,
    locationId: newSchLocation.value,
    time: newSchTime.value.trim(),
    done: false,
  });
  newSchTitle.value = '';
  errorText.value = '';
}

function removeScheduleRow(id: string) {
  scheduleDraft.value = scheduleDraft.value.filter(row => row.id !== id);
}

function saveSchedule() {
  for (const row of scheduleDraft.value) {
    if (!row.title.trim()) { errorText.value = '日程标题不能为空。'; return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time.trim())) {
      errorText.value = `日程「${row.title}」的时间格式需为 HH:MM。`;
      return;
    }
  }
  dispatchDebug({
    schedule: scheduleDraft.value.map(row => ({
      id: row.id,
      title: row.title.trim(),
      locationId: row.locationId,
      time: row.time.trim(),
      done: row.done,
    })),
  }, '已保存今日日程记录。');
}

function addCalendarRow() {
  const title = newCalTitle.value.trim();
  if (!title) { errorText.value = '请输入日历事项名称。'; return; }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newCalTime.value.trim())) {
    errorText.value = '日历时间需使用 HH:MM（如 15:00）。';
    return;
  }
  calendarDraft.value.push({
    id: `debug-cal-${Date.now()}-${seq++}`,
    title,
    locationId: newCalLocation.value,
    day: Math.max(1, Math.min(365000, Math.round(Number(newCalDay.value) || 1))),
    time: newCalTime.value.trim(),
    duration: Math.max(1, Math.min(1440, Math.round(Number(newCalDuration.value) || 60))),
    reminded: false,
  });
  newCalTitle.value = '';
  errorText.value = '';
}

function removeCalendarRow(id: string) {
  calendarDraft.value = calendarDraft.value.filter(row => row.id !== id);
}

function saveCalendar() {
  const events: CalendarEvent[] = [];
  for (const row of calendarDraft.value) {
    if (!row.title.trim()) { errorText.value = '日历事项名称不能为空。'; return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time.trim())) {
      errorText.value = `日历「${row.title}」的时间格式需为 HH:MM。`;
      return;
    }
    const base: CalendarEvent = {
      id: row.id,
      title: row.title.trim(),
      locationId: row.locationId,
      start: toStartMinute(row.day, row.time),
      duration: Math.max(1, Math.min(1440, Math.round(Number(row.duration) || 60))),
      reminded: row.reminded,
    };
    if (row.stockCode !== undefined) {
      base.stockCode = row.stockCode;
      base.reviewed = Boolean(row.reviewed);
    }
    events.push(base);
  }
  dispatchDebug({
    calendar: {
      protagonistId: protagonist.value,
      events,
    },
  }, `已保存 ${protagonistName.value} 的手机日历记录。`);
}
</script>

<template>
  <div class="debug-panel-mask" data-debug-modal @click.self="emit('close')">
    <section class="debug-panel-dialog" role="dialog" aria-modal="true" aria-label="调试面板">
      <header class="debug-panel-header">
        <div>
          <h2>调试面板 · {{ protagonistName }}</h2>
          <p class="debug-panel-sub">第 {{ model.state.clock.day }} 天 {{ String(model.state.clock.hour).padStart(2, '0') }}:{{ String(model.state.clock.minute).padStart(2, '0') }} · {{ currentLocationLabel }}</p>
        </div>
        <button type="button" class="debug-close-btn" aria-label="关闭调试面板" @click="emit('close')">×</button>
      </header>

      <nav class="debug-panel-tabs" aria-label="调试分类">
        <button type="button" :aria-pressed="activeTab === 'stats'" :class="{ active: activeTab === 'stats' }" data-debug-tab="stats" @click="activeTab = 'stats'">数值与时间</button>
        <button type="button" :aria-pressed="activeTab === 'world'" :class="{ active: activeTab === 'world' }" data-debug-tab="world" @click="activeTab = 'world'">地点与各国沙盘</button>
        <button type="button" :aria-pressed="activeTab === 'schedule'" :class="{ active: activeTab === 'schedule' }" data-debug-tab="schedule" @click="activeTab = 'schedule'">日程与日历</button>
      </nav>

      <p v-if="feedback" class="debug-feedback" role="status" data-debug-feedback>{{ feedback }}</p>
      <p v-if="errorText" class="debug-error" role="alert" data-debug-error>{{ errorText }}</p>

      <div class="debug-panel-body">
        <section v-if="activeTab === 'stats'" class="debug-section">
          <div class="debug-presets">
            <button type="button" data-debug-preset="funds-5m" :disabled="model.busy" @click="setRichFunds(Math.max(balance, 0) + 5_000_000)">余额 +500万 日元</button>
            <button type="button" data-debug-preset="funds-10m" :disabled="model.busy" @click="setRichFunds(10_000_000)">设为 1000万 日元</button>
            <button type="button" data-debug-preset="full-status" :disabled="model.busy" @click="fillFullStatus">一键满状态</button>
          </div>

          <div class="debug-field-grid">
            <label><span>余额（日元 / Appie Pay）</span><input v-model.number="balance" data-debug-input="balance" type="number" min="0" max="20000000" step="100" /></label>
            <label><span>精力（0–100）</span><input v-model.number="energy" data-debug-input="energy" type="number" min="0" max="100" step="1" /></label>
            <label><span>健康（0–100）</span><input v-model.number="health" data-debug-input="health" type="number" min="0" max="100" step="1" /></label>
            <label><span>精神（0–100）</span><input v-model.number="morale" data-debug-input="morale" type="number" min="0" max="100" step="1" /></label>
            <label><span>压力（0–100）</span><input v-model.number="stress" data-debug-input="stress" type="number" min="0" max="100" step="1" /></label>
            <label><span>饱腹（0–100）</span><input v-model.number="satiety" data-debug-input="satiety" type="number" min="0" max="100" step="1" /></label>
            <label><span>食物能量（0–3000 kcal）</span><input v-model.number="foodEnergy" data-debug-input="foodEnergy" type="number" min="0" max="3000" step="50" /></label>
          </div>

          <div class="debug-clock-box">
            <div class="debug-clock-head">
              <strong>游戏时钟</strong>
              <span>{{ clockDatePreview }}</span>
            </div>
            <div class="debug-clock-inputs">
              <label><span>天数</span><input v-model.number="clockDay" data-debug-input="day" type="number" min="1" max="365000" /></label>
              <label><span>时</span><input v-model.number="clockHour" data-debug-input="hour" type="number" min="0" max="23" /></label>
              <label><span>分</span><input v-model.number="clockMinute" data-debug-input="minute" type="number" min="0" max="59" /></label>
            </div>
            <div class="debug-presets">
              <button type="button" @click="stepClockMinutes(-60)">-1 小时</button>
              <button type="button" @click="stepClockMinutes(15)">+15 分钟</button>
              <button type="button" @click="stepClockMinutes(60)">+1 小时</button>
              <button type="button" @click="stepClockMinutes(1440)">+1 天</button>
              <button type="button" @click="setTimeOfDay(9, 0)">09:00</button>
              <button type="button" @click="setTimeOfDay(20, 0)">20:00</button>
            </div>
          </div>

          <div class="debug-actions-end">
            <button type="button" class="debug-primary" data-debug-apply-stats :disabled="model.busy" @click="applyStatsAndClock">应用数值与时间</button>
          </div>
        </section>

        <section v-else-if="activeTab === 'world'" class="debug-section">
          <p class="debug-hint">快速前往北京、美国加州或东京各区域，并自动开启充裕旅费，直接体验各地立体沙盘。</p>

          <div class="debug-country-cards">
            <article class="debug-country-card">
              <h3>北京沙盘</h3>
              <div class="debug-presets">
                <button type="button" data-debug-sandbox="beijing-forbidden-city" :disabled="model.busy" @click="teleportTo('beijing-forbidden-city', true, true)">故宫博物院 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="beijing-qianmen" :disabled="model.busy" @click="teleportTo('beijing-qianmen', true, true)">前门大街 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="beijing-tsinghua-university" :disabled="model.busy" @click="teleportTo('beijing-tsinghua-university', true, true)">清华大学 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="beijing-shichahai" :disabled="model.busy" @click="teleportTo('beijing-shichahai', true, true)">什刹海 · 打开沙盘</button>
              </div>
            </article>

            <article class="debug-country-card">
              <h3>加州沙盘</h3>
              <div class="debug-presets">
                <button type="button" data-debug-sandbox="cdg-airport" :disabled="model.busy" @click="teleportTo('cdg-airport', true, true)">巴黎戴高乐机场 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="sfo-airport" :disabled="model.busy" @click="teleportTo('sfo-airport', true, true)">旧金山机场 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="california-openai" :disabled="model.busy" @click="teleportTo('california-openai', true, true)">OpenAI 旧金山 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="california-los-angeles" :disabled="model.busy" @click="teleportTo('california-los-angeles', true, true)">洛杉矶 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="california-yosemite" :disabled="model.busy" @click="teleportTo('california-yosemite', true, true)">优胜美地 · 打开沙盘</button>
              </div>
            </article>

            <article class="debug-country-card">
              <h3>东京沙盘</h3>
              <div class="debug-presets">
                <button type="button" data-debug-sandbox="gate" :disabled="model.busy" @click="teleportTo('gate', true, true)">校园南门 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="haneda-airport" :disabled="model.busy" @click="teleportTo('haneda-airport', true, true)">羽田机场 · 打开沙盘</button>
                <button type="button" data-debug-sandbox="circle" :disabled="model.busy" @click="teleportTo('circle', true, true)">CiRCLE · 打开沙盘</button>
              </div>
            </article>
          </div>

          <div class="debug-teleport-row">
            <label>
              <span>任意地点直达</span>
              <select v-model="teleportLocationId" data-debug-select="locationId">
                <optgroup label="东京室外">
                  <option v-for="loc in tokyoOutdoors" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                </optgroup>
                <optgroup label="东京室内">
                  <option v-for="room in tokyoInteriors" :key="room.id" :value="room.id">{{ room.label }}</option>
                </optgroup>
                <optgroup label="中国北京">
                  <option v-for="loc in beijingPlaces" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                </optgroup>
                <optgroup label="巴黎市区与机场">
                  <option v-for="loc in parisPlaces" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                </optgroup>
                <optgroup label="美国加州">
                  <option v-for="loc in californiaPlaces" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                </optgroup>
              </select>
            </label>
            <div class="debug-teleport-buttons">
              <button type="button" data-debug-teleport-only :disabled="model.busy" @click="teleportTo(teleportLocationId, false, false)">仅传送到这里</button>
              <button type="button" class="debug-primary" data-debug-teleport-map :disabled="model.busy" @click="teleportTo(teleportLocationId, true, true)">传送并打开沙盘</button>
            </div>
          </div>
        </section>

        <section v-else class="debug-section">
          <div class="debug-subblock">
            <div class="debug-subhead">
              <h3>今日日程（{{ scheduleDraft.length }} 项）</h3>
              <button type="button" class="debug-primary" data-debug-save-schedule :disabled="model.busy" @click="saveSchedule">保存日程</button>
            </div>
            <div class="debug-add-row">
              <input v-model="newSchTitle" data-debug-new-schedule="title" type="text" maxlength="200" placeholder="新增日程内容" />
              <select v-model="newSchLocation" data-debug-new-schedule="locationId">
                <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
              </select>
              <input v-model="newSchTime" data-debug-new-schedule="time" type="text" maxlength="5" placeholder="HH:MM" />
              <button type="button" data-debug-add-schedule @click="addScheduleRow">添加</button>
            </div>
            <div class="debug-rows">
              <article v-for="(item, idx) in scheduleDraft" :key="item.id" class="debug-item-row" :data-debug-schedule-row="idx">
                <input v-model="item.title" type="text" maxlength="200" aria-label="日程标题" />
                <select v-model="item.locationId" aria-label="日程地点">
                  <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                </select>
                <input v-model="item.time" type="text" maxlength="5" aria-label="日程时间" />
                <label class="debug-check"><input v-model="item.done" type="checkbox" /><span>已完成</span></label>
                <button type="button" class="debug-del" @click="removeScheduleRow(item.id)">删除</button>
              </article>
              <p v-if="!scheduleDraft.length" class="debug-empty">当前没有今日日程。</p>
            </div>
          </div>

          <div class="debug-subblock">
            <div class="debug-subhead">
              <h3>{{ protagonistName }} · 手机日历（{{ calendarDraft.length }} 项）</h3>
              <button type="button" class="debug-primary" data-debug-save-calendar :disabled="model.busy" @click="saveCalendar">保存日历</button>
            </div>
            <div class="debug-add-row debug-add-cal">
              <input v-model="newCalTitle" data-debug-new-calendar="title" type="text" maxlength="100" placeholder="新增日历事项" />
              <select v-model="newCalLocation" data-debug-new-calendar="locationId">
                <option v-for="loc in calendarLocationOptions" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
              </select>
              <input v-model.number="newCalDay" data-debug-new-calendar="day" type="number" min="1" max="365000" title="天数" />
              <input v-model="newCalTime" data-debug-new-calendar="time" type="text" maxlength="5" placeholder="HH:MM" />
              <input v-model.number="newCalDuration" data-debug-new-calendar="duration" type="number" min="1" max="1440" title="持续分钟" />
              <button type="button" data-debug-add-calendar @click="addCalendarRow">添加</button>
            </div>
            <div class="debug-rows">
              <article v-for="(ev, idx) in calendarDraft" :key="ev.id" class="debug-item-row debug-cal-row" :data-debug-calendar-row="idx">
                <input v-model="ev.title" type="text" maxlength="100" :disabled="ev.stockCode !== undefined" aria-label="日历名称" />
                <select v-if="ev.stockCode === undefined" v-model="ev.locationId" aria-label="日历地点">
                  <option v-for="loc in calendarLocationOptions" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                </select>
                <span v-else class="debug-badge">东都证券 · {{ ev.stockCode }}</span>
                <input v-model.number="ev.day" type="number" min="1" max="365000" :disabled="ev.stockCode !== undefined" aria-label="日历天数" />
                <input v-model="ev.time" type="text" maxlength="5" :disabled="ev.stockCode !== undefined" aria-label="日历时间" />
                <label class="debug-check"><input v-model="ev.reminded" type="checkbox" /><span>已提醒</span></label>
                <button type="button" class="debug-del" @click="removeCalendarRow(ev.id)">删除</button>
              </article>
              <p v-if="!calendarDraft.length" class="debug-empty">当前手机日历没有事件。</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
