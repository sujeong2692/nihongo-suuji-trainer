#!/usr/bin/env python3
"""Build a single-file standalone HTML version of nihongo-suuji-trainer: all
329 items + a client-side port of the Java API (ItemRepository, NumberReader,
Progress, ProgressStore) + the original app.js (with its api() function
swapped for a local in-memory version) inlined into one .html file.

No server, no network calls; progress is stored in the browser's
localStorage. Run from anywhere: `python3 standalone/build.py`.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RES = ROOT.parent / "src" / "main" / "resources"


def esc_script(s: str) -> str:
    """Prevent an embedded string from prematurely closing the <script> tag."""
    return s.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def load_items_tsv(path: Path):
    out = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        f = line.split("\t")
        if len(f) < 7:
            raise ValueError(f"items.tsv line {line_no}: expected 7 fields, got {len(f)}")
        out.append({
            "id": f[0].strip(), "category": f[1].strip(), "subcategory": f[2].strip(),
            "prompt": f[3].strip(), "reading": f[4].strip(), "korean": f[5].strip(), "note": f[6].strip(),
        })
    return out


API_OLD = """  async function api(path, params, method = 'GET') {
    const opts = { method };
    let url = '/api' + path;
    if (method === 'GET') {
      if (params) url += '?' + new URLSearchParams(params);
    } else {
      opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      opts.body = new URLSearchParams(params || {}).toString();
    }
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }"""

API_NEW = """  async function api(path, params, method = 'GET') {
    return SuujiEngine.route(method, path, params || {});
  }"""

TEXT_PATCHES = [
    (
        "진도는 서버의 <code>data/progress.tsv</code> 파일에 저장되므로 브라우저를 바꿔도 유지됩니다. 큰 수 읽기는 규칙 기반 연습이라 개별 진도는 저장하지 않습니다.",
        "이 파일은 서버 없이 브라우저에서 단독으로 동작합니다. 진도는 이 브라우저의 localStorage에 저장되므로, 같은 브라우저로 이 파일을 다시 열면 유지됩니다(다른 브라우저·PC·시크릿 모드에는 저장되지 않습니다). 큰 수 읽기는 규칙 기반 연습이라 개별 진도는 저장하지 않습니다.",
    ),
    (" · 진도 파일: data/progress.tsv", " · 독립 실행형(서버 불필요) · 진도는 이 브라우저의 localStorage에 저장"),
]


def main():
    items_data = load_items_tsv(RES / "items.tsv")
    assert len(items_data) == 329, f"expected 329 items, got {len(items_data)}"

    index_html = (RES / "web" / "index.html").read_text(encoding="utf-8")
    style_css = (RES / "web" / "style.css").read_text(encoding="utf-8")
    engine_js = (ROOT / "suuji-engine.js").read_text(encoding="utf-8")
    app_js = (RES / "web" / "app.js").read_text(encoding="utf-8")

    if API_OLD not in app_js:
        raise ValueError("api() block not found verbatim - app.js may have changed since this script was written")
    app_js = app_js.replace(API_OLD, API_NEW, 1)

    data_json = esc_script(json.dumps(items_data, ensure_ascii=False))

    html = index_html
    for old, new in TEXT_PATCHES:
        html = html.replace(old, new)
    html = html.replace('<link rel="stylesheet" href="/style.css">', f"<style>\n{style_css}\n</style>")
    html = html.replace(
        '<script src="/app.js"></script>',
        "<script>\n"
        f"const ITEMS_DATA = {data_json};\n"
        f"{engine_js}\n"
        "SuujiEngine.init(ITEMS_DATA);\n"
        f"{app_js}\n"
        "</script>",
    )
    html = html.replace(
        "<head>",
        '<head>\n<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>数</text></svg>">',
        1,
    )

    out = ROOT / "nihongo-suuji-trainer.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({len(html):,} chars, {len(items_data)} items)")


if __name__ == "__main__":
    main()
