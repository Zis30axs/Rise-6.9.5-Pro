#!/usr/bin/env python3
"""Split a production IIFE into a Lite IIFE plus a verified data-only offline ZIP.

The Tokyo 3D sandbox GLB is packaged directly inside unread-city-lite-assets.zip.
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
# Runtime IndexedDB cache id. Release audit does not compare TOKYO_SANDBOX_SHA256.
TOKYO_SANDBOX_SHA256 = '12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb'
TOKYO_SANDBOX_BYTES = 6_232_488
TOKYO_SANDBOX_ARCHIVE = 'unread-city-lite-assets.zip'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def externalize(source: str, bootstrap: str) -> tuple[str, bytes, dict]:
    if 'UNREAD_CITY_IMMERSIVE_BUNDLE' not in source[:512]:
        raise ValueError('Not a known production IIFE')
    assets: dict[str, tuple[str, bytes]] = {}
    occurrences = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal occurrences
        mime, encoded = match.group('mime'), match.group('encoded')
        if not (mime.startswith('image/') or mime.startswith('model/') or mime in
                ('application/octet-stream', 'application/json', 'audio/mpeg')):
            return match.group(0)
        binary = base64.b64decode(encoded, validate=True)
        if len(binary) < 30_000:
            return match.group(0)
        sha = digest(binary)
        original = assets.setdefault(sha, (mime, binary))
        if original != (mime, binary):
            raise ValueError('SHA collision / conflicting MIME: ' + sha)
        occurrences += 1
        return f'__UC_LITE_ASSET__("{sha}","{mime}")'

    compact = DATA_URL.sub(replace, source)
    # CiRCLE's sandbox loader only accepts the inline data URL, and that ZIP is
    # below the 30KB extraction threshold. Copy the same bytes into the offline
    # archive so the installable pack still contains the resource. The importer
    # requires every ZIP member to be listed, so this entry is part of the card.
    circle_zip_path = ROOT / 'assets/circle-livehouse/packs/unread-city-circle-sandbox.zip'
    circle_zip = circle_zip_path.read_bytes()
    # The path is still content-addressed so the installer can store it. The
    # pinned digest is not a release gate.
    circle_sha = digest(circle_zip)
    if circle_sha not in assets:
        assets[circle_sha] = ('application/zip', circle_zip)
    payloads = {binary for _, binary in assets.values()}
    marina_dir = ROOT / 'assets/downtown-art/characters/marina/casual'
    marina_missing = [pose for pose in ('neutral', 'smile', 'surprised', 'cheerful')
                      if (marina_dir / f'{pose}.webp').read_bytes() not in payloads]
    if marina_missing:
        raise ValueError('麻里奈立绘未被拆进 Lite ZIP：' + ','.join(marina_missing))
    uika_dir = ROOT / 'assets/downtown-art/characters/uika/casual'
    uika_missing = [pose for pose in ('neutral', 'reserved', 'confident', 'shy', 'happy')
                    if (uika_dir / f'{pose}.webp').read_bytes() not in payloads]
    if uika_missing:
        raise ValueError('初华便服立绘未被拆进 Lite ZIP：' + ','.join(uika_missing))
    umiri_dir = ROOT / 'assets/downtown-art/characters/umiri/casual'
    umiri_missing = [pose for pose in ('neutral', 'aside', 'smile', 'serious', 'happy')
                     if (umiri_dir / f'{pose}.webp').read_bytes() not in payloads]
    if umiri_missing:
        raise ValueError('海铃便服立绘未被拆进 Lite ZIP：' + ','.join(umiri_missing))
    nyamu_dir = ROOT / 'assets/downtown-art/characters/nyamu/casual'
    nyamu_missing = [pose for pose in ('neutral', 'smirk', 'wave', 'thinking', 'happy')
                     if (nyamu_dir / f'{pose}.webp').read_bytes() not in payloads]
    if nyamu_missing:
        raise ValueError('若麦便服立绘未被拆进 Lite ZIP：' + ','.join(nyamu_missing))
    sakiko_uniform_dir = ROOT / 'assets/downtown-art/characters/sakiko/uniform'
    sakiko_uniform_poses = ('neutral', 'wave', 'shy', 'annoyed', 'confident', 'surprised', 'thinking', 'cheerful', 'sad')
    sakiko_uniform_missing = [pose for pose in sakiko_uniform_poses
                              if (sakiko_uniform_dir / f'{pose}.webp').read_bytes() not in payloads]
    if sakiko_uniform_missing:
        raise ValueError('祥子制服立绘未被拆进 Lite ZIP：' + ','.join(sakiko_uniform_missing))
    sakiko_indoor_dir = ROOT / 'assets/downtown-art/characters/sakiko/indoor'
    sakiko_indoor_poses = ('neutral', 'wave', 'confident', 'thinking', 'shy')
    sakiko_indoor_missing = [pose for pose in sakiko_indoor_poses
                             if (sakiko_indoor_dir / f'{pose}.webp').read_bytes() not in payloads]
    if sakiko_indoor_missing:
        raise ValueError('祥子室内私服未被拆进 Lite ZIP：' + ','.join(sakiko_indoor_missing))
    entries = [{'sha256': sha, 'mime': mime, 'bytes': len(raw), 'path': 'assets/' + sha}
               for sha, (mime, raw) in sorted(assets.items())]
    # The Tokyo sandbox GLB must be packaged inside the main Lite ZIP.
    tokyo = [row for row in entries if row['bytes'] == TOKYO_SANDBOX_BYTES and row['mime'] in (
        'model/gltf-binary', 'application/octet-stream'
    )]
    if len(tokyo) != 1:
        raise ValueError('东京沙盘 GLB 缺失或未被拆分进 Lite ZIP：请先安装原始模型再构建前端')
    total = sum(row['bytes'] for row in entries)
    if len(entries) < 18 or total < MIN_REMOVED_BYTES or len(compact) >= len(source) - 15_000_000:
        raise ValueError(f'Lite resource extraction too small: {len(entries)} resources, {total} bytes')
    manifest = {'schema': 'unread-city-lite-assets-v1', 'sourceSha256': digest(source.encode('utf-8')),
                'assets': entries}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=True, separators=(',', ':'), sort_keys=True) + '\n').encode('utf-8')
    manifest_sha = digest(manifest_bytes)
    if bootstrap.count('__UC_LITE_ASSET_LIST__') != 1 or bootstrap.count('__UC_LITE_PACK_DIGEST__') != 1:
        raise ValueError('Asset loader template has changed')
    loader = bootstrap.replace('__UC_LITE_ASSET_LIST__', json.dumps(entries, separators=(',', ':')))
    loader = loader.replace('__UC_LITE_PACK_DIGEST__', json.dumps(manifest_sha))
    optional = (ROOT / 'scripts/live2d_asset_loader.js').read_text(encoding='utf-8')
    descriptor = json.loads((ROOT / 'assets/live2d-ensemble/pack.json').read_text(encoding='utf-8'))
    # The native installer must outlive a Tavern script iframe on chat switch.
    # Execute only our own trusted bootstrap in the parent document's realm;
    # pack files never supply code. Reuse the exact shared data helper source.
    shared = loader[loader.index('function __ucLiteRequest'):loader.index('async function __ucPackImport')]
    optional = optional.replace('__UC_LIVE2D_DESCRIPTOR__', json.dumps(descriptor, separators=(',', ':')))
    host_script = '(function(){\n' + shared + optional + '\n})();'
    loader += '\n' + '(function(){let host=window;try{if(window.parent.document.body)host=window.parent;}catch{}\n' \
        + 'if(host.__UC_LIVE2D__?.status().pack!==' + json.dumps(descriptor['sha']) + '){\n' \
        + 'const script=host.document.createElement("script");script.textContent=' + json.dumps(host_script) + ';\n' \
        + '(host.document.head||host.document.body).append(script);script.remove();}\n' \
        + 'globalThis.__UC_LIVE2D__=host.__UC_LIVE2D__;})();\n'
    script = ('/* UNREAD_CITY_IMMERSIVE_BUNDLE LITE; extracted assets are data-only. */\n'
              '(async function(){\n' + loader + '\nif (await __uc_lite_init__()) {\n' + compact + '\n}\n' +
              '\n})().catch(error => console.error("[UnreadCity Lite] launch failed",error));\n')
    from io import BytesIO
    output = BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
        for path, data in [('manifest.json', manifest_bytes)] + [
            (row['path'], assets[row['sha256']][1]) for row in entries
        ]:
            member = zipfile.ZipInfo(path, date_time=(2026, 10, 20, 0, 0, 0))
            member.compress_type = zipfile.ZIP_STORED
            member.external_attr = 0o644 << 16
            archive.writestr(member, data)
    archive_bytes = output.getvalue()
    report = {'status': 'offline-assets-extracted', 'fullScriptBytes': len(source.encode('utf-8')),
              'liteScriptBytes': len(script.encode('utf-8')), 'assets': len(entries),
              'extractedBytes': total, 'replacedLiteralOccurrences': occurrences,
              'manifestSha256': manifest_sha, 'zipBytes': len(archive_bytes),
              'zipSha256': digest(archive_bytes), 'reconstructionMode': 'IndexedDB Blob URLs; no remote fetch',
              'deviceTested': False, 'sha256Verification': 'not-required',
              'tokyoSandboxBytes': TOKYO_SANDBOX_BYTES, 'tokyoSandboxExternalized': True,
              'tokyoSandboxSeparatePack': False, 'tokyoSandboxInCoreZip': True,
              'tokyoSandboxArchive': 'unread-city-lite-assets.zip',
              'circleSandboxZipSha256': circle_sha, 'circleSandboxZipBytes': len(circle_zip),
              'circleSandboxInCoreZip': True, 'marinaPortraitsExternalized': 4,
              'uikaCasualPortraitsExternalized': 5, 'umiriCasualPortraitsExternalized': 5,
              'nyamuCasualPortraitsExternalized': 5, 'sakikoUniformPortraitsExternalized': 9, 'sakikoIndoorPortraitsExternalized': 5}
    return script, archive_bytes, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--full', type=Path, default=ROOT / 'dist/immersive-shell.js')
    parser.add_argument('--loader', type=Path, default=ROOT / 'scripts/lite_asset_loader.js')
    parser.add_argument('--lite', type=Path, default=ROOT / 'dist/immersive-shell-lite.js')
    parser.add_argument('--zip', type=Path, default=ROOT / 'dist/unread-city-lite-assets.zip')
    parser.add_argument('--sandbox-zip', type=Path, default=None, help='Deprecated separate pack path')
    parser.add_argument('--report', type=Path, default=ROOT / 'dist/lite-assets-report.json')
    args = parser.parse_args()
    script, archive, report = externalize(args.full.read_text('utf-8'), args.loader.read_text('utf-8'))
    for path in (args.lite, args.zip, args.report):
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.resolve() == args.full.resolve():
            raise ValueError('Never overwrite the original production IIFE')
    args.lite.write_text(script, encoding='utf-8')
    args.zip.write_bytes(archive)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Clean up obsolete separate sandbox zip if present in dist
    obsolete_sandbox = ROOT / 'dist/unread-city-tokyo-sandbox.zip'
    if obsolete_sandbox.exists():
        obsolete_sandbox.unlink()
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
