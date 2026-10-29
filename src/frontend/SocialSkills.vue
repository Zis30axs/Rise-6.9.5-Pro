<script setup lang="ts">
import { computed } from 'vue';
import { SOCIAL_PERSONALITY, socialSkillOverview } from '../runtime/social-skills';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import type { WorldState } from './types';

const props = defineProps<{ state: WorldState }>();
const owner = computed(() => activeProtagonist(props.state));
const rows = computed(() => socialSkillOverview(props.state, owner.value));
const latest = computed(() => props.state.protagonists?.socialSkills?.people[owner.value]?.latest ?? null);
const latestLabel = computed(() => rows.value.find(row => row.id === latest.value?.skillId)?.label ?? '');
</script>

<template>
  <section class="wp-status-section uc-skills" data-status-section="skills" :data-skills-owner="owner" aria-label="社交能力">
    <div class="wp-heading uc-skills-heading">
      <div><h2>社交能力 · Skills</h2><small>{{ protagonistNames[owner] }} · {{ SOCIAL_PERSONALITY[owner] }} 倾向</small></div>
      <span class="uc-skills-count">{{ rows.length }} 项能力</span>
    </div>
    <div class="uc-skills-grid">
      <article v-for="skill in rows" :key="skill.id" class="uc-skill" :data-skill="skill.id">
        <header><h3>{{ skill.label }}</h3><strong :data-skill-level="skill.id">Lv.{{ skill.level }}</strong></header>
        <p>{{ skill.description }}</p>
        <div class="uc-skill-track" role="progressbar" :aria-label="skill.label + '熟练度'" :aria-valuenow="skill.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: skill.percent + '%' }"></span></div>
        <small v-if="skill.level < 5">距离下一级还需 {{ skill.remaining }} 点经验</small>
        <small v-else>已达当前熟练阶段上限</small>
      </article>
    </div>
    <p v-if="latest" class="uc-skills-latest" data-skills-latest>
      最近练习：{{ latestLabel }} · 经验 +{{ latest.earned }} · 精力 −{{ latest.energyCost }} · 压力 +{{ latest.stressGain }}
    </p>
    <p class="uc-skills-note">性格是起点，不是限制。一次次真实交流，也会让不擅长的事逐渐变得轻松。</p>
  </section>
</template>

<style scoped>
.uc-skills-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.uc-skills-heading h2 { margin: 0 0 4px; }
.uc-skills-heading small, .uc-skills-count, .uc-skill small, .uc-skills-note { color: var(--text-muted, #6b7280); }
.uc-skills-count { font-size: .76rem; white-space: nowrap; }
.uc-skills-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 215px), 1fr)); gap: 10px; margin-top: 12px; }
.uc-skill { min-width: 0; padding: 12px; border: 1px solid rgba(116, 116, 116, .19); border-radius: 10px; background: rgba(127, 127, 127, .05); }
.uc-skill header { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.uc-skill h3 { margin: 0; font-size: .92rem; }
.uc-skill strong { font-size: .85rem; white-space: nowrap; }
.uc-skill p { font-size: .81rem; margin: 8px 0; min-height: 2.2em; }
.uc-skill-track { height: 7px; overflow: hidden; background: rgba(100, 100, 100, .16); border-radius: 5px; margin: 8px 0 5px; }
.uc-skill-track span { display: block; height: 100%; border-radius: inherit; background: #9c79a8; transition: width .18s ease; }
.uc-skill small { font-size: .73rem; }
.uc-skills-latest { margin: 12px 0 0; font-size: .83rem; }
.uc-skills-note { font-size: .77rem; margin: 10px 0 0; }
@media (max-width: 480px) { .uc-skills-grid { grid-template-columns: 1fr; } .uc-skill p { min-height: 0; } }
@media (prefers-reduced-motion: reduce) { .uc-skill-track span { transition: none; } }
</style>
