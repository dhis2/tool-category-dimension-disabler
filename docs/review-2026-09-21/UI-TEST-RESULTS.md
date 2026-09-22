# UI test results: Data Dimension Disabler 1.0.0

Tested: 2026-09-21 · Driven as the **installed production bundle**
(`build/bundle/data-dimension-disabler-1.0.0.zip` at
`<base>/api/apps/data-dimension-disabler/index.html`), not the dev server ·
Suite: `e2e/run_suite.py` (Python Playwright, Chromium 153)

Every row below is one step of that suite. The suite asserts against the Web
API as well as the DOM, so "PASS" means the screen and the server agree.
Columns for 2.41, 2.42 and the Laos 2.43 instance are left for the later
passes of this review.

## Instances

| Label | URL | DHIS2 version | Source |
|---|---|---|---|
| 2.40.12 | `http://dhis2-agent-cdd-sl40:8080` | 2.40.12 (rev 82b6022) | broker, seed `dhis2-db-sierra-leone_V40.sql.gz` |
| 2.41 | – | – | later pass (`agent-cdd-emis41`, edu-meta seed) |
| 2.42 | – | – | later pass (`agent-cdd-ehr42`, ehr-meta seed) |
| 2.43.1 | `http://dhis2-agent-cdd-sl43:8080` | 2.43.1 (rev 9cbfbf3) | broker, seed `dhis2-db-sierra-leone_v43.sql.gz` |
| 2.43 Laos | – | – | later pass (`agent-cdd-lao43`, lao_hmis_demo v43) |

Test data on both instances: 23 objects with `dataDimension = true`
(12 categories, 4 org unit group sets, 5 data element group sets, 2 category
option group sets), plus favorite-view events recorded through
`POST /api/dataStatistics` — including 7 `MAP_VIEW` events on map
`X7x2WOLhCA8`, whose map views carry org-unit-group-set dimensions, so the
`mapmapviews` correction is actually exercised (see "Counts verified against
SQL" below).

## Results

| Step | 2.40.12 | 2.41 | 2.42 | 2.43.1 | 2.43 Laos | Notes |
|---|---|---|---|---|---|---|
| Fresh load shows the "SQL view not installed" notice | PASS | | | PASS | | screenshots `*-01-missing-notice.png` |
| Exactly one header bar renders | PASS | | | PASS | | 2.40 top level; 2.43 inside the global-shell iframe, the app's own header hidden by the shell — no double header |
| Create SQL view yields the usage table | PASS | | | PASS | | `*-02-table.png` |
| Created view has the expected name and `r-r-----` sharing | PASS | | | PASS | | `name='Data dimension usage'` |
| `/sqlViews/{id}/data` responds | PASS (23 rows) | | | PASS (23 rows) | | |
| Response time of `/sqlViews/{id}/data` | 106 ms | | | 116 ms | | INFO; 95–133 ms across runs on both. Measure again on the Laos instance |
| Table row count matches the payload | PASS (23/23) | | | PASS (23/23) | | `paging=false` is sent and honoured |
| Row count label matches the rows shown | PASS | | | PASS | | "23 enabled dimensions" |
| Every row shows the view count the server returned | PASS | | | PASS | | |
| All four dimension types appear | PASS | | | PASS | | Category, Organisation unit group set, Data element group set, Category option group set |
| Filter "Category" | PASS (12) | | | PASS (12) | | |
| Filter "Organisation unit group set" | PASS (4) | | | PASS (4) | | |
| Filter "Data element group set" | PASS (5) | | | PASS (5) | | |
| Filter "Category option group set" | PASS (2) | | | PASS (2) | | `*-03-filter.png` |
| Sort by name, ascending / descending | PASS | | | PASS | | `*-04-sorted.png` |
| Sort by views, ascending / descending | PASS | | | PASS | | 2.40 top: 15/8/7; 2.43 top: 30/20/7 |
| Disable dialog names the object and its type (all four types) | PASS | | | PASS | | `*-06-disable-dialog.png` |
| Row disappears after confirming (all four types) | PASS | | | PASS | | `*-05-after-disable.png` |
| Server reports `dataDimension=false` (all four types) | PASS | | | PASS | | verified per type via `GET /api/<resource>/<uid>?fields=dataDimension` |
| Success alert names the disabled object | **FAIL (2 of 4)** | | | **FAIL (2 of 4)** | | finding **M1** — the 2nd and 4th toast are swallowed; identical on both versions |
| Re-enable each disabled dimension (cleanup) | PASS | | | PASS | | JSON Patch `value: true`, verified by read-back |
| Remove SQL view returns to the create notice | PASS | | | PASS | | view really deleted (`404`), `*-07-removed.png` |
| Creating the view again restores the table | PASS | | | PASS | | |
| Data-read error (409 E4312) shows the server message | PASS | | | PASS | | `*-11-data-error.png` |
| "Remove SQL view" stays available in the error state | PASS | | | PASS | | |
| Retry loads the table once access is restored | PASS | | | PASS | | |
| Legacy category-only view detected as outdated | PASS | | | PASS | | `*-08-outdated-notice.png` |
| Update renames the view in place (same UID) | PASS | | | PASS | | `Category dimension usage` → `Data dimension usage`, UID `GOLswS44mh8` kept |
| Update sets public sharing to `r-r-----` | PASS | | | PASS | | PUT does change sharing on both versions (was `rwrw----`) |
| User without the SQL view authority: server message shown | PASS | | | PASS | | "You don't have the proper permissions to create this object." |
| …and the "Add/Update SQL view" authority is named | PASS | | | PASS | | `*-10-limited-user.png` |
| …and the app does not crash | PASS | | | PASS | | no page errors |
| SQL view left installed at the end | PASS | | | PASS | | |
| No unexpected console errors | PASS | | | PASS | | |
| No React duplicate-key warnings | PASS | | | PASS | | |
| No unexpected HTTP error responses | PASS | | | PASS | | |

Totals per instance: **46 PASS / 2 FAIL / 2 INFO** on 2.40.12 and on 2.43.1.

## Version-specific failures

None. Every difference between 2.40.12 and 2.43.1 was in the platform, not in
the app's behaviour:

- **App hosting**: 2.40 serves `/api/apps/…/index.html` at top level; 2.43
  redirects to `/apps/data-dimension-disabler` and wraps the app in the
  global-shell iframe. The app renders its own `@dhis2/header-bar` in both
  cases; on 2.43 the shell hides it (`display: none`), so exactly one header
  bar is visible on both.
- **SQL**: the view installed on 2.40 uses `dataelementcategory`, the one on
  2.43 uses `category`, as the version branch intends. Both execute.
- **Writes**: JSON Patch `dataDimension` and `PUT /api/sqlViews/{id}` behave
  identically on both sides of the 2.42 boundary.

The only failure, M1, reproduces identically on both versions.

## Counts verified against SQL

The numbers the app shows were checked against the database, not only against
the API. For each instance the installed `sqlQuery` was read back from
`GET /api/sqlViews/GOLswS44mh8?fields=sqlQuery` and executed directly with
`psql`; the result was compared row by row with
`GET /api/sqlViews/GOLswS44mh8/data?paging=false` and with the rendered table.

- 2.43.1 — 23 rows, identical in all three places. Top rows: Location
  Fixed/Outreach 30 (49.2 % / 44.1 %), Facility Type 20, Facility Ownership 7,
  Implementing Partner 4.
- 2.40.12 — 23 rows, identical in all three places. Top rows: Facility Type 15
  (31.25 % / 32.6 %), Implementing Partner 8, Facility Ownership 7, Location
  Fixed/Outreach 6, Diagnosis 5.
- Denominators check out by hand: on 2.40, 46 favorite-view events were
  recorded in the window and Facility Type's 15 views give 15/46 = 32.6 %
  ("% of favorite views") and 15/48 = 31.25 % of the 48 dimension views
  (a favorite using two dimensions counts once for each).
- **The map-view correction is confirmed empirically.** Facility Ownership's 7
  views are exactly the 7 `MAP_VIEW` events recorded against map
  `X7x2WOLhCA8`. All `MAP_VIEW` rows in `datastatisticsevent` carry a **map**
  UID (`SELECT` against `mapview.uid` matches none of them), so the previous
  app's `mapview.uid` join would have counted 0 here.

## Console/network hygiene

No console errors, page errors, React key warnings or unexpected HTTP errors
from the app on either version. Filtered as platform noise, not app defects:

- `Error: This window is not a secure context … PWA features will not work` —
  the App Platform's offline/PWA layer on a plain-http test instance. Logged
  from the app's own bundle on 2.40 and from the shell on 2.43.
- `404 /api/<v>/staticContent/logo_banner` and
  `404 /api/<v>/dataStore/custom-translations/controller` — header-bar/shell
  probes for optional resources.
- `404 /api/<v>/sqlViews/GOLswS44mh8?fields=id,sqlQuery` — the expected probe
  while the view is not installed; it is how the app detects `MISSING`.

## Screenshots

In `screenshots/`, named `<version>-<step>.png`:

| Step | 2.40.12 | 2.43.1 |
|---|---|---|
| Create notice | `2.40.12-01-missing-notice.png` | `2.43.1-01-missing-notice.png` |
| Usage table | `2.40.12-02-table.png` | `2.43.1-02-table.png` |
| Filtered to one type | `2.40.12-03-filter.png` | `2.43.1-03-filter.png` |
| Sorted | `2.40.12-04-sorted.png` | `2.43.1-04-sorted.png` |
| Disable dialog | `2.40.12-06-disable-dialog.png` | `2.43.1-06-disable-dialog.png` |
| After disabling four objects | `2.40.12-05-after-disable.png` | `2.43.1-05-after-disable.png` |
| View removed | `2.40.12-07-removed.png` | `2.43.1-07-removed.png` |
| Outdated (legacy) view notice | `2.40.12-08-outdated-notice.png` | `2.43.1-08-outdated-notice.png` |
| After update | `2.40.12-09-after-update.png` | `2.43.1-09-after-update.png` |
| Limited user, create refused | `2.40.12-10-limited-user.png` | `2.43.1-10-limited-user.png` |
| Data-read error state | `2.40.12-11-data-error.png` | `2.43.1-11-data-error.png` |
