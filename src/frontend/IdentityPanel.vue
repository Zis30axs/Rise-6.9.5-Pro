<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WorldState } from './types';
import { allResidentCast } from '../runtime/npc-cast';
import { activeProtagonist, protagonistNames, personState } from '../runtime/protagonist-world';
import { resolveMapCharacterAvatar } from './map-character-avatar';
import { STRATEGY_OWNERS, FOCUS_CATALOG, TRAIT_CATALOG, SPIRIT_CATALOG } from '../runtime/strategy';
import type { ProtagonistId } from '../runtime/dual-protagonists';

const props=defineProps<{state:WorldState}>();
const query=ref('');
const selected=ref('soyo');
const ownerFor=(id:string):ProtagonistId|null=>id==='protagonist-soyo'?'soyo':id==='protagonist-sakiko'?'sakiko':id==='majo-emma'?'emma':id==='watanare-renako'?'renako':null;
const people=computed(()=>allResidentCast.map(row=>{
  const owner=ownerFor(row.id);
  return {...row,owner,aliases:row.aliases??[]};
}).filter(row=>!query.value.trim()||[row.name,row.id,...row.aliases].some(v=>v.toLowerCase().includes(query.value.trim().toLowerCase()))));
const current=computed(()=>people.value.find(row=>row.id===selected.value)??people.value[0]??null);
const owner=computed(()=>current.value?.owner??null);
const portrait=computed(()=>current.value?resolveMapCharacterAvatar({name:current.value.name,personId:current.value.id,protagonistId:owner.value}):null);
const personal=computed(()=>owner.value?personState(props.state,owner.value):null);
const strategy=computed(()=>props.state.protagonists?.strategy);
const personStrategy=computed(()=>owner.value?strategy.value?.people[owner.value]:null);
const focus=computed(()=>personStrategy.value?.active?FOCUS_CATALOG.find(row=>row.id===personStrategy.value?.active?.id):null);
const traits=computed(()=>personStrategy.value?.traits.map(id=>TRAIT_CATALOG.find(row=>row.id===id)).filter(Boolean)??[]);
const spirits=computed(()=>personStrategy.value?.spirits.map(row=>({instance:row,definition:SPIRIT_CATALOG.find(x=>x.id===row.id)})).filter(x=>x.definition)??[]);
const contacts=computed(()=>props.state.contacts.filter(c=>c.sourcePersonId===current.value?.id||c.id===current.value?.id));
const strategyHistory=computed(()=>owner.value?(strategy.value?.history.filter(row=>row.owner===owner.value).slice(-30).reverse()??[]):[]);
const journal=computed(()=>personal.value?.journal.slice(-30).reverse()??[]);
const identityFacts=computed(()=>[
  {label:'身份编号',value:current.value?.id??'未登记'},
  {label:'所属组织',value:current.value?.id.startsWith('bang-')?'BanG Dream 乐队圈':current.value?.id.startsWith('majo-')?'魔裁人物群':current.value?.id.startsWith('watanare-')?'渡奈人物群':'未登记'},
  {label:'公开资料',value:current.value?.publicProfile??'尚无公开资料'},
]);
function select(id:string){selected.value=id;}
</script>

<template>
  <section class="identity-app" data-testid="identity-app">
    <header class="identity-head"><div><h2>查身份</h2><p>全知人物档案 · 仅观察，不改变角色认知</p></div><span>{{ people.length }} 人</span></header>
    <label class="identity-search"><span>⌕</span><input v-model="query" type="search" placeholder="搜索姓名、编号或别名" aria-label="搜索人物"></label>
    <div class="identity-layout">
      <aside class="identity-list" aria-label="人物列表">
        <button v-for="person in people" :key="person.id" type="button" :class="{selected:current?.id===person.id}" @click="select(person.id)">
          <span>{{ person.name.slice(-2) }}</span><b>{{ person.name }}</b><small>{{ person.id }}</small>
        </button>
        <p v-if="!people.length">没有匹配的人物。</p>
      </aside>
      <main v-if="current" class="identity-detail">
        <section class="identity-profile">
          <div class="identity-portrait">
            <img v-if="portrait?.kind==='sprite'||portrait?.kind==='headshot'" :src="portrait.src" :alt="current.name">
            <span v-else>{{ current.name.slice(-1) }}</span>
          </div>
          <div><h2>{{ current.name }}</h2><p>{{ owner? '可操作主角':'主要人物 / 居民' }}</p><small>{{ current.id }}</small></div>
        </section>
        <section class="identity-section"><h3>身份档案</h3><article v-for="fact in identityFacts" :key="fact.label"><b>{{ fact.label }}</b><p>{{ fact.value }}</p></article><p class="identity-note">身份证件图像尚未登记；这里显示的是现有世界数据库资料，不会伪造证件号码或个人信息。</p></section>
        <section v-if="owner" class="identity-section"><h3>战略状态</h3><p v-if="focus"><b>{{ focus.title }}</b> · {{ Math.floor((personStrategy?.active?.progress??0)/focus.durationMinutes*100) }}%</p><p v-else>当前没有进行中的国策。</p><p v-for="trait in traits" :key="trait?.id">领导者特质：{{ trait?.title }}</p><p v-for="spirit in spirits" :key="spirit.instance.id">民族精神：{{ spirit.definition?.title }}</p><p>托管：{{ personStrategy?.controller==='auto'?'AI 托管':'手动控制' }}</p></section>
        <section class="identity-section"><h3>真实行动记录</h3><article v-for="row in strategyHistory" :key="row.id"><small>第 {{ Math.floor(row.at/1440)+1 }} 天 · {{ String(Math.floor(row.at%1440/60)).padStart(2,'0') }}:{{ String(row.at%60).padStart(2,'0') }}</small><p>{{ row.kind }} · {{ row.subject }}<template v-if="row.note"> · {{ row.note }}</template></p></article><article v-for="row in journal" :key="row.id"><small>{{ row.at }}</small><p>{{ row.text }}</p></article><p v-if="!strategyHistory.length&&!journal.length">暂无已保存的行动记录。</p></section>
        <section class="identity-section"><h3>人物关系记录</h3><article v-for="contact in contacts" :key="contact.id"><b>{{ contact.name }}</b><p>{{ contact.status }} · 好感 {{ contact.affinity }}</p></article><p v-if="!contacts.length">尚未建立联系人记录。</p></section>
      </main>
      <main v-else class="identity-detail"><p>没有可显示的人物。</p></main>
    </div>
  </section>
</template>

<style scoped>
.identity-app{display:grid;gap:14px;color:var(--text-color,inherit);min-width:0}.identity-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.identity-head h2{margin:0;font-size:1.15rem}.identity-head p,.identity-profile p,.identity-profile small{margin:3px 0;color:var(--text-muted,#777);font-size:.78rem}.identity-search{display:flex;align-items:center;gap:8px;border:1px solid var(--border-color,#8884);border-radius:12px;padding:0 12px;min-height:44px}.identity-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:inherit}.identity-layout{display:grid;grid-template-columns:minmax(112px, .75fr) minmax(0,1.6fr);gap:12px;align-items:start}.identity-list{display:grid;gap:6px;max-height:68vh;overflow:auto}.identity-list button{display:grid;grid-template-columns:32px 1fr;gap:2px 7px;text-align:left;align-items:center;border:1px solid var(--border-color,#8883);border-radius:10px;background:transparent;color:inherit;padding:7px;min-width:0}.identity-list button.selected{border-color:var(--accent-color,#6b8cbb);background:var(--surface-secondary, #8881)}.identity-list button>span{grid-row:span 2;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--surface-secondary,#8882)}.identity-list b{font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity-list small{font-size:.62rem;opacity:.65;overflow:hidden;text-overflow:ellipsis}.identity-detail{display:grid;gap:12px;min-width:0}.identity-profile{display:flex;align-items:center;gap:12px}.identity-portrait{width:92px;height:116px;flex:none;border-radius:12px;overflow:hidden;background:var(--surface-secondary,#8882);display:grid;place-items:center}.identity-portrait img{width:100%;height:100%;object-fit:contain;object-position:center bottom}.identity-profile h2{margin:0;font-size:1.1rem}.identity-section{border-top:1px solid var(--border-color,#8883);padding-top:10px}.identity-section h3{margin:0 0 8px;font-size:.92rem}.identity-section article{padding:6px 0;border-bottom:1px solid var(--border-color,#8882)}.identity-section article b{font-size:.8rem}.identity-section article p,.identity-section>p{font-size:.8rem;line-height:1.55;margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.identity-section small,.identity-note{font-size:.7rem;color:var(--text-muted,#777)}@media(max-width:560px){.identity-layout{grid-template-columns:1fr}.identity-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:210px}.identity-list button{grid-template-columns:26px 1fr}.identity-list button>span{width:24px;height:24px}.identity-portrait{width:76px;height:96px}}
</style>
