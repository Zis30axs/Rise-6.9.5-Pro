"""Package the already built Xitter Lite script, without touching an installation."""
from pathlib import Path
import base64
import hashlib
import json
import zipfile
from build_lite_card import build
from build_tauri_import_card import compress_card_metadata

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/xitter-release'

def main():
    script = OUT / 'immersive-shell-lite.js'
    build(script, OUT / 'unread-city-lite.png')
    compressed, report = compress_card_metadata((OUT / 'unread-city-lite.png').read_bytes())
    (OUT / 'unread-city-lite-tauri.png').write_bytes(compressed)
    art = json.loads((ROOT / 'assets/network/manifest.json').read_text(encoding='utf-8'))
    source = script.read_text(encoding='utf-8')
    with zipfile.ZipFile(OUT / 'unread-city-lite-assets.zip') as archive:
        pack = json.loads(archive.read('manifest.json'))
        hashes = {a['sha256'] for a in pack['assets']}
        for a in pack['assets']:
            raw = archive.read(a['path'])
            assert len(raw) == a['bytes'] and hashlib.sha256(raw).hexdigest() == a['sha256']
    checked = []
    for file, a in art['assets'].items():
        encoded = base64.b64encode((ROOT / 'assets/network' / file).read_bytes()).decode('ascii')
        placement = 'zip' if a['sha256'] in hashes else 'inline' if encoded in source else None
        assert placement, f'Network image absent from offline release: {file}'
        checked.append({'file': file, 'placement': placement, 'sha256': a['sha256']})
    for text in ['CucumberT_T', 'Xitter', 'network_follow', 'band:crychic']:
        assert text in source, f'Network code absent from release: {text}'
    result = {'status':'packaged-and-offline-assets-verified', 'networkAssets':checked,
              'zipAssetsVerified':len(hashes), 'tauriContainer':report,
              'physicalTauriTavernTested':False,'deployed':False,
              'files':{f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
                       for f in OUT.iterdir() if f.suffix in ['.png','.zip']}}
    (OUT / 'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Checked {len(checked)} network images and {len(hashes)} ZIP members; packaged both PNG containers.')

if __name__ == '__main__':
    main()
