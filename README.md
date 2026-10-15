# Transfer OS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/pain-points.md)
[![Data: ASSIST 2026-27](https://img.shields.io/badge/Data-ASSIST%202026--27-blue.svg)](scrapers/ASSIST_NOTES.md)

**Open-source transfer planning toolkit for California community college students.**
Stop cross-referencing ASSIST reports by hand. Check TAG eligibility, compare what transfers where, and validate your course plan — free, offline, no account needed.

> 中文说明见下方 [中文版](#中文版)

## What it does (working today)

| Feature | What you get |
|---|---|
| **TAG Guard** | Pick a UC (Davis / Irvine / Merced / Riverside / Santa Barbara / Santa Cruz), enter GPA + units + major → item-by-item TAG eligibility check against 2026-27 official rules, with risk flags (e.g. "TAG major must match UC application major") |
| **Articulation Comparator** | Pick a community college + multiple UCs + enter your courses → one matrix showing what counts where, what's missing, and which course fills each gap. Built on 25 real ASSIST articulation agreements |
| **Course Plan Validator** | Enter your planned courses by term → flags non-transferable courses, denied courses, and estimates wasted units ("≈ N extra terms") |

Plus: **trilingual UI** (中文 / English / Español), **fully offline** Android app, zero tracking.

## Try it

**Android (trial build):** install the APK → no login, no internet required.
*Release downloads coming soon — for now grab the trial APK from the repo owner.*

**Web demo (developers):**
```bash
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/pytest tests/ -q            # 35 tests
.venv/bin/uvicorn demo.app:app --port 8000   # http://localhost:8000
```

## Why not just use ASSIST?

ASSIST shows one report at a time (one CC × one university × one major). Applying to 3 UCs means cross-referencing everything by hand — students call it "a mess". Transfer OS does the comparison ASSIST doesn't:

- **Multi-campus matrix** — the #1 pain point from our [research](docs/pain-points.md)
- **Deterministic rule engine** — TAG/Cal-GETC checked by code, never by LLM hallucination. LLMs only explain, never judge eligibility
- **Honest unknowns** — no agreement found → "unknown, check ASSIST", never a silent guess
- **Maintained** — TAG rules change yearly; this repo has a yearly maintenance schedule. Most similar projects died from stale data

## Data honesty

- Articulation data: scraped from public ASSIST.org pages (see `scrapers/`), 2026-27 academic year
- TAG rules: hand-encoded from each UC's official admissions pages, every file carries `source` URL + `verified_date`
- This is a planning reference, **not** a guarantee of admission. Always verify against official sources

## Roadmap

- **P0 ✅** Data foundation: 6 UC TAG rules, Cal-GETC rules, ASSIST scraper (XSFR-safe, no headless browser needed)
- **P1 ✅** TAG Guard + Comparator + Validator (+ Android app)
- **P2** UC course planner (3/4-year schedules from major requirements + term offerings)
- **P3** Transfer timeline hub (TAG/TAG deadlines), seat alerts, community rule maintenance
- **P4** Other states' transfer systems, international-student module ([spec](docs/international-students.md))

Full plan: [PLAN.md](PLAN.md) · Pain-point research: [docs/pain-points.md](docs/pain-points.md)

## Contributing

The most valuable PRs are **rule updates**: TAG/Cal-GETC change every year. See `rules/README.md` for the format (`source` + `verified_date` required, `unknown` instead of guessing).

## License

MIT — see [LICENSE](LICENSE)

---

## 中文版

**Transfer OS** —— 开源免费的加州转学规划工具。CC 学生查"课能不能转、TAG 够不够格、课程计划有没有白修"，UC 在读生智能选课（P2）。

> ⚠️ 免责声明：规划参考工具，不构成录取保证；数据以学校官网（ASSIST.org、各 UC 官网）为准。

**三个已上线功能**：TAG Guard（6 校 2026-27 官方规则逐项检查）、Articulation 对比器（25 份真实 ASSIST 协议的多校矩阵）、课程计划校验器（白修预警 + 学分浪费计数）。

**定位**：纯工具，不做中介——不做申请代办、不自动递交、不承诺保录、不收订阅费。

**架构原则**：规则引擎做判定（零幻觉），LLM 只做解释；数据诚实（无"独家 API"话术）；离线优先。

路线图与英文版一致。欢迎贡献规则库 PR（每年 TAG 规则变更靠社区一起维护）。
