"""Render the project's existing portrait crops at the map marker resolution."""
import base64
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
assets = Path('assets/map-avatars')
images = {}
def encode(image):
    buffer = io.BytesIO()
    image.save(buffer, format='WEBP', quality=88)
    return 'data:image/webp;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')
for path in sorted(assets.glob('*.svg')):
    root = ET.parse(path).getroot()
    el = root.find('.//{*}image')
    name = root.findtext('{*}title') or path.stem
    image = Image.open(io.BytesIO(base64.b64decode(el.get('href').split(',')[1]))).convert('RGBA')
    x,y,w,h = (float(el.get(k)) for k in ('x','y','width','height'))
    # Render the actual SVG image rectangle and clip in its 256-unit viewport.
    cropped = image.transform((96,96), Image.Transform.AFFINE,
        (256/96*image.width/w,0,-x*image.width/w,0,256/96*image.height/h,-y*image.height/h),Image.Resampling.BICUBIC)
    images[path.stem] = [name,encode(cropped)]
soyo = Image.open(assets/'soyo.webp').convert('RGBA')
soyo.thumbnail((96,96),Image.Resampling.LANCZOS)
images['soyo'] = ['长崎素世',encode(soyo)]
print(json.dumps(images,ensure_ascii=False,separators=(',',':')))
