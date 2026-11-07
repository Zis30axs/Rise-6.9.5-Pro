#!/usr/bin/env python3
"""Fail-closed validation for the downtown sprite and background release.

Requires Pillow for image decoding. Never treats a contact sheet, a filename,
or an old card's size as evidence that the new assets are embedded.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import struct
import zlib

LIMIT = 50_000_000
MAX_METADATA = 160 * 1024 * 1024
EXPRESSIONS = ('neutral', 'smile', 'troubled', 'surprised', 'annoyed', 'sad')
# Sakiko's uniform and indoor clothes are inline sets, not downtown-pack sprites.
SAKIKO_SPRITES = set()
MUTSUMI_POSES = ('neutral', 'neutral_aside', 'neutral_aside_2', 'smile', 'shy', 'surprised')
MUTSUMI_SPRITES = {f'mutsumi_uniform_{pose}' for pose in MUTSUMI_POSES}
ANON_POSES = ('shy', 'smile', 'confident', 'wave', 'surprised', 'cheerful')
ANON_SPRITES = {f'anon_uniform_{pose}' for pose in ANON_POSES}
RAANA_POSES = ('neutral', 'smile', 'crossed', 'wave', 'hips')
RAANA_SPRITES = {f'raana_uniform_{pose}' for pose in RAANA_POSES}
TAKI_POSES = ('neutral', 'crossed', 'drumsticks', 'embarrassed')
TAKI_SPRITES = {f'taki_uniform_{pose}' for pose in TAKI_POSES}
TOMORI_POSES = ('neutral', 'smile', 'surprised', 'sad', 'shy')
TOMORI_SPRITES = {f'tomori_uniform_{pose}' for pose in TOMORI_POSES}
NAGASAKI_MOTHER_POSES = ('neutral', 'smile', 'surprised', 'cheerful')
NAGASAKI_MOTHER_SPRITES = {f'nagasaki_mother_suit_{pose}' for pose in NAGASAKI_MOTHER_POSES}
SPRITES = SAKIKO_SPRITES | MUTSUMI_SPRITES | ANON_SPRITES | RAANA_SPRITES | TAKI_SPRITES | TOMORI_SPRITES | NAGASAKI_MOTHER_SPRITES
BACKGROUNDS = {'toyokawa_mansion_day', 'toyokawa_mansion_dusk', 'toyokawa_mansion_night',
               'toyokawa_living_room', 'downtown_day', 'downtown_night'}
EXPECTED_ASSETS = SPRITES | BACKGROUNDS
IMAGE_URL = re.compile(r'data:image/(?:webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})')


def fail(message: str) -> None:
    raise ValueError(message)


def validate_assets(root: Path, manifest_path: Path) -> dict:
    from PIL import Image
    root = root.resolve()
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if not isinstance(manifest, dict) or manifest.get('schemaVersion') != 1:
        fail('Unsupported art manifest schema')
    if manifest.get('reviewStatus') != 'approved':
        fail('Artwork is not reviewed: concept sheets are not runtime sprites')
    entries = manifest.get('assets')
    if not isinstance(entries, list) or len(entries) != len(EXPECTED_ASSETS):
        fail(f'Exactly {len(SPRITES)} sprites and {len(BACKGROUNDS)} backgrounds are required')
    if any(not isinstance(entry, dict) for entry in entries):
        fail('Invalid asset entry')
    ids = [entry.get('id') for entry in entries]
    if any(not isinstance(key, str) for key in ids) or len(set(ids)) != len(EXPECTED_ASSETS) or set(ids) != EXPECTED_ASSETS:
        fail('Missing, extra or duplicated outfit/expression/background IDs')
    files, hashes, dimensions, sprite_sizes, anchors = set(), set(), [], set(), set()
    for entry in entries:
        key = entry['id']
        name = entry.get('path')
        if not isinstance(name, str) or not name or Path(name).is_absolute():
            fail(f'{key}: invalid relative asset path')
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file() or path.suffix.lower() not in ('.png', '.webp'):
            fail(f'{key}: missing image or path outside asset root')
        if path in files:
            fail(f'{key}: one file was reused for multiple required images')
        files.add(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != entry.get('sha256'):
            fail(f'{key}: SHA-256 mismatch or missing hash')
        if digest in hashes:
            fail(f'{key}: duplicated image bytes, not a distinct required variant')
        hashes.add(digest)
        with Image.open(path) as image:
            image.load()
            if getattr(image, 'n_frames', 1) != 1 or image.format not in ('PNG', 'WEBP'):
                fail(f'{key}: expected a single-frame PNG/WebP')
            w, h = image.size
            if [w, h] != entry.get('size'):
                fail(f'{key}: declared and decoded dimensions differ')
            if key in SPRITES:
                if w < 384 or h < 768 or not 1.5 <= h / w <= 3.0:
                    fail(f'{key}: expected a portrait canvas of at least 384x768')
                alpha = image.convert('RGBA').getchannel('A')
                low, high = alpha.getextrema()
                if low != 0 or high == 0:
                    fail(f'{key}: sprite must have a transparent background and visible foreground')
                anchor = entry.get('anchor')
                if not isinstance(anchor, list) or len(anchor) != 2 or any(type(v) is not int for v in anchor):
                    fail(f'{key}: an integer [x, y] alignment anchor is required')
                if not 0 <= anchor[0] < w or not 0 <= anchor[1] < h:
                    fail(f'{key}: anchor outside canvas')
                sprite_sizes.add((w, h)); anchors.add(tuple(anchor))
            elif w < 960 or h < 540 or not 1.6 <= w / h <= 1.9:
                fail(f'{key}: expected a landscape background of at least 960x540')
            dimensions.append({'id': key, 'path': name, 'size': [w, h], 'sha256': digest,
                               'bytes': path.stat().st_size})
    if len(sprite_sizes) != 1 or len(anchors) != 1:
        fail('All sprites must share canvas dimensions and alignment anchor')
    return {'status': 'assets-verified', 'assetCount': len(entries), 'assets': dimensions,
            'assetBytes': sum(item['bytes'] for item in dimensions),
            'visualReview': 'manifest approval required; not inferred from filenames or tests'}


def extract_v2(data: bytes) -> dict:
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        fail('Not a PNG')
    offset, metadata, ended = 8, [], False
    while offset < len(data):
        if offset + 12 > len(data):
            fail('Truncated PNG chunk')
        length = struct.unpack('>I', data[offset:offset+4])[0]
        end = offset + 12 + length
        if end > len(data):
            fail('Truncated PNG payload')
        kind = data[offset+4:offset+8]; payload = data[offset+8:offset+8+length]
        crc = struct.unpack('>I', data[offset+8+length:end])[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            fail('PNG CRC mismatch')
        if kind in (b'tEXt', b'zTXt') and payload.startswith(b'chara\0'):
            value = payload[6:]
            if kind == b'zTXt':
                if not value or value[0] != 0:
                    fail('Unsupported PNG text compression')
                decoder = zlib.decompressobj()
                value = decoder.decompress(value[1:], MAX_METADATA + 1)
                if len(value) > MAX_METADATA or not decoder.eof or decoder.unused_data:
                    fail('Invalid or oversized compressed card metadata')
            if len(value) > MAX_METADATA:
                fail('Oversized card metadata')
            metadata.append(value)
        offset = end
        if kind == b'IEND':
            if length != 0 or offset != len(data):
                fail('Invalid PNG end')
            ended = True
            break
    if not ended or len(metadata) != 1:
        fail('Expected one V2 chara entry and a complete PNG')
    card = json.loads(base64.b64decode(metadata[0], validate=True))
    if not isinstance(card, dict) or card.get('spec') != 'chara_card_v2':
        fail('Expected a Character Card V2 payload')
    return card


def check_budget(size: int) -> None:
    if type(size) is not int or size <= 0 or size >= LIMIT:
        fail(f'Final Tauri PNG must be strictly smaller than {LIMIT} bytes; got {size}')


def verify_embedded_card(card_path: Path, asset_report: dict) -> dict:
    from PIL import Image
    check_budget(card_path.stat().st_size)
    with Image.open(card_path) as cover:
        if cover.format != 'PNG':
            fail('Card cover is not PNG')
        cover.verify()
    data = card_path.read_bytes()
    card = extract_v2(data)
    scripts = card.get('data', {}).get('extensions', {}).get('tavern_helper', {}).get('scripts', [])
    if not isinstance(scripts, list):
        fail('Missing Tavern Helper scripts')
    embedded = set()
    for script in scripts:
        if not isinstance(script, dict) or not isinstance(script.get('content'), str):
            continue
        for match in IMAGE_URL.finditer(script['content']):
            image = base64.b64decode(match.group(1), validate=True)
            embedded.add(hashlib.sha256(image).hexdigest())
    missing = [item['id'] for item in asset_report['assets'] if item['sha256'] not in embedded]
    if missing:
        fail('PNG lacks the actual new image bytes: ' + ', '.join(missing))
    return {'status': 'embedded-card-verified', 'bytes': len(data), 'limitBytes': LIMIT,
            'sha256': hashlib.sha256(data).hexdigest(), 'embeddedAssetCount': len(asset_report['assets']),
            'visualViewportTests': 'not performed by this validator', 'physicalDeviceTest': 'not performed'}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--card', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    try:
        report = validate_assets(args.root, args.manifest)
        if args.card:
            report['card'] = verify_embedded_card(args.card, report)
        text = json.dumps(report, ensure_ascii=False, indent=2)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(text + '\n', encoding='utf-8')
        print(text)
        return 0
    except (ValueError, OSError, KeyError, TypeError, zlib.error) as error:
        print('ART RELEASE BLOCKED: ' + str(error))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
