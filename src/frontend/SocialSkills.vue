<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  SOCIAL_PERSONALITY,
  socialSkillOverview,
  socialSkillQuote,
  type SocialDeviation,
  type SocialSkillId,
} from '../runtime/social-skills';
import { PROTAGONISTS, type ProtagonistId } from '../runtime/dual-protagonists';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { getAcademicMajor, getAcademicOverview } from '../runtime/academics';
import { lawOwner } from '../runtime/law-career';
import { MUSIC_ROLES, musicPersonId, musicRoleNames, type MusicRole } from '../runtime/livehouse';
import { cookingRecipes } from '../runtime/cooking';
import type { WorldState } from './types';

const props = defineProps<{ state: WorldState }>();
const emit = defineEmits<{ practice: [promptText: string] }>();

const owner = computed(() => activeProtagonist(props.state));
const rows = computed(() => socialSkillOverview(props.state, owner.value));

const personState = computed(() => props.state.protagonists?.socialSkills?.people[owner.value]);
const latest = computed(() => personState.value?.latest ?? null);
const latestLabel = computed(() => rows.value.find(row => row.id === latest.value?.skillId)?.label ?? '');

const todayEarned = computed(() => {
  const daily = personState.value?.daily;
  return daily && daily.day === props.state.clock.day ? daily.earned : 0;
});

type AbilityTab = 'skills' | 'academics' | 'expertise';
const currentTab = ref<AbilityTab>('skills');
const expandedSkillId = ref<string | null>(null);
const selectedSkillId = ref<SocialSkillId>('perception');
const selectedDeviation = ref<SocialDeviation>(1);
const compareOwner = ref<ProtagonistId | null>(null);
const copiedPrompt = ref('');

watch(owner, () => {
  if (compareOwner.value === owner.value) {
    compareOwner.value = null;
  }
});

const otherProtagonists = computed(() => PROTAGONISTS.filter(id => id !== owner.value));
const compareRows = computed(() =>
  compareOwner.value ? socialSkillOverview(props.state, compareOwner.value) : null,
);

const selectedSkill = computed(
  () => rows.value.find(row => row.id === selectedSkillId.value) ?? rows.value[0]!,
);

const activeQuote = computed(() =>
  socialSkillQuote(props.state, owner.value, selectedSkill.value.id, selectedDeviation.value),
);

const totalSkillLevel = computed(() => rows.value.reduce((sum, item) => sum + item.level, 0));
const totalSkillXp = computed(() => rows.value.reduce((sum, item) => sum + item.xp, 0));
const topSkill = computed(() =>
  [...rows.value].sort((a, b) => b.xp - a.xp || b.level - a.level)[0] ?? rows.value[0]!,
);

function toggleSkill(id: SocialSkillId) {
  selectedSkillId.value = id;
  expandedSkillId.value = expandedSkillId.value === id ? null : id;
}

function selectRadarSkill(id: SocialSkillId) {
  selectedSkillId.value = id;
  expandedSkillId.value = id;
}

function applyPracticePrompt(text: string) {
  emit('practice', text);
  copiedPrompt.value = text;
  if (typeof document !== 'undefined') {
    const input = document.querySelector<HTMLTextAreaElement>('#uc-action-input');
    if (input) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus({ preventScroll: true });
    }
  }
}

// 六维星盘雷达图几何计算
const RADAR_CENTER_X = 160;
const RADAR_CENTER_Y = 132;
const RADAR_RADIUS = 84;
const RADAR_RINGS = [1, 2, 3, 4, 5] as const;

function polarPoint(index: number, valueOutOfFive: number, radius = RADAR_RADIUS) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / 6;
  const ratio = Math.max(0.12, Math.min(1, valueOutOfFive / 5));
  return {
    x: Number((RADAR_CENTER_X + Math.cos(angle) * radius * ratio).toFixed(2)),
    y: Number((RADAR_CENTER_Y + Math.sin(angle) * radius * ratio).toFixed(2)),
  };
}

function ringPolygonPoints(level: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const pt = polarPoint(i, level);
    return `${pt.x},${pt.y}`;
  }).join(' ');
}

const radarAxes = computed(() =>
  rows.value.map((skill, index) => {
    const outer = polarPoint(index, 5);
    const labelPt = polarPoint(index, 5, RADAR_RADIUS + 28);
    const effectiveLevel = Math.min(5, skill.level + (skill.level < 5 ? (skill.percent / 100) * 0.85 : 0));
    const vertex = polarPoint(index, effectiveLevel);
    const baseVertex = polarPoint(index, skill.initialLevel);
    return {
      skill,
      index,
      outer,
      labelPt,
      vertex,
      baseVertex,
    };
  }),
);

const activePolygonPoints = computed(() =>
  radarAxes.value.map(item => `${item.vertex.x},${item.vertex.y}`).join(' '),
);

const baselinePolygonPoints = computed(() =>
  radarAxes.value.map(item => `${item.baseVertex.x},${item.baseVertex.y}`).join(' '),
);

const comparePolygonPoints = computed(() => {
  if (!compareRows.value) return '';
  return compareRows.value
    .map((skill, index) => {
      const effective = Math.min(5, skill.level + (skill.level < 5 ? (skill.percent / 100) * 0.85 : 0));
      const pt = polarPoint(index, effective);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');
});

const DEVIATION_OPTIONS: readonly { value: SocialDeviation; label: string; hint: string }[] = [
  { value: 0, label: '顺应本心', hint: '符合一贯处事习惯，自然松弛无额外负担' },
  { value: 1, label: '略感违和', hint: '稍作尝试与突破，伴随轻微精力与心理消耗' },
  { value: 2, label: '明显勉强', hint: '走出舒适区正面应对，考验心性与定力' },
  { value: 3, label: '逆心强撑', hint: '强烈违背惯常本性，承受较大压力但磨砺最深' },
];

const PROTAGONIST_SOCIAL_MOTTO: Record<ProtagonistId, { tagline: string; summary: string }> = {
  soyo: {
    tagline: '周全温和 · 体贴入微',
    summary: '极擅长察言观色与人际协调，习惯率先顾及他人感受，内心深处渴望牢不可破的归宿。',
  },
  sakiko: {
    tagline: '意志决绝 · 统率全局',
    summary: '天生的领导者与说服者，目标明确、行动高效，却将自身的贫困与痛苦深藏在心底。',
  },
  emma: {
    tagline: '敏锐纯粹 · 温柔共情',
    summary: '拥有深邃的倾听与感召力，能无条件接纳他人的伤痛，但在高压社交中易耗费精力。',
  },
  renako: {
    tagline: '渴望连结 · 假装现充',
    summary: '外表努力维持开朗充实的现充形象，内心容易紧张内耗，却无比珍视每一位真诚相待的朋友。',
  },
};

// 学业与专业数据
const majorInfo = computed(() => {
  const majorId = props.state.academics?.majorId;
  return majorId ? getAcademicMajor(majorId) : null;
});

const academicOverview = computed(() => getAcademicOverview(props.state.academics));
const majorSubjects = computed(() =>
  academicOverview.value?.subjects.filter(item => item.isMajorSubject) ?? [],
);

// 法学与法庭数据（严格按专业或实际经历门控）
const courtKnowledge = computed(() => {
  return props.state.courtroom?.observationKnowledge?.[owner.value] ?? 0;
});

const lawProgress = computed(() => {
  const career = lawOwner(props.state);
  return {
    experience: career.experience,
    hasActiveCase: !!career.active,
    solvedCount: career.completedCaseIds.length,
    totalPayout: career.totalPayout,
  };
});

const isLawRelevant = computed(() => {
  return (
    props.state.academics?.majorId === 'law' ||
    courtKnowledge.value > 0 ||
    lawProgress.value.experience > 0 ||
    lawProgress.value.solvedCount > 0 ||
    lawProgress.value.hasActiveCase
  );
});

// 非法学专业的专属实务卡片定义
interface MajorPracticeSpec {
  title: string;
  tag: string;
  unit: string;
  color: string;
  desc: string;
}

const MAJOR_PRACTICE_CARDS: Record<string, readonly [MajorPracticeSpec, MajorPracticeSpec]> = {
  'computer-science': [
    {
      title: '程序设计工作台',
      tag: '代码构建',
      unit: '实训熟练度',
      color: '#38bdf8',
      desc: '将逻辑拆解为可运行的模块与结构，在编码调试中锻炼严密的工程思维。',
    },
    {
      title: '算法与网络实验',
      tag: '系统推演',
      unit: '架构见识',
      color: '#818cf8',
      desc: '分析数据组织效率与通信协议脉络，沉淀解决复杂问题的技术直觉。',
    },
  ],
  'chinese-literature': [
    {
      title: '文学采风与手札',
      tag: '文本细读',
      unit: '采风积累',
      color: '#f472b6',
      desc: '在日常街巷与典籍阅读中捕捉细腻意象，记录人物神态与时代语境。',
    },
    {
      title: '批评与创作实务',
      tag: '修辞构思',
      unit: '文思沉淀',
      color: '#fb7185',
      desc: '锤炼字句节奏与叙事层次，将阅读所得转化为有据可依的评论与文章。',
    },
  ],
  mathematics: [
    {
      title: '数理建模推演',
      tag: '结构推演',
      unit: '推演点数',
      color: '#60a5fa',
      desc: '运用微积分与线性空间刻画变化规律，从纷繁表象中提炼简洁的数学模型。',
    },
    {
      title: '概率与命题求证',
      tag: '逻辑实证',
      unit: '论证积累',
      color: '#34d399',
      desc: '在不确定性中评估期望与分布，以严密推理检验每一条假设的边界。',
    },
  ],
  economics: [
    {
      title: '都会商业观察',
      tag: '市场脉搏',
      unit: '观察点数',
      color: '#fbbf24',
      desc: '透过商圈消费、定价策略与个体选择，洞察城市日常生活背后的供需逻辑。',
    },
    {
      title: '经济统计实务',
      tag: '数据解读',
      unit: '分析经验',
      color: '#f59e0b',
      desc: '整理抽样指标与宏观趋势，客观辨析数据结论的适用范围与现实局限。',
    },
  ],
  design: [
    {
      title: '视觉构成工坊',
      tag: '版式色彩',
      unit: '工坊点数',
      color: '#e879f9',
      desc: '推敲字体层级、留白比例与色彩节奏，让画面准确传达情绪与主题。',
    },
    {
      title: '交互原型设计',
      tag: '体验洞察',
      unit: '设计积累',
      color: '#c084fc',
      desc: '围绕真实使用场景梳理信息路径与反馈细节，打磨自然顺畅的器物与界面。',
    },
  ],
  music: [
    {
      title: '曲目编排创作',
      tag: '动机和声',
      unit: '创作积累',
      color: '#38bdf8',
      desc: '将脑海中的短动机发展为完整乐句，在调式与和声织体中寻找独属于自己的声音。',
    },
    {
      title: '声部合奏研习',
      tag: '乐理审听',
      unit: '合奏默契',
      color: '#a78bfa',
      desc: '结合音乐史风格与记谱分析，在多声部配合中校准节拍、呼吸与情绪张力。',
    },
  ],
  psychology: [
    {
      title: '心理访谈手记',
      tag: '认知共情',
      unit: '访谈积累',
      color: '#a78bfa',
      desc: '区分客观观察与主观推断，在倾听与记录中理解个体情绪与动机的来龙去脉。',
    },
    {
      title: '社会行为观察',
      tag: '群体互动',
      unit: '观察点数',
      color: '#34d399',
      desc: '留意人际互动中的归因习惯与群体氛围，温和审慎地看待每一次心理变化。',
    },
  ],
  biology: [
    {
      title: '生态标本观察',
      tag: '自然博物',
      unit: '观察记录',
      color: '#10b981',
      desc: '追踪校园与城市绿地中的植物物候与群落关系，记录生命与环境交织的痕迹。',
    },
    {
      title: '细胞与遗传实验',
      tag: '生命机理',
      unit: '实验点数',
      color: '#38bdf8',
      desc: '从微观结构与遗传规律出发，严谨比对实验现象与生命活动的内在联系。',
    },
  ],
};

const activeMajorPracticeCards = computed(() => {
  const major = majorInfo.value;
  if (!major || major.id === 'law') return [];
  const specs = MAJOR_PRACTICE_CARDS[major.id];
  if (!specs) return [];
  const subjPoints = majorSubjects.value.map(s => s.points);
  const firstMetric = (subjPoints[0] ?? 0) + Math.floor((subjPoints[2] ?? 0) * 0.5);
  const secondMetric = (subjPoints[1] ?? 0) + Math.ceil((subjPoints[2] ?? 0) * 0.5);
  return [
    { ...specs[0], value: firstMetric, percent: Math.min(100, Math.round((firstMetric / 360) * 100)) },
    { ...specs[1], value: secondMetric, percent: Math.min(100, Math.round((secondMetric / 360) * 100)) },
  ];
});

// 音乐与舞台五维乐器图谱
const DEFAULT_MUSIC_SKILLS: Record<ProtagonistId, Record<MusicRole, number>> = {
  soyo: { vocal: 42, guitar: 35, bass: 90, drums: 30, keyboard: 52 },
  sakiko: { vocal: 55, guitar: 48, bass: 45, drums: 38, keyboard: 96 },
  emma: { vocal: 76, guitar: 40, bass: 32, drums: 28, keyboard: 64 },
  renako: { vocal: 48, guitar: 54, bass: 36, drums: 40, keyboard: 42 },
};

const musicStats = computed(() => {
  const personId = musicPersonId(owner.value);
  const savedProfile = props.state.livehouse?.profiles.find(p => p.personId === personId);
  const baseSkills = savedProfile?.skills ?? DEFAULT_MUSIC_SKILLS[owner.value];
  const instruments = MUSIC_ROLES.map(role => ({
    role,
    label: musicRoleNames[role],
    score: baseSkills[role] ?? 25,
  }));
  const joinedBands = (props.state.livehouse?.bands ?? []).filter(b =>
    b.members.some(m => m.personId === personId),
  );
  const bookings = (props.state.livehouse?.bookings ?? []).filter(b =>
    b.memberIds.includes(personId),
  );
  const topInstrument = [...instruments].sort((a, b) => b.score - a.score)[0]!;
  return {
    instruments,
    joinedBands,
    bookings,
    topInstrument,
  };
});

// 料理与生活手艺数据
const cookingStats = computed(() => {
  const sessions = (props.state.cooking?.sessions ?? []).filter(s => s.owner === owner.value);
  const settledSessions = sessions.filter(s => s.status === 'settled');
  const settledTotal = Math.max(
    settledSessions.length,
    (props.state.cooking?.settledIds ?? []).filter(id => id.startsWith(`cook-${owner.value}-`)).length,
  );
  const recipeCount = cookingRecipes.length;
  return {
    settledTotal,
    recipeCount,
    recipes: cookingRecipes,
    percent: Math.min(100, Math.round((settledTotal / Math.max(1, recipeCount)) * 100)),
  };
});
</script>

<template>
  <section class="uc-skills" data-abilities-panel :data-skills-owner="owner" aria-label="综合能力">
    <!-- 主头部区域 -->
    <header class="uc-abilities-header">
      <div class="uc-abilities-hero-profile">
        <div class="uc-hero-title-group">
          <h2>能力体系 · 星盘与专长</h2>
          <div class="uc-hero-badges">
            <span class="uc-level-sum-badge">总阶位 Lv.{{ totalSkillLevel }} / 30</span>
            <span class="uc-personality-badge" :data-personality="SOCIAL_PERSONALITY[owner]">
              {{ protagonistNames[owner] }} · {{ SOCIAL_PERSONALITY[owner] }}
            </span>
          </div>
        </div>
        <p class="uc-hero-motto">
          <strong>{{ PROTAGONIST_SOCIAL_MOTTO[owner]?.tagline }}</strong>：{{ PROTAGONIST_SOCIAL_MOTTO[owner]?.summary }}
        </p>
      </div>

      <!-- 选项卡导航 -->
      <nav class="uc-abilities-nav" aria-label="能力分类选择">
        <button
          type="button"
          :class="{ active: currentTab === 'skills' }"
          @click="currentTab = 'skills'"
        >
          社交与心性 ({{ rows.length }})
        </button>
        <button
          type="button"
          :class="{ active: currentTab === 'academics' }"
          @click="currentTab = 'academics'"
        >
          专业学识 {{ majorInfo ? `· ${majorInfo.name}` : '' }}
        </button>
        <button
          type="button"
          :class="{ active: currentTab === 'expertise' }"
          @click="currentTab = 'expertise'"
        >
          实务与见闻
        </button>
      </nav>
    </header>

    <!-- 模块一：社交与心性（六维星盘 + 交互工作台 + 技能卡） -->
    <div v-if="currentTab === 'skills'" class="uc-skills-content">
      <!-- 视觉核心区：六维SVG星盘雷达图 + 今日感悟环与对比 -->
      <div class="uc-radar-dashboard" data-radar-dashboard>
        <div class="uc-radar-stage">
          <svg
            class="uc-radar-svg"
            data-radar-chart
            viewBox="0 0 320 264"
            role="img"
            :aria-label="protagonistNames[owner] + '的六维社交能力星盘'"
          >
            <defs>
              <radialGradient id="uc-radar-fill" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.48" />
                <stop offset="100%" stop-color="#6366f1" stop-opacity="0.18" />
              </radialGradient>
              <radialGradient id="uc-radar-compare-fill" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.32" />
                <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.12" />
              </radialGradient>
            </defs>

            <!-- 5层同心六边形刻度网 -->
            <polygon
              v-for="ring in RADAR_RINGS"
              :key="'ring-' + ring"
              :points="ringPolygonPoints(ring)"
              class="uc-radar-ring"
              :class="{ 'uc-radar-ring-outer': ring === 5 }"
            />

            <!-- 6条辐射轴线 -->
            <line
              v-for="axis in radarAxes"
              :key="'axis-' + axis.skill.id"
              :x1="RADAR_CENTER_X"
              :y1="RADAR_CENTER_Y"
              :x2="axis.outer.x"
              :y2="axis.outer.y"
              class="uc-radar-axis"
              :class="{ active: selectedSkillId === axis.skill.id }"
            />

            <!-- 初始心性基底多边形（虚线） -->
            <polygon
              :points="baselinePolygonPoints"
              class="uc-radar-baseline"
            />

            <!-- 对比主角叠加多边形 -->
            <polygon
              v-if="comparePolygonPoints"
              :points="comparePolygonPoints"
              class="uc-radar-compare-poly"
              data-radar-compare-polygon
            />

            <!-- 当前主角能力多边形 -->
            <polygon
              :points="activePolygonPoints"
              class="uc-radar-active-poly"
              data-radar-active-polygon
            />

            <!-- 6个可点击顶点与标签 -->
            <g
              v-for="axis in radarAxes"
              :key="'node-' + axis.skill.id"
              class="uc-radar-vertex-group"
              :class="{ selected: selectedSkillId === axis.skill.id }"
              :data-radar-node="axis.skill.id"
              @click="selectRadarSkill(axis.skill.id)"
            >
              <circle
                :cx="axis.vertex.x"
                :cy="axis.vertex.y"
                :r="selectedSkillId === axis.skill.id ? 6 : 4.2"
                :fill="axis.skill.themeColor"
                stroke="#0f172a"
                stroke-width="1.8"
              />
              <text
                :x="axis.labelPt.x"
                :y="axis.labelPt.y - 4"
                text-anchor="middle"
                class="uc-radar-label-name"
              >
                {{ axis.skill.label }}
              </text>
              <text
                :x="axis.labelPt.x"
                :y="axis.labelPt.y + 10"
                text-anchor="middle"
                class="uc-radar-label-lv"
                :fill="axis.skill.themeColor"
              >
                Lv.{{ axis.skill.level }}
              </text>
            </g>
          </svg>

          <!-- 图例与对比切换器 -->
          <div class="uc-radar-controls" data-radar-compare>
            <span class="uc-compare-label">星盘叠影对比：</span>
            <button
              type="button"
              class="uc-compare-btn"
              :class="{ active: compareOwner === null }"
              data-compare-target="none"
              @click="compareOwner = null"
            >
              初态基准
            </button>
            <button
              v-for="otherId in otherProtagonists"
              :key="otherId"
              type="button"
              class="uc-compare-btn"
              :class="{ active: compareOwner === otherId }"
              :data-compare-target="otherId"
              @click="compareOwner = compareOwner === otherId ? null : otherId"
            >
              对比{{ protagonistNames[otherId] }}
            </button>
          </div>
        </div>

        <!-- 右侧：今日感悟环形仪表与总览指标 -->
        <div class="uc-radar-metrics">
          <div class="uc-daily-pace" aria-label="今日社交实战心得">
            <div class="uc-daily-ring-wrap">
              <svg class="uc-daily-ring-svg" viewBox="0 0 68 68" aria-hidden="true">
                <circle cx="34" cy="34" r="27" class="uc-ring-bg" />
                <circle
                  cx="34"
                  cy="34"
                  r="27"
                  class="uc-ring-fg"
                  :stroke-dasharray="169.65"
                  :stroke-dashoffset="169.65 * (1 - Math.min(1, todayEarned / 24))"
                />
                <text x="34" y="32" text-anchor="middle" class="uc-ring-val">{{ todayEarned }}</text>
                <text x="34" y="44" text-anchor="middle" class="uc-ring-max">/ 24 XP</text>
              </svg>
              <div class="uc-daily-ring-copy">
                <div class="uc-pace-info">
                  <span>今日社交心得积累</span>
                  <strong>{{ todayEarned }} / 24 点经验</strong>
                </div>
                <div class="uc-pace-track" role="progressbar" :aria-valuenow="todayEarned" aria-valuemin="0" aria-valuemax="24">
                  <span :style="{ width: Math.min(100, (todayEarned / 24) * 100) + '%' }"></span>
                </div>
                <small class="uc-pace-hint">与居民自然交流、邀约与真诚表达可积累心性感悟。</small>
              </div>
            </div>
          </div>

          <div class="uc-kpi-strip">
            <div class="uc-kpi-box">
              <small>核心特长</small>
              <strong :style="{ color: topSkill.themeColor }">{{ topSkill.label }} Lv.{{ topSkill.level }}</strong>
              <span>{{ topSkill.stageTitle }}</span>
            </div>
            <div class="uc-kpi-box">
              <small>累计心性经验</small>
              <strong>{{ totalSkillXp }} XP</strong>
              <span>六维总阶 {{ totalSkillLevel }} / 30</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 交互式心性研习与偏离度模拟器 -->
      <section class="uc-skill-workbench" data-skill-workbench :aria-label="selectedSkill.label + '心性推演台'">
        <header class="uc-workbench-header">
          <div class="uc-workbench-title">
            <span class="uc-skill-icon-badge" :style="{ color: selectedSkill.themeColor, borderColor: selectedSkill.themeColor + '55' }">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="selectedSkill.icon" fill="currentColor" /></svg>
            </span>
            <div>
              <div class="uc-workbench-name-row">
                <h3>{{ selectedSkill.label }} · 心性消耗与行动推演</h3>
                <span class="uc-skill-stage-badge">{{ selectedSkill.stageTitle }} · Lv.{{ selectedSkill.level }}</span>
              </div>
              <p>{{ selectedSkill.trait }}</p>
            </div>
          </div>
          <div class="uc-crystal-pips" :aria-label="'当前等级 ' + selectedSkill.level + ' 级'">
            <span
              v-for="pip in 5"
              :key="pip"
              class="uc-crystal-pip"
              :class="{ filled: pip <= selectedSkill.level }"
              :style="pip <= selectedSkill.level ? { color: selectedSkill.themeColor } : undefined"
            >◆</span>
          </div>
        </header>

        <!-- 4档心态偏离度交互按钮 -->
        <div class="uc-simulator-controls">
          <span class="uc-sim-label">选择心态偏离程度（测算当前等级下的真实负担）：</span>
          <div class="uc-deviation-tabs" role="group" aria-label="心态偏离度档位">
            <button
              v-for="opt in DEVIATION_OPTIONS"
              :key="opt.value"
              type="button"
              class="uc-deviation-btn"
              :class="{ active: selectedDeviation === opt.value }"
              :data-deviation-btn="opt.value"
              @click="selectedDeviation = opt.value"
            >
              <strong>偏离 {{ opt.value }}</strong>
              <span>{{ opt.label }}</span>
            </button>
          </div>
          <small class="uc-deviation-hint">{{ DEVIATION_OPTIONS[selectedDeviation]?.hint }}</small>
        </div>

        <!-- 实时图形化仪表条 -->
        <div class="uc-quote-meters" data-quote-meters>
          <div class="uc-quote-meter">
            <div class="uc-meter-head">
              <span>精力负担</span>
              <strong data-quote-energy>−{{ activeQuote.energyCost }}</strong>
            </div>
            <div class="uc-meter-bar">
              <span class="uc-meter-fill energy" :style="{ width: Math.min(100, (activeQuote.energyCost / 5) * 100) + '%' }"></span>
            </div>
            <small v-if="selectedSkill.mitigation > 0 && selectedDeviation > 0" class="uc-meter-saved">
              熟练度已减免 {{ selectedSkill.mitigation }} 点精力
            </small>
            <small v-else>单次上限 5 点</small>
          </div>

          <div class="uc-quote-meter">
            <div class="uc-meter-head">
              <span>压力负荷</span>
              <strong data-quote-stress>+{{ activeQuote.stressGain }}</strong>
            </div>
            <div class="uc-meter-bar">
              <span class="uc-meter-fill stress" :style="{ width: Math.min(100, (activeQuote.stressGain / 7) * 100) + '%' }"></span>
            </div>
            <small v-if="selectedSkill.mitigation > 0 && selectedDeviation > 0" class="uc-meter-saved">
              熟练度已减免 {{ selectedSkill.mitigation }} 点压力
            </small>
            <small v-else>单次上限 7 点</small>
          </div>

          <div class="uc-quote-meter">
            <div class="uc-meter-head">
              <span>单次感悟经验</span>
              <strong data-quote-xp>+{{ activeQuote.possibleXp }} XP</strong>
            </div>
            <div class="uc-meter-bar">
              <span class="uc-meter-fill xp" :style="{ width: Math.min(100, (activeQuote.possibleXp / 6) * 100) + '%' }"></span>
            </div>
            <small>突破本性可获更高感悟</small>
          </div>

          <div class="uc-quote-meter">
            <div class="uc-meter-head">
              <span>正向好感转化</span>
              <strong data-quote-affinity>{{ Math.round(activeQuote.positiveMultiplier * 100) }}%</strong>
            </div>
            <div class="uc-meter-bar">
              <span class="uc-meter-fill affinity" :style="{ width: Math.round(activeQuote.positiveMultiplier * 100) + '%' }"></span>
            </div>
            <small>自然流露更容易打动人心</small>
          </div>
        </div>

        <!-- 一键填入行动框预设 -->
        <div class="uc-practice-presets">
          <div class="uc-presets-head">
            <span>填入行动输入框（点击即可带入下方故事输入栏）：</span>
            <small v-if="copiedPrompt" class="uc-preset-feedback" data-practice-feedback>已带入行动输入框 ✓</small>
          </div>
          <div class="uc-preset-chips">
            <button
              v-for="(promptText, idx) in selectedSkill.practicePrompts"
              :key="idx"
              type="button"
              class="uc-preset-chip"
              :data-practice-chip="idx"
              @click="applyPracticePrompt(promptText)"
            >
              <span>「{{ promptText }}」</span>
              <b>填入 ↗</b>
            </button>
          </div>
        </div>
      </section>

      <!-- 六维技能图形卡片网格 -->
      <div class="uc-skills-grid">
        <article
          v-for="skill in rows"
          :key="skill.id"
          class="uc-skill-card"
          :class="{ expanded: expandedSkillId === skill.id, selected: selectedSkillId === skill.id }"
          :data-skill="skill.id"
          @click="toggleSkill(skill.id)"
        >
          <header class="uc-skill-top">
            <div class="uc-skill-title-line">
              <span class="uc-skill-icon-badge" :style="{ color: skill.themeColor, borderColor: skill.themeColor + '55' }">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="skill.icon" fill="currentColor" /></svg>
              </span>
              <div>
                <div class="uc-skill-name-wrap">
                  <h3>{{ skill.label }}</h3>
                  <span class="uc-skill-stage-badge">{{ skill.stageTitle }}</span>
                </div>
                <div class="uc-card-crystals" aria-hidden="true">
                  <span
                    v-for="pip in 5"
                    :key="pip"
                    class="uc-crystal-pip"
                    :class="{ filled: pip <= skill.level }"
                    :style="pip <= skill.level ? { color: skill.themeColor } : undefined"
                  >◆</span>
                </div>
              </div>
            </div>

            <!-- 环形等级徽章 -->
            <div class="uc-skill-ring-badge">
              <svg viewBox="0 0 44 44" class="uc-card-ring-svg" aria-hidden="true">
                <circle cx="22" cy="22" r="18" class="uc-card-ring-bg" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  class="uc-card-ring-fg"
                  :stroke="skill.themeColor"
                  :stroke-dasharray="113.1"
                  :stroke-dashoffset="113.1 * (1 - skill.percent / 100)"
                />
              </svg>
              <strong class="uc-skill-level" :data-skill-level="skill.id">Lv.{{ skill.level }}</strong>
            </div>
          </header>

          <p class="uc-skill-tagline">{{ skill.tagline }}</p>

          <!-- 经验条与数值 -->
          <div class="uc-progress-block">
            <div class="uc-skill-track" role="progressbar" :aria-label="skill.label + '熟练度'" :aria-valuenow="skill.percent" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: skill.percent + '%', backgroundColor: skill.themeColor }"></span>
            </div>
            <div class="uc-skill-exp-row">
              <small v-if="skill.level < 5">累计 {{ skill.xp }} XP · 距下一级还需 {{ skill.remaining }} 点</small>
              <small v-else class="uc-max-level">已达当前阶段圆满境界（{{ skill.xp }} XP）</small>
              <small class="uc-percent-text">{{ skill.percent }}%</small>
            </div>
          </div>

          <!-- 实战效果与偏离减免 -->
          <div class="uc-skill-effects">
            <div class="uc-effect-pill" :class="{ active: skill.mitigation > 0 }">
              <span class="uc-effect-dot"></span>
              <span v-if="skill.mitigation > 0">偏离负担减免：精力 −{{ skill.mitigation }}，压力 −{{ skill.mitigation }}</span>
              <span v-else>Lv.3 解锁：性格偏离精力与压力消耗 −1</span>
            </div>
          </div>

          <!-- 展开详情区域 -->
          <div v-if="expandedSkillId === skill.id" class="uc-skill-expanded-details">
            <div class="uc-detail-section">
              <h4>应用场景</h4>
              <p>{{ skill.application }}</p>
            </div>
            <div class="uc-detail-section">
              <h4>心性契合度 · {{ protagonistNames[owner] }}</h4>
              <p class="uc-trait-quote">{{ skill.trait }}</p>
            </div>
            <div class="uc-detail-section">
              <h4>成长展望</h4>
              <p v-if="skill.level < 5">提升至更高等级能够进一步缓解非惯常沟通带来的疲惫与心理紧绷感。</p>
              <p v-else>该项能力已臻炉火纯青，无论顺境逆境皆能从容应对。</p>
            </div>
          </div>

          <footer class="uc-skill-footer">
            <span>{{ expandedSkillId === skill.id ? '收起详情 ▴' : '点击同步至推演台并展开详情 ▾' }}</span>
          </footer>
        </article>
      </div>

      <!-- 最近练习记录 -->
      <div v-if="latest" class="uc-skills-latest-card" data-skills-latest>
        <div class="uc-latest-badge">最近实战研习</div>
        <div class="uc-latest-body">
          <p>
            <strong>{{ latestLabel }}</strong>：获得经验 +{{ latest.earned }} 点，消耗精力 {{ latest.energyCost }}，增加压力 {{ latest.stressGain }}。
          </p>
          <small>每一次突破惯常方式的真诚交流，都是磨砺心性与加深羁绊的真实足印。</small>
        </div>
      </div>
    </div>

    <!-- 模块二：专业学识（三环同心图谱 + 阶梯进度） -->
    <div v-else-if="currentTab === 'academics'" class="uc-academics-content">
      <div v-if="majorInfo && academicOverview" class="uc-major-card">
        <div class="uc-major-visual-top">
          <!-- 三门课程同心圆环图 -->
          <svg class="uc-academic-rings-svg" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="48" class="uc-acad-ring-bg" />
            <circle cx="60" cy="60" r="36" class="uc-acad-ring-bg" />
            <circle cx="60" cy="60" r="24" class="uc-acad-ring-bg" />
            <circle
              v-if="majorSubjects[0]"
              cx="60"
              cy="60"
              r="48"
              class="uc-acad-ring-fg"
              stroke="#38bdf8"
              :stroke-dasharray="301.59"
              :stroke-dashoffset="301.59 * (1 - Math.min(1, majorSubjects[0].points / 720))"
            />
            <circle
              v-if="majorSubjects[1]"
              cx="60"
              cy="60"
              r="36"
              class="uc-acad-ring-fg"
              stroke="#a78bfa"
              :stroke-dasharray="226.19"
              :stroke-dashoffset="226.19 * (1 - Math.min(1, majorSubjects[1].points / 720))"
            />
            <circle
              v-if="majorSubjects[2]"
              cx="60"
              cy="60"
              r="24"
              class="uc-acad-ring-fg"
              stroke="#34d399"
              :stroke-dasharray="150.8"
              :stroke-dashoffset="150.8 * (1 - Math.min(1, majorSubjects[2].points / 720))"
            />
            <text x="60" y="58" text-anchor="middle" class="uc-acad-ring-total">{{ academicOverview.totalPoints }}</text>
            <text x="60" y="71" text-anchor="middle" class="uc-acad-ring-sub">总学分点</text>
          </svg>

          <div class="uc-major-summary">
            <header class="uc-major-header">
              <div>
                <span class="uc-major-label">已确认学修方向</span>
                <h3>{{ majorInfo.name }}</h3>
              </div>
              <span class="uc-major-faculty">本科主修</span>
            </header>
            <p class="uc-major-desc">{{ majorInfo.description }}</p>
          </div>
        </div>

        <h4 class="uc-subheading">专业三门必修课业进度（阶段刻度：120 / 360 / 720）</h4>
        <div class="uc-subject-list">
          <article v-for="(subj, idx) in majorSubjects" :key="subj.subject.id" class="uc-subject-item">
            <div class="uc-subject-header">
              <div class="uc-subject-name-group">
                <span
                  class="uc-subject-dot"
                  :style="{ backgroundColor: ['#38bdf8', '#a78bfa', '#34d399'][idx % 3] }"
                ></span>
                <strong>{{ subj.subject.name }}</strong>
                <span class="uc-subject-stage-pill">{{ subj.stageLabel }}</span>
              </div>
              <span>{{ subj.points }} 学分点数</span>
            </div>
            <div class="uc-skill-track uc-subject-track" role="progressbar" :aria-valuenow="subj.points" aria-valuemin="0" aria-valuemax="720">
              <span
                :style="{
                  width: Math.min(100, (subj.points / 720) * 100) + '%',
                  backgroundColor: ['#38bdf8', '#a78bfa', '#34d399'][idx % 3],
                }"
              ></span>
            </div>
            <div class="uc-subject-meta">
              <small>当前研习目标：{{ subj.goal }}</small>
              <small v-if="subj.nextTarget !== null">距下一阶段还需 {{ subj.remaining }} 点</small>
              <small v-else>已达成全部课程阶段目标</small>
            </div>
          </article>
        </div>

        <div v-if="state.academics?.lastGain" class="uc-academic-recent">
          <small>最近研习：{{ state.academics.lastGain.at }} 研习 {{ state.academics.lastGain.minutes }} 分钟，获得进度 +{{ state.academics.lastGain.points }} 点。</small>
        </div>
      </div>
      <div v-else class="uc-academics-empty">
        <p>当前尚未在教务处正式确认大学专业方向。</p>
        <small>请前往校园教学楼或南门教务处确认专业方向，解锁专业课业图谱与研读加成。</small>
      </div>
    </div>

    <!-- 模块三：实务与见闻（按专业严格区分，绝不向非法学专业硬塞法学卡片） -->
    <div v-else-if="currentTab === 'expertise'" class="uc-expertise-content" data-expertise-tab>
      <!-- 1. 主修专业对应实务：法学仅限法学专业或已有庭审/律所经历者；其他专业展示本专业实务 -->
      <div v-if="isLawRelevant" class="uc-expertise-grid" data-expertise-law>
        <article class="uc-expertise-card">
          <header>
            <h3>法庭见闻积累</h3>
            <span class="uc-exp-tag">公开审判</span>
          </header>
          <div class="uc-exp-metric">
            <strong>{{ courtKnowledge }}</strong>
            <small>见闻点数</small>
          </div>
          <div class="uc-skill-track">
            <span :style="{ width: Math.min(100, (courtKnowledge / 120) * 100) + '%', backgroundColor: '#38bdf8' }"></span>
          </div>
          <p>在公开法庭旁听审理过程积累的法理见识与事实辩论经验，可辅助法学学习与诉讼应对。</p>
        </article>

        <article class="uc-expertise-card">
          <header>
            <h3>律师事务所实践</h3>
            <span class="uc-exp-tag">执业专长</span>
          </header>
          <div class="uc-exp-metric">
            <strong>{{ lawProgress.experience }}</strong>
            <small>职业经验 · 已结案 {{ lawProgress.solvedCount }} 件</small>
          </div>
          <div class="uc-skill-track">
            <span :style="{ width: Math.min(100, (lawProgress.experience / 200) * 100) + '%', backgroundColor: '#f59e0b' }"></span>
          </div>
          <p>办理民商事咨询、卷宗审查与庭审支持的实务积累{{ lawProgress.hasActiveCase ? '（当前有在办案件）' : '' }}。</p>
        </article>
      </div>

      <div v-else-if="activeMajorPracticeCards.length" class="uc-expertise-grid" :data-expertise-major="majorInfo?.id">
        <article
          v-for="card in activeMajorPracticeCards"
          :key="card.title"
          class="uc-expertise-card"
        >
          <header>
            <h3>{{ card.title }}</h3>
            <span class="uc-exp-tag">{{ card.tag }}</span>
          </header>
          <div class="uc-exp-metric">
            <strong :style="{ color: card.color }">{{ card.value }}</strong>
            <small>{{ card.unit }}</small>
          </div>
          <div class="uc-skill-track">
            <span :style="{ width: card.percent + '%', backgroundColor: card.color }"></span>
          </div>
          <p>{{ card.desc }}</p>
        </article>
      </div>

      <!-- 2. 五维器乐与舞台表现图谱 -->
      <article class="uc-specialty-panel" data-expertise-music>
        <header class="uc-specialty-header">
          <div>
            <h3>乐器造诣与舞台表现</h3>
            <small>
              擅长声部：{{ musicStats.topInstrument.label }}（{{ musicStats.topInstrument.score }}） ·
              已加入乐队 {{ musicStats.joinedBands.length }} 支 · 演出预约 {{ musicStats.bookings.length }} 场
            </small>
          </div>
          <span class="uc-exp-tag">Live House 实务</span>
        </header>

        <div class="uc-instrument-bars">
          <div
            v-for="inst in musicStats.instruments"
            :key="inst.role"
            class="uc-instrument-row"
            :data-instrument="inst.role"
          >
            <span class="uc-inst-name">{{ inst.label }}</span>
            <div class="uc-inst-track" role="progressbar" :aria-label="inst.label + '造诣'" :aria-valuenow="inst.score" aria-valuemin="0" aria-valuemax="100">
              <span
                :style="{
                  width: inst.score + '%',
                  background: inst.score >= 80 ? 'linear-gradient(90deg, #38bdf8, #a78bfa)' : 'rgba(148, 163, 184, 0.55)',
                }"
              ></span>
            </div>
            <strong class="uc-inst-score">{{ inst.score }}</strong>
          </div>
        </div>
      </article>

      <!-- 3. 料理与家常手艺图谱 -->
      <article class="uc-specialty-panel" data-expertise-cooking>
        <header class="uc-specialty-header">
          <div>
            <h3>家常料理与厨艺手记</h3>
            <small>已完成下厨 {{ cookingStats.settledTotal }} 次 · 收录家常食谱 {{ cookingStats.recipeCount }} 道</small>
          </div>
          <span class="uc-exp-tag">厨房实务</span>
        </header>

        <div class="uc-cooking-chips">
          <span
            v-for="recipe in cookingStats.recipes"
            :key="recipe.id"
            class="uc-recipe-chip"
          >
            <b>{{ recipe.name }}</b>
            <small>{{ recipe.minutes }}分钟</small>
          </span>
        </div>
      </article>
    </div>

    <footer class="uc-skills-global-note">
      <small>能力是行动的沉淀，性格是选择的起点。随心与世界交互，技能自会在一次次真实经历中生长。</small>
    </footer>
  </section>
</template>
