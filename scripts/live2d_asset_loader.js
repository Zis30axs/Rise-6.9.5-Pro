/* Optional data-only pack. Reuses Lite's bounded ZIP, SHA and IndexedDB helpers.
   Content-addressed staging cannot overwrite a different valid resource. Only
   the final meta transaction activates a completely verified manifest. */
const __UC_LIVE2D_PACK__ = __UC_LIVE2D_DESCRIPTOR__;
function __ucLive2dCreateApi() {
  const descriptor = __UC_LIVE2D_PACK__;
  const dbName = 'unread-city-live2d-v1';
  let manifest = null, enabled = false, hydrating = true, generation = 0, queue = Promise.resolve();
  let restoration;
  let assets = new Map();
  const listeners = new Set();
  const emit = () => { generation++; for (const fn of listeners) { try { fn(); } catch (error) { console.error(error); } } };
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  const status = () => ({ installed: !!manifest, enabled: !!manifest && enabled, hydrating, generation,
    pack: descriptor.sha, models: manifest && enabled ? manifest.models : [] });
  async function readManifest(bytes) {
    if (bytes.byteLength !== descriptor.manifestBytes || await __ucLiteSha256(bytes) !== descriptor.sha) throw Error('请选择与本卡匹配的 Live2D 素材包');
    const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    if (value.schema !== 'unread-city-live2d-v1' || value.assets.length !== descriptor.entries) throw Error('素材清单不完整');
    return value;
  }
  async function verify(blob, row) {
    if (!(blob instanceof Blob) || blob.size !== row.bytes || await __ucLiteSha256(await blob.arrayBuffer()) !== row.sha256) throw Error('Live2D 素材缺失或损坏');
    return blob;
  }
  function activate(candidate, active) {
    manifest = candidate;
    enabled = active;
    assets = new Map(candidate?.assets.map(row => [row.sha256, row]));
    hydrating = false;
    emit();
  }
  const api = {
    status,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    install(file, report = () => {}) { return serial(async () => {
      const entries = await __ucLiteZipEntries(file, descriptor.entries, {
        maxZipBytes: descriptor.maxZipBytes, maxEntries: descriptor.entries + 1,
        maxEntryBytes: Math.max(descriptor.manifestBytes, descriptor.maxEntryBytes), deflate: true,
      });
      const index = entries.get('manifest.json');
      if (!index || index.unpacked !== descriptor.manifestBytes) throw Error('Live2D 清单缺失');
      const bytes = await __ucLiteZipRead(file, index);
      const candidate = await readManifest(bytes);
      const db = await __ucLiteDb(dbName);
      try {
        let completed = 0;
        for (const row of candidate.assets) {
          const entry = entries.get(row.path);
          if (!entry || entry.unpacked !== row.bytes) throw Error('Live2D 素材不完整');
          const data = await __ucLiteZipRead(file, entry);
          if (await __ucLiteSha256(data) !== row.sha256) throw Error('Live2D 素材校验失败');
          await __ucLitePut(db, 'assets', row.sha256, new Blob([data], {type:row.mime}));
          report(`正在安装 ${++completed}/${candidate.assets.length}`);
        }
        await __ucLitePut(db, 'meta', 'ready', {sha:descriptor.sha, bytes, enabled:true});
        activate(candidate, true);
      } finally { db.close(); }
    }); },
    restore() { return restoration ??= serial(async () => {
      if (!hydrating) return;
      let db;
      let candidate = null;
      let active = false;
      try {
        db = await __ucLiteDb(dbName);
        const ready = await __ucLiteRead(db, 'meta', 'ready');
        if (ready?.sha === descriptor.sha) {
          // Install verified every entry before committing this manifest. Reads
          // still verify each Blob before handing it to the current portrait.
          candidate = await readManifest(ready.bytes);
          active = ready.enabled === true;
        }
      } catch (error) { console.warn('[UnreadCity Live2D]', error); }
      finally { db?.close(); activate(candidate, active); }
    }); },
    setEnabled(value) { return serial(async () => {
      if (!manifest) return;
      const db = await __ucLiteDb(dbName);
      try {
        const ready = await __ucLiteRead(db, 'meta', 'ready');
        if (!ready || ready.sha !== descriptor.sha) throw Error('请重新安装 Live2D 素材包');
        await __ucLitePut(db, 'meta', 'ready', {...ready, enabled: value === true});
        enabled = value === true; emit();
      } finally { db.close(); }
    }); },
    remove() { return serial(async () => {
      const db = await __ucLiteDb(dbName);
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['assets','meta'], 'readwrite');
          tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error('移除失败'));
          tx.objectStore('assets').clear(); tx.objectStore('meta').clear();
        });
        activate(null, false);
      } finally { db.close(); }
    }); },
    async getAsset(sha) {
      const revision = generation;
      const row = enabled && assets.get(sha);
      if (!row) throw Error('Live2D 素材未启用');
      const db = await __ucLiteDb(dbName);
      try {
        const blob = await verify(await __ucLiteRead(db, 'assets', sha), row);
        if (revision !== generation || !enabled) throw Error('Live2D 素材已切换');
        return blob;
      } finally { db.close(); }
    },
  };
  return api;
}
globalThis.__UC_LIVE2D__ = __ucLive2dCreateApi();
