#!/usr/bin/env python3
"""Fail-closed audit of Lite PNG plus its matching, data-only offline asset archive.

Release audit checks structure, counts and byte lengths. It does not verify SHA-256.
Content-addressed names remain the runtime installer's cache keys.
"""
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path
from zipfile import ZipFile
from build_card import ROOT, IMMERSIVE_SCRIPT_ID
from card_codec import extract_card
from build_lite_release import PNG_LIMIT, TOKYO_SANDBOX_BYTES
from verify_downtown_art import extract_v2


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
    approved = source_art['assets']
    if not isinstance(approved, list) or not approved:
        raise ValueError('市区立绘清单为空')
    art_root = ROOT / 'assets/downtown-art'
    art_files = []
    for item in approved:
        path = art_root / item['path']
        if not path.is_file():
            raise ValueError('市区立绘清单缺少文件：' + str(item.get('path')))
        art_files.append(path)
    approved_count = len(art_files)
    with ZipFile(archive) as zip_file:
        manifest = json.loads(zip_file.read('manifest.json'))
        assets = manifest['assets']
        # Each self-contained map crop must be externalized into this SAME ZIP.
        svg_assets = [asset for asset in assets if asset['mime'] == 'image/svg+xml']
        svg_payloads = [zip_file.read(asset['path']) for asset in svg_assets]
        for avatar in sorted((ROOT / 'assets/map-avatars').glob('*.svg')):
            if avatar.read_bytes() not in svg_payloads:
                raise ValueError('Lite ZIP 缺少地图 SVG 头像：' + avatar.name)
        tokyo = [asset for asset in assets if asset['bytes'] == TOKYO_SANDBOX_BYTES and asset['mime'] in (
            'model/gltf-binary', 'application/octet-stream')]
        if len(tokyo) != 1:
            raise ValueError('东京 3D 沙盘 GLB 未放入主 Lite 资源 ZIP')
        if not report.get('tokyoSandboxExternalized'):
            raise ValueError('东京沙盘 Lite 打包报告不完整')
        if report.get('tokyoSandboxSeparatePack') is not False or report.get('tokyoSandboxInCoreZip') is not True:
            raise ValueError('东京沙盘必须包含在主素材包内')
        zip_sizes = Counter(asset['bytes'] for asset in assets)
        missing_sizes = Counter(path.stat().st_size for path in art_files) - zip_sizes
        if missing_sizes:
            raise ValueError('市区立绘没有按清单数量进入素材包')
        if len(assets) != report['assets']:
            raise ValueError('ZIP asset count does not match report')
        if set(zip_file.namelist()) != {'manifest.json', *(x['path'] for x in assets)}:
            raise ValueError('ZIP entries mismatch')
        for x in assets:
            if zip_file.getinfo(x['path']).compress_type != 0:
                raise ValueError('ZIP entry unexpectedly compressed; importer accepts STORE only')
            raw = zip_file.read(x['path'])
            if len(raw) != x['bytes']:
                raise ValueError('ZIP asset length mismatch: ' + x['path'])
    packs = data['extensions']['unread_city']['immersive'].get('assetPacks')
    expected_packs = [
        {'id': 'lite-assets', 'archive': 'unread-city-lite-assets.zip', 'required': True,
         'tokyoSandboxIncluded': True},
    ]
    if packs != expected_packs:
        raise ValueError('Lite 角色卡素材包登记不正确')
    return {'status': 'passed-build-only-not-tested-on-iphone',
            'sha256Verification': 'not-required',
            'liteCardBytes': card.stat().st_size,
            'liteBundleBytes': lite.stat().st_size, 'zipBytes': archive.stat().st_size,
            'externalAssets': report['assets'],
            'approvedNewArtExternalized': approved_count, 'offline': True,
            'physicalDeviceTested': False,
            'tokyoSandboxBytes': TOKYO_SANDBOX_BYTES,
            'tokyoSandboxArchive': 'unread-city-lite-assets.zip',
            'tokyoSandboxSeparatePack': False,
            'tokyoSandboxInCoreZip': True}

if __name__ == '__main__':
    result = verify()
    (ROOT / 'dist/lite-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
