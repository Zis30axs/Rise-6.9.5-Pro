"""Check the assembled card, so source-only corrections cannot disappear in packaging."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_card import assemble_card


class SchoolTimelinePackagingTests(unittest.TestCase):
    def test_packaged_profiles_separate_history_and_current_schooling(self):
        entries = assemble_card()['data']['character_book']['entries']
        by_name = {entry['comment']: entry for entry in entries}
        for name in ['长崎素世', '丰川祥子', '樱羽艾玛']:
            with self.subTest(name=name):
                content = by_name[name]['content']
                self.assertIn('当前校园安排：', content)
                self.assertIn('正式学籍尚未确认', content)
                self.assertIn('2025年9月1日', content)
        for name in ['长崎素世', '丰川祥子', '高松灯', '千早爱音', '椎名立希',
                     '要乐奈', '若叶睦', '三角初华', '八幡海铃']:
            with self.subTest(history=name):
                self.assertIn('原作成团时期学籍', by_name[name]['content'])
        core = by_name['世界基调与时间线坐标']
        self.assertTrue(core['constant'])
        self.assertIn('不是月之森、羽丘或花咲川', core['content'])
        self.assertIn('其他人物的当前学校、年级及报到安排也未定', core['content'])
        self.assertIn('时期曾与素世同班', by_name['乐队人物关系 · 若叶睦（Mortis）']['content'])
        self.assertIn('时期曾与立希同班', by_name['乐队人物关系 · 八幡海铃']['content'])


if __name__ == '__main__':
    unittest.main()
