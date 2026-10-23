#!/usr/bin/env python3
"""Extract verified runtime art from the PR #16 handoff packs.

The original ZIP packs stay the source of truth. This script only materializes
exact Emma expression WebPs and compressed runtime scene derivatives. Missing
or unconfirmed source art is never fabricated or assigned to a character.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/majo-runtime'
EMMA_MANIFEST = ROOT / 'assets/majo-emma/manifest.json'
SCENE_MANIFEST = ROOT / 'assets/majo-cast/recovered-10-source-images-20261022.json'
SCENE_ROOT = ROOT / 'assets/majo-cast'
SCENE_DIRS = {'interior': 'interiors', 'district': 'districts'}
CUTOUTS = OUT / 'character-cutouts.json'
SCENE_ENCODING = {'format': 'WEBP', 'lossy': True, 'quality': 82, 'method': 6}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_member(archive: Path, member: str) -> bytes:
    if not archive.is_relative_to(ROOT):
        raise ValueError(f'Archive escaped the workspace: {archive}')
    with zipfile.ZipFile(archive) as source:
        info = source.getinfo(member)
        if info.compress_type != zipfile.ZIP_STORED:
            raise ValueError(f'Expected ZIP_STORED: {archive.name}:{member}')
        return source.read(member)


def verified(archive: Path, member: str, expected_sha: str, expected_bytes: int) -> bytes:
    data = read_member(archive, member)
    if len(data) != expected_bytes or sha256(data) != expected_sha:
        raise ValueError(f'Source differs from its manifest: {archive.name}:{member}')
    return data


def scene_derivative(data: bytes, label: str) -> tuple[bytes, dict]:
    if not features.check('webp'):
        raise RuntimeError('Pillow was built without WebP support')
    with Image.open(io.BytesIO(data)) as opened:
        if opened.format != 'JPEG':
            raise ValueError(f'Expected JPEG source: {label}')
        width, height = opened.size
        image = opened.convert('RGB')
    output = io.BytesIO()
    image.save(output, 'WEBP', quality=SCENE_ENCODING['quality'], method=SCENE_ENCODING['method'])
    encoded = output.getvalue()
    with Image.open(io.BytesIO(encoded)) as decoded:
        if decoded.format != 'WEBP' or decoded.size != (width, height):
            raise ValueError(f'Derivative changed dimensions: {label}')
    return encoded, {'width': width, 'height': height, 'encoding': SCENE_ENCODING}


def prepare(check_only: bool = False) -> dict:
    emma_source = json.loads(EMMA_MANIFEST.read_text(encoding='utf-8'))
    if emma_source.get('schema') != 'unread-city-majo-emma-art-v1' or emma_source.get('nineExpressionStandardComplete') is not True:
        raise ValueError('Emma art is not complete; refusing to register a partial expression set as final')
    scenes = json.loads(SCENE_MANIFEST.read_text(encoding='utf-8'))
    if scenes.get('schema') != 'unread-city-majo-cast-recovery-v1':
        raise ValueError('Unknown scene recovery manifest')

    rows: list[dict] = []
    outputs: list[tuple[Path, bytes]] = []

    # User-confirmed identities and transparent cutouts are produced by
    # scripts/prepare_majo_character_cutouts.py with the anime-seg model. This
    # ordinary build only verifies the committed derivatives.
    cutouts = json.loads(CUTOUTS.read_text(encoding='utf-8'))
    if cutouts.get('schema') != 'unread-city-majo-character-cutouts-v1':
        raise ValueError('Unknown character cutout schema')
    for asset in cutouts['assets']:
        path = OUT / asset['file']
        data = path.read_bytes()
        if len(data) != asset['bytes'] or sha256(data) != asset['sha256']:
            raise ValueError(f'Character cutout differs from its manifest: {asset["file"]}')
        with Image.open(io.BytesIO(data)) as decoded:
            if decoded.size != (asset['width'], asset['height']) or decoded.mode != 'RGBA':
                raise ValueError(f'Character cutout dimensions or alpha changed: {asset["file"]}')
        rows.append({
            'id': asset['id'], 'category': 'character-sheet', 'personId': asset['personId'],
            'tier': 'semi-main', 'targetExpressions': 3, 'emotion': asset['emotion'],
            'file': asset['file'], 'mime': asset['mime'], 'bytes': asset['bytes'],
            'sha256': asset['sha256'], 'width': asset['width'], 'height': asset['height'],
            'alpha': True, 'encoding': asset['encoding'], 'presentation': 'sprite',
            'panelIndex': asset['panelIndex'], 'sourceId': asset['sourceId'],
            'sourceSha256': asset['sourceSha256'], 'sourcePack': asset['sourcePack'],
            'sourceBytes': asset['sourceBytes'], 'userConfirmed': True,
        })
        outputs.append((path, data))

    for asset in emma_source['assets']:
        person = asset.get('personId')
        emotion = asset.get('emotion')
        if person != 'majo-emma' or emotion not in {'neutral', 'happy', 'sad', 'angry', 'surprised', 'shy', 'thinking', 'serious', 'relieved'}:
            raise ValueError(f'Unexpected Emma asset: {asset.get("id")}')
        archive = (ROOT / 'assets/majo-emma' / asset['pack']).resolve()
        data = verified(archive, asset['archivePath'], asset['sha256'], asset['bytes'])
        relative = Path('emma') / f'{emotion}.webp'
        rows.append({'id': asset['id'], 'personId': person, 'emotion': emotion, 'file': relative.as_posix(),
                     'mime': 'image/webp', 'bytes': len(data), 'sha256': sha256(data),
                     'width': asset['width'], 'height': asset['height'], 'alpha': asset['alpha'],
                     'encoding': 'lossless-webp-exact-copy', 'sourceSha256': asset['sha256'],
                     'sourcePack': asset['pack']})
        outputs.append((OUT / relative, data))

    for image in scenes['images']:
        category = image['category']
        if category == 'character-reference':
            # Identity is unconfirmed; keep it as reference instead of inventing an owner.
            continue
        directory = SCENE_DIRS.get(category)
        if not directory or not image['id'].startswith(directory + '/'):
            raise ValueError(f'Unexpected scene category: {image["id"]}')
        archive = (SCENE_ROOT / image['sourcePack']).resolve()
        data = verified(archive, image['archivePath'], image['sha256'], image['bytes'])
        encoded, dimensions = scene_derivative(data, image['id'])
        slug = image['id'].split('/', 1)[1]
        relative = Path(directory) / f'{slug}.webp'
        rows.append({'id': image['id'], 'category': category, 'file': relative.as_posix(),
                     'mime': 'image/webp', 'bytes': len(encoded), 'sha256': sha256(encoded),
                     'width': dimensions['width'], 'height': dimensions['height'], 'alpha': False,
                     'encoding': 'lossy-webp-quality-82', 'sourceSha256': image['sha256'],
                     'sourcePack': image['sourcePack'], 'sourceBytes': image['bytes'],
                     'assignmentStatus': image['assignmentStatus']})
        outputs.append((OUT / relative, encoded))

    manifest = {
        'schema': 'unread-city-majo-runtime-art-v1',
        'generatedBy': 'scripts/prepare_majo_visual_assets.py',
        'sources': {
            'emma': 'assets/majo-emma/manifest.json',
            'scenes': 'assets/majo-cast/recovered-10-source-images-20261022.json',
            'characterAssignments': 'assets/majo-runtime/character-sheet-assignments.json',
            'characterCutouts': 'assets/majo-runtime/character-cutouts.json',
            'yukiSource': 'assets/majo-cast/character-source-sheets-20261023-yuki.json',
        },
        'notes': [
            'Runtime derivatives only; original ZIP packs remain the authoritative handoff.',
            'Scene JPEG sources have no alpha channel and are not listed as completed character art.',
            'Six user-confirmed 2026-10-22 three-panel sheets use skytnt/anime-seg and 2x upscaled transparent WebPs.',
            'Third panel of the first six sheets is mapped to shy; Yuki\'s third panel to thinking; these labels are provisional.',
            'Yuki\'s 2026-10-23 white-backdrop native-resolution 512x1024 transparent PNGs use connected foreground matte, not anime-seg.',
        ],
        'assets': rows,
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode('utf-8')
    outputs.append((OUT / 'manifest.json', manifest_bytes))

    if check_only:
        for path, expected in outputs:
            if not path.is_file() or path.read_bytes() != expected:
                raise SystemExit(f'Runtime derivative is stale: {path.relative_to(ROOT)}')
    else:
        for path, data in outputs:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    return {'emmaExpressions': sum(1 for row in rows if row.get('personId') == 'majo-emma'),
            'characterCutouts': sum(1 for row in rows if row.get('category') == 'character-sheet'),
            'sceneDerivatives': sum(1 for row in rows if row.get('category') in SCENE_DIRS),
            'assetBytes': sum(row['bytes'] for row in rows),
            'manifestSha256': sha256(manifest_bytes)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify committed derivatives without writing')
    args = parser.parse_args()
    print(json.dumps(prepare(args.check), ensure_ascii=False))


if __name__ == '__main__':
    main()
