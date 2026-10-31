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
    PNG_LIMIT, TOKYO_SANDBOX_ARCHIVE, TOKYO_SANDBOX_BYTES, TOKYO_SANDBOX_SHA256,
)
from verify_downtown_art import extract_v2


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify() -> dict:
    lite = ROOT / 'dist/immersive-shell-lite.js'
    card = ROOT / 'dist/unread-city-lite-tauri.png'
    normal = ROOT / 'dist/unread-city-lite.png'
    archive = ROOT / 'dist/unread-city-lite-assets.zip'
    sandbox_archive = ROOT / 'dist' / TOKYO_SANDBOX_ARCHIVE
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
        if any(asset['sha256'] == TOKYO_SANDBOX_SHA256 for asset in assets):
            raise ValueError('东京 3D 沙盘 GLB 被写入了主 Lite 资源 ZIP')
        if report.get('tokyoSandboxSha256') != TOKYO_SANDBOX_SHA256 or not report.get('tokyoSandboxExternalized'):
            raise ValueError('东京沙盘 Lite 打包报告不完整')
        if report.get('tokyoSandboxSeparatePack') is not True or report.get('tokyoSandboxInCoreZip') is not False:
            raise ValueError('东京沙盘必须是独立素材包')
        if report.get('tokyoSandboxArchive') != TOKYO_SANDBOX_ARCHIVE:
            raise ValueError('东京沙盘素材包文件名不正确')
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
        {'id': 'lite-assets', 'archive': 'unread-city-lite-assets.zip', 'required': True},
        {'id': 'tokyo-sandbox', 'archive': TOKYO_SANDBOX_ARCHIVE, 'required': False,
         'sha256': TOKYO_SANDBOX_SHA256, 'bytes': TOKYO_SANDBOX_BYTES},
    ]
    if packs != expected_packs:
        raise ValueError('Lite 角色卡未登记独立东京沙盘素材包')
    with ZipFile(sandbox_archive) as sandbox_zip:
        sandbox_manifest_bytes = sandbox_zip.read('manifest.json')
        if sha(sandbox_manifest_bytes) != report['tokyoSandboxManifestSha256']:
            raise ValueError('东京沙盘 ZIP manifest 哈希不一致')
        sandbox_manifest = json.loads(sandbox_manifest_bytes)
        sandbox_assets = sandbox_manifest['assets']
        if sandbox_manifest.get('schema') != 'unread-city-tokyo-sandbox-v1' or sandbox_manifest.get('pack') != 'tokyo-sandbox':
            raise ValueError('东京沙盘 ZIP 清单格式不正确')
        if len(sandbox_assets) != 1 or sandbox_assets[0]['sha256'] != TOKYO_SANDBOX_SHA256 or sandbox_assets[0]['bytes'] != TOKYO_SANDBOX_BYTES:
            raise ValueError('独立东京沙盘 ZIP 缺少固定 GLB')
        if sandbox_assets[0]['mime'] not in ('model/gltf-binary', 'application/octet-stream'):
            raise ValueError('东京 GLB 的 ZIP MIME 不正确')
        if set(sandbox_zip.namelist()) != {'manifest.json', sandbox_assets[0]['path']}:
            raise ValueError('东京沙盘 ZIP 条目不匹配')
        info = sandbox_zip.getinfo(sandbox_assets[0]['path'])
        if info.compress_type != 0:
            raise ValueError('东京沙盘 ZIP 被压缩；导入器只接受 STORE')
        raw_model = sandbox_zip.read(sandbox_assets[0]['path'])
        if len(raw_model) != TOKYO_SANDBOX_BYTES or sha(raw_model) != TOKYO_SANDBOX_SHA256:
            raise ValueError('独立东京沙盘 ZIP 中的 GLB 校验失败')
    if sha(sandbox_archive.read_bytes()) != report['tokyoSandboxZipSha256']:
        raise ValueError('东京沙盘 ZIP 哈希与构建报告不一致')
    return {'status': 'passed-build-only-not-tested-on-iphone',
            'liteCardBytes': card.stat().st_size, 'liteCardSha256': sha(card.read_bytes()),
            'liteBundleBytes': lite.stat().st_size, 'zipBytes': archive.stat().st_size,
            'zipSha256': sha(archive.read_bytes()), 'externalAssets': report['assets'],
            'approvedNewArtExternalized': len(expected), 'offline': True,
            'physicalDeviceTested': False,
            'tokyoSandboxSha256': TOKYO_SANDBOX_SHA256,
            'tokyoSandboxBytes': TOKYO_SANDBOX_BYTES,
            'tokyoSandboxArchive': TOKYO_SANDBOX_ARCHIVE,
            'tokyoSandboxSeparatePack': True,
            'tokyoSandboxInCoreZip': False,
            'tokyoSandboxZipBytes': sandbox_archive.stat().st_size,
            'tokyoSandboxZipSha256': sha(sandbox_archive.read_bytes())}

if __name__ == '__main__':
    result = verify()
    (ROOT / 'dist/lite-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
