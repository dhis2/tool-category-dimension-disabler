# Review findings: Data Dimension Disabler 1.0.0

Reviewed: 2026-09-21 · Branch `app-platform-migration` ·
Scope: code review + functional test + architecture assessment ·
Reviewer: agent (Claude Opus 5, `dhis2-app-review` skill)
DHIS2 versions tested in this pass: **2.40.12** and **2.43.1** (Sierra Leone
seeds). 2.41, 2.42 and the Laos 2.43 instance follow in later passes.

## Summary

The App Platform rewrite is in good shape. `yarn lint` is clean and all 63
unit tests pass; the production bundle installs and runs on both 2.40.12 and
2.43.1, and every documented flow works end to end on both: create the SQL
view, rank all four dimension types, filter, sort, disable one object of each
type (server state verified by read-back), remove and recreate the view,
detect and update a legacy category-only view in place, and report permission
and data-access errors in the UI instead of the console. The numbers the table
shows match the database exactly on both versions, and the map-view correction
the rewrite claims is confirmed empirically — the counted `MAP_VIEW` events
carry map UIDs that the previous `mapview.uid` join could never have matched.

No HIGH findings. One MEDIUM UI defect (success toasts are swallowed when
dimensions are disabled in quick succession) reproduces identically on both
versions, and one MEDIUM defect in the developer helper script
(`generate-view-events.sh` records nothing useful on 2.40 and, on any version,
mostly picks favorites that use no dimension at all). The rest are LOW. The
app is safe to release once M1 is fixed.

## Findings

### HIGH

None.

### MEDIUM

#### M1. Only every other "… is no longer a data dimension" toast is shown

- **Where**: `src/components/UsageView.tsx:25-32` (the `useAlert` hook) and
  `src/components/UsageView.tsx:63` (`showDisabled({ name })`).
- **What**: disabling several dimensions in a row — the app's main workflow —
  shows a success toast for the first, none for the second, one for the third,
  none for the fourth. Reproduced on 2.40.12 and 2.43.1 by the e2e suite
  (`disable-per-type / Success alert names the disabled object`), failing for
  the 2nd and 4th object on both.
  Cause: `useAlert` keeps the id of the alert it last raised in a ref
  (`node_modules/@dhis2/app-service-alerts/build/cjs/useAlert.js:11,36` →
  `makeAlertsManager.js:10`). While that alert is still on screen, a second
  `show()` **reuses the same id**, so `AlertBar` is not remounted and keeps the
  auto-hide timer started by the first message
  (`@dhis2-ui/alert/.../alert-bar.js:25`, `duration = 8000`). The second
  message therefore inherits an almost-expired timer and disappears at once.
  Once the alert has been removed, the ref is cleared and the next `show()`
  works again — hence the alternating pattern. The row does still disappear
  and the server is still updated, so this is feedback loss, not data loss.
- **Fix**: make each success a fresh alert. Smallest change:

  ```ts
  const { show: showDisabled, hide: hideDisabled } = useAlert(…)
  …
  hideDisabled()            // clears the ref, so show() allocates a new alert
  showDisabled({ name: rowToDisable.name })
  ```

  Add a regression test that raises two alerts in succession and asserts both
  messages reach the alert stack (`MockAlertStack` already renders them), and
  re-run `e2e/run_suite.py` — the two failing steps must turn green.

#### M2. `generate-view-events.sh` produces no usable ranking data

- **Where**: `scripts/generate-view-events.sh:23` (the visualization query) and
  `:29`/`:35` (maps and event visualizations).
- **What**: two problems in the one script the README and `CLAUDE.md` point
  developers and reviewers at.
  1. The filter `categoryDimensions:!empty` is rejected by 2.40 with
     `400 E1003 "!empty is not a valid operator"` (verified on
     `agent-cdd-sl40`; it works on 2.43). The `|| true` on the same line
     swallows the error, so the script reports success and silently records
     **zero** `VISUALIZATION_VIEW` events on 2.40 — exactly the event type the
     ranking is mostly built from.
  2. The map and event-visualization batches take the *first* favorites the
     API returns, with no filter at all. On the Sierra Leone seeds none of
     those favorites carries a dimension, so the 12 events they record
     contribute 0 to every row. To exercise the map path at all, this review
     had to pick map `X7x2WOLhCA8` by hand (its map views carry org-unit
     group-set dimensions).
- **Fix**: drop the version-specific filter and select favorites by what they
  actually use — e.g. read `visualizations?fields=id,categoryDimensions~size,
  dataElementGroupSetDimensions~size` (works on 2.40 too) and keep the ones
  with a non-zero size; for maps, page through
  `maps?fields=id,mapViews[categoryDimensions~size,
  organisationUnitGroupSetDimensions~size]`. Also drop the blanket `|| true`
  so an API error is visible, or `echo` a warning when a batch comes back
  empty.

### LOW

- **L1. Two sources of truth for the SQL view's column names** —
  `src/sql/buildQuery.ts:3-10` exports `SQL_VIEW_COLUMNS`, which nothing but
  `buildQuery.test.ts:78` reads, while `src/hooks/useUsageData.ts:50-55`
  hard-codes the same six names again. Fix: import `SQL_VIEW_COLUMNS` in
  `useUsageData` (or delete the export and let the test read the query text),
  so a column rename cannot pass the tests while breaking the mapping.
- **L2. A translated label is lowercased for the dialog sentence** —
  `src/components/DisableDialog.tsx:32-34` calls `.getLabel().toLowerCase()`.
  This is wrong in every language that capitalises nouns (German
  "Kategorie" → "kategorie") and in locales with special casing rules. Fix:
  give `DimensionType` a second label function (`getLabelLowercase`) with its
  own `i18n.t` string, or phrase the sentence so the label keeps its own
  capitalisation.
- **L3. A missing `serverVersion` silently means "2.40 schema"** —
  `src/hooks/useSqlViewStatus.ts:44`: `serverVersion?.minor ?? 0`. With `0`
  the app builds the `dataelementcategory` variant, so on a modern server it
  would report a correct view as OUTDATED and, if the user pressed Update,
  install a view that fails at query time. The platform normally fills
  `serverVersion` in, so this is latent, not observed. Fix: treat an absent
  `serverVersion` as `LOADING`/`ERROR` rather than defaulting the minor.
- **L4. The README overstates what "SQL view execute" does** — `README.md`
  ("Permissions"): the demo `admin` on both test instances has **no**
  `F_SQLVIEW_EXECUTE` and reads the ranking fine; what the server actually
  enforces on `/sqlViews/{uid}/data` is *data read* on the view
  (`409 E4312 "Current user is not authorised to read data from SQL view"`,
  reproduced by removing `r` from the data position). Worth adding in the same
  section: on 2.42+ the global shell only opens the app for users whose role
  holds the server-generated `M_datadimensiondisabler` authority — without it
  the shell answers "Unable to find an app for this URL" (observed on 2.43.1).
- **L5. `reset()` is a no-op while a call is in flight** —
  `src/hooks/useEngineMutation.ts:46-50` only clears state when
  `pendingCalls.current === 0`, so reopening the dialog for a different row
  during a slow request still shows the previous row's error. Narrow window;
  fix by clearing `error` unconditionally and only leaving `loading` alone.
- **L6. Dead parameter kept "for symmetry"** — `src/sql/buildQuery.ts:63-70`:
  `favoriteSourcesFor(type, minor)` never uses `minor` and needs an
  `eslint-disable`. The schema check established that the missing
  data-element-group-set join tables are version-independent, so drop the
  parameter (and the disable comment); re-add it if a version ever diverges.
- **L7. The view is world-readable by design** — `src/sql/sqlView.ts:25`
  installs `public: 'r-r-----'`, so every logged-in user can execute it and
  read which dimensions exist and how often they are used. That is the
  intended trade-off (the app itself needs data read), but it is worth one
  sentence in the README, and an admin who cares can narrow it to a user group
  afterwards — the app only checks the query text, not the sharing, so a
  narrowed view stays `READY`.
- **L8. The OUTDATED notice offers no path for a user who cannot update** —
  `src/components/SqlViewNotice.tsx:89-107` shows only an "Update SQL view"
  button; a user without the authority gets an error and no data at all, even
  though the installed view may still work for them. Fix: add one sentence
  ("Ask an administrator with the 'Add/Update SQL view' authority to update
  it.").

## Claims investigated and rejected

- **Claim**: the refetch after a successful disable unmounts `UsageTable`
  (`UsageView.tsx:100` renders it only when `!loading`), so the type filter and
  the chosen sort are lost after every disable.
  **Source**: static reading of `UsageView.tsx` during this review.
  **Refuted by**: live test on 2.43.1 — filtered to "Category option group
  set", sorted by name, disabled "Donor": the filter and sort survived and the
  row simply vanished. `useDataQuery`'s `refetch` does not raise `loading`
  again (it reports background refetches separately), so the table is never
  unmounted.
- **Claim**: `PUT /api/sqlViews/{id}` ignores `sharing`, so a legacy view
  upgraded in place would keep the old `rwrw----` (the server-quirks reference
  warns that patching `/sharing` silently no-ops).
  **Source**: `dhis2-app-review/references/server-quirks.md`.
  **Refuted by**: the `outdated-update` flow on both versions — after the
  update, `GET …?fields=sharing` reports `public: "r-r-----"` on 2.40.12 and
  2.43.1. The quirk applies to JSON Patch on `/sharing`, which this app does
  not do; a full `PUT` of the object does carry sharing through.
- **Claim**: the app renders its own `@dhis2/header-bar` inside the 2.42+
  global-shell iframe, so 2.43 shows a double header (the app's `<header>` is
  indeed present in the iframe's DOM).
  **Source**: DOM scan of both frames on 2.43.1.
  **Refuted by**: measuring the elements — the in-app `<header>` is
  `display: none` with a 0×0 box inside the shell, the shell's header is 40 px
  tall, and a full-page screenshot shows one header. The suite therefore counts
  *visible* headers (`e2e/app_driver.py:header_bar_count`).
- **Claim** (task brief, check 2): after the update the view's `sharing.public`
  should be `r-------`.
  **Refuted by**: the approved design (§4) and the server — with `r-------`
  the data endpoint answers `409 E4312` even for the creating admin (verified
  on 2.43.1), which is why commit 475c873 moved to `r-r-----`. The brief's
  expected value predates that commit; `r-r-----` is correct.
- **Claim**: `params: { paging: false }` on `sqlViews/{id}/data`
  (`src/hooks/useUsageData.ts:25`) might be dropped by the data engine or
  ignored by the server, capping the table at 50 rows on large instances.
  **Refuted by**: request capture — the app sends
  `/api/43/sqlViews/GOLswS44mh8/data?paging=false`, and the endpoint pages when
  asked (`?pageSize=5` → 5 rows) and returns all 23 rows without paging.

## Architecture assessment

**Verdict: the migration is done and the result is idiomatic App Platform.
Stay here; no further architectural work is needed before release.**

What the rewrite gets right:

- `d2.config.js` with `type: app`, `minDHIS2Version: '2.40'` and a single
  entry point; build through `@dhis2/cli-app-scripts` 12; the icon carried over
  as `public/dhis2-app-icon.png` and correctly emitted as `icons.48` in the
  generated `manifest.webapp`.
- All server access goes through `@dhis2/app-runtime` (`useDataQuery`,
  `useDataEngine`, `useConfig`, `useAlert`); there is no hand-rolled fetch
  layer left, and the versioned API path and session auth come for free. The
  legacy `d2api.js`, jQuery, DataTables and the conditionally injected header
  bar are gone, along with `alert()`/`confirm()` — every outcome is now a
  `NoticeBox`, a `Modal` or an `AlertBar`.
- The one custom abstraction, `useEngineMutation`, is justified: the resource
  varies per call (four metadata endpoints plus three SQL view operations),
  which `useDataMutation`'s static mutation object cannot express. It is 50
  lines, counts in-flight calls rather than guessing, and is unit-tested.
- Layering is clean and matches the design document: pure logic
  (`dimensionTypes`, `buildQuery`, `sqlView`, `usageTableUtils`) has no React
  dependency and carries most of the tests; hooks own data and mutations;
  components are presentational except `UsageView`, which owns the dialogs.
  Every module has a co-located test; the single version branch (`minor < 41`)
  lives in exactly one place, as intended.
- i18n is wired up properly (`i18n/en.pot` regenerated, no `i18n.t` at module
  scope — labels are functions for that reason), CSS modules use the DHIS2
  design tokens, and `data-test` attributes exist on the elements a test needs.

What remains (none of it architectural):

1. Fix M1 and M2, then re-run `yarn lint && yarn test`, rebuild, reinstall and
   re-run `e2e/run_suite.py` on both instances.
2. Consider declaring `authorities` in `d2.config.js`. The server already
   generates `M_datadimensiondisabler` and gates the app on it from 2.42, but
   an explicit declaration documents that this is a destructive admin tool and
   shows up in `GET /api/apps`.
3. The unit tests assert *request shape* against a mocked engine (for example
   `useDisableDimension.test.tsx:44-52` checks the JSON Patch body). That is
   the right level for unit tests, but it cannot catch a server that accepts
   and ignores a write; the `e2e/` suite added by this review is what verifies
   server effect, and it should be run against at least one instance before
   each release.
4. Housekeeping before the App Hub release: uninstall the old "Category
   dimension disabler" on target instances (the CHANGELOG says so), and keep
   `docs/schema-check.md` next to `buildQuery.ts` as the record of why the
   table names are what they are.

## Environment gaps

- Only 2.40.12 and 2.43.1 were exercised in this pass; 2.41, 2.42 and the
  larger Laos 2.43 instance (including the response-time measurement asked for
  there) are left for the following passes. The 2.42 boundary itself *is*
  covered, since 2.43.1 serves the app through the global shell.
- Both instances run the same Sierra Leone seed, so the table content is
  similar on both; the EMIS and EHR seeds in the later passes will exercise
  different metadata shapes.
- The seeds' `admin` is not a full superuser (no `ALL`, no
  `F_SQLVIEW_EXECUTE`), so creating the throwaway limited user for the
  permission test needs the broker's `local_admin` account. The e2e suite takes
  it through `E2E_SUPERUSER`/`E2E_SUPERPASS`.
- The instances are served over plain http, so the platform's PWA layer logs
  "not a secure context" errors on every load. They are filtered as platform
  noise; on an https deployment they would not appear.
