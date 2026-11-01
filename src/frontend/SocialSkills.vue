<script setup lang="ts">
import { computed, ref } from 'vue';
import { SOCIAL_PERSONALITY, socialSkillOverview } from '../runtime/social-skills';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { getAcademicMajor } from '../runtime/academics';
import { lawOwner } from '../runtime/law-career';
import type { WorldState } from './types';

const props = defineProps<{ state: WorldState }>();

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

function toggleSkill(id: string) {
  expandedSkillId.value = expandedSkillId.value === id ? null : id;
}

const PROTAGONIST_SOCIAL_MOTTO: Record<string, { tagline: string; summary: string }> = {
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

const majorInfo = computed(() => {
  const majorId = props.state.academics?.majorId;
  return majorId ? getAcademicMajor(majorId) : null;
});

const courtKnowledge = computed(() => {
  return props.state.courtroom?.observationKnowledge?.[owner.value] ?? 0;
});

const lawProgress = computed(() => {
  const career = lawOwner(props.state);
  return {
    experience: career.experience,
    hasActiveCase: !!career.active,
    solvedCount: career.completedCaseIds.length,
  };
});
</script>

<template>
  <section class="wp-status-section uc-skills" data-status-section="skills" :data-skills-owner="owner" aria-label="综合能力">
    <!-- 主头部区域 -->
    <header class="uc-abilities-header">
      <div class="uc-abilities-hero-profile">
        <div class="uc-hero-title-group">
          <h2>能力体系 · Abilities & Skills</h2>
          <span class="uc-personality-badge" :data-personality="SOCIAL_PERSONALITY[owner]">
            {{ protagonistNames[owner] }} · {{ SOCIAL_PERSONALITY[owner] }}
          </span>
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

    <!-- 模块一：社交与心性 -->
    <div v-if="currentTab === 'skills'" class="uc-skills-content">
      <!-- 今日练习额度条 -->
      <div class="uc-daily-pace" aria-label="今日社交实战心得">
        <div class="uc-pace-info">
          <span>今日社交心得积累</span>
          <strong>{{ todayEarned }} / 24 点经验</strong>
        </div>
        <div class="uc-pace-track" role="progressbar" :aria-valuenow="todayEarned" aria-valuemin="0" aria-valuemax="24">
          <span :style="{ width: Math.min(100, (todayEarned / 24) * 100) + '%' }"></span>
        </div>
        <small class="uc-pace-hint">每日与居民自然交流、邀约与真诚表达可积累心性感悟；过度消耗易增加压力，适度沟通有益身心。</small>
      </div>

      <!-- 六维技能卡片网格 -->
      <div class="uc-skills-grid">
        <article
          v-for="skill in rows"
          :key="skill.id"
          class="uc-skill-card"
          :class="{ expanded: expandedSkillId === skill.id }"
          :data-skill="skill.id"
          @click="toggleSkill(skill.id)"
        >
          <header class="uc-skill-top">
            <div class="uc-skill-title-line">
              <span class="uc-skill-indicator" :style="{ backgroundColor: skill.themeColor }"></span>
              <h3>{{ skill.label }}</h3>
              <span class="uc-skill-stage-badge">{{ skill.stageTitle }}</span>
            </div>
            <strong class="uc-skill-level" :data-skill-level="skill.id">Lv.{{ skill.level }}</strong>
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

          <!-- 折叠展开按钮提示 -->
          <footer class="uc-skill-footer">
            <span>{{ expandedSkillId === skill.id ? '收起详情 ▴' : '点击查看心性解析与加成 ▾' }}</span>
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

    <!-- 模块二：专业学识 -->
    <div v-else-if="currentTab === 'academics'" class="uc-academics-content">
      <div v-if="majorInfo" class="uc-major-card">
        <header class="uc-major-header">
          <div>
            <span class="uc-major-label">已确认学修方向</span>
            <h3>{{ majorInfo.name }}</h3>
          </div>
          <span class="uc-major-faculty">本科专业</span>
        </header>
        <p class="uc-major-desc">{{ majorInfo.description }}</p>

        <h4 class="uc-subheading">专业三门必修课业进度</h4>
        <div class="uc-subject-list">
          <article v-for="subj in state.academics?.subjects" :key="subj.subjectId" class="uc-subject-item">
            <div class="uc-subject-header">
              <strong>{{ majorInfo.subjects.find(s => s.id === subj.subjectId)?.name ?? subj.subjectId }}</strong>
              <span>{{ subj.points }} 学分点数</span>
            </div>
            <div class="uc-skill-track" role="progressbar" :aria-valuenow="subj.points" aria-valuemin="0" aria-valuemax="1000">
              <span :style="{ width: Math.min(100, (subj.points / 500) * 100) + '%' }"></span>
            </div>
          </article>
        </div>

        <div v-if="state.academics?.lastGain" class="uc-academic-recent">
          <small>最近研习：{{ state.academics.lastGain.at }} 在 {{ state.academics.lastGain.channel }} 研习 {{ state.academics.lastGain.minutes }} 分钟，获得进度 +{{ state.academics.lastGain.points }} 点。</small>
        </div>
      </div>
      <div v-else class="uc-academics-empty">
        <p>当前尚未在教务处正式确认大学专业方向。</p>
        <small>请前往校园教学楼或南门教务处确认专业方向，解锁专业课业与研读加成。</small>
      </div>
    </div>

    <!-- 模块三：实务与见闻 -->
    <div v-else-if="currentTab === 'expertise'" class="uc-expertise-content">
      <div class="uc-expertise-grid">
        <article class="uc-expertise-card">
          <header>
            <h3>法庭见闻积累</h3>
            <span class="uc-exp-tag">公开审判</span>
          </header>
          <div class="uc-exp-metric">
            <strong>{{ courtKnowledge }}</strong>
            <small>见闻点数</small>
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
            <small>职业经验</small>
          </div>
          <p>办理民商事咨询、卷宗审查与庭审支持的实务积累；已结案 {{ lawProgress.solvedCount }} 件。</p>
        </article>
      </div>
    </div>

    <footer class="uc-skills-global-note">
      <small>能力是行动的沉淀，性格是选择的起点。随心与世界交互，技能自会在一次次真实经历中生长。</small>
    </footer>
  </section>
</template>

<style scoped>
.uc-skills {
  padding: 16px;
  border-radius: 12px;
  background: rgba(22, 33, 44, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.uc-abilities-header {
  margin-bottom: 14px;
}

.uc-hero-title-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.uc-hero-title-group h2 {
  margin: 0;
  font-size: 1.05rem;
  color: #f1f5f9;
}

.uc-personality-badge {
  font-size: 0.76rem;
  padding: 2px 10px;
  border-radius: 12px;
  background: rgba(147, 197, 253, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(147, 197, 253, 0.3);
  font-weight: 600;
}

.uc-hero-motto {
  margin: 6px 0 12px;
  font-size: 0.81rem;
  color: #94a3b8;
  line-height: 1.4;
}

.uc-hero-motto strong {
  color: #cbd5e1;
}

/* Tab 导航 */
.uc-abilities-nav {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 8px;
  margin-bottom: 14px;
  overflow-x: auto;
}

.uc-abilities-nav button {
  background: transparent;
  border: none;
  padding: 6px 12px;
  font-size: 0.82rem;
  color: #94a3b8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.uc-abilities-nav button.active {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  font-weight: 600;
}

.uc-abilities-nav button:hover:not(.active) {
  background: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
}

/* 今日练习节奏 */
.uc-daily-pace {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 14px;
}

.uc-pace-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.uc-pace-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}

.uc-pace-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  transition: width 0.2s ease;
}

.uc-pace-hint {
  display: block;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.35;
}

/* 技能卡片网格 */
.uc-skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.uc-skill-card {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.uc-skill-card:hover {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(255, 255, 255, 0.16);
  transform: translateY(-1px);
}

.uc-skill-card.expanded {
  border-color: rgba(147, 197, 253, 0.4);
  background: rgba(30, 41, 59, 0.85);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.uc-skill-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.uc-skill-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.uc-skill-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.uc-skill-title-line h3 {
  margin: 0;
  font-size: 0.95rem;
  color: #f8fafc;
}

.uc-skill-stage-badge {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.uc-skill-level {
  font-size: 0.92rem;
  color: #facc15;
  font-weight: 700;
}

.uc-skill-tagline {
  margin: 0 0 10px;
  font-size: 0.78rem;
  color: #94a3b8;
  line-height: 1.35;
}

/* 进度条 */
.uc-progress-block {
  margin-bottom: 8px;
}

.uc-skill-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.uc-skill-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.2s ease;
}

.uc-skill-exp-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.71rem;
  color: #64748b;
}

.uc-max-level {
  color: #38bdf8;
  font-weight: 500;
}

.uc-percent-text {
  font-weight: 600;
  color: #94a3b8;
}

/* 实战减免与收益 */
.uc-skill-effects {
  margin-top: 4px;
  margin-bottom: 6px;
}

.uc-effect-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.73rem;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
}

.uc-effect-pill.active {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.uc-effect-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

/* 展开区域 */
.uc-skill-expanded-details {
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  padding-top: 10px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uc-detail-section h4 {
  margin: 0 0 2px;
  font-size: 0.75rem;
  color: #cbd5e1;
}

.uc-detail-section p {
  margin: 0;
  font-size: 0.74rem;
  color: #94a3b8;
  line-height: 1.4;
}

.uc-trait-quote {
  font-style: italic;
  color: #a5b4fc !important;
}

.uc-skill-footer {
  margin-top: auto;
  padding-top: 6px;
  text-align: right;
  font-size: 0.68rem;
  color: #64748b;
}

/* 最近研习卡片 */
.uc-skills-latest-card {
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.uc-latest-badge {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  white-space: nowrap;
}

.uc-latest-body p {
  margin: 0 0 2px;
  font-size: 0.78rem;
  color: #e2e8f0;
}

.uc-latest-body small {
  font-size: 0.7rem;
  color: #64748b;
}

/* 学业板块 */
.uc-major-card {
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
}

.uc-major-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.uc-major-label {
  font-size: 0.7rem;
  color: #94a3b8;
}

.uc-major-header h3 {
  margin: 2px 0 0;
  font-size: 1.05rem;
  color: #f8fafc;
}

.uc-major-faculty {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.uc-major-desc {
  margin: 0 0 14px;
  font-size: 0.8rem;
  color: #94a3b8;
  line-height: 1.4;
}

.uc-subheading {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: #cbd5e1;
}

.uc-subject-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.uc-subject-item {
  background: rgba(15, 23, 42, 0.4);
  padding: 8px 12px;
  border-radius: 6px;
}

.uc-subject-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: #e2e8f0;
  margin-bottom: 4px;
}

.uc-academic-recent {
  font-size: 0.72rem;
  color: #64748b;
  border-top: 1px dashed rgba(255, 255, 255, 0.06);
  padding-top: 8px;
}

.uc-academics-empty {
  text-align: center;
  padding: 28px 16px;
  color: #94a3b8;
}

.uc-academics-empty small {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 0.75rem;
}

/* 实务见闻 */
.uc-expertise-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.uc-expertise-card {
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 14px;
}

.uc-expertise-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.uc-expertise-card h3 {
  margin: 0;
  font-size: 0.92rem;
  color: #f8fafc;
}

.uc-exp-tag {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.uc-exp-metric {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.uc-exp-metric strong {
  font-size: 1.5rem;
  color: #38bdf8;
}

.uc-exp-metric small {
  font-size: 0.76rem;
  color: #64748b;
}

.uc-expertise-card p {
  margin: 0;
  font-size: 0.78rem;
  color: #94a3b8;
  line-height: 1.4;
}

.uc-skills-global-note {
  margin-top: 14px;
  text-align: center;
  color: #64748b;
  font-size: 0.72rem;
}

@media (max-width: 600px) {
  .uc-skills-grid {
    grid-template-columns: 1fr;
  }
}
</style>
