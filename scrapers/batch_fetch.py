"""批量拉取试点 articulation 报告（P1b 数据地基）。

用法：
    cd scrapers && python3 batch_fetch.py

抓取矩阵：5 所试点 CCC x 3 所 UC，专业匹配 "computer science"，
学年 2026-2027（year_id=77）。结果存 data/raw/（gitignored）。

合规：单进程、请求间隔 >= 2.5 秒、识别性 UA、只读公开报告页。
某组合没有 CS 协议就记录跳过，不硬试。
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assist

# 抓取矩阵（ID 均经 /api/institutions 实测确认，见 ASSIST_NOTES.md 7.4）
CCCS = [
    "De Anza College",
    "Santa Monica College",
    "Diablo Valley College",
    "Orange Coast College",
    "Pasadena City College",
]
TARGETS = ["UC Berkeley", "UCLA", "UC San Diego"]
MAJOR_MATCH = "computer science"
YEAR_ID = 77
YEAR_LABEL = "2026-2027"

# 比默认更保守：任务要求间隔 >= 2.5 秒
assist.REQUEST_DELAY = 2.5


def fresh_session():
    """建一个新的 XSRF 会话（400 时重建）。"""
    return assist.new_xsrf_session()


def find_cs_reports(session, sending_id, receiving_id):
    """列出某组合的报告，返回 label 含 'computer science' 的条目。"""
    data = assist.list_agreements(
        session,
        receiving_id=receiving_id,
        sending_id=sending_id,
        academic_year_id=YEAR_ID,
    )
    reports = data.get("reports", []) or []
    return [
        r for r in reports
        if MAJOR_MATCH in str(r.get("label", "")).lower()
    ]


def main() -> int:
    log = []
    session = fresh_session()
    total = 0
    for cc in CCCS:
        sending_id = assist.KNOWN_CCC_IDS[cc]
        for target in TARGETS:
            receiving_id = assist.KNOWN_TARGET_IDS[target]
            tag = f"{cc} -> {target}"
            try:
                matches = find_cs_reports(session, sending_id, receiving_id)
            except Exception as e:  # 会话过期就重建一次
                print(f"[retry] {tag}: list 失败，重建会话 ({e})", file=sys.stderr)
                session = fresh_session()
                try:
                    matches = find_cs_reports(session, sending_id, receiving_id)
                except Exception as e2:
                    log.append({"combo": tag, "status": "list_failed",
                                "error": str(e2)[:120]})
                    continue
            if not matches:
                print(f"[skip] {tag}: 无 CS 协议", file=sys.stderr)
                log.append({"combo": tag, "status": "skipped_no_cs"})
                continue
            for m in matches:
                label = m["label"]
                try:
                    payload = assist.fetch_agreement_json(session, m["key"])
                except Exception as e:
                    print(f"[retry] {tag} [{label}]: fetch 失败，重建会话",
                          file=sys.stderr)
                    session = fresh_session()
                    payload = assist.fetch_agreement_json(session, m["key"])
                report = assist.ArticulationReport(
                    cc_name=cc, target_name=target,
                    major=label, academic_year=YEAR_LABEL)
                assist.parse_agreement_json(payload, report)
                path = assist.save_raw(report)
                n_art = sum(1 for x in report.mappings
                            if x.status == "articulated")
                print(f"[ok] {tag} [{label}]: {len(report.mappings)} 行 "
                      f"({n_art} articulated) -> {path.name}", file=sys.stderr)
                log.append({"combo": tag, "label": label, "status": "ok",
                            "mappings": len(report.mappings),
                            "articulated": n_art,
                            "file": path.name})
                total += 1
    summary_path = assist.DATA_RAW / "batch_fetch_log.json"
    summary_path.write_text(
        json.dumps({"year": YEAR_LABEL, "major_match": MAJOR_MATCH,
                    "fetched": total, "log": log},
                   indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[done] 共抓取 {total} 份报告，日志 -> {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
