"""Derive aligned production WebPs from preserved downtown-art PNGs.

Never approves artwork. Review remains a separate visual decision. Source PNGs
are unchanged; only low-alpha fringe noise is removed before sprite alignment.
Sakiko and the backgrounds stay on their approved bytes when this Pillow build
cannot reproduce them and the recorded source hash is unchanged. Mutsumi and
Anon's school-uniform poses are derived with the same sprite alignment.
"""
from __future__ import annotations
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
from verify_downtown_art import ANON_POSES, BACKGROUNDS, MUTSUMI_POSES, SPRITES

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE / 'assets/downtown-art'
MANIFEST = BASE / 'integration/downtown-art/manifest.json'
CANVAS = (768, 1344)
ANCHOR = (384, 1280)


def ensure_uniform_entries(manifest: dict) -> None:
    present = {item['id'] for item in manifest['assets']}
    missing = []
    for character, poses in (('mutsumi', MUTSUMI_POSES), ('anon', ANON_POSES)):
        for pose in poses:
            key = f'{character}_uniform_{pose}'
            if key in present:
                continue
            missing.append({
                'id': key,
                'path': f"characters/{character}/uniform/{pose.replace('_', '-')}.webp",
                'sha256': '',
                'size': list(CANVAS),
                'anchor': list(ANCHOR),
            })
    if not missing:
        return
    index = next(i for i, item in enumerate(manifest['assets']) if item['id'] in BACKGROUNDS)
    manifest['assets'][index:index] = missing


def prepare(check=False):
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    sources_path = BASE / 'integration/downtown-art/sources.json'
    previous_sources = {item['id']: item for item in json.loads(sources_path.read_text(encoding='utf-8'))['sources']}
    previous_assets = {item['id']: dict(item) for item in manifest['assets']}
    ensure_uniform_entries(manifest)
    if {item['id'] for item in manifest['assets']} != SPRITES | BACKGROUNDS:
        raise ValueError('Unexpected production image matrix')
    pending, sources, kept = [], [], []
    for item in manifest['assets']:
        key = item['id']
        source = ROOT / 'sources' / (key.replace('_', '-') + '.png')
        target = (ROOT / item['path']).resolve()
        if not target.is_relative_to(ROOT.resolve()) or target.suffix != '.webp':
            raise ValueError('Production path outside WebP asset root')
        source_bytes = source.read_bytes()
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        with Image.open(source) as image:
            image.load()
            original_size = list(image.size)
            if key in SPRITES:
                image = image.convert('RGBA')
                if image.getchannel('A').getextrema() != (0, 255):
                    raise ValueError('Expected actual source transparency: ' + key)
                # The gateway's PNGs have isolated near-transparent fringe noise.
                # A one-pixel median removes specks without eroding the silhouette.
                alpha = image.getchannel('A').filter(ImageFilter.MedianFilter(3))
                alpha = alpha.point(lambda value: 0 if value <= 24 else value)
                image.putalpha(alpha)
                bounds = alpha.getbbox()
                if not bounds:
                    raise ValueError('Empty sprite: ' + key)
                crop = image.crop(bounds)
                factor = min(660 / crop.width, 1216 / crop.height)
                crop = crop.resize((round(crop.width * factor), round(crop.height * factor)), Image.Resampling.LANCZOS)
                image = Image.new('RGBA', CANVAS)
                image.alpha_composite(crop, (ANCHOR[0] - crop.width // 2, ANCHOR[1] - crop.height))
                item['anchor'] = list(ANCHOR)
            else:
                image = ImageOps.fit(image.convert('RGB'), (1536, 864), method=Image.Resampling.LANCZOS)
            stream = BytesIO()
            if key in SPRITES:
                image.save(stream, format='WEBP', lossless=True, method=6)
            else:
                image.save(stream, format='WEBP', quality=90, method=6)
            data = stream.getvalue()
            item['size'] = list(image.size)
            item['sha256'] = hashlib.sha256(data).hexdigest()
        previous = previous_assets.get(key)
        recorded_source = previous_sources.get(key)
        if previous and recorded_source and recorded_source.get('sha256') == source_sha and target.is_file():
            approved = target.read_bytes()
            if hashlib.sha256(approved).hexdigest() == previous.get('sha256') and approved != data:
                data = approved
                item['sha256'] = previous['sha256']
                item['size'] = previous['size']
                if 'anchor' in previous:
                    item['anchor'] = previous['anchor']
                kept.append(key)
        if check and (not target.is_file() or target.read_bytes() != data):
            raise ValueError('Derived asset differs: ' + key)
        pending.append((target, data, key not in kept))
        record = {'id': key, 'path': source.relative_to(BASE).as_posix(),
                  'size': original_size, 'bytes': len(source_bytes), 'sha256': source_sha}
        if key.startswith('mutsumi_') or key.startswith('anon_'):
            record['origin'] = 'user-provided'
        sources.append(record)
    if not check:
        for target, data, write in pending:
            if not write:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        report = {'model': 'gpt-image-2.5-sunburst', 'mode': 'authorized imagegen fallback CLI',
                  'spriteCanvas': list(CANVAS), 'anchor': list(ANCHOR),
                  'spriteEncoding': 'lossless WebP after documented alpha cleanup and alignment',
                  'backgroundEncoding': '1536x864 WebP quality 90', 'sources': sources}
        sources_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'derivedAssets': len(pending), 'assetBytes': sum(len(data) for _, data, _ in pending),
                      'keptApprovedAssets': len(kept), 'reviewStatus': manifest['reviewStatus'], 'checkOnly': check}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    prepare(parser.parse_args().check)
