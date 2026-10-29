#!/usr/bin/env python3
"""Fail-closed audit of Lite PNG plus its matching, data-only offline asset archive."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from build_card import ROOT, IMMERSIVE_SCRIPT_ID
from card_codec import extract_card
from build_lite_release import PNG_LIMIT
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
    return {'status': 'passed-build-only-not-tested-on-iphone',
            'liteCardBytes': card.stat().st_size, 'liteCardSha256': sha(card.read_bytes()),
            'liteBundleBytes': lite.stat().st_size, 'zipBytes': archive.stat().st_size,
            'zipSha256': sha(archive.read_bytes()), 'externalAssets': report['assets'],
            'approvedNewArtExternalized': len(expected), 'offline': True,
            'physicalDeviceTested': False}

if __name__ == '__main__':
    result = verify()
    (ROOT / 'dist/lite-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
