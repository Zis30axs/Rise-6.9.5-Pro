#!/usr/bin/env python3
"""Split a production IIFE into a Lite IIFE plus verified data-only offline ZIPs.

The Tokyo sandbox GLB is written to its own STORE archive. It is not a member
of unread-city-lite-assets.zip.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
# Only complete JavaScript string literals are candidates. Small icons stay inline.
DATA_URL = re.compile(
    r'(?P<quote>[\x22\x27\x60])data:(?P<mime>[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+);base64,'
    r'(?P<encoded>[A-Za-z0-9+/]{40000,}={0,2})(?P=quote)'
)
MIN_REMOVED_BYTES = 20_000_000
PNG_LIMIT = 25_000_000
TOKYO_SANDBOX_SHA256 = '12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb'
TOKYO_SANDBOX_BYTES = 6_232_488
TOKYO_SANDBOX_ARCHIVE = 'unread-city-tokyo-sandbox.zip'
TOKYO_PACK_PATH = ROOT / 'integration/tokyo-sandbox/pack.json'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tokyo_pack() -> dict:
    pack = json.loads(TOKYO_PACK_PATH.read_text('utf-8'))
    if pack.get('sha256') != TOKYO_SANDBOX_SHA256 or pack.get('bytes') != TOKYO_SANDBOX_BYTES:
        raise ValueError('integration/tokyo-sandbox/pack.json 与固定 GLB 不一致')
    if pack.get('archive') != TOKYO_SANDBOX_ARCHIVE or pack.get('separateFrom') != 'unread-city-lite-assets.zip':
        raise ValueError('东京沙盘必须使用独立素材包，不能并入主 Lite ZIP')
    if pack.get('loader') != '__UC_TOKYO_SANDBOX_ASSET__' or pack.get('id') != 'tokyo-sandbox':
        raise ValueError('东京沙盘素材包加载器登记不正确')
    if pack.get('manifestSchema') != 'unread-city-tokyo-sandbox-v1':
        raise ValueError('东京沙盘素材包清单格式不正确')
    return pack


def store_zip(members: list[tuple[str, bytes]]) -> bytes:
    from io import BytesIO
    output = BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
        for path, data in members:
            member = zipfile.ZipInfo(path, date_time=(2026, 10, 20, 0, 0, 0))
            member.compress_type = zipfile.ZIP_STORED
            member.external_attr = 0o644 << 16
            archive.writestr(member, data)
    return output.getvalue()


def manifest_bytes(schema: str, source_sha: str, entries: list[dict], pack_id: str | None = None) -> bytes:
    manifest = {'schema': schema, 'sourceSha256': source_sha, 'assets': entries}
    if pack_id:
        manifest['pack'] = pack_id
    return (json.dumps(manifest, ensure_ascii=True, separators=(',', ':'), sort_keys=True) + '\n').encode('utf-8')


def externalize(source: str, bootstrap: str) -> tuple[str, bytes, bytes, dict]:
    pack = tokyo_pack()
    allowed_mime = tuple(pack['mime'])
    if 'UNREAD_CITY_IMMERSIVE_BUNDLE' not in source[:512]:
        raise ValueError('Not a known production IIFE')
    assets: dict[str, tuple[str, bytes]] = {}
    tokyo_assets: dict[str, tuple[str, bytes]] = {}
    occurrences = 0
    tokyo_occurrences = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal occurrences, tokyo_occurrences
        mime, encoded = match.group('mime'), match.group('encoded')
        if not (mime.startswith('image/') or mime.startswith('model/') or mime in
                ('application/octet-stream', 'application/json', 'audio/mpeg')):
            return match.group(0)
        binary = base64.b64decode(encoded, validate=True)
        if len(binary) < 30_000:
            return match.group(0)
        sha = digest(binary)
        target = tokyo_assets if sha == TOKYO_SANDBOX_SHA256 else assets
        if sha == TOKYO_SANDBOX_SHA256 and (len(binary) != TOKYO_SANDBOX_BYTES or mime not in allowed_mime):
            raise ValueError('东京沙盘 GLB 内嵌内容与固定源文件不一致')
        original = target.setdefault(sha, (mime, binary))
        if original != (mime, binary):
            raise ValueError('SHA collision / conflicting MIME: ' + sha)
        occurrences += 1
        if sha == TOKYO_SANDBOX_SHA256:
            tokyo_occurrences += 1
            return f'__UC_TOKYO_SANDBOX_ASSET__("{sha}","{mime}")'
        return f'__UC_LITE_ASSET__("{sha}","{mime}")'

    compact = DATA_URL.sub(replace, source)
    if len(tokyo_assets) != 1 or tokyo_occurrences < 1:
        raise ValueError('东京沙盘 GLB 缺失或未被拆成独立素材包：请先安装原始模型再构建前端')
    if TOKYO_SANDBOX_SHA256 in assets:
        raise ValueError('东京沙盘不得写入主 Lite ZIP')
    entries = [{'sha256': sha, 'mime': mime, 'bytes': len(raw), 'path': 'assets/' + sha}
               for sha, (mime, raw) in sorted(assets.items())]
    tokyo_entries = [{'sha256': sha, 'mime': mime, 'bytes': len(raw), 'path': 'assets/' + sha}
                     for sha, (mime, raw) in sorted(tokyo_assets.items())]
    total = sum(row['bytes'] for row in entries)
    if len(entries) < 18 or total < MIN_REMOVED_BYTES or len(compact) >= len(source) - 15_000_000:
        raise ValueError(f'Lite resource extraction too small: {len(entries)} resources, {total} bytes')
    source_sha = digest(source.encode('utf-8'))
    core_manifest = manifest_bytes('unread-city-lite-assets-v1', source_sha, entries)
    manifest_sha = digest(core_manifest)
    tokyo_manifest = manifest_bytes(pack['manifestSchema'], source_sha, tokyo_entries, pack['id'])
    tokyo_manifest_sha = digest(tokyo_manifest)
    placeholders = (
        '__UC_LITE_ASSET_LIST__', '__UC_LITE_PACK_DIGEST__',
        '__UC_TOKYO_SANDBOX_ASSET_LIST__', '__UC_TOKYO_SANDBOX_PACK_DIGEST__',
    )
    if any(bootstrap.count(token) != 1 for token in placeholders):
        raise ValueError('Asset loader template has changed')
    loader = bootstrap.replace('__UC_LITE_ASSET_LIST__', json.dumps(entries, separators=(',', ':')))
    loader = loader.replace('__UC_LITE_PACK_DIGEST__', json.dumps(manifest_sha))
    loader = loader.replace('__UC_TOKYO_SANDBOX_ASSET_LIST__', json.dumps(tokyo_entries, separators=(',', ':')))
    loader = loader.replace('__UC_TOKYO_SANDBOX_PACK_DIGEST__', json.dumps(tokyo_manifest_sha))
    script = ('/* UNREAD_CITY_IMMERSIVE_BUNDLE LITE; extracted assets are data-only. */\n'
              '(async function(){\n' + loader + '\nif (await __uc_lite_init__()) {\n' + compact + '\n}\n' +
              '\n})().catch(error => console.error("[UnreadCity Lite] launch failed",error));\n')
    prefix = base64.b64encode(tokyo_assets[TOKYO_SANDBOX_SHA256][1][:48]).decode('ascii')
    if prefix in script:
        raise ValueError('东京沙盘仍内嵌在 Lite 脚本中')
    if f'__UC_TOKYO_SANDBOX_ASSET__("{TOKYO_SANDBOX_SHA256}"' not in script:
        raise ValueError('Lite 脚本未登记东京沙盘加载器')
    if f'__UC_LITE_ASSET__("{TOKYO_SANDBOX_SHA256}"' in script:
        raise ValueError('东京沙盘被登记进主素材加载器')
    archive_bytes = store_zip([('manifest.json', core_manifest)] + [
        (row['path'], assets[row['sha256']][1]) for row in entries
    ])
    sandbox_bytes = store_zip([('manifest.json', tokyo_manifest)] + [
        (row['path'], tokyo_assets[row['sha256']][1]) for row in tokyo_entries
    ])
    report = {'status': 'offline-assets-extracted', 'fullScriptBytes': len(source.encode('utf-8')),
              'liteScriptBytes': len(script.encode('utf-8')), 'assets': len(entries),
              'extractedBytes': total, 'replacedLiteralOccurrences': occurrences,
              'manifestSha256': manifest_sha, 'zipBytes': len(archive_bytes),
              'zipSha256': digest(archive_bytes), 'reconstructionMode': 'IndexedDB Blob URLs; no remote fetch',
              'deviceTested': False, 'tokyoSandboxSha256': TOKYO_SANDBOX_SHA256,
              'tokyoSandboxBytes': TOKYO_SANDBOX_BYTES, 'tokyoSandboxExternalized': True,
              'tokyoSandboxSeparatePack': True, 'tokyoSandboxInCoreZip': False,
              'tokyoSandboxArchive': TOKYO_SANDBOX_ARCHIVE,
              'tokyoSandboxSchema': pack['manifestSchema'],
              'tokyoSandboxManifestSha256': tokyo_manifest_sha,
              'tokyoSandboxZipBytes': len(sandbox_bytes),
              'tokyoSandboxZipSha256': digest(sandbox_bytes)}
    return script, archive_bytes, sandbox_bytes, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--full', type=Path, default=ROOT / 'dist/immersive-shell.js')
    parser.add_argument('--loader', type=Path, default=ROOT / 'scripts/lite_asset_loader.js')
    parser.add_argument('--lite', type=Path, default=ROOT / 'dist/immersive-shell-lite.js')
    parser.add_argument('--zip', type=Path, default=ROOT / 'dist/unread-city-lite-assets.zip')
    parser.add_argument('--sandbox-zip', type=Path, default=ROOT / 'dist' / TOKYO_SANDBOX_ARCHIVE)
    parser.add_argument('--report', type=Path, default=ROOT / 'dist/lite-assets-report.json')
    args = parser.parse_args()
    script, archive, sandbox, report = externalize(args.full.read_text('utf-8'), args.loader.read_text('utf-8'))
    for path in (args.lite, args.zip, args.sandbox_zip, args.report):
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.resolve() == args.full.resolve():
            raise ValueError('Never overwrite the original production IIFE')
    args.lite.write_text(script, encoding='utf-8')
    args.zip.write_bytes(archive)
    args.sandbox_zip.write_bytes(sandbox)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
