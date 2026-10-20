"""Lite: deterministic extraction, data-only ZIP, browser-loader contract."""
from __future__ import annotations
import base64
import hashlib
from pathlib import Path
import sys
import unittest
from zipfile import ZipFile
from io import BytesIO
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_lite_release as lite


class LiteExtractionTests(unittest.TestCase):
    def test_known_18_assets_round_trip_into_stored_zip(self):
        loader = (lite.ROOT / 'scripts/lite_asset_loader.js').read_text('utf-8')
        original = {}
        literals = []
        for index in range(18):
            raw = hashlib.shake_256(str(index).encode('ascii')).digest(900_000)
            encoded = base64.b64encode(raw).decode('ascii')
            original[lite.digest(raw)] = raw
            literals.append('const a' + str(index) + '="data:image/webp;base64,' + encoded + '";')
        source = '/* UNREAD_CITY_IMMERSIVE_BUNDLE */\n' + '\n'.join(literals)
        with self.assertRaisesRegex(ValueError, 'extraction too small'):
            # Real release has a 20 MB gate: synthetic 16.2 MB input is too small.
            lite.externalize(source, loader)
        # Exercise full output without rewriting the release's strict lower bound.
        previous = lite.MIN_REMOVED_BYTES
        try:
            lite.MIN_REMOVED_BYTES = 15_000_000
            script, archive, report = lite.externalize(source, loader)
        finally:
            lite.MIN_REMOVED_BYTES = previous
        self.assertEqual(report['assets'], 18)
        self.assertEqual(report['extractedBytes'], 16_200_000)
        self.assertNotIn('data:image/webp;base64,', script)
        self.assertIn('if (await __uc_lite_init__())', script)
        self.assertIn('__UC_LITE_ASSET__(', script)
        with ZipFile(BytesIO(archive)) as zipped:
            self.assertEqual(len(zipped.namelist()), 19)
            for digest, raw in original.items():
                self.assertEqual(zipped.read('assets/' + digest), raw)
                self.assertEqual(zipped.getinfo('assets/' + digest).compress_type, 0)

    def test_rejects_non_bundle(self):
        with self.assertRaisesRegex(ValueError, 'production IIFE'):
            lite.externalize('not a card', '')


if __name__ == '__main__':
    unittest.main()
