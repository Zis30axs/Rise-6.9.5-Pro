"""Rebuild local 256px headshots without re-encoding standing illustrations."""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Source-space square: left, top, side. Sources are 768 x 1344.
CROPS = {
    'uika': ('三角初华', 178, 36, 450),
    'umiri': ('八幡海铃', 174, 36, 450),
    'nyamu': ('祐天寺若麦', 156, 36, 456),
}


def main():
    for person, (name, left, top, side) in CROPS.items():
        source = ROOT / f'assets/downtown-art/characters/{person}/casual/neutral.webp'
        encoded = base64.b64encode(source.read_bytes()).decode('ascii')
        scale = 256 / side
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'
            f'<title>{name}</title><defs><clipPath id="crop"><rect width="256" height="256"/>'
            '</clipPath></defs><g clip-path="url(#crop)">'
            f'<image x="{-left * scale:.3f}" y="{-top * scale:.3f}" '
            f'width="{768 * scale:.3f}" height="{1344 * scale:.3f}" '
            f'preserveAspectRatio="none" href="data:image/webp;base64,{encoded}"/></g></svg>\n'
        )
        (ROOT / f'assets/map-avatars/{person}.svg').write_text(svg, encoding='utf-8')


if __name__ == '__main__':
    main()
