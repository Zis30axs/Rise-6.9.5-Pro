"""Meaningful packaging regressions without invoking a browser or external tools."""
import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_card import BUNDLE_MARKER, IMMERSIVE_SCRIPT_ID, NOTES_START, assemble_card
from card_codec import CardError, encode_card, extract_card, read_chunks
from test_build import sample_png


class FrontendPackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "src").mkdir()
        shutil.copyfile(ROOT / "src/card.json", self.root / "src/card.json")
        shutil.copytree(ROOT / "src/worldbook", self.root / "src/worldbook")
        self.bundle = self.root / "immersive-shell.js"
        self.content = f"/* {BUNDLE_MARKER} */\n(()=>{{const fixture = " + json.dumps("内嵌 Vue / CSS / 资源" * 30) + ";window.fixture = fixture;})();\n"
        self.bundle.write_text(self.content, encoding="utf-8")

    def read_source(self):
        return json.loads((self.root / "src/card.json").read_text(encoding="utf-8"))

    def write_source(self, card):
        (self.root / "src/card.json").write_text(json.dumps(card, ensure_ascii=False), encoding="utf-8")

    def test_bundle_survives_png_round_trip_and_source_is_unchanged(self):
        source_before = (self.root / "src/card.json").read_bytes()
        card = assemble_card(self.root, self.bundle)
        image = encode_card(sample_png(), card)
        extracted = extract_card(image)
        self.assertEqual(extracted, card)
        script = extracted["data"]["extensions"]["tavern_helper"]["scripts"][0]
        self.assertEqual(script["id"], IMMERSIVE_SCRIPT_ID)
        self.assertEqual(script["content"], self.content)
        self.assertTrue(script["enabled"])
        self.assertEqual(script["button"]["buttons"], [
            {"name": "进入未读之城", "visible": True},
            {"name": "恢复原生界面", "visible": True},
        ])
        self.assertEqual(script["export_with"], {"data": False, "button": True})
        self.assertFalse(extracted["data"]["extensions"]["unread_city"]["immersive"]["real_import_verified"])
        self.assertEqual((self.root / "src/card.json").read_bytes(), source_before)
        self.assertEqual(sum(kind == b"tEXt" and payload.startswith(b"chara\x00") for kind, payload in read_chunks(image)), 1)

    def test_rebuild_preserves_unknown_fields_and_replaces_only_our_script(self):
        source = self.read_source()
        extensions = source["data"]["extensions"]
        other_script = {"type": "script", "id": "someone-elses-script", "content": "keep me", "custom": {"a": [1, 2]}}
        unknown_extension = {"future": {"keep": True}}
        extensions["some_future_extension"] = copy.deepcopy(unknown_extension)
        extensions["unread_city"]["my_setting"] = "keep"
        extensions["unread_city"]["immersive"] = {"my_setting": "keep immersive"}
        extensions["tavern_helper"] = {
            "custom": {"keep": True},
            "scripts": [other_script, {"id": IMMERSIVE_SCRIPT_ID, "content": "old", "custom": 123, "data": {"setting": True}}, {"id": IMMERSIVE_SCRIPT_ID, "content": "stale duplicate"}],
        }
        self.write_source(source)
        first = assemble_card(self.root, self.bundle)
        self.write_source(first)
        second = assemble_card(self.root, self.bundle)
        self.assertEqual(first, second)
        extensions = second["data"]["extensions"]
        self.assertEqual(extensions["some_future_extension"], unknown_extension)
        self.assertEqual(extensions["unread_city"]["my_setting"], "keep")
        self.assertEqual(extensions["unread_city"]["immersive"]["my_setting"], "keep immersive")
        self.assertEqual(extensions["tavern_helper"]["custom"], {"keep": True})
        scripts = extensions["tavern_helper"]["scripts"]
        self.assertEqual(len(scripts), 2)
        self.assertEqual(scripts[0], other_script)
        self.assertEqual(scripts[1]["custom"], 123)
        self.assertEqual(scripts[1]["data"], {"setting": True})
        self.assertEqual(scripts[1]["content"], self.content)
        self.assertEqual(second["data"]["creator_notes"].count(NOTES_START), 1)
        repeated_image = encode_card(encode_card(sample_png(), first), second)
        self.assertEqual(extract_card(repeated_image), second)

    def test_without_frontend_keeps_base_card_extensions_and_notes(self):
        source = self.read_source()
        assembled = assemble_card(self.root)
        self.assertEqual(assembled["data"]["extensions"], source["data"]["extensions"])
        self.assertEqual(assembled["data"]["creator_notes"], source["data"]["creator_notes"])

    def test_bad_frontend_files_are_rejected(self):
        with self.assertRaisesRegex(CardError, "没有找到前端构建产物"):
            assemble_card(self.root, self.root / "missing.js")
        cases = [
            ("  \n", "为空"),
            ("console.log('source, not a built bundle');", "完整构建产物"),
            (f"/* {BUNDLE_MARKER} */\nexport const source = '" + "x" * 400 + "';", "ES 模块"),
            (f"<!doctype html><!-- {BUNDLE_MARKER} -->" + "x" * 400, "HTML"),
        ]
        for content, message in cases:
            with self.subTest(message=message):
                self.bundle.write_text(content, encoding="utf-8")
                with self.assertRaisesRegex(CardError, message):
                    assemble_card(self.root, self.bundle)

    def test_conflicting_extension_types_are_not_silently_overwritten(self):
        original = self.read_source()
        cases = [
            {"tavern_helper": "unknown format"},
            {"tavern_helper": {"scripts": {"unknown": True}}},
            {"unread_city": "unknown format"},
        ]
        for extensions in cases:
            with self.subTest(extensions=extensions):
                source = copy.deepcopy(original)
                source["data"]["extensions"] = extensions
                self.write_source(source)
                with self.assertRaises(CardError):
                    assemble_card(self.root, self.bundle)


if __name__ == "__main__":
    unittest.main()
