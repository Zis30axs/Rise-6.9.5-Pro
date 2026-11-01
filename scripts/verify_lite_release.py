#!/usr/bin/env python3
"""Fail-closed audit of Lite PNG plus its matching, data-only offline asset archive."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from build_card import ROOT, IMMERSIVE_SCRIPT_ID
from card_codec import extract_card
from build_lite_release import (
    PNG_LIMIT, TOKYO_SANDBOX_BYTES, TOKYO_SANDBOX_SHA256,
)
from verify_downtown_art import extract_v2


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify() -> dict:
    lite = ROOT / 'dist/immersive-shell-lite.js'
    card = ROOT / 'dist/unread-city-lite-tauri.png'
    normal = ROOT / 'dist/unread-city-lite.png'
    archive = ROOT / 'dist/unread-city-lite-assets.zip'
    report = json.loads((ROOT / 'dist/lite-assets-report.json').read_text('utf-8'))
    if card.stat().st_size >= PNG_LIMIT:
        raise ValueError(f'Lite PNG too large: {card.stat().st_size} >= {PNG_LIMIT}')
    parsed = extract_v2(card.read_bytes())
    if parsed != extract_card(normal.read_bytes()):
        raise ValueError('Compressed Lite differs from canonical Lite card')
    data = parsed['data']
    scripts = [x for x in data['extensions']['tavern_helper']['scripts'] if x.get('id') == IMMERSIVE_SCRIPT_ID]
    if len(scripts) != 1 or scripts[0]['content'] != lite.read_text('utf-8'):
        raise ValueError('Lite script differs from the built Lite IIFE')
    if data['extensions']['unread_city']['immersive']['bundle'] != 'lite-offline-zip-v1':
        raise ValueError('Lite card has incorrect metadata')
    if not any('丰川祥子' in x.get('name','') for x in data['character_book']['entries']):
        raise ValueError('Sakiko worldbook missing')
    source_art = json.loads((ROOT / 'integration/downtown-art/manifest.json').read_text('utf-8'))
    expected = {x['sha256'] for x in source_art['assets']}
    with ZipFile(archive) as zip_file:
        manifest_bytes = zip_file.read('manifest.json')
        if sha(manifest_bytes) != report['manifestSha256']:
            raise ValueError('Lite ZIP manifest hash mismatch')
        manifest = json.loads(manifest_bytes)
        assets = manifest['assets']
        keys = {x['sha256'] for x in assets}
        # Each self-contained map crop must be externalized into this SAME ZIP.
        svg_assets = {asset['sha256'] for asset in assets if asset['mime'] == 'image/svg+xml'}
        for avatar in sorted((ROOT / 'assets/map-avatars').glob('*.svg')):
            avatar_sha = sha(avatar.read_bytes())
            if avatar_sha not in svg_assets:
                raise ValueError('Lite ZIP 缺少地图 SVG 头像：' + avatar.name)
        tokyo = [asset for asset in assets if asset['sha256'] == TOKYO_SANDBOX_SHA256]
        if len(tokyo) != 1 or tokyo[0]['bytes'] != TOKYO_SANDBOX_BYTES:
            raise ValueError('东京 3D 沙盘 GLB 未放入主 Lite 资源 ZIP')
        if tokyo[0]['mime'] not in ('model/gltf-binary', 'application/octet-stream'):
            raise ValueError('东京 GLB 的 ZIP MIME 不正确')
        if report.get('tokyoSandboxSha256') != TOKYO_SANDBOX_SHA256 or not report.get('tokyoSandboxExternalized'):
            raise ValueError('东京沙盘 Lite 打包报告不完整')
        if report.get('tokyoSandboxSeparatePack') is not False or report.get('tokyoSandboxInCoreZip') is not True:
            raise ValueError('东京沙盘必须包含在主素材包内')
        if not expected.issubset(keys):
            raise ValueError('One or more approved downtown-art images were not externalized')
        if len(assets) != report['assets']:
            raise ValueError('ZIP asset count does not match report')
        if set(zip_file.namelist()) != {'manifest.json', *(x['path'] for x in assets)}:
            raise ValueError('ZIP entries mismatch')
        for x in assets:
            if zip_file.getinfo(x['path']).compress_type != 0:
                raise ValueError('ZIP entry unexpectedly compressed; importer accepts STORE only')
            raw = zip_file.read(x['path'])
            if len(raw) != x['bytes'] or sha(raw) != x['sha256']:
                raise ValueError('ZIP asset corrupt: ' + x['path'])
    packs = data['extensions']['unread_city']['immersive'].get('assetPacks')
    expected_packs = [
        {'id': 'lite-assets', 'archive': 'unread-city-lite-assets.zip', 'required': True,
         'tokyoSandboxIncluded': True},
    ]
    if packs != expected_packs:
        raise ValueError('Lite 角色卡素材包登记不正确')
    return {'status': 'passed-build-only-not-tested-on-iphone',
            'liteCardBytes': card.stat().st_size, 'liteCardSha256': sha(card.read_bytes()),
            'liteBundleBytes': lite.stat().st_size, 'zipBytes': archive.stat().st_size,
            'zipSha256': sha(archive.read_bytes()), 'externalAssets': report['assets'],
            'approvedNewArtExternalized': len(expected), 'offline': True,
            'physicalDeviceTested': False,
            'tokyoSandboxSha256': TOKYO_SANDBOX_SHA256,
            'tokyoSandboxBytes': TOKYO_SANDBOX_BYTES,
            'tokyoSandboxArchive': 'unread-city-lite-assets.zip',
            'tokyoSandboxSeparatePack': False,
            'tokyoSandboxInCoreZip': True}

if __name__ == '__main__':
    result = verify()
    (ROOT / 'dist/lite-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
