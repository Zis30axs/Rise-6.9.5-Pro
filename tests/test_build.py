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
        # Core, Sakiko, Majo, MyGO / Ave Mujica and story arcs.
        entries = card["data"]["character_book"]["entries"]
        self.assertEqual(len(entries), 39)
        for entry in entries:
            self.assertIsInstance(entry.get("comment"), str)
            self.assertTrue(entry["comment"].strip(), entry.get("name"))
        titles = {entry["comment"] for entry in entries}
        self.assertIn("樱羽艾玛", titles)
        self.assertIn("丰川祥子 · 独立人物", titles)
        self.assertIn("长崎素世", titles)

    def test_story_arcs_are_compact_and_have_character_relationships(self):
        entries = assemble_card()["data"]["character_book"]["entries"]
        by_title = {entry["comment"]: entry for entry in entries}
        synopses = [
            "魔法少女ノ魔女裁判 · 旧日审判全貌",
            "It's MyGO!!!!! · 成团与破裂",
            "Ave Mujica · 假面落幕与重生",
        ]
        for title in synopses:
            with self.subTest(title=title):
                self.assertIn(title, by_title)
                self.assertGreaterEqual(len(by_title[title]["content"]), 500)
                self.assertLessEqual(len(by_title[title]["content"]), 600)
                self.assertTrue(by_title[title]["keys"])
        for title in [
            "魔裁 · 十四人旧关系",
            "MyGO · 旧团新团关系",
            "Ave Mujica · 与旧团的关系",
            "爱音等人的后续登场",
            "三条人生的共同时间线",
        ]:
            self.assertIn(title, by_title)
        self.assertTrue(by_title["三条人生的共同时间线"]["constant"])
        self.assertIn("十三名囚人和月代雪都活了下来", by_title["三条人生的共同时间线"]["content"])
        for entry in entries:
            for phrase in ["不代表官方", "非原作已证实", "本卡作者设定", "游戏原型"]:
                self.assertNotIn(phrase, entry["content"], entry["comment"])
                self.assertNotIn(phrase, entry["comment"])

    def test_majo_person_ids_remain_stable(self):
        source = json.loads((ROOT / "src/worldbook/majo-residents.json").read_text(encoding="utf-8"))
        identities = [entry["extensions"]["personId"] for entry in source["entries"]
                      if entry["extensions"].get("personId")]
        self.assertEqual(len(identities), 14)
        self.assertEqual(len(set(identities)), 14)
        self.assertIn("majo-emma", identities)

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
