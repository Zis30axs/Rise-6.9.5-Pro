import { CHARACTER_CACHE_FORMAT, CHARACTER_TRANSPORT_FORMAT, CHARACTER_TRANSPORT_HEADER, readCharacterResponse, unpackCharacter } from './character-transport.js';

/** Bound optional cache work so blocked storage cannot prevent opening a card. */
async function optionalCacheWork(work, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            work,
            new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Character cache timeout')), timeoutMs); }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Guard publication against a newer request or an account/list refresh while a
 * request was in flight. Each returned check is consumed once at publication.
 * @returns {function(string, object|undefined): function(object|undefined): boolean} Begin a guarded request
 */
export function createCharacterPublicationGuard() {
    const pending = new Map();
    return (avatar, original) => {
        const token = Symbol();
        pending.set(avatar, token);
        return current => {
            if (pending.get(avatar) !== token) return false;
            pending.delete(avatar);
            return current === original;
        };
    };
}

/**
 * Load a character using a revalidated per-account raw-JSON cache when available.
 * Storage and hashing use ST's existing localforage / js-sha256 libraries. The
 * caller supplies them so this logic can also be tested without a browser DOM.
 * @param {string} avatar Avatar filename
 * @param {object} options Existing browser services
 * @param {object} options.storage Dedicated IndexedDB-only localforage instance
 * @param {function(string): string} options.hash SHA-256 that also works on HTTP
 * @param {object} options.headers Existing ST request headers, including CSRF
 * @param {typeof fetch} [options.fetchImpl] Fetch implementation
 * @param {number} [options.timeoutMs] Maximum optional storage / identity wait
 * @returns {Promise<{response: Response, character: object|undefined}>} Result
 */
export async function fetchCharacterWithCache(avatar, { storage, hash, headers, fetchImpl = globalThis.fetch, timeoutMs = 2000 }) {
    const fetchCard = validator => fetchImpl('/api/characters/get', {
        method: 'POST', headers, cache: 'no-store',
        body: JSON.stringify({ avatar_url: avatar, character_transport: CHARACTER_CACHE_FORMAT, character_cache: validator }),
    });
    const fetchFull = async () => {
        const response = await fetchImpl('/api/characters/get', {
            method: 'POST', headers, cache: 'no-store',
            body: JSON.stringify({ avatar_url: avatar, character_transport: CHARACTER_TRANSPORT_FORMAT }),
        });
        return { response, character: response.ok ? await readCharacterResponse(response) : undefined };
    };

    // Do not trust a stale UI profile or guess default-user: another tab may have
    // changed the login. The server independently checks the account once more.
    let user;
    try {
        user = await optionalCacheWork((async () => {
            const identity = await fetchImpl('/api/users/me', { headers, cache: 'no-store' });
            if (!identity.ok) throw new Error('Character cache identity unavailable');
            const profile = await identity.json();
            if (typeof profile?.handle !== 'string' || !profile.handle) throw new Error('Character cache identity missing');
            return profile.handle;
        })(), timeoutMs);
    } catch {
        return fetchFull();
    }

    const key = JSON.stringify([user, avatar]);
    let cached;
    try {
        const record = await optionalCacheWork(storage.getItem(key), timeoutMs);
        if (record?.user === user && record?.avatar === avatar && typeof record?.json_data === 'string'
            && /^[a-f0-9]{64}$/.test(record?.sha256) && hash(record.json_data) === record.sha256) {
            cached = record;
        }
    } catch {
        // Disabled, blocked, full or corrupt storage cannot stop a full download.
    }

    const response = await fetchCard(cached ? { user, avatar, sha256: cached.sha256 } : undefined);
    if (!response.ok) return { response, character: undefined };
    if (response.headers.get(CHARACTER_TRANSPORT_HEADER) !== CHARACTER_CACHE_FORMAT) {
        // Old servers ignore the new request marker and return the ordinary card.
        return { response, character: await readCharacterResponse(response) };
    }

    let envelope;
    let raw;
    let character;
    try {
        envelope = await response.json();
        if (envelope?.user !== user || envelope?.avatar !== avatar || !/^[a-f0-9]{64}$/.test(envelope?.sha256)) {
            throw new Error('Character cache identity mismatch');
        }
        if (typeof envelope.character?.json_data === 'string') {
            raw = envelope.character.json_data;
            if (hash(raw) !== envelope.sha256) throw new Error('Character cache content mismatch');
        } else {
            if (!cached || cached.sha256 !== envelope.sha256) throw new Error('Character cache content missing');
            raw = cached.json_data;
        }
        character = unpackCharacter({ ...envelope.character, json_data: raw });
        if (character.avatar !== avatar) throw new Error('Character cache avatar mismatch');
    } catch {
        // Retry once without a conditional cache request. Never loop on bad data.
        return fetchFull();
    }

    if (!cached || cached.sha256 !== envelope.sha256) {
        // Persistence is optional and must never delay publication to the UI.
        Promise.resolve().then(() => storage.setItem(key, { user, avatar, sha256: envelope.sha256, json_data: raw })).catch(() => {
            // Quota/private mode failures affect caching only, not the loaded card.
        });
    }
    return { response, character };
}
