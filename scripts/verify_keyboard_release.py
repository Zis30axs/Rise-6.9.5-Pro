"""Audit the fixed-viewport release without invoking CI or a model."""
from pathlib import Path
import hashlib
import json
import zlib

from build_card import IMMERSIVE_SCRIPT_ID
from card_codec import PNG_SIGNATURE, extract_card, read_chunks, write_chunk

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'outputs/keyboard-layout'
RELEASE = OUTPUT / 'release'


def main():
    canonical = (RELEASE / 'unread-city-lite.png').read_bytes()
    compressed = (RELEASE / 'unread-city-lite-tauri-keyboard.png').read_bytes()
    restored = PNG_SIGNATURE + b''.join(
        write_chunk(b'tEXt', b'chara\0' + zlib.decompress(payload[7:]))
        if kind == b'zTXt' and payload.startswith(b'chara\0\0')
        else write_chunk(kind, payload)
        for kind, payload in read_chunks(compressed)
    )
    assert restored == canonical, 'Tauri metadata conversion changed the card'
    card = extract_card(canonical)
    scripts = card['data']['extensions']['tavern_helper']['scripts']
    own = [row for row in scripts if row.get('id') == IMMERSIVE_SCRIPT_ID]
    assert len(own) == 1
    script = (RELEASE / 'immersive-shell-lite.js').read_text(encoding='utf-8')
    assert own[0]['content'] == script, 'Card contains a stale script'
    assert script == (ROOT / 'dist/immersive-shell-lite.js').read_text(encoding='utf-8')
    assets = json.loads((RELEASE / 'lite-assets-report.json').read_text(encoding='utf-8'))
    archive = RELEASE / 'unread-city-lite-assets.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == assets['zipSha256']
    packs = card['data']['extensions']['unread_city']['immersive']['assetPacks']
    assert [(pack['id'], pack['required']) for pack in packs] == [('lite-assets', True), ('live2d-ensemble', False)]
    unit = json.loads((OUTPUT / 'unit-tests.json').read_text(encoding='utf-8'))
    assert unit['success'] and unit['numFailedTests'] == 0
    browser_reports = {}
    for name, count in [('browser', 24), ('packaged-browser', 9)]:
        result = json.loads((OUTPUT / (name + '.json')).read_text(encoding='utf-8'))
        assert len(result['cases']) == count and not result['errors']
        assert not result.get('externalRequests', []) and not result.get('blockedRequests', [])
        assert all(case['stable'] and case['heldThroughBlur'] and case['recovered'] for case in result['cases'])
        if name == 'packaged-browser':
            assert all(case['draftPreserved'] and case['after']['modelCalls'] == 0 for case in result['cases'])
        else:
            assert all(case['nativeRestored'] for case in result['cases'])
        browser_reports[name] = {'passed': count, 'scope': result['scope']}
    files = ['immersive-shell-lite.js', 'unread-city-lite.png', 'unread-city-lite-tauri-keyboard.png', 'unread-city-lite-assets.zip']
    report = {
        'date': '2026-11-10', 'status': 'local-checks-passed',
        'unitTests': unit['numPassedTests'], 'browsers': browser_reports,
        'cardScriptMatchesFinalBuild': True, 'tauriMetadataLossless': True,
        'scriptComparison': 'UTF-8 text with universal newline normalization, matching build_card input handling',
        'assetPacks': packs,
        'artifacts': {name: {'bytes': (RELEASE / name).stat().st_size,
                             'sha256': hashlib.sha256((RELEASE / name).read_bytes()).hexdigest()} for name in files},
        'notRun': ['physical TauriTavern/iPhone keyboard and import', 'GitHub Actions/CI', 'Agent Edition', 'real LLM', 'legacy full release verifier'],
        'deployed': False,
    }
    (OUTPUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
