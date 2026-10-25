#!/usr/bin/env python3
"""Reproduce original device artwork; no fonts, network or bitmap dependencies."""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/phone-visuals'
GLYPHS = {
    'appie': '<rect x="24" y="31" width="48" height="36" rx="8"/><path d="M26 42h44M32 57h12"/>',
    'worldshop': '<path d="M28 35h40l4 39H24zM38 36v-7a10 10 0 0 1 20 0v7"/>',
    'worlddelivery': '<path d="M23 44h36v22H23zM59 51h10l8 10v5H59M29 35h24M34 27h14"/><circle cx="34" cy="70" r="5"/><circle cx="67" cy="70" r="5"/>',
    'worldcalendar': '<rect x="25" y="27" width="46" height="46" rx="7"/><path d="M25 40h46M36 21v12M60 21v12M36 51h8M52 51h8M36 61h8"/>',
    'worldmessages': '<path d="M22 28h42v30H43L30 69V58h-8zM71 39h5v34H56l-8 6v-9M32 39h22M32 47h15"/>',
    'peek': '<rect x="31" y="18" width="34" height="60" rx="8"/><path d="M41 25h14M43 70h10M23 48s10-13 25-13 25 13 25 13-10 13-25 13-25-13-25-13z"/><circle cx="48" cy="48" r="6"/>',
    'roles': '<circle cx="48" cy="35" r="12"/><path d="M25 73v-5a23 23 0 0 1 46 0v5z"/>',
    'engines': '<rect x="29" y="29" width="38" height="38" rx="6"/><rect x="40" y="40" width="16" height="16" rx="2"/><path d="M38 20v9M58 20v9M38 67v9M58 67v9M20 38h9M20 58h9M67 38h9M67 58h9"/>',
    'presets': '<path d="M25 30h46M25 48h46M25 66h46"/><circle cx="39" cy="30" r="5"/><circle cx="58" cy="48" r="5"/><circle cx="43" cy="66" r="5"/>',
    'library': '<path d="M25 25h11v48H25zM41 25h11v48H41zM59 26l11-2 8 47-11 2z"/>',
    'gallery': '<rect x="23" y="25" width="50" height="46" rx="7"/><circle cx="38" cy="39" r="5"/><path d="m25 65 15-16 10 9 10-17 13 24"/>',
    'notes': '<path d="M29 22h30l11 11v41H29zM59 22v13h11M38 45h22M38 55h22M38 65h14"/>',
    'listen': '<path d="M24 51v-5a24 24 0 0 1 48 0v5M24 48h9v22h-9zM63 48h9v22h-9z"/>',
    'settings': '<circle cx="48" cy="48" r="12"/><path d="m42 23 12 0 3 8 8 4 8-1 6 11-6 6-1 9 3 7-10 7-7-4-9 1-6 6-11-6 1-8-4-8-8-3V45l8-3 4-8-1-8z"/>',
    'draw': '<path d="m26 69 5-18 33-30 12 12-33 30zM31 51l12 12M59 26l12 12M26 69l17-6"/>',
    'chat': '<path d="M24 26h48v35H47L31 74V61h-7zM34 39h28M34 49h19"/>',
    'forum': '<path d="M20 32h39v29H38L27 72V61h-7zM44 23h32v30h-9M29 43h21M29 51h13"/>',
    'sounds': '<path d="M24 40h12l15-14v44L36 56H24zM61 35a19 19 0 0 1 0 26M70 26a31 31 0 0 1 0 44"/>',
    'assistant': '<path d="M48 20v10M27 36h42v34H27zM20 44v16M76 44v16M38 59h20"/><circle cx="38" cy="46" r="2"/><circle cx="58" cy="46" r="2"/>',
    'music': '<path d="M38 64V29l30-6v35M38 39l30-6"/><ellipse cx="30" cy="66" rx="8" ry="6"/><ellipse cx="60" cy="60" rx="8" ry="6"/>',
    'games': '<path d="M32 35h32c8 0 14 31 9 36-6 6-15-10-20-10H43c-5 0-14 16-20 10-5-5 1-36 9-36zM33 44v14M26 51h14M60 45h1M67 53h1"/>',
    'paint': '<path d="M48 23a26 26 0 1 0 0 52c13 0 2-14 12-16 20-4 18-36-12-36z"/><circle cx="34" cy="40" r="3"/><circle cx="47" cy="33" r="3"/><circle cx="60" cy="40" r="3"/><circle cx="30" cy="54" r="3"/>',
    'worldstyle': '<path d="M48 22 69 35v26L48 74 27 61V35zM27 35l21 13 21-13M48 48v26"/>',
}

def svg(body, w=96, h=96):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>\n'

def sakura(x, y, scale=1, opacity=1):
    petals = ''.join(f'<path transform="rotate({angle})" d="M0 0C-15-8-19-24-8-29L0-23 8-29C19-24 15-8 0 0Z"/>' for angle in range(0, 360, 72))
    return f'<g transform="translate({x} {y}) scale({scale})" opacity="{opacity}" fill="#f3b7ce">{petals}<circle r="3" fill="#111218"/></g>'

def emma_art():
    """Black first; restrained sakura pink and paired blue ribbon stripes."""
    files = {}
    glyphs = {**GLYPHS, 'twiitch': '<path d="M24 25h48v34L56 73H43l-9 7V65H24zM38 37v15M56 37v15"/>'}
    for app, glyph in glyphs.items():
        body = '<rect x="2" y="2" width="92" height="92" rx="24" fill="#15161c"/><rect x="6" y="6" width="84" height="84" rx="20" fill="none" stroke="#f3b7ce" stroke-opacity=".3"/><path d="m59 11 25 17m-30-9 29 20" fill="none" stroke="#79b8ef" stroke-width="3" opacity=".65"/>'
        body += f'<g fill="none" stroke="#f3b7ce" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">{glyph}</g>'
        files[f'emma/icons/{app}.svg'] = svg(body)
    body = '<rect width="390" height="844" fill="#0c0d12"/><path d="M0 535Q170 465 390 560V844H0Z" fill="#111218"/><g fill="none" stroke="#79b8ef"><path d="m270-25 157 145m-180-145 180 166" stroke-width="6" opacity=".7"/><path d="M-45 777 435 532M-45 793 435 548" stroke-width="5" opacity=".48"/><path d="M-45 813 435 568" stroke-width="1" opacity=".35"/></g><path d="M390 824Q282 692 326 556M315 674Q270 638 252 589M323 619Q356 598 371 567" fill="none" stroke="#f3b7ce" stroke-width="1.5" opacity=".3"/>'
    body += sakura(327, 568, 1.2, .8) + sakura(260, 611, .6, .6) + sakura(362, 650, .7, .45)
    body += '<g fill="#f3b7ce" opacity=".55"><path d="M42 173q17-9 17 8-14 10-17-8M318 311q14-10 15 5-10 12-15-5M93 648q17-11 17 6-13 11-17-6"/></g>'
    files['emma/wallpaper.svg'] = svg(body, 390, 844)
    for i, card in enumerate(('gpt', 'claude', 'gemini')):
        base = ('#111218', '#1b151c', '#121a23')[i]
        body = f'<rect width="360" height="210" rx="23" fill="{base}"/><rect x="9" y="9" width="342" height="192" rx="17" fill="none" stroke="#f3b7ce" opacity=".35"/>'
        body += '<g stroke="#79b8ef" fill="none"><path d="m248 0 112 93m-132-93 132 110" stroke-width="5" opacity=".7"/><path d="m210 0 150 125" opacity=".4"/></g>' + sakura(301, 98, .9, .65)
        body += '<rect x="25" y="50" width="30" height="18" rx="5" fill="#d7c1c9"/><path d="M35 50v18M45 50v18M25 59h30" stroke="#79616a" fill="none"/><circle cx="315" cy="176" r="14" fill="#f3b7ce" opacity=".65"/><circle cx="331" cy="176" r="14" fill="#79b8ef" opacity=".65"/>'
        files[f'emma/cards/{card}.svg'] = svg(body, 360, 210)
    return files

def renako_art():
    """Soft peach-pink and lavender-purple with crossed hairpins & gamepad motifs."""
    files = {}
    glyphs = {**GLYPHS, 'twiitch': '<path d="M24 25h48v34L56 73H43l-9 7V65H24zM38 37v15M56 37v15"/>'}
    for app, glyph in glyphs.items():
        body = '<rect x="2" y="2" width="92" height="92" rx="26" fill="#fff4f8"/><rect x="6" y="6" width="84" height="84" rx="22" fill="none" stroke="#d89bbb" stroke-opacity=".55"/><path d="m62 12 18 14m0-14-18 14" fill="none" stroke="#9b7dc7" stroke-width="2.8" stroke-linecap="round" opacity=".75"/>'
        body += f'<g fill="none" stroke="#6d466b" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">{glyph}</g>'
        files[f'renako/icons/{app}.svg'] = svg(body)
    body = '<rect width="390" height="844" fill="#fff5f9"/><path d="M0 510Q195 430 390 535V844H0Z" fill="#fce4ee"/><path d="M0 645Q210 560 390 665V844H0Z" fill="#eddcf6"/><g fill="none" stroke="#9b7dc7" stroke-linecap="round"><path d="m282 96 62 46m0-46-62 46" stroke-width="7" opacity=".55"/><path d="m52 602 48 36m0-36-48 36" stroke-width="5" opacity=".45"/></g><circle cx="110" cy="190" r="64" fill="#f7cde0" opacity=".45"/><circle cx="312" cy="410" r="46" fill="#dec8f2" opacity=".45"/><g fill="none" stroke="#d47fa6" stroke-width="2.5" opacity=".55"><rect x="256" y="692" width="88" height="52" rx="22"/><path d="M280 718h18M289 709v18"/><circle cx="320" cy="712" r="3.5"/><circle cx="329" cy="723" r="3.5"/></g>'
    files['renako/wallpaper.svg'] = svg(body, 390, 844)
    for i, card in enumerate(('gpt', 'claude', 'gemini')):
        base = ('#7a4f78', '#685082', '#87516d')[i]
        body = f'<rect width="360" height="210" rx="23" fill="{base}"/><rect x="9" y="9" width="342" height="192" rx="17" fill="none" stroke="#ffd6e8" opacity=".55"/>'
        body += '<g stroke="#e5ccf8" stroke-linecap="round" fill="none"><path d="m262 34 56 42m0-42-56 42" stroke-width="5" opacity=".7"/><path d="m230 140 110-45" stroke-width="2" opacity=".35"/></g>'
        body += '<rect x="25" y="58" width="30" height="20" rx="5" fill="#f7d8e6"/><path d="M35 58v20M45 58v20M25 68h30" stroke="#8a5a75" fill="none"/><circle cx="315" cy="176" r="14" fill="#ffb8d6" opacity=".7"/><circle cx="331" cy="176" r="14" fill="#cdb4f6" opacity=".7"/>'
        files[f'renako/cards/{card}.svg'] = svg(body, 360, 210)
    return files

def generate():
    files = {**emma_art(), **renako_art()}
    for owner in ('soyo', 'sakiko'):
        soft = owner == 'soyo'
        bg, ink, accent = ('#e8ecdc', '#46665d', '#c2a880') if soft else ('#1c2d49', '#e2e8f4', '#9eb7dd')
        for app, glyph in GLYPHS.items():
            detail = '<path d="M75 12q-13 2-12 13 13 2 12-13M78 28q-9-3-13 4 7 7 13-4" fill="#becbb2"/>' if soft else '<path d="M13 16h70M13 20h70M13 24h70" stroke="#91a7c4" opacity=".2"/>'
            body = f'<rect x="2" y="2" width="92" height="92" rx="{26 if soft else 20}" fill="{bg}"/><rect x="7" y="7" width="82" height="82" rx="{22 if soft else 16}" fill="none" stroke="{accent}" opacity=".6"/>{detail}<g fill="none" stroke="{ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">{glyph}</g>'
            files[f'{owner}/icons/{app}.svg'] = svg(body)
        if soft:
            body = '<rect width="390" height="844" fill="#f2eedf"/><path d="M-90 590Q160 300 410 520V844H0" fill="#dce5cf"/><path d="M-50 710Q200 440 460 700V844H0" fill="#adc1a4"/><g fill="none" stroke="#6e9278" stroke-width="2" opacity=".5"><path d="M35 844Q160 560 350 390"/><path d="M117 671q-66-4-47-56 54 6 47 56M167 593q-5-67 47-63 10 51-47 63M230 519q-44-2-39-45 46-3 39 45M277 463q0-54 43-43 0 39-43 43"/></g><g fill="#fff9eb" opacity=".9"><ellipse cx="310" cy="574" rx="12" ry="29"/><ellipse cx="310" cy="574" rx="29" ry="12"/><ellipse cx="83" cy="487" rx="8" ry="20"/><ellipse cx="83" cy="487" rx="20" ry="8"/></g><g fill="#ccb481"><circle cx="310" cy="574" r="7"/><circle cx="83" cy="487" r="5"/></g><circle cx="330" cy="157" r="91" fill="#fff9eb" opacity=".5"/>'
        else:
            body = '<defs><linearGradient id="n" x2=".7" y2="1"><stop stop-color="#0c172d"/><stop offset="1" stop-color="#30486e"/></linearGradient></defs><rect width="390" height="844" fill="url(#n)"/><circle cx="309" cy="207" r="91" fill="none" stroke="#afc3e2" stroke-width=".7" opacity=".5"/><circle cx="309" cy="207" r="80" fill="none" stroke="#afc3e2" stroke-width=".5" opacity=".25"/><g stroke="#abc0df" stroke-width="1" opacity=".28">' + ''.join(f'<path d="M-40 {y}Q190 {y-140} 440 {y-20}"/>' for y in range(515, 596, 20)) + '</g><g fill="#c1d1e7" opacity=".7"><ellipse cx="267" cy="453" rx="8" ry="5" transform="rotate(-25 267 453)"/><path d="M273 451v-44l22-7v9l-18 5v37z"/></g><path d="M-30 761 390 570v274H0" fill="#1c2b47"/><g fill="#92aacd" opacity=".28">' + ''.join(f'<path d="m{x} 844 0-80 13-6v86z"/>' for x in range(18, 380, 26)) + '</g><g fill="#d9e4f5"><circle cx="69" cy="162" r="1.5"/><circle cx="110" cy="255" r="1"/><circle cx="330" cy="326" r="1.2"/></g>'
        files[f'{owner}/wallpaper.svg'] = svg(body, 390, 844)
        for i, card in enumerate(('gpt', 'claude', 'gemini')):
            palette = (('#526e60', '#795e50', '#596b7d') if soft else ('#243953', '#3c344b', '#263f58'))[i]
            pattern = '<path d="M240 180q-10-110 100-150M270 120q-60-5-35-50 50 6 35 50M300 76q-5-50 40-39-1 44-40 39" fill="none" stroke="#d6dfc8" stroke-width="2" opacity=".45"/>' if soft else '<g stroke="#acbeda" opacity=".3">' + ''.join(f'<path d="m220 {y} 140-55"/>' for y in range(85, 150, 13)) + '</g><path d="M299 110V44l32-8v54" fill="none" stroke="#aebedb" stroke-width="2"/>'
            files[f'{owner}/cards/{card}.svg'] = svg(f'<rect width="360" height="210" rx="23" fill="{palette}"/><rect x="9" y="9" width="342" height="192" rx="17" fill="none" stroke="{accent}" opacity=".65"/>{pattern}<rect x="25" y="71" width="30" height="23" rx="5" fill="#d7c59e"/><path d="M35 71v23M45 71v23M25 82h30" stroke="#8e7e5e" fill="none"/><circle cx="315" cy="176" r="14" fill="#d4c7aa" opacity=".6"/><circle cx="331" cy="176" r="14" fill="#eef0e6" opacity=".4"/>', 360, 210)
    manifest = {'schema': 'unread-city-phone-art-v1', 'source': 'Original SVG; scripts/build_phone_art.py', 'assets': {p: {'bytes': len(s.encode()), 'sha256': hashlib.sha256(s.encode()).hexdigest()} for p, s in sorted(files.items())}}
    files['manifest.json'] = json.dumps(manifest, indent=2) + '\n'
    return files

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for relative, source in generate().items():
        target = OUT / relative
        if args.check:
            if not target.exists() or target.read_text(encoding='utf-8') != source:
                raise SystemExit(f'Artwork differs: {target}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source, encoding='utf-8', newline='\n')
    print(f'{len(generate()) - 1} original SVG assets verified' if args.check else f'{len(generate()) - 1} SVG assets generated')

if __name__ == '__main__':
    main()
