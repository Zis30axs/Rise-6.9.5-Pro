"""Build and audit this delivery from the final production IIFE."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts'))
from build_lite_card import build
from build_card import IMMERSIVE_SCRIPT_ID
from card_codec import extract_card, read_chunks
from build_tauri_import_card import compress_card_metadata

canonical = OUT / 'unread-city-switch-map-lite.png'
tauri = OUT / 'unread-city-switch-map-lite-tauri.png'
assert not canonical.exists() and not tauri.exists(), 'Use a new output directory for a new delivery'
build(OUT / 'immersive-shell-lite.js', canonical)
compressed, tauri_report = compress_card_metadata(canonical.read_bytes())
tauri.write_bytes(compressed)
tauri.with_suffix('.verification.json').write_text(json.dumps(tauri_report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

card = extract_card(canonical.read_bytes())
scripts = card['data']['extensions']['tavern_helper']['scripts']
own = [row for row in scripts if row['id'] == IMMERSIVE_SCRIPT_ID]
assert len(own) == 1
assert own[0]['content'] == (OUT / 'immersive-shell-lite.js').read_text('utf-8')
assert 'data-protagonist-switch' in own[0]['content'] and 'data-map-back' in own[0]['content']
assert compressed == compress_card_metadata(canonical.read_bytes())[0]
cover_chunks = [(kind, payload) for kind, payload in read_chunks((ROOT / 'assets/cover.png').read_bytes()) if kind in {b'IHDR', b'IDAT', b'IEND'}]
assert cover_chunks == [(kind, payload) for kind, payload in read_chunks(compressed) if kind in {b'IHDR', b'IDAT', b'IEND'}]
with zipfile.ZipFile(OUT / 'unread-city-lite-assets.zip') as archive:
    manifest = json.loads(archive.read('manifest.json'))
    assert len(archive.namelist()) == len(manifest['assets']) + 1
    for row in manifest['assets']:
        raw = archive.read(row['path'])
        assert len(raw) == row['bytes'] and hashlib.sha256(raw).hexdigest() == row['sha256']
    for path in (ROOT / 'assets/protagonist-phone').glob('*.webp'):
        assert 'assets/' + hashlib.sha256(path.read_bytes()).hexdigest() in archive.namelist()
report = {
    'status': 'passed', 'cardScriptEqualsProductionLite': True,
    'scriptCount': len(own), 'zipAssetsVerified': len(manifest['assets']),
    'phonePosesInZip': True, 'fixedCoverImageChunksIdentical': True,
    'tauriMetadataRestoresExactly': True, 'physicalTauriTavernTested': False,
    'artifacts': [{ 'file': path.name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest() }
                  for path in [canonical, tauri, OUT / 'unread-city-lite-assets.zip', OUT / 'immersive-shell-lite.js']],
}
(OUT / 'packaging-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
