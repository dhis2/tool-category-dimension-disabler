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

| Variable                          | Default              | Meaning                                                                  |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `DHIS2_URL`                       | _(required)_         | Instance base URL                                                        |
| `DHIS2_USER` / `DHIS2_PASS`       | `admin` / `district` | Account the app is driven as                                             |
| `E2E_LABEL`                       | server version       | Label in results and screenshot names                                    |
| `E2E_OUT_DIR`                     | `e2e/results`        | Screenshots + `results-<label>.{json,md}`                                |
| `E2E_FLOWS`                       | all                  | Comma-separated flow ids to run                                          |
| `E2E_HEADED`                      | –                    | `1` to watch the browser                                                 |
| `E2E_SUPERUSER` / `E2E_SUPERPASS` | –                    | ALL-authority account used **only** to create the throwaway limited user |

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

## Known failing step

`disable-per-type / Success alert names the disabled object` fails for the
second and fourth disable on every version tested. That is finding **M1** in
`docs/review-2026-09-21/REVIEW-FINDINGS.md`, not a flaky test: `useAlert`
reuses one alert slot, so a second toast raised within the first one's 8 s
auto-hide window inherits the expiring timer and disappears immediately. The
step should pass once M1 is fixed.

## Files

- `run_suite.py` — entry point: settings, browser, flow loop, results
- `flows.py` — one function per flow
- `app_driver.py` — frame lookup, selectors, console recorder, screenshots
- `dhis2_api.py` — small REST client (session cookie, SQL view, JSON Patch)
- `legacy_sql_view.py` — the pre-migration view definition, for `outdated-update`

Output (`e2e/results/`) is gitignored.
