# End-to-end suite

Drives the **installed** Data Dimension Disabler app in a real browser against
a real DHIS2 instance, and cross-checks every UI claim against the Web API.
One run covers the full life cycle of the app's SQL view: create → read →
filter/sort → disable a dimension of each type → remove → detect and update a
legacy view → permission errors — and leaves the instance as it found it
(view installed, every dimension re-enabled, throwaway user deleted).

The suite is parameterised by environment variables only; no host, UID or
credential is hard-coded, so the same run works on any version from 2.40 up.

## Requirements

- Python 3 with Playwright and a Chromium build (`pip install playwright`,
  `playwright install chromium`).
- The app installed on the target instance:

    ```
    yarn build
    curl -u "$DHIS2_USER:$DHIS2_PASS" -F "file=@build/bundle/data-dimension-disabler-1.0.0.zip" \
        "$DHIS2_URL/api/apps"      # 204 on <= 2.41, 201 on 2.42+
    ```

## Running

```bash
DHIS2_URL=http://dhis2-example:8080 python3 e2e/run_suite.py
```

| Variable                          | Default              | Meaning                                                                        |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `DHIS2_URL`                       | _(required)_         | Instance base URL                                                              |
| `DHIS2_USER` / `DHIS2_PASS`       | `admin` / `district` | Account the app is driven as                                                   |
| `E2E_LABEL`                       | server version       | Label in results and screenshot names                                          |
| `E2E_OUT_DIR`                     | `e2e/results`        | Screenshots + `results-<label>.{json,md}`                                      |
| `E2E_FLOWS`                       | all                  | Comma-separated flow ids to run                                                |
| `E2E_HEADED`                      | –                    | `1` to watch the browser                                                       |
| `E2E_SUPERUSER` / `E2E_SUPERPASS` | –                    | ALL-authority account used **only** to create the throwaway limited user       |
| `DHIS2_LIMITED_PASSWORD`          | `Limited123!`        | Password set on the throwaway limited user created for the `limited-user` flow |

`E2E_SUPERUSER` is needed on the DHIS2 demo databases: their `admin` has
neither `ALL` nor the generated `M_<app>` authority, so it cannot grant a role
containing them (`E3003`) and the limited-user flow is skipped/fails without
it. Broker instances ship `local_admin` / `district`, which has `ALL`:

```bash
DHIS2_URL=http://dhis2-example:8080 \
E2E_SUPERUSER=local_admin E2E_SUPERPASS=district \
python3 e2e/run_suite.py
```

The runner exits non-zero if any step fails, prints one line per step, and
writes the same table to `results-<label>.md` next to the screenshots.

## Flows

| Id                 | What it proves                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load-missing`     | Fresh load with no view shows the create notice; exactly one header bar (top level ≤2.41, global-shell iframe 2.42+)                                                                                             |
| `create-view`      | Create installs the view with the expected name and `r-r-----` sharing; the table lists all four dimension types; every row matches the `/sqlViews/{id}/data` payload; records the data endpoint's response time |
| `filter-sort`      | Each type filter shows exactly that type's rows; name and views sort, both directions                                                                                                                            |
| `disable-per-type` | Disables the least-viewed object of each type: dialog names object and type, the row disappears, a success alert names it, and the API reports `dataDimension=false`                                             |
| `re-enable`        | Puts every disabled dimension back (also runs unconditionally at the end of a run)                                                                                                                               |
| `remove-recreate`  | Remove returns to the create notice (view really gone), creating again restores the table                                                                                                                        |
| `data-error`       | With data read removed from the view's sharing, `/data` answers 409 E4312: the app shows the server message, keeps "Remove SQL view" available, and Retry recovers                                               |
| `outdated-update`  | A legacy category-only view (old name, `rwrw----`) is detected as outdated and updated in place: same UID, new name, `r-r-----`                                                                                  |
| `limited-user`     | A user without the SQL view authority sees the server's message plus the "Add/Update SQL view" hint, and the app does not crash                                                                                  |
| `restore-view`     | Leaves the view installed for the next run                                                                                                                                                                       |
| `console-clean`    | No app console errors, no React duplicate-key warnings, no unexpected 4xx/5xx                                                                                                                                    |

Platform noise that is not the app's doing (the PWA "not a secure context"
message on plain http, the shell's optional `staticContent/logo_banner` and
`dataStore/custom-translations` 404s, and the expected 404 while the view is
missing) is filtered in `app_driver.BENIGN_CONSOLE` / `BENIGN_HTTP_404`.

## Known test-oracle gaps

Two findings from `docs/review-2026-09-21/REVIEW-FINDINGS.md` are gaps in
this suite's own oracles, not app defects:

- **L9.** `e2e/flows.py`'s `restore-view` step assumes a notice box is
  always present — test-suite-only, not an app defect. `flow_restore_view`
  (`e2e/flows.py`) calls `ui.notice_title(frame)`, which waits for
  `NOTICE_BOX` to become visible, then only acts if its text contains
  `MISSING_NOTICE`. In the normal full run this works because the preceding
  `limited-user` step (`_ensure_limited_user` / `flow_limited_user`) always
  deletes the SQL view before returning, so `restore-view` reliably finds
  the MISSING notice and recreates the view. When `limited-user` is
  excluded from `E2E_FLOWS` and the preceding `outdated-update` step
  already leaves the view installed and `READY`, `restore-view` opens the
  app straight to the usage table — no notice box ever appears — and
  `notice_title()` times out, raising an exception that is reported as a
  suite FAIL. Fix (test suite, not app code): have `flow_restore_view`
  check whether the table is already rendered before waiting for a notice
  box, e.g. `if frame.locator(ui.USAGE_TABLE).count() > 0: return PASS`
  short-circuit, or document that `limited-user` must run whenever
  `restore-view` does.
- **L10.** `e2e/flows.py`'s name-sort assertion is not locale-aware, unlike
  the app it is testing — test-suite-only, not an app defect.
  `_sort_checks` (`e2e/flows.py:240-251`) computes the expected
  ascending/descending order with Python's `sorted(names, key=str.lower)`,
  i.e. plain code-point comparison after lowercasing. The app itself sorts
  with `a.localeCompare(b, undefined, { sensitivity: 'base' })`
  (`src/components/usageTableUtils.ts:10`), which is correct — ICU
  collation, not naive code-point order, is the right choice for a name
  column. The two orderings usually agree, but seeds with names built from
  `<`, `(`, `,`, and digits expose the gap (verified directly in Node, the
  same V8/ICU engine Chromium uses: `"Age(<1 Yr, 50+Yrs)".localeCompare(
"Age(0-4Yrs,25-49Yrs,50+Yrs)", undefined, {sensitivity: "base"})` returns
  `-1`, i.e. the app's displayed order is the _correct_ `localeCompare`
  order; the suite's Python comparator is simply the wrong oracle for that
  data). Fix (test suite, not app code): reimplement the expected order
  with the same comparator the app uses — either compare through a
  headless JS `localeCompare` call (e.g. via `page.evaluate`) instead of
  Python's `sorted`, or drop the strict-order assertion in favour of a
  weaker check (e.g. "every adjacent pair compares as ≤ under the same rule
  the row values were shown in").

## Files

- `run_suite.py` — entry point: settings, browser, flow loop, results
- `flows.py` — one function per flow
- `app_driver.py` — frame lookup, selectors, console recorder, screenshots
- `dhis2_api.py` — small REST client (session cookie, SQL view, JSON Patch)
- `legacy_sql_view.py` — the pre-migration view definition, for `outdated-update`

Output (`e2e/results/`) is gitignored.
