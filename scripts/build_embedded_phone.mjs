import { build } from 'vite';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceOption = process.argv.indexOf('--source');
const phoneRoot = await realpath(sourceOption < 0 ? path.resolve(root, '../ST-iPhonie') : path.resolve(process.argv[sourceOption + 1] || ''));
const includeSounds = process.argv.includes('--include-sounds') || process.env.UNREAD_CITY_PHONE_INCLUDE_SOUNDS === '1';
const generated = path.join(root, 'src/frontend/generated');
const text = relative => readFile(path.join(phoneRoot, relative), 'utf8');
const manifest = JSON.parse(await text('manifest.json'));
const tokenizers = { 't5.json': await text('tokenizers/t5.json'), 'qwen.txt': await text('tokenizers/qwen.txt') };
const licenses = { marked: await text('ui/vendor/marked.LICENSE.txt'), tokenizers: await text('tokenizers/LICENSE-Apache-2.0.txt') };
const phoneCss = (await Promise.all(['ui/phone.css', 'ui/skins.css'].map(text))).join('\n');
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
  if (!code.includes(from) || code.indexOf(from) !== code.lastIndexOf(from)) throw Error(`手机源码已变化，请更新内嵌适配：${label}`);
  return code.replace(from, to);
}
const dataModule = '\0virtual:unread-city-phone-data';
let phoneHtml = '';
const sourceFiles = new Map();
function plugin(stage) {
  return {
    name: 'unread-city-private-phone',
    resolveId(id) { if (id === 'virtual:unread-city-phone-data') return dataModule; },
    load(id) {
      if (id === dataModule) return `export const portableData=${JSON.stringify({ version: manifest.version, manifest, hostCss: stage === 'runtime' ? hostCss : '', phoneHtml, tokenizers: stage === 'runtime' ? tokenizers : {}, sounds, soundManifest })};`;
    },
    async transform(code, id) {
      if (id.startsWith('\0')) return;
      const relative = path.relative(phoneRoot, id).replaceAll('\\', '/');
      if (relative.startsWith('../') || path.isAbsolute(relative) || !/^(?:[\w-]+\.js|(?:core|ui|portable)\/[\w./-]+\.js|fish-mobile\/(?:native-host|native-probe|mcp-errors|client)\.js)$/.test(relative) || /(?:^|\/)(?:test|fixtures|node_modules)(?:\/|\.)/.test(relative) || /\.test\.js$/.test(relative)) throw Error(`拒绝打包白名单以外的手机文件：${relative}`);
      sourceFiles.set(relative, createHash('sha256').update(code).digest('hex'));
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
  soundPackIncluded: includeSounds, soundFiles: Object.keys(sounds).length, autoServicesOnCardLoad: false, dataNamespace: 'stTtsDialogue',
  runtimeSha256: createHash('sha256').update(guardedRuntime).digest('hex'), sources: Object.fromEntries([...sourceFiles].sort()) };
await mkdir(generated, { recursive: true });
await writeFile(path.join(generated, 'embedded-phone-runtime.txt'), guardedRuntime);
await writeFile(path.join(generated, 'embedded-phone.ts'), '// Generated by scripts/build_embedded_phone.mjs. No private settings or data.\nimport embeddedPhoneRuntimeSource from \'./embedded-phone-runtime.txt?raw\';\nexport { embeddedPhoneRuntimeSource };\nexport const embeddedPhoneMetadata = ' + JSON.stringify(metadata) + ' as const;\n');
await writeFile(path.join(generated, 'embedded-phone-licenses.txt'), '# ST-iPhonie private embedded build\nOverall upstream: no license declared; this private build does not grant redistribution rights.\n\n# Marked\n' + licenses.marked + '\n\n# Tokenizer data\n' + await text('tokenizers/README.md') + '\n' + licenses.tokenizers + (includeSounds ? '\n\n' + await text('sounds/README.md') : ''));
console.log(JSON.stringify({ ...metadata, sources: undefined }));
