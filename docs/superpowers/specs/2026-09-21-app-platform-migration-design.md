# Data Dimension Disabler: App Platform migration and group set support

Date: 2026-09-21
Status: approved design, awaiting implementation plan

## 1. Purpose

The tool ranks metadata objects that are enabled as analytics data dimensions
(`dataDimension = true`) by how often favorites using them were viewed in the
last 12 months, so an administrator can disable the unused ones and shrink
the analytics tables.

Today the tool covers categories only and is a vanilla-JS webpack app with a
hand-rolled fetch layer, jQuery DataTables and a conditionally loaded legacy
header bar. This rewrite:

1. migrates it to the DHIS2 App Platform (React, `@dhis2/app-runtime`,
   `@dhis2/ui`), and
2. extends the ranking to the three group set types that can be data
   dimensions: organisation unit group sets, data element group sets and
   category option group sets.

Supported DHIS2 versions: 2.40, 2.41, 2.42, 2.43.

## 2. Non-goals

- Re-enabling dimensions. The table only lists enabled dimensions; re-enabling
  is done in the Maintenance app.
- Replacing the SQL view with Web API queries. The 12-month view-count logic
  needs `datastatisticsevent`, which is only reachable through SQL.
- TypeScript. The app stays plain JavaScript.
- Any change to the analytics tables themselves.

## 3. Architecture

### 3.1 Stack

| Concern         | Choice                                                   |
|-----------------|----------------------------------------------------------|
| Build/dev/test  | `@dhis2/cli-app-scripts` (`d2-app-scripts`)              |
| Data access     | `@dhis2/app-runtime` (`useDataQuery`, `useDataMutation`, `useDataEngine`, `useConfig`) |
| UI              | `@dhis2/ui` (DataTable, Button, NoticeBox, Modal, SingleSelect, CircularLoader) |
| Header bar      | provided by the platform shell; the `check-header-bar.js` logic, `dhis-header-bar.js` resource and `header.css` are deleted |
| Version         | `useConfig().serverVersion.minor`; no separate system-info call |

Removed: webpack config, `d2-manifest`, `d2auth.json`, jQuery, DataTables,
`src/js/d2api.js`, `src/resources/`, `src/css/header.css`, `build/` and
`compiled/` artefacts.

### 3.2 Module layout

```
src/
  App.jsx                      shell: status hook -> notice or table
  dimensionTypes.js            type -> { label, endpoint, sqlTable, ... }
  sql/
    sqlView.js                 SQL view definition (uid, name, sharing, variants)
    sqlView.test.js
    buildQuery.js              builds the SQL text for a given server minor
    buildQuery.test.js
  hooks/
    useSqlViewStatus.js        MISSING | OUTDATED | READY | ERROR
    useUsageData.js            fetches /sqlViews/{uid}/data.json, maps rows
    useUsageData.test.js
  components/
    SqlViewNotice.jsx          create / update prompts and errors
    UsageTable.jsx             DataTable with sort + type filter
    TypeFilter.jsx
    DisableDialog.jsx          confirmation Modal + json-patch mutation
    RemoveViewDialog.jsx       confirmation Modal + delete mutation
    Intro.jsx                  the explanatory text (moved from index.html)
```

Each module has one job and can be understood from its exports. Pure logic
(`buildQuery`, row mapping, type mapping) has no React dependency so it is
unit-testable with Jest.

### 3.3 Dimension type map

`dimensionTypes.js` is the single source of truth for the four types:

| key                      | label                        | API endpoint                     | table (41+)                | dimension join tables (prefix `visualization_`, `mapview_`, `eventvisualization_`) | dimension table + FK column |
|--------------------------|------------------------------|----------------------------------|----------------------------|-----------------|-----------------|
| `CATEGORY`               | Category                     | `categories`                     | `category` (`dataelementcategory` on 40) | `categorydimensions` | `categorydimension.categoryid` |
| `ORGUNIT_GROUP_SET`      | Organisation unit group set  | `organisationUnitGroupSets`      | `orgunitgroupset`          | `orgunitgroupsetdimensions` | `orgunitgroupsetdimension.orgunitgroupsetid` |
| `DATAELEMENT_GROUP_SET`  | Data element group set       | `dataElementGroupSets`           | `dataelementgroupset`      | `dataelementgroupsetdimensions` | `dataelementgroupsetdimension.dataelementgroupsetid` |
| `CATEGORYOPTION_GROUP_SET` | Category option group set  | `categoryOptionGroupSets`        | `categoryoptiongroupset`   | `categoryoptiongroupsetdimensions` | `categoryoptiongroupsetdimension.categoryoptiongroupsetid` |

The table and column names above are the expected ones. The first
implementation task verifies them with `\d` against a real 2.40 and 2.43
database and corrects the map if needed. Any difference between versions
becomes a version branch in `buildQuery.js`, not in the components.

## 4. SQL view

- **UID**: `GOLswS44mh8` (unchanged so existing installs are upgraded in place).
- **Name**: `Data dimension usage`.
- **Type**: `QUERY`, `cacheStrategy: NO_CACHE`.
- **Sharing**: `public: "r-------"` (was `rwrw----`).
- **Columns**: `type`, `uid`, `name`, `views`, `percent`, `percent_of_views`.

Query shape (per type, generated from the map, then `UNION ALL`ed):

```sql
WITH favorite_views AS (
  SELECT favoriteuid, COUNT(*) AS views
  FROM datastatisticsevent
  WHERE AGE(NOW(), timestamp) < '12 month'::interval
    AND eventtype IN ('EVENT_CHART_VIEW','MAP_VIEW','VISUALIZATION_VIEW')
  GROUP BY favoriteuid
),
total_favorite_views AS (SELECT COALESCE(SUM(views),0) AS count FROM favorite_views),
summary AS (
  -- one block per dimension type:
  SELECT 'CATEGORY' AS type, z.uid, z.name, COALESCE(SUM(fv.views),0) AS views
  FROM <table> z
  LEFT JOIN (
      SELECT DISTINCT d.<fk>, v.uid FROM visualization_<join> a
        JOIN <dimtable> d ON a.<dimtable>id = d.<dimtable>id
        JOIN visualization v ON a.visualizationid = v.visualizationid
      UNION SELECT DISTINCT ... FROM mapview_<join> ... JOIN mapview ...
      UNION SELECT DISTINCT ... FROM eventvisualization_<join> ... JOIN eventvisualization ...
  ) y ON y.<fk> = z.<pk>
  LEFT JOIN favorite_views fv ON fv.favoriteuid = y.uid
  WHERE z.datadimension = TRUE
  GROUP BY z.uid, z.name
  UNION ALL
  ... ORGUNIT_GROUP_SET ... UNION ALL ... DATAELEMENT_GROUP_SET ... UNION ALL ... CATEGORYOPTION_GROUP_SET ...
),
totals AS (SELECT SUM(views) AS total FROM summary)
SELECT s.type, s.uid, s.name, s.views,
       COALESCE(s.views::double precision / NULLIF(t.total,0) * 100.0, 0) AS percent,
       COALESCE(s.views::double precision / NULLIF(f.count,0) * 100.0, 0) AS percent_of_views
FROM summary s CROSS JOIN totals t CROSS JOIN total_favorite_views f
ORDER BY s.views DESC, s.name;
```

Semantics are identical to the current view for categories: `views` counts
favorite view events in the last 12 months across all favorites that use the
dimension; `percent` is the share of all dimension views; `percent_of_views`
is the share of all favorite views. A favorite that uses two dimensions is
counted once for each. Views of a favorite are counted once per dimension
even if the favorite lists the dimension twice (`DISTINCT`).

Two variants exist, selected by server minor: on 40 the category table is
`dataelementcategory`, from 41 on it is `category`. If the schema check in
3.3 reveals further differences they are added the same way.

### 4.1 Outdated-view detection

`useSqlViewStatus` fetches `/api/sqlViews/GOLswS44mh8?fields=id,sqlQuery`.

- 404 → `MISSING`.
- 200 and `sqlQuery` differs from `buildQuery(minor)` after whitespace
  normalisation → `OUTDATED` (typical for an install of the old category-only
  view).
- 200 and equal → `READY`.
- any other failure → `ERROR` with the server message.

## 5. User flow

1. **Load.** CircularLoader while the status is resolved.
2. **MISSING.** NoticeBox (warning): "The tool needs an SQL view named 'Data
   dimension usage'. Creating it requires the 'Add/Update SQL view'
   authority." Button "Create SQL view" → POST `/api/sqlViews`. On success
   status becomes `READY`.
3. **OUTDATED.** NoticeBox (info): "An older version of the SQL view is
   installed." Button "Update SQL view" → PUT `/api/sqlViews/GOLswS44mh8`
   with the full definition. On success status becomes `READY`.
4. **READY.** Intro text (collapsible; the text from the current
   `index.html`, extended to mention group sets), TypeFilter, UsageTable,
   and at the bottom a "Remove SQL view" button.
5. **Disable.** Row button "Disable" → DisableDialog Modal naming the object
   and its type → JSON Patch
   `[{ "op": "add", "path": "/dataDimension", "value": false }]` to
   `/api/<endpoint>/<uid>`. On success: close, toast-style AlertBar
   "<name> disabled as data dimension", refetch data. On failure: error shown
   inside the modal, modal stays open.
6. **Remove view.** RemoveViewDialog Modal → DELETE the view → status returns
   to `MISSING`.

The usage table:

| Column               | Source            | Notes                              |
|----------------------|-------------------|------------------------------------|
| Type                 | `type`            | label from the type map            |
| Name                 | `name`            |                                    |
| UID                  | `uid`             | monospace                          |
| Views (12 months)    | `views`           | default sort, descending           |
| % of dimension views | `percent`         | 1 decimal                          |
| % of favorite views  | `percent_of_views`| 1 decimal                          |
| Action               |                   | Disable button                     |

All columns except Action are sortable client-side. TypeFilter is a
SingleSelect with "All types" plus the four labels; filtering is client-side.
No pagination: instances have tens to low hundreds of such objects.

`percent` and `percent_of_views` are computed over all types, so the
percentages do not change when the filter changes.

## 6. Error handling

- All fetch and mutation errors are rendered in NoticeBox / inside the open
  Modal with the DHIS2 error message. No `alert`, `confirm` or `console`-only
  errors.
- A 409 on create (view exists after all) is treated as `OUTDATED` and the
  status refetched.
- 403 on create/update/delete shows the message and names the missing
  authority in plain words.
- A `sqlViews/{uid}/data` failure (for example the view exists but the user
  lacks execute permission, or the SQL is invalid on this version) is shown
  as an error notice with the server message and a "Retry" button. The
  "Remove SQL view" button remains available in this state so a broken view
  can be removed and recreated.

## 7. Testing

### 7.1 Unit (Jest, `d2-app-scripts test`)

- `buildQuery(40)` uses `dataelementcategory`; `buildQuery(41..43)` uses
  `category`; all four type blocks are present in every variant.
- Row mapping from `listGrid` to typed objects, including empty result.
- `dimensionTypes`: every type has label, endpoint and SQL names; endpoint
  lookup by type key.
- Status classification from (http status, sqlQuery) pairs.

### 7.2 Functional review (`dhis2-app-review` skill)

Five fresh broker instances, deleted after the review:

| Instance          | Seed                  | Version |
|-------------------|-----------------------|---------|
| agent-cdd-sl40    | sierra-leone V40      | 2.40    |
| agent-cdd-emis41  | edu-meta (EMIS)       | 2.41    |
| agent-cdd-ehr42   | ehr-meta              | 2.42    |
| agent-cdd-lao43   | lao_hmis_demo v43     | 2.43    |
| agent-cdd-sl43    | sierra-leone v43      | 2.43    |

Preparation on each instance: enable `dataDimension` on at least one group
set of each type if the seed has none, create or pick favorites using
category, org unit group set, data element group set and category option
group set dimensions, and generate view events via
`POST /api/dataStatistics?eventType=VISUALIZATION_VIEW&favorite=<uid>` so the
ranking is non-trivial.

Checks per instance: create view from MISSING; table lists all four types
with the expected view counts; filter; sort; disable one object of each type
and confirm `dataDimension=false` via the API and that the row disappears;
update path from an old category-only view (install the legacy definition
first, load the app, expect OUTDATED, update); remove view; behaviour for a
user without SQL view authority; header bar renders correctly (platform shell
on 40/41, global shell on 42/43); no console errors.

Plus the static and architecture parts of the review recipe, and a
severity-ranked report.

## 8. Repository changes

- Branch `app-platform-migration` from `origin/main`. First commit is the
  CI workflow swap that was pending locally (done). History stays linear.
- `package.json`: name `data-dimension-disabler`, version `1.0.0`, App
  Platform scripts (`start`, `build`, `test`, `lint`), `d2.config.js` with
  `type: app`, title "Data Dimension Disabler", icons carried over. The
  current manifest has no app id, so none is added.
- `.github/workflows/ci.yml`: install, `yarn lint`, `yarn test`, `yarn build`,
  upload `build/bundle/*.zip`. `release.yml`: same build, attach
  `build/bundle/*.zip`.
- README rewritten for the App Platform (dev proxy instructions replace
  `d2auth.json`), describes all four dimension types and the SQL view
  create/update/remove behaviour.
- CHANGELOG gets a `1.0.0` section: App Platform migration, group set
  support, SQL view renamed and upgraded in place, sharing tightened.
- Delete `build/`, `compiled/`, `manifest.webapp`, `d2auth*.json`,
  `webpack.config.js`, `.eslintrc.js`, `eslint.config.js`/`.mjs` (App
  Platform provides linting via `d2-style`), `src/resources/`, `src/css/header.css`,
  `src/js/`.

## 9. Open risks

- Group set dimension table or column names may differ from the map in 3.3
  on some version. Mitigated by the schema check as the first task.
- `eventvisualization_*groupsetdimensions` tables may not exist for every
  type on 2.40 (event visualizations were new in 2.38 and gained dimensions
  incrementally). If a table is missing on a version, that branch of the
  UNION is omitted for that version in `buildQuery`.
- The platform header bar on 2.40/2.41 requires a `@dhis2/cli-app-scripts`
  version that still supports those servers; the `dhis2-apps` skill's version
  guidance decides the exact dependency versions.
