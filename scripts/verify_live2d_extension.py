"""Verify every normalized reference and byte in the independent optional ZIP."""
from pathlib import Path
import hashlib, json, zipfile
ROOT=Path(__file__).resolve().parents[1]
def verify():
    folder=ROOT/'assets/live2d-ensemble'
    descriptor=json.loads((folder/'pack.json').read_bytes())
    with zipfile.ZipFile(folder/'unread-city-live2d.zip') as archive:
        raw=archive.read('manifest.json')
        assert hashlib.sha256(raw).hexdigest()==descriptor['sha']
        manifest=json.loads(raw)
        assert len(archive.namelist())==len(set(archive.namelist()))==len(manifest['assets'])+1
        assets={row['sha256']:row for row in manifest['assets']}
        for sha,row in assets.items():
            data=archive.read(row['path'])
            assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==sha
        core_reused=0
        for model in manifest['models']:
            if model['bundledSoyo']:
                assert model['person']=='soyo' and model['id']=='039_school_winter-2023'
                core_reused+=1
                continue
            payload=json.loads(archive.read('assets/'+model['definitionSha']))
            definition=payload['definition'];files=payload['files']
            refs=[definition['model'],*definition['textures'],definition['physics']]
            refs += [r['file'] for r in definition['expressions']]
            refs += [r['file'] for group in definition['motions'].values() for r in group]
            for ref in refs:
                assert '/' not in ref and '\\' not in ref and ':' not in ref
                row=files[ref];assert row['sha256'] in assets
                assert row['bytes']==assets[row['sha256']]['bytes']
            assert archive.read('assets/'+files[definition['model']]['sha256']).startswith(b'moc\x0b')
            for texture in definition['textures']:
                assert archive.read('assets/'+files[texture]['sha256']).startswith(b'\x89PNG\r\n\x1a\n')
        assert len(manifest['models'])==94 and core_reused==1
    report={'models':len(manifest['models']),'assets':len(assets),'coreReused':core_reused,'allReferencesAndHashes':'passed'}
    print(json.dumps(report))
    return report
if __name__=='__main__':verify()
