"""Local source crops only; remove the printed circular rim, never white artwork."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import re
import base64
import io

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '素材/MyGO_AveMujica_头像壁纸合集'
OUT = ROOT / 'assets/network'
NAMES = {
    'bang-tomori': 'MyGO_高松灯', 'bang-anon': 'MyGO_千早爱音',
    'bang-taki': 'MyGO_椎名立希', 'bang-rana': 'MyGO_要乐奈', 'soyo': 'MyGO_长崎素世',
    'sakiko': 'AveMujica_丰川祥子', 'bang-mutsumi': 'AveMujica_若叶睦',
    'bang-uika': 'AveMujica_三角初华', 'bang-umiri': 'AveMujica_八幡海铃',
    'bang-nyamu': 'AveMujica_祐天寺若麦',
}

def main():
    manifest = {'schema': 'unread-city-network-art-v1', 'assets': {}}
    for person_id, name in NAMES.items():
        source = SOURCE / 'avatars' / (name + '_头像.png')
        original = Image.open(source).convert('RGBA')
        # Inset 3.5% from the scanned circle. A supersampled mask removes only
        # its printed rim; panda fur, petals and the default silhouette stay white.
        width, height = original.size
        inset = round(min(width, height) * .035)
        crop = original.crop((inset, inset, width-inset, height-inset)).resize((512, 512), Image.Resampling.LANCZOS)
        mask = Image.new('L', (2048, 2048), 0)
        ImageDraw.Draw(mask).ellipse((2, 2, 2045, 2045), fill=255)
        crop.putalpha(mask.resize((512, 512), Image.Resampling.LANCZOS))
        target = OUT / 'avatars' / (person_id + '.webp')
        target.parent.mkdir(parents=True, exist_ok=True)
        crop.save(target, lossless=True, exact=True, method=6)
        record(manifest, target, source, 'chat-icon', person_id, inset)
        source = SOURCE / 'lockscreens' / (name + '_壁纸.jpg')
        target = OUT / 'lockscreens' / (person_id + '.webp')
        target.parent.mkdir(parents=True, exist_ok=True)
        Image.open(source).convert('RGB').save(target, lossless=True, method=6)
        record(manifest, target, source, 'smartphone-lock-screen', person_id, 0)
    for source in sorted((ROOT / 'assets/map-avatars').glob('*.svg')):
        person_id = source.stem.replace('wata-', 'watanare-')
        if person_id in NAMES or 'bang-' + person_id in NAMES:
            continue
        svg = source.read_text(encoding='utf-8')
        image_tag = re.search(r'<image\s[^>]+>', svg).group(0)
        attrs = dict(re.findall(r'([\w-]+)="([^"]+)"', image_tag))
        raw = base64.b64decode(attrs['href'].split(',', 1)[1])
        image = Image.open(io.BytesIO(raw)).convert('RGBA')
        x, y, w, h = [float(attrs[k]) for k in ['x', 'y', 'width', 'height']]
        image = image.crop((-x / w * image.width, -y / h * image.height,
                            (256-x) / w * image.width, (256-y) / h * image.height)).resize((256, 256), Image.Resampling.LANCZOS)
        target = OUT / 'avatars' / (person_id + '.webp')
        image.save(target, lossless=True, exact=True, method=6)
        record(manifest, target, source, 'local-person-avatar', person_id, 0)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def record(manifest, target, source, purpose, person_id, inset):
    raw = target.read_bytes()
    manifest['assets'][target.relative_to(OUT).as_posix()] = {
        'personId': person_id, 'purpose': purpose,
        'source': source.relative_to(ROOT).as_posix(),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
        'size': list(Image.open(target).size), 'rimInsetPixels': inset,
    }

if __name__ == '__main__':
    main()
