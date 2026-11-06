#!/usr/bin/env python3
"""Cut out 冰上梅露露's white-background standing art.

The veil, robe, tights and shoes are mostly white, so a global white key
would delete the costume. Only near-white pixels that connect to the image
border become transparent. White cloth enclosed by the silhouette stays
fully opaque. The outer one to two pixels are feathered and dematted
against white; nothing inside that ring is semi-transparent.

Sources live in assets/majo-cast/sources/20261031/. This script does not
download a segmentation model. Run prepare_majo_visual_assets.py afterwards
so the runtime manifest picks up the new WebPs.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/majo-runtime'
SOURCE_DIR = ROOT / 'assets/majo-cast/sources/20261031'
CUTOUTS = OUT / 'character-cutouts.json'
SHEET = ROOT / 'assets/majo-cast/character-source-sheets-20261031-meruru.json'
PREVIEW = Path('/opt/cursor/artifacts/meruru-cutouts-preview.png')

# Near-white paper. Clothing folds sit well below this; the border is ~255.
PAPER_MIN = 250
PAPER_CHROMA = 8
# Pixels at least this far inside the silhouette stay fully opaque.
OPAQUE_DISTANCE = 2.0
# Outer fringe: how quickly a near-white edge pixel becomes transparent.
FEATHER_SPAN = 28.0

SOURCES = (
    {
        'key': 'shy',
        'file': 'meruru-shy.jpg',
        'emotion': 'shy',
        'pose': 'troubled',
        'panelIndex': 1,
        'note': '脸红、含泪、嘴微张，对应害羞与困扰',
    },
    {
        'key': 'surprised',
        'file': 'meruru-surprised.jpg',
        'emotion': 'surprised',
        'pose': 'surprised',
        'panelIndex': 2,
        'note': '睁大眼、张嘴，对应惊讶',
    },
    {
        'key': 'troubled',
        'file': 'meruru-troubled.jpg',
        'emotion': 'angry',
        'pose': 'annoyed',
        'panelIndex': 3,
        'note': '皱眉、嘴微张，对应生气与不悦',
    },
    {
        'key': 'smile',
        'file': 'meruru-smile.jpg',
        'emotion': 'happy',
        'pose': 'smile',
        'panelIndex': 4,
        'note': '闭眼微笑。没有单独的平静脸，平静与开心都用这一张',
    },
    {
        'key': 'sad',
        'file': 'meruru-sad.jpg',
        'emotion': 'sad',
        'pose': 'sad',
        'panelIndex': 5,
        'note': '落泪，对应难过',
    },
)

# Runtime files. neutral reuses the smile drawing.
OUTPUTS = (
    ('neutral', 'smile', 'neutral'),
    ('happy', 'smile', 'smile'),
    ('shy', 'shy', 'troubled'),
    ('surprised', 'surprised', 'surprised'),
    ('angry', 'troubled', 'annoyed'),
    ('sad', 'sad', 'sad'),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def border_background(paper: np.ndarray) -> np.ndarray:
    labels, _count = ndimage.label(paper, structure=np.ones((3, 3), dtype=np.uint8))
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge != 0]
    return np.isin(labels, edge)


def largest_component(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    if count == 0:
        raise SystemExit('Cutout foreground is empty')
    sizes = ndimage.sum(mask, labels, index=np.arange(1, count + 1))
    keep = int(np.argmax(sizes)) + 1
    return labels == keep


def matte(rgb: np.ndarray) -> np.ndarray:
    """Return RGBA. Interior alpha is 255. Only the outer ring is partial."""
    mn = rgb.min(axis=2)
    chroma = rgb.max(axis=2).astype(np.int16) - mn.astype(np.int16)
    paper = (mn >= PAPER_MIN) & (chroma <= PAPER_CHROMA)
    foreground = largest_component(~border_background(paper))
    distance = ndimage.distance_transform_edt(foreground)
    alpha = np.zeros(foreground.shape, np.float32)
    interior = distance >= OPAQUE_DISTANCE
    alpha[interior] = 1.0
    outer = foreground & ~interior
    coverage = np.clip((255.0 - mn.astype(np.float32)) / FEATHER_SPAN, 0.0, 1.0)
    # A nearly pure-white outer pixel is the leftover paper fringe, not cloth.
    coverage = np.where(coverage < 0.05, 0.0, coverage)
    alpha[outer] = coverage[outer]

    color = rgb.astype(np.float32)
    straight = color.copy()
    partial = (alpha > 0.0) & (alpha < 1.0)
    scale = alpha[partial][:, None]
    recovered = (color[partial] - (1.0 - scale) * 255.0) / np.maximum(scale, 1e-3)
    straight[partial] = np.clip(recovered, 0.0, 255.0)
    straight[alpha <= 0.0] = 0.0

    out = np.zeros((*rgb.shape[:2], 4), np.uint8)
    out[..., :3] = np.clip(np.rint(straight), 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(np.rint(alpha * 255.0), 0, 255).astype(np.uint8)
    # Quantizing must not reopen the interior.
    out[interior, 3] = 255
    out[~foreground, 3] = 0
    if not np.all(out[interior, 3] == 255):
        raise SystemExit('Interior alpha is not fully opaque')
    partial_inside = interior & (out[..., 3] < 255)
    if partial_inside.any():
        raise SystemExit('Semi-transparent cloth inside the silhouette')
    return out


def encode_webp(image: Image.Image) -> bytes:
    """Lossy RGB with a lossless-quality alpha plane. Fall back to lossless."""
    def attempt(lossless: bool) -> bytes:
        buffer = io.BytesIO()
        if lossless:
            image.save(buffer, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        else:
            image.save(buffer, 'WEBP', quality=90, method=6, alpha_quality=100, exact=True)
        return buffer.getvalue()

    encoded = attempt(False)
    decoded = Image.open(io.BytesIO(encoded)).convert('RGBA')
    if decoded.size != image.size:
        raise SystemExit('WebP changed the sprite size')
    source = np.asarray(image)
    back = np.asarray(decoded)
    interior = source[..., 3] == 255
    if not np.all(back[interior, 3] == 255):
        encoded = attempt(True)
        back = np.asarray(Image.open(io.BytesIO(encoded)).convert('RGBA'))
        if not np.all(back[interior, 3] == 255):
            raise SystemExit('WebP encoder made interior cloth semi-transparent')
    return encoded


def checker(width: int, height: int, cell: int = 24) -> np.ndarray:
    yy, xx = np.mgrid[0:height, 0:width]
    tile = ((yy // cell) + (xx // cell)) % 2
    light = np.array([214, 214, 214], np.uint8)
    dark = np.array([168, 168, 168], np.uint8)
    board = np.empty((height, width, 3), np.uint8)
    board[tile == 0] = light
    board[tile == 1] = dark
    return board


def composite(sprite: np.ndarray, background: np.ndarray) -> np.ndarray:
    color = sprite[..., :3].astype(np.float32)
    alpha = sprite[..., 3:4].astype(np.float32) / 255.0
    return np.clip(color * alpha + background.astype(np.float32) * (1.0 - alpha), 0, 255).astype(np.uint8)


def write_preview(sprites: list[tuple[str, np.ndarray]]) -> None:
    thumb_h = 900
    thumbs = []
    for _label, sprite in sprites:
        image = Image.fromarray(sprite, 'RGBA')
        thumb_w = max(1, round(image.width * thumb_h / image.height))
        thumbs.append(image.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS))
    gap = 16
    label_h = 36
    width = sum(image.width for image in thumbs) + gap * (len(thumbs) + 1)
    height = label_h + thumb_h * 2 + gap * 3
    sheet = Image.new('RGB', (width, height), (32, 32, 36))
    draw = ImageDraw.Draw(sheet)
    x = gap
    for (label, _sprite), thumb in zip(sprites, thumbs):
        rgba = np.asarray(thumb)
        board = checker(thumb.width, thumb.height)
        dark = np.full((thumb.height, thumb.width, 3), (18, 16, 28), np.uint8)
        sheet.paste(Image.fromarray(composite(rgba, board)), (x, label_h + gap))
        sheet.paste(Image.fromarray(composite(rgba, dark)), (x, label_h + gap * 2 + thumb_h))
        draw.text((x, 8), label, fill=(240, 240, 240))
        x += thumb.width + gap
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(PREVIEW)
    print(PREVIEW)


def main() -> None:
    mattes: dict[str, np.ndarray] = {}
    sources_meta = []
    for spec in SOURCES:
        path = SOURCE_DIR / spec['file']
        data = path.read_bytes()
        rgb = np.asarray(Image.open(io.BytesIO(data)).convert('RGB'))
        if rgb.ndim != 3 or rgb.shape[2] != 3:
            raise SystemExit(f'Expected RGB source: {spec["file"]}')
        mattes[spec['key']] = matte(rgb)
        sources_meta.append({
            'key': spec['key'],
            'file': f'assets/majo-cast/sources/20261031/{spec["file"]}',
            'bytes': len(data),
            'sha256': sha256(data),
            'width': int(rgb.shape[1]),
            'height': int(rgb.shape[0]),
            'emotion': spec['emotion'],
            'pose': spec['pose'],
            'note': spec['note'],
        })

    x0 = y0 = 10**9
    x1 = y1 = 0
    for image in mattes.values():
        ys, xs = np.where(image[..., 3] > 0)
        x0, y0 = min(x0, int(xs.min())), min(y0, int(ys.min()))
        x1, y1 = max(x1, int(xs.max())), max(y1, int(ys.max()))
    height, width = next(iter(mattes.values())).shape[:2]
    x0, y0 = max(0, x0 - 2), max(0, y0 - 2)
    x1, y1 = min(width - 1, x1 + 2), min(height - 1, y1 + 2)
    crop = (x0, y0, x1 + 1, y1 + 1)

    cropped: dict[str, np.ndarray] = {}
    for key, image in mattes.items():
        sprite = image[crop[1]:crop[3], crop[0]:crop[2]]
        interior = ndimage.distance_transform_edt(sprite[..., 3] > 0) >= OPAQUE_DISTANCE
        if not np.all(sprite[interior, 3] == 255):
            raise SystemExit(f'Cropped interior is not opaque: {key}')
        cropped[key] = sprite

    by_key = {spec['key']: spec for spec in SOURCES}
    png_meta: dict[str, dict] = {}
    for spec in SOURCES:
        sprite = Image.fromarray(cropped[spec['key']], 'RGBA')
        relative = Path('sources') / f'meruru-{spec["key"]}.png'
        target = OUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(target, 'PNG')
        raw = target.read_bytes()
        png_meta[spec['key']] = {
            'file': f'assets/majo-runtime/{relative.as_posix()}',
            'bytes': len(raw),
            'sha256': sha256(raw),
            'width': sprite.width,
            'height': sprite.height,
        }
        print(relative.as_posix(), sprite.size, len(raw))

    rows = []
    webp_sprites: dict[str, np.ndarray] = {}
    for emotion, key, pose in OUTPUTS:
        sprite = Image.fromarray(cropped[key], 'RGBA')
        encoded = encode_webp(sprite)
        relative = Path('characters') / 'majo-meruru' / f'{emotion}.webp'
        target = OUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(encoded)
        decoded = np.asarray(Image.open(io.BytesIO(encoded)).convert('RGBA'))
        interior = ndimage.distance_transform_edt(cropped[key][..., 3] == 255) >= OPAQUE_DISTANCE
        if decoded.shape[:2] != cropped[key].shape[:2] or not np.all(decoded[interior, 3] == 255):
            raise SystemExit(f'Encoded interior alpha drifted: {emotion}')
        source = by_key[key]
        source_path = SOURCE_DIR / source['file']
        source_bytes = source_path.read_bytes()
        rows.append({
            'id': f'characters/majo-meruru/{emotion}',
            'personId': 'majo-meruru',
            'emotion': emotion,
            'pose': pose,
            'file': relative.as_posix(),
            'mime': 'image/webp',
            'bytes': len(encoded),
            'sha256': sha256(encoded),
            'width': sprite.width,
            'height': sprite.height,
            'alpha': True,
            'encoding': 'white-border-flood-opaque-interior-webp',
            'sourceId': 'characters/source-sheets/20261031-meruru',
            'sourceSha256': sha256(source_bytes),
            'sourcePack': f'assets/majo-cast/sources/20261031/{source["file"]}',
            'sourceBytes': len(source_bytes),
            'sourcePng': png_meta[key]['file'],
            'sourcePngSha256': png_meta[key]['sha256'],
            'panelIndex': source['panelIndex'],
            'outfit': 'nun',
            'userConfirmed': True,
            'userProvided': True,
        })
        webp_sprites[emotion] = decoded
        print(relative.as_posix(), len(encoded))

    prior = json.loads(CUTOUTS.read_text(encoding='utf-8'))
    assets = [item for item in prior.get('assets', []) if item.get('personId') != 'majo-meruru']
    assets.extend(rows)
    prior['assets'] = assets
    notes = [note for note in prior.get('notes', []) if '冰上梅露露' not in note]
    notes.append(
        '2026-10-31 冰上梅露露五张白底立绘只清除与画面边缘相连的近白背景。'
        '头纱、白袍、白袜和白皮鞋留在轮廓内且完全不透明，只在最外一两像素做羽化。'
        '没有单独的平静脸：平静与开心用闭眼笑，害羞与困扰用脸红含泪，惊讶、生气、难过各用本人的对应脸。'
    )
    prior['notes'] = notes
    prior['meruruMethod'] = {
        'name': 'white-border-connected-flood',
        'description': (
            '近白（通道最小值不低于 250 且色差不超过 8）且与画面边缘连通的区域视为背景。'
            '轮廓内距离背景至少 2 像素的地方 alpha 为 255，避免白衣服被打穿。'
            '只在外侧不到 2 像素处按离开纯白的程度羽化，并按白底做前景去污。'
        ),
        'paperMin': PAPER_MIN,
        'paperChroma': PAPER_CHROMA,
        'opaqueDistancePx': OPAQUE_DISTANCE,
        'personId': 'majo-meruru',
        'poseFiles': {
            'neutral': 'neutral',
            'smile': 'happy',
            'troubled': 'shy',
            'surprised': 'surprised',
            'annoyed': 'angry',
            'sad': 'sad',
        },
        'gameExpressionPoses': {
            'neutral': 'neutral',
            'smile': 'smile',
            'troubled': 'troubled',
            'surprised': 'surprised',
            'annoyed': 'annoyed',
            'sad': 'sad',
        },
        'userProvided': True,
    }
    CUTOUTS.write_text(json.dumps(prior, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')

    sheet = {
        'schema': 'unread-city-majo-meruru-source-v1',
        'personId': 'majo-meruru',
        'displayName': '冰上梅露露',
        'confirmedBy': 'user-supplied-standing-art',
        'outfit': '白头纱十字饰与粉缎带修女裙',
        'method': prior['meruruMethod']['name'],
        'crop': {'x': x0, 'y': y0, 'width': x1 + 1 - x0, 'height': y1 + 1 - y0},
        'sources': sources_meta,
        'png': png_meta,
        'runtime': [
            {'emotion': emotion, 'sourceKey': key, 'pose': pose, 'file': f'assets/majo-runtime/characters/majo-meruru/{emotion}.webp'}
            for emotion, key, pose in OUTPUTS
        ],
    }
    SHEET.write_text(json.dumps(sheet, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')

    write_preview([
        ('1 shy / troubled', cropped['shy']),
        ('2 surprised', cropped['surprised']),
        ('3 troubled / annoyed', cropped['troubled']),
        ('4 smile / neutral', cropped['smile']),
        ('5 sad', cropped['sad']),
    ])
    print(json.dumps({'width': x1 + 1 - x0, 'height': y1 + 1 - y0, 'files': len(rows)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
