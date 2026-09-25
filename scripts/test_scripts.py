"""
scripts/ の Python スクリプトのテスト。

  python3 scripts/test_scripts.py

- validate(): 目視で3つ穴が見つかった実績がある（曖昧さ回避の括弧・多文構成・カタカナの答えに読みを要求）。
  実際に落とし損ねた生成物をそのまま固定して、ルールをいじったときの退行を止める
- apply_reviews(): 無人実行で候補ファイルを壊さないためのガードを固定する
- build_prompt(): 出典取得はモックして、ネットワークなしで動かす
- export_anki: カードの中身（HTML エスケープ・別解）と、重複エラーの扱いを固定する
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_quiz import validate  # noqa: E402
from review_with_claude import apply_reviews, build_prompt, parse_reviews  # noqa: E402
from export_anki import build_note, format_back, is_duplicate_error  # noqa: E402


# ============================================================ validate()

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


# ============================================================ apply_reviews() / parse_reviews()

# apply_reviews 用の候補。validate() の文字数下限（45文字）を満たす長さにしておく
REVIEW_Q = "太陽系の惑星の中で太陽に最も近い軌道を回り、大きさも質量も最小である、ローマ神話の商人の守護神にちなんで名付けられた惑星は？"


def review_cand(answer, status="pending"):
    return {"question": REVIEW_Q, "answer": answer, "reading": "すいせい", "status": status}


def rv(answer, status="approved", reason="理由"):
    return {"answer": answer, "status": status, "reason": reason}


class TestApplyReviews(unittest.TestCase):
    def test_pendingに判定を書き戻す(self):
        items = [review_cand("水星"), review_cand("都市")]
        new, errors = apply_reviews(items, [rv("水星", "approved", "有名"), rv("都市", "rejected", "曖昧")])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["status"], "approved")
        self.assertEqual(new[0]["review_reason"], "有名")
        self.assertEqual(new[0]["reviewed_by"], "claude")
        self.assertEqual(new[1]["status"], "rejected")
        # 元の一覧は変更しない
        self.assertEqual(items[0]["status"], "pending")

    def test_判定のないpendingは残す(self):
        new, errors = apply_reviews([review_cand("水星"), review_cand("都市")], [rv("水星")])
        self.assertEqual(errors, [])
        self.assertEqual(new[1]["status"], "pending")

    def test_importedをapprovedに戻せない(self):
        # 戻せると import_approved.py が同じ問題を二重投入する
        new, errors = apply_reviews([review_cand("水星", "imported")], [rv("水星")])
        self.assertEqual(len(errors), 1)
        self.assertIn("pending ではありません", errors[0])
        self.assertEqual(new[0]["status"], "imported")

    def test_存在しない答えはエラー(self):
        _, errors = apply_reviews([review_cand("水星")], [rv("金星")])
        self.assertIn("一致する候補がありません", errors[0])

    def test_status不正はエラー(self):
        _, errors = apply_reviews([review_cand("水星")], [rv("水星", "pending")])
        self.assertIn("status が不正", errors[0])

    def test_reason必須(self):
        _, errors = apply_reviews([review_cand("水星")], [rv("水星", reason="")])
        self.assertIn("reason がありません", errors[0])

    def test_同じ答えの判定が重複したらエラー(self):
        _, errors = apply_reviews([review_cand("水星")], [rv("水星"), rv("水星")])
        self.assertTrue(any("重複" in e for e in errors))

    def test_pendingが複数一致したらエラー(self):
        _, errors = apply_reviews([review_cand("水星"), review_cand("水星")], [rv("水星")])
        self.assertIn("一意に決まりません", errors[0])

    def test_1件でも不正なら全部書かない(self):
        items = [review_cand("水星"), review_cand("都市")]
        new, errors = apply_reviews(items, [rv("水星"), rv("金星")])
        self.assertTrue(errors)
        self.assertEqual(new[0]["status"], "pending")

    def test_問題文を手直しできる(self):
        fixed = REVIEW_Q.replace("名付けられた惑星は？", "名付けられた地球型惑星は？")
        new, errors = apply_reviews([review_cand("水星")], [{**rv("水星"), "question": fixed}])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["question"], fixed)
        self.assertEqual(new[0]["original_question"], REVIEW_Q)

    def test_手直しが元と同じならoriginal_questionを残さない(self):
        new, errors = apply_reviews([review_cand("水星")], [{**rv("水星"), "question": REVIEW_Q}])
        self.assertEqual(errors, [])
        self.assertNotIn("original_question", new[0])

    def test_手直しで答えが露出したらエラー(self):
        bad = REVIEW_Q.replace("惑星は？", "惑星、水星は？")
        _, errors = apply_reviews([review_cand("水星")], [{**rv("水星"), "question": bad}])
        self.assertIn("手直しした問題文が不正", errors[0])
        self.assertIn("露出", errors[0])

    def test_手直しで疑問形でなくなったらエラー(self):
        bad = REVIEW_Q.rstrip("？") + "です。"
        _, errors = apply_reviews([review_cand("水星")], [{**rv("水星"), "question": bad}])
        self.assertIn("手直しした問題文が不正", errors[0])

    def test_rejectedの手直しは無視する(self):
        new, errors = apply_reviews([review_cand("水星")], [{**rv("水星", "rejected"), "question": "短すぎる？"}])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["question"], REVIEW_Q)
        self.assertNotIn("original_question", new[0])

    def test_answerの前後空白は許容(self):
        new, errors = apply_reviews([review_cand("水星")], [rv(" 水星 ")])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["status"], "approved")


class TestParseReviews(unittest.TestCase):
    ARR = [{"answer": "水星", "status": "approved", "reason": "有名"}]

    def test_素の配列(self):
        self.assertEqual(parse_reviews(json.dumps(self.ARR, ensure_ascii=False)), self.ARR)

    def test_フェンス付き(self):
        raw = "判定結果です。\n```json\n" + json.dumps(self.ARR, ensure_ascii=False) + "\n```\n"
        self.assertEqual(parse_reviews(raw), self.ARR)

    def test_output_format_jsonの封筒(self):
        env = {"type": "result", "result": "```json\n" + json.dumps(self.ARR, ensure_ascii=False) + "\n```"}
        self.assertEqual(parse_reviews(json.dumps(env, ensure_ascii=False)), self.ARR)

    def test_前置き付きの素の配列(self):
        raw = "以下が判定です。\n" + json.dumps(self.ARR, ensure_ascii=False) + "\n以上です。"
        self.assertEqual(parse_reviews(raw), self.ARR)

    def test_配列でなければエラー(self):
        with self.assertRaises(ValueError):
            parse_reviews('{"answer": "水星"}')

    def test_読めない入力はエラー(self):
        with self.assertRaises(ValueError):
            parse_reviews("レビューできませんでした")

    def test_空入力はエラー(self):
        with self.assertRaises(ValueError):
            parse_reviews("   ")


# ============================================================ build_prompt()

def prompt_cand(answer, status="pending"):
    return {"question": f"{answer}についての問題は？", "answer": answer, "reading": "",
            "source_title": answer, "source_url": f"https://ja.wikipedia.org/wiki/{answer}",
            "status": status}


class TestBuild(unittest.TestCase):
    def test_pendingだけを載せる(self):
        prompt, skipped = build_prompt([prompt_cand("水星"), prompt_cand("都市", "rejected"), prompt_cand("ライスシャワー")],
                                get_extract=lambda t: f"{t}の本文")
        self.assertEqual(skipped, [])
        self.assertIn("候補（2 件）", prompt)
        self.assertIn("answer: 水星", prompt)
        self.assertIn("水星の本文", prompt)
        self.assertNotIn("answer: 都市", prompt)

    def test_採否基準と出力契約を含む(self):
        prompt, _ = build_prompt([prompt_cand("水星")], get_extract=lambda t: "本文")
        self.assertIn("# 採否基準", prompt)
        self.assertIn("事実の裏取り", prompt)   # rubric の中身が埋め込まれている
        self.assertIn("45〜150 文字", prompt)   # validate() の定数と揃っている
        self.assertIn('"status": "approved または rejected"', prompt)

    def test_ツールなしで動く旨を明記(self):
        # rubric には fetch_extract を呼ぶ手順が書いてあるが、claude -p は --tools "" で動く。
        # 「取れないから確認できない→見送り」と誤解して良い候補を落とさないよう、上書きの一文を必ず入れる
        prompt, _ = build_prompt([prompt_cand("水星")], get_extract=lambda t: "本文")
        self.assertIn("ツールは使えない", prompt)
        self.assertIn("fetch_extract", prompt)

    def test_pendingが無ければ空(self):
        prompt, skipped = build_prompt([prompt_cand("水星", "imported")], get_extract=lambda t: "本文")
        self.assertEqual(prompt, "")
        self.assertEqual(skipped, [])

    def test_出典が取れない候補は除外して残りで組む(self):
        def flaky(title):
            if title == "水星":
                raise OSError("timeout")
            return "本文"
        prompt, skipped = build_prompt([prompt_cand("水星"), prompt_cand("ライスシャワー")], get_extract=flaky)
        self.assertEqual(skipped, ["水星"])
        self.assertIn("候補（1 件）", prompt)
        self.assertNotIn("answer: 水星", prompt)

    def test_出典が空の候補も除外(self):
        prompt, skipped = build_prompt([prompt_cand("水星")], get_extract=lambda t: "   ")
        self.assertEqual(prompt, "")
        self.assertEqual(skipped, ["水星"])


# ============================================================ export_anki

class TestExportAnki(unittest.TestCase):
    def test_別解は括弧でまとめる(self):
        self.assertEqual(format_back("水星", ["すいせい", "マーキュリー"]), "水星（すいせい／マーキュリー）")

    def test_別解なしや答えと同じ別解は答えだけ(self):
        self.assertEqual(format_back("水星", []), "水星")
        self.assertEqual(format_back("水星", None), "水星")
        self.assertEqual(format_back("水星", ["水星"]), "水星")

    def test_フィールドはHTMLエスケープする(self):
        # Anki のフィールドは HTML として表示されるので、< や & が崩れないようにする
        note = build_note({"question": "A<B & C は？", "answer": "<D>", "accepted_answers": []},
                          "基本", ["表面", "裏面"])
        self.assertEqual(note["fields"], {"表面": "A&lt;B &amp; C は？", "裏面": "&lt;D&gt;"})
        self.assertEqual(note["modelName"], "基本")
        self.assertFalse(note["options"]["allowDuplicate"])

    def test_重複エラーだけを追加済み扱いにする(self):
        self.assertTrue(is_duplicate_error(RuntimeError(
            "AnkiConnect エラー（addNote）: cannot create note because it is a duplicate")))
        self.assertFalse(is_duplicate_error(RuntimeError("AnkiConnect エラー（addNote）: deck was not found")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
