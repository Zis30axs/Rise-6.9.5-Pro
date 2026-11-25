#!/usr/bin/env python3
"""Pack the full local role-card application in one importable Character Card V2 PNG."""
import argparse
import base64
import gzip
import hashlib
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image
from build_card import ROOT, attach_frontend, assemble_card, read_frontend_bundle
from card_codec import encode_card
from build_lite_release import externalize

MEDIA = re.compile(
    r"""(?P<q>["'`])data:(?P<mime>[\w.+-]+/[\w.+-]+);base64,(?P<data>[A-Za-z0-9+/]{16000,}={0,2})(?P=q)"""
)


def webp(image, edge):
    image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, 'WEBP', quality=73, method=4)
    return out.getvalue()


def map_headshots():
    """Rasterize the actual SVG crop at twice the largest map pin size."""
    result = {}
    for path in sorted((ROOT / 'assets/map-avatars').glob('*.svg')):
        svg = path.read_bytes()
        element = ET.fromstring(svg).find('.//{*}image')
        x, y, w, h = (float(element.get(k)) for k in ('x', 'y', 'width', 'height'))
        original = base64.b64decode(element.get('href').split(',')[1])
        with Image.open(io.BytesIO(original)) as source:
            image = source.convert('RGBA')
            crop = image.transform((128, 128), Image.Transform.AFFINE, (
                2 * image.width / w, 0, -x * image.width / w,
                0, 2 * image.height / h, -y * image.height / h), Image.Resampling.BICUBIC)
            result[hashlib.sha256(svg).digest()] = webp(crop, 128)
    return result


def city_backdrop_hashes():
    backgrounds = ROOT / 'assets/backgrounds'
    return {hashlib.sha256(path.read_bytes()).digest()
            for city in ('beijing', 'london', 'moscow', 'paris')
            for path in backgrounds.glob(f'{city}-*-day.webp')}


def portable_runtime(source):
    avatars = map_headshots()
    city_art = city_backdrop_hashes()
    lookup, table = {}, []

    def replace(m):
        raw = base64.b64decode(m['data'], validate=True)
        mime = m['mime']
        digest = hashlib.sha256(raw).digest()
        key = (digest, mime)
        if key not in lookup:
            if digest in avatars:
                mime, raw = 'image/webp', avatars[digest]
            elif mime == 'image/webp' and digest not in city_art:
                with Image.open(io.BytesIO(raw)) as img:
                    if not getattr(img, 'is_animated', False) and len(raw) > 45000:
                        edge = 896 if img.width >= img.height else 640
                        reduced = webp(img, edge)
                        if len(reduced) < len(raw):
                            raw = reduced
            lookup[key] = len(table)
            table.append('data:' + mime + ';base64,' + base64.b64encode(raw).decode('ascii'))
        return '__cityCardMedia[' + str(lookup[key]) + ']'

    code = MEDIA.sub(replace, source)
    # The embedded phone carries its own authored wallpaper and portrait literals inside a JS template.
    # Keep them as data strings in the phone's scope, where outer table indexes are unavailable.
    phone_image = re.compile(r"(data:image/webp;base64,)([A-Za-z0-9+/]{40000,}={0,2})")
    def compact_phone(m):
        raw = base64.b64decode(m[2], validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if getattr(image, 'is_animated', False):
                return m[0]
            smaller = webp(image, 640)
        return m[1] + base64.b64encode(smaller).decode('ascii') if len(smaller) < len(raw) else m[0]
    code = phone_image.sub(compact_phone, code)
    if len(table) < 20 or 'Tokyo-continuous-city' not in code:
        raise ValueError('Expected the complete production build and registered city model')
    # The original IIFE, styles and every binary-model byte execute in the same Helper window.
    inner = '(function(){const __cityCardMedia=' + json.dumps(table, separators=(',', ':')) + ';\n' + code + '\n})();'
    original = inner.encode('utf-8')
    packed = gzip.compress(original, compresslevel=6, mtime=0)
    if gzip.decompress(packed) != original:
        raise ValueError('Compressed runtime failed its round trip')
    encoded = base64.b64encode(packed).decode('ascii')
    # This local script element runs in the existing Helper frame and sees its window APIs.
    # The data never crosses an origin and can be mounted by a file:// or local Tavern.
    wrapper = """/* UNREAD_CITY_IMMERSIVE_BUNDLE • Tokyo-continuous-city */
(async function () {
  const encoded = '__BUNDLE__';
  const bytes = new Uint8Array(encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
  for (let pos = 0; pos < encoded.length; pos += 32768) {
    const chunk = atob(encoded.slice(pos, pos + 32768));
    const start = pos / 4 * 3;
    for (let i = 0; i < chunk.length; i++) bytes[start + i] = chunk.charCodeAt(i);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const script = document.createElement('script');
  script.textContent = await new Response(stream).text();
  if (window.frameElement && !window.frameElement.isConnected) return;
  (document.head || document.documentElement).append(script);
  script.remove();
})().catch(error => console.error('[UnreadCity] 角色卡内嵌程序加载失败', error));"""
    return wrapper.replace('__BUNDLE__', encoded)


def tokyo_runtime(source, optional_pack):
    """Start the full Lite shell with Tokyo's local assets before importing the optional art archive."""
    template = (ROOT / 'scripts/lite_asset_loader.js').read_text()
    changes = {
        'if (closed || !installed) release();': 'if (closed) release();',
        'return installed;': 'return true;',
        'z-index:2147483646;background:#173b50': 'z-index:2147482900;background:#173b50',
        "label: '📦 安装 Lite 素材 ZIP'": "label: '安装扩展美术包'",
        '__UC_LITE_URLS__.get(sha) ||': '__UC_LITE_URLS__.get(sha) || __UC_TOKYO_EMBEDDED__[sha] ||',
    }
    for original, replacement in changes.items():
        if template.count(original) != 1:
            raise ValueError('Lite loader changed: ' + original)
        template = template.replace(original, replacement)
    lite, archive, _ = externalize(source, template)
    optional_pack.parent.mkdir(parents=True, exist_ok=True)
    optional_pack.write_bytes(archive)
    full_models = {hashlib.sha256(p.read_bytes()).hexdigest() for p in
                   (ROOT / 'assets/models').glob('*.glb')}
    live2d = {hashlib.sha256(p.read_bytes()).hexdigest() for p in
              (ROOT / 'assets/live2d-soyo').rglob('*') if p.is_file()}
    avatars = map_headshots()
    city_art = {digest.hex() for digest in city_backdrop_hashes()}
    builtins = {}
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        for item in json.loads(z.read('manifest.json'))['assets']:
            sha, mime = item['sha256'], item['mime']
            blob = z.read(item['path'])
            if bytes.fromhex(sha) in avatars:
                blob, mime = avatars[bytes.fromhex(sha)], 'image/webp'
            elif sha in full_models or sha in live2d or sha in city_art or mime == 'application/zip':
                pass
            elif mime.startswith('image/') and mime != 'image/svg+xml':
                with Image.open(io.BytesIO(blob)) as picture:
                    if not getattr(picture, 'is_animated', False):
                        thumb = webp(picture, 384)
                        if len(thumb) < len(blob):
                            blob, mime = thumb, 'image/webp'
            else:
                continue
            builtins[sha] = 'data:' + mime + ';base64,' + base64.b64encode(blob).decode('ascii')
    for name in ('unread-city-tokyo-sandbox.glb', 'toyokawa-executive-tower.glb'):
        if hashlib.sha256((ROOT / 'assets/models' / name).read_bytes()).hexdigest() not in builtins:
            raise ValueError('Missing embedded Tokyo landmark: ' + name)
    if 'Wakaba-house-and-balcony' not in lite:
        raise ValueError('Missing original Wakaba highland geometry')
    if lite.count('const __UC_LITE_URLS__') != 1:
        raise ValueError('Missing local asset resolver')
    lite = lite.replace('const __UC_LITE_URLS__', 'const __UC_TOKYO_EMBEDDED__=' +
                        json.dumps(builtins, separators=(',', ':')) + ';\nconst __UC_LITE_URLS__')
    return lite


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--frontend', type=Path, default=ROOT / 'dist/immersive-shell.js')
    p.add_argument('--all-media', action='store_true', help='Embed optional world models and larger artwork; increases Tavern import memory')
    p.add_argument('--pack', type=Path, default=ROOT / 'dist/unread-city-lite-assets.zip')
    p.add_argument('--image', type=Path, default=ROOT / 'assets/cover.png')
    p.add_argument('--output', type=Path, default=ROOT / 'dist/Tokyo-City-3D.png')
    args = p.parse_args()
    source = read_frontend_bundle(args.frontend)
    runtime = portable_runtime(source if args.all_media else tokyo_runtime(source, args.pack))
    card = assemble_card()
    attach_frontend(card['data'], runtime)
    payload = encode_card(args.image.read_bytes(), card)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    print(f'{args.output.name} · {len(payload):,} bytes · sha256 {hashlib.sha256(payload).hexdigest()}')


if __name__ == '__main__':
    main()
