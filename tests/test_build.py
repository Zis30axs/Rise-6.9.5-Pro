import sys
import struct
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_card import assemble_card
from card_codec import PNG_SIGNATURE, encode_card, extract_card, read_chunks, write_chunk


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
        self.assertEqual(len(card["data"]["character_book"]["entries"]), 2)

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
