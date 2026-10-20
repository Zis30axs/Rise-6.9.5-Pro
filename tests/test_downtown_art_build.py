import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_downtown_art import build_pack
import test_downtown_art_gate as fixtures


class ArtBuildTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ArtGateTests(methodName='runTest')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.output = self.fixture.root / 'generated/downtown-art.ts'

    def build(self, **kwargs):
        return build_pack(self.fixture.root, self.fixture.manifest_path, self.output, **kwargs)

    def test_approved_pack_embeds_exactly_eighteen_real_files(self):
        report = self.build(require_ready=True)
        self.assertTrue(report['ready'])
        self.assertEqual(report['assetCount'], 18)
        text = self.output.read_text()
        self.assertEqual(text.count('data:image/webp;base64,'), 18)
        self.assertNotIn('https://', text)

    def test_pending_preview_emits_no_placeholder_images(self):
        self.fixture.manifest['reviewStatus'] = 'pending'; self.fixture.save_manifest()
        report = self.build()
        self.assertFalse(report['ready'])
        self.assertEqual(report['assetCount'], 0)
        self.assertNotIn('data:image/', self.output.read_text())

    def test_release_rejects_pending_manifest(self):
        self.fixture.manifest['reviewStatus'] = 'pending'; self.fixture.save_manifest()
        with self.assertRaisesRegex(ValueError, 'release blocked'):
            self.build(require_ready=True)
        self.assertFalse(self.output.exists())

    def test_invalid_new_art_does_not_destroy_previous_output(self):
        self.build(); before = self.output.read_bytes()
        self.fixture.manifest['assets'][0]['sha256'] = '0' * 64; self.fixture.save_manifest()
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.build()
        self.assertEqual(self.output.read_bytes(), before)

    def test_repeat_build_is_byte_identical(self):
        first = self.build(); data = self.output.read_bytes()
        second = self.build()
        self.assertEqual(first, second)
        self.assertEqual(data, self.output.read_bytes())

    def test_removing_approval_cannot_leave_stale_approved_images_in_preview(self):
        self.build()
        self.fixture.manifest['reviewStatus'] = 'pending'; self.fixture.save_manifest()
        self.build()
        self.assertNotIn('data:image/', self.output.read_text())


if __name__ == '__main__':
    unittest.main()
