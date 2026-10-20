"""Dependency-free recovery checks; no real phone, browser or production bundle."""
from __future__ import annotations

import base64
import contextlib
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from card_codec import CardError, PNG_SIGNATURE, encode_card, extract_card, read_chunks, write_chunk
import build_tauri_import_card as packer
from release_budget import TAURI_RELEASE_LIMIT_BYTES, check_tauri_release_size

BOOK_PATH = ROOT / "src/worldbook/toyokawa-sakiko.json"


def fixture_card():
    # Match build_card.assemble_card's entry defaults without executing a bundle.
    book = json.loads(BOOK_PATH.read_text(encoding="utf-8"))
    rows = [{**row, "insertion_order": i} for i, row in enumerate(book["entries"])]
    return {
        "spec": "chara_card_v2", "spec_version": "2.0",
        "data": {
            "name": "recovery-test-only", "description": "", "personality": "",
            "scenario": "", "first_mes": "", "mes_example": "",
            "extensions": {"unread_city": {"fixture": True}},
            "character_book": {"entries": rows},
        },
    }


def fixture_png():
    # A complete 1x1 RGBA PNG fixture, never presented as a release.
    return (PNG_SIGNATURE
            + write_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
            + write_chunk(b"tEXt", b"Comment\0keep-this")
            + write_chunk(b"IDAT", zlib.compress(b"\0\xff\xff\xff\xff"))
            + write_chunk(b"IEND", b""))


def restore_normal_png(compressed):
    result = bytearray(PNG_SIGNATURE)
    for kind, payload in read_chunks(compressed):
        if kind == b"zTXt" and payload.startswith(b"chara\0\0"):
            kind, payload = b"tEXt", b"chara\0" + zlib.decompress(payload[7:])
        result.extend(write_chunk(kind, payload))
    return bytes(result)


class BudgetTests(unittest.TestCase):
    def test_decimal_limit(self):
        self.assertEqual(TAURI_RELEASE_LIMIT_BYTES, 50_000_000)

    def test_last_allowed_byte(self):
        report = check_tauri_release_size(49_999_999)
        self.assertTrue(report["releaseSizePassed"])
        self.assertEqual(report["remainingBytesBeforeLimit"], 1)

    def test_at_or_over_limit_rejected(self):
        for size in [50_000_000, 50_000_001, 50 * 1024 * 1024]:
            with self.subTest(size=size), self.assertRaises(CardError):
                check_tauri_release_size(size)

    def test_invalid_byte_counts(self):
        for size in [0, -1, True, False, 1.5, float("inf"), None, "1"]:
            with self.subTest(size=size), self.assertRaises(CardError):
                check_tauri_release_size(size)


class WorldbookTests(unittest.TestCase):
    def setUp(self):
        self.book = json.loads(BOOK_PATH.read_text(encoding="utf-8"))
        self.rows = self.book["entries"]

    def test_four_named_entries_and_unique_stable_ids(self):
        self.assertEqual(len(self.rows), 4)
        ids = [row["extensions"]["unread_city"]["id"] for row in self.rows]
        self.assertEqual(len(ids), len(set(ids)))
        for row in self.rows:
            self.assertTrue(row["enabled"])
            self.assertIsInstance(row["keys"], list)
            self.assertIsInstance(row["constant"], bool)
            self.assertTrue(row["content"].strip())

    def test_family_reconciliation_is_not_swapped_for_soyo_reconciliation(self):
        anchor = self.rows[0]
        self.assertTrue(anchor["constant"])
        self.assertIn("祥子与丰川家族", anchor["content"])
        self.assertIn("不得偷换成仅仅祥子和素世和好", anchor["content"])
        self.assertIn("soyo", anchor["content"])
        self.assertIn("sakiko", anchor["content"])
        self.assertIn("没有另行设定两人的恋爱关系", anchor["content"])

    def test_canon_sources_are_separate_from_authored_continuation(self):
        profile = self.rows[1]
        self.assertIn("【原作背景】", profile["content"])
        self.assertIn("【本卡演绎】", profile["content"])
        refs = profile["extensions"]["unread_city"]["sources"]
        self.assertEqual(len(refs), 2)
        self.assertTrue(all(url.startswith("https://anime.bang-dream.com/") for url in refs))
        self.assertIn("不是原作结局断言", self.rows[0]["content"])

    def test_lore_does_not_claim_unbuilt_navigation_or_recovered_art(self):
        content = self.rows[3]["content"]
        self.assertIn("导航与素材接线完成前", content)
        self.assertIn("不得叙述为已乘车", content)
        self.assertIn("不是同一地点", content)

    def test_worldbook_survives_v2_png_roundtrip(self):
        card = fixture_card()
        self.assertEqual(extract_card(encode_card(fixture_png(), card)), card)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.source = encode_card(fixture_png(), fixture_card())

    def test_compression_keeps_every_original_chunk_byte(self):
        compressed, report = packer.compress_card_metadata(self.source)
        self.assertEqual(restore_normal_png(compressed), self.source)
        self.assertEqual(report["sha256"], hashlib.sha256(compressed).hexdigest())
        self.assertEqual(report["bytes"], len(compressed))
        self.assertEqual(report["releaseLimitBytesExclusive"], 50_000_000)
        self.assertTrue(report["releaseSizePassed"])
        self.assertFalse(report["embeddedScriptChanged"])
        self.assertFalse(report["tauriNativeImportTested"])

    def test_gate_uses_full_output_not_metadata_size(self):
        real_check = check_tauri_release_size
        seen = []
        def record(size):
            seen.append(size)
            return real_check(size)
        with patch.object(packer, "check_tauri_release_size", side_effect=record):
            compressed, report = packer.compress_card_metadata(self.source)
        self.assertEqual(seen, [len(compressed)])
        self.assertGreater(seen[0], report["compressedMetadataBytes"])

    def test_crc_failure_rejected_before_budget_check(self):
        damaged = bytearray(self.source)
        damaged[-1] ^= 1
        with patch.object(packer, "check_tauri_release_size") as gate:
            with self.assertRaises(CardError):
                packer.compress_card_metadata(bytes(damaged))
            gate.assert_not_called()

    def test_double_compression_is_rejected(self):
        compressed, _ = packer.compress_card_metadata(self.source)
        with self.assertRaises(CardError):
            packer.compress_card_metadata(compressed)

    def run_cli(self, source, output):
        with patch.object(sys, "argv", ["build_tauri_import_card.py",
                                      "--source", str(source), "--output", str(output)]):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                packer.main()

    def test_cli_writes_pair_with_size_and_sha_report(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/"normal.png", Path(folder)/"tauri.png"
            source.write_bytes(self.source)
            self.run_cli(source, output)
            report = json.loads(output.with_suffix(".verification.json").read_text(encoding="utf-8"))
            self.assertEqual(report["bytes"], output.stat().st_size)
            self.assertEqual(report["sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(source.read_bytes(), self.source)

    def test_budget_failure_creates_neither_output_nor_report(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/"normal.png", Path(folder)/"new"/"tauri.png"
            source.write_bytes(self.source)
            with patch.object(packer, "check_tauri_release_size",
                              side_effect=CardError("over budget")):
                with self.assertRaises(SystemExit):
                    self.run_cli(source, output)
            self.assertFalse(output.exists())
            self.assertFalse(output.with_suffix(".verification.json").exists())
            self.assertFalse(output.parent.exists())
            self.assertEqual(source.read_bytes(), self.source)

    def test_existing_output_or_report_is_not_overwritten(self):
        for existing in ["tauri.png", "tauri.verification.json"]:
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as folder:
                source, output = Path(folder)/"normal.png", Path(folder)/"tauri.png"
                source.write_bytes(self.source)
                protected = Path(folder)/existing
                protected.write_bytes(b"keep")
                with self.assertRaises(SystemExit):
                    self.run_cli(source, output)
                self.assertEqual(protected.read_bytes(), b"keep")
                self.assertEqual(source.read_bytes(), self.source)

    def test_source_cannot_be_its_own_output(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)/"normal.png"
            source.write_bytes(self.source)
            with self.assertRaises(SystemExit):
                self.run_cli(source, source)
            self.assertEqual(source.read_bytes(), self.source)


if __name__ == "__main__":
    unittest.main()
