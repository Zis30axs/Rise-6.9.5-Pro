from pathlib import Path
import base64
import re
from data import ATLAS
import gzip
import json

ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'output'
cover=ROOT/'cover.webp'
tokens={
    'ATLAS':json.dumps(ATLAS,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'),
    'MODEL':base64.b64encode(gzip.compress((OUT/ATLAS['model']).read_bytes(),compresslevel=9,mtime=0)).decode(),
    'COVER':base64.b64encode(cover.read_bytes()).decode() if cover.is_file() else '',
    'ROUTES':(ROOT/'routes.mjs').read_text().replace('export function','function'),
    'APP':(ROOT/'app.js').read_text(),
}
(OUT/'beijing-sandbox.html').write_text(re.sub(r'@@(\w+)@@',lambda m:tokens[m[1]],(ROOT/'template.html').read_text()))
