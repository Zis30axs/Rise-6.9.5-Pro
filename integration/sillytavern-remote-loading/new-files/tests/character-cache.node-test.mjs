import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import sha256Module from 'js-sha256';
import localforage from 'localforage';
import { sendCachedCharacterResponse, sendCharacterResponse } from '../src/character-transport.js';
import { CHARACTER_CACHE_FORMAT, CHARACTER_TRANSPORT_FORMAT, CHARACTER_TRANSPORT_HEADER } from '../public/scripts/character-transport.js';
import { fetchCharacterWithCache, createCharacterPublicationGuard } from '../public/scripts/character-cache.js';

const hash = sha256Module.sha256;
const wire = value => JSON.parse(JSON.stringify(value));
const key = (user, avatar) => JSON.stringify([user, avatar]);
const makeCard = (content = '未读 🦋', chat = 'chat-1') => {
    const json_data = JSON.stringify({ spec: 'chara_card_v2', data: { name: 'test', extensions: { helper: content } }, foreign: null });
    return { ...JSON.parse(json_data), json_data, avatar: 'test.png', name: 'test', chat, chat_size: 12, date_last_chat: 1 };
};

function storageFixture() {
    const entries = new Map();
    return {
        entries,
        reads: [],
        writes: [],
        async getItem(id) { this.reads.push(id); return entries.has(id) ? structuredClone(entries.get(id)) : null; },
        async setItem(id, value) { this.writes.push(id); entries.set(id, structuredClone(value)); return value; },
    };
}

function serverFixture() {
    const state = { user: 'alice', card: makeCard(), calls: [], responses: [], older: false, identityFail: false, mutate: null };
    state.fetchImpl = async (url, options) => {
        assert.equal(options.cache, 'no-store');
        assert.equal(options.headers['X-CSRF-Token'], 'test-token');
        if (url === '/api/users/me') {
            return new Response(JSON.stringify({ handle: state.user }), { status: state.identityFail ? 403 : 200 });
        }
        assert.equal(url, '/api/characters/get');
        const body = JSON.parse(options.body);
        state.calls.push(body);
        const headers = {};
        let payload;
        const request = { body, user: { profile: { handle: state.user } } };
        const response = { setHeader: (name, value) => { headers[name] = value; }, send: value => { payload = value; } };
        if (state.older) sendCharacterResponse(request, response, state.card);
        else sendCachedCharacterResponse(request, response, state.card);
        if (state.mutate) payload = state.mutate(payload, body);
        state.responses.push(wire(payload));
        return new Response(JSON.stringify(payload), { headers });
    };
    return state;
}

const options = (server, storage, extra = {}) => ({ storage, hash, headers: { 'X-CSRF-Token': 'test-token' }, fetchImpl: server.fetchImpl, timeoutMs: 50, ...extra });

test('bundled HTTP-safe SHA-256 matches server UTF-8 hashes', () => {
    for (const raw of ['中文 🦋\n', '\u0000', makeCard().json_data, '']) {
        const expected = createHash('sha256').update(raw, 'utf8').digest('hex');
        assert.equal(hash(raw), expected);
        assert.equal(hash.create().update(raw).hex(), expected);
    }
});

test('first visit downloads raw once; a fresh fetcher reuses persistent raw and receives latest runtime fields', async () => {
    const server = serverFixture();
    const storage = storageFixture();
    const first = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(first.character, server.card);
    assert.equal(typeof server.responses[0].character.json_data, 'string');
    server.card = { ...server.card, chat: 'changed-chat', chat_size: 999, date_last_chat: 77 };
    const second = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(second.character, server.card);
    assert.equal(Object.hasOwn(server.responses[1].character, 'json_data'), false);
    assert.equal(server.calls[1].character_cache.sha256, hash(server.card.json_data));
    assert.equal(storage.writes.length, 1);
});

test('edited server card invalidates old hash and replaces only its own cache entry', async () => {
    const server = serverFixture();
    const storage = storageFixture();
    storage.entries.set('unrelated', { keep: true });
    await fetchCharacterWithCache('test.png', options(server, storage));
    server.card = makeCard('new script and asset bytes');
    const changed = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(changed.character, server.card);
    assert.equal(server.responses[1].character.json_data, server.card.json_data);
    assert.equal(storage.entries.get(key('alice', 'test.png')).json_data, server.card.json_data);
    assert.deepStrictEqual(storage.entries.get('unrelated'), { keep: true });
});

test('logging into another account never reads or validates another account same-name card cache', async () => {
    const server = serverFixture();
    const storage = storageFixture();
    await fetchCharacterWithCache('test.png', options(server, storage));
    server.user = 'bob';
    server.card = makeCard('bob-private');
    const result = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(result.character, server.card);
    assert.equal(server.calls[1].character_cache, undefined);
    assert.equal(storage.reads.at(-1), key('bob', 'test.png'));
    assert.equal(storage.entries.size, 2);
    server.user = 'alice';
    server.card = makeCard();
    await fetchCharacterWithCache('test.png', options(server, storage));
    assert.equal(server.calls[2].character_cache.user, 'alice');
    assert.equal(Object.hasOwn(server.responses[2].character, 'json_data'), false);
});

test('server refuses other-user or other-avatar validators even when raw hashes match', () => {
    const card = makeCard();
    for (const validator of [
        { user: 'bob', avatar: card.avatar, sha256: hash(card.json_data) },
        { user: 'alice', avatar: 'other.png', sha256: hash(card.json_data) },
        { user: 'alice', avatar: card.avatar, sha256: 'invalid' },
    ]) {
        let payload;
        sendCachedCharacterResponse({ body: { avatar_url: card.avatar, character_transport: CHARACTER_CACHE_FORMAT, character_cache: validator }, user: { profile: { handle: 'alice' } } }, { setHeader() {}, send: value => { payload = value; } }, card);
        assert.equal(payload.character.json_data, card.json_data);
    }
});

test('account switch between identity and card requests falls back to complete current-account response', async () => {
    const server = serverFixture();
    const storage = storageFixture();
    await fetchCharacterWithCache('test.png', options(server, storage));
    const fetchImpl = async (url, init) => {
        const response = await server.fetchImpl(url, init);
        if (url === '/api/users/me') {
            server.user = 'bob';
            server.card = makeCard('bob-card');
        }
        return response;
    };
    const result = await fetchCharacterWithCache('test.png', options(server, storage, { fetchImpl }));
    assert.deepStrictEqual(result.character, server.card);
    assert.equal(server.calls.at(-1).character_transport, CHARACTER_TRANSPORT_FORMAT);
    assert.equal(storage.entries.has(key('bob', 'test.png')), false);
    assert.equal(storage.entries.get(key('alice', 'test.png')).json_data, makeCard().json_data);
});

test('corrupt, mismatched and evicted cached entries always download complete raw', async () => {
    for (const makeBad of [
        record => ({ ...record, json_data: 'corrupt' }),
        record => ({ ...record, sha256: 'invalid' }),
        record => ({ ...record, user: 'other-user' }),
        record => ({ ...record, avatar: 'other.png' }),
        () => null,
    ]) {
        const server = serverFixture();
        const storage = storageFixture();
        await fetchCharacterWithCache('test.png', options(server, storage));
        storage.entries.set(key('alice', 'test.png'), makeBad(storage.entries.get(key('alice', 'test.png'))));
        const result = await fetchCharacterWithCache('test.png', options(server, storage));
        assert.deepStrictEqual(result.character, server.card);
        assert.equal(server.calls[1].character_cache, undefined);
        assert.equal(server.responses[1].character.json_data, server.card.json_data);
    }
});

test('IndexedDB read/write/private-mode failures do not prevent full character loading', async () => {
    for (const failure of ['read', 'write', 'both', 'blocked']) {
        const server = serverFixture();
        const storage = storageFixture();
        if (failure === 'read' || failure === 'both') storage.getItem = async () => { throw new Error('IndexedDB unavailable'); };
        if (failure === 'write' || failure === 'both') storage.setItem = async () => { throw new Error('QuotaExceededError'); };
        if (failure === 'blocked') storage.getItem = () => new Promise(() => {});
        const result = await fetchCharacterWithCache('test.png', options(server, storage, { timeoutMs: 5 }));
        assert.deepStrictEqual(result.character, server.card);
        assert.equal(server.calls[0].character_cache, undefined);
    }
});

test('actual localforage with no IndexedDB driver falls back without using another storage backend', async () => {
    const server = serverFixture();
    const storage = localforage.createInstance({ name: 'SillyTavern_CharacterTransport_Test', storeName: 'raw_json_v1', driver: localforage.INDEXEDDB });
    await assert.rejects(storage.ready(), /No available storage method/);
    const result = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(result.character, server.card);
    assert.equal(server.calls[0].character_cache, undefined);
    assert.equal(storage.driver(), null);
});

test('identity failures bypass cache entirely and cannot assume default-user', async () => {
    const server = serverFixture();
    server.identityFail = true;
    const storage = storageFixture();
    const result = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(result.character, server.card);
    assert.equal(storage.reads.length, 0);
    assert.equal(storage.writes.length, 0);
    assert.equal(server.calls[0].character_transport, CHARACTER_TRANSPORT_FORMAT);
});

test('older server response remains usable without caching or looping', async () => {
    const server = serverFixture();
    server.older = true;
    const storage = storageFixture();
    const result = await fetchCharacterWithCache('test.png', options(server, storage));
    assert.deepStrictEqual(result.character, server.card);
    assert.equal(server.calls.length, 1);
    assert.equal(storage.writes.length, 0);
});

test('missing cached content or mismatched response hash retries once via unconditional protocol', async () => {
    for (const mutation of [
        payload => { delete payload.character.json_data; return payload; },
        payload => ({ ...payload, sha256: '0'.repeat(64) }),
        payload => ({ ...payload, avatar: 'another.png' }),
    ]) {
        const server = serverFixture();
        server.mutate = (payload, body) => body.character_transport === CHARACTER_CACHE_FORMAT ? mutation(payload) : payload;
        const result = await fetchCharacterWithCache('test.png', options(server, storageFixture()));
        assert.deepStrictEqual(result.character, server.card);
        assert.equal(server.calls.length, 2);
        assert.equal(server.calls[1].character_transport, CHARACTER_TRANSPORT_FORMAT);
    }
});

test('legacy requests retain their protocol and account/avatar key delimiters do not collide', () => {
    const card = makeCard();
    for (const marker of [undefined, CHARACTER_TRANSPORT_FORMAT, 'unknown']) {
        const headers = {};
        let payload;
        sendCachedCharacterResponse({ body: { avatar_url: card.avatar, character_transport: marker }, user: { profile: { handle: 'alice' } } }, { setHeader: (name, value) => { headers[name] = value; }, send: value => { payload = value; } }, card);
        assert.equal(headers[CHARACTER_TRANSPORT_HEADER], marker === CHARACTER_TRANSPORT_FORMAT ? CHARACTER_TRANSPORT_FORMAT : undefined);
        assert.ok(payload);
    }
    assert.notEqual(key('a:b', 'c'), key('a', 'b:c'));
});

const scriptSource = fs.readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const functionStart = scriptSource.indexOf('export async function getOneCharacter(');
const functionEnd = scriptSource.indexOf('\nexport function getCharacterSource(', functionStart);
assert.ok(functionStart > 0 && functionEnd > functionStart);
// Execute the actual installed publication function with controlled dependencies.
const publicationSource = scriptSource.slice(functionStart, functionEnd).replace(/^export /, '');
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

function actualPublisher(characters, fetcher, storage = storageFixture()) {
    return vm.runInNewContext(`${publicationSource}\ngetOneCharacter;`, {
        characters,
        beginCharacterPublication: createCharacterPublicationGuard(),
        fetchCharacterWithCache: fetcher,
        characterRawCache: storage,
        libs: { sha256: hash },
        getRequestHeaders: () => ({ 'X-CSRF-Token': 'test-token' }),
        DOMPurify: { sanitize: value => value },
        toastr: { error() {} },
        t: parts => parts.join(''),
    });
}

test('actual getOneCharacter cannot publish an older account response over a new same-name card', async () => {
    const characters = [{ avatar: 'test.png', name: 'alice-summary' }];
    const older = deferred();
    const newer = deferred();
    let calls = 0;
    const publish = actualPublisher(characters, () => calls++ === 0 ? older.promise : newer.promise);
    const first = publish('test.png');
    characters[0] = { avatar: 'test.png', name: 'bob-summary' };
    const second = publish('test.png');
    newer.resolve({ response: { ok: true }, character: { ...makeCard(), name: 'bob' } });
    await second;
    older.resolve({ response: { ok: true }, character: { ...makeCard(), name: 'alice' } });
    await first;
    assert.equal(characters[0].name, 'bob');
});

test('actual getOneCharacter discards an old response after list refresh even without a newer get request', async () => {
    const characters = [{ avatar: 'test.png', name: 'alice-summary' }];
    const delayed = deferred();
    const publish = actualPublisher(characters, () => delayed.promise);
    const first = publish('test.png');
    const current = { avatar: 'test.png', name: 'bob-summary' };
    characters[0] = current;
    delayed.resolve({ response: { ok: true }, character: { ...makeCard(), name: 'alice' } });
    await first;
    assert.equal(characters[0], current);
});

test('actual getOneCharacter publishes only the newest in-flight request for the same list object', async () => {
    const original = { avatar: 'test.png', name: 'summary' };
    const characters = [original];
    const older = deferred();
    const newer = deferred();
    let calls = 0;
    const publish = actualPublisher(characters, () => calls++ === 0 ? older.promise : newer.promise);
    const first = publish('test.png');
    const second = publish('test.png');
    older.resolve({ response: { ok: true }, character: { ...makeCard(), name: 'stale' } });
    await first;
    assert.equal(characters[0], original);
    newer.resolve({ response: { ok: true }, character: { ...makeCard(), name: 'latest' } });
    await second;
    assert.equal(characters[0].name, 'latest');
});

test('blocked IndexedDB persistence does not delay a successful character response', async () => {
    const server = serverFixture();
    const storage = storageFixture();
    const pendingWrite = deferred();
    storage.setItem = () => pendingWrite.promise;
    const result = await Promise.race([
        fetchCharacterWithCache('test.png', options(server, storage)),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('UI waited for storage write')), 100)),
    ]);
    assert.deepStrictEqual(result.character, server.card);
    pendingWrite.resolve();
});
