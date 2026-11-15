# Updating the data (yearly checklist)

Transfer-OS and ucplan.org show only what is in these files. Update them when ASSIST publishes a new
academic year (usually the new agreements appear in the fall) or when UC publishes a new TAG matrix.

**Who:** the project maintainer (repo owner) does the pull; a second person (or the maintainer on another
day) reviews the diff before merge.

## 1. Pull the new ASSIST agreements
- Source: public pages on https://assist.org only (see `scrapers/README.md`, `scrapers/ASSIST_NOTES.md`).
  Be gentle with request rates; no logins.
- Output goes to `data/raw/assist_*.json` (git-ignored). One report per community college x UC x major.
- Today this step is run by hand with `scrapers/batch_fetch_v3.py`. Automating it is tracked in the
  agent-hq issue "[to muse] Automate the yearly ASSIST pull + year diff".

## 2. Rebuild the shipped data
```
python3 mobile/scripts/build-data.py        # rewrites mobile/www/js/artic-gz-*.js, tag-data.js, tagchance-data.js, ...
python3 mobile/scripts/build-coverage.py    # rewrites mobile/www/coverage.json (colleges, UC majors, data years)
```
Bump the service-worker cache name (`CACHE` in `mobile/www/sw.js`) and the `?v=` on the script tags in the HTML.

## 3. Verify before release
1. **Diff vs the previous release** (this is the "diff vs last year" for the PR description):
   ```
   git show main:mobile/www/coverage.json > /tmp/coverage-old.json
   python3 mobile/scripts/diff-coverage.py /tmp/coverage-old.json mobile/www/coverage.json
   ```
   Read every line: colleges added/removed, majors added/removed, data-year changes per UC, agreements that
   disappeared. Anything unexpected is a scraper problem, not a data change.
2. **Spot-check 10 reports against assist.org** (open the live ASSIST page, compare a few course rows with the
   tool's Compare page). Include at least one UC from each year group.
3. `python3 mobile/scripts/build-coverage.py --check` must say "up to date".
4. Run the backend tests (`cd backend && pytest tests/ -q`) and click through Compare / TAG / Plan Check in
   English, Spanish and Chinese at 360px width: no console errors, no Chinese text in the English UI.
5. TAG rules: re-read the new UC TAG matrix (https://admission.universityofcalifornia.edu/admission-requirements/transfer-requirements/uc-transfer-programs/transfer-admission-guarantee-tag.html)
   and each campus TAG page; update `rules/<year>/tag/*.yaml` (`source`, `verified_date`) and rebuild.
   The per-campus Computer Science notes in the Compare page (`tagcs_*` keys in `mobile/www/js/i18n.js`) are
   hand-written from the matrix and the UCSC/UCR/UCM pages: re-check them every cycle.

## 4. Release
- Open a PR with the step 3.1 output pasted in. Merge, then check the live site with a cache-busting URL.
- Copy `coverage.json` to the ucplan repo (`python3 scripts/sync_coverage.py` there) and update the
  "Data updated" date on ucplan.org.
- Wrong or stale data found by users: they report it through GitHub Issues
  (https://github.com/szzxli/transfer-os/issues) or info@ucplan.org; fix, re-run steps 2-4.
