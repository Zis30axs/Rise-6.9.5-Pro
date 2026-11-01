/* Lite asset loader. ZIP entries are verified data, never executable scripts.
   Core pack: unread-city-lite-assets.zip (includes Tokyo 3D sandbox model).
   Uses standard STORE manifest rules. */
const __UC_LITE_ENTRIES__ = __UC_LITE_ASSET_LIST__;
const __UC_LITE_PACK_SHA__ = __UC_LITE_PACK_DIGEST__;
const __UC_LITE_DB_NAME__ = 'unread-city-lite-assets-v1';
const __UC_LITE_URLS__ = new Map();
const __UC_LITE_FALLBACK_IMAGE__ = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const __UC_CORE_PACK__ = {
  db: __UC_LITE_DB_NAME__, sha: __UC_LITE_PACK_SHA__, entries: __UC_LITE_ENTRIES__, urls: __UC_LITE_URLS__,
  buttonId: 'unread-city-lite-import', label: '📦 安装 Lite 素材 ZIP',
  title: '只接受本卡匹配的本地 ZIP；无网络请求。', top: '12px', width: '190px', accept: '.zip,application/zip',
};
function __UC_LITE_ASSET__(sha, mime) {
  return __UC_LITE_URLS__.get(sha) || (mime.startsWith('image/') ? __UC_LITE_FALLBACK_IMAGE__ : 'data:application/octet-stream;base64,');
}
function __UC_TOKYO_SANDBOX_ASSET__(sha, mime) {
  return __UC_LITE_ASSET__(sha, mime);
}
function __ucLiteRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('IndexedDB request failed'));
  });
}
async function __ucLiteDb(name) {
  if (!('indexedDB' in globalThis)) throw Error('当前浏览器不支持 IndexedDB');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('无法打开素材库'));
    request.onblocked = () => reject(Error('素材库被另一页面占用'));
  });
}
async function __ucLitePut(db, store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || Error('保存素材失败'));
    tx.onabort = () => reject(tx.error || Error('素材保存已取消'));
    tx.objectStore(store).put(value, key);
  });
}
async function __ucLiteRead(db, store, key) {
  return __ucLiteRequest(db.transaction(store, 'readonly').objectStore(store).get(key));
}
function __ucLiteZipDirectory(file, view) {
  let end = -1;
  for (let i = view.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) {
      end = i; break;
    }
  }
  if (end === -1) throw Error('ZIP 中找不到有效结束记录');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw Error('不支持多卷 ZIP');
  const count = view.getUint16(end + 10, true);
  if (count !== view.getUint16(end + 8, true)) throw Error('ZIP 文件数量不一致');
  const size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (offset === 0xffffffff || size === 0xffffffff || count === 0xffff || offset + size > file.size) {
    throw Error('不支持 ZIP64 或无效的 ZIP 目录');
  }
  return {count, size, offset};
}
async function __ucLiteZipEntries(file, expectedAssets) {
  if (file.size < 22 || file.size > 250 * 1024 * 1024) throw Error('素材 ZIP 大小异常');
  const tail = new DataView(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
  const {count, size, offset} = __ucLiteZipDirectory(file, tail);
  if (count > 1024 || size > 2 * 1024 * 1024) throw Error('素材 ZIP 目录超出限制');
  const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decode = new TextDecoder('utf-8', {fatal: true});
  const entries = new Map();
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > size || view.getUint32(at, true) !== 0x02014b50) throw Error('ZIP 目录已损坏');
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true), unpacked = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const next = at + 46 + nameLength + extra + comment;
    if (next > size || flags & 1 || method !== 0 || packed !== unpacked || local === 0xffffffff) {
      throw Error('素材包只能使用未加密、无压缩的标准 ZIP');
    }
    const name = decode.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (!/^(manifest\.json|assets\/[0-9a-f]{64})$/.test(name) || entries.has(name)) throw Error('素材 ZIP 路径或文件重复');
    entries.set(name, {local, length: packed});
    at = next;
  }
  if (at !== size || entries.size !== expectedAssets + 1) throw Error('素材 ZIP 文件数不符合本卡版本');
  return entries;
}
async function __ucLiteZipRead(file, entry) {
  if (entry.local + 30 > file.size) throw Error('ZIP 数据偏移错误');
  const header = new DataView(await file.slice(entry.local, entry.local + 30).arrayBuffer());
  if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(8, true) !== 0) throw Error('ZIP 数据头错误');
  const start = entry.local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  if (start + entry.length > file.size) throw Error('ZIP 素材数据越界');
  return new Uint8Array(await file.slice(start, start + entry.length).arrayBuffer());
}
async function __ucLiteSha256(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map(v => v.toString(16).padStart(2, '0')).join('');
}
async function __ucPackImport(file, pack, report) {
  const entries = await __ucLiteZipEntries(file, pack.entries.length);
  const manifest = entries.get('manifest.json');
  if (!manifest || await __ucLiteSha256(await __ucLiteZipRead(file, manifest)) !== pack.sha) {
    throw Error('资源包与 Lite 角色卡版本不匹配');
  }
  const db = await __ucLiteDb(pack.db);
  try {
    await __ucLitePut(db, 'meta', 'ready', 'installing');
    for (let index = 0; index < pack.entries.length; index++) {
      const row = pack.entries[index];
      if (!/^[0-9a-f]{64}$/.test(row.sha256) || !/^[-a-zA-Z0-9.+]+\/[-a-zA-Z0-9.+]+$/.test(row.mime)) throw Error('无效的资源清单');
      const entry = entries.get(row.path);
      if (!entry || entry.length !== row.bytes) throw Error('素材缺失或长度不正确');
      const bytes = await __ucLiteZipRead(file, entry);
      if (await __ucLiteSha256(bytes) !== row.sha256) throw Error('素材校验失败：' + row.sha256.slice(0, 8));
      await __ucLitePut(db, 'assets', row.sha256, new Blob([bytes], {type: row.mime}));
      if (index % 8 === 0 || index === pack.entries.length - 1) report((index + 1) + '/' + pack.entries.length + ' 张素材已校验');
    }
    await __ucLitePut(db, 'meta', 'ready', pack.sha);
  } finally { db.close(); }
}
async function __ucPackHydrate(pack) {
  let db;
  try {
    db = await __ucLiteDb(pack.db);
    if (await __ucLiteRead(db, 'meta', 'ready') !== pack.sha) return false;
    const tx = db.transaction('assets', 'readonly');
    await Promise.all(pack.entries.map(row => new Promise((resolve, reject) => {
      const request = tx.objectStore('assets').get(row.sha256);
      request.onsuccess = () => {
        if (request.result instanceof Blob) pack.urls.set(row.sha256, URL.createObjectURL(request.result));
        resolve();
      };
      request.onerror = () => reject(request.error || Error('读取外置素材失败'));
    })));
    return pack.urls.size === pack.entries.length;
  } catch (error) {
    console.warn('[UnreadCity Lite] 无法读取素材，使用缺省外观：', error);
    return false;
  } finally { db?.close(); }
}
function __ucPackButton(pack, installed) {
  let host;
  try { host = window.parent?.document || document; void host.body; } catch { host = document; }
  if (!host.body) return;
  host.getElementById(pack.buttonId)?.remove();
  if (installed) return;
  const button = host.createElement('button');
  button.id = pack.buttonId;
  button.type = 'button';
  button.textContent = pack.label;
  button.title = pack.title;
  button.style.cssText = 'position:fixed;right:12px;top:' + pack.top + ';z-index:2147483646;background:#173b50;color:white;border:1px solid #abd3e3;border-radius:10px;padding:9px 11px;font:13px system-ui;max-width:' + pack.width + ';';
  const input = host.createElement('input');
  input.type = 'file'; input.accept = pack.accept; input.hidden = true;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (typeof fetch === 'function') {
        button.textContent = '正在自动导入...';
        const resp = await fetch('/unread-city-lite-assets.zip');
        if (resp.ok) {
          const blob = await resp.blob();
          await __ucPackImport(blob, pack, msg => { button.textContent = msg; });
          const ok = await __ucPackHydrate(pack);
          if (ok) {
            button.textContent = '已安装完成';
            button.remove();
            input.remove();
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[UnreadCity Lite] 自动导入失败，改用手动选择文件：', e);
    }
    button.disabled = false;
    button.textContent = pack.label;
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    button.disabled = true;
    try {
      button.textContent = '正在校验 ZIP...';
      await __ucPackImport(file, pack, message => { button.textContent = message; });
      button.textContent = '✅ 已安装，请刷新页面';
      button.title = '素材安装成功。刷新酒馆页面并重新进入角色，即可加载完整资源。';
    } catch (error) {
      console.error('[UnreadCity Lite] ZIP import failed', error);
      button.textContent = '❌ 素材包不匹配·重试';
      button.title = error instanceof Error ? error.message : '未知错误';
    } finally { input.value = ''; button.disabled = false; }
  });
  host.body.append(input, button);
  window.addEventListener('pagehide', () => { button.remove(); input.remove(); }, {once: true});
}
async function __uc_lite_init__() {
  let installed = await __ucPackHydrate(__UC_CORE_PACK__);
  if (!installed && typeof fetch === 'function') {
    try {
      const resp = await fetch('/unread-city-lite-assets.zip');
      if (resp.ok) {
        const blob = await resp.blob();
        await __ucPackImport(blob, __UC_CORE_PACK__, () => {});
        installed = await __ucPackHydrate(__UC_CORE_PACK__);
      }
    } catch (e) {
      console.warn('[UnreadCity Lite] 本地自动载入失败，保留手动按钮：', e);
    }
  }
  __ucPackButton(__UC_CORE_PACK__, installed);
  window.addEventListener('pagehide', () => {
    for (const url of __UC_LITE_URLS__.values()) URL.revokeObjectURL(url);
    __UC_LITE_URLS__.clear();
  }, {once: true});
  return installed;
}
