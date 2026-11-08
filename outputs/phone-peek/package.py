"""Package the dock update and reuse the installed pack only if every asset matches."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'release'
sys.path.insert(0, str(ROOT / 'scripts'))
from build_lite_release import externalize
from build_lite_card import build

source = (OUT / 'build/immersive-shell.js').read_text(encoding='utf-8')
script, archive, report = externalize(source, (ROOT / 'scripts/lite_asset_loader.js').read_text(encoding='utf-8'))
del source
installed = Path('D:/SillyTavern/public/unread-city-lite-assets.zip')
with zipfile.ZipFile(installed) as zipped:
    old_manifest = zipped.read('manifest.json')
with zipfile.ZipFile(__import__('io').BytesIO(archive)) as zipped:
    new_manifest = zipped.read('manifest.json')
reuse = json.loads(old_manifest)['assets'] == json.loads(new_manifest)['assets']
if reuse:
    old_sha = hashlib.sha256(old_manifest).hexdigest()
    old_declaration = 'const __UC_LITE_PACK_SHA__ = ' + json.dumps(report['manifestSha256']) + ';'
    if script.count(old_declaration) != 1:
        raise ValueError('Expected one manifest declaration')
    script = script.replace(old_declaration, 'const __UC_LITE_PACK_SHA__ = ' + json.dumps(old_sha) + ';')
    del archive
    shutil.copyfile(installed, OUT / 'unread-city-lite-assets.zip')
    report['manifestSha256'] = old_sha
    with installed.open('rb') as stream:
        report['zipSha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
    report['zipBytes'] = installed.stat().st_size
else:
    (OUT / 'unread-city-lite-assets.zip').write_bytes(archive)
    del archive
(OUT / 'immersive-shell-lite.js').write_text(script, encoding='utf-8', newline='\n')
report['liteScriptBytes'] = len(script.encode('utf-8'))
report['reusedInstalledAssetPack'] = reuse
report['assetEquivalenceChecked'] = True
report['deployed'] = False
(OUT / 'packaging.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
build(OUT / 'immersive-shell-lite.js', OUT / 'unread-city-lite.png')
print(json.dumps({'assets': report['assets'], 'reusedInstalledAssetPack': reuse, 'liteScriptBytes': report['liteScriptBytes']}))
