// Read-only loading diagnostics. Never logs response bodies, session cookies or CSRF tokens.
import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const [baseArg = 'http://127.0.0.1:8000', output, mode = 'all', knownHash] = process.argv.slice(2);
if (mode === 'cache' && !/^[a-f0-9]{64}$/.test(knownHash || '')) throw new Error('Cache probe requires the verified current raw-card SHA-256');
const base = new URL(baseArg);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Expected HTTP(S) origin without credentials');
let cookie = '';
async function request(path, { body, collect = false, headers = {}, timeout = 60000 } = {}) {
  const url = new URL(path, base);
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Accept-Encoding': 'gzip', ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    }, res => {
      const ttfbMs = Math.round(performance.now() - started);
      const setCookies = res.headers['set-cookie'];
      if (setCookies) cookie = setCookies.map(value => value.split(';', 1)[0]).join('; ');
      let wireBytes = 0;
      let decodedBytes = 0;
      const chunks = [];
      res.on('data', chunk => wireBytes += chunk.length);
      const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
      res.on('error', reject);
      stream.on('error', reject);
      stream.on('data', chunk => { decodedBytes += chunk.length; if (collect) chunks.push(chunk); });
      stream.on('end', () => resolve({
        path, status: res.statusCode, wireBytes, decodedBytes, ttfbMs,
        totalMs: Math.round(performance.now() - started), encoding: res.headers['content-encoding'] || 'identity',
        ...(res.headers['x-sillytavern-character-transport'] ? { characterTransport: res.headers['x-sillytavern-character-transport'] } : {}),
        ...(collect ? { data: Buffer.concat(chunks).toString('utf8') } : {}),
      }));
    });
    const timer = setTimeout(() => req.destroy(new Error(`Request timed out: ${path}`)), timeout);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const report = { measuredAt: new Date().toISOString(), origin: base.origin, mode, requests: [] };
report.requests.push(await request('/'));
if (mode === 'static') {
  report.requests.push(await request('/script.js'));
} else {
  const csrf = await request('/csrf-token', { collect: true });
  if (csrf.status !== 200) throw new Error(`CSRF request failed: ${csrf.status}`);
  const headers = { 'X-CSRF-Token': JSON.parse(csrf.data).token };
  for (let run = 1; run <= (['once', 'character', 'compare', 'cache'].includes(mode) ? 1 : 2); run++) {
    const result = await request('/api/characters/all', { headers, body: {}, collect: true });
    if (result.status !== 200) throw new Error(`Character list failed: ${result.status}`);
    const cards = JSON.parse(result.data);
    delete result.data;
    result.run = run;
    result.characterCount = cards.length;
    result.shallowCount = cards.filter(card => card.shallow === true).length;
    report.requests.push(result);
    if (['character', 'compare'].includes(mode)) {
      const target = cards.find(card => card.avatar === '未读之城 · 前端联调.png');
      if (!target) throw new Error('Expected integration card was not found');
      if (mode === 'compare') report.requests.push(await request('/api/characters/get', {
        headers, body: { avatar_url: target.avatar }, timeout: 120000,
      }));
      report.requests.push(await request('/api/characters/get', {
        headers, body: { avatar_url: target.avatar, character_transport: 'json-data-v1' }, timeout: 120000,
      }));
    }
    if (mode === 'cache') {
      const target = cards.find(card => card.avatar === '未读之城 · 前端联调.png');
      if (!target) throw new Error('Expected integration card was not found');
      const identity = await request('/api/users/me', { headers, collect: true });
      const user = JSON.parse(identity.data).handle;
      if (identity.status !== 200 || typeof user !== 'string') throw new Error('Expected authenticated user');
      delete identity.data;
      report.requests.push(identity);
      for (let pass = 1; pass <= 2; pass++) {
        const result = await request('/api/characters/get', {
          headers, body: { avatar_url: target.avatar, character_transport: 'json-data-cache-v1',
            character_cache: { user, avatar: target.avatar, sha256: knownHash } }, collect: true,
        });
        const envelope = JSON.parse(result.data);
        delete result.data;
        result.pass = pass;
        result.rawContentOmitted = !Object.hasOwn(envelope.character || {}, 'json_data');
        result.hashMatches = envelope.sha256 === knownHash;
        if (!result.hashMatches || !result.rawContentOmitted) throw new Error('Expected a revalidated cache hit');
        report.requests.push(result);
      }
    }
  }
}
if (output) await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
