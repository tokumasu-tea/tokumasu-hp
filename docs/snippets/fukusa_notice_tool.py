#!/usr/bin/env python3
"""帛紗（ふくさ）注意書きセクションの生成・検証ツール。

使い方（リポジトリのルートで実行）:
  python3 docs/snippets/fukusa_notice_tool.py build   # 原文(.txt)からスニペット(.html)を再生成
  python3 docs/snippets/fukusa_notice_tool.py check   # スニペットと掲載済み商品ページが原文と一字一句一致するか検証

テンプレート:
  A（正絹用）      : fukusa-notice-A-shoken.txt  → fukusa-notice-A-shoken.html
  B（人絹・化繊用）: fukusa-notice-B-kasen.txt   → fukusa-notice-B-kasen.html

文言を変更するときは .txt を編集して build を実行し、掲載済みページの
マーカー（ここから〜ここまで）の間を新しいスニペットの中身で貼り替えてから
check で全ページの一致を確認する。
"""
import html
import re
import sys
from pathlib import Path

SNIPPETS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SNIPPETS_DIR.parent.parent

TEMPLATES = {
    "A": {
        "label": "テンプレートA：正絹用",
        "txt": SNIPPETS_DIR / "fukusa-notice-A-shoken.txt",
        "html": SNIPPETS_DIR / "fukusa-notice-A-shoken.html",
    },
    "B": {
        "label": "テンプレートB：人絹・化繊用",
        "txt": SNIPPETS_DIR / "fukusa-notice-B-kasen.txt",
        "html": SNIPPETS_DIR / "fukusa-notice-B-kasen.html",
    },
}

MARKER_START = "<!-- 帛紗注意書き（{label}）ここから -->"
MARKER_END = "<!-- 帛紗注意書き（{label}）ここまで -->"

ITEM_RE = re.compile(r"^\d+[．.]")

STYLE_SECTION = "background:var(--cream);padding:0 24px 72px"
STYLE_BOX = "max-width:640px;margin:0 auto;background:#fff;border:1px solid var(--border)"
STYLE_BAND = (
    "background:var(--black);color:var(--gold);font-family:'Noto Serif JP',serif;"
    "font-weight:400;font-size:15px;letter-spacing:0.14em;text-align:center;"
    "padding:14px 18px;margin:0"
)
STYLE_INNER = "padding:2px 26px 30px;font-size:13px;line-height:2;color:var(--text)"
STYLE_LEAD_P = "margin:24px 0 0"
STYLE_ITEM_H = (
    "font-weight:500;font-size:13px;letter-spacing:0.02em;color:var(--text);"
    "border-top:1px solid var(--border);margin:24px 0 10px;padding-top:22px"
)
STYLE_ITEM_P = "margin:0"


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def parse_source(text: str):
    lines = text.rstrip("\n").split("\n")
    title = lines[0].strip()
    rest = "\n".join(lines[1:])
    blocks = [b.strip("\n") for b in re.split(r"\n\s*\n", rest) if b.strip()]
    return title, blocks


def build_one(key: str) -> str:
    t = TEMPLATES[key]
    title, blocks = parse_source(t["txt"].read_text(encoding="utf-8"))
    out = []
    out.append(MARKER_START.format(label=t["label"]))
    out.append(f"<!-- このファイルは {t['txt'].name} から fukusa_notice_tool.py build で自動生成。文言の変更は .txt 側を編集して再生成すること -->")
    out.append(f'<section style="{STYLE_SECTION}">')
    out.append(f'  <div style="{STYLE_BOX}">')
    out.append(f'    <h2 style="{STYLE_BAND}">{esc(title)}</h2>')
    out.append(f'    <div style="{STYLE_INNER}">')
    for block in blocks:
        lines = block.split("\n")
        if ITEM_RE.match(lines[0]):
            out.append(f'      <h3 style="{STYLE_ITEM_H}">{esc(lines[0])}</h3>')
            body = "<br>".join(esc(l) for l in lines[1:])
            out.append(f'      <p style="{STYLE_ITEM_P}">{body}</p>')
        else:
            body = "<br>".join(esc(l) for l in lines)
            out.append(f'      <p style="{STYLE_LEAD_P}">{body}</p>')
    out.append("    </div>")
    out.append("  </div>")
    out.append("</section>")
    out.append(MARKER_END.format(label=t["label"]))
    return "\n".join(out) + "\n"


def build():
    for key, t in TEMPLATES.items():
        t["html"].write_text(build_one(key), encoding="utf-8")
        print(f"生成: {t['html'].relative_to(REPO_ROOT)}")


def extract_text_lines(fragment: str):
    """HTML断片からテキスト行（前後空白除去・空行除外）を抽出する。"""
    s = re.sub(r"<!--.*?-->", "", fragment, flags=re.S)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</(h\d|p|div|section)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return [l.strip() for l in s.split("\n") if l.strip()]


def source_text_lines(text: str):
    return [l.strip() for l in text.split("\n") if l.strip()]


def compare(name: str, got_lines, want_lines) -> bool:
    if got_lines == want_lines:
        print(f"  ✅ {name}: 原文と完全一致（{len(want_lines)}行）")
        return True
    print(f"  ❌ {name}: 不一致")
    for i in range(max(len(got_lines), len(want_lines))):
        g = got_lines[i] if i < len(got_lines) else "（行なし）"
        w = want_lines[i] if i < len(want_lines) else "（行なし）"
        if g != w:
            print(f"     {i+1}行目\n       原文  : {w}\n       ページ: {g}")
    return False


def check() -> bool:
    ok = True
    for key, t in TEMPLATES.items():
        want = source_text_lines(t["txt"].read_text(encoding="utf-8"))
        print(f"[{t['label']}]")
        # 1) スニペットファイル自体の検証
        if t["html"].exists():
            got = extract_text_lines(t["html"].read_text(encoding="utf-8"))
            ok &= compare(f"スニペット {t['html'].name}", got, want)
        else:
            print(f"  ⚠️ スニペット {t['html'].name} が未生成（build を実行してください）")
            ok = False
        # 2) 掲載済み商品ページの検証（マーカーで自動検出）
        start = MARKER_START.format(label=t["label"])
        end = MARKER_END.format(label=t["label"])
        pages = sorted(REPO_ROOT.glob("product-*.html"))
        found = 0
        for page in pages:
            content = page.read_text(encoding="utf-8")
            if start in content:
                found += 1
                fragment = content.split(start, 1)[1].split(end, 1)[0]
                got = extract_text_lines(fragment)
                ok &= compare(f"掲載ページ {page.name}", got, want)
        if found == 0:
            print("  （掲載ページなし）")
    return ok


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "build":
        build()
    elif mode == "check":
        if not check():
            sys.exit(1)
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
