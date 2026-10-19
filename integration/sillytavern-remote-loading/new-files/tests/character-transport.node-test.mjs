import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { packCharacter, sendCharacterResponse } from '../src/character-transport.js';
import { CHARACTER_CACHE_FORMAT, CHARACTER_TRANSPORT_FORMAT, CHARACTER_TRANSPORT_HEADER, unpackCharacter, readCharacterResponse } from '../public/scripts/character-transport.js';

const wire = value => JSON.parse(JSON.stringify(value));
const roundTrip = character => unpackCharacter(wire(packCharacter(character)));
const own = (object, key, value) => Object.defineProperty(object, key, {
    value, enumerable: true, writable: true, configurable: true,
});

test('keeps exact Unicode/whitespace/raw JSON and every unknown extension', () => {
    const raw = '{\n "spec":"chara_card_v2", "data":{"name":"未读 🦋","extensions":{"foreign":{"nul":null,"escaped":"\\u4e2d\\n","array":[false,0,""]}}},"unknown":{"value":42}\n}';
    const character = { ...JSON.parse(raw), json_data: raw, name: '未读 🦋', avatar: 'test.png', chat: '2026-10-19', date_added: 42 };
    const packed = packCharacter(character);
    assert.equal(Object.hasOwn(packed.overrides, 'data'), false);
    assert.deepStrictEqual(roundTrip(character), wire(character));
    assert.equal(roundTrip(character).json_data, raw);
});

test('detects nested mutations, new fields, deleted fields and omitted undefined', () => {
    const raw = '{"data":{"extensions":{"nested":{"value":1}}},"remove":1,"omit":2,"untouched":null}';
    const character = JSON.parse(raw);
    character.data.extensions.nested.value = 2;
    delete character.remove;
    character.omit = undefined;
    character.added = { null: null };
    character.json_data = raw;
    assert.deepStrictEqual(roundTrip(character), wire(character));
    assert.equal(packCharacter(character).overrides.data.extensions.nested.value, 2);
});

test('preserves special own keys without changing any prototype', () => {
    const raw = '{"__proto__":{"polluted":"raw"},"constructor":{"prototype":{"danger":true}},"prototype":1,"data":{"extensions":{"__proto__":{"x":1}}}}';
    const character = JSON.parse(raw);
    own(character, '__proto__', { polluted: 'changed' });
    own(character, 'constructor', null);
    character.json_data = raw;
    const result = roundTrip(character);
    assert.deepStrictEqual(result, wire(character));
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(Object.prototype.danger, undefined);
    assert.equal(Object.hasOwn(result, '__proto__'), true);
});

test('preserves raw json_data accidentally embedded in a card without recursion', () => {
    const raw = '{"name":"test","json_data":"old embedded text","data":null}';
    const character = { ...JSON.parse(raw), json_data: raw };
    assert.deepStrictEqual(roundTrip(character), wire(character));
    assert.equal(roundTrip(character).json_data, raw);
});

test('falls back without loss for shallow records, malformed raw JSON and JSON null', () => {
    for (const character of [null, { shallow: true, data: { name: 'test' } }, { json_data: 'null', data: null }, { json_data: '[]', data: [] }, { json_data: 'invalid' }]) {
        assert.deepStrictEqual(roundTrip(character), wire(character));
    }
});

test('only the exact protocol request opts in; third parties retain their objects', () => {
    const character = { name: 'test', data: {}, json_data: '{"name":"test","data":{}}' };
    for (const marker of [undefined, true, 'true', 'json-data-v0', 'json-data-v2']) {
        const headers = new Map();
        const response = { setHeader: (key, value) => headers.set(key, value), send: data => data };
        const result = sendCharacterResponse({ body: { character_transport: marker } }, response, character);
        assert.equal(result, character);
        assert.equal(headers.size, 0);
    }
});

test('list and single responses restore before extensions can consume them', async () => {
    const character = { name: 'test', data: {}, json_data: '{"name":"test","data":{}}' };
    for (const payload of [character, [character, { shallow: true, name: 'small' }]]) {
        const headers = {};
        const response = { setHeader: (key, value) => own(headers, key, value), send: data => data };
        const packed = sendCharacterResponse({ body: { character_transport: CHARACTER_TRANSPORT_FORMAT } }, response, payload);
        assert.equal(headers[CHARACTER_TRANSPORT_HEADER], CHARACTER_TRANSPORT_FORMAT);
        const restored = await readCharacterResponse(new Response(JSON.stringify(packed), { headers }));
        assert.deepStrictEqual(restored, payload);
    }
});

test('older servers and marker-like card fields cannot trigger decoding', async () => {
    const character = { format: CHARACTER_TRANSPORT_FORMAT, json_data: 'legacy', overrides: 'foreign', full: 'foreign' };
    for (const headers of [{}, { [CHARACTER_TRANSPORT_HEADER]: 'json-data-v2' }]) {
        assert.deepStrictEqual(await readCharacterResponse(new Response(JSON.stringify(character), { headers })), character);
    }
});

test('large embedded content crosses the wire once and remains fully editable', () => {
    const asset = Array.from({ length: 20000 }, (_, i) => `asset-${i.toString(36)}-未读`).join('');
    const raw = JSON.stringify({ spec: 'chara_card_v2', data: { extensions: { helper: asset } } });
    const character = { ...JSON.parse(raw), json_data: raw, avatar: 'test.png' };
    const full = JSON.stringify(character);
    const packed = JSON.stringify(packCharacter(character));
    assert.ok(Buffer.byteLength(packed) < Buffer.byteLength(full) * 0.55);
    assert.ok(gzipSync(packed).length < gzipSync(full).length * 0.6);
    const restored = unpackCharacter(JSON.parse(packed));
    assert.deepStrictEqual(restored, wire(character));
    restored.data.extensions.helper = 'edited';
    assert.equal(JSON.parse(restored.json_data).data.extensions.helper, asset);
});

// Integration checks use the installed /all and /get handlers and real PNG parser.
// Their config and files live in a dedicated temporary directory, never user data.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'st-character-transport-test-'));
const directories = Object.fromEntries(['characters', 'chats', 'worlds'].map(name => [name, path.join(fixtureRoot, name)]));
for (const directory of Object.values(directories)) fs.mkdirSync(directory);
const fixtureConfig = path.join(fixtureRoot, 'config.yaml');
fs.writeFileSync(fixtureConfig, 'performance:\n  useDiskCache: false\n  lazyLoadCharacters: false\n');
const { setConfigFilePath } = await import('../src/util.js');
setConfigFilePath(fixtureConfig);
globalThis.DATA_ROOT = fixtureRoot;
globalThis.COMMAND_LINE_ARGS = {};
const { router, diskCache } = await import('../src/endpoints/characters.js');
const { default: encode } = await import('../src/png/encode.js');
const { default: pngText } = await import('png-chunk-text');
const { read: readCard } = await import('../src/character-card-parser.js');

after(() => {
    diskCache.dispose();
    const resolved = path.resolve(fixtureRoot);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('st-character-transport-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
});

function writeFixture(filename, value) {
    const raw = JSON.stringify(value);
    const png = encode([
        { name: 'IHDR', data: new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]) },
        pngText.encode('chara', Buffer.from(raw).toString('base64')),
        { name: 'IEND', data: new Uint8Array() },
    ]);
    fs.writeFileSync(path.join(directories.characters, filename), png);
    return raw;
}

async function callRoute(route, body, routeDirectories = directories) {
    const headers = {};
    let status = 200;
    let payload;
    const request = { body, user: { directories: routeDirectories, profile: { handle: 'fixture-user' } } };
    const response = {
        setHeader: (key, value) => own(headers, key, value),
        status(code) { status = code; return this; },
        sendStatus(code) { status = code; return this; },
        send(data) { payload = data; return this; },
    };
    const handler = router.stack.find(layer => layer.route?.path === route).route.stack.at(-1).handle;
    await handler(request, response);
    assert.equal(status, 200);
    return { payload, headers };
}

const v2 = {
    spec: 'chara_card_v2', spec_version: '2.0', chat: 'fixed-chat',
    data: { name: '中文 🦋', description: '', personality: '', scenario: '', first_mes: '', mes_example: '', tags: [], extensions: { foreign: { value: null } } },
    foreign: { untouched: ['hello', null] },
};

test('actual character handlers preserve V1 migration and V2 missing extension defaults', async () => {
    const cases = [
        ['v1.png', { name: 'Legacy', chat: 'fixed-chat', description: 'old description', tags: ['one'], foreign: { keep: 1 } }],
        ['v2.png', v2],
        ['v2-null.png', { ...v2, data: { ...v2.data, description: null, extensions: null } }],
        ['v2-no-data.png', { spec: 'chara_card_v2', name: 'No Data', chat: 'fixed-chat', foreign: null }],
        ['v2-special.png', JSON.parse(JSON.stringify(v2).replace('"foreign":{"untouched"', '"__proto__":{"untouched"'))],
    ];
    for (const [filename, value] of cases) {
        const raw = writeFixture(filename, value);
        const full = await callRoute('/get', { avatar_url: filename });
        const compact = await callRoute('/get', { avatar_url: filename, character_transport: CHARACTER_TRANSPORT_FORMAT });
        const restored = await readCharacterResponse(new Response(JSON.stringify(compact.payload), { headers: compact.headers }));
        assert.deepStrictEqual(restored, wire(full.payload));
        assert.equal(restored.json_data, raw);
        assert.equal(Object.getPrototypeOf(restored), Object.prototype);
        assert.equal(Object.prototype.untouched, undefined);
        const initial = await callRoute('/get', { avatar_url: filename, character_transport: CHARACTER_CACHE_FORMAT });
        const cached = await callRoute('/get', { avatar_url: filename, character_transport: CHARACTER_CACHE_FORMAT, character_cache: {
            user: 'fixture-user', avatar: filename, sha256: initial.payload.sha256,
        } });
        assert.equal(cached.headers[CHARACTER_TRANSPORT_HEADER], CHARACTER_CACHE_FORMAT);
        assert.equal(Object.hasOwn(cached.payload.character, 'json_data'), false);
        assert.deepStrictEqual(unpackCharacter(wire({ ...cached.payload.character, json_data: initial.payload.character.json_data })), wire(full.payload));
    }
    const full = await callRoute('/all', {});
    const compact = await callRoute('/all', { character_transport: CHARACTER_TRANSPORT_FORMAT });
    assert.deepStrictEqual(await readCharacterResponse(new Response(JSON.stringify(compact.payload), { headers: compact.headers })), wire(full.payload));
    const unchanged = await callRoute('/all', { character_transport: CHARACTER_CACHE_FORMAT });
    assert.deepStrictEqual(wire(unchanged.payload), wire(full.payload));
    assert.equal(unchanged.headers[CHARACTER_TRANSPORT_HEADER], undefined);
});

test('actual installed cards round-trip losslessly (opt-in read-only check)', { skip: !process.env.ST_TRANSPORT_VERIFY_CHARACTERS }, async () => {
    const characterDirectory = path.resolve(process.env.ST_TRANSPORT_VERIFY_CHARACTERS);
    const installedDirectories = { ...directories, characters: characterDirectory };
    let count = 0;
    let fullBytes = 0;
    let compactBytes = 0;
    let fullGzipBytes = 0;
    let compactGzipBytes = 0;
    let cacheHitBytes = 0;
    let cacheHitGzipBytes = 0;
    let packingMs = 0;
    for (const filename of fs.readdirSync(characterDirectory).filter(name => name.endsWith('.png'))) {
        const full = await callRoute('/get', { avatar_url: filename }, installedDirectories);
        const start = performance.now();
        const packed = packCharacter(full.payload);
        packingMs += performance.now() - start;
        const serializedFull = JSON.stringify(full.payload);
        const serializedCompact = JSON.stringify(packed);
        const restored = unpackCharacter(JSON.parse(serializedCompact));
        assert.deepStrictEqual(restored, JSON.parse(serializedFull));
        assert.equal(restored.json_data, readCard(fs.readFileSync(path.join(characterDirectory, filename))));
        const initial = await callRoute('/get', { avatar_url: filename, character_transport: CHARACTER_CACHE_FORMAT }, installedDirectories);
        const cached = await callRoute('/get', { avatar_url: filename, character_transport: CHARACTER_CACHE_FORMAT, character_cache: {
            user: 'fixture-user', avatar: filename, sha256: initial.payload.sha256,
        } }, installedDirectories);
        assert.equal(Object.hasOwn(cached.payload.character, 'json_data'), false);
        assert.deepStrictEqual(unpackCharacter(wire({ ...cached.payload.character, json_data: initial.payload.character.json_data })), JSON.parse(serializedFull));
        const serializedHit = JSON.stringify(cached.payload);
        cacheHitBytes += Buffer.byteLength(serializedHit);
        cacheHitGzipBytes += gzipSync(serializedHit).length;
        fullBytes += Buffer.byteLength(serializedFull);
        compactBytes += Buffer.byteLength(serializedCompact);
        fullGzipBytes += gzipSync(serializedFull).length;
        compactGzipBytes += gzipSync(serializedCompact).length;
        count++;
    }
    console.log(JSON.stringify({ installedCardsVerified: count, fullBytes, compactBytes, fullGzipBytes, compactGzipBytes, cacheHitBytes, cacheHitGzipBytes, packingMs: Math.round(packingMs) }));
    assert.ok(count > 0);
});
