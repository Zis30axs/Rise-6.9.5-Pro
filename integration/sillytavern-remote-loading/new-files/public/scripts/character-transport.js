// Versioned opt-in transport; the in-memory character shape remains unchanged.
export const CHARACTER_TRANSPORT_FORMAT = 'json-data-v1';
export const CHARACTER_TRANSPORT_HEADER = 'X-SillyTavern-Character-Transport';
export const CHARACTER_CACHE_FORMAT = 'json-data-cache-v1';

/**
 * Restore the original character response without modifying object prototypes.
 * @param {object} packed Character transfer record
 * @returns {object} The ordinary, complete character object
 */
export function unpackCharacter(packed) {
    if (Object.hasOwn(packed, 'full')) {
        return packed.full;
    }

    const character = JSON.parse(packed.json_data);
    if (!character || typeof character !== 'object' || Array.isArray(character)
        || !packed.overrides || typeof packed.overrides !== 'object' || Array.isArray(packed.overrides)
        || !Array.isArray(packed.removed) || !packed.removed.every(key => typeof key === 'string')) {
        throw new TypeError('Invalid compact character response');
    }

    for (const key of packed.removed) {
        delete character[key];
    }
    for (const [key, value] of Object.entries(packed.overrides)) {
        // Card authors may use __proto__, constructor or other unknown own keys.
        // Defining a data property preserves those keys without invoking setters.
        Object.defineProperty(character, key, { value, writable: true, enumerable: true, configurable: true });
    }
    Object.defineProperty(character, 'json_data', {
        value: packed.json_data, writable: true, enumerable: true, configurable: true,
    });
    return character;
}

/**
 * Read either an opted-in compact response or an unchanged older server response.
 * The response header prevents collisions with arbitrary character-card fields.
 * @param {Response} response Character API response
 * @returns {Promise<object|object[]>} Complete characters (or lazy-load summaries)
 */
export async function readCharacterResponse(response) {
    const data = await response.json();
    if (response.headers.get(CHARACTER_TRANSPORT_HEADER) !== CHARACTER_TRANSPORT_FORMAT) {
        return data;
    }
    return Array.isArray(data) ? data.map(unpackCharacter) : unpackCharacter(data);
}
