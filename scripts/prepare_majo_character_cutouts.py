#!/usr/bin/env python3
"""Cut out the six user-confirmed character sheets and upscale them 2x.

This regeneration step needs the Apache-2.0 anime segmentation model
``skytnt/anime-seg`` (isnetis.onnx) and ``onnxruntime``. The model is not
committed; the generated transparent sprites and their manifest are.

    python -m pip install onnxruntime
    python scripts/prepare_majo_character_cutouts.py --model /path/isnetis.onnx

Normal builds only run ``prepare_majo_visual_assets.py --check``; they never
download or execute this model.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/majo-runtime'
ASSIGNMENTS = OUT / 'character-sheet-assignments.json'
SHEET_MANIFEST = ROOT / 'assets/majo-cast/character-source-sheets-20261022.json'
SHEET_PACK = ROOT / 'assets/majo-cast/packs/unread-city-majo-five-character-source-sheets-20261022.zip'
RECOVERED = ROOT / 'assets/majo-cast/recovered-10-source-images-20261022.json'
RECOVERED_ROOT = ROOT / 'assets/majo-cast'
MODEL_URL = 'https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx'
MODEL_SHA256 = 'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99'
MODEL_BYTES = 176_069_933
UPSCALE = 2
WEBP = {'quality': 90, 'method': 6}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_member(archive: Path, member: str) -> bytes:
    with zipfile.ZipFile(archive) as source:
        info = source.getinfo(member)
        if info.compress_type != zipfile.ZIP_STORED:
            raise ValueError(f'Expected ZIP_STORED: {archive.name}:{member}')
        return source.read(member)


def sources() -> dict[str, dict]:
    sheets = json.loads(SHEET_MANIFEST.read_text(encoding='utf-8'))['images']
    recovered = json.loads(RECOVERED.read_text(encoding='utf-8'))['images']
    rows = {row['id']: {**row, 'pack': SHEET_PACK} for row in sheets}
    rows.update({row['id']: {**row, 'pack': RECOVERED_ROOT / row['sourcePack']}
                 for row in recovered if row['category'] == 'character-reference'})
    return rows


def segment(session, image: Image.Image, size: int = 1024) -> np.ndarray:
    rgb = np.asarray(image.convert('RGB')).astype(np.float32) / 255.0
    height, width = rgb.shape[:2]
    scaled = (size, int(size * width / height)) if height > width else (int(size * height / width), size)
    resized = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((scaled[1], scaled[0]), Image.LANCZOS)).astype(np.float32) / 255.0
    pad_h, pad_w = size - scaled[0], size - scaled[1]
    canvas = np.zeros((size, size, 3), dtype=np.float32)
    canvas[pad_h // 2:pad_h // 2 + scaled[0], pad_w // 2:pad_w // 2 + scaled[1]] = resized
    mask = session.run(None, {'img': np.transpose(canvas, (2, 0, 1))[None]})[0][0, 0]
    mask = mask[pad_h // 2:pad_h // 2 + scaled[0], pad_w // 2:pad_w // 2 + scaled[1]]
    return np.asarray(Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'L')
                      .resize((width, height), Image.LANCZOS)).astype(np.float32) / 255.0


def upscale(rgba: Image.Image) -> Image.Image:
    array = np.asarray(rgba).astype(np.float32)
    alpha = array[..., 3:4] / 255.0
    premultiplied = (array[..., :3] * alpha).astype(np.uint8)
    rgb = Image.fromarray(premultiplied, 'RGB').resize(
        (rgba.width * UPSCALE, rgba.height * UPSCALE), Image.LANCZOS)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.1, percent=45, threshold=2))
    a = Image.fromarray(array[..., 3].astype(np.uint8), 'L').resize(
        (rgba.width * UPSCALE, rgba.height * UPSCALE), Image.LANCZOS)
    rgb_data = np.asarray(rgb).astype(np.float32)
    a_data = np.asarray(a).astype(np.float32) / 255.0
    with np.errstate(divide='ignore', invalid='ignore'):
        straight = np.where(a_data[..., None] > 0.002, rgb_data / np.maximum(a_data[..., None], 0.002), 0)
    return Image.fromarray(np.dstack([np.clip(straight, 0, 255).astype(np.uint8), (a_data * 255).astype(np.uint8)]), 'RGBA')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=Path(os.environ.get('MAJO_ANIME_SEG_MODEL', '')))
    args = parser.parse_args()
    if not args.model.is_file():
        raise SystemExit('Missing isnetis.onnx; pass --model or MAJO_ANIME_SEG_MODEL')
    model_bytes = args.model.read_bytes()
    if len(model_bytes) != MODEL_BYTES or sha256(model_bytes) != MODEL_SHA256:
        raise SystemExit('Anime segmentation model does not match the documented SHA-256')
    import onnxruntime as rt
    session = rt.InferenceSession(str(args.model), providers=['CPUExecutionProvider'])
    assignments = json.loads(ASSIGNMENTS.read_text(encoding='utf-8'))
    if assignments.get('schema') != 'unread-city-majo-character-sheet-assignments-v1':
        raise SystemExit('Unknown assignment schema')
    by_id = sources()
    rows = []
    for assignment in assignments['assignments']:
        source = by_id.get(assignment['sourceId'])
        if not source:
            raise SystemExit(f'Missing source: {assignment["sourceId"]}')
        data = read_member(Path(source['pack']), source['archivePath'])
        if len(data) != source['bytes'] or sha256(data) != source['sha256']:
            raise SystemExit(f'Source hash mismatch: {source["sourceId"]}')
        sheet = Image.open(io.BytesIO(data)).convert('RGB')
        if sheet.width % 3:
            raise SystemExit('Character sheet is not three-panel')
        panel_width = sheet.width // 3
        for index, emotion in enumerate(assignments['panelExpressions']):
            panel = sheet.crop((index * panel_width, 0, (index + 1) * panel_width, sheet.height))
            mask = segment(session, panel)
            rgba = panel.convert('RGBA')
            rgba.putalpha(Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'L'))
            sprite = upscale(rgba)
            output = io.BytesIO()
            sprite.save(output, 'WEBP', quality=WEBP['quality'], method=WEBP['method'])
            encoded = output.getvalue()
            relative = Path('characters') / assignment['personId'] / f'{emotion}.webp'
            target = OUT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(encoded)
            with Image.open(io.BytesIO(encoded)) as decoded:
                if decoded.size != sprite.size or decoded.mode != 'RGBA':
                    raise SystemExit(f'Unexpected output: {relative}')
            rows.append({
                'id': f'characters/{assignment["personId"]}/{emotion}',
                'personId': assignment['personId'], 'emotion': emotion,
                'file': relative.as_posix(), 'mime': 'image/webp',
                'bytes': len(encoded), 'sha256': sha256(encoded),
                'width': sprite.width, 'height': sprite.height, 'alpha': True,
                'encoding': 'anime-seg-alpha-upscale-2x-webp-quality-90',
                'sourceId': assignment['sourceId'], 'sourceSha256': source['sha256'],
                'sourcePack': Path(source['pack']).relative_to(ROOT).as_posix(),
                'sourceBytes': source['bytes'], 'panelIndex': index,
                'userConfirmed': True,
            })
            print(relative.as_posix(), len(encoded))
    # Keep cutouts this anime-seg pass does not regenerate: Yuki's white-backdrop
    # PNGs, and the 2026-10-30 user-provided casual trio (isnet-anime).
    prior_path = OUT / 'character-cutouts.json'
    prior = json.loads(prior_path.read_text(encoding='utf-8')) if prior_path.is_file() else {}

    def preserve_asset(item: dict) -> bool:
        person = item.get('personId')
        relative = item.get('file', '')
        if person == 'majo-yuki':
            return True
        if person in {'majo-nanoka', 'majo-arisa'}:
            return True
        return person == 'majo-milia' and relative.startswith('characters/majo-milia/casual/')

    preserved = [item for item in prior.get('assets', []) if preserve_asset(item)]
    if preserved:
        yuki = [item for item in preserved if item.get('personId') == 'majo-yuki']
        if len(yuki) != 3 or {row['emotion'] for row in yuki} != {'neutral', 'happy', 'thinking'}:
            raise SystemExit('Yuki cutout registry must contain three distinct expressions')
        for asset in preserved:
            relative = asset['file']
            if asset.get('personId') == 'majo-yuki' and (not relative.startswith('characters/majo-yuki/') or asset['mime'] != 'image/png'):
                raise SystemExit('Invalid Yuki sprite path or encoding')
            file_bytes = (OUT / relative).read_bytes()
            if len(file_bytes) != asset['bytes'] or sha256(file_bytes) != asset['sha256']:
                raise SystemExit('Preserved cutout hash mismatch: ' + relative)
        rows.extend(preserved)

    manifest = {
        'schema': 'unread-city-majo-character-cutouts-v1',
        'generatedBy': 'scripts/prepare_majo_character_cutouts.py',
        'model': {'name': 'skytnt/anime-seg', 'file': 'isnetis.onnx', 'url': MODEL_URL,
                  'sha256': MODEL_SHA256, 'bytes': MODEL_BYTES, 'license': 'Apache-2.0'},
        'upscale': UPSCALE,
        'webp': WEBP,
        'notes': [
            'Background removed with the anime-seg ONNX model; no manual painting.',
            'Premultiplied-alpha LANCZOS upscale 2x with a light unsharp mask.',
            'Expression names are the user-confirmed three-panel mapping, not official names.',
        ],
        'assets': rows,
    }
    if preserved:
        manifest['notes'] = prior.get('notes', manifest['notes'])
        if 'additionalMethod' in prior:
            manifest['additionalMethod'] = prior['additionalMethod']
        if 'trioMethod' in prior:
            manifest['trioMethod'] = prior['trioMethod']
    (OUT / 'character-cutouts.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({'cutouts': len(rows), 'assetBytes': sum(row['bytes'] for row in rows), 'manifestSha256': sha256((OUT / 'character-cutouts.json').read_bytes())}, ensure_ascii=False))


if __name__ == '__main__':
    main()
