"""Synthetic protocol fixtures; these tests are not approval of any real artwork."""
import base64
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from PIL import Image, ImageDraw, PngImagePlugin
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from verify_downtown_art import (SPRITES, BACKGROUNDS, LIMIT, check_budget,
                                  extract_v2, validate_assets, verify_embedded_card)


class ArtGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        entries = []
        for index, key in enumerate(sorted(SPRITES | BACKGROUNDS)):
            sprite = key in SPRITES
            size = (384, 768) if sprite else (960, 540)
            image = Image.new('RGBA', size, (0, 0, 0, 0) if sprite else (30 + index * 5, 50, 100, 255))
            ImageDraw.Draw(image).rectangle((100, 40, 280, 520), fill=(80, 60 + index * 7, 140, 255))
            file = self.root / f'{key}.webp'
            image.save(file, format='WEBP', lossless=True)
            entries.append({'id': key, 'path': file.name, 'size': list(size),
                            'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                            **({'anchor': [192, 760]} if sprite else {})})
        self.manifest = {'schemaVersion': 1, 'reviewStatus': 'approved', 'assets': entries}
        self.manifest_path = self.root / 'manifest.json'
        self.save_manifest()

    def save_manifest(self):
        self.manifest_path.write_text(json.dumps(self.manifest))

    def make_card(self, omit=None):
        sources = [base64.b64encode((self.root / item['path']).read_bytes()).decode()
                   for item in self.manifest['assets'] if item['id'] != omit]
        script = 'const fixtures=' + json.dumps(['data:image/webp;base64,' + value for value in sources])
        card = {'spec': 'chara_card_v2', 'spec_version': '2.0',
                'data': {'extensions': {'tavern_helper': {'scripts': [{'content': script}]}}}}
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text('chara', base64.b64encode(json.dumps(card).encode()).decode(), zip=True)
        path = self.root / 'card.png'
        Image.new('RGB', (4, 4)).save(path, pnginfo=metadata)
        return path

    def test_complete_matrix_and_real_embedded_bytes(self):
        report = validate_assets(self.root, self.manifest_path)
        self.assertEqual(report['assetCount'], 18)
        result = verify_embedded_card(self.make_card(), report)
        self.assertEqual(result['embeddedAssetCount'], 18)
        self.assertLess(result['bytes'], LIMIT)

    def test_pending_review_blocks_release(self):
        self.manifest['reviewStatus'] = 'pending'; self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'not reviewed'):
            validate_assets(self.root, self.manifest_path)

    def test_one_missing_expression_blocks_release(self):
        self.manifest['assets'].pop(); self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'Exactly 12'):
            validate_assets(self.root, self.manifest_path)

    def test_copied_expression_cannot_pass_as_a_second_image(self):
        first, second = self.manifest['assets'][:2]
        second['path'] = first['path']; second['sha256'] = first['sha256']; self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'reused'):
            validate_assets(self.root, self.manifest_path)

    def test_sha_mismatch_blocks_release(self):
        self.manifest['assets'][0]['sha256'] = '0' * 64; self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            validate_assets(self.root, self.manifest_path)

    def test_opaque_contact_sheet_is_not_a_sprite(self):
        item = next(item for item in self.manifest['assets'] if item['id'] in SPRITES)
        path = self.root / item['path']
        Image.new('RGB', tuple(item['size']), (200, 100, 50)).save(path, format='WEBP', lossless=True)
        item['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest(); self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'transparent background'):
            validate_assets(self.root, self.manifest_path)

    def test_path_escape_rejected(self):
        self.manifest['assets'][0]['path'] = '../outside.webp'; self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'outside asset root'):
            validate_assets(self.root, self.manifest_path)

    def test_wrong_anchor_blocks_release(self):
        next(item for item in self.manifest['assets'] if item['id'] in SPRITES)['anchor'] = [190, 760]
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'share canvas'):
            validate_assets(self.root, self.manifest_path)

    def test_old_small_card_without_new_images_is_not_accepted(self):
        report = validate_assets(self.root, self.manifest_path)
        with self.assertRaisesRegex(ValueError, 'actual new image bytes'):
            verify_embedded_card(self.make_card(omit='sakiko_home_sad'), report)

    def test_strict_decimal_limit(self):
        check_budget(49_999_999)
        for size in (50_000_000, 52_428_800, 0, -1, True):
            with self.assertRaises(ValueError):
                check_budget(size)

    def test_corrupt_png_rejected(self):
        data = bytearray(self.make_card().read_bytes()); data[20] ^= 1
        with self.assertRaisesRegex(ValueError, 'CRC'):
            extract_v2(bytes(data))


if __name__ == '__main__':
    unittest.main()
