"""Build a separate review package from the graphics recovery production bundle."""
from pathlib import Path
import hashlib
import json
from build_lite_release import externalize
from build_lite_card import build
from build_tauri_import_card import compress_card_metadata

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/graphics-recovery/release'

def main():
    source = (OUT.parent / 'build/immersive-shell.js').read_text(encoding='utf-8')
    script, archive, report = externalize(source, (ROOT / 'scripts/lite_asset_loader.js').read_text(encoding='utf-8'))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'immersive-shell-lite.js').write_text(script, encoding='utf-8')
    (OUT / 'unread-city-lite-assets.zip').write_bytes(archive)
    build(OUT / 'immersive-shell-lite.js', OUT / 'unread-city-lite.png')
    compressed, container = compress_card_metadata((OUT / 'unread-city-lite.png').read_bytes())
    (OUT / 'unread-city-lite-tauri.png').write_bytes(compressed)
    report.update(tauriContainer=container, deployed=False, physicalDeviceTested=False)
    report['files'] = {file.name: {'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
                       for file in OUT.iterdir() if file.suffix in ('.png', '.zip', '.js')}
    (OUT / 'packaging.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Packaged {report["assets"]} local assets; deployment and device testing not performed.')

if __name__ == '__main__':
    main()
