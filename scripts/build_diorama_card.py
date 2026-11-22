#!/usr/bin/env python3
"""Pack the full local role-card application in one importable Character Card V2 PNG."""
import argparse
import base64
import gzip
import hashlib
import io
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image
from build_card import ROOT, attach_frontend, assemble_card, read_frontend_bundle
from card_codec import encode_card

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


def portable_runtime(source):
    avatars = map_headshots()
    lookup, table = {}, []

    def replace(m):
        raw = base64.b64decode(m['data'], validate=True)
        mime = m['mime']
        digest = hashlib.sha256(raw).digest()
        key = (digest, mime)
        if key not in lookup:
            if digest in avatars:
                mime, raw = 'image/webp', avatars[digest]
            elif mime == 'image/webp':
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


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--frontend', type=Path, default=ROOT / 'dist/immersive-shell.js')
    p.add_argument('--image', type=Path, default=ROOT / 'assets/cover.png')
    p.add_argument('--output', type=Path, default=ROOT / 'dist/Tokyo-City-3D.png')
    args = p.parse_args()
    runtime = portable_runtime(read_frontend_bundle(args.frontend))
    card = assemble_card()
    attach_frontend(card['data'], runtime)
    payload = encode_card(args.image.read_bytes(), card)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    print(f'{args.output.name} · {len(payload):,} bytes · sha256 {hashlib.sha256(payload).hexdigest()}')


if __name__ == '__main__':
    main()
