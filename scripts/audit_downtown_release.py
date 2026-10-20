"""Read-only packaging audit of the actual art card, bundle and preserved assets."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import zlib

from build_card import IMMERSIVE_SCRIPT_ID, assemble_card
from card_codec import extract_card, read_chunks
from verify_downtown_art import extract_v2, validate_assets, verify_embedded_card

BASE = Path(__file__).resolve().parents[1]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def audit(card_path: Path) -> dict:
    bundle_path = BASE / 'dist/immersive-shell.js'
    bundle_raw = bundle_path.read_bytes()
    bundle = bundle_raw.decode('utf-8')
    raw = card_path.read_bytes()
    canonical_raw = (BASE / 'dist/unread-city.png').read_bytes()
    card, canonical = extract_v2(raw), extract_card(canonical_raw)
    if card != canonical or card != assemble_card(frontend_path=bundle_path):
        raise ValueError('Card differs from the current bundle or preserved character sources')
    scripts = card['data']['extensions']['tavern_helper']['scripts']
    own = [item for item in scripts if item.get('id') == IMMERSIVE_SCRIPT_ID]
    if len(own) != 1 or own[0]['content'].encode('utf-8') != bundle_raw:
        raise ValueError('Expected exactly one byte-identical project script')

    chunks, original = list(read_chunks(raw)), list(read_chunks(canonical_raw))
    restored = [(b'tEXt', b'chara\0' + zlib.decompress(payload[7:]))
                if kind == b'zTXt' and payload.startswith(b'chara\0\0') else (kind, payload)
                for kind, payload in chunks]
    if restored != original:
        raise ValueError('Tauri packaging changed another PNG chunk or metadata byte')
    image_kinds = {b'IHDR', b'PLTE', b'IDAT', b'tRNS', b'IEND'}
    image_chunks = [(k, p) for k, p in chunks if k in image_kinds]
    cover_chunks = [(k, p) for k, p in read_chunks((BASE / 'assets/cover.png').read_bytes()) if k in image_kinds]
    if image_chunks != cover_chunks:
        raise ValueError('Cover image changed')

    preserved = set()
    for source in (BASE / 'src/frontend').glob('*'):
        if source.suffix not in {'.ts', '.vue'}:
            continue
        for name in re.findall(r'''['"]((?:\.\./)+assets/[^'"?]+)\?(?:url&)?inline['"]''', source.read_text('utf-8')):
            path = (source.parent / name).resolve()
            if not path.is_relative_to(BASE / 'assets'):
                raise ValueError('Asset outside fixed repository root')
            if path.suffix != '.svg':
                preserved.add(path)
    live2d = BASE / 'assets/live2d-soyo'
    for pattern in ('*.moc', '*.png', '*.mtn', '*.exp.json', '*.physics.json'):
        preserved.update(live2d.glob(pattern))
    files = []
    for path in sorted(preserved):
        data = path.read_bytes()
        copies = bundle.count(base64.b64encode(data).decode('ascii'))
        if copies < 1:
            raise ValueError('Existing asset missing from final card: ' + path.name)
        files.append({'path': path.relative_to(BASE).as_posix(), 'bytes': len(data), 'sha256': sha(data), 'inlineCopies': copies})

    runtime = (BASE / 'src/frontend/generated/embedded-phone-runtime.txt').read_text('utf-8')
    # Vite emits this fixed raw module as a template literal. Compare its full
    # escaped contents without executing the release script.
    literal = '`' + runtime.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${') + '`'
    phone_copies = bundle.count(literal)
    if phone_copies != 1:
        raise ValueError('Expected exactly one complete embedded phone runtime')
    phone_export = json.loads((BASE / 'integration/embedded-phone-source/manifest.json').read_text('utf-8'))
    phone_files = []
    for item in phone_export['files']:
        path = BASE.parent / 'ST-iPhonie' / item['path']
        digest = sha(path.read_bytes().replace(b'\r\n', b'\n'))
        if digest != item['afterSha256']:
            raise ValueError('Phone source differs from preserved patch: ' + item['path'])
        phone_files.append({'path': item['path'], 'canonicalSha256': digest})

    asset_report = validate_assets(BASE / 'assets/downtown-art', BASE / 'integration/downtown-art/manifest.json')
    card_report = verify_embedded_card(card_path, asset_report)
    return {'status': 'passed', 'card': card_report,
            'bundle': {'bytes': len(bundle_raw), 'sha256': sha(bundle_raw)},
            'canonicalPng': {'bytes': len(canonical_raw), 'sha256': sha(canonical_raw)},
            'singleProjectScript': True, 'scriptByteIdentical': True,
            'matchesCurrentCardAndWorldbookSources': True, 'pngCrcsVerified': True,
            'tauriMetadataRestoresEveryCanonicalChunk': True, 'coverImageChunksUnchanged': True,
            'preservedInlineAssets': files,
            'phone': {'completeRuntimeCopies': phone_copies, 'runtimeBytes': len(runtime.encode('utf-8')),
                      'runtimeSha256': sha(runtime.encode('utf-8')), 'preservedPatchFiles': phone_files},
            'physicalTauriDevice': 'not tested', 'realUserSaveFiles': 'not read or written by this task'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--card', type=Path, default=BASE / 'dist/unread-city-downtown-art-tauri.png')
    parser.add_argument('--report', type=Path, default=BASE / 'outputs/downtown-art-packaging-audit.json')
    args = parser.parse_args()
    report = audit(args.card)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'preservedAssets': len(report['preservedInlineAssets']), 'card': report['card']}))
