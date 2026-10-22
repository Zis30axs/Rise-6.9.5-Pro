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
SHEET_MANIFEST = ROOT / 'assets/majo-cast/character-source-sheets-20261022.json'
SHEET_PACK = ROOT / 'assets/majo-cast/packs/unread-city-majo-five-character-source-sheets-20261022.zip'
ASSIGNMENTS = OUT / 'character-sheet-assignments.json'
SCENE_DIRS = {'interior': 'interiors', 'district': 'districts'}
CHARACTER_ENCODING = {'format': 'WEBP', 'lossy': True, 'quality': 92, 'method': 6}
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


def character_panel_derivative(data: bytes, panel: int, label: str) -> tuple[bytes, dict]:
    if not features.check('webp'):
        raise RuntimeError('Pillow was built without WebP support')
    with Image.open(io.BytesIO(data)) as opened:
        if opened.format != 'JPEG':
            raise ValueError(f'Expected JPEG character sheet: {label}')
        width, height = opened.size
        if width % 3 or panel not in (0, 1, 2):
            raise ValueError(f'Character sheet is not a three-panel image: {label}')
        panel_width = width // 3
        image = opened.convert('RGB').crop((panel * panel_width, 0, (panel + 1) * panel_width, height))
    output = io.BytesIO()
    image.save(output, 'WEBP', quality=CHARACTER_ENCODING['quality'], method=CHARACTER_ENCODING['method'])
    encoded = output.getvalue()
    with Image.open(io.BytesIO(encoded)) as decoded:
        if decoded.format != 'WEBP' or decoded.size != (panel_width, height):
            raise ValueError(f'Character panel changed dimensions: {label}')
    return encoded, {'width': panel_width, 'height': height, 'encoding': CHARACTER_ENCODING, 'panel': panel}


def prepare(check_only: bool = False) -> dict:
    emma_source = json.loads(EMMA_MANIFEST.read_text(encoding='utf-8'))
    if emma_source.get('schema') != 'unread-city-majo-emma-art-v1' or emma_source.get('nineExpressionStandardComplete') is not True:
        raise ValueError('Emma art is not complete; refusing to register a partial expression set as final')
    scenes = json.loads(SCENE_MANIFEST.read_text(encoding='utf-8'))
    if scenes.get('schema') != 'unread-city-majo-cast-recovery-v1':
        raise ValueError('Unknown scene recovery manifest')

    rows: list[dict] = []
    outputs: list[tuple[Path, bytes]] = []

    # User-confirmed identities for six source sheets: each 1536x1024 sheet is
    # split into three panels (neutral / happy / shy) for the semi-main tier.
    assignments = json.loads(ASSIGNMENTS.read_text(encoding='utf-8'))
    if assignments.get('schema') != 'unread-city-majo-character-sheet-assignments-v1':
        raise ValueError('Unknown character sheet assignment schema')
    sheet_manifest = json.loads(SHEET_MANIFEST.read_text(encoding='utf-8'))
    recovered = json.loads(SCENE_MANIFEST.read_text(encoding='utf-8'))
    sources = {row['id']: {**row, 'pack': SHEET_PACK} for row in sheet_manifest['images']}
    sources.update({row['id']: {**row, 'pack': SCENE_ROOT / row['sourcePack']}
                    for row in recovered['images'] if row['category'] == 'character-reference'})
    expressions = assignments['panelExpressions']
    if expressions != ['neutral', 'happy', 'shy']:
        raise ValueError('Unexpected semi-main panel expression order')
    for assignment in assignments['assignments']:
        source = sources.get(assignment['sourceId'])
        if not source:
            raise ValueError(f'Missing character source: {assignment["sourceId"]}')
        archive = Path(source['pack'])
        data = verified(archive, source['archivePath'], source['sha256'], source['bytes'])
        for panel, emotion in enumerate(expressions):
            encoded, dimensions = character_panel_derivative(data, panel, assignment['personId'])
            relative = Path('characters') / assignment['personId'] / f'{emotion}.webp'
            rows.append({
                'id': f'characters/{assignment["personId"]}/{emotion}', 'category': 'character-sheet',
                'personId': assignment['personId'], 'tier': 'semi-main', 'targetExpressions': len(expressions),
                'emotion': emotion, 'file': relative.as_posix(), 'mime': 'image/webp',
                'bytes': len(encoded), 'sha256': sha256(encoded), 'width': dimensions['width'],
                'height': dimensions['height'], 'alpha': False, 'encoding': 'lossy-webp-quality-92',
                'presentation': 'reference-card', 'panelIndex': panel,
                'sourceId': assignment['sourceId'], 'sourceSha256': source['sha256'],
                'sourcePack': source['pack'].relative_to(ROOT).as_posix(), 'sourceBytes': source['bytes'],
                'userConfirmed': True,
            })
            outputs.append((OUT / relative, encoded))

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
            'characterSheets': 'assets/majo-cast/character-source-sheets-20261022.json',
            'characterAssignments': 'assets/majo-runtime/character-sheet-assignments.json',
        },
        'notes': [
            'Runtime derivatives only; original ZIP packs remain the authoritative handoff.',
            'Scene JPEG sources have no alpha channel and are not listed as completed character art.',
            'Six user-confirmed three-panel character sheets are registered as semi-main reference-card portraits.',
            'The third panel of each sheet is provisionally mapped to shy; this is not an official expression name.',
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
            'characterPanels': sum(1 for row in rows if row.get('category') == 'character-sheet'),
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
