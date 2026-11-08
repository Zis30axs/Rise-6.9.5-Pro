"""Update only the installed card's own Lite script, preserving its existing asset pack."""
from pathlib import Path
import base64
import hashlib
import json
import os
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'dist/local-lite-recovery-20261108'))
import deploy as audit
from card_codec import encode_card, extract_card, read_chunks


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def prepare():
    audit.check(not (OUT / 'deployment-before.json').exists(), 'Snapshot already exists')
    original = audit.fingerprint(audit.CARD)
    audit.check(original['bytes'] < 128 * 1024 * 1024, 'Installed card unexpectedly large')
    chats = audit.chat_snapshot()
    raw = audit.CARD.read_bytes()
    # SillyTavern may save a fresh ccv3 mirror. Match its read precedence and
    # preserve the latest fields before writing one interoperable V2 payload.
    payloads = {}
    for kind, payload in read_chunks(raw):
        if kind == b'tEXt' and payload.split(b'\0', 1)[0] in (b'chara', b'ccv3'):
            key, value = payload.split(b'\0', 1)
            audit.check(key not in payloads, 'Duplicate metadata key')
            payloads[key] = value
    audit.check(bool(payloads), 'Missing card metadata')
    card = json.loads(base64.b64decode(payloads.get(b'ccv3', payloads.get(b'chara')), validate=True))
    original_spec = card.get('spec')
    card['spec'] = 'chara_card_v2'
    card['spec_version'] = '2.0'
    normalized = OUT / 'normalized-card-before.png'
    normalized.write_bytes(encode_card(raw, card))
    card_info = audit.card_info(normalized)
    pack = audit.verify_pack(audit.PACK, card_info)
    del payloads, payload
    own = next(row for row in card['data']['extensions']['tavern_helper']['scripts'] if row['id'] == audit.SCRIPT_ID)
    old_script = own['content']
    new_script = (OUT / 'release/immersive-shell-lite.js').read_text(encoding='utf-8')
    audit.check('tool-dock-collapsible' in new_script, 'Missing collapsible dock')
    audit.check('readInspected' in new_script and 'peek-canonical-open' in new_script, 'Missing unified phone inspection')
    audit.check('查主角手机' not in new_script, 'Duplicate phone inspection entry remains')
    own['content'] = new_script
    output = OUT / 'installed-card-updated.png'
    output.write_bytes(encode_card(raw, card))
    updated = audit.card_info(output)
    audit.verify_pack(audit.PACK, updated)
    audit.check(updated['cover_sha256'] == card_info['cover_sha256'], 'Cover changed')
    roundtrip = extract_card(output.read_bytes())
    next(row for row in roundtrip['data']['extensions']['tavern_helper']['scripts'] if row['id'] == audit.SCRIPT_ID)['content'] = old_script
    own['content'] = old_script
    audit.check(roundtrip == card, 'Unrelated card metadata changed')
    backup = OUT / 'installed-card-before.png'
    with backup.open('xb') as target:
        target.write(raw)
    audit.check(audit.sha_file(audit.CARD) == original['sha256'] and audit.chat_snapshot() == chats, 'Card/chats changed during preparation')
    save('deployment-before.json', {'original': original, 'original_spec': original_spec,
         'card': card_info, 'pack': pack, 'chats': chats, 'updated': updated})
    print(json.dumps({'prepared': True, 'card_bytes': updated['bytes'], 'chats': len(chats),
                      'only_own_script_changed': True, 'same_asset_pack': True, 'cover_preserved': True}))


def apply():
    before = json.loads((OUT / 'deployment-before.json').read_text(encoding='utf-8'))
    audit.check(audit.CARD.resolve() == audit.CARD, 'Card path redirected')
    audit.check(audit.sha_file(audit.CARD) == before['original']['sha256'], 'Installed card changed since preparation')
    audit.check(audit.sha_file(audit.PACK) == before['pack']['sha256'], 'Installed pack changed since preparation')
    audit.check(audit.chat_snapshot() == before['chats'], 'Chats changed since preparation')
    source = OUT / 'installed-card-updated.png'
    audit.check(audit.sha_file(source) == before['updated']['sha256'], 'Prepared card changed')
    fd, name = tempfile.mkstemp(prefix='.unread-city-dock-', suffix='.tmp', dir=audit.CARD.parent)
    pending = Path(name)
    try:
        with os.fdopen(fd, 'wb') as target, source.open('rb') as stream:
            shutil.copyfileobj(stream, target, 1024 * 1024)
            target.flush()
            os.fsync(target.fileno())
        audit.check(audit.sha_file(pending) == before['updated']['sha256'], 'Temporary card differs')
        audit.check(audit.sha_file(audit.CARD) == before['original']['sha256'], 'Installed card changed during copy')
        os.replace(pending, audit.CARD)
    finally:
        if pending.exists():
            pending.unlink()
    installed = audit.card_info(audit.CARD)
    pack = audit.verify_pack(audit.PACK, installed)
    audit.check(installed == before['updated'], 'Installed card differs')
    audit.check(pack == before['pack'] and audit.chat_snapshot() == before['chats'], 'Pack/chats changed')
    result = {'status': 'deployed-and-verified', 'card_bytes': installed['bytes'], 'card_sha256': installed['sha256'],
              'only_own_script_changed': True, 'cover_preserved': True, 'metadata_blocks': installed['metadata'],
              'asset_pack_unchanged': True, 'browser_reimport_required': False, 'verified_assets': pack['verified_assets'],
              'chats_unchanged': True, 'chat_files': len(before['chats']), 'user_browser_refresh_performed': False}
    save('deployment-after.json', result)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    audit.check(len(sys.argv) == 2 and sys.argv[1] in ('prepare', 'apply'), 'Use prepare or apply')
    (prepare if sys.argv[1] == 'prepare' else apply)()
