# UI test results: Data Dimension Disabler 1.0.0

Tested: 2026-09-21 · Driven as the **installed production bundle**
(`build/bundle/data-dimension-disabler-1.0.0.zip` at
`<base>/api/apps/data-dimension-disabler/index.html`), not the dev server ·
Suite: `e2e/run_suite.py` (Python Playwright, Chromium 153)

Every row below is one step of that suite. The suite asserts against the Web
API as well as the DOM, so "PASS" means the screen and the server agree.
Columns for 2.42 and the Laos 2.43 instance are left for the later passes of
this review; 2.41.10 was completed in review pass B (2026-09-21), against the
EMIS ("edu-meta") seed.

## Instances

| Label | URL | DHIS2 version | Source |
|---|---|---|---|
| 2.40.12 | `http://dhis2-agent-cdd-sl40:8080` | 2.40.12 (rev 82b6022) | broker, seed `dhis2-db-sierra-leone_V40.sql.gz` |
| 2.41.10 | `http://dhis2-agent-cdd-emis41:8080` | 2.41.10 (rev 1a3484f) | broker, seed `dhis2-edu-meta_2026-07-17_v41.sql.gz` (EMIS, "edu-meta") |
| 2.42 | – | – | later pass (`agent-cdd-ehr42`, ehr-meta seed) |
| 2.43.1 | `http://dhis2-agent-cdd-sl43:8080` | 2.43.1 (rev 9cbfbf3) | broker, seed `dhis2-db-sierra-leone_v43.sql.gz` |
| 2.43 Laos | – | – | later pass (`agent-cdd-lao43`, lao_hmis_demo v43) |

Test data on both Sierra Leone instances: 23 objects with `dataDimension =
true` (12 categories, 4 org unit group sets, 5 data element group sets, 2
category option group sets), plus favorite-view events recorded through
`POST /api/dataStatistics` — including 7 `MAP_VIEW` events on map
`X7x2WOLhCA8`, whose map views carry org-unit-group-set dimensions, so the
`mapmapviews` correction is actually exercised (see "Counts verified against
SQL" below).

**2.41.10 (EMIS seed) test data is different in kind, not just size**: the
seed enables 70 objects as data dimensions (62 categories, 7 org unit group
sets, 1 data element group set, **0 category option group sets — the seed
defines none at all**, confirmed by `GET /api/categoryOptionGroupSets`
returning `pager.total: 0`). The seed also has **no `visualizations` and no
`maps`** (`pager.total: 0` for both), only `eventVisualizations` (125 of
them). `scripts/generate-view-events.sh` therefore only ever records
`EVENT_VISUALIZATION_VIEW` events here; see "M2 live check" below. These are
data limitations of the seed, not app defects — recorded per-row below.

## Results

| Step | 2.40.12 | 2.41.10 | 2.42 | 2.43.1 | 2.43 Laos | Notes |
|---|---|---|---|---|---|---|
| Fresh load shows the "SQL view not installed" notice | PASS | PASS | | PASS | | screenshots `*-01-missing-notice.png` |
| Exactly one header bar renders | PASS | PASS | | PASS | | 2.40/2.41 top level; 2.43 inside the global-shell iframe, the app's own header hidden by the shell — no double header |
| Create SQL view yields the usage table | PASS | PASS | | PASS | | `*-02-table.png` |
| Created view has the expected name and `r-r-----` sharing | PASS | PASS | | PASS | | `name='Data dimension usage'` |
| `/sqlViews/{id}/data` responds | PASS (23 rows) | PASS (70 rows) | | PASS (23 rows) | | |
| Response time of `/sqlViews/{id}/data` | 106 ms | 98 ms | | 116 ms | | INFO; 95–133 ms across runs on 2.40/2.43. Measure again on the Laos instance |
| Table row count matches the payload | PASS (23/23) | PASS (70/70) | | PASS (23/23) | | `paging=false` is sent and honoured |
| Row count label matches the rows shown | PASS | PASS | | PASS | | "23 enabled dimensions" on 2.40/2.43; "70 enabled dimensions" on 2.41 |
| Every row shows the view count the server returned | PASS | PASS | | PASS | | |
| All four dimension types appear | PASS | **FAIL** | | PASS | | 2.41: only 3 types shown (Category, Org unit group set, Data element group set) — **not an app bug**: the EMIS seed defines **zero** `categoryOptionGroupSets` at all (`GET /api/categoryOptionGroupSets` → `pager.total: 0`), so that type can never have a row here. Filter dropdown still offers it (next row) and correctly shows 0 rows |
| Filter "Category" | PASS (12) | PASS (62) | | PASS (12) | | |
| Filter "Organisation unit group set" | PASS (4) | PASS (7) | | PASS (4) | | |
| Filter "Data element group set" | PASS (5) | PASS (1) | | PASS (5) | | |
| Filter "Category option group set" | PASS (2) | PASS (0) | | PASS (2) | | `*-03-filter.png`; 2.41: 0 rows shown, 0 expected — correct, the seed has none of this type |
| Sort by name, ascending / descending | PASS | PASS | | PASS | | `*-04-sorted.png` |
| Sort by views, ascending / descending | PASS | PASS | | PASS | | 2.40 top: 15/8/7; 2.41 top: 13/11/9; 2.43 top: 30/20/7 |
| Disable dialog names the object and its type (all four types) | PASS | PASS (3 of 4) | | PASS | | `*-06-disable-dialog.png`; 2.41: Category option group set **SKIPPED** (no enabled object of that type exists to disable) |
| Row disappears after confirming (all four types) | PASS | PASS (3 of 4) | | PASS | | `*-05-after-disable.png`; 2.41: same skip as above |
| Server reports `dataDimension=false` (all four types) | PASS | PASS (3 of 4) | | PASS | | verified per type via `GET /api/<resource>/<uid>?fields=dataDimension`; 2.41: same skip as above |
| Success alert names the disabled object | **FAIL (2 of 4)** | **PASS (3 of 3 disabled)** | | **FAIL (2 of 4)** | | finding **M1**, fixed in `2c997df`. 2.41 disabled Category, Org unit group set, and Data element group set in succession (Category option group set skipped, none exist) — **all three toasts appeared**, confirming the fix live on this instance |
| Re-enable each disabled dimension (cleanup) | PASS | PASS | | PASS | | JSON Patch `value: true`, verified by read-back |
| Remove SQL view returns to the create notice | PASS | PASS | | PASS | | view really deleted (`404`), `*-07-removed.png` |
| Creating the view again restores the table | PASS | PASS | | PASS | | |
| Data-read error (409 E4312) shows the server message | PASS | **FAIL** | | PASS | | `*-11-data-error.png`. **Not an app bug — instance limitation**: on this EMIS seed, `admin` (and the broker's `local_admin`) both hold the `Superuser` role with `ALL`, and `admin` is also the SQL view's owner; DHIS2 grants owners/superusers full access regardless of `sharing.public`, so setting `public: r-------` has no effect when driven as either account and `/data` keeps answering 200. Unlike the Sierra Leone seeds' limited demo `admin`, no standard account on this instance can be denied data read. Confirmed by `GET /api/me` as both `admin` and `local_admin`: both report `authorities: ["ALL"]` |
| "Remove SQL view" stays available in the error state | PASS | N/A | | PASS | | not reached — the error state above never occurs on this instance |
| Retry loads the table once access is restored | PASS | N/A | | PASS | | not reached, same reason |
| Legacy category-only view detected as outdated | PASS | PASS | | PASS | | `*-08-outdated-notice.png`. 2.41 verified with **two** legacy definitions: the suite's synthetic one (`legacy_sql_view.py`) during the automated run, and separately, by hand, the actual historical `sql_view_41` object from `git show 7b8c7e1:src/app.js` (Task 14 step 4) — screenshots `2.41-08-outdated-notice-legacy-appjs.png` / `2.41-09-after-update-legacy-appjs.png` |
| Update renames the view in place (same UID) | PASS | PASS | | PASS | | `Category dimension usage` → `Data dimension usage`, UID `GOLswS44mh8` kept |
| Update sets public sharing to `r-r-----` | PASS | PASS | | PASS | | PUT does change sharing on all versions tested (was `rwrw----`) |
| User without the SQL view authority: server message shown | PASS | SKIPPED | | PASS | | check 5 skipped on this instance per review plan — already verified on 2.43.1 |
| …and the "Add/Update SQL view" authority is named | PASS | SKIPPED | | PASS | | `*-10-limited-user.png` |
| …and the app does not crash | PASS | SKIPPED | | PASS | | no page errors |
| SQL view left installed at the end | PASS | PASS | | PASS | | 2.41: the suite's own `restore-view` step raised an exception (see notes below the table) but the view's actual state was verified directly via `GET /api/sqlViews/GOLswS44mh8?fields=name,sharing` → installed, correct name and `r-r-----` sharing |
| No unexpected console errors | PASS | PASS | | PASS | | |
| No React duplicate-key warnings | PASS | PASS | | PASS | | |
| No unexpected HTTP error responses | PASS | PASS | | PASS | | |

Totals per instance: **46 PASS / 2 FAIL / 2 INFO** on 2.40.12 and on 2.43.1
(pass A, before the M1/M2 fixes). **2.41.10 (pass B, after the fixes, 36
doc rows): 28 PASS / 2 FAIL / 3 SKIPPED / 2 N/A / 1 INFO** — see
"2.41.10-specific notes" below; both FAILs are instance/seed limitations, not
app defects, and the step that failed under pass A (M1) now passes (3 of 3
toasts shown, disabling three dimension types in succession).

## Version-specific failures

None in the app itself across 2.40.12, 2.41.10 and 2.43.1. Every difference
observed is in the platform or the seed data:

- **App hosting**: 2.40/2.41 serve `/api/apps/…/index.html` at top level;
  2.43 redirects to `/apps/data-dimension-disabler` and wraps the app in the
  global-shell iframe. The app renders its own `@dhis2/header-bar` in all
  cases; on 2.43 the shell hides it (`display: none`), so exactly one header
  bar is visible everywhere.
- **SQL**: the view installed on 2.40 uses `dataelementcategory`, 2.41/2.43
  use `category`, as the version branch intends. All execute.
- **Writes**: JSON Patch `dataDimension` and `PUT /api/sqlViews/{id}` behave
  identically on both sides of the 2.42 boundary.

M1 (pass A finding, fixed in `2c997df`) reproduced identically on 2.40.12 and
2.43.1 and is confirmed fixed live on 2.41.10 (three disables in a row, three
toasts).

## 2.41.10-specific notes (review pass B)

Two rows differ from the "all versions behave the same" pattern above, and
both are properties of the **EMIS ("edu-meta") seed**, not the app or the
DHIS2 version:

1. **No `categoryOptionGroupSets` exist in this seed at all**
   (`GET /api/categoryOptionGroupSets` → `pager.total: 0`), so that dimension
   type never has a row, is skipped wherever the suite would otherwise
   disable/re-enable an object of that type, and "all four types appear"
   fails by construction. The filter for that type still works correctly
   (shows 0 rows, as expected).
2. **The data-read-error scenario cannot be reproduced on this instance
   with any standard account.** Both `admin` and the broker's `local_admin`
   hold the `Superuser` role with the `ALL` authority here (unlike the
   Sierra Leone seeds, whose demo `admin` has neither `ALL` nor
   `F_SQLVIEW_EXECUTE`), and `admin` is also the SQL view's owner. DHIS2
   grants owners and `ALL`-holders full access regardless of an object's
   `sharing.public`, so setting the view's sharing to `r-------` has no
   effect when driven as either account — `/sqlViews/{id}/data` keeps
   returning 200 with the full grid. This was confirmed directly: `GET
   /api/me` as `admin` returns `{"id":"M5zQapPyTZI", ...,
   "userRoles":[{"name":"Superuser","authorities":["...","ALL",...]}]}`,
   and the SQL view's `sharing.owner` is the same `M5zQapPyTZI`; `GET
   /api/me` as `local_admin` returns `authorities: ["ALL"]` too. The two
   downstream steps that depend on reaching the error state ("Remove SQL
   view stays available" and "Retry recovers") were consequently not
   reached and are marked N/A rather than FAIL.
3. A related, harmless artifact: because check 5 (limited user) was
   intentionally skipped on this instance (already covered on 2.43.1), the
   suite's own `restore-view` step — which normally relies on the preceding
   `limited-user` step having deleted the view first — found the view
   already installed and `READY` (table rendered, no notice box to click
   through) and raised a "waiting for noticebox" exception. This is a gap in
   how the suite's flows compose when `limited-user` is excluded via
   `E2E_FLOWS`, not an app defect: the view's actual end state was verified
   directly via the API (installed, correct name, `r-r-----` sharing) and is
   fine.

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
- 2.41.10 — 70 rows, identical in all three places (`psql` direct execution
  of the installed `sqlQuery`, `GET /sqlViews/GOLswS44mh8/data?paging=false`,
  and the rendered table). Only 7 rows are non-zero, all `ORGUNIT_GROUP_SET`:
  School Type 13 (20.6% / 100.0%), Implementation 11, Location Rural/Urban 9,
  Ownership Public/Private 9, Geo-Political Zone 7, School Level 7, UNICEF
  Field Office 7. The 13-view denominator (`percent_of_views`) matches
  exactly the 7+4+2 = 13 raw `datastatisticsevent` rows recorded against the
  three `EVENT_VISUALIZATION_VIEW` favorites by `generate-view-events.sh`
  (see "M2 live check" below) — confirmed directly against
  `datastatisticsevent` with `psql`. No `CATEGORY`,
  `DATAELEMENT_GROUP_SET` or `CATEGORYOPTION_GROUP_SET` row is non-zero,
  because none of those three favorites carries a category or
  data-element-group-set dimension on this seed (and there are no
  category-option group sets to carry one at all).

## Console/network hygiene

No console errors, page errors, React key warnings or unexpected HTTP errors
from the app on 2.40.12, 2.41.10 or 2.43.1. Filtered as platform noise, not
app defects:

- `Error: This window is not a secure context … PWA features will not work` —
  the App Platform's offline/PWA layer on a plain-http test instance. Logged
  from the app's own bundle on 2.40 and from the shell on 2.43.
- `404 /api/<v>/staticContent/logo_banner` and
  `404 /api/<v>/dataStore/custom-translations/controller` — header-bar/shell
  probes for optional resources.
- `404 /api/<v>/sqlViews/GOLswS44mh8?fields=id,sqlQuery` — the expected probe
  while the view is not installed; it is how the app detects `MISSING`.

## Screenshots

In `screenshots/`, named `<version>-<step>.png` (2.41.10 uses a short `2.41-`
prefix):

| Step | 2.40.12 | 2.41.10 | 2.43.1 |
|---|---|---|---|
| Create notice | `2.40.12-01-missing-notice.png` | `2.41-01-missing-notice.png` | `2.43.1-01-missing-notice.png` |
| Usage table | `2.40.12-02-table.png` | `2.41-02-table.png` | `2.43.1-02-table.png` |
| Filtered to one type | `2.40.12-03-filter.png` | `2.41-03-filter.png` | `2.43.1-03-filter.png` |
| Sorted | `2.40.12-04-sorted.png` | `2.41-04-sorted.png` | `2.43.1-04-sorted.png` |
| Disable dialog | `2.40.12-06-disable-dialog.png` | `2.41-06-disable-dialog.png` | `2.43.1-06-disable-dialog.png` |
| After disabling objects | `2.40.12-05-after-disable.png` | `2.41-05-after-disable.png` (3 objects, not 4 — see notes) | `2.43.1-05-after-disable.png` |
| View removed | `2.40.12-07-removed.png` | `2.41-07-removed.png` | `2.43.1-07-removed.png` |
| Outdated (legacy) view notice | `2.40.12-08-outdated-notice.png` | `2.41-08-outdated-notice.png` (suite's synthetic legacy view) and `2.41-08-outdated-notice-legacy-appjs.png` (the actual historical `sql_view_41` from `git show 7b8c7e1:src/app.js`) | `2.43.1-08-outdated-notice.png` |
| After update | `2.40.12-09-after-update.png` | `2.41-09-after-update.png` and `2.41-09-after-update-legacy-appjs.png` | `2.43.1-09-after-update.png` |
| Limited user, create refused | `2.40.12-10-limited-user.png` | not captured (check 5 skipped on this instance) | `2.43.1-10-limited-user.png` |
| Data-read error state | `2.40.12-11-data-error.png` | not captured (scenario unreachable on this instance — see notes) | `2.43.1-11-data-error.png` |
