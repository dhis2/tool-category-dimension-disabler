# Data Dimension Disabler: Favorite-count Columns and UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add favorite-count columns (total, public, shared, private) with a column chooser to the usage table, and apply four UX changes the maintainer asked for after manual testing (no in-app title, full-width shorter intro with header tooltips instead of long prose, spacing around controls).

**Architecture:** The SQL view (same UID `GOLswS44mh8`) gains four columns computed from each favorite's `sharing` JSONB; installed views are detected as OUTDATED by the existing query comparison and upgraded in place. The table's column set becomes data: one `ColumnDef` list drives headers, cells, sorting, tooltips and the new "Columns" dropdown, whose selection is persisted in `localStorage`. No new dependencies.

**Tech Stack:** TypeScript, React 18, `@dhis2/cli-app-scripts` 12 (Vite + Jest), `@dhis2/app-runtime` 3.17, `@dhis2/ui` 10.17 (`DropdownButton`, `FlyoutMenu`, `MenuItem checkbox`, `Tooltip`, `IconInfo16`), yarn 1.

**Spec:** Design approved in chat on 2026-09-22 (this plan is its record). Prior spec for the app: `docs/superpowers/specs/2026-09-21-app-platform-migration-design.md`.

## Global Constraints

- Branch `app-platform-migration`, head `95d01dd` at the time of writing. Commits linear, no merges, message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, never a `Claude-Session:` trailer. Never push (read-only token).
- SQL view UID stays `GOLswS44mh8`; name `Data dimension usage`; sharing `public: 'r-r-----'`.
- Favorite sharing semantics (verified on 2.40.12 and 2.43.1: `visualization`, `map` and `eventvisualization` all have a `sharing` JSONB column; `mapview` does not, maps are reached through `mapmapviews` → `map`):
  - **public**: `sharing->>'public'` is not null and its first character is `r` (public metadata read).
  - **shared**: not public, and `sharing->'users'` or `sharing->'userGroups'` is a non-empty JSON object (`users`/`userGroups` may be `null`, `{}` or absent).
  - **private**: neither.
  - A favorite counts once per dimension (DISTINCT (object, favorite) pairs, as today).
- Output columns of the view, in order: `type, uid, name, favorites, public_favorites, shared_favorites, private_favorites, views, percent, percent_of_views`.
- Default visible columns: Type, Name, UID, Favorites, Views, % of dimension views. Hidden by default: Public, Shared, Private, % of favorite views. Type and Name cannot be hidden; the Action column is always shown.
- Column selection persisted per browser in `localStorage` key `data-dimension-disabler.columns` as a JSON array of column keys; unreadable or invalid values fall back to the defaults; every read/write wrapped in try/catch.
- Numeric columns sort descending on first click, text columns ascending (unchanged rule).
- Style: 4-space indent, no semicolons, single quotes, trailing commas; React imported explicitly in `.tsx`; every user-facing string through `i18n.t()` inside a function or component; no `defaultValue_plural`; no `count` interpolation variable (use `n`). Only `@dhis2/ui` components; CSS Modules with DHIS2 CSS variables.
- Tests use `renderWithProvider` from `src/test-utils`, `data-test` ids, CustomDataProvider mocks are `async`; `d2-app-scripts test` honours only the first positional pattern (run suites separately or with a regex). `yarn lint` (eslint + prettier + tsc), `yarn test`, `yarn build` must pass before every commit.
- Never run analytics on any DHIS2 instance. The only instance to use is `agent-cdd-manual` (`http://dhis2-agent-cdd-manual:8080`, DHIS2 2.43.1, `admin` / `district`, DB `dhis2-agent-cdd-manual-db:5432` db `dhis2` user `dhis` password `dhis`, read-only SQL for verification). Do not create, stop or delete broker instances.

---

## File structure

| Path | Change |
|------|--------|
| `src/sql/buildQuery.ts`, `.test.ts` | four new aggregate columns from `sharing`; `SQL_VIEW_COLUMNS` extended |
| `src/hooks/useUsageData.ts`, `.test.tsx` | `UsageRow` gains `favorites`, `publicFavorites`, `sharedFavorites`, `privateFavorites` |
| `src/components/columns.ts`, `columns.test.ts` (new) | `ColumnKey`, `COLUMN_DEFS` (label, description, align, numeric, alwaysVisible), `DEFAULT_VISIBLE_COLUMNS`, `loadVisibleColumns()`, `saveVisibleColumns()` |
| `src/components/usageTableUtils.ts`, `.test.ts` | `SortColumn` = `ColumnKey`; numeric compare for the new columns |
| `src/components/ColumnChooser.tsx`, `.test.tsx` (new) | `DropdownButton` + `FlyoutMenu` of checkbox `MenuItem`s |
| `src/components/ColumnHeaderLabel.tsx` (new) | label + `IconInfo16` in a `Tooltip` with the column description |
| `src/components/UsageTable.tsx`, `.module.css`, `.test.tsx` | data-driven columns, chooser in the toolbar, spacing |
| `src/components/UsageView.module.css` | footer spacing |
| `src/components/Intro.tsx`, `.module.css` | full width, two sentences |
| `src/App.tsx`, `App.module.css`, `App.test.tsx` | remove the `<h1>` |
| `e2e/app_driver.py`, `e2e/flows.py` | read cells by header, not by fixed index; new columns |
| `README.md`, `CHANGELOG.md`, `docs/schema-check.md`, `CLAUDE.md`, `i18n/en.pot` | docs and strings |

---

### Task 1: SQL view — favorite counts by sharing class

**Files:**
- Modify: `src/sql/buildQuery.ts`, `src/sql/buildQuery.test.ts`

**Interfaces:**
- Produces: `SQL_VIEW_COLUMNS = ['type','uid','name','favorites','public_favorites','shared_favorites','private_favorites','views','percent','percent_of_views'] as const`; `buildQuery(minor)` emitting those columns in that order.

- [ ] **Step 1: Extend the tests**

Add to `src/sql/buildQuery.test.ts` (keep the existing tests; update the "selects the documented output columns in order" test to the new list):

```ts
    it('classifies each favorite as public, shared or private from its sharing JSON', () => {
        const sql = buildQuery(43)
        // one classification per favorite kind (visualization, map, eventvisualization)
        expect(sql.match(/CASE WHEN LEFT\(f\.sharing->>'public', 1\) = 'r' THEN 'public'/g)?.length).toBe(
            // 3 kinds for CATEGORY, ORGUNIT_GROUP_SET, CATEGORYOPTION_GROUP_SET + 1 for DATAELEMENT_GROUP_SET
            3 * 3 + 1
        )
        expect(sql).toContain("COALESCE(f.sharing->'users', '{}'::jsonb) <> '{}'::jsonb")
        expect(sql).toContain("COALESCE(f.sharing->'userGroups', '{}'::jsonb) <> '{}'::jsonb")
    })

    it('counts favorites once per dimension and splits them by sharing class', () => {
        const sql = buildQuery(43)
        expect(sql.match(/COUNT\(DISTINCT y\.favoriteuid\) AS favorites/g)).toHaveLength(4)
        expect(sql.match(/COUNT\(DISTINCT y\.favoriteuid\) FILTER \(WHERE y\.sharingclass = 'public'\) AS public_favorites/g)).toHaveLength(4)
        expect(sql.match(/FILTER \(WHERE y\.sharingclass = 'shared'\) AS shared_favorites/g)).toHaveLength(4)
        expect(sql.match(/FILTER \(WHERE y\.sharingclass = 'private'\) AS private_favorites/g)).toHaveLength(4)
    })

    it('selects the documented output columns in order', () => {
        const sql = buildQuery(43)
        const selectLine = sql.slice(sql.lastIndexOf('SELECT s.type'))
        expect(SQL_VIEW_COLUMNS).toEqual([
            'type', 'uid', 'name',
            'favorites', 'public_favorites', 'shared_favorites', 'private_favorites',
            'views', 'percent', 'percent_of_views',
        ])
        expect(selectLine).toMatch(
            /SELECT s\.type, s\.uid, s\.name,\s+s\.favorites, s\.public_favorites, s\.shared_favorites, s\.private_favorites,\s+s\.views,[\s\S]*AS percent,[\s\S]*AS percent_of_views/
        )
    })
```

- [ ] **Step 2: Run to see the new tests fail**

Run: `yarn test buildQuery`
Expected: the three tests above FAIL (no `sharingclass`, old column list).

- [ ] **Step 3: Implement**

In `src/sql/buildQuery.ts`:

```ts
export const SQL_VIEW_COLUMNS = [
    'type',
    'uid',
    'name',
    'favorites',
    'public_favorites',
    'shared_favorites',
    'private_favorites',
    'views',
    'percent',
    'percent_of_views',
] as const
```

Add a shared SQL fragment and use it in every favorite-kind branch of `usageSubquery`:

```ts
/**
 * Sharing class of a favorite from its `sharing` JSONB (present on
 * visualization, map and eventvisualization on 2.40-2.43):
 *  public  - public access string grants metadata read (first char 'r')
 *  shared  - not public, but shared with at least one user or user group
 *  private - neither
 * users/userGroups may be null, absent or {}; COALESCE normalises them.
 */
const SHARING_CLASS_SQL = `CASE WHEN LEFT(f.sharing->>'public', 1) = 'r' THEN 'public'
             WHEN COALESCE(f.sharing->'users', '{}'::jsonb) <> '{}'::jsonb
               OR COALESCE(f.sharing->'userGroups', '{}'::jsonb) <> '{}'::jsonb THEN 'shared'
             ELSE 'private' END`

const usageSubquery = (type: DimensionType): string =>
    favoriteSourcesFor(type)
        .map(
            ({ prefix, favoriteJoin }) => `      SELECT DISTINCT d.${type.dimensionForeignKey} AS objectid, f.uid AS favoriteuid,
        ${SHARING_CLASS_SQL} AS sharingclass
        FROM ${prefix}_${type.joinTableSuffix} a
        JOIN ${type.dimensionTable} d ON d.${type.dimensionPrimaryKey} = a.${type.dimensionPrimaryKey}
        ${favoriteJoin}`
        )
        .join('\n      UNION\n')
```

Note: `UNION` (not `UNION ALL`) still dedupes because `sharingclass` is a function of the favorite, so a (object, favorite) pair has one class. The `summaryBlock` becomes:

```ts
const summaryBlock = (type: DimensionType, minor: number): string =>
    `  SELECT '${type.key}' AS type, z.uid, z.name,
    COUNT(DISTINCT y.favoriteuid) AS favorites,
    COUNT(DISTINCT y.favoriteuid) FILTER (WHERE y.sharingclass = 'public') AS public_favorites,
    COUNT(DISTINCT y.favoriteuid) FILTER (WHERE y.sharingclass = 'shared') AS shared_favorites,
    COUNT(DISTINCT y.favoriteuid) FILTER (WHERE y.sharingclass = 'private') AS private_favorites,
    COALESCE(SUM(fv.views), 0) AS views
  FROM ${type.table(minor)} z
  LEFT JOIN (
${usageSubquery(type)}
  ) y ON y.objectid = z.${type.primaryKey}
  LEFT JOIN favorite_views fv ON fv.favoriteuid = y.favoriteuid
  WHERE z.datadimension = TRUE
  GROUP BY z.uid, z.name`
```

`COUNT(DISTINCT y.favoriteuid)` ignores NULLs, so dimensions used by no favorite get 0. Because each favorite appears once per dimension after the `UNION`, `SUM(fv.views)` is unchanged. Final SELECT:

```ts
SELECT s.type, s.uid, s.name,
  s.favorites, s.public_favorites, s.shared_favorites, s.private_favorites,
  s.views,
  COALESCE(s.views::double precision / NULLIF(t.total, 0) * 100.0, 0) AS percent,
  COALESCE(s.views::double precision / NULLIF(f.count, 0) * 100.0, 0) AS percent_of_views
FROM summary s
CROSS JOIN totals t
CROSS JOIN total_favorite_views f
ORDER BY s.views DESC, s.favorites DESC, s.name
```

`FILTER (WHERE ...)` needs PostgreSQL 9.4+; every supported DHIS2 version requires far newer PostgreSQL.

- [ ] **Step 4: Run tests and lint**

Run: `yarn test buildQuery && yarn lint`
Expected: PASS. (`useUsageData` tests still pass because they use their own header list; they change in Task 2.)

- [ ] **Step 5: Run the generated SQL on the manual instance's database**

Write `buildQuery(43)` to a file via a throwaway Jest test (as in the 2026-09-21 plan, Task 4 step 5; delete the temp test afterwards) and run it read-only:

```bash
PGPASSWORD=dhis psql -h dhis2-agent-cdd-manual-db -U dhis -d dhis2 -f /tmp/query43.sql | head -30
```

(or pg8000 via python3). Expected: 23 rows, `favorites >= public_favorites + shared_favorites + private_favorites` is an equality on every row, and for one dimension with `favorites > 0` cross-check by hand:

```sql
SELECT LEFT(v.sharing->>'public',1) = 'r' AS pub, COUNT(*)
FROM visualization v JOIN visualization_categorydimensions a ON a.visualizationid = v.visualizationid
JOIN categorydimension d ON d.categorydimensionid = a.categorydimensionid
JOIN category c ON c.categoryid = d.categoryid WHERE c.uid = '<uid from the app>' GROUP BY 1;
```

Record the numbers in the commit message body or the report.

- [ ] **Step 6: Commit**

```bash
git add src/sql/buildQuery.ts src/sql/buildQuery.test.ts
git commit -m "Count favorites per dimension and split them by sharing class

Adds favorites, public_favorites, shared_favorites and private_favorites
to the SQL view. Public = public access string grants metadata read,
shared = not public but shared with users or groups, private = neither.
The view keeps its UID; installed copies are detected as outdated and
upgraded in place.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Row parsing for the new columns

**Files:**
- Modify: `src/hooks/useUsageData.ts`, `src/hooks/useUsageData.test.tsx`

**Interfaces:**
- Produces: `UsageRow` with the added numeric fields `favorites`, `publicFavorites`, `sharedFavorites`, `privateFavorites`.

- [ ] **Step 1: Update the test fixture and expectations**

In `src/hooks/useUsageData.test.tsx`, change `grid.headers` to the ten names in `SQL_VIEW_COLUMNS` order and the rows to

```ts
        ['CATEGORY', 'cX5k9anHEHd', 'Gender', 7, 4, 2, 1, 12, 60.0, 30.0],
        ['ORGUNIT_GROUP_SET', 'J5jldMd8OHv', 'Facility Type', '3', '3', '0', '0', '8', '40', '20'],
```

and the expected objects gain `favorites: 7, publicFavorites: 4, sharedFavorites: 2, privateFavorites: 1` and `favorites: 3, publicFavorites: 3, sharedFavorites: 0, privateFavorites: 0`. Add:

```ts
    it('defaults the favorite counts to 0 when the view predates them', () => {
        const legacy = {
            headers: ['type', 'uid', 'name', 'views', 'percent', 'percent_of_views'].map((name) => ({ name })),
            rows: [['CATEGORY', 'a', 'Age', 1, 1, 1]],
        }
        expect(parseUsageRows(legacy)[0]).toMatchObject({
            favorites: 0, publicFavorites: 0, sharedFavorites: 0, privateFavorites: 0,
        })
    })
```

(The app never renders a legacy grid because the status would be OUTDATED, but the parser must not crash on it.)

- [ ] **Step 2: Run to see it fail**

Run: `yarn test useUsageData` → FAIL on the missing fields.

- [ ] **Step 3: Implement**

In `src/hooks/useUsageData.ts` extend `UsageRow`:

```ts
export type UsageRow = {
    type: DimensionTypeKey
    uid: string
    name: string
    favorites: number
    publicFavorites: number
    sharedFavorites: number
    privateFavorites: number
    views: number
    percent: number
    percentOfViews: number
}
```

and the destructuring / mapping:

```ts
const [TYPE, UID, NAME, FAVORITES, PUBLIC, SHARED, PRIVATE, VIEWS, PERCENT, PERCENT_OF_VIEWS] =
    SQL_VIEW_COLUMNS
...
                favorites: toNumber(column(row, FAVORITES)),
                publicFavorites: toNumber(column(row, PUBLIC)),
                sharedFavorites: toNumber(column(row, SHARED)),
                privateFavorites: toNumber(column(row, PRIVATE)),
```

(`column()` returns `undefined` for a missing header and `toNumber(undefined)` is 0, which satisfies the legacy test.)

- [ ] **Step 4: Fix the other fixtures**

`src/components/UsageTable.test.tsx`, `src/components/UsageView.test.tsx`, `src/components/DisableDialog.test.tsx`, `src/hooks/useDisableDimension.test.tsx`, `src/App.test.tsx` and `src/components/usageTableUtils.test.ts` build `UsageRow` objects or grids: add the four fields (any small integers) so `tsc` passes. Run `yarn test && yarn lint`. Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUsageData.ts src/hooks/useUsageData.test.tsx src/components/*.test.tsx src/components/usageTableUtils.test.ts src/hooks/useDisableDimension.test.tsx src/App.test.tsx
git commit -m "Parse the favorite-count columns into usage rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Column definitions and persisted visibility

**Files:**
- Create: `src/components/columns.ts`, `src/components/columns.test.ts`
- Modify: `src/components/usageTableUtils.ts`, `src/components/usageTableUtils.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ColumnKey = 'type' | 'name' | 'uid' | 'favorites' | 'publicFavorites' | 'sharedFavorites' | 'privateFavorites' | 'views' | 'percent' | 'percentOfViews'
  type ColumnDef = { key: ColumnKey; label: () => string; description?: () => string; align: 'left' | 'right'; numeric: boolean; alwaysVisible: boolean; format: (row: UsageRow) => string }
  const COLUMN_DEFS: readonly ColumnDef[]          // in display order
  const DEFAULT_VISIBLE_COLUMNS: readonly ColumnKey[]
  const COLUMNS_STORAGE_KEY = 'data-dimension-disabler.columns'
  loadVisibleColumns(storage?: Storage): ColumnKey[]   // defaults on missing/invalid; always includes alwaysVisible keys; preserves COLUMN_DEFS order
  saveVisibleColumns(keys: ColumnKey[], storage?: Storage): void  // try/catch, never throws
  isColumnKey(value: unknown): value is ColumnKey
  ```
  `SortColumn` in `usageTableUtils.ts` becomes an alias of `ColumnKey`.

- [ ] **Step 1: Write the failing tests**

`src/components/columns.test.ts`:

```ts
import {
    COLUMN_DEFS,
    COLUMNS_STORAGE_KEY,
    DEFAULT_VISIBLE_COLUMNS,
    loadVisibleColumns,
    saveVisibleColumns,
} from './columns'

const memoryStorage = (initial: Record<string, string> = {}): Storage => {
    const data = new Map(Object.entries(initial))
    return {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, v),
        removeItem: (k) => void data.delete(k),
        clear: () => data.clear(),
        key: (i) => [...data.keys()][i] ?? null,
        get length() {
            return data.size
        },
    }
}

describe('columns', () => {
    it('lists the ten columns in display order with type and name always visible', () => {
        expect(COLUMN_DEFS.map((c) => c.key)).toEqual([
            'type', 'name', 'uid', 'favorites', 'publicFavorites', 'sharedFavorites',
            'privateFavorites', 'views', 'percent', 'percentOfViews',
        ])
        expect(COLUMN_DEFS.filter((c) => c.alwaysVisible).map((c) => c.key)).toEqual(['type', 'name'])
        for (const column of COLUMN_DEFS) {
            expect(column.label()).not.toHaveLength(0)
            if (column.numeric) {
                expect(column.align).toBe('right')
                expect(column.description?.()).not.toHaveLength(0)
            }
        }
    })

    it('has the agreed defaults', () => {
        expect(DEFAULT_VISIBLE_COLUMNS).toEqual(['type', 'name', 'uid', 'favorites', 'views', 'percent'])
    })

    it('returns the defaults when nothing is stored or the value is unreadable', () => {
        expect(loadVisibleColumns(memoryStorage())).toEqual(DEFAULT_VISIBLE_COLUMNS)
        expect(loadVisibleColumns(memoryStorage({ [COLUMNS_STORAGE_KEY]: 'not json' }))).toEqual(DEFAULT_VISIBLE_COLUMNS)
        expect(loadVisibleColumns(memoryStorage({ [COLUMNS_STORAGE_KEY]: '{"a":1}' }))).toEqual(DEFAULT_VISIBLE_COLUMNS)
        const throwing = { ...memoryStorage(), getItem: () => { throw new Error('blocked') } }
        expect(loadVisibleColumns(throwing)).toEqual(DEFAULT_VISIBLE_COLUMNS)
    })

    it('restores a stored selection, drops unknown keys, forces type and name, keeps display order', () => {
        const storage = memoryStorage({
            [COLUMNS_STORAGE_KEY]: JSON.stringify(['views', 'bogus', 'privateFavorites', 'uid']),
        })
        expect(loadVisibleColumns(storage)).toEqual(['type', 'name', 'uid', 'privateFavorites', 'views'])
    })

    it('round-trips through save and never throws on a failing storage', () => {
        const storage = memoryStorage()
        saveVisibleColumns(['type', 'name', 'views'], storage)
        expect(loadVisibleColumns(storage)).toEqual(['type', 'name', 'views'])
        const throwing = { ...storage, setItem: () => { throw new Error('quota') } }
        expect(() => saveVisibleColumns(['type', 'name'], throwing)).not.toThrow()
    })
})
```

Add to `src/components/usageTableUtils.test.ts` a case that `sortRows(rows, 'favorites', 'desc')` and `'publicFavorites'` sort numerically (extend the fixture rows with the four new fields).

- [ ] **Step 2: Run to see them fail**

Run: `yarn test columns` and `yarn test usageTableUtils` → FAIL (module missing / type error).

- [ ] **Step 3: Implement `columns.ts`**

```ts
import i18n from '@dhis2/d2-i18n'
import { getDimensionType } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'
import { formatPercent } from './usageTableUtils'

export type ColumnKey =
    | 'type' | 'name' | 'uid'
    | 'favorites' | 'publicFavorites' | 'sharedFavorites' | 'privateFavorites'
    | 'views' | 'percent' | 'percentOfViews'

export type ColumnDef = {
    key: ColumnKey
    label: () => string
    /** Shown in the header tooltip; required for numeric columns. */
    description?: () => string
    align: 'left' | 'right'
    numeric: boolean
    alwaysVisible: boolean
    format: (row: UsageRow) => string
}

const text = (key: 'type' | 'name' | 'uid', label: () => string, format: (row: UsageRow) => string, alwaysVisible = false): ColumnDef =>
    ({ key, label, align: 'left', numeric: false, alwaysVisible, format })

const number = (key: Exclude<ColumnKey, 'type' | 'name' | 'uid'>, label: () => string, description: () => string, format: (row: UsageRow) => string): ColumnDef =>
    ({ key, label, description, align: 'right', numeric: true, alwaysVisible: false, format })

export const COLUMN_DEFS: readonly ColumnDef[] = [
    text('type', () => i18n.t('Type'), (row) => getDimensionType(row.type).getLabel(), true),
    text('name', () => i18n.t('Name'), (row) => row.name, true),
    text('uid', () => i18n.t('UID'), (row) => row.uid),
    number('favorites', () => i18n.t('Favorites'),
        () => i18n.t('Number of visualizations, maps and event visualizations that use this dimension, regardless of how often they are viewed.'),
        (row) => String(row.favorites)),
    number('publicFavorites', () => i18n.t('Public'),
        () => i18n.t('Favorites using this dimension whose public sharing grants at least metadata read.'),
        (row) => String(row.publicFavorites)),
    number('sharedFavorites', () => i18n.t('Shared'),
        () => i18n.t('Favorites using this dimension that are not public but are shared with at least one user or user group.'),
        (row) => String(row.sharedFavorites)),
    number('privateFavorites', () => i18n.t('Private'),
        () => i18n.t('Favorites using this dimension that are neither public nor shared with anyone; only their owner can open them.'),
        (row) => String(row.privateFavorites)),
    number('views', () => i18n.t('Views'),
        () => i18n.t('How many times favorites using this dimension were opened in the last 12 months.'),
        (row) => String(row.views)),
    number('percent', () => i18n.t('% of dimension views'),
        () => i18n.t("This dimension's share of all views counted across every enabled dimension."),
        (row) => formatPercent(row.percent)),
    number('percentOfViews', () => i18n.t('% of favorite views'),
        () => i18n.t('The same views compared with every favorite view in the last 12 months, including favorites that use no dimension at all.'),
        (row) => formatPercent(row.percentOfViews)),
]

export const DEFAULT_VISIBLE_COLUMNS: readonly ColumnKey[] = ['type', 'name', 'uid', 'favorites', 'views', 'percent']

export const COLUMNS_STORAGE_KEY = 'data-dimension-disabler.columns'

const ALL_KEYS: readonly ColumnKey[] = COLUMN_DEFS.map((c) => c.key)

export const isColumnKey = (value: unknown): value is ColumnKey =>
    typeof value === 'string' && (ALL_KEYS as readonly string[]).includes(value)

const defaultStorage = (): Storage | undefined =>
    typeof window === 'undefined' ? undefined : window.localStorage

/** Keys in display order, always including the columns that cannot be hidden. */
const normalise = (keys: readonly ColumnKey[]): ColumnKey[] =>
    ALL_KEYS.filter((key) => keys.includes(key) || COLUMN_DEFS.find((c) => c.key === key)?.alwaysVisible)

export const loadVisibleColumns = (storage: Storage | undefined = defaultStorage()): ColumnKey[] => {
    try {
        const raw = storage?.getItem(COLUMNS_STORAGE_KEY)
        if (!raw) {
            return [...DEFAULT_VISIBLE_COLUMNS]
        }
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
            return [...DEFAULT_VISIBLE_COLUMNS]
        }
        return normalise(parsed.filter(isColumnKey))
    } catch {
        return [...DEFAULT_VISIBLE_COLUMNS]
    }
}

export const saveVisibleColumns = (keys: readonly ColumnKey[], storage: Storage | undefined = defaultStorage()): void => {
    try {
        storage?.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(normalise(keys)))
    } catch {
        // Storage unavailable (private mode, quota, blocked): the choice simply is not remembered.
    }
}
```

`formatPercent` import from `usageTableUtils` and `usageTableUtils` importing `ColumnKey` from `columns` would be circular; avoid it by moving `formatPercent` into `columns.ts`? No: keep `formatPercent` in `usageTableUtils.ts` and have `usageTableUtils.ts` define `SortColumn` locally as the same union and NOT import from `columns.ts`. Then `columns.ts` imports `formatPercent` only. (TypeScript structural typing makes `SortColumn` and `ColumnKey` interchangeable; add a compile-time check in `columns.ts`: `const _check: SortColumn[] = [] as ColumnKey[]` is unnecessary; instead export `ColumnKey` from `columns.ts` and in `usageTableUtils.ts` write `export type SortColumn = ColumnKey` with `import type { ColumnKey } from './columns'` — type-only imports do not create a runtime cycle. Do that.)

- [ ] **Step 4: Update `usageTableUtils.ts`**

```ts
import type { ColumnKey } from './columns'
export type SortColumn = ColumnKey
```

and in `compare`, the `default` branch already subtracts numbers; make the text cases `'name' | 'uid'` and `'type'` as today. `formatPercent` stays.

- [ ] **Step 5: Run tests and lint**

Run: `yarn test columns`, `yarn test usageTableUtils`, `yarn lint`. Expected PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/columns.ts src/components/columns.test.ts src/components/usageTableUtils.ts src/components/usageTableUtils.test.ts
git commit -m "Define table columns as data with persisted visibility

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Column chooser and header tooltips

**Files:**
- Create: `src/components/ColumnChooser.tsx`, `src/components/ColumnChooser.test.tsx`, `src/components/ColumnHeaderLabel.tsx`, `src/components/ColumnHeaderLabel.module.css`

**Interfaces:**
- Produces: `<ColumnChooser visible={ColumnKey[]} onChange={(keys: ColumnKey[]) => void} />` (a `DropdownButton` labelled "Columns" whose `FlyoutMenu` lists every column from `COLUMN_DEFS` as a checkbox `MenuItem`; always-visible columns are checked and disabled); `<ColumnHeaderLabel column={ColumnDef} />` (label plus, when `description` exists, an `IconInfo16` wrapped in a `Tooltip`).

- [ ] **Step 1: Write the failing test**

`src/components/ColumnChooser.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { ColumnChooser } from './ColumnChooser'

describe('ColumnChooser', () => {
    it('lists every column, disables the always-visible ones and toggles the rest', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()
        renderWithProvider(
            <ColumnChooser visible={['type', 'name', 'uid', 'views']} onChange={onChange} />
        )
        await user.click(screen.getByRole('button', { name: /Columns/ }))
        const menu = screen.getByTestId('column-chooser-menu')
        expect(within(menu).getAllByRole('menuitemcheckbox')).toHaveLength(10)
        const typeItem = within(menu).getByRole('menuitemcheckbox', { name: /Type/ })
        expect(typeItem).toHaveAttribute('aria-checked', 'true')
        expect(typeItem).toHaveAttribute('aria-disabled', 'true')

        await user.click(within(menu).getByRole('menuitemcheckbox', { name: /Public/ }))
        expect(onChange).toHaveBeenLastCalledWith(['type', 'name', 'uid', 'publicFavorites', 'views'])

        await user.click(within(menu).getByRole('menuitemcheckbox', { name: /UID/ }))
        expect(onChange).toHaveBeenLastCalledWith(['type', 'name', 'views'])
    })
})
```

If `aria-disabled` is not how `@dhis2/ui`'s `MenuItem` renders `disabled`, run `screen.debug()` and adjust the attribute assertion (never the behaviour). If the menu renders in a portal without the `dataTest` propagating, assert on `screen.getAllByRole('menuitemcheckbox')` instead of scoping to the menu.

- [ ] **Step 2: Run to see it fail**

Run: `yarn test ColumnChooser` → FAIL (module missing).

- [ ] **Step 3: Implement**

`src/components/ColumnChooser.tsx`:

```tsx
import i18n from '@dhis2/d2-i18n'
import { DropdownButton, FlyoutMenu, MenuItem } from '@dhis2/ui'
import React, { useState } from 'react'
import { COLUMN_DEFS, ColumnKey } from './columns'

type Props = {
    visible: ColumnKey[]
    onChange: (visible: ColumnKey[]) => void
}

export const ColumnChooser = ({ visible, onChange }: Props) => {
    const [open, setOpen] = useState(false)

    const toggle = (key: ColumnKey) => {
        const next = visible.includes(key)
            ? visible.filter((k) => k !== key)
            : [...visible, key]
        // keep display order
        onChange(COLUMN_DEFS.map((c) => c.key).filter((k) => next.includes(k)))
    }

    return (
        <DropdownButton
            small
            secondary
            open={open}
            onClick={() => setOpen((current) => !current)}
            dataTest="column-chooser"
            component={
                <FlyoutMenu dense dataTest="column-chooser-menu">
                    {COLUMN_DEFS.map((column) => (
                        <MenuItem
                            key={column.key}
                            dataTest={`column-chooser-${column.key}`}
                            checkbox
                            checked={visible.includes(column.key)}
                            disabled={column.alwaysVisible}
                            label={column.label()}
                            onClick={() => toggle(column.key)}
                        />
                    ))}
                </FlyoutMenu>
            }
        >
            {i18n.t('Columns')}
        </DropdownButton>
    )
}
```

`src/components/ColumnHeaderLabel.tsx`:

```tsx
import { IconInfo16, Tooltip } from '@dhis2/ui'
import React from 'react'
import classes from './ColumnHeaderLabel.module.css'
import { ColumnDef } from './columns'

export const ColumnHeaderLabel = ({ column }: { column: ColumnDef }) => (
    <span className={classes.label}>
        {column.label()}
        {column.description && (
            <Tooltip content={column.description()} maxWidth={320}>
                <span className={classes.icon} data-test={`column-info-${column.key}`} aria-label={column.description()}>
                    <IconInfo16 />
                </span>
            </Tooltip>
        )}
    </span>
)
```

`src/components/ColumnHeaderLabel.module.css`:

```css
.label {
    display: inline-flex;
    align-items: center;
    gap: var(--spacers-dp4);
}

.icon {
    display: inline-flex;
    color: var(--colors-grey600);
    cursor: help;
}
```

If `IconInfo16` is not exported from `@dhis2/ui` (it is re-exported from `@dhis2/ui-icons`, verified present), import it from `@dhis2/ui-icons` instead and note it.

- [ ] **Step 4: Run tests and lint**

Run: `yarn test ColumnChooser && yarn lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ColumnChooser.tsx src/components/ColumnChooser.test.tsx src/components/ColumnHeaderLabel.tsx src/components/ColumnHeaderLabel.module.css
git commit -m "Add the column chooser and header info tooltips

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Data-driven usage table with spacing

**Files:**
- Modify: `src/components/UsageTable.tsx`, `src/components/UsageTable.module.css`, `src/components/UsageTable.test.tsx`, `src/components/UsageView.module.css`

- [ ] **Step 1: Extend the tests**

In `src/components/UsageTable.test.tsx` (fixture rows already have the new fields from Task 2), add:

```tsx
    beforeEach(() => {
        window.localStorage.clear()
    })

    it('shows the default columns and hides the rest', () => {
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        for (const key of ['type', 'name', 'uid', 'favorites', 'views', 'percent']) {
            expect(screen.getByTestId(`usage-header-${key}`)).toBeInTheDocument()
        }
        for (const key of ['publicFavorites', 'sharedFavorites', 'privateFavorites', 'percentOfViews']) {
            expect(screen.queryByTestId(`usage-header-${key}`)).not.toBeInTheDocument()
        }
    })

    it('adds a column from the chooser and remembers it', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        await user.click(screen.getByRole('button', { name: /Columns/ }))
        await user.click(screen.getByRole('menuitemcheckbox', { name: /Private/ }))
        expect(screen.getByTestId('usage-header-privateFavorites')).toBeInTheDocument()
        expect(JSON.parse(window.localStorage.getItem('data-dimension-disabler.columns') ?? '[]')).toContain('privateFavorites')
    })

    it('renders the favorite counts in the row', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        const genderRow = screen.getAllByTestId('usage-row').find((row) => within(row).getByTestId('usage-row-name').textContent === 'Gender') as HTMLElement
        expect(within(genderRow).getByTestId('usage-cell-favorites')).toHaveTextContent(String(rows[0].favorites))
        await user.click(screen.getByRole('button', { name: /Columns/ }))
        await user.click(screen.getByRole('menuitemcheckbox', { name: /Public/ }))
        expect(within(genderRow).getByTestId('usage-cell-publicFavorites')).toHaveTextContent(String(rows[0].publicFavorites))
    })

    it('sorts by favorites descending on first click', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        await user.click(within(screen.getByTestId('usage-header-favorites')).getByRole('button'))
        const values = screen.getAllByTestId('usage-cell-favorites').map((cell) => Number(cell.textContent))
        expect(values).toEqual([...values].sort((a, b) => b - a))
    })

    it('shows an info tooltip icon on numeric headers only', () => {
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        expect(screen.getByTestId('column-info-views')).toBeInTheDocument()
        expect(screen.queryByTestId('column-info-name')).not.toBeInTheDocument()
    })
```

Give the fixture rows distinct `favorites` values (e.g. 5, 9, 1) so the sort test is meaningful. Existing tests that assume the fixed six columns (e.g. "50.0%" visible, sort by "% of dimension views") still hold because `percent` is a default column; the sort test for `percentOfViews`, if any, must first enable that column through the chooser. Also, rows now render cells with `data-test="usage-cell-<key>"`.

- [ ] **Step 2: Run to see the new tests fail**

Run: `yarn test UsageTable` → FAIL.

- [ ] **Step 3: Rewrite `UsageTable.tsx` to be data-driven**

```tsx
import i18n from '@dhis2/d2-i18n'
import { Button, DataTable, DataTableBody, DataTableCell, DataTableColumnHeader, DataTableHead, DataTableRow } from '@dhis2/ui'
import React, { useState } from 'react'
import { UsageRow } from '../hooks/useUsageData'
import { ColumnChooser } from './ColumnChooser'
import { ColumnHeaderLabel } from './ColumnHeaderLabel'
import { COLUMN_DEFS, ColumnKey, loadVisibleColumns, saveVisibleColumns } from './columns'
import { TypeFilter } from './TypeFilter'
import classes from './UsageTable.module.css'
import { filterRows, SortColumn, SortDirection, sortRows, TypeFilterValue } from './usageTableUtils'

type Props = { rows: UsageRow[]; onDisable: (row: UsageRow) => void }
type HeaderSortDirection = 'asc' | 'desc' | 'default'

const defaultDirectionFor = (column: SortColumn): SortDirection =>
    COLUMN_DEFS.find((c) => c.key === column)?.numeric ? 'desc' : 'asc'

export const UsageTable = ({ rows, onDisable }: Props) => {
    const [filter, setFilter] = useState<TypeFilterValue>('ALL')
    const [visibleKeys, setVisibleKeys] = useState<ColumnKey[]>(() => loadVisibleColumns())
    const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({ column: 'views', direction: 'desc' })

    const visibleColumns = COLUMN_DEFS.filter((c) => visibleKeys.includes(c.key))
    const visibleRows = sortRows(filterRows(rows, filter), sort.column, sort.direction)

    const changeColumns = (keys: ColumnKey[]) => {
        setVisibleKeys(keys)
        saveVisibleColumns(keys)
    }
    // (sortDirectionFor, toggleSort, countLabel unchanged)

    return (
        <div>
            <div className={classes.toolbar}>
                <div className={classes.controls}>
                    <TypeFilter value={filter} onChange={setFilter} />
                    <ColumnChooser visible={visibleKeys} onChange={changeColumns} />
                </div>
                <span className={classes.count} data-test="usage-count">{countLabel}</span>
            </div>
            <DataTable dataTest="usage-table">
                <DataTableHead>
                    <DataTableRow>
                        {visibleColumns.map((column) => (
                            <DataTableColumnHeader
                                key={column.key}
                                dataTest={`usage-header-${column.key}`}
                                align={column.align}
                                name={column.key}
                                sortDirection={sortDirectionFor(column.key)}
                                sortIconTitle={i18n.t('Sort by {{column}}', { column: column.label() })}
                                onSortIconClick={() => toggleSort(column.key)}
                            >
                                <ColumnHeaderLabel column={column} />
                            </DataTableColumnHeader>
                        ))}
                        <DataTableColumnHeader>{i18n.t('Action')}</DataTableColumnHeader>
                    </DataTableRow>
                </DataTableHead>
                <DataTableBody dataTest="usage-table-body">
                    {visibleRows.length === 0 && (
                        <DataTableRow>
                            <DataTableCell colSpan={String(visibleColumns.length + 1)} align="center">
                                {i18n.t('No enabled data dimensions found')}
                            </DataTableCell>
                        </DataTableRow>
                    )}
                    {visibleRows.map((row) => (
                        <DataTableRow key={`${row.type}-${row.uid}`} dataTest="usage-row">
                            {visibleColumns.map((column) => (
                                <DataTableCell
                                    key={column.key}
                                    dataTest={column.key === 'name' ? 'usage-row-name' : `usage-cell-${column.key}`}
                                    align={column.align}
                                    className={column.key === 'uid' ? classes.uid : column.numeric ? classes.number : undefined}
                                >
                                    {column.format(row)}
                                </DataTableCell>
                            ))}
                            <DataTableCell className={classes.actionCell}>
                                <Button small destructive secondary onClick={() => onDisable(row)}>
                                    {i18n.t('Disable')}
                                </Button>
                            </DataTableCell>
                        </DataTableRow>
                    ))}
                </DataTableBody>
            </DataTable>
        </div>
    )
}
```

Keep `data-test="usage-row-name"` on the name cell so existing tests and the e2e suite keep working; add `usage-cell-name` is not needed.

- [ ] **Step 4: Spacing**

`src/components/UsageTable.module.css`:

```css
.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--spacers-dp16);
    margin-block: var(--spacers-dp16);
}

.controls {
    display: flex;
    align-items: flex-end;
    gap: var(--spacers-dp12);
}

.count { color: var(--colors-grey700); font-size: 13px; padding-block-end: var(--spacers-dp8); }
.uid { font-family: monospace; color: var(--colors-grey700); }
.number { font-variant-numeric: tabular-nums; }
.actionCell { padding-inline: var(--spacers-dp12); }
```

`src/components/UsageView.module.css` footer: add `padding-inline: var(--spacers-dp8)` and keep the top border/margin; make sure the Remove button is not flush against the table (`margin-block-start: var(--spacers-dp24)` already).

- [ ] **Step 5: Run everything**

Run: `yarn test UsageTable`, then `yarn test` and `yarn lint`. Expected PASS. If the `DataTableColumnHeader` sort button role query fails now that the header contains an icon, keep using `within(header).getByRole('button')` but note there may be two buttons only if the Tooltip renders one (it does not; it wraps a span).

- [ ] **Step 6: Commit**

```bash
git add src/components/UsageTable.tsx src/components/UsageTable.module.css src/components/UsageTable.test.tsx src/components/UsageView.module.css
git commit -m "Drive the usage table from column definitions with a chooser

Adds Favorites, Public, Shared and Private columns, a Columns dropdown
to show or hide columns (remembered per browser), info tooltips on the
numeric headers, and spacing around the toolbar controls and buttons.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Title and intro

**Files:**
- Modify: `src/App.tsx`, `src/App.module.css`, `src/App.test.tsx`, `src/components/Intro.tsx`, `src/components/Intro.module.css`

- [ ] **Step 1: Adjust tests**

`src/App.test.tsx`: any assertion on the heading "Data Dimension Disabler" must go (the header bar shows the name); assert instead that the intro summary "About this tool" renders on every status, e.g. in the "shows the update notice for an outdated view" test add `expect(screen.getByText('About this tool')).toBeInTheDocument()`.

- [ ] **Step 2: Implement**

`src/App.tsx`: remove the `<h1>` line and the now-unused `i18n` import if nothing else uses it (keep it if used). `src/App.module.css`: remove the `.container h1` rule; change `.container` `max-width: 1200px` to `max-width: none` so the table can use the full width the maintainer asked for (keep the padding).

`src/components/Intro.tsx`:

```tsx
export const Intro = () => (
    <details className={classes.intro} open>
        <summary>{i18n.t('About this tool')}</summary>
        <p>
            {i18n.t(
                'Every category and group set enabled as a data dimension adds a column to the analytics tables. This table ranks the enabled dimensions by how many favorites use them and how often those favorites were opened in the last 12 months, so rarely used dimensions can be disabled. Hover the column headers for definitions.'
            )}
        </p>
        <p>
            {i18n.t(
                'Favorites that use a disabled dimension stop working and section forms lose its subtotals, so check before disabling. A dimension can be re-enabled at any time in the Maintenance app.'
            )}
        </p>
    </details>
)
```

`src/components/Intro.module.css`: remove `max-width: 900px`.

- [ ] **Step 3: Run tests, lint, and update strings**

Run: `yarn test App.test`, `yarn lint`, `yarn build` (regenerates `i18n/en.pot`). Expected PASS; `en.pot` no longer contains the removed strings and contains the new ones (including the ten column labels and nine descriptions).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.module.css src/App.test.tsx src/components/Intro.tsx src/components/Intro.module.css i18n/en.pot
git commit -m "Drop the in-app title and shorten the intro to full width

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: e2e suite, docs and live check

**Files:**
- Modify: `e2e/app_driver.py`, `e2e/flows.py`, `e2e/README.md`, `README.md`, `CHANGELOG.md`, `docs/schema-check.md`, `CLAUDE.md`

- [ ] **Step 1: Make the e2e table reader header-driven**

In `e2e/app_driver.py`, replace `table_rows` so it reads the header cells (`[data-test^='usage-header-']`, taking the key from the `data-test` suffix) and zips them with each row's `td` texts, returning dicts keyed by column key (`type`, `name`, `uid`, `favorites`, `views`, `percent`, ... ) plus whatever is visible. Update `flows.py` where `percent_of_views` was read from every row: the column is hidden by default, so either enable it via the chooser (`[data-test='column-chooser']` then the `menuitemcheckbox` named "% of favorite views") before comparing, or compare only the visible columns. Add a flow `columns-chooser` that: opens the chooser, enables "Private", asserts the header appears, reloads the page and asserts it is still shown (localStorage), then disables it again. Add to `_compare_table_with_api` a cross-check of `favorites`/`public`/`shared`/`private` against SQL for up to three rows (the SQL from Task 1 step 5, parameterised by uid). Keep constants hoisted and per-step functions (SonarCloud rules). `python3 -m py_compile e2e/*.py` must pass.

- [ ] **Step 2: Docs**

- `README.md` "How it works": add a paragraph on the four favorite-count columns and their sharing definitions; add a short "Columns" subsection (defaults, chooser, per-browser persistence); update the percentages paragraph to say the definitions are also in the header tooltips.
- `CHANGELOG.md`: under `[1.0.0]` "Added" (unreleased), add: favorite counts (total/public/shared/private), column chooser with per-browser persistence, header tooltips; under "Changed": no in-app title, shorter full-width intro, spacing. If the maintainer prefers a `1.1.0` entry, use that instead.
- `docs/schema-check.md`: append a dated note that `visualization`, `map` and `eventvisualization` carry a `sharing` JSONB column on 2.40.12 and 2.43.1 (already visible in the raw dumps) and how the view classifies it.
- `CLAUDE.md`: mention `src/components/columns.ts` as the single source of truth for columns and the `localStorage` key.

- [ ] **Step 3: Live check on `agent-cdd-manual`**

```bash
yarn build
curl -s -o /dev/null -w "%{http_code}\n" -u admin:district -F "file=@build/bundle/data-dimension-disabler-1.0.0.zip" http://dhis2-agent-cdd-manual:8080/api/apps
```

Open the app (Playwright via `@playwright/cli@0.1.19`, or the e2e suite: `DHIS2_URL=http://dhis2-agent-cdd-manual:8080 python3 e2e/run_suite.py` per `e2e/README.md`). Expected: the OUTDATED notice (the instance has the previous view), Update, then the table with the new default columns; open the chooser, enable Public/Shared/Private; for two dimensions compare the four counts with the SQL from Task 1 step 5 against `dhis2-agent-cdd-manual-db`. Save one screenshot as `docs/review-2026-09-21/screenshots/2.43-columns.png` (replace the older `2.43.1-02-table.png` reference in `UI-TEST-RESULTS.md` with a note that the columns changed on 2026-09-22). Re-enable anything you disabled. Leave the instance running for the maintainer.

- [ ] **Step 4: Verify and commit**

Run: `yarn lint && yarn test && yarn build && python3 -m py_compile e2e/*.py`. Then:

```bash
git add e2e README.md CHANGELOG.md docs/schema-check.md CLAUDE.md docs/review-2026-09-21
git commit -m "Document the favorite-count columns and update the e2e suite

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Hand-off

- [ ] `git status` clean; `git log --oneline 95d01dd..HEAD` shows the seven commits above, linear.
- [ ] Report to the maintainer: what changed, the live-check numbers (a dimension's favorites/public/shared/private vs SQL), the screenshot path, that the installed view on any existing instance will show OUTDATED once and upgrade in place, and that the branch still needs to be re-created with signed commits on the host.
