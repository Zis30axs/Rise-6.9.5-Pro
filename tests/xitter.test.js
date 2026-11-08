import {describe, it, expect, afterEach, vi} from 'vitest';
import {buildForumRequest, parseForum, cleanPost} from '../../ST-iPhonie/core/forum.js';
import {networkAuthor, buildNetworkRequest, keepNetworkGuests} from '../../ST-iPhonie/core/network.js';
import {createAppsHost} from '../../ST-iPhonie/host-apps.js';
import {TTSBackend} from '../../ST-iPhonie/core/backend.js';
import {forumApp} from '../../ST-iPhonie/ui/forum.js';
import {networkAccounts, networkLegacyAliases, guestAccount, registerNetworkGuests, allNetworkAccounts} from '../src/runtime/network-identities';
vi.mock('../../ST-iPhonie/host-lore.js', () => ({worldInfoFor: vi.fn(()=>{throw Error('Public network must not read private lore');}), loreOptions: vi.fn()}));

const snapshot = () => ({binding:'chat:soyo',ownerId:'person:soyo',space:'network:chat',accounts:[...networkAccounts],legacyAliases:networkLegacyAliases(),follows:[],publicFacts:[{id:'weather',text:'今天多云'}]});
afterEach(() => { delete globalThis.__unreadCityWorldPhone; delete window.__unreadCityWorldPhone; document.body.replaceChildren(); });
describe('Xitter existing forum flow', () => {
  it('parses stable IDs including reply colons, retains random guests, ignores NPC renames and suppresses CRYCHIC', () => {
    const n = snapshot();
    const found = parseForum('【网名】若叶睦｜另一个名字\n【帖子】person:bang-mutsumi｜花｜今天浇了水。\n【回复】person:bang-tomori 回复 person:bang-mutsumi：真好。\n【回复】@crychic：回来了。\n【热搜】CRYCHIC复活\n【帖子】纸飞机路过｜夜晚｜晚安。\n【帖子】band:crychic｜重组｜来了。', {network:n});
    expect(found.posts.map(p=>p.author)).toEqual(['person:bang-mutsumi','纸飞机路过']);
    expect(found.posts[0].replies).toEqual([{from:'person:bang-tomori',to:'person:bang-mutsumi',text:'真好。'}]);
    expect(found.hot).toEqual([]); expect(found.names).toEqual({});
    expect(()=>networkAuthor(n,'band:crychic')).toThrow();
    expect(()=>networkAuthor(n,'@CRYCHIC')).toThrow();
    const old = parseForum('【帖子】旧黄瓜昵称｜旧记录｜今天浇水。\n【帖子】睦｜新叶｜长大了。\n【帖子】@CRYCHIC｜再见｜回来了。', {network:n,handles:{'若叶睦':'旧黄瓜昵称'}});
    expect(old.posts.map(p=>p.author)).toEqual(['person:bang-mutsumi','person:bang-mutsumi']);
    expect(parseForum('【帖子】@soyo｜我｜替玩家发言', {network:n}).posts).toEqual([]);
  });
  it('requires public evidence for institution posts and never passes private story/lore to generation', () => {
    const n = snapshot();
    const prompt = buildForumRequest({network:n,people:[],preset:{posts:3},story:[{text:'PRIVATE STORY'}],lore:'PRIVATE LORE',earlier:'PRIVATE MEMORY'});
    expect(JSON.stringify(prompt)).not.toMatch(/PRIVATE|@post\.sov/);
    expect(JSON.stringify(prompt)).not.toContain('若叶睦');
    expect(parseForum('【帖子】institution:weather｜天气｜今天多云。\n【依据】weather\n【帖子】institution:transit｜事故｜新事故。', {network:n}).posts).toHaveLength(1);
    expect(parseForum('【回复】institution:nhk：谢谢提供公开信息。', {network:n,mode:'react'}).replies).toHaveLength(1);
    expect(buildNetworkRequest({network:n,mode:'posts',recent:[],preset:{posts:2}})).toHaveLength(2);
  });
  it('uses one manual generation for the whole feed, registers random guests, and permits silence', async () => {
    let n = snapshot(), saved = undefined;
    const act = vi.fn(async ({command}) => { saved = registerNetworkGuests(saved,command.nicknames); n = {...n,accounts:allNetworkAccounts(saved)}; });
    globalThis.__unreadCityWorldPhone = {network:()=>n,read:()=>({binding:n.binding,revision:0,active:'soyo'}),act};
    const generateText = vi.fn(async ()=>'【帖子】随机纸飞机｜下雨了吗｜今天带伞了。');
    const backend = {crowd:()=>[],emit:vi.fn(),cardKey:()=>n.space,hotId:()=>n.space,here:()=>({key:n.space}),
      apps:{list:async()=>[],get:async()=>null},generateText,saveChatOptions:vi.fn(),setForumHot:vi.fn(async()=>[]),addForumPosts:vi.fn(async p=>p)};
    const host = createAppsHost({context:()=>({name1:'我',chat:[]}),settings:()=>({chat:{presets:[{id:'test',posts:3,cleanTags:[]}],preset:'test'}}),backend});
    expect(generateText).not.toHaveBeenCalled();
    await host.forumRefresh();
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenCalledTimes(1);
    expect(n.accounts.some(a=>a.id===guestAccount('随机纸飞机').id)).toBe(true);
    generateText.mockResolvedValue('');
    expect(await host.forumRefresh()).toEqual([]);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(backend.saveChatOptions).not.toHaveBeenCalled();
  });
  it('rejects late refreshes after viewpoint/chat switches', async () => {
    const n = snapshot();
    globalThis.__unreadCityWorldPhone = {network:()=>({...n,binding:'different'}),read:()=>({})};
    await expect(keepNetworkGuests(n,{posts:[{author:'新朋友',replies:[]}],replies:[]})).rejects.toThrow(/切换/);
  });
  it('stores current authors on posts and replies, preserving old posts and stable IDs', async () => {
    const n = snapshot(); globalThis.__unreadCityWorldPhone = {network:()=>n};
    let rows = [];
    const backend = Object.create(TTSBackend.prototype);
    backend.cardKey = ()=>n.space; backend.here=()=>({key:n.space});
    backend.appsMutate=async(_kind,run)=>run();
    backend.apps={put:async docs=>(rows.push(...docs),docs),change:async(id,run)=>{const p=rows.find(p=>p.id===id);run(p);return p;}};
    const [p] = await backend.addForumPosts([{author:'me',title:'近况',text:'今天很好。'}],{source:'me'});
    expect(p.author).toBe('person:soyo');
    n.ownerId='person:sakiko';
    await backend.addForumReplies(p.id,[{from:'me',text:'嗯。'}],{own:true});
    expect(rows[0].replies[0].from).toBe('person:sakiko');
    expect(()=>cleanPost({author:'旧网友',text:'旧内容',replies:[]},'old',0,()=>'' )).not.toThrow();
    await expect(backend.addForumPosts([{author:'band:crychic',text:'复活'}])).rejects.toThrow();
  });
  it('opens and navigates the actual UI without generation, showing email only on the profile', async () => {
    const n=snapshot(); window.__unreadCityWorldPhone={network:()=>n};
    window.__unreadCityNetworkArt={default:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'};
    const p={id:'p1',author:'若叶睦',title:'种花',text:'<img src=x onerror=alert(1)>',likes:0,heat:1,replies:[],at:Date.now()};
    const api={getState:()=>({chat:{netNames:{}}}),listForum:async()=>[p],forumHot:async()=>[],getForumPost:async()=>p,forumRefresh:vi.fn(),chatContacts:()=>[]};
    const view=forumApp({api,win:window,doc:document,engineOf:()=>'',notify:vi.fn()});
    document.body.append(view.root); await vi.waitFor(()=>expect(view.root.textContent).toContain('CucumberT_T'));
    expect(view.root.textContent).toContain('@mutsumi');
    expect(view.root.textContent).not.toContain('若叶睦');
    expect(view.root.textContent).not.toContain('@post.sov');
    expect(view.root.querySelector('[onerror]')).toBeNull();
    view.root.querySelector('[data-action="network-profile"]').click();
    await vi.waitFor(()=>expect(view.root.textContent).toContain('mutsumi@post.sov'));
    expect(view.root.querySelector('button button')).toBeNull();
    expect(api.forumRefresh).not.toHaveBeenCalled();
    view.dispose();
  });
});
