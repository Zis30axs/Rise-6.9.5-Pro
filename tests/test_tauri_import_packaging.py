"""Lossless container conversion, without a new runtime or image re-encoding."""
import base64
import json
import sys
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_card import assemble_card
from build_tauri_import_card import compress_card_metadata
from card_codec import CardError, PNG_SIGNATURE, encode_card, read_chunks, write_chunk
from test_build import sample_png


class TauriImportPackagingTests(unittest.TestCase):
    def setUp(self):
        self.card = assemble_card()
        self.card["data"]["extensions"]["unknown_fixture"] = {"text": "未知字段🌏" * 1000}
        self.source = encode_card(sample_png(), self.card)

    def test_same_card_and_every_other_chunk(self):
        output, report = compress_card_metadata(self.source)
        original = list(read_chunks(self.source))
        converted = list(read_chunks(output))
        self.assertEqual(len(original), len(converted))
        count = 0
        for before, after in zip(original, converted):
            if before[0] == b"tEXt" and before[1].startswith(b"chara\0"):
                self.assertEqual(after[0], b"zTXt")
                self.assertTrue(after[1].startswith(b"chara\0\0"))
                text = zlib.decompress(after[1][7:])
                self.assertEqual(text, before[1][6:])
                self.assertEqual(json.loads(base64.b64decode(text, validate=True)), self.card)
                count += 1
            else:
                self.assertEqual(before, after)
        self.assertEqual(count, 1)
        self.assertLess(len(output), len(self.source))
        self.assertTrue(report["decompressedMetadataByteIdentical"])
        self.assertFalse(report["tauriNativeImportTested"])

    def test_unrelated_compressed_text_is_preserved(self):
        ancillary = write_chunk(b"zTXt", b"comment\0\0" + zlib.compress(b"keep this"))
        source = self.source[:-12] + ancillary + self.source[-12:]
        output, _ = compress_card_metadata(source)
        self.assertIn(ancillary, output)

    def test_ambiguous_v3_metadata_is_rejected(self):
        for kind, payload in [(b"tEXt", b"ccv3\0e30="),
                              (b"zTXt", b"ccv3\0\0" + zlib.compress(b"e30="))]:
            with self.subTest(kind=kind):
                source = self.source[:-12] + write_chunk(kind, payload) + self.source[-12:]
                with self.assertRaises(CardError):
                    compress_card_metadata(source)

    def test_duplicate_or_invalid_chara_is_rejected(self):
        for payload in (b"chara\0e30=", b"chara\0not base64!"):
            source = self.source[:-12] + write_chunk(b"tEXt", payload) + self.source[-12:]
            with self.assertRaises(CardError):
                compress_card_metadata(source)
        invalid = PNG_SIGNATURE + b"".join(
            write_chunk(kind, b"chara\0not base64!") if kind == b"tEXt" else write_chunk(kind, payload)
            for kind, payload in read_chunks(self.source)
        )
        with self.assertRaises(CardError):
            compress_card_metadata(invalid)

    def test_case_insensitive_metadata_ambiguity_is_rejected(self):
        # Tauri recognizes these keywords case-insensitively, including V3 priority.
        for keyword in (b"CHARA", b"CCV3", b"CcV3"):
            with self.subTest(keyword=keyword):
                source = self.source[:-12] + write_chunk(b"tEXt", keyword + b"\0e30=") + self.source[-12:]
                with self.assertRaises(CardError):
                    compress_card_metadata(source)

    def test_crc_corruption_and_truncation_are_rejected(self):
        corrupt = bytearray(self.source)
        corrupt[-1] ^= 1
        for source in (bytes(corrupt), self.source[:-8]):
            with self.assertRaises(CardError):
                compress_card_metadata(source)


if __name__ == "__main__":
    unittest.main()
