import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { CHARACTER_CACHE_FORMAT, CHARACTER_TRANSPORT_FORMAT, CHARACTER_TRANSPORT_HEADER } from '../public/scripts/character-transport.js';

/**
 * Transfer the exact original JSON once, plus changes made by the server.
 * A fresh parse deliberately detects nested mutations made during V1/V2 loading.
 * No schema-specific field allowlist can discard an unknown extension.
 * @param {object} character Processed character, including its raw json_data
 * @returns {object} Compact transfer record, or an unchanged fallback record
 */
export function packCharacter(character) {
    if (!character || typeof character.json_data !== 'string') {
        return { full: character };
    }

    try {
        const original = JSON.parse(character.json_data);
        if (!original || typeof original !== 'object' || Array.isArray(original)) {
            return { full: character };
        }

        const overrides = Object.create(null);
        const removed = [];
        for (const key of Object.keys(original)) {
            if (!Object.hasOwn(character, key) || character[key] === undefined) {
                removed.push(key);
            }
        }
        for (const [key, value] of Object.entries(character)) {
            if (key === 'json_data' || value === undefined) continue;
            if (!Object.hasOwn(original, key) || !isDeepStrictEqual(value, original[key])) {
                overrides[key] = value;
            }
        }
        return { json_data: character.json_data, overrides, removed };
    } catch {
        // Unexpected or excessively nested legacy data still uses the old shape.
        return { full: character };
    }
}

/**
 * Send compact records only to clients explicitly requesting this protocol.
 * @param {import('express').Request} request Request with optional transport marker
 * @param {import('express').Response} response Response
 * @param {object|object[]} characters Ordinary character API payload
 * @returns {import('express').Response} Sent response
 */
export function sendCharacterResponse(request, response, characters) {
    if (request.body?.character_transport !== CHARACTER_TRANSPORT_FORMAT) {
        return response.send(characters);
    }
    const packed = Array.isArray(characters) ? characters.map(packCharacter) : packCharacter(characters);
    response.setHeader(CHARACTER_TRANSPORT_HEADER, CHARACTER_TRANSPORT_FORMAT);
    return response.send(packed);
}

/**
 * Revalidate one cached raw card against the authenticated user and current bytes.
 * Only /get calls this function. Runtime fields are recalculated on every request.
 * @param {import('express').Request} request Request with optional cache validator
 * @param {import('express').Response} response Response
 * @param {object} character Current processed character
 * @returns {import('express').Response} Sent response
 */
export function sendCachedCharacterResponse(request, response, character) {
    if (request.body?.character_transport !== CHARACTER_CACHE_FORMAT) {
        return sendCharacterResponse(request, response, character);
    }
    const user = request.user?.profile?.handle;
    const packed = packCharacter(character);
    if (typeof user !== 'string' || !user || typeof packed.json_data !== 'string'
        || character.avatar !== request.body.avatar_url) {
        return response.send(character);
    }
    const sha256 = createHash('sha256').update(packed.json_data, 'utf8').digest('hex');
    const validator = request.body.character_cache;
    if (validator?.user === user && validator?.avatar === character.avatar && validator?.sha256 === sha256) {
        delete packed.json_data;
    }
    response.setHeader(CHARACTER_TRANSPORT_HEADER, CHARACTER_CACHE_FORMAT);
    return response.send({ user, avatar: character.avatar, sha256, character: packed });
}
