#!/usr/bin/env python3
"""Cut out 长崎夫人's white-background standing art.

Only near-white pixels that connect to the image border become transparent.
The hand-on-hip pose (and the two cheek-touch poses) also close a white gap
between the arm and the torso; that pocket is near-white but sealed off from
the border by the sleeve, so components of at least 800 pixels are removed
as background holes. Eye highlights and teeth stay, because they are smaller
and fully inside the silhouette. Cloth, skin, hair and shoes inside the
silhouette are forced opaque. Only the outer 1–2 pixels are feathered and
dematted against white.

Inputs are the four user JPEGs in
assets/downtown-art/sources/nagasaki-mother-reference/. Outputs are the
transparent PNGs that prepare_downtown_art.py aligns onto the 768x1344 canvas.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'assets/downtown-art/sources/nagasaki-mother-reference'
OUT = ROOT / 'assets/downtown-art/sources'
PREVIEW = Path('/opt/cursor/artifacts/soyo-mother-cutouts-checker.png')

PAPER_MIN = 248
PAPER_CHROMA = 8
OPAQUE_DISTANCE = 2.0
FEATHER_SPAN = 28.0
# Arm-torso gaps on these sheets are 1.3k–18k px. Catchlights stay under 300.
HOLE_MIN = 800

POSES = (
    ('neutral', 'neutral.jpg', 'hand on hip, slight smile'),
    ('smile', 'smile.jpg', 'hand on cheek, closed smile'),
    ('surprised', 'surprised.jpg', 'hand near cheek, open mouth, blush'),
    ('cheerful', 'cheerful.jpg', 'raised fist, open smile'),
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


def background_mask(paper: np.ndarray) -> tuple[np.ndarray, list[int]]:
    """Border-connected paper, plus sealed near-white holes such as the arm gap."""
    border = border_background(paper)
    enclosed = paper & ~border
    labels, count = ndimage.label(enclosed, structure=np.ones((3, 3), dtype=np.uint8))
    holes = np.zeros(paper.shape, dtype=bool)
    removed: list[int] = []
    if count:
        sizes = ndimage.sum(enclosed, labels, index=np.arange(1, count + 1))
        for label, size in enumerate(sizes, start=1):
            if int(size) >= HOLE_MIN:
                holes |= labels == label
                removed.append(int(size))
    return border | holes, removed


def matte(rgb: np.ndarray) -> tuple[np.ndarray, list[int]]:
    mn = rgb.min(axis=2)
    chroma = rgb.max(axis=2).astype(np.int16) - mn.astype(np.int16)
    paper = (mn >= PAPER_MIN) & (chroma <= PAPER_CHROMA)
    background, removed = background_mask(paper)
    foreground = largest_component(~background)
    distance = ndimage.distance_transform_edt(foreground)
    alpha = np.zeros(foreground.shape, np.float32)
    interior = distance >= OPAQUE_DISTANCE
    alpha[interior] = 1.0
    outer = foreground & ~interior
    coverage = np.clip((255.0 - mn.astype(np.float32)) / FEATHER_SPAN, 0.0, 1.0)
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
    out[interior, 3] = 255
    out[~foreground, 3] = 0
    partial_inside = (distance >= OPAQUE_DISTANCE) & (out[..., 3] < 255)
    if partial_inside.any():
        raise SystemExit('Semi-transparent pixels inside the silhouette')
    if not np.any(out[..., 3] == 0) or not np.any(out[..., 3] == 255):
        raise SystemExit('Cutout is missing a transparent background or an opaque interior')
    return out, removed


def leg_gap_is_open(alpha: np.ndarray) -> bool:
    """The space between the calves must reach the background, not a white bridge."""
    height = alpha.shape[0]
    opened = 0
    for y in range(int(height * 0.62), int(height * 0.88)):
        opaque = alpha[y] == 255
        changes = np.diff(opaque.astype(np.int8))
        starts = np.where(changes == 1)[0]
        ends = np.where(changes == -1)[0]
        if starts.size < 2 or ends.size < 1:
            continue
        gap = alpha[y, ends[0] + 1:starts[1] + 1]
        if gap.size >= 2 and np.all(gap == 0):
            opened += 1
    return opened >= 8


def checker(width: int, height: int, cell: int = 24) -> np.ndarray:
    yy, xx = np.mgrid[0:height, 0:width]
    tile = ((yy // cell) + (xx // cell)) % 2
    board = np.empty((height, width, 3), np.uint8)
    board[tile == 0] = (214, 214, 214)
    board[tile == 1] = (168, 168, 168)
    return board


def composite(sprite: np.ndarray, background: np.ndarray) -> np.ndarray:
    color = sprite[..., :3].astype(np.float32)
    alpha = sprite[..., 3:4].astype(np.float32) / 255.0
    return np.clip(color * alpha + background.astype(np.float32) * (1.0 - alpha), 0, 255).astype(np.uint8)


def write_preview(sprites: list[tuple[str, np.ndarray]]) -> None:
    thumb_h = 980
    thumbs = []
    for _label, sprite in sprites:
        image = Image.fromarray(sprite, 'RGBA')
        thumb_w = max(1, round(image.width * thumb_h / image.height))
        thumbs.append(image.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS))
    gap = 18
    label_h = 40
    width = sum(image.width for image in thumbs) + gap * (len(thumbs) + 1)
    height = label_h + thumb_h + gap * 2
    sheet = Image.new('RGB', (width, height), (32, 32, 36))
    draw = ImageDraw.Draw(sheet)
    x = gap
    for (label, _sprite), thumb in zip(sprites, thumbs):
        board = checker(thumb.width, thumb.height)
        sheet.paste(Image.fromarray(composite(np.asarray(thumb), board)), (x, label_h + gap))
        draw.text((x, 10), label, fill=(240, 240, 240))
        x += thumb.width + gap
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(PREVIEW)
    print(PREVIEW)


def main() -> None:
    preview: list[tuple[str, np.ndarray]] = []
    for pose, filename, note in POSES:
        source = REFERENCE / filename
        rgb = np.asarray(Image.open(source).convert('RGB'))
        cut, removed = matte(rgb)
        if not leg_gap_is_open(cut[..., 3]):
            raise SystemExit(f'Leg gap is still sealed: {pose}')
        if pose == 'neutral':
            # The sealed arm-torso pocket sits in this region on the source sheet.
            pocket = cut[620:780, 860:960, 3]
            if int((pocket == 0).sum()) < 4000:
                raise SystemExit('Hand-on-hip arm gap was not opened')
        target = OUT / f'nagasaki-mother-suit-{pose}.png'
        Image.fromarray(cut, 'RGBA').save(target, 'PNG')
        raw = target.read_bytes()
        print(json_line(pose, note, cut.shape, removed, len(raw), sha256(raw)))
        preview.append((f'{pose}: {note}', cut))
    write_preview(preview)


def json_line(pose: str, note: str, shape: tuple[int, ...], removed: list[int], nbytes: int, digest: str) -> str:
    return (f'{pose} {shape[1]}x{shape[0]} holes={sorted(removed, reverse=True)} '
            f'bytes={nbytes} sha256={digest} ({note})')


if __name__ == '__main__':
    main()
