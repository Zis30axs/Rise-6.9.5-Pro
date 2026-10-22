import json
import sys
import struct
import unittest
import zlib
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_card import assemble_card
from card_codec import CardError, PNG_SIGNATURE, encode_card, extract_card, read_chunks, write_chunk


def sample_png():
    """Generate a 1x1 test fixture only. This is not the artwork for the card."""
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\x11\x22\x33")
    return (PNG_SIGNATURE + write_chunk(b"IHDR", ihdr) + write_chunk(b"IDAT", idat)
            + write_chunk(b"IEND", b""))


class CardBuildTests(unittest.TestCase):
    def test_card_assembly(self):
        card = assemble_card()
        self.assertEqual(card["spec"], "chara_card_v2")
        # Core, Sakiko, Majo (14 residents + group), MyGO and Ave Mujica.
        entries = card["data"]["character_book"]["entries"]
        self.assertEqual(len(entries), 31)
        for entry in entries:
            self.assertIsInstance(entry.get("comment"), str)
            self.assertTrue(entry["comment"].strip(), entry.get("name"))
        titles = {entry["comment"] for entry in entries}
        self.assertIn("樱羽艾玛", titles)
        self.assertIn("丰川祥子 · 独立人物", titles)
        self.assertIn("长崎素世", titles)

    def test_missing_comment_uses_name(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src/worldbook").mkdir(parents=True)
            (root / "src/card.json").write_text(
                (ROOT / "src/card.json").read_text(encoding="utf-8"), encoding="utf-8"
            )
            (root / "src/worldbook/example.json").write_text(
                json.dumps({"entries": [
                    {"name": "测试条目", "keys": ["测试"], "content": "内容"},
                    {"name": "空备注", "comment": "", "keys": ["备忘"], "content": "内容"}
                ]}, ensure_ascii=False), encoding="utf-8"
            )
            entries = assemble_card(root)["data"]["character_book"]["entries"]
            self.assertEqual([e["comment"] for e in entries], ["测试条目", "空备注"])

    def test_missing_comment_and_name_is_rejected(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src/worldbook").mkdir(parents=True)
            (root / "src/card.json").write_text(
                (ROOT / "src/card.json").read_text(encoding="utf-8"), encoding="utf-8"
            )
            (root / "src/worldbook/invalid.json").write_text(
                json.dumps({"entries": [{"keys": ["测试"], "content": "内容"}]}, ensure_ascii=False), encoding="utf-8"
            )
            with self.assertRaisesRegex(CardError, "缺少标题"):
                assemble_card(root)

    def test_png_round_trip(self):
        card = assemble_card()
        image = encode_card(sample_png(), card)
        self.assertEqual(card, extract_card(image))
        self.assertEqual(sum(k == b"tEXt" and p.startswith(b"chara\x00") for k,p in read_chunks(image)), 1)

    def test_reembed_replaces_prior_card(self):
        card = assemble_card()
        image = encode_card(sample_png(), card)
        image2 = encode_card(image, card)
        self.assertEqual(card, extract_card(image2))
        self.assertEqual(sum(k == b"tEXt" and p.startswith(b"chara\x00") for k,p in read_chunks(image2)), 1)


if __name__ == "__main__":
    unittest.main()
