<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import AcademicProgress from './AcademicProgress.vue';
import AcademicCorrection from './AcademicCorrection.vue';
import AcademicTimetable from './AcademicTimetable.vue';
import SocialSkills from './SocialSkills.vue';
import InventoryPanel from './InventoryPanel.vue';
import WardrobePanel from './WardrobePanel.vue';
import InvitationBook from './InvitationBook.vue';
import SocietyPanel from './SocietyPanel.vue';
import { invitationCards } from './invitation-book';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { locations, getNovelTravelQuote } from '../runtime/model';
import { getCampusInterior } from '../runtime/campus-interiors';
import { getAcademicOverview } from '../runtime/academics';
import { getStoreAvailability } from '../runtime/convenience-store';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { protagonistRecap } from '../runtime/protagonist-narrative';
import { formatGameDate, formatGameStamp, gameCalendar } from '../runtime/game-calendar';
import { gameCalendarOccasions, upcomingGameCalendarOccasions } from '../runtime/japan-calendar-events';
import { diagnosePlayerIllnesses } from '../runtime/illness';
import { lawCases, lawOwner } from '../runtime/law-career';
import { instrumentSkill, INSTRUMENT_SKILL_CAP } from '../runtime/livehouse-visit';
import { musicPersonId } from '../runtime/livehouse';
import { FOCUS_CATALOG, TRAIT_CATALOG, SPIRIT_CATALOG, createGameStrategyState } from '../runtime/strategy';
import { transitStops, transitVehicles } from '../runtime/transit';
import type { ShellActions, ShellModel } from './types';

export type MeTab = 'body' | 'carry' | 'rel' | 'note';

const props = defineProps<{
  model: ShellModel;
  actions: ShellActions;
  novelMode?: boolean;
  initialTab?: MeTab;
  nearbyPersonIds?: string[];
}>();

const emit = defineEmits<{
  close: [];
  phone: [];
  stock: [code?: string];
  notebook: [];
  idcard: [personId: string];
  store: [];
  transit: [];
  travelled: [];
  route: [];
  composeInvitation: [text: string];
  travelInvitation: [id: string];
}>();

const tab = ref<MeTab>(props.initialTab ?? 'body');
watch(() => props.initialTab, next => { if (next) tab.value = next; });

const protagonist = computed(() => activeProtagonist(props.model.state));
const myPersonId = computed(() => musicPersonId(protagonist.value));
const currentLocation = computed(() => locations.find(item => item.id === props.model.state.locationId) ?? locations[0]);
const academicOverview = computed(() => getAcademicOverview(props.model.state.academics));
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const strategy = computed(() => props.model.state.protagonists?.strategy ?? createGameStrategyState(minute.value));
const strategyProfile = computed(() => strategy.value.people[protagonist.value]);
const activeFocus = computed(() => FOCUS_CATALOG.find(f => f.id === strategyProfile.value.active?.id) ?? null);
const traits = computed(() => strategyProfile.value.traits.flatMap(id => TRAIT_CATALOG.filter(row => row.id === id)));
const spirits = computed(() => strategyProfile.value.spirits.flatMap(item => SPIRIT_CATALOG.filter(row => row.id === item.id)));

const meters = computed(() => [
  { id: 'energy', label: '精力', value: props.model.state.player.energy, max: 100, color: '#e7c584' },
  { id: 'morale', label: '精神', value: props.model.state.player.morale, max: 100, color: '#7cc0ae' },
  { id: 'stress', label: '压力', value: props.model.state.player.stress, max: 100, color: '#e3907f' },
  { id: 'health', label: '健康', value: props.model.state.player.health, max: 100, color: '#86ade0' },
]);

const activeIllnesses = computed(() => diagnosePlayerIllnesses(props.model.state.player));
const instrument = computed(() => instrumentSkill(props.model.state));
const storeAvailability = computed(() => getStoreAvailability(props.model.state));

const invitations = computed(() => invitationCards(props.model.state));
const pendingInviteCount = computed(() => invitations.value.filter(i => i.shelf === 'pending' || i.shelf === 'upcoming').length);

const calendarLabel = computed(() => `${formatGameDate(props.model.state.clock.day)} · ${gameCalendar(props.model.state.clock.day).weekdayLabel}`);
const todayOccasions = computed(() => gameCalendarOccasions(props.model.state.clock.day));
const upcomingOccasions = computed(() => upcomingGameCalendarOccasions(props.model.state.clock.day, 30).slice(0, 6));
const stockReviews = computed(() => props.novelMode
  ? props.model.state.protagonists?.devices[protagonist.value].calendar
    .filter(event => event.stockCode && Math.floor(event.start / 1440) === props.model.state.clock.day - 1)
    .sort((a, b) => a.start - b.start) ?? []
  : []);
const reviewTime = (start: number) => `${String(Math.floor(start / 60) % 24).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
const recentChanges = computed(() => props.model.state.journal.slice(-6).reverse());
const lifeRecap = computed(() => protagonistRecap(props.model.state));
const lawProgress = computed(() => lawOwner(props.model.state));
const locationName = (id: string) => locations.find(item => item.id === id)?.name ?? '约定地点';

async function travelToPlan(locationId: string) {
  const destination = props.novelMode ? locationId : getCampusInterior(locationId)?.parentLocationId ?? locationId;
  if (await runInteraction(props.model, props.actions, { type: props.novelMode ? 'novel_travel' : 'travel', locationId: destination })) {
    if (props.novelMode) emit('travelled');
  }
}

function courseTravelBlocked(locationId: string) {
  if (props.novelMode) return getNovelTravelQuote(props.model.state, locationId).blockedReason;
  if (props.model.state.interior && props.model.state.locationId !== locationId) return '先离开当前房间，再前往建筑入口。';
  return null;
}
</script>

<template>
  <section class="uc-me-view" data-me-panel aria-label="我">
    <header class="pn-head">
      <h2>我</h2>
      <span class="pn-sub">{{ protagonistNames[protagonist] }}</span>
      <div class="pn-sp"></div>
      <button type="button" class="pn-close" aria-label="关闭个人面板" @click="emit('close')">×</button>
    </header>

    <nav class="pn-seg" role="tablist" aria-label="个人分页">
      <button type="button" role="tab" :aria-selected="tab === 'body'" :class="{ on: tab === 'body' }" data-me-tab="body" @click="tab = 'body'">身心</button>
      <button type="button" role="tab" :aria-selected="tab === 'carry'" :class="{ on: tab === 'carry' }" data-me-tab="carry" @click="tab = 'carry'">随身</button>
      <button type="button" role="tab" :aria-selected="tab === 'rel'" :class="{ on: tab === 'rel' }" data-me-tab="rel" @click="tab = 'rel'">
        关系
        <i v-if="pendingInviteCount" class="pn-cnt">{{ pendingInviteCount }}</i>
      </button>
      <button type="button" role="tab" :aria-selected="tab === 'note'" :class="{ on: tab === 'note' }" data-me-tab="note" @click="tab = 'note'">手账</button>
    </nav>

    <div class="pn-body">
      <!-- TAB 1: 身心 -->
      <template v-if="tab === 'body'">
        <div class="me-hero">
          <div class="me-av">
            <MapCharacterAvatar :name="protagonistNames[protagonist]" :protagonist-id="protagonist" />
          </div>
          <div class="me-hero-info">
            <div class="me-name">{{ protagonistNames[protagonist] }}</div>
            <div class="me-meta">{{ academicOverview ? `${academicOverview.major.name}专业` : '入学准备中' }} · {{ currentLocation.name }}</div>
            <div v-if="traits.length || spirits.length" class="me-traits">
              <span v-for="t in traits" :key="t.id" class="fp-trait">★ {{ t.title }}</span>
              <span v-for="s in spirits" :key="s.id" class="fp-spirit">❖ {{ s.title }}</span>
            </div>
          </div>
          <button type="button" class="me-rest-btn" :disabled="model.busy" @click="runInteraction(model, actions, { type: 'wait', minutes: 15 })">小憩 15分</button>
        </div>

        <button v-if="activeFocus" type="button" class="me-row-card" @click="emit('route')">
          <div class="me-rc-ic" style="color:#7cc0ae">◷</div>
          <div class="me-rc-main">
            <div class="me-rc-t">正在推进：{{ activeFocus.title }}</div>
            <div class="me-rc-s">已完成 {{ Math.round((strategyProfile.active?.progress ?? 0) / activeFocus.durationMinutes * 100) }}% · 点击查看路线</div>
          </div>
          <span class="me-rc-chev">›</span>
        </button>

        <div class="me-meters" data-status-section="body">
          <div v-for="m in meters" :key="m.id" class="me-mt">
            <div class="me-mt-l">{{ m.label }}</div>
            <div class="me-mt-v" :data-player-stat="m.id">{{ formatGameNumber(m.value) }}<small>/{{ m.max }}</small></div>
            <div class="me-mt-b"><i :style="{ width: Math.min(100, Math.max(0, m.value / m.max * 100)) + '%', background: m.color }"></i></div>
          </div>
        </div>

        <div class="me-card me-sub-stats">
          <div class="me-kv">
            <span class="k">饱腹</span>
            <span class="v" data-player-stat="satiety">{{ formatGameNumber(model.state.player.satiety) }} / 100</span>
          </div>
          <div class="me-kv">
            <span class="k">食物能量储备</span>
            <span class="v" data-player-stat="foodEnergy">{{ formatGameNumber(model.state.player.foodEnergy) }} kcal</span>
          </div>
          <div class="me-kv" data-status-section="illness">
            <span class="k">身体体感</span>
            <span class="v">{{ activeIllnesses.length ? `${activeIllnesses.length} 项不适` : '状况良好' }}</span>
          </div>
        </div>

        <div v-if="activeIllnesses.length" class="me-illness-list">
          <article v-for="illness in activeIllnesses" :key="illness.id" class="me-illness-card" :data-illness="illness.id">
            <div class="me-illness-top"><strong>{{ illness.name }}</strong><span>{{ illness.severityLabel }}</span></div>
            <p>{{ illness.description }} · {{ illness.remedyHint }}</p>
          </article>
        </div>

        <div class="me-sec">技艺与学业</div>
        <div class="me-card" data-status-section="instrument">
          <div class="me-kv-block">
            <div class="me-kv-row">
              <span class="k">乐器熟练度</span>
              <span data-player-stat="instrument">{{ instrument }} / {{ INSTRUMENT_SKILL_CAP }}</span>
            </div>
            <div class="me-bar"><i :style="{ width: instrument + '%', background: '#e7c584' }"></i></div>
          </div>
        </div>

        <AcademicProgress :academics="model.state.academics" />
        <SocialSkills :state="model.state" />

        <details class="me-fold">
          <summary>调整已选专业</summary>
          <AcademicCorrection :model="model" :actions="actions" />
        </details>
      </template>

      <!-- TAB 2: 随身 -->
      <template v-else-if="tab === 'carry'">
        <div class="me-sec">账户与资产</div>
        <button type="button" class="me-row-card" @click="emit('phone')">
          <div class="me-rc-ic">¥</div>
          <div class="me-rc-main">
            <div class="me-rc-t">¥ {{ formatGameNumber(model.state.player.balance) }}</div>
            <div class="me-rc-s">Appie Pay · 银行卡与转账流水在手机中查看</div>
          </div>
          <span class="me-rc-chev">›</span>
        </button>

        <button type="button" class="me-row-card" data-stock-entry @click="emit('stock')">
          <div class="me-rc-ic" style="color:#86ade0">📈</div>
          <div class="me-rc-main">
            <div class="me-rc-t">东都证券</div>
            <div class="me-rc-s">查看股票行情、持仓与资金划转</div>
          </div>
          <span class="me-rc-chev">›</span>
        </button>

        <button type="button" class="me-row-card" data-idcard-entry @click="emit('idcard', myPersonId)">
          <div class="me-rc-ic" style="color:#7cc0ae">🪪</div>
          <div class="me-rc-main">
            <div class="me-rc-t">学生证与通行证</div>
            <div class="me-rc-s">查看个人证件与人物关系图谱</div>
          </div>
          <span class="me-rc-chev">›</span>
        </button>

        <button v-if="storeAvailability.available" type="button" class="me-row-card" data-open-store :disabled="model.busy" @click="emit('store')">
          <div class="me-rc-ic" style="color:#e7c584">🏪</div>
          <div class="me-rc-main">
            <div class="me-rc-t">逛便利店</div>
            <div class="me-rc-s">选购餐食、饮品与日用品</div>
          </div>
          <span class="me-rc-chev">›</span>
        </button>

        <WardrobePanel v-if="novelMode" :model="model" :actions="actions" />

        <div class="me-sec">背包物品</div>
        <InventoryPanel :model="model" :actions="actions" />
      </template>

      <!-- TAB 3: 关系 -->
      <template v-else-if="tab === 'rel'">
        <div data-status-section="social">
          <InvitationBook
            :key="protagonist"
            :model="model"
            :novel-mode="!!novelMode"
            :nearby-person-ids="nearbyPersonIds ?? []"
            @compose="emit('composeInvitation', $event)"
            @travel="emit('travelInvitation', $event)"
          />
        </div>

        <div class="me-sec">乐队 · 社交圈 · 联合体</div>
        <SocietyPanel :model="model" :actions="actions" />
      </template>

      <!-- TAB 4: 手账 -->
      <template v-else>
        <button type="button" class="me-row-card me-notebook-card" data-notebook-entry @click="emit('notebook')">
          <div class="me-rc-ic">📓</div>
          <div class="me-rc-main">
            <div class="me-rc-t">打开手账本</div>
            <div class="me-rc-s">翻阅书页、粘贴票据与贴纸留念</div>
          </div>
          <span class="me-rc-chev">›</span>
        </button>

        <div class="me-sec">今日日程 · {{ calendarLabel }}</div>
        <AcademicTimetable
          v-if="model.state.academics"
          :major-id="model.state.academics.majorId"
          :day="model.state.clock.day"
          :hour="model.state.clock.hour"
          :minute="model.state.clock.minute"
          :busy="model.busy"
          :current-location-id="model.state.locationId"
          :travel-label="novelMode ? '前往课程地点' : '前往建筑入口'"
          :blocked-reason="courseTravelBlocked"
          @travel="travelToPlan"
        />

        <div class="me-card">
          <template v-if="model.state.schedule.length || stockReviews.length">
            <div v-for="plan in model.state.schedule" :key="plan.id" class="me-plan-row" :class="{ done: plan.done }">
              <span class="me-plan-time">{{ plan.time }}</span>
              <div class="me-plan-main">
                <strong>{{ plan.title }}</strong>
                <small>{{ locationName(plan.locationId) }}</small>
              </div>
              <div class="me-plan-acts">
                <button v-if="plan.locationId !== model.state.locationId" type="button" class="fp-btn-line" :data-schedule-destination="plan.locationId" :disabled="model.busy" @click="travelToPlan(plan.locationId)">前往</button>
                <button type="button" class="fp-btn-gold" style="min-height:32px;padding:0 10px;font-size:12px" :disabled="model.busy || plan.done" @click="runInteraction(model, actions, { type: 'complete_schedule', id: plan.id })">{{ plan.done ? '已完成' : '完成' }}</button>
              </div>
            </div>
            <div v-for="review in stockReviews" :key="review.id" class="me-plan-row" :class="{ done: review.reviewed }">
              <span class="me-plan-time">{{ reviewTime(review.start) }}</span>
              <div class="me-plan-main">
                <strong>{{ review.title }}</strong>
                <small>东都证券 · {{ review.duration }} 分钟</small>
              </div>
              <button v-if="review.stockCode" type="button" class="fp-btn-line" @click="emit('stock', review.stockCode)">查看</button>
            </div>
          </template>
          <p v-else class="me-empty-line">今天暂时没有特别安排。</p>
        </div>

        <details class="me-fold" data-calendar-observances>
          <summary>节假日与生日预告</summary>
          <div class="me-card" style="margin-top:8px">
            <div v-for="occasion in todayOccasions" :key="occasion.id" class="me-kv" :data-calendar-event="occasion.id">
              <span class="k">今天 · {{ occasion.name }}</span>
              <span class="v">{{ occasion.kind === 'birthday' ? '生日' : occasion.dayOff ? '假日' : '节庆' }}</span>
            </div>
            <div v-for="occasion in upcomingOccasions" :key="occasion.id" class="me-kv" :data-upcoming-calendar-event="occasion.id">
              <span class="k">{{ occasion.iso.slice(5) }} · {{ occasion.name }}</span>
              <span class="v">{{ occasion.kind === 'birthday' ? '生日' : occasion.dayOff ? '假日' : '节庆' }}</span>
            </div>
          </div>
        </details>

        <div class="me-sec">最近变化</div>
        <div class="me-card" data-status-section="recent">
          <template v-if="recentChanges.length">
            <div v-for="entry in recentChanges" :key="entry.id" class="me-log">
              <time>{{ formatGameStamp(entry.at) }}</time>
              <p>{{ entry.text }}</p>
            </div>
          </template>
          <p v-else class="me-empty-line">活动完成后会在这里留下记录。</p>
        </div>

        <div v-if="model.state.courtroom?.observationKnowledge?.[protagonist]" class="me-card" data-status-section="court-observation" style="margin-top:8px">
          <div class="me-kv">
            <span class="k">法庭旁听见闻</span>
            <span class="v" data-court-observation-total>累计 {{ formatGameNumber(model.state.courtroom?.observationKnowledge?.[protagonist] ?? 0) }} 点</span>
          </div>
        </div>

        <div v-if="lawProgress.active || lawProgress.completedCaseIds.length" class="me-card" data-status-section="law-career" style="margin-top:8px">
          <div class="me-kv">
            <span class="k">律师办案记录</span>
            <span class="v">已结案 {{ lawProgress.completedCaseIds.length }} 件 · 经验 {{ lawProgress.experience }}</span>
          </div>
          <p v-if="lawProgress.active" style="font-size:12px;color:var(--muted);margin-top:4px">正在办理：{{ lawCases.find(item => item.id === lawProgress.active?.caseId)?.title }}</p>
        </div>

        <details v-if="model.state.protagonists" class="me-fold" data-testid="protagonist-recap" :data-owner="protagonist">
          <summary>{{ protagonistNames[protagonist] }} · 各自的日常（{{ lifeRecap.length }}）</summary>
          <div class="me-card" style="margin-top:8px">
            <div v-for="entry in [...lifeRecap].reverse()" :key="entry.id" class="me-log">
              <time>{{ formatGameStamp(entry.at) }}</time>
              <p>{{ entry.text }}</p>
            </div>
            <p v-if="!lifeRecap.length" class="me-empty-line">暂时没有新的个人经历。</p>
          </div>
        </details>

        <details class="me-fold">
          <summary>出行与日常手记（{{ model.state.journal.length }}）</summary>
          <div class="me-card" style="margin-top:8px">
            <div v-if="model.state.transit.lastRide" class="me-kv">
              <span class="k">{{ transitVehicles.find(v => v.id === model.state.transit.lastRide?.vehicleId)?.label }} · {{ transitStops.find(s => s.id === model.state.transit.lastRide?.fromStopId)?.label }} → {{ transitStops.find(s => s.id === model.state.transit.lastRide?.toStopId)?.label }}</span>
              <button type="button" class="fp-btn-line" @click="emit('transit')">交通线路</button>
            </div>
            <div v-for="entry in [...model.state.journal].reverse().slice(0, 20)" :key="entry.id" class="me-log">
              <time>{{ formatGameStamp(entry.at) }}</time>
              <p>{{ entry.text }}</p>
            </div>
          </div>
        </details>
      </template>
    </div>
  </section>
</template>
