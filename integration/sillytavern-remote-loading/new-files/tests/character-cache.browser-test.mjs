// Standalone headless integration test. All HTTP requests are intercepted;
// no live SillyTavern service, user profile, chats or external website is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sendCachedCharacterResponse } from '../src/character-transport.js';
import { CHARACTER_CACHE_FORMAT } from '../public/scripts/character-transport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwrightRequire = createRequire(process.env.ST_CACHE_PLAYWRIGHT_PACKAGE || path.join(root, 'tests', 'package.json'));
const { chromium } = playwrightRequire('playwright');
const origin = 'http://character-cache.test';
const outputs = process.env.ST_CACHE_BROWSER_OUTPUT;
const makeCard = text => {
    const json_data = JSON.stringify({ spec: 'chara_card_v2', data: { name: 'Synthetic Test', extensions: { helper: `${text}:${'素材-🦋'.repeat(16384)}` } }, unknown: { keep: null } });
    return { ...JSON.parse(json_data), json_data, name: 'Synthetic Test', avatar: 'test.png', chat: 'synthetic-chat', chat_size: 10, date_last_chat: 1 };
};
const state = { user: 'fixture-user', card: makeCard('initial'), responses: [] };
const assets = new Map([
    ['/scripts/character-cache.js', fs.readFileSync(path.join(root, 'public/scripts/character-cache.js'), 'utf8')],
    ['/scripts/character-transport.js', fs.readFileSync(path.join(root, 'public/scripts/character-transport.js'), 'utf8')],
    ['/localforage.js', fs.readFileSync(path.join(root, 'node_modules/localforage/dist/localforage.js'), 'utf8')],
    ['/sha256.js', fs.readFileSync(path.join(root, 'node_modules/js-sha256/src/sha256.js'), 'utf8')],
]);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Character cache integration test</title>
<style>body{font:18px system-ui;margin:40px;max-width:65ch;overflow-wrap:anywhere}pre{white-space:pre-wrap}</style>
<h1>Character cache integration test</h1><p>Isolated synthetic data on an insecure HTTP origin.</p><pre id="result">Ready</pre>
<script src="/localforage.js"></script><script src="/sha256.js"></script>
<script type="module">
import { fetchCharacterWithCache } from '/scripts/character-cache.js';
const storage = localforage.createInstance({name:'SillyTavern_CharacterTransport_Test',storeName:'raw_json_v1',driver:localforage.INDEXEDDB});
window.loadCharacter = async () => {
    const result = await fetchCharacterWithCache('test.png', {storage,hash:sha256,headers:{'X-CSRF-Token':'fixture-csrf'},timeoutMs:500});
    const summary = {ok:result.response.ok,name:result.character?.name,chat:result.character?.chat,rawHash:sha256(result.character.json_data),driver:storage.driver(),secureContext:isSecureContext,subtleAvailable:!!crypto.subtle};
    document.querySelector('#result').textContent=JSON.stringify(summary,null,2);
    return summary;
};
window.storedHash = async () => (await storage.getItem(JSON.stringify(['fixture-user','test.png'])))?.sha256;
window.corruptCache = async () => {
    const key=JSON.stringify(['fixture-user','test.png']);
    const record=await storage.getItem(key);
    await storage.setItem(key,{...record,json_data:'corrupt'});
};
window.integrationReady = true;
</script></html>`;

async function routeContext(context) {
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        assert.equal(url.origin, origin);
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
        if (assets.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: assets.get(url.pathname) });
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
        assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
        if (url.pathname === '/api/users/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ handle: state.user }) });
        assert.equal(url.pathname, '/api/characters/get');
        const body = request.postDataJSON();
        const headers = {};
        let payload;
        sendCachedCharacterResponse({ body, user: { profile: { handle: state.user } } }, {
            setHeader: (name, value) => { headers[name] = value; },
            send: value => { payload = value; },
        }, state.card);
        const serialized = JSON.stringify(payload);
        state.responses.push({ user: state.user, protocol: body.character_transport, conditional: !!body.character_cache, rawSent: typeof payload.character?.json_data === 'string', bytes: Buffer.byteLength(serialized) });
        return route.fulfill({ contentType: 'application/json', headers, body: serialized });
    });
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.ST_CACHE_CHROMIUM || undefined });
const result = { browser: browser.version(), origin, headless: true, syntheticOnly: true, checks: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await routeContext(context);
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => window.integrationReady === true);
    const initial = await page.evaluate(() => window.loadCharacter());
    assert.equal(initial.secureContext, false);
    assert.equal(initial.subtleAvailable, false);
    assert.equal(initial.driver, 'asyncStorage');
    assert.equal(state.responses.at(-1).rawSent, true);
    await page.waitForFunction(async hash => await window.storedHash() === hash, initial.rawHash);
    result.checks.push({ name: 'cold-download-and-real-indexeddb-write', passed: true, response: state.responses.at(-1) });

    state.card.chat = 'latest-runtime-chat';
    await page.reload();
    await page.waitForFunction(() => window.integrationReady === true);
    const repeated = await page.evaluate(() => window.loadCharacter());
    assert.equal(repeated.rawHash, initial.rawHash);
    assert.equal(repeated.chat, 'latest-runtime-chat');
    assert.equal(state.responses.at(-1).conditional, true);
    assert.equal(state.responses.at(-1).rawSent, false);
    result.checks.push({ name: 'page-refresh-real-indexeddb-hit-with-latest-overlay', passed: true, response: state.responses.at(-1) });

    state.card = makeCard('changed-server-card');
    const changed = await page.evaluate(() => window.loadCharacter());
    assert.notEqual(changed.rawHash, initial.rawHash);
    assert.equal(state.responses.at(-1).rawSent, true);
    await page.waitForFunction(async hash => await window.storedHash() === hash, changed.rawHash);
    result.checks.push({ name: 'server-card-edit-forces-full-download', passed: true, response: state.responses.at(-1) });

    await page.evaluate(() => window.corruptCache());
    const repaired = await page.evaluate(() => window.loadCharacter());
    assert.equal(repaired.rawHash, changed.rawHash);
    assert.equal(state.responses.at(-1).conditional, false);
    assert.equal(state.responses.at(-1).rawSent, true);
    await page.waitForFunction(async hash => await window.storedHash() === hash, changed.rawHash);
    result.checks.push({ name: 'corrupt-real-indexeddb-entry-downloads-again', passed: true, response: state.responses.at(-1) });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForFunction(() => window.integrationReady === true);
    assert.equal((await page.evaluate(() => window.loadCharacter())).rawHash, changed.rawHash);
    assert.equal(state.responses.at(-1).rawSent, false);
    result.checks.push({ name: 'mobile-viewport-refresh-real-indexeddb-hit', passed: true, viewport: '390x844', response: state.responses.at(-1) });
    if (outputs) {
        fs.mkdirSync(outputs, { recursive: true });
        await page.screenshot({ path: path.join(outputs, 'http-indexeddb-mobile.png'), fullPage: true });
    }
    await context.close();

    const blocked = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await blocked.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Storage disabled for test', 'SecurityError'); } });
    });
    await routeContext(blocked);
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(origin);
    await blockedPage.waitForFunction(() => window.integrationReady === true);
    const withoutStorage = await blockedPage.evaluate(() => window.loadCharacter());
    assert.equal(withoutStorage.ok, true);
    assert.equal(withoutStorage.driver, null);
    assert.equal(state.responses.at(-1).conditional, false);
    assert.equal(state.responses.at(-1).rawSent, true);
    assert.equal(state.responses.at(-1).protocol, CHARACTER_CACHE_FORMAT);
    result.checks.push({ name: 'actual-browser-indexeddb-securityerror-full-download', passed: true, response: state.responses.at(-1) });
    if (outputs) await blockedPage.screenshot({ path: path.join(outputs, 'http-indexeddb-blocked-desktop.png'), fullPage: true });
    await blocked.close();
    result.passed = result.checks.every(check => check.passed);
    if (outputs) fs.writeFileSync(path.join(outputs, 'browser-verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
} finally {
    await browser.close();
}
