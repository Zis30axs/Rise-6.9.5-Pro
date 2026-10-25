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
        self.assertEqual(len(entries), 78)
        for entry in entries:
            self.assertIsInstance(entry.get("comment"), str)
            self.assertTrue(entry["comment"].strip(), entry.get("name"))
        titles = {entry["comment"] for entry in entries}
        self.assertIn("樱羽艾玛", titles)
        self.assertIn("丰川祥子", titles)
        self.assertIn("长崎素世", titles)
        self.assertIn("甘织玲奈子", titles)
        self.assertIn("王冢真唯", titles)

    def test_story_arcs_are_compact_and_have_character_relationships(self):
        entries = assemble_card()["data"]["character_book"]["entries"]
        by_title = {entry["comment"]: entry for entry in entries}
        synopses = [
            "邦邦前史 · CRYCHIC 的盛夏与猝死",
            "邦邦前史 · MyGO!!!!! 的迷途与重生",
            "邦邦前史 · Ave Mujica 的假面与救赎",
            "魔裁前史 · 孤岛囚笼与残酷规则",
            "魔裁前史 · 三轮回溯与大魔女真相",
            "わたなれ前史 · 高中出道与天台赌约",
            "わたなれ前史 · 纱月的报复约会",
            "わたなれ前史 · 紫阳花的离家出走小旅行",
            "わたなれ前史 · 香穗的秘密与紫阳花告白",
            "わたなれ前史 · 球技大会与三人恋人",
            "わたなれ前史 · 遥奈停学与国中同窗会",
            "わたなれ前史 · 露西婚约与纱月飓风",
        ]
        for title in synopses:
            with self.subTest(title=title):
                self.assertIn(title, by_title)
                self.assertGreaterEqual(len(by_title[title]["content"]), 70)
                self.assertLessEqual(len(by_title[title]["content"]), 500)
                self.assertTrue(by_title[title]["keys"])
        for title in [
            "魔裁旧关系 · 牢屋敷同室组合",
            "魔裁旧关系 · 艾玛、希罗与月代雪",
            "魔裁旧关系 · 亚里沙、雪莉、汉娜与可可",
            "乐队人物关系 · 高松灯",
            "乐队人物关系 · 千早爱音",
            "世界基调与时间线坐标",
            "视角边界与叙事铁律（Anti-Omniscience）",
            "魔裁群像的共同生活",
            "わたなれ人物关系 · 玲奈子、真唯与紫阳花",
            "わたなれ人物关系 · 纱月、香穗与五人组的平衡",
        ]:
            self.assertIn(title, by_title)
        self.assertTrue(by_title["世界基调与时间线坐标"]["constant"])
        self.assertTrue(by_title["视角边界与叙事铁律（Anti-Omniscience）"]["constant"])
        self.assertIn("连同月代雪都活了下来", by_title["魔裁群像的共同生活"]["content"])
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

    def test_watanare_person_ids_remain_stable(self):
        source = json.loads((ROOT / "src/worldbook/watanare-residents.json").read_text(encoding="utf-8"))
        identities = [entry["extensions"]["personId"] for entry in source["entries"]
                      if entry["extensions"].get("personId")]
        self.assertEqual(len(identities), 20)
        self.assertEqual(len(set(identities)), 20)
        for pid in ("watanare-renako", "watanare-mai", "watanare-ajisai", "watanare-satsuki", "watanare-kaho",
                    "watanare-haruna", "watanare-miyoko", "watanare-hiroki", "watanare-kippei", "watanare-koto-mother"):
            self.assertIn(pid, identities)

    def test_character_identity_clothing_voice_and_relationships(self):
        fields = [
            ("身份：", "【基础信息】"),
            ("外观与着装：", "【外貌与穿搭细节】"),
            ("性格：", "【核心心理与性格肌理】"),
            ("说话方式：", "【语言风格与微表情】"),
            ("人物关系：", "【人际锚点】"),
        ]
        sources = {
            "majo-residents.json": 14,
            "bang-dream-canon.json": 10,
            "watanare-residents.json": 20,
        }
        for filename, expected in sources.items():
            with self.subTest(file=filename):
                book = json.loads((ROOT / "src/worldbook" / filename).read_text(encoding="utf-8"))
                entries = [e for e in book["entries"] if (
                    bool(e.get("extensions", {}).get("personId"))
                    if filename in ("majo-residents.json", "watanare-residents.json") else True
                )]
                self.assertEqual(len(entries), expected)
                for entry in entries:
                    with self.subTest(character=entry["name"]):
                        content = entry["content"]
                        for alternatives in fields:
                            self.assertTrue(any(label in content for label in alternatives), entry["name"])
                        self.assertTrue(entry["comment"].strip())
                        self.assertTrue(entry["keys"])
                        self.assertGreater(len(content), 280)
                        for phrase in ["不代表官方", "非原作", "本卡作者设定", "游戏原型"]:
                            self.assertNotIn(phrase, content)
                        if filename == "bang-dream-canon.json":
                            self.assertFalse(entry.get("extensions", {}).get("personId"))
        majo = json.loads((ROOT / "src/worldbook/majo-residents.json").read_text(encoding="utf-8"))
        emma = next(e for e in majo["entries"] if e.get("extensions", {}).get("personId") == "majo-emma")
        anan = next(e for e in majo["entries"] if e.get("extensions", {}).get("personId") == "majo-anan")
        self.assertIn("中文语境下固定自称「我」", emma["content"])
        self.assertIn("希罗酱", emma["content"])
        self.assertIn("小狗", emma["content"])
        self.assertIn("垂头丧气", emma["content"])
        self.assertIn("浅粉色樱花扣宽松针织开衫", emma["content"])
        self.assertIn("自称「吾辈」", anan["content"])
        self.assertNotIn("わがはい", anan["content"])
        residents = {e.get("extensions", {}).get("personId"): e for e in majo["entries"]}
        self.assertIn("第一人称保留「大叔」", residents["majo-milia"]["content"])
        self.assertIn("哟♪", residents["majo-noa"]["content"])
        self.assertIn("彩色挑染", residents["majo-noa"]["content"])
        self.assertIn("汉娜桑", residents["majo-sherry"]["content"])
        self.assertIn("雪莉桑", residents["majo-hanna"]["content"])
        self.assertIn("「ですわ」式大小姐腔", residents["majo-hanna"]["content"])
        self.assertIn("第一人称自然使用「我」", residents["majo-yuki"]["content"])
        self.assertEqual(emma["extensions"]["home"], "emma-yuki-home")

    def test_all_cast_members_have_individual_social_nuances(self):
        majo = json.loads((ROOT / "src/worldbook/majo-residents.json").read_text(encoding="utf-8"))
        band = json.loads((ROOT / "src/worldbook/bang-dream-canon.json").read_text(encoding="utf-8"))
        watanare = json.loads((ROOT / "src/worldbook/watanare-residents.json").read_text(encoding="utf-8"))
        residents = [entry for entry in majo["entries"] if entry.get("extensions", {}).get("personId")]
        musicians = band["entries"]
        watanare_residents = [entry for entry in watanare["entries"] if entry.get("extensions", {}).get("personId")]
        self.assertEqual((len(residents), len(musicians), len(watanare_residents)), (14, 10, 20))
        for entry in [*residents, *musicians, *watanare_residents]:
            with self.subTest(character=entry["name"]):
                content = entry["content"]
                self.assertIn("\n相处细节：", content)
                section = content.split("\n相处细节：", 1)[1].split("\n", 1)[0]
                self.assertGreater(len(section), 60)
                self.assertNotIn("不代表官方", content)
                self.assertNotIn("社区印象：", content)
                self.assertTrue("\n人物关系：" in content or "\n【人际锚点】" in content)
                self.assertTrue("\n说话方式：" in content or "\n【语言风格与微表情】" in content)
        emma = next(e for e in residents if e.get("extensions", {}).get("personId") == "majo-emma")
        anon = next(e for e in musicians if e["name"] == "千早爱音")
        haruna = next(e for e in watanare_residents if e.get("extensions", {}).get("personId") == "watanare-haruna")
        mai = next(e for e in watanare_residents if e.get("extensions", {}).get("personId") == "watanare-mai")
        self.assertIn("小狗", emma["content"])
        self.assertIn("爱音酱", anon["content"])
        self.assertIn("阳角版的玲奈子", haruna["content"])
        self.assertIn("智商归零", mai["content"])
        self.assertIn("金毛", mai["content"])
        renako = next(e for e in watanare_residents if e.get("extensions", {}).get("personId") == "watanare-renako")
        self.assertIn("金毛", renako["content"])

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
