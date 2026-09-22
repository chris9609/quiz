"""
apply_review.py のテスト。無人実行で候補ファイルを壊さないためのガードを固定する。

  python3 scripts/test_apply_review.py
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply_review import apply_reviews, parse_reviews


# validate() の文字数下限（45文字）を満たす長さにしておく
GOOD_Q = "太陽系の惑星の中で太陽に最も近い軌道を回り、大きさも質量も最小である、ローマ神話の商人の守護神にちなんで名付けられた惑星は？"


def cand(answer, status="pending"):
    return {"question": GOOD_Q, "answer": answer, "reading": "すいせい", "status": status}


def rv(answer, status="approved", reason="理由"):
    return {"answer": answer, "status": status, "reason": reason}


class TestApplyReviews(unittest.TestCase):
    def test_pendingに判定を書き戻す(self):
        items = [cand("水星"), cand("都市")]
        new, errors = apply_reviews(items, [rv("水星", "approved", "有名"), rv("都市", "rejected", "曖昧")])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["status"], "approved")
        self.assertEqual(new[0]["review_reason"], "有名")
        self.assertEqual(new[0]["reviewed_by"], "claude")
        self.assertEqual(new[1]["status"], "rejected")
        # 元の一覧は変更しない
        self.assertEqual(items[0]["status"], "pending")

    def test_判定のないpendingは残す(self):
        new, errors = apply_reviews([cand("水星"), cand("都市")], [rv("水星")])
        self.assertEqual(errors, [])
        self.assertEqual(new[1]["status"], "pending")

    def test_importedをapprovedに戻せない(self):
        # 戻せると import_approved.py が同じ問題を二重投入する
        new, errors = apply_reviews([cand("水星", "imported")], [rv("水星")])
        self.assertEqual(len(errors), 1)
        self.assertIn("pending ではありません", errors[0])
        self.assertEqual(new[0]["status"], "imported")

    def test_存在しない答えはエラー(self):
        _, errors = apply_reviews([cand("水星")], [rv("金星")])
        self.assertIn("一致する候補がありません", errors[0])

    def test_status不正はエラー(self):
        _, errors = apply_reviews([cand("水星")], [rv("水星", "pending")])
        self.assertIn("status が不正", errors[0])

    def test_reason必須(self):
        _, errors = apply_reviews([cand("水星")], [rv("水星", reason="")])
        self.assertIn("reason がありません", errors[0])

    def test_同じ答えの判定が重複したらエラー(self):
        _, errors = apply_reviews([cand("水星")], [rv("水星"), rv("水星")])
        self.assertTrue(any("重複" in e for e in errors))

    def test_pendingが複数一致したらエラー(self):
        _, errors = apply_reviews([cand("水星"), cand("水星")], [rv("水星")])
        self.assertIn("一意に決まりません", errors[0])

    def test_1件でも不正なら全部書かない(self):
        items = [cand("水星"), cand("都市")]
        new, errors = apply_reviews(items, [rv("水星"), rv("金星")])
        self.assertTrue(errors)
        self.assertEqual(new[0]["status"], "pending")

    def test_問題文を手直しできる(self):
        fixed = GOOD_Q.replace("名付けられた惑星は？", "名付けられた地球型惑星は？")
        new, errors = apply_reviews([cand("水星")], [{**rv("水星"), "question": fixed}])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["question"], fixed)
        self.assertEqual(new[0]["original_question"], GOOD_Q)

    def test_手直しが元と同じならoriginal_questionを残さない(self):
        new, errors = apply_reviews([cand("水星")], [{**rv("水星"), "question": GOOD_Q}])
        self.assertEqual(errors, [])
        self.assertNotIn("original_question", new[0])

    def test_手直しで答えが露出したらエラー(self):
        bad = GOOD_Q.replace("惑星は？", "惑星、水星は？")
        _, errors = apply_reviews([cand("水星")], [{**rv("水星"), "question": bad}])
        self.assertIn("手直しした問題文が不正", errors[0])
        self.assertIn("露出", errors[0])

    def test_手直しで疑問形でなくなったらエラー(self):
        bad = GOOD_Q.rstrip("？") + "です。"
        _, errors = apply_reviews([cand("水星")], [{**rv("水星"), "question": bad}])
        self.assertIn("手直しした問題文が不正", errors[0])

    def test_rejectedの手直しは無視する(self):
        new, errors = apply_reviews([cand("水星")], [{**rv("水星", "rejected"), "question": "短すぎる？"}])
        self.assertEqual(errors, [])
        self.assertEqual(new[0]["question"], GOOD_Q)
        self.assertNotIn("original_question", new[0])

    def test_answerの前後空白は許容(self):
        new, errors = apply_reviews([cand("水星")], [rv(" 水星 ")])
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

    def test_配列でなければエラー(self):
        with self.assertRaises(ValueError):
            parse_reviews('{"answer": "水星"}')

    def test_読めない入力はエラー(self):
        with self.assertRaises(ValueError):
            parse_reviews("レビューできませんでした")

    def test_空入力はエラー(self):
        with self.assertRaises(ValueError):
            parse_reviews("   ")


if __name__ == "__main__":
    unittest.main(verbosity=2)
