"""抓取 20 所 CCC 的 Cal-GETC 课程清单（transferability 接口）。

用法：
    cd scrapers && python3 fetch_calgetc.py

接口：GET /api/transferability/courses?institutionId={id}&academicYearId=77&listType=calgetcArea
只保留 transferAreas 里 name == "Cal-GETC" 的条目。
结果存 data/raw/calgetc_<cc>_2026_2027.json（gitignored），再跑
mobile/scripts/build-data.py 打包进 mobile/www/js/ge-gz-*.js。

合规：单进程、请求间隔 >= 3 秒、识别性 UA、只读公开接口。
"""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assist

YEAR_ID = 77
YEAR_LABEL = "2026-2027"
REQUEST_DELAY = 3.0

CCCS = [
    "De Anza College",
    "Santa Monica College",
    "Diablo Valley College",
    "Orange Coast College",
    "Pasadena City College",
    "Irvine Valley College",
    "Foothill College",
    "Saddleback College",
    "Santa Barbara City College",
    "El Camino College",
    "Berkeley City College",
    "College of Alameda",
    "Laney College",
    "Merritt College",
    "College of San Mateo",
    "Canada College",
    "Skyline College",
    "Cypress College",
    "Fullerton College",
    "Golden West College",
]


def norm_code(prefix, number):
    return f"{(prefix or '').strip()} {(number or '').strip()}".strip().upper()


def fetch_one(session, cc):
    inst_id = assist.KNOWN_CCC_IDS[cc]
    url = assist.transferability_api_url(inst_id, YEAR_ID, "calgetcArea")
    try:
        r = session.get(url, headers=assist.HEADERS,
                        timeout=assist.TIMEOUT, verify=False)
    except Exception as e:
        return None, f"request_failed: {e}"
    if r.status_code != 200:
        return None, f"http_{r.status_code}"
    try:
        data = r.json()
    except Exception as e:
        return None, f"bad_json: {e}"
    courses = []
    for c in data.get("courseInformationList", []) or []:
        areas = []
        for a in c.get("transferAreas", []) or []:
            if (a.get("name") or "") == "Cal-GETC":
                code = (a.get("code") or "").strip()
                if code and code not in areas:
                    areas.append(code)
        if not areas:
            continue
        courses.append({
            "code": norm_code(c.get("prefixCode"), c.get("courseNumber")),
            "title": (c.get("courseTitle") or "").strip(),
            "units": c.get("minUnits"),
            "areas": areas,
        })
    # 同一课程去重（保留 area 并集）
    merged = {}
    for c in courses:
        m = merged.setdefault(c["code"], {"code": c["code"],
                                          "title": c["title"],
                                          "units": c["units"],
                                          "areas": []})
        for a in c["areas"]:
            if a not in m["areas"]:
                m["areas"].append(a)
    return {"cc": cc, "year": YEAR_LABEL,
            "courses": sorted(merged.values(), key=lambda x: x["code"])}, None


def main():
    assist.DATA_RAW.mkdir(parents=True, exist_ok=True)
    session = assist.new_xsrf_session()
    ok, fail = 0, 0
    for i, cc in enumerate(CCCS):
        if i:
            time.sleep(REQUEST_DELAY)
        try:
            payload, err = fetch_one(session, cc)
        except Exception as e:
            payload, err = None, f"exception: {e}"
        if err and "400" in str(err):
            # 会话过期就重建一次
            session = assist.new_xsrf_session()
            time.sleep(REQUEST_DELAY)
            try:
                payload, err = fetch_one(session, cc)
            except Exception as e:
                payload, err = None, f"exception: {e}"
        safe = re.sub(r"[^A-Za-z0-9]+", "_", cc).strip("_")[:40]
        if payload is None:
            print(f"[fail] {cc}: {err}", file=sys.stderr)
            fail += 1
            continue
        path = assist.DATA_RAW / f"calgetc_{safe}_{YEAR_LABEL}.json"
        path.write_text(json.dumps({"report": payload}, indent=1,
                                   ensure_ascii=False),
                        encoding="utf-8")
        n_areas = sum(len(c["areas"]) for c in payload["courses"])
        print(f"[ok] {cc}: {len(payload['courses'])} 门课, "
              f"{n_areas} 条 area 对应 -> {path.name}", file=sys.stderr)
        ok += 1
    print(f"done: {ok} ok, {fail} failed", file=sys.stderr)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
