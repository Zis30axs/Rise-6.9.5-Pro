"""Produce local-only texture contact sheets for manual appearance review."""
from pathlib import Path
import argparse, json, re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'outputs/live2d-review'
OUT.mkdir(parents=True, exist_ok=True)
rows = []
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--mygo', type=Path, required=True)
parser.add_argument('--ave', type=Path, required=True)
args = parser.parse_args()
for source in [args.mygo, args.ave]:
    for index in sorted((source / 'assets/model').glob('*/index.json')):
        if index.parent.name.startswith('018_'): continue
        config = json.loads(index.read_text(encoding='utf-8'))
        model_id = re.match('[A-Za-z0-9_-]+', index.parent.name)[0].rstrip('_')
        rows.append((model_id, [(index.parent / p).resolve() for p in config['textures']]))
for start in range(0, len(rows), 12):
    sheet = Image.new('RGB', (1400, 1200), '#b9b9b9')
    draw = ImageDraw.Draw(sheet)
    for offset, (model_id, textures) in enumerate(rows[start:start+12]):
        x, y = offset % 4 * 350, offset // 4 * 400
        draw.text((x+4,y+4), model_id, fill='black')
        for t, path in enumerate(textures):
            pic = Image.open(path).convert('RGBA'); pic.thumbnail((345, 180))
            sheet.paste(pic, (x,y+24+t*185), pic)
    sheet.save(OUT / f'textures-{start//12}.jpg')
print(len(rows), str(OUT))
