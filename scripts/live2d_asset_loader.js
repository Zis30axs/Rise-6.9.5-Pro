/* Optional data-only pack. Reuses Lite's bounded ZIP, SHA and IndexedDB helpers.
   Content-addressed staging cannot overwrite a different valid resource. Only
   the final meta transaction activates a completely verified manifest. */
const __UC_LIVE2D_PACK__ = __UC_LIVE2D_DESCRIPTOR__;
function __ucLive2dCreateApi() {
  const descriptor = __UC_LIVE2D_PACK__;
  const dbName = 'unread-city-live2d-v1';
  let manifest = null, enabled = false, generation = 0, queue = Promise.resolve();
  const listeners = new Set();
  const emit = () => { generation++; for (const fn of listeners) { try { fn(); } catch (error) { console.error(error); } } };
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  const status = () => ({ installed: !!manifest, enabled: !!manifest && enabled, generation,
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
        manifest = candidate; enabled = true; emit();
      } finally { db.close(); }
    }); },
    hydrate() { return serial(async () => {
      const db = await __ucLiteDb(dbName);
      try {
        const ready = await __ucLiteRead(db, 'meta', 'ready');
        if (!ready || ready.sha !== descriptor.sha) return;
        const candidate = await readManifest(ready.bytes);
        // Bounded sequential verification; never creates model/texture URLs.
        for (const row of candidate.assets) await verify(await __ucLiteRead(db, 'assets', row.sha256), row);
        manifest = candidate; enabled = ready.enabled === true; emit();
      } catch (error) { manifest = null; enabled = false; emit(); console.warn('[UnreadCity Live2D]', error); }
      finally { db.close(); }
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
        manifest = null; enabled = false; emit();
      } finally { db.close(); }
    }); },
    async getAsset(sha) {
      const revision = generation;
      const row = manifest && enabled && manifest.assets.find(item => item.sha256 === sha);
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
function __ucLive2dButton(api) {
  let host = document;
  try { if (window.parent?.document?.body) host = window.parent.document; } catch {}
  const previous = host.getElementById('unread-city-live2d-import');
  previous?.__ucDispose?.(); previous?.remove();
  const box = host.createElement('div'); box.id = 'unread-city-live2d-import';
  box.style.cssText = 'position:fixed;right:12px;top:62px;z-index:2147483647;max-width:calc(100vw - 24px);display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;width:260px;font:13px sans-serif';
  const input = host.createElement('input'); input.type = 'file'; input.accept = '.zip,application/zip'; input.hidden = true;
  const install = host.createElement('button'), toggle = host.createElement('button'), remove = host.createElement('button'), notice = host.createElement('span');
  for (const button of [install,toggle,remove]) { button.type='button'; button.style.cssText='padding:8px;border:1px solid #888;border-radius:6px;background:#24252b;color:#fff;cursor:pointer'; }
  notice.setAttribute('role','status'); notice.style.cssText='background:#24252b;color:white;border-radius:4px';
  install.onclick = () => input.click();
  const refresh = () => { const state = api.status(); install.textContent = state.installed ? '📦 更换 Live2D 素材 ZIP' : '📦 安装 Live2D 素材 ZIP';
    install.title = 'MyGO + Ave Mujica'; toggle.hidden = remove.hidden = !state.installed;
    toggle.textContent = state.enabled ? '停用' : '启用'; remove.textContent = '移除'; };
  const perform = async fn => { for (const button of [install,toggle,remove]) button.disabled=true;
    notice.textContent='正在处理…';
    try { await fn(); notice.textContent='已完成'; } catch (error) { notice.textContent='未完成，请重试'; notice.title=error instanceof Error ? error.message : ''; console.warn('[UnreadCity Live2D]',error); }
    finally { input.value=''; for (const button of [install,toggle,remove]) button.disabled=false; refresh(); }
  };
  input.onchange = () => { if (input.files?.[0]) void perform(() => api.install(input.files[0], text => {notice.textContent=text;})); };
  toggle.onclick = () => void perform(() => api.setEnabled(!api.status().enabled));
  remove.onclick = () => void perform(() => api.remove());
  box.append(input,install,toggle,remove,notice); host.body.append(box);
  const unsubscribe = api.subscribe(refresh); refresh();
  // Parent-owned controls survive Shell/chat iframe disposal. A subsequent
  // bootstrap replaces controls and releases this subscription.
  box.__ucDispose = unsubscribe;
}
const __ucLive2dApi = __ucLive2dCreateApi();
globalThis.__UC_LIVE2D__ = __ucLive2dApi;
__ucLive2dButton(__ucLive2dApi);
// Optional hydration must never gate the existing Lite startup.
void __ucLive2dApi.hydrate().catch(error => console.warn('[UnreadCity Live2D]', error));
