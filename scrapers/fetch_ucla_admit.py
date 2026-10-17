"""抓取 UCLA 官网 Transfer Profile by Major（Fall 2025 + Fall 2024 impacted 标记）。

用法：
    cd scrapers && python3 fetch_ucla_admit.py

数据源（UC 官方公开页面，无开放 API，用公开 HTML 表格）：
  - https://admission.ucla.edu/apply/transfer/transfer-profile/2025/major
    （Major | Applicants | Admit Rate | 25th% | 75th%）
  - https://admission.ucla.edu/apply/transfer/transfer-profile/2024/major
    （"* " 前缀 = impacted 专业：申请远超名额，UCLA 官方注：
     录取者 GPA 与先修课完成度均超平均线）

结果存 data/raw/ucla_admit_2025.json（gitignored），再跑
mobile/scripts/build-data.py 打包进 mobile/www/js/admit-gz-*.js。
UCLA 每年 8 月更新，届时重跑即可。

合规：单进程、2 个请求、识别性 UA、只读公开页面。
"""
import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assist

UA = assist.HEADERS["User-Agent"]
URL_2025 = "https://admission.ucla.edu/apply/transfer/transfer-profile/2025/major"
URL_2024 = "https://admission.ucla.edu/apply/transfer/transfer-profile/2024/major"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self._cur = None
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._cur = []
        elif tag == "tr" and self._cur is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None:
            self._row.append(self._cell.strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self._cur.append(self._row)
            self._row = None
        elif tag == "table" and self._cur is not None:
            self.tables.append(self._cur)
            self._cur = None

    def handle_data(self, d):
        if self._cell is not None:
            self._cell += d


def fetch_html(session, url):
    r = session.get(url, headers={"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    return r.text


def norm_major(name):
    n = name.lower().strip()
    n = re.sub(r",?\s*pre\s*$", "", n)          # "Business Economics, Pre" -> "business economics"
    n = re.sub(r"\s*\b(b\.a\.|b\.s\.|bs|ba)\b\s*", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def parse_pct(s):
    s = (s or "").strip().rstrip("%")
    try:
        return float(s) / 100.0
    except ValueError:
        return None


def parse_gpa(s):
    s = (s or "").strip()
    if s.upper() == "N/A" or not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_tables(html):
    p = TableParser()
    p.feed(html)
    majors = {}
    for t in p.tables:
        if not t or t[0][:2] != ["Major", "Applicants"]:
            continue
        for row in t[1:]:
            if len(row) < 5:
                continue
            name = row[0].strip()
            if not name:
                continue
            impacted = name.startswith("*")
            name = name.lstrip("*").strip()
            try:
                applicants = int(row[1].replace(",", ""))
            except ValueError:
                applicants = None
            majors[name] = {
                "name": name,
                "key": norm_major(name),
                "applicants": applicants,
                "admit_rate": parse_pct(row[2]),
                "gpa25": parse_gpa(row[3]),
                "gpa75": parse_gpa(row[4]),
                "impacted": impacted,
            }
    return majors


def main():
    import requests
    session = requests.Session()
    print("fetch 2025 ...", file=sys.stderr)
    html25 = fetch_html(session, URL_2025)
    time.sleep(3)
    print("fetch 2024 ...", file=sys.stderr)
    html24 = fetch_html(session, URL_2024)

    m25 = parse_tables(html25)
    m24 = parse_tables(html24)
    print(f"2025: {len(m25)} majors, 2024: {len(m24)} majors", file=sys.stderr)

    # impacted 标记取 2024（2025 页无 * 标注），按归一化 key 对齐
    impacted_keys = {v["key"] for v in m24.values() if v["impacted"]}
    out = []
    for name, m in sorted(m25.items()):
        m["impacted"] = m["impacted"] or (m["key"] in impacted_keys)
        out.append(m)
    n_imp = sum(1 for m in out if m["impacted"])
    print(f"impacted: {n_imp}", file=sys.stderr)

    payload = {
        "campus": "UCLA",
        "cycle": "Fall 2025",
        "impacted_cycle": "Fall 2024",
        "source": URL_2025,
        "source_impacted": URL_2024,
        "majors": out,
    }
    assist.DATA_RAW.mkdir(parents=True, exist_ok=True)
    path = assist.DATA_RAW / "ucla_admit_2025.json"
    path.write_text(json.dumps({"report": payload}, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    print(f"wrote {path} ({len(out)} majors)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
