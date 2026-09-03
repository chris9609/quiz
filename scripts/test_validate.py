"""
generate_quiz.validate() のテスト。

この関数は目視で3つ穴が見つかった実績がある（曖昧さ回避の括弧・多文構成・
カタカナの答えに読みを要求）。実際に落とし損ねた生成物をそのまま固定して、
ルールをいじったときの退行を止める。

  python3 scripts/test_validate.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_quiz import validate


def item(q, a, r=""):
    return {"question": q, "answer": a, "reading": r}


GOOD_Q = "1960年（昭和35年）に公開され、作家の三島由紀夫が映画俳優として初主演を果たした、ヤクザの二代目跡取りが敵対する組の殺し屋たちに命を狙われる異色の作品は？"


class TestValidate(unittest.TestCase):
    def test_正しい候補は通る(self):
        self.assertIsNone(validate(item(GOOD_Q, "からっ風野郎", "からっかぜやろう"),
                                   "からっ風野郎", set()))

    def test_多文構成は落とす(self):
        # 実際に生成された「メアリー・トフト」。3文に分かれていて早押しにならない
        q = ("1726年、彼女は自らがウサギを出産したと周囲に信じ込ませる大きな論争を巻き起こしました。"
             "この事件は、当時のイギリス医学界に大きな混乱をもたらしました。この論争の中心人物は誰でしょうか？")
        self.assertIn("複数の文", validate(item(q, "メアリー・トフト"), "メアリー・トフト", set()))

    def test_カタカナの答えに読みは要らない(self):
        # 「バスク・ナショナリズム」が読み必須で弾かれていた。正規化がカナ⇔かなを吸収するので不要
        self.assertIsNone(validate(item(GOOD_Q, "バスク・ナショナリズム", ""),
                                   "バスク・ナショナリズム", set()))

    def test_漢字の答えには読みが要る(self):
        self.assertIn("reading が空", validate(item(GOOD_Q, "熊本城", ""), "熊本城", set()))

    def test_読みにカタカナが混じるのは許す(self):
        # 「ポジャールスキー公 → ポジャールスキーこう」のような答えが実際にある。
        # カナ⇔かなの差は answerCheck.ts の正規化が吸収するので弾く理由がない
        self.assertIsNone(validate(item(GOOD_Q, "熊本城", "クマモトジョウ"), "熊本城", set()))

    def test_読みに漢字が混じっていたら落とす(self):
        # 読みになっていない（変換し損ねている）ので弾く
        self.assertIn("仮名でない",
                      validate(item(GOOD_Q, "熊本城", "熊本じょう"), "熊本城", set()))

    def test_疑問形で終わらないものは落とす(self):
        q = ("酸化鉄を多く含む地表のために赤く見えることで知られ、オリンポス山という太陽系最大の火山を持つ、地球のすぐ外側を公転している惑星です。")
        self.assertIn("疑問形", validate(item(q, "火星", "かせい"), "火星", set()))

    def test_問題文に答えが露出していたら落とす(self):
        q = ("熊本城は明治期の西南戦争において籠城戦の舞台となったことで知られていますが、17世紀初頭に加藤清正によって築かれたこの城の名前は何？")
        self.assertIn("答えが露出", validate(item(q, "熊本城", "くまもとじょう"), "熊本城", set()))

    def test_前振りのない短い問題は落とす(self):
        self.assertIn("短すぎる", validate(item("日本で一番高い山は？", "富士山", "ふじさん"),
                                          "富士山", set()))

    def test_長すぎる問題は落とす(self):
        # 実測で冗長な問題文（焼戻し）が出たので上限を設けた
        q = "あ" * 150 + "？"  # 151文字（上限150を1文字超える）
        self.assertIn("長すぎる", validate(item(q, "熊本城", "くまもとじょう"), "熊本城", set()))

    def test_既存の答えと重複したら落とす(self):
        self.assertIn("重複", validate(item(GOOD_Q, "熊本城", "くまもとじょう"),
                                      "熊本城", {"熊本城"}))

    def test_指定と違う答えを返したら落とす(self):
        self.assertIn("答えが指定と違う",
                      validate(item(GOOD_Q, "名古屋城", "なごやじょう"), "熊本城", set()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
