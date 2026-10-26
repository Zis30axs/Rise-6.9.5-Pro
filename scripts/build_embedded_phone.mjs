import { build } from 'vite';
import {loadPhoneArt} from './phone_visual_assets.mjs';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceOption = process.argv.indexOf('--source');
const phoneRoot = await realpath(sourceOption < 0 ? path.resolve(root, '../ST-iPhonie') : path.resolve(process.argv[sourceOption + 1] || ''));
const includeSounds = process.argv.includes('--include-sounds') || process.env.UNREAD_CITY_PHONE_INCLUDE_SOUNDS === '1';
const generated = path.join(root, 'src/frontend/generated');
const gameClockModule = 'virtual:unread-city-phone-clock';
const gameClockFile = path.join(root, 'src/frontend/phone-game-clock.ts').replaceAll('\\', '/');
const deviceSettingsModule = 'virtual:unread-city-phone-settings';
const deviceSettingsFile = path.join(root, 'src/frontend/phone-device-settings.ts').replaceAll('\\', '/');
const text = relative => readFile(path.join(phoneRoot, relative), 'utf8');
const manifest = JSON.parse(await text('manifest.json'));
const tokenizers = { 't5.json': await text('tokenizers/t5.json'), 'qwen.txt': await text('tokenizers/qwen.txt') };
const licenses = { marked: await text('ui/vendor/marked.LICENSE.txt'), tokenizers: await text('tokenizers/LICENSE-Apache-2.0.txt') };
const phoneCss = (await Promise.all(['ui/phone.css', 'ui/skins.css'].map(text))).join('\n') + '\n' + await readFile(path.join(root,'integration/dual-protagonists/phone-visuals.css'),'utf8');
const phoneArt = await loadPhoneArt(root);
const artModule = '\0virtual:unread-city-phone-art';
const hostCss = (await Promise.all(['style.css', 'floating.css'].map(text))).join('\n');
// All shipped CSS resources are inline SVG data URLs. Fail closed if upstream
// introduces a file or external asset that has not been explicitly packaged.
for (const css of [phoneCss, hostCss]) {
  for (const item of css.matchAll(/url\(\s*["']?([^\s)"']+)/g)) {
    if (!item[1].startsWith('data:') && !item[1].startsWith('#') && !item[1].startsWith('%23')) throw Error(`未打包的手机 CSS 资源：${item[1]}`);
  }
}
const sounds = {};
let soundManifest = null;
if (includeSounds) {
  soundManifest = JSON.parse(await text('sounds/pack.json'));
  for (const file of new Set(soundManifest.sounds.map(item => item.file))) {
    if (!/^[\w.-]+\.mp3$/.test(file)) throw Error('音效包包含非法文件名');
    sounds[file] = (await readFile(path.join(phoneRoot, 'sounds', file))).toString('base64');
  }
}

function replaceOnce(code, from, to, label) {
  const normFrom = typeof from === 'string' ? from.replace(/\r\n/g, '\n') : from;
  const normCode = code.replace(/\r\n/g, '\n');
  if (!normCode.includes(normFrom) || normCode.indexOf(normFrom) !== normCode.lastIndexOf(normFrom)) throw Error(`手机源码已变化，请更新内嵌适配：${label}`);
  return normCode.replace(normFrom, to);
}
const worldAppsModule = '\0virtual:unread-city-world-apps';
const worldAppsSource = (await readFile(path.join(root, 'integration/dual-protagonists/phone-apps.js'), 'utf8')).replace('UNREAD_CITY_PHONE_COMMON', path.join(phoneRoot, 'ui/common.js').replaceAll('\\','/')).replaceAll('UNREAD_CITY_PHONE_VISUALS',path.join(root,'integration/dual-protagonists/phone-visuals.js').replaceAll('\\','/')).replaceAll('UNREAD_CITY_PHONE_CHAT',path.join(root,'integration/dual-protagonists/phone-messenger.js').replaceAll('\\','/'));
const dataModule = '\0virtual:unread-city-phone-data';
let phoneHtml = '';
const sourceFiles = new Map();
function plugin(stage) {
  return {
    name: 'unread-city-private-phone',
    resolveId(id) { if(id === 'UNREAD_CITY_PHONE_ART') return artModule; if (id === 'virtual:unread-city-world-apps') return worldAppsModule; if (id === 'virtual:unread-city-phone-data') return dataModule; if(id === gameClockModule) return gameClockFile; if(id === deviceSettingsModule) return deviceSettingsFile; },
    load(id) {
      if(id === artModule) return `export const phoneArt=${JSON.stringify(phoneArt)};`;
      if (id === worldAppsModule) return worldAppsSource;
      if (id === dataModule) return `export const portableData=${JSON.stringify({ version: manifest.version, manifest, hostCss: stage === 'runtime' ? hostCss : '', phoneHtml, tokenizers: stage === 'runtime' ? tokenizers : {}, sounds, soundManifest })};`;
    },
    async transform(code, id) {
      if (id.startsWith('\0')) return;
      if (id.replaceAll('\\', '/') === gameClockFile || id.replaceAll('\\', '/') === deviceSettingsFile) return;
      if(id===path.join(root,'integration/dual-protagonists/phone-visuals.js').replaceAll('\\','/'))return;
       if(id===path.join(root,'integration/dual-protagonists/phone-messenger.js').replaceAll('\\','/'))return;
      const relative = path.relative(phoneRoot, id).replaceAll('\\', '/');
      if (relative.startsWith('../') || path.isAbsolute(relative) || !/^(?:[\w-]+\.js|(?:core|ui|portable)\/[\w./-]+\.js|fish-mobile\/(?:native-host|native-probe|mcp-errors|client)\.js)$/.test(relative) || /(?:^|\/)(?:test|fixtures|node_modules)(?:\/|\.)/.test(relative) || /\.test\.js$/.test(relative)) throw Error(`拒绝打包白名单以外的手机文件：${relative}`);
      sourceFiles.set(relative, createHash('sha256').update(code).digest('hex'));
      if (relative === 'ui/phone.js') {
        code = "import {worldPhoneFactories,applyWorldPhoneTheme,worldPhoneHome,worldPhoneIcon,worldPhoneState,worldPhoneTheme,saveWorldPhoneTheme} from 'virtual:unread-city-world-apps';\nimport {readGamePhoneClock} from 'virtual:unread-city-phone-clock';\n" + code;
        code = replaceOnce(code, "    const now = new Date();\n    const time = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false});\n    const date = now.toLocaleDateString('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'});", "    const current = readGamePhoneClock(win);\n    const time = current?.time ?? '--:--';\n    const date = current?.label ?? '游戏时间未连接';", "status, home and lock screen use game clock");
        code = replaceOnce(code, "    if (time !== lastClock) { lastClock = time; today?.paint(['clock', 'calendar']); }", "    const stamp = date + '|' + time;\n    if (stamp !== lastClock) { lastClock = stamp; today?.paint(['clock', 'calendar']); }", "refresh Today widgets on day changes");
        code = replaceOnce(code, "  const clockTimer = win.setInterval(clock, 15000);", "  const clockTimer = win.setInterval(clock, 15000);\n  const stopGameClockUpdates = win.parent.__unreadCityWorldPhone?.subscribe?.(clock) || (() => {});", "refresh immediately when game state changes");
        code = replaceOnce(code, "    win.clearInterval(clockTimer); win.clearTimeout(todayTimer);", "    stopGameClockUpdates();\n    win.clearInterval(clockTimer); win.clearTimeout(todayTimer);", "unregister world clock updates on disposal");
        code = replaceOnce(code, 'const ctx = {api, doc, win,', "const ctx = {openWorldContact: contactId=>{open('worldmessages');views.get('worldmessages')?.openContact?.(contactId);},api, doc, win,", '剧情联系人统一短信入口');
        code = replaceOnce(code, 'const FACTORIES = {', 'const FACTORIES = {...worldPhoneFactories,', '游戏手机应用');
        code = replaceOnce(code, 'peek: peekApp,', 'peek: worldPhoneFactories.worldpeek,', '权威查手机');
        code = replaceOnce(code, '  let panelVisible = true,', '  let worldViewOwner = null;\n  let panelVisible = true,', '手机视图归属');
        code = replaceOnce(code, '  function applyThemeMode() {', '  function applyThemeMode() { if(applyWorldPhoneTheme(screen))return;', '设备主题偏好');
        code = replaceOnce(code, '  function showHome(immediate = false) {', '  function showHome(immediate = false) { renderHome();', '外观保存后刷新桌面');
        code = replaceOnce(code, '    const art = image ?', '    const art = worldPhoneIcon(screen,id) || (image ?', '独立图标');
        code = replaceOnce(code, "custom.key : id);", "custom.key : id));", '独立图标闭合');
        code = replaceOnce(code, 'HOME.pages.map', 'worldPhoneHome(screen,HOME).pages.map', '独立应用排列');
        code = replaceOnce(code, 'HOME.dock.map', 'worldPhoneHome(screen,HOME).dock.map', '独立快捷栏');
        code = replaceOnce(code, 'await api.savePhone({theme: el.dataset.theme});', 'if(await saveWorldPhoneTheme(screen,el.dataset.theme)){renderHome();}else await api.savePhone({theme: el.dataset.theme});', '控制中心保存设备主题');
        code = replaceOnce(code, 'p.theme === key', '(worldPhoneTheme(screen)||p.theme) === key', '控制中心当前设备主题');
        code = replaceOnce(code, '  function renderHome() {', '  function renderHome() { applyWorldPhoneTheme(screen);', '主角手机主题');
        code = replaceOnce(code, '    panelVisible = visible;', `    panelVisible = visible;
          if (visible) {
            const worldOwner=worldPhoneState(screen)?.active;
            if(worldViewOwner && worldOwner && worldViewOwner!==worldOwner) {
              sheet?.close(null);for(const view of views.values())view.dispose?.();views.clear();content.replaceChildren();active=null;showHome(true);
            }
            worldViewOwner=worldOwner;renderHome();
          }`, '切主角后清理旧手机视图');
      }
      if (relative === 'ui/today.js') {
        code = "import {readGamePhoneClock} from 'virtual:unread-city-phone-clock';\n" + code;
        code = replaceOnce(code, "  const now = () => new Date();", "  const now = () => readGamePhoneClock(win);", "Today widgets read game source");
        code = replaceOnce(code, "    const d = now(), day = d.getDate();", "    const current = now();\n    if (!current) return '<span class=\"tw-line\">游戏时间未连接</span>';\n    const d = current.date, day = d.getUTCDate();", "Today calendar awaits game source");
        code = replaceOnce(code, "    if (size === 's') return `<span class=\"tw-red\">星期${WEEK[d.getDay()]}</span><b class=\"tw-day\">${day}</b><small class=\"tw-dim\">${d.getMonth() + 1}月 · ${d.getFullYear()}</small>`;", "    if (size === 's') return `<span class=\"tw-red\">星期${WEEK[d.getUTCDay()]}</span><b class=\"tw-day\">${day}</b><small class=\"tw-dim\">${d.getUTCMonth() + 1}月 · ${d.getUTCFullYear()}</small>`;", "Today compact calendar UTC fields");
        code = replaceOnce(code, "    const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay(), days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();", "    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getUTCDay(), days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();", "Today month grid UTC weekdays");
        code = replaceOnce(code, "    return `<span class=\"tw-head\"><b class=\"tw-red\">${d.getMonth() + 1}月</b><small class=\"tw-dim\">${d.getFullYear()}</small></span><div class=\"tw-month\">${WEEK.map(w => `<i>${w}</i>`).join('')}${cells.map(n => `<span${n === day ? ' class=\"today\"' : ''}>${n}</span>`).join('')}</div>`;", "    return `<span class=\"tw-head\"><b class=\"tw-red\">${d.getUTCMonth() + 1}月</b><small class=\"tw-dim\">${d.getUTCFullYear()}</small></span><div class=\"tw-month\">${WEEK.map(w => `<i>${w}</i>`).join('')}${cells.map(n => `<span${n === day ? ' class=\"today\"' : ''}>${n}</span>`).join('')}</div>`;", "Today month grid UTC header");
        code = replaceOnce(code, "  function face() {\n    const d = now(), m = d.getMinutes(), h = d.getHours() % 12 + m / 60;", "  function face(current = now()) {\n    if (!current) return '<span class=\"tw-line\">--:--</span>';\n    const d = current.date, m = d.getUTCMinutes(), h = d.getUTCHours() % 12 + m / 60;", "Today analog hands game time");
        code = replaceOnce(code, "  function clockBody(size) {\n    if (size === 's') return face();\n    const d = now();\n    return `<div class=\"tw-row\">${face()}<span class=\"tw-stack\"><b class=\"tw-time\">${d.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false})}</b><small class=\"tw-dim\">${d.toLocaleDateString('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'})}</small></span></div>`;\n  }", "  function clockBody(size) {\n    const current = now();\n    if (size === 's') return face(current);\n    if (!current) return '<span class=\"tw-line\">游戏时间未连接</span>';\n    return `<div class=\"tw-row\">${face(current)}<span class=\"tw-stack\"><b class=\"tw-time\">${current.time}</b><small class=\"tw-dim\">${current.label}</small></span></div>`;\n  }", "Today digital clock and date game time");
      }
      if (relative === 'ui/settings.js') {
        code = "import {worldDeviceSettingsMarkup,saveWorldDeviceSettings} from 'virtual:unread-city-phone-settings';\n" + code;
        code = replaceOnce(code, "          ${toggle('lockOnOpen', '打开时显示锁屏', phone.lockOnOpen, '锁屏可随时跳过，是插件内的外观，不是手机安全锁。想看一眼锁屏，点控制中心里的「锁屏」。')}\n", "", 'move original cosmetic lockscreen preference into privacy section');
        code = replaceOnce(code, "      + groupTitle('资料')", "      + groupTitle('锁屏与共享')\n      + `<div class=\"group pad\">${toggle('lockOnOpen', '打开时显示锁屏', phone.lockOnOpen, '锁屏可随时跳过，是插件内的外观，不是手机安全锁。想看一眼锁屏，点控制中心里的「锁屏」。')}${worldDeviceSettingsMarkup(ctx.win)}</div>`\n      + groupTitle('资料')", 'unify lockscreen and sharing inside native Settings');
        code = replaceOnce(code, "      case 'theme': await api.savePhone({theme: el.dataset.value}); await render(); break;", "      case 'world-device-save': await v.busy(el, async () => { try { const updated = await saveWorldDeviceSettings(ctx.win, v.root); await render(); ctx.notify(updated ? '锁屏与共享已保存' : '设置没有变化'); } catch (error) { await render(); throw error; } }); break;\n      case 'theme': await api.savePhone({theme: el.dataset.value}); await render(); break;", 'save current character-card device permissions from Settings');
      }
      if (relative === 'ui/apps.js') {
        code = replaceOnce(code, 'export const APPS = {', `export const APPS = {
          worldstyle: {name:'桌面与外观',eyebrow:'Appearance',colors:['#e8ecdc','#46665d','#c2a880']},
          appie: {name:'Appie Pay',eyebrow:'Game Wallet',colors:['#a3c7b8','#47645e','#ffdea5']},
          worldshop: {name:'购物',eyebrow:'Shopping',colors:['#f6d1a1','#b37644','#f9ea9b']},
          worlddelivery: {name:'外卖',eyebrow:'Delivery',colors:['#ffdd83','#e59f3e','#fff4c6']},
          worldcalendar: {name:'日历',eyebrow:'Calendar',colors:['#a6c8e8','#577998','#f2d9bd']},
          worldmessages: {name:'消息',eyebrow:'World Messages',colors:['#b8dfcc','#4a9174','#f5c8dc']},
          worldpeek: {name:'查手机',eyebrow:'Peek',colors:['#ffc6e0','#c85a9a','#9fe0ff']},
          twiitch: {name:'Twiitch',eyebrow:'Stream',colors:['#f2d8ff','#a05ce0','#ffd36a']},`, '游戏应用目录');
        code = replaceOnce(code, '  pages: [', "  pages: [\n    ['appie','worldshop','worlddelivery','worldcalendar','worldmessages',SLOT,SLOT,SLOT],", '游戏应用首页');
      }
      if (relative === 'ui/chat.js') {
        code = replaceOnce(code, '    thread = loaded;', `    thread = loaded;
    const world=ctx.win.parent.__unreadCityWorldPhone?.read();
    if(thread?.storyLink?.npcId && ctx.openWorldContact && world &&
      (world.npcPhone?.contacts.some(c=>c.contactId===thread.storyLink.npcId)||thread.storyLink.npcId==='protagonist-'+world.other.id)) {
      if(thread.unread && ctx.visible?.('chat')!==false)await api.markThreadRead(threadId);
      if(v.disposed||ticket!==epoch)return;
      ctx.openWorldContact(thread.storyLink.npcId);return;
    }`, '剧情联系人会话使用受控短信');
      }
      if (relative === 'host-chat.js') {
        code = replaceOnce(code, "      const s = settings(), preset = activeChatPreset(s.chat), people = members(thread),", "      if(thread.storyLink?.npcId && globalThis.__unreadCityWorldPhone)throw Error('请从手机消息页继续这段对话。');\n      const s = settings(), preset = activeChatPreset(s.chat), people = members(thread),", '禁止剧情联系人绕过私密上下文路由');
      }
      if (relative === 'core/tokens.js') {
        code = replaceOnce(code, "const get = read || (async name => { const r = await fetch(new URL('../tokenizers/' + name, import.meta.url)); if (!r.ok) throw Error('读不到分词表'); return r.text(); });", "const get = read || (async name => { const runtime = globalThis.__unreadCityEmbeddedPhoneRuntime || globalThis.parent?.__unreadCityEmbeddedPhoneRuntime; if (!runtime?.readAsset) throw Error('内嵌分词表未就绪'); return runtime.readAsset(name); });", '内嵌分词表');
      }
      if (relative === 'core/floating.js') {
        code = replaceOnce(code, "function ensureStyle() {", "function ensureStyle() { return; /* Host CSS is owned by the embedded runtime. */", '浮动按钮样式已合并');
        code = replaceOnce(code, "link.href = new URL('../floating.css', import.meta.url).href;", "link.href = '';", '浮动按钮无需资源路径');
      }
      if (relative === 'host-memory.js') {
        code = replaceOnce(code, "if (o.enabled && kept.length < fresh.length) tidy(thread.id, {force: true}).catch(() => {});", '// Embedded mode never summarizes history merely because a card opened.', '取消打开卡片时自动总结');
        code = replaceOnce(code, 'if (o.story) await moveOldSwitch(ctx);', '// Preserve legacy story-memory switches; no migration merely on opening a card.', '取消启动时旧记忆开关迁移');
      }
      if (relative === 'index.js') {
        code = "import {portableData} from 'virtual:unread-city-phone-data';\n" + code;
        code = replaceOnce(code, "const base=new URL('.',import.meta.url),marker=globalThis.crypto?.randomUUID?.()||'unavailable';", "const base=new URL('./__unread_city_embedded_phone__/',location.href),marker=globalThis.crypto?.randomUUID?.()||'unavailable'; const previousInterceptor=globalThis.stIphonieInterceptor;", '手机内嵌根路径');
        code = replaceOnce(code, "import(new URL('../../../personas.js',import.meta.url).href)", "import('/scripts/personas.js')", '酒馆人物模块');
        code = replaceOnce(code, "frame.src=new URL('ui/index.html',base).href", 'frame.srcdoc=portableData.phoneHtml', '手机页面');
        code = replaceOnce(code, "entry.id='sttts-extension-entry';", "entry.id='sttts-extension-entry';entry.dataset.unreadCityPhoneOwner=marker;", '设置入口所有权');
        code = replaceOnce(code, "item.id='sttts-wand-entry';", "item.id='sttts-wand-entry';item.dataset.unreadCityPhoneOwner=marker;", '菜单入口所有权');
        code = replaceOnce(code, "json(new URL('manifest.json',base))", 'Promise.resolve(portableData.manifest)', '自检版本');
        code = replaceOnce(code, "fetch(new URL('manifest.json',base)).then(r=>r.ok?r.json():null).catch(()=>null)", 'Promise.resolve(portableData.manifest)', '备份版本');
        code = replaceOnce(code, "soundPack:new URL('sounds/',base).href", "soundPack:''", '可选声音资源');
        code = replaceOnce(code, "notice('ST-iPhonie 需要 SillyTavern 1.13.2 或更新版本');return;", "throw Error('当前酒馆缺少手机所需的上下文、消息渲染或事件接口');", '按能力报告依赖');
        code = code.replaceAll("if(backend.settings.sync.enabled)backend.syncNow().catch(()=>{});", '');
        code = code.replaceAll("if(settings?.sync?.enabled&&!panel?.open)backend?.syncNow().catch(()=>{});", '');
        code = code.replaceAll("document.addEventListener('visibilitychange',flushSync);", '');
        code = replaceOnce(code, 'chats.tidyNotes().catch(()=>{});', '', '取消启动时旧系统消息清理');
        code = replaceOnce(code, "subscribe(ctx.eventTypes.MESSAGE_RECEIVED,id=>{chats?.storyReplied(id??(context()?.chat||[]).length-1).catch(()=>{});soundHost?.received(id??(context()?.chat||[]).length-1);tagSpeakers((context()?.chat||[]).slice(-1));voiceAhead((context()?.chat||[]).slice(-1));momentsHost?.storyReplied();callHost?.storyReplied();});", "subscribe(ctx.eventTypes.MESSAGE_RECEIVED,()=>{tagSpeakers((context()?.chat||[]).slice(-1));});", '聊天事件只更新联系人');
        code = replaceOnce(code, "subscribe(ctx.eventTypes.CHAT_CHANGED,()=>soundHost?.chatChanged());soundHost.chatChanged();", '', '取消切换时自动播放');
        code = replaceOnce(code, "subscribe(ctx.eventTypes.CHARACTER_MESSAGE_RENDERED,id=>{soundHost?.rendered(id);musicHost?.rendered(id);pictures?.autoPictures(Number(id)).catch(e=>notice(e.message));});", '', '取消重绘自动生成');
        code = replaceOnce(code, "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>enable().catch(e=>notice(e.message)),{once:true});else enable().catch(e=>notice(e.message));", '', '专用入口控制启用');
        // Full cleanup even when enable failed before active=true. Each resource
        // is independent so one failing service cannot strand the phone host.
        code += `\nexport async function disposePortable(){
          if(enabling)try{await enabling;}catch{}
          active=false;renderEpoch++;const clean=fn=>{try{fn();}catch{}};
          if(globalThis.STiPhonieStoryHost===storyHost?.api)delete globalThis.STiPhonieStoryHost;
          clean(()=>storyHost?.dispose());storyHost=null;
          if(globalThis.STiPhoniePanelHost===panelHost?.api)delete globalThis.STiPhoniePanelHost;
          if(globalThis.__stIphoniePanelBridge?.connect===connect)delete globalThis.__stIphoniePanelBridge;
          clean(()=>panelHost?.dispose());panelHost=null;
          clean(()=>cancelAnimationFrame(lineRaf));clean(()=>lineMedia?.removeEventListener('change',animateLines));
          document.removeEventListener('visibilitychange',animateLines);document.removeEventListener('click',click,true);document.removeEventListener('keydown',keyUnlock,true);document.removeEventListener('visibilitychange',flushSync);
          for(const [source,event,fn] of listeners)clean(()=>source.removeListener(event,fn));listeners.length=0;
          clean(()=>observer?.disconnect());clearTimeout(renderTimer);renderTimer=0;clean(()=>watchPanelLayout(false));
          clean(()=>player?.stop());if(globalThis.stIphonieInterceptor===portableInterceptor)clean(clearPrompts);clean(()=>floating?.destroy());floating=null;
          clean(()=>frame?.contentWindow?.stTtsPhone?.dispose());clean(()=>panel?.remove());panel=frame=null;
          document.querySelectorAll('[data-unread-city-phone-owner="'+marker+'"]').forEach(el=>el.remove());
          for(const item of [assistantHost,musicHost,memoryHost,soundHost])clean(()=>item?.close());
          for(const item of [musicIsland,voiceIsland,momentsWatch,noteIsland,callHost,callIsland,msgIsland])clean(()=>item?.dispose());
          if(globalThis.stIphonieInterceptor===portableInterceptor) {clean(rerender);clearTimeout(renderTimer);renderTimer=0;if(previousInterceptor===undefined)delete globalThis.stIphonieInterceptor;else globalThis.stIphonieInterceptor=previousInterceptor;}
          globalThis.__stIphonieCopies?.delete('__unread_city_embedded_phone__');
          try{await backend?.close();}finally{backend=null;}
        }\nconst portableInterceptor=globalThis.stIphonieInterceptor;\n`;
        if (includeSounds) {
          code = replaceOnce(code, 'await backend.initialize();', `await backend.initialize();backend.packAll=async()=>portableData.soundManifest.sounds.map(row=>({...row,id:'pack:'+row.file+'#'+row.name+'#'+row.layer,mime:'audio/mpeg',source:'pack',at:0,url:'data:audio/mpeg;base64,'+portableData.sounds[row.file]}));`, '完整音效包');
        }
      }
      if (relative === 'core/backend.js') {
        // Keep the manual sync API, but card initialization/data reads must not
        // schedule writes to the remote Tavern from an old automatic setting.
        code = replaceOnce(code, 'scheduleSync(delay = 4000) {', 'scheduleSync(delay = 4000) { return; /* Explicit syncNow remains available. */', '自动同步');
      }
      return { code, map: null };
    },
  };
}
async function bundle(entry, name, stage) {
  const result = await build({ configFile: false, root: phoneRoot, logLevel: 'warn', plugins: [plugin(stage)],
    build: { write: false, sourcemap: false, target: 'es2020', minify: true, lib: { entry: path.join(phoneRoot, entry), name, formats: ['iife'] },
      rollupOptions: { external: id => /^\/(?:scripts|lib)\//.test(id) } } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const chunks = outputs.filter(item => item.type === 'chunk');
  if (chunks.length !== 1 || outputs.some(item => item.type === 'asset')) throw Error('内嵌手机必须构建为单个脚本');
  if (chunks[0].code.includes('import.meta')) throw Error('内嵌手机仍有未适配的 import.meta');
  return chunks[0].code;
}
const ui = await bundle('ui/phone.js', 'UnreadCityPhoneUI', 'ui');
// Inline only trusted, built repository code. Escape HTML parser terminators in
// JS/CSS; no chat text or user configuration is interpolated into srcdoc.
phoneHtml = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ST-iPhonie</title><style>' + phoneCss.replace(/<\/style/gi, '<\\/style') + '</style></head><body><div id="root"><p class="startup" role="status">正在打开 ST-iPhonie…</p></div><script>' + ui.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
const runtime = await bundle('portable/entry.js', 'UnreadCityPhoneRuntime', 'runtime');
const guardedRuntime = '/* UNREAD_CITY_EMBEDDED_PHONE */\n(()=>{if(globalThis.STiPhoniePanelHost?.mount||globalThis.__stIphoniePanelBridge?.connect||globalThis.__unreadCityEmbeddedPhoneRuntime)return;\n' + runtime + '\n})();';
const metadata = { source: 'ST-iPhonie', version: manifest.version, generatedAt: new Date().toISOString(), sourceFiles: sourceFiles.size,
  runtimeBytes: Buffer.byteLength(guardedRuntime), uiBytes: Buffer.byteLength(ui), tokenizerBytes: Object.values(tokenizers).reduce((sum, value) => sum + Buffer.byteLength(value), 0),
  phoneArtAssets: Object.keys(phoneArt).length, phoneArtBytes: Object.values(phoneArt).reduce((n,s)=>n+Buffer.byteLength(s),0),
  soundPackIncluded: includeSounds, soundFiles: Object.keys(sounds).length, autoServicesOnCardLoad: false, dataNamespace: 'stTtsDialogue',
  runtimeSha256: createHash('sha256').update(guardedRuntime).digest('hex'), sources: Object.fromEntries([...sourceFiles].sort()) };
await mkdir(generated, { recursive: true });
await writeFile(path.join(generated, 'embedded-phone-runtime.txt'), guardedRuntime);
await writeFile(path.join(generated, 'embedded-phone.ts'), '// Generated by scripts/build_embedded_phone.mjs. No private settings or data.\nimport embeddedPhoneRuntimeSource from \'./embedded-phone-runtime.txt?raw\';\nexport { embeddedPhoneRuntimeSource };\nexport const embeddedPhoneMetadata = ' + JSON.stringify(metadata) + ' as const;\n');
await writeFile(path.join(generated, 'embedded-phone-licenses.txt'), '# ST-iPhonie private embedded build\nOverall upstream: no license declared; this private build does not grant redistribution rights.\n\n# Marked\n' + licenses.marked + '\n\n# Tokenizer data\n' + await text('tokenizers/README.md') + '\n' + licenses.tokenizers + (includeSounds ? '\n\n' + await text('sounds/README.md') : ''));
console.log(JSON.stringify({ ...metadata, sources: undefined }));


