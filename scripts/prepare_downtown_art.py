"""Derive aligned production WebPs from the 18 preserved Sunburst PNGs.

Never approves artwork. Review remains a separate visual decision. Source PNGs
are unchanged; only low-alpha fringe noise is removed before sprite alignment.
"""
from __future__ import annotations
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
from verify_downtown_art import SPRITES, BACKGROUNDS

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE / 'assets/downtown-art'
MANIFEST = BASE / 'integration/downtown-art/manifest.json'
CANVAS = (768, 1344)
ANCHOR = (384, 1280)


def prepare(check=False):
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if {item['id'] for item in manifest['assets']} != SPRITES | BACKGROUNDS:
        raise ValueError('Unexpected production image matrix')
    pending, sources = [], []
    for item in manifest['assets']:
        key = item['id']
        source = ROOT / 'sources' / (key.replace('_', '-') + '.png')
        target = (ROOT / item['path']).resolve()
        if not target.is_relative_to(ROOT.resolve()) or target.suffix != '.webp':
            raise ValueError('Production path outside WebP asset root')
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
            if check and (not target.is_file() or target.read_bytes() != data):
                raise ValueError('Derived asset differs: ' + key)
            pending.append((target, data))
            sources.append({'id': key, 'path': source.relative_to(BASE).as_posix(),
                            'size': original_size, 'bytes': source.stat().st_size,
                            'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    if not check:
        for target, data in pending:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        report = {'model': 'gpt-image-2.5-sunburst', 'mode': 'authorized imagegen fallback CLI',
                  'spriteCanvas': list(CANVAS), 'anchor': list(ANCHOR),
                  'spriteEncoding': 'lossless WebP after documented alpha cleanup and alignment',
                  'backgroundEncoding': '1536x864 WebP quality 90', 'sources': sources}
        (BASE / 'integration/downtown-art/sources.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'derivedAssets': len(pending), 'assetBytes': sum(len(data) for _, data in pending),
                      'reviewStatus': manifest['reviewStatus'], 'checkOnly': check}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    prepare(parser.parse_args().check)
