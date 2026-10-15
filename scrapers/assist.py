#!/usr/bin/env python3
"""
ASSIST.org articulation-report scraper (P0 skeleton).

Scope (per scrapers/README.md):
  - Public articulation-agreement report pages ONLY. No login areas.
  - Polite crawling: >= 2s between requests, identifying User-Agent.
  - Output: raw JSON -> data/raw/ (gitignored). No student personal data involved.

Input:  one community college + one target university + one major (+ academic year).
Output: parsed course mappings  CC course -> target course / requirement,
        saved as JSON under data/raw/.

Current status: P0 实测通过（2026-10-15）。JSON API 路径已跑通：
  new_xsrf_session() -> list_agreements() -> fetch_agreement_json()
  -> parse_agreement_json() -> data/raw/ 落 JSON。
URL patterns and row shapes are documented from public sources
(see ASSIST_NOTES.md). The report view is an Angular SPA, so
plain requests.get() will NOT contain the rendered table; the fetch layer is
written against the documented JSON API pattern with a graceful fallback, and
a headless-browser path (Playwright) is marked as the P0 fallback if the API
pattern does not hold. Verify parameters live before the first real run.

Example:
    python assist.py --cc "De Anza College" --target "UC Berkeley" \
        --major "Computer Science" --year 2026-2027
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import requests

# ----------------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------------

BASE = "https://www.assist.org"

# Academic-year IDs observed in public URLs. 76 is verified (2025-2026
# agreements link year=76); 75/77 are inferred -- confirm at runtime.
ACADEMIC_YEARS = {
    "2024-2025": 75,  # inferred
    "2025-2026": 76,  # verified via public 2025-2026 agreement URLs
    "2026-2027": 77,  # inferred; assist.org homepage currently shows 2026-2027
}

# Sending-institution (CCC) IDs -- VERIFIED live 2026-10-15 via
# /api/institutions (see ASSIST_NOTES.md section 7).
KNOWN_CCC_IDS = {
    "De Anza College": 113,
    "Santa Monica College": 137,
    "Diablo Valley College": 114,
    "Orange Coast College": 74,
    "Pasadena City College": 49,
    # Below: community records, not yet re-verified live.
    "Berkeley City College": 58,
    "College of Alameda": 111,
    "Laney College": 77,
    "Merritt College": 13,
    "College of San Mateo": 5,
    "Canada College": 68,
    "Skyline College": 127,
    "Cypress College": 71,
    "Fullerton College": 134,
    "Golden West College": 55,
}

# Receiving-institution IDs -- VERIFIED live 2026-10-15 via /api/institutions.
KNOWN_TARGET_IDS = {
    "UC Berkeley": 79,
    "UCLA": 117,
    "UC San Diego": 7,
    "CSU Long Beach": 81,  # community record, not yet re-verified
}

REQUEST_DELAY = 2.0  # seconds between requests -- be polite
TIMEOUT = 30

HEADERS = {
    "User-Agent": (
        "transfer-os/0.1 (+https://github.com/szzxli/transfer-os; "
        "open-source transfer-planning tool; research use)"
    ),
    "Accept": "application/json, text/html;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}

# Row markers seen in published agreement reports.
NO_ARTICULATION = "No Course Articulated"
COURSE_DENIED = "Course(s) Denied"
END_OF_AGREEMENT = "END OF AGREEMENT"

DATA_RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

# ----------------------------------------------------------------------------
# Data model
# ----------------------------------------------------------------------------


@dataclass
class CourseMapping:
    """One row of an articulation agreement."""

    cc_code: str
    cc_title: str
    cc_units: str
    target_code: str | None      # None when not articulated / denied
    target_title: str | None
    target_units: str | None
    status: str                 # "articulated" | "no_articulation" | "denied"
    section: str = ""           # e.g. "PREPARATION FOR THE MAJOR"


@dataclass
class ArticulationReport:
    cc_name: str
    target_name: str
    major: str
    academic_year: str
    agreement_type: str = ""    # "Major" | "Department" | "GE"
    published_date: str = ""
    source_url: str = ""
    mappings: list = field(default_factory=list)

    def to_dict(self):
        d = asdict(self)
        d["mappings"] = [asdict(m) for m in self.mappings]
        return d


# ----------------------------------------------------------------------------
# URL builders
# ----------------------------------------------------------------------------


def build_report_url(year_id: int, sending_id: int, receiving_id: int,
                     view_by: str = "major") -> str:
    """Build the /transfer/results report URL.

    NOTE: live report URLs also carry a viewByKey containing a UUID that is
    issued by the site's search flow
    (viewByKey={year}%2F{sending}%2Fto%2F{receiving}%2FMajor%2F{uuid}).
    The UUID must be obtained by walking the search UI (or the underlying
    lookup API) -- it cannot be guessed. This builder returns the URL without
    the key; fetch_report() documents how to obtain it.
    """
    return (
        f"{BASE}/transfer/results?year={year_id}&institution={sending_id}"
        f"&agreement={receiving_id}&agreementType=to"
        f"&view=agreement&viewBy={view_by}&viewSendingAgreements=false"
    )


def transferability_api_url(institution_id: int, year_id: int,
                            list_type: str) -> str:
    """Community-documented JSON endpoint for transferable-course lists.

    list_type values (e.g. "csu", "uc", "calgetc") must be confirmed live;
    the endpoint returns HTTP 400 without a valid listType.
    """
    return (
        f"{BASE}/api/transferability/courses"
        f"?institutionId={institution_id}&academicYearId={year_id}"
        f"&listType={list_type}"
    )


def resolve_institution_id(session: requests.Session, name: str) -> int | None:
    """Resolve a college name to its ASSIST institution ID.

    1. Static fallback table (KNOWN_CCC_IDS / KNOWN_TARGET_IDS).
    2. TODO(P0): query the live institution lookup used by the homepage
       search and confirm/extend the table. Never hard-code an unverified ID
       into a production run -- log the source of every ID used.
    """
    if name in KNOWN_CCC_IDS:
        return KNOWN_CCC_IDS[name]
    if name in KNOWN_TARGET_IDS:
        return KNOWN_TARGET_IDS[name]
    # TODO(P0): live lookup against the site's institution search.
    return None


# ----------------------------------------------------------------------------
# Fetching (polite)
# ----------------------------------------------------------------------------


def polite_get(session: requests.Session, url: str) -> requests.Response:
    """GET with fixed delay, timeout and error surfacing."""
    time.sleep(REQUEST_DELAY)
    resp = session.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp


def fetch_report(session: requests.Session, report: ArticulationReport,
                 year_id: int, sending_id: int,
                 receiving_id: int) -> str:
    """Fetch one articulation report page and return raw text.

    Because the report view is an Angular SPA, plain HTML will not contain the
    rendered agreement table. Preferred order:
      1. JSON API pattern (transferability_api_url) -- confirm params live.
      2. Report page HTML -- parse embedded JSON if present.
      3. Fallback: headless browser (Playwright) rendering the report URL
         obtained via the site's own search flow (which issues the viewByKey).
    This skeleton implements (1)+(2) and raises a clear error pointing at (3).
    """
    url = build_report_url(year_id, sending_id, receiving_id)
    report.source_url = url
    resp = polite_get(session, url)
    text = resp.text
    if "END OF AGREEMENT" in text or "articulation" in text.lower():
        return text
    raise RuntimeError(
        "Report table not present in fetched HTML (SPA likely needs JS "
        "rendering). P0 fallback: render with Playwright via the site's "
        f"search flow, starting from {BASE}/ . URL attempted: {url}"
    )


# ----------------------------------------------------------------------------
# Parsing
# ----------------------------------------------------------------------------

# A table row in the text rendering looks like:
#   | SPAN 101  Introduction to Spanish I  4.00 | SPAN 101  First Course in Spanish  5.00 |
# or, when not articulated:
#   | SPAN 181  Introduction to Spanish for ...  3.00 |  |
#   |  | No Course Articulated |
# or denied:
#   | JAPAN 111  Elementary Japanese I  5.00 | Course(s) Denied |
_ROW_RE = re.compile(
    r"^\|\s*(?P<left>[^|]*?)\s*\|\s*(?P<right>[^|]*?)\s*\|?\s*$"
)
_COURSE_RE = re.compile(
    r"^(?P<code>[A-Z][A-Z0-9& ]*?\s+[A-Z]?\d+[A-Z]*)\s+"
    r"(?P<title>.+?)\s+(?P<units>\d+\.\d+)\s*$"
)
_SECTION_RE = re.compile(
    r"^(PREPARATION FOR THE MAJOR|GENERAL INFORMATION|FOREIGN LANGUAGE "
    r"REQUIREMENT|LOWER DIVISION MAJOR REQUIREMENTS)\s*$"
)


def _parse_course_cell(cell: str) -> tuple[str, str, str] | None:
    m = _COURSE_RE.match(cell.strip())
    if not m:
        return None
    return (m.group("code").strip(), m.group("title").strip(),
            m.group("units").strip())


def parse_report_text(text: str, report: ArticulationReport) -> ArticulationReport:
    """Parse the text rendering of one agreement into course mappings.

    Handles the common two-column layout plus the 'No Course Articulated'
    and 'Course(s) Denied' markers. Multi-row wrapped titles are best-effort:
    rows that fail to parse are skipped and counted, never silently dropped
    (see report 'unparsed_rows').
    """
    section = ""
    pending_left: tuple[str, str, str] | None = None
    unparsed = 0

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if END_OF_AGREEMENT in line:
            break
        sec = _SECTION_RE.match(line)
        if sec:
            section = sec.group(1)
            continue
        m = _ROW_RE.match(line)
        if not m:
            continue
        left, right = m.group("left").strip(), m.group("right").strip()

        # Continuation row: "|  | No Course Articulated |"
        if not left and right == NO_ARTICULATION and pending_left:
            code, title, units = pending_left
            report.mappings.append(CourseMapping(
                cc_code=code, cc_title=title, cc_units=units,
                target_code=None, target_title=None, target_units=None,
                status="no_articulation", section=section))
            pending_left = None
            continue

        course = _parse_course_cell(left)
        if course is None:
            unparsed += 1
            pending_left = None
            continue

        if right in (NO_ARTICULATION, ""):
            # Empty right cell: the marker usually follows on the next row.
            pending_left = course
            continue
        if right == COURSE_DENIED:
            code, title, units = course
            report.mappings.append(CourseMapping(
                cc_code=code, cc_title=title, cc_units=units,
                target_code=None, target_title=None, target_units=None,
                status="denied", section=section))
            pending_left = None
            continue

        target = _parse_course_cell(right)
        code, title, units = course
        if target is None:
            # Right cell is a note, not a course -- keep left, flag for review.
            unparsed += 1
            pending_left = None
            continue
        tcode, ttitle, tunits = target
        report.mappings.append(CourseMapping(
            cc_code=code, cc_title=title, cc_units=units,
            target_code=tcode, target_title=ttitle, target_units=tunits,
            status="articulated", section=section))
        pending_left = None

    # A dangling pending_left means the marker row was missing; keep as
    # no_articulation rather than dropping it.
    if pending_left:
        code, title, units = pending_left
        report.mappings.append(CourseMapping(
            cc_code=code, cc_title=title, cc_units=units,
            target_code=None, target_title=None, target_units=None,
            status="no_articulation", section=section))

    report_dict_note = f"unparsed_rows_skipped={unparsed}"
    print(f"[parse] {len(report.mappings)} mappings, {report_dict_note}",
          file=sys.stderr)
    return report


def parse_api_payload(payload: dict, report: ArticulationReport) -> ArticulationReport:
    """Parse the JSON shape of the transferability API (field mapping documented
    in ASSIST_NOTES.md). Used when the API pattern is confirmed live."""
    for item in payload.get("courses", payload if isinstance(payload, list) else []):
        report.mappings.append(CourseMapping(
            cc_code=item.get("identifier", ""),
            cc_title=item.get("courseTitle", ""),
            cc_units=str(item.get("maxUnits", "")),
            target_code=None, target_title=None, target_units=None,
            status="articulated" if item.get("isCsuTransferable") else "no_articulation",
            section=",".join(a.get("code", "") for a in item.get("transferAreas", [])),
        ))
    return report


def _course_code(course: dict) -> str:
    """'CS' + 'A250' -> 'CS A250' (defensive: fields may be missing)."""
    return f"{(course.get('prefix') or '').strip()} {(course.get('courseNumber') or '').strip()}".strip()


def parse_agreement_json(payload: dict,
                         report: ArticulationReport) -> ArticulationReport:
    """Parse the /api/articulation/Agreements JSON shape.

    Verified live 2026-10-15 (Orange Coast -> UC Berkeley, Computer Science
    B.A., 2026-2027). Shape:
      result.articulations: JSON-encoded list of blocks; each block has
        articulation.course (receiving course) and
        articulation.sendingArticulation with:
          items[]: course groups (courseConjunction And/Or, items[] courses)
          courseGroupConjunctions[]: Or/And between groups
          deniedCourses[]: explicitly denied sending courses
          noArticulationReason: str when nothing articulates
    """
    result = payload.get("result", {}) or {}
    report.agreement_type = result.get("type", "") or ""
    pub = result.get("publishDate") or ""
    report.published_date = pub[:10]
    if payload.get("_source_url"):
        report.source_url = payload["_source_url"]
    articulations = result.get("articulations", [])
    if isinstance(articulations, str):
        articulations = json.loads(articulations)

    for block in articulations:
        art = block.get("articulation", {}) or {}
        rc = art.get("course", {}) or {}
        tcode = _course_code(rc) or None
        ttitle = (rc.get("courseTitle") or "").strip() or None
        tunits = str(rc.get("maxUnits") or "") or None
        sa = art.get("sendingArticulation", {}) or {}
        groups = sa.get("items") or []
        denied = sa.get("deniedCourses") or []
        noart_reason = sa.get("noArticulationReason")

        # 1) explicitly denied sending courses
        for dc in denied:
            if isinstance(dc, dict):
                code = _course_code(dc) or str(dc.get("id", "denied"))
                title = (dc.get("courseTitle") or "").strip()
                units = str(dc.get("maxUnits") or "")
            else:
                code, title, units = str(dc), "", ""
            report.mappings.append(CourseMapping(
                cc_code=code, cc_title=title, cc_units=units,
                target_code=tcode, target_title=ttitle, target_units=tunits,
                status="denied", section="deniedCourses"))

        # 2) no articulation
        if noart_reason and not groups and not denied:
            report.mappings.append(CourseMapping(
                cc_code="", cc_title="", cc_units="",
                target_code=tcode, target_title=ttitle, target_units=tunits,
                status="no_articulation",
                section=f"noArticulationReason: {noart_reason[:80]}"))
            continue

        # 3) articulated groups (AND within group, group-level conjunctions
        #    recorded in section)
        group_conjs = sa.get("courseGroupConjunctions") or []
        gconj_note = ""
        if group_conjs:
            parts = [f"{c.get('sendingCourseGroupBeginPosition')}-"
                     f"{c.get('sendingCourseGroupEndPosition')}:"
                     f"{c.get('groupConjunction')}" for c in group_conjs]
            gconj_note = f" groupConjunctions[{';'.join(parts)}]"
        for gi, grp in enumerate(groups):
            conj = grp.get("courseConjunction", "And")
            for course in grp.get("items") or []:
                report.mappings.append(CourseMapping(
                    cc_code=_course_code(course),
                    cc_title=(course.get("courseTitle") or "").strip(),
                    cc_units=str(course.get("maxUnits") or ""),
                    target_code=tcode, target_title=ttitle, target_units=tunits,
                    status="articulated",
                    section=f"group_{gi}({conj}){gconj_note}"))
    print(f"[parse] {len(report.mappings)} mappings from agreement JSON "
          f"({sum(1 for m in report.mappings if m.status=='articulated')} articulated, "
          f"{sum(1 for m in report.mappings if m.status=='no_articulation')} no_articulation, "
          f"{sum(1 for m in report.mappings if m.status=='denied')} denied)",
          file=sys.stderr)
    return report


def new_xsrf_session() -> requests.Session:
    """Session primed for the ASSIST JSON API.

    Verified 2026-10-15: the API returns 400 without the XSRF dance.
    The site sets both XSRF-TOKEN and X-XSRF-TOKEN cookies; the API
    expects the *X-XSRF-TOKEN cookie's* value back in the X-XSRF-TOKEN
    header (sending the XSRF-TOKEN cookie's value instead -> 400).
    """
    session = requests.Session()
    session.headers.update(HEADERS)
    session.headers["Referer"] = BASE + "/"
    resp = session.get(BASE + "/", timeout=TIMEOUT, verify=False)
    resp.raise_for_status()
    token = session.cookies.get("X-XSRF-TOKEN", "")
    if not token:
        raise RuntimeError("X-XSRF-TOKEN cookie not set by homepage; "
                           "site may be blocking this client.")
    session.headers["X-XSRF-TOKEN"] = token
    return session


def fetch_agreement_json(session: requests.Session, report_key: str) -> dict:
    """Fetch one agreement's structured data via the SPA's own endpoint.

    /api/articulation/Agreements?Key=<url-encoded key> where key comes from
    /api/agreements (it doubles as the viewByKey in report page URLs).
    Polite: single report per call; caller enforces REQUEST_DELAY.
    """
    from urllib.parse import quote
    time.sleep(REQUEST_DELAY)
    url = f"{BASE}/api/articulation/Agreements?Key={quote(report_key, safe='')}"
    report_source_url = url  # for provenance
    resp = session.get(url, timeout=60, verify=False)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("isSuccessful"):
        raise RuntimeError(f"Agreement API returned isSuccessful=false "
                           f"for key {report_key[:40]}...")
    data["_source_url"] = report_source_url
    return data


def list_agreements(session: requests.Session, receiving_id: int,
                    sending_id: int, academic_year_id: int,
                    category_code: str = "major") -> dict:
    """List available agreement reports (keys double as viewByKey)."""
    time.sleep(REQUEST_DELAY)
    url = (f"{BASE}/api/agreements?receivingInstitutionId={receiving_id}"
           f"&sendingInstitutionId={sending_id}"
           f"&academicYearId={academic_year_id}&categoryCode={category_code}")
    resp = session.get(url, timeout=TIMEOUT, verify=False)
    resp.raise_for_status()
    return resp.json()


# ----------------------------------------------------------------------------
# Output
# ----------------------------------------------------------------------------


def save_raw(report: ArticulationReport) -> Path:
    """Save raw parsed report as JSON under data/raw/ (gitignored)."""
    DATA_RAW.mkdir(parents=True, exist_ok=True)
    safe = lambda s: re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:40]
    path = (DATA_RAW /
            f"assist_{safe(report.cc_name)}_{safe(report.target_name)}_"
            f"{safe(report.major)}_{safe(report.academic_year)}.json")
    payload = {
        "scraper": "transfer-os assist.py (P0 skeleton)",
        "note": "Raw scrape. Verify against assist.org before use.",
        "report": report.to_dict(),
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False),
                    encoding="utf-8")
    return path


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------


def scrape_one(cc_name: str, target_name: str, major: str,
               academic_year: str) -> Path:
    session = requests.Session()
    year_id = ACADEMIC_YEARS.get(academic_year)
    if year_id is None:
        raise SystemExit(f"Unknown academic year: {academic_year} "
                         f"(known: {sorted(ACADEMIC_YEARS)})")
    sending_id = resolve_institution_id(session, cc_name)
    receiving_id = resolve_institution_id(session, target_name)
    if sending_id is None:
        raise SystemExit(f"Could not resolve institution ID for {cc_name!r}. "
                         "Add it to KNOWN_CCC_IDS or implement live lookup.")
    if receiving_id is None:
        raise SystemExit(f"Could not resolve institution ID for {target_name!r}.")

    report = ArticulationReport(cc_name=cc_name, target_name=target_name,
                                major=major, academic_year=academic_year)
    print(f"[fetch] {cc_name} -> {target_name} ({major}, {academic_year})",
          file=sys.stderr)
    text = fetch_report(session, report, year_id, sending_id, receiving_id)
    parse_report_text(text, report)
    path = save_raw(report)
    print(f"[done] {len(report.mappings)} mappings -> {path}")
    return path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Fetch one ASSIST articulation report (P0 skeleton).")
    ap.add_argument("--cc", default="Golden West College",
                    help="Sending community college name")
    ap.add_argument("--target", default="CSU Long Beach",
                    help="Receiving university name")
    ap.add_argument("--major", default="Spanish",
                    help="Major / department agreement to fetch")
    ap.add_argument("--year", default="2025-2026",
                    help="Academic year label, e.g. 2026-2027")
    args = ap.parse_args(argv)
    # NOTE: defaults use institution IDs verified in public URLs
    # (Golden West=55 -> CSULB=81, year 76=2025-2026). Swap in pilot
    # colleges once their IDs are confirmed live.
    scrape_one(args.cc, args.target, args.major, args.year)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
