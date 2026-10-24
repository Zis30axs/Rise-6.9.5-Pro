#!/usr/bin/env python3
"""Audit built PNG, original inline phone art and the unchanged Lite ZIP contract."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from build_card import IMMERSIVE_SCRIPT_ID
from verify_downtown_art import extract_v2

ROOT=Path(__file__).resolve().parents[1]
def sha(data): return hashlib.sha256(data).hexdigest()
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--card',required=True,type=Path)
    parser.add_argument('--lite',action='store_true')
    parser.add_argument('--report',type=Path,help='Write this run separately from historical audits')
    args=parser.parse_args()
    card=extract_v2(args.card.read_bytes())
    scripts=[s for s in card['data']['extensions']['tavern_helper']['scripts'] if s.get('id')==IMMERSIVE_SCRIPT_ID]
    bundle=(ROOT/('dist/immersive-shell-lite.js' if args.lite else 'dist/immersive-shell.js')).read_text()
    assert len(scripts)==1 and scripts[0]['content']==bundle, 'PNG script is not the built IIFE'
    runtime=(ROOT/'src/frontend/generated/embedded-phone-runtime.txt').read_text()
    assert runtime.count('UNREAD_CITY_EMBEDDED_PHONE')==1
    assert bundle.count('UNREAD_CITY_EMBEDDED_PHONE')==1, 'Duplicated phone runtime'
    manifest=json.loads((ROOT/'assets/phone-visuals/manifest.json').read_text())
    assert len(manifest['assets'])==82
    for relative,entry in manifest['assets'].items():
        data=(ROOT/'assets/phone-visuals'/relative).read_bytes()
        assert sha(data)==entry['sha256'] and len(data)==entry['bytes']
        assert runtime.count(relative)==1 and bundle.count(relative)==1, f'Phone art not included once: {relative}'
        assert b'http' not in data.replace(b'http://www.w3.org/2000/svg',b''), 'Remote phone asset'
    report={'status':'passed-build-and-byte-audit','lite':args.lite,'phoneRuntimeCopies':1,'originalPhoneSvgAssets':len(manifest['assets']),
            'phoneArtBytes':sum(x['bytes'] for x in manifest['assets'].values()),'inlinePhoneArt':True,
            'cardBytes':args.card.stat().st_size,'cardSha256':sha(args.card.read_bytes()),'physicalIPhoneTested':False}
    if args.lite:
        archive=ROOT/'dist/unread-city-lite-assets.zip'
        with ZipFile(archive) as z:
            m=json.loads(z.read('manifest.json'))
            assert all(x['sha256'] not in {a['sha256'] for a in manifest['assets'].values()} for x in m['assets']), 'Small phone SVG unexpectedly externalized'
            for x in m['assets']:
                data=z.read(x['path']);assert sha(data)==x['sha256'] and len(data)==x['bytes']
                assert z.getinfo(x['path']).compress_type==0
        report.update(zipBytes=archive.stat().st_size,zipSha256=sha(archive.read_bytes()),externalAssets=len(m['assets']))
    (ROOT/'outputs').mkdir(exist_ok=True)
    report_path=args.report or ROOT/f'outputs/phone-visuals-audit{"-lite" if args.lite else ""}.json'
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
if __name__=='__main__': main()
