# Data Dimension Disabler: App Platform Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the category dimension disabler as a TypeScript DHIS2 App Platform app that ranks categories and all three group set types by favorite usage and lets an admin disable unused ones.

**Architecture:** A single-page React app. A generated SQL view (one UID, upgraded in place) does the counting server-side; the app detects the view's state (missing / outdated / ready), renders the result grid in a sortable `@dhis2/ui` DataTable with a type filter, and issues JSON Patch mutations to disable a dimension. All SQL and endpoint knowledge lives in one type map so the four dimension kinds are data, not code branches.

**Tech Stack:** TypeScript, React 18, `@dhis2/cli-app-scripts` 12 (Vite + Jest), `@dhis2/app-runtime` 3.17, `@dhis2/ui` 10.17, `@dhis2/d2-i18n`, yarn 1, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-app-platform-migration-design.md`

## Global Constraints

- Supported servers: DHIS2 2.40, 2.41, 2.42, 2.43. `minDHIS2Version: '2.40'` in `d2.config.js`.
- SQL view UID is `GOLswS44mh8`, name `Data dimension usage`, type `QUERY`, `cacheStrategy: NO_CACHE`, sharing `public: 'r-------'`.
- Package manager is **yarn 1** (`yarn`, `yarn.lock`), not pnpm or npm. The CI workflows already use `yarn install --frozen-lockfile --ignore-scripts`.
- Code style is the `@dhis2/config-prettier` default: 4-space indent, no semicolons, single quotes, trailing commas. `yarn lint` (eslint + prettier check) must pass before every commit.
- Every user-facing string goes through `i18n.t()` from `@dhis2/d2-i18n`. Never call `i18n.t` at module scope (the locale is not loaded yet); call it inside functions/components.
- Always import React explicitly in `.tsx` files (`import React from 'react'`); tsconfig uses `"jsx": "react"`.
- Tests use `data-test` (not `data-testid`) for `getByTestId`, configured in `jest.setup.ts`.
- No `alert()`, `confirm()`, or console-only error paths. Errors render in `NoticeBox` or inside the open `Modal`.
- Only `@dhis2/ui` components for UI. Only CSS Modules with DHIS2 CSS variables for styling.
- Commit messages: imperative subject, body explains why, end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never add a `Claude-Session:` trailer. Linear history on branch `app-platform-migration`.
- The sandbox cannot `git push`; the user pushes from the host.
- **Never run analytics.** Do not call `/api/resourceTables/analytics`, schedule analytics jobs, or use any broker feature that runs analytics. The app does not need analytics tables; the user is running analytics tests elsewhere on the same host.
- Test instances are created through the d2-broker (`dhis2-instances` skill). Their DB is `dhis2-<name>-db:5432`, database `dhis2`, user `dhis`, password `dhis`. Web login `admin` / `district`.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `d2.config.js` | App Platform config: name, title, minDHIS2Version, entry point |
| `package.json` | scripts, deps, `jest.setupFilesAfterEnv` |
| `tsconfig.json`, `viteConfigExtensions.mts`, `types/*.d.ts`, `eslint.config.mjs`, `.prettierrc.mjs` | tooling, copied from the platform template |
| `jest.setup.ts` | jest-dom matchers + `data-test` id attribute |
| `public/dhis2-app-icon.png` | app icon (from `src/img/icons/app_logo_96x96.png`) |
| `src/dimensionTypes.ts` | the four dimension types: key, label, API endpoint, SQL table/column names |
| `src/sql/buildQuery.ts` | builds the SQL view query text for a server minor version |
| `src/sql/sqlView.ts` | SQL view constants, full definition builder, outdated check |
| `src/hooks/useSqlViewStatus.ts` | fetch view by UID, classify LOADING/MISSING/OUTDATED/READY/ERROR |
| `src/hooks/useUsageData.ts` | fetch `/sqlViews/{uid}/data`, parse `listGrid` into `UsageRow[]` |
| `src/hooks/useSqlViewMutations.ts` | create / update / remove the SQL view via the data engine |
| `src/hooks/useDisableDimension.ts` | JSON Patch `dataDimension=false` for a row |
| `src/components/Intro.tsx` | explanatory text |
| `src/components/TypeFilter.tsx` | SingleSelectField "All types" + four types |
| `src/components/usageTableUtils.ts` | pure `sortRows`, `filterRows`, `formatPercent` |
| `src/components/UsageTable.tsx` | sortable DataTable with Disable buttons |
| `src/components/DisableDialog.tsx` | confirmation Modal for disabling |
| `src/components/RemoveViewDialog.tsx` | confirmation Modal for deleting the view |
| `src/components/SqlViewNotice.tsx` | notices + buttons for MISSING / OUTDATED / ERROR |
| `src/App.tsx`, `src/App.module.css` | wiring |
| `src/test-utils/renderWithProvider.tsx` | test wrapper with app-runtime providers and alert stack |
| `scripts/generate-view-events.sh` | test helper: records favorite view events on an instance |
| `docs/schema-check.md` | verified table/column names per version (output of Task 1) |
| `CLAUDE.md` | codebase notes for future sessions |

---

### Task 1: Verify the database schema on 2.40 and 2.43

The SQL view depends on table and column names that the spec lists as *expected*. Verify them on real databases before writing SQL.

**Files:**
- Create: `docs/schema-check.md`

**Interfaces:**
- Produces: the verified names consumed by Task 3 (`dimensionTypes.ts`) and Task 4 (`buildQuery.ts`). If a name differs from the expectations below, the doc says so and the later tasks use the doc.

- [ ] **Step 1: Create the two instances used for the schema check (they are reused for the review in Task 15)**

Follow the `dhis2-instances` skill. Create `agent-cdd-sl40` from seed `dhis2-db-sierra-leone_V40.sql.gz` and `agent-cdd-sl43` from `dhis2-db-sierra-leone_v43.sql.gz`, label `data dimension disabler review (olav, 2026-09-21)`. Poll the jobs until both are `running`, then confirm:

```bash
curl -s -u admin:district http://dhis2-agent-cdd-sl40:8080/api/system/info | jq -r .version
curl -s -u admin:district http://dhis2-agent-cdd-sl43:8080/api/system/info | jq -r .version
```

Expected: `2.40.x` and `2.43.x`.

- [ ] **Step 2: Dump the relevant schema on both databases**

Run for each of `sl40` and `sl43` (replace `<n>`). If `psql` is missing, use the pg8000 fallback in the `dhis2-instances` skill with the same SQL.

```bash
PGPASSWORD=dhis psql -h dhis2-agent-cdd-<n>-db -U dhis -d dhis2 -At -c "
SELECT table_name || ': ' || string_agg(column_name, ', ' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN (
 'category','dataelementcategory','orgunitgroupset','dataelementgroupset','categoryoptiongroupset',
 'categorydimension','orgunitgroupsetdimension','dataelementgroupsetdimension','categoryoptiongroupsetdimension',
 'visualization_categorydimensions','visualization_orgunitgroupsetdimensions','visualization_dataelementgroupsetdimensions','visualization_categoryoptiongroupsetdimensions',
 'mapview_categorydimensions','mapview_orgunitgroupsetdimensions','mapview_dataelementgroupsetdimensions','mapview_categoryoptiongroupsetdimensions',
 'eventvisualization_categorydimensions','eventvisualization_orgunitgroupsetdimensions','eventvisualization_dataelementgroupsetdimensions','eventvisualization_categoryoptiongroupsetdimensions',
 'visualization','mapview','map','map_mapviews','eventvisualization','datastatisticsevent')
GROUP BY table_name ORDER BY table_name;"
```

Also list the event types the server actually writes:

```bash
PGPASSWORD=dhis psql -h dhis2-agent-cdd-<n>-db -U dhis -d dhis2 -At -c \
 "SELECT eventtype, COUNT(*) FROM datastatisticsevent GROUP BY 1 ORDER BY 1;"
```

- [ ] **Step 3: Compare against the expectations and write `docs/schema-check.md`**

Expected (from the spec), per dimension type:

| type | entity table (pk) | dimension table (pk, fk) | join table suffix |
|------|-------------------|--------------------------|-------------------|
| CATEGORY | `category` on 41+, `dataelementcategory` on 40 (`categoryid`) | `categorydimension` (`categorydimensionid`, `categoryid`) | `categorydimensions` |
| ORGUNIT_GROUP_SET | `orgunitgroupset` (`orgunitgroupsetid`) | `orgunitgroupsetdimension` (`orgunitgroupsetdimensionid`, `orgunitgroupsetid`) | `orgunitgroupsetdimensions` |
| DATAELEMENT_GROUP_SET | `dataelementgroupset` (`dataelementgroupsetid`) | `dataelementgroupsetdimension` (`dataelementgroupsetdimensionid`, `dataelementgroupsetid`) | `dataelementgroupsetdimensions` |
| CATEGORYOPTION_GROUP_SET | `categoryoptiongroupset` (`categoryoptiongroupsetid`) | `categoryoptiongroupsetdimension` (`categoryoptiongroupsetdimensionid`, `categoryoptiongroupsetid`) | `categoryoptiongroupsetdimensions` |

Expected favorite joins: `visualization(visualizationid, uid)`, `mapview(mapviewid)` + `map_mapviews(mapid, mapviewid)` + `map(mapid, uid)`, `eventvisualization(eventvisualizationid, uid)`. *(Outcome: the join table is actually `mapmapviews`, and data element group set join tables exist only for `visualization`; Task 4 reflects this.)* Expected join table columns: `<favorite>id` + `<dimensiontable>id`. Every entity table must have `uid`, `name`, `datadimension`.

Write the file with this shape (fill from the real output; keep it short):

```markdown
# Schema check for the Data dimension usage SQL view

Checked 2026-09-21 on Sierra Leone 2.40.x and 2.43.x seeds.

## Result
- All expected tables and columns exist on both versions: YES / NO (list differences)
- Category table: `dataelementcategory` on 2.40, `category` on 2.43.
- Missing tables on 2.40: (none | list) -> handled in buildQuery.ts by ...
- datastatisticsevent.eventtype values seen: ...

## Raw output
<paste both dumps>
```

If a table is missing on one version, note exactly which and the plan's Task 4 gains a version condition for that branch (see Task 4, step 3, `favoriteSourcesFor`).

- [ ] **Step 4: Commit**

```bash
git add docs/schema-check.md
git commit -m "Record verified SQL schema for the usage view on 2.40 and 2.43

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Replace the webpack project with an App Platform TypeScript project

**Files:**
- Delete: `webpack.config.js`, `.eslintrc.js`, `eslint.config.js`, `eslint.config.mjs`, `d2auth.json`, `d2auth.template.json`, `manifest.webapp`, `build/`, `compiled/`, `src/app.js`, `src/index.html`, `src/js/`, `src/css/`, `src/resources/`, `src/img/`, `yarn.lock`, `.DS_Store`, `src/.DS_Store`
- Create: `d2.config.js`, `tsconfig.json`, `viteConfigExtensions.mts`, `types/global.d.ts`, `types/modules.d.ts`, `eslint.config.mjs`, `.prettierrc.mjs`, `jest.setup.ts`, `public/dhis2-app-icon.png`, `src/App.tsx`, `src/App.test.tsx`, `src/test-utils/renderWithProvider.tsx`, `src/test-utils/MockAlertStack.tsx`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `renderWithProvider(ui, data?, config?)` used by every component/hook test; the `yarn lint`, `yarn test`, `yarn build` commands.

- [ ] **Step 1: Remove the old build and sources**

```bash
cd /Users/olavpo/Repos/tool-category-dimension-disabler
mkdir -p public
cp src/img/icons/app_logo_96x96.png public/dhis2-app-icon.png
git rm -rq webpack.config.js .eslintrc.js eslint.config.js eslint.config.mjs d2auth.template.json manifest.webapp build compiled src yarn.lock
rm -rf d2auth.json .DS_Store src node_modules
```

- [ ] **Step 2: Write `package.json`**

```json
{
    "name": "data-dimension-disabler",
    "version": "1.0.0",
    "description": "Rank categories and group sets that are enabled as data dimensions by how often favorites using them are viewed, and disable the unused ones",
    "license": "BSD-3-Clause",
    "private": true,
    "scripts": {
        "build": "d2-app-scripts build",
        "start": "d2-app-scripts start",
        "test": "d2-app-scripts test",
        "deploy": "d2-app-scripts deploy",
        "lint": "eslint && prettier -c . && tsc --noEmit",
        "format": "prettier . -w"
    },
    "dependencies": {
        "@dhis2/app-runtime": "^3.17.4",
        "@dhis2/d2-i18n": "^1.2.0",
        "@dhis2/ui": "^10.17.0",
        "react": "^18.3.1",
        "react-dom": "^18.3.1"
    },
    "devDependencies": {
        "@dhis2/cli-app-scripts": "12.11.5",
        "@dhis2/config-eslint": "^0.2.2",
        "@dhis2/config-prettier": "^0.2.2",
        "@eslint/compat": "^2.0.0",
        "@testing-library/dom": "^10.4.0",
        "@testing-library/jest-dom": "^6.6.3",
        "@testing-library/react": "^16.3.0",
        "@testing-library/user-event": "^14.6.1",
        "@types/jest": "^29.5.14",
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "eslint": "^9.39.0",
        "prettier": "^3.7.0",
        "typescript": "^5.9.0",
        "vite": "^7.3.0"
    },
    "jest": {
        "setupFilesAfterEnv": ["<rootDir>/jest.setup.ts"]
    }
}
```

- [ ] **Step 3: Write the tooling files**

`d2.config.js`:

```javascript
/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'data-dimension-disabler',
    title: 'Data Dimension Disabler',
    description:
        'Rank categories and group sets that are enabled as data dimensions by how often favorites using them are viewed, and disable the unused ones',
    minDHIS2Version: '2.40',

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
```

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "noEmit": true,
        "skipLibCheck": true,
        "allowJs": true,
        "jsx": "react",
        "esModuleInterop": true,
        "strict": true,
        "target": "ESNext",
        "module": "esnext",
        "moduleResolution": "node",
        "baseUrl": ".",
        "paths": {
            "@/*": ["src/*"]
        }
    },
    "include": ["src", "types", "jest.setup.ts"]
}
```

`viteConfigExtensions.mts`:

```typescript
import path from 'path'
import { defineConfig, ConfigEnv } from 'vite'

const viteConfig = defineConfig(async (configEnv: ConfigEnv) => {
    const { mode } = configEnv
    return {
        clearScreen: mode !== 'development',
        resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    }
})

export default viteConfig
```

`types/global.d.ts`:

```typescript
import 'react'

declare module 'react' {
    interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
        jsx?: boolean
        global?: boolean
    }
}
```

`types/modules.d.ts`:

```typescript
declare module '*.module.css' {
    const classes: { [key: string]: string }
    export default classes
}
```

`eslint.config.mjs`:

```javascript
import config from '@dhis2/config-eslint'
import { defineConfig } from 'eslint/config'
import { includeIgnoreFile } from '@eslint/compat'
import { fileURLToPath } from 'node:url'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
    includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
    {
        extends: [config],
    },
])
```

`.prettierrc.mjs`:

```javascript
import prettierConfig from '@dhis2/config-prettier'

/** @type {import("prettier").Config} */
const config = {
    ...prettierConfig,
}

export default config
```

`jest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// @dhis2/ui components expose `data-test`, not `data-testid`
configure({ testIdAttribute: 'data-test' })
```

`.gitignore` (replace the file):

```
# DHIS2 Platform
node_modules
.d2
src/locales
build

# Editors / OS
.history
.tmp
.vscode
.DS_Store

# Agent scratch
.superpowers
```

- [ ] **Step 4: Write the test utilities**

`src/test-utils/MockAlertStack.tsx`:

```tsx
import { useAlerts } from '@dhis2/app-runtime'
import React from 'react'

// Renders alerts raised with useAlert() so tests can assert on their text.
export const MockAlertStack = () => {
    const alerts = useAlerts()
    return (
        <div data-test="mock-alert-stack">
            {alerts.map((alert) => (
                <div key={alert.id}>{alert.message}</div>
            ))}
        </div>
    )
}
```

`src/test-utils/renderWithProvider.tsx`:

```tsx
import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import { render } from '@testing-library/react'
import React from 'react'
import { MockAlertStack } from './MockAlertStack'

type CustomData = React.ComponentProps<typeof CustomDataProvider>['data']

export type ProviderConfig = {
    baseUrl: string
    apiVersion: number
    serverVersion?: { major: number; minor: number; patch?: number; full: string }
}

export const defaultConfig: ProviderConfig = {
    baseUrl: 'http://localhost:8080',
    apiVersion: 43,
    serverVersion: { major: 2, minor: 43, patch: 0, full: '2.43.0' },
}

export const renderWithProvider = (
    ui: React.ReactElement,
    data: CustomData = {},
    config: ProviderConfig = defaultConfig
) =>
    render(
        <Provider
            config={config}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider data={data} options={{ failOnMiss: true }}>
                {ui}
                <MockAlertStack />
            </CustomDataProvider>
        </Provider>
    )
```

If `Provider`'s prop types reject `plugin` / `parentAlertsAdd` / `showAlertsInPlugin`, read `node_modules/@dhis2/app-runtime/build/types/Provider.d.ts` and pass exactly the props it declares; the three props above match app-runtime 3.17.

- [ ] **Step 5: Write a placeholder `App.tsx` and its smoke test**

`src/App.tsx`:

```tsx
import i18n from '@dhis2/d2-i18n'
import React from 'react'
import classes from './App.module.css'

const App = () => (
    <div className={classes.container}>
        <h1>{i18n.t('Data Dimension Disabler')}</h1>
    </div>
)

export default App
```

`src/App.module.css`:

```css
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--spacers-dp16);
    font-size: 14px;
    color: var(--colors-grey900);
}

.container h1 {
    font-size: 20px;
    margin: 0 0 var(--spacers-dp16) 0;
}
```

`src/App.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import React from 'react'
import App from './App'
import { renderWithProvider } from './test-utils/renderWithProvider'

it('renders the app title', () => {
    renderWithProvider(<App />)
    expect(screen.getByText('Data Dimension Disabler')).toBeInTheDocument()
})
```

- [ ] **Step 6: Install and run the toolchain**

```bash
yarn install
yarn lint
yarn test
yarn build
ls build/bundle
```

Expected: lint clean, 1 test passing, a `data-dimension-disabler-1.0.0.zip` in `build/bundle`. If `yarn lint` reports prettier differences in the files above, run `yarn format` and re-run. If `tsc` complains about `@dhis2/ui` or `@dhis2/app-runtime` types, keep `skipLibCheck: true` and fix only our files.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Migrate project skeleton to the DHIS2 App Platform (TypeScript)

Replaces the webpack build, the hand-rolled fetch layer, jQuery/DataTables
and the conditional legacy header bar with @dhis2/cli-app-scripts 12,
@dhis2/app-runtime and @dhis2/ui. The app is renamed data-dimension-disabler
because it will cover group sets as well as categories.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Dimension type map

**Files:**
- Create: `src/dimensionTypes.ts`, `src/dimensionTypes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type DimensionTypeKey = 'CATEGORY' | 'ORGUNIT_GROUP_SET' | 'DATAELEMENT_GROUP_SET' | 'CATEGORYOPTION_GROUP_SET'
  type DimensionType = { key; getLabel(): string; endpoint: string; table(minor: number): string; primaryKey: string; dimensionTable: string; dimensionPrimaryKey: string; dimensionForeignKey: string; joinTableSuffix: string }
  const DIMENSION_TYPES: readonly DimensionType[]          // stable order: CATEGORY, ORGUNIT_GROUP_SET, DATAELEMENT_GROUP_SET, CATEGORYOPTION_GROUP_SET
  const DIMENSION_TYPE_KEYS: readonly DimensionTypeKey[]
  const getDimensionType(key: DimensionTypeKey): DimensionType
  const isDimensionTypeKey(value: unknown): value is DimensionTypeKey
  ```
- Use the names verified in `docs/schema-check.md` (Task 1). The values below are the expected ones.

- [ ] **Step 1: Write the failing test**

`src/dimensionTypes.test.ts`:

```ts
import {
    DIMENSION_TYPES,
    DIMENSION_TYPE_KEYS,
    getDimensionType,
    isDimensionTypeKey,
} from './dimensionTypes'

describe('dimensionTypes', () => {
    it('defines exactly the four dimension types in a stable order', () => {
        expect(DIMENSION_TYPE_KEYS).toEqual([
            'CATEGORY',
            'ORGUNIT_GROUP_SET',
            'DATAELEMENT_GROUP_SET',
            'CATEGORYOPTION_GROUP_SET',
        ])
        expect(DIMENSION_TYPES.map((t) => t.key)).toEqual(DIMENSION_TYPE_KEYS)
    })

    it('maps each type to its metadata API endpoint', () => {
        expect(getDimensionType('CATEGORY').endpoint).toBe('categories')
        expect(getDimensionType('ORGUNIT_GROUP_SET').endpoint).toBe(
            'organisationUnitGroupSets'
        )
        expect(getDimensionType('DATAELEMENT_GROUP_SET').endpoint).toBe(
            'dataElementGroupSets'
        )
        expect(getDimensionType('CATEGORYOPTION_GROUP_SET').endpoint).toBe(
            'categoryOptionGroupSets'
        )
    })

    it('uses the renamed category table from 2.41 on', () => {
        const category = getDimensionType('CATEGORY')
        expect(category.table(40)).toBe('dataelementcategory')
        expect(category.table(41)).toBe('category')
        expect(category.table(43)).toBe('category')
    })

    it('has SQL names for every type', () => {
        for (const type of DIMENSION_TYPES) {
            expect(type.table(43)).toMatch(/^[a-z]+$/)
            expect(type.primaryKey).toMatch(/id$/)
            expect(type.dimensionTable).toMatch(/dimension$/)
            expect(type.dimensionPrimaryKey).toBe(`${type.dimensionTable}id`)
            expect(type.joinTableSuffix).toBe(`${type.dimensionTable}s`)
            expect(type.getLabel()).not.toHaveLength(0)
        }
    })

    it('recognises valid keys', () => {
        expect(isDimensionTypeKey('CATEGORY')).toBe(true)
        expect(isDimensionTypeKey('PROGRAM')).toBe(false)
        expect(isDimensionTypeKey(undefined)).toBe(false)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test dimensionTypes`
Expected: FAIL, cannot find module `./dimensionTypes`.

- [ ] **Step 3: Write the implementation**

`src/dimensionTypes.ts`:

```ts
import i18n from '@dhis2/d2-i18n'

export type DimensionTypeKey =
    | 'CATEGORY'
    | 'ORGUNIT_GROUP_SET'
    | 'DATAELEMENT_GROUP_SET'
    | 'CATEGORYOPTION_GROUP_SET'

export type DimensionType = {
    key: DimensionTypeKey
    /** Human label; a function because i18n is not initialised at import time */
    getLabel: () => string
    /** Metadata API collection, e.g. `categories` -> PATCH /api/categories/{id} */
    endpoint: string
    /** Entity table holding uid, name, datadimension. Depends on the server minor version. */
    table: (minor: number) => string
    /** Primary key column of the entity table */
    primaryKey: string
    /** Dimension table that favorites reference, e.g. categorydimension */
    dimensionTable: string
    /** Primary key of the dimension table */
    dimensionPrimaryKey: string
    /** Column in the dimension table pointing back at the entity */
    dimensionForeignKey: string
    /** Suffix of the favorite join tables: visualization_<suffix>, mapview_<suffix>, eventvisualization_<suffix> */
    joinTableSuffix: string
}

// The category table was renamed from dataelementcategory to category in 2.41.
const categoryTable = (minor: number) =>
    minor < 41 ? 'dataelementcategory' : 'category'

export const DIMENSION_TYPES: readonly DimensionType[] = [
    {
        key: 'CATEGORY',
        getLabel: () => i18n.t('Category'),
        endpoint: 'categories',
        table: categoryTable,
        primaryKey: 'categoryid',
        dimensionTable: 'categorydimension',
        dimensionPrimaryKey: 'categorydimensionid',
        dimensionForeignKey: 'categoryid',
        joinTableSuffix: 'categorydimensions',
    },
    {
        key: 'ORGUNIT_GROUP_SET',
        getLabel: () => i18n.t('Organisation unit group set'),
        endpoint: 'organisationUnitGroupSets',
        table: () => 'orgunitgroupset',
        primaryKey: 'orgunitgroupsetid',
        dimensionTable: 'orgunitgroupsetdimension',
        dimensionPrimaryKey: 'orgunitgroupsetdimensionid',
        dimensionForeignKey: 'orgunitgroupsetid',
        joinTableSuffix: 'orgunitgroupsetdimensions',
    },
    {
        key: 'DATAELEMENT_GROUP_SET',
        getLabel: () => i18n.t('Data element group set'),
        endpoint: 'dataElementGroupSets',
        table: () => 'dataelementgroupset',
        primaryKey: 'dataelementgroupsetid',
        dimensionTable: 'dataelementgroupsetdimension',
        dimensionPrimaryKey: 'dataelementgroupsetdimensionid',
        dimensionForeignKey: 'dataelementgroupsetid',
        joinTableSuffix: 'dataelementgroupsetdimensions',
    },
    {
        key: 'CATEGORYOPTION_GROUP_SET',
        getLabel: () => i18n.t('Category option group set'),
        endpoint: 'categoryOptionGroupSets',
        table: () => 'categoryoptiongroupset',
        primaryKey: 'categoryoptiongroupsetid',
        dimensionTable: 'categoryoptiongroupsetdimension',
        dimensionPrimaryKey: 'categoryoptiongroupsetdimensionid',
        dimensionForeignKey: 'categoryoptiongroupsetid',
        joinTableSuffix: 'categoryoptiongroupsetdimensions',
    },
]

export const DIMENSION_TYPE_KEYS: readonly DimensionTypeKey[] =
    DIMENSION_TYPES.map((type) => type.key)

export const isDimensionTypeKey = (value: unknown): value is DimensionTypeKey =>
    typeof value === 'string' &&
    (DIMENSION_TYPE_KEYS as readonly string[]).includes(value)

export const getDimensionType = (key: DimensionTypeKey): DimensionType => {
    const type = DIMENSION_TYPES.find((candidate) => candidate.key === key)
    if (!type) {
        throw new Error(`Unknown dimension type ${key}`)
    }
    return type
}
```

Adjust any name that `docs/schema-check.md` reports differently.

- [ ] **Step 4: Run the tests**

Run: `yarn test dimensionTypes && yarn lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/dimensionTypes.ts src/dimensionTypes.test.ts
git commit -m "Add the dimension type map

One record per dimension kind (category and the three group set types)
holding the API endpoint and the SQL table and column names, so the SQL
builder and the UI never branch on type.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: SQL query builder

**Files:**
- Create: `src/sql/buildQuery.ts`, `src/sql/buildQuery.test.ts`

**Interfaces:**
- Consumes: `DIMENSION_TYPES`, `DimensionType` from `src/dimensionTypes.ts`.
- Produces: `buildQuery(minor: number): string`, `VIEW_EVENT_TYPES: readonly string[]`, `SQL_VIEW_COLUMNS = ['type','uid','name','views','percent','percent_of_views'] as const`.

- [ ] **Step 1: Write the failing test**

`src/sql/buildQuery.test.ts`:

```ts
import { DIMENSION_TYPE_KEYS } from '../dimensionTypes'
import { buildQuery, SQL_VIEW_COLUMNS, VIEW_EVENT_TYPES } from './buildQuery'

describe('buildQuery', () => {
    it('uses the pre-2.41 category table on 2.40 only', () => {
        expect(buildQuery(40)).toContain('FROM dataelementcategory z')
        expect(buildQuery(40)).not.toContain('FROM category z')
        for (const minor of [41, 42, 43]) {
            expect(buildQuery(minor)).toContain('FROM category z')
            expect(buildQuery(minor)).not.toContain('dataelementcategory')
        }
    })

    it('has one summary block per dimension type, tagged with its key', () => {
        const sql = buildQuery(43)
        for (const key of DIMENSION_TYPE_KEYS) {
            expect(sql).toContain(`SELECT '${key}' AS type`)
        }
        expect(sql.match(/UNION ALL/g)).toHaveLength(DIMENSION_TYPE_KEYS.length - 1)
    })

    it('joins all three favorite kinds for categories and org unit / category option group sets', () => {
        const sql = buildQuery(43)
        expect(sql).toContain('FROM visualization_categorydimensions a')
        expect(sql).toContain('FROM mapview_categorydimensions a')
        expect(sql).toContain('FROM eventvisualization_categorydimensions a')
        expect(sql).toContain('FROM visualization_orgunitgroupsetdimensions a')
        expect(sql).toContain('FROM mapview_orgunitgroupsetdimensions a')
        expect(sql).toContain('FROM eventvisualization_orgunitgroupsetdimensions a')
        expect(sql).toContain('FROM visualization_categoryoptiongroupsetdimensions a')
        expect(sql).toContain('FROM mapview_categoryoptiongroupsetdimensions a')
        expect(sql).toContain(
            'FROM eventvisualization_categoryoptiongroupsetdimensions a'
        )
    })

    it('joins data element group sets to visualizations only (no map view / event visualization join tables exist)', () => {
        for (const minor of [40, 43]) {
            const sql = buildQuery(minor)
            expect(sql).toContain('FROM visualization_dataelementgroupsetdimensions a')
            expect(sql).not.toContain('mapview_dataelementgroupsetdimensions')
            expect(sql).not.toContain('eventvisualization_dataelementgroupsetdimensions')
        }
    })

    it('counts map views against the map uid, not the map view uid', () => {
        const sql = buildQuery(43)
        expect(sql).toContain('JOIN mapmapviews mm ON mm.mapviewid = a.mapviewid')
        expect(sql).toContain('JOIN map f ON f.mapid = mm.mapid')
    })

    it('only counts enabled dimensions and events from the last 12 months', () => {
        const sql = buildQuery(43)
        expect(sql.match(/WHERE z\.datadimension = TRUE/g)).toHaveLength(
            DIMENSION_TYPE_KEYS.length
        )
        expect(sql).toContain("AGE(NOW(), timestamp) < '12 month'::interval")
        for (const eventType of VIEW_EVENT_TYPES) {
            expect(sql).toContain(`'${eventType}'`)
        }
    })

    it('selects the documented output columns in order', () => {
        const sql = buildQuery(43)
        const selectLine = sql.slice(sql.lastIndexOf('SELECT s.type'))
        expect(SQL_VIEW_COLUMNS).toEqual([
            'type',
            'uid',
            'name',
            'views',
            'percent',
            'percent_of_views',
        ])
        expect(selectLine).toMatch(
            /SELECT s\.type, s\.uid, s\.name, s\.views,[\s\S]*AS percent,[\s\S]*AS percent_of_views/
        )
    })

    it('contains no statement terminator (DHIS2 rejects it)', () => {
        expect(buildQuery(43)).not.toContain(';')
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test buildQuery`
Expected: FAIL, cannot find module `./buildQuery`.

- [ ] **Step 3: Write the implementation**

`src/sql/buildQuery.ts`:

```ts
import { DIMENSION_TYPES, DimensionType } from '../dimensionTypes'

export const SQL_VIEW_COLUMNS = [
    'type',
    'uid',
    'name',
    'views',
    'percent',
    'percent_of_views',
] as const

/**
 * datastatisticsevent.eventtype values that mean "a favorite was opened".
 * Applied to both the per-favorite counts and the grand total so the two
 * percentages share one denominator definition.
 */
export const VIEW_EVENT_TYPES: readonly string[] = [
    'VISUALIZATION_VIEW',
    'MAP_VIEW',
    'EVENT_VISUALIZATION_VIEW',
    'EVENT_CHART_VIEW',
    'EVENT_REPORT_VIEW',
]

type FavoriteSource = {
    /** Prefix of the dimension join table: <prefix>_<joinTableSuffix> */
    prefix: 'visualization' | 'mapview' | 'eventvisualization'
    /**
     * SQL joining from the join-table alias `a` to the favorite whose uid
     * datastatisticsevent records, exposed as alias `f` with a `uid` column.
     */
    favoriteJoin: string
}

const FAVORITE_SOURCES: readonly FavoriteSource[] = [
    {
        prefix: 'visualization',
        favoriteJoin:
            'JOIN visualization f ON f.visualizationid = a.visualizationid',
    },
    {
        // A map view is one layer of a map; view events are recorded against
        // the map's uid, so go through mapmapviews to reach it.
        prefix: 'mapview',
        favoriteJoin:
            'JOIN mapmapviews mm ON mm.mapviewid = a.mapviewid\n        JOIN map f ON f.mapid = mm.mapid',
    },
    {
        prefix: 'eventvisualization',
        favoriteJoin:
            'JOIN eventvisualization f ON f.eventvisualizationid = a.eventvisualizationid',
    },
]

/**
 * Favorite sources that have a join table for a given type. Verified on
 * 2.40 and 2.43 (docs/schema-check.md): every type has all three, except
 * data element group sets, which only visualizations can carry — there is
 * no mapview_ or eventvisualization_dataelementgroupsetdimensions table on
 * any supported version. The minor version is accepted for symmetry with
 * the table-name lookup but no source is version-gated today.
 */
const favoriteSourcesFor = (
    type: DimensionType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    minor: number
): readonly FavoriteSource[] =>
    type.key === 'DATAELEMENT_GROUP_SET'
        ? FAVORITE_SOURCES.filter((source) => source.prefix === 'visualization')
        : FAVORITE_SOURCES

/** (entity id, favorite uid) pairs for every favorite that uses the dimension */
const usageSubquery = (type: DimensionType, minor: number): string =>
    favoriteSourcesFor(type, minor)
        .map(
            ({ prefix, favoriteJoin }) => `      SELECT DISTINCT d.${type.dimensionForeignKey} AS objectid, f.uid AS favoriteuid
        FROM ${prefix}_${type.joinTableSuffix} a
        JOIN ${type.dimensionTable} d ON d.${type.dimensionPrimaryKey} = a.${type.dimensionPrimaryKey}
        ${favoriteJoin}`
        )
        .join('\n      UNION\n')

const summaryBlock = (type: DimensionType, minor: number): string =>
    `  SELECT '${type.key}' AS type, z.uid, z.name, COALESCE(SUM(fv.views), 0) AS views
  FROM ${type.table(minor)} z
  LEFT JOIN (
${usageSubquery(type, minor)}
  ) y ON y.objectid = z.${type.primaryKey}
  LEFT JOIN favorite_views fv ON fv.favoriteuid = y.favoriteuid
  WHERE z.datadimension = TRUE
  GROUP BY z.uid, z.name`

const quotedList = (values: readonly string[]) =>
    values.map((value) => `'${value}'`).join(', ')

export const buildQuery = (minor: number): string => `WITH favorite_views AS (
  SELECT favoriteuid, COUNT(*) AS views
  FROM datastatisticsevent
  WHERE AGE(NOW(), timestamp) < '12 month'::interval
    AND eventtype IN (${quotedList(VIEW_EVENT_TYPES)})
  GROUP BY favoriteuid
),
total_favorite_views AS (
  SELECT COALESCE(SUM(views), 0) AS count FROM favorite_views
),
summary AS (
${DIMENSION_TYPES.map((type) => summaryBlock(type, minor)).join('\n  UNION ALL\n')}
),
totals AS (
  SELECT SUM(views) AS total FROM summary
)
SELECT s.type, s.uid, s.name, s.views,
  COALESCE(s.views::double precision / NULLIF(t.total, 0) * 100.0, 0) AS percent,
  COALESCE(s.views::double precision / NULLIF(f.count, 0) * 100.0, 0) AS percent_of_views
FROM summary s
CROSS JOIN totals t
CROSS JOIN total_favorite_views f
ORDER BY s.views DESC, s.name`
```

The two schema facts above (`mapmapviews`, and data element group sets only on visualizations) come from `docs/schema-check.md` (Task 1) and hold on every supported version. Cross-check the rest of the generated SQL against that document's raw output before moving on.

- [ ] **Step 4: Run the tests**

Run: `yarn test buildQuery && yarn lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Run the generated SQL against both live databases**

Write the two SQL variants to disk through a throwaway Jest test (so TypeScript is transpiled for you), then run them with psql:

```bash
cat > src/sql/printQuery.tmp.test.ts <<'EOF'
import { writeFileSync } from 'fs'
import { buildQuery } from './buildQuery'
it('prints', () => {
    writeFileSync('/tmp/query40.sql', buildQuery(40))
    writeFileSync('/tmp/query43.sql', buildQuery(43))
})
EOF
yarn test printQuery
rm src/sql/printQuery.tmp.test.ts
PGPASSWORD=dhis psql -h dhis2-agent-cdd-sl40-db -U dhis -d dhis2 -f /tmp/query40.sql | head -20
PGPASSWORD=dhis psql -h dhis2-agent-cdd-sl43-db -U dhis -d dhis2 -f /tmp/query43.sql | head -20
```

Expected: both queries run without error and return one row per enabled dimension with `type` in the four keys. Seeds have few or no `datastatisticsevent` rows, so `views` may be all 0; that is fine here. If PostgreSQL reports an unknown column or table, fix `dimensionTypes.ts` / `buildQuery.ts`, update the tests, and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/sql/buildQuery.ts src/sql/buildQuery.test.ts
git commit -m "Generate the usage SQL view query from the dimension type map

One CTE for favorite views in the last 12 months, one UNION ALL block per
dimension type, and percentages over all dimension views and over all
favorite views. Map views are joined through map_mapviews to the map uid,
which is what datastatisticsevent records; the previous view joined the
map view uid and never counted maps.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: SQL view definition and outdated check

**Files:**
- Create: `src/sql/sqlView.ts`, `src/sql/sqlView.test.ts`

**Interfaces:**
- Consumes: `buildQuery(minor)` from Task 4.
- Produces:
  ```ts
  const SQL_VIEW_ID = 'GOLswS44mh8'
  const SQL_VIEW_NAME = 'Data dimension usage'
  type SqlViewDefinition = { id: string; name: string; description: string; type: 'QUERY'; cacheStrategy: 'NO_CACHE'; sharing: { public: string }; sqlQuery: string }
  const buildSqlViewDefinition(minor: number): SqlViewDefinition
  const normaliseSql(sql: string): string
  const isCurrentSqlQuery(installedSqlQuery: string | undefined, minor: number): boolean
  ```

- [ ] **Step 1: Write the failing test**

`src/sql/sqlView.test.ts`:

```ts
import { buildQuery } from './buildQuery'
import {
    buildSqlViewDefinition,
    isCurrentSqlQuery,
    normaliseSql,
    SQL_VIEW_ID,
    SQL_VIEW_NAME,
} from './sqlView'

describe('sqlView', () => {
    it('keeps the UID of the original category-only view so installs upgrade in place', () => {
        expect(SQL_VIEW_ID).toBe('GOLswS44mh8')
    })

    it('builds a complete QUERY view definition with public read sharing', () => {
        const definition = buildSqlViewDefinition(43)
        expect(definition).toMatchObject({
            id: SQL_VIEW_ID,
            name: SQL_VIEW_NAME,
            type: 'QUERY',
            cacheStrategy: 'NO_CACHE',
            sharing: { public: 'r-------' },
        })
        expect(definition.sqlQuery).toBe(buildQuery(43))
        expect(definition.description).toContain('Data Dimension Disabler')
    })

    it('normalises whitespace before comparing', () => {
        expect(normaliseSql('  SELECT  1\n\n FROM   x ')).toBe('SELECT 1 FROM x')
    })

    it('treats the exact or whitespace-different query as current', () => {
        expect(isCurrentSqlQuery(buildQuery(42), 42)).toBe(true)
        expect(isCurrentSqlQuery(buildQuery(42).replace(/\n/g, '   \n'), 42)).toBe(
            true
        )
    })

    it('treats another version, a legacy query or nothing as outdated', () => {
        expect(isCurrentSqlQuery(buildQuery(40), 41)).toBe(false)
        expect(isCurrentSqlQuery('SELECT z.uid FROM category z', 43)).toBe(false)
        expect(isCurrentSqlQuery(undefined, 43)).toBe(false)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test sqlView`
Expected: FAIL, cannot find module `./sqlView`.

- [ ] **Step 3: Write the implementation**

`src/sql/sqlView.ts`:

```ts
import { buildQuery } from './buildQuery'

/** Same UID as the original "Category dimension usage" view, so an old install is updated, not duplicated. */
export const SQL_VIEW_ID = 'GOLswS44mh8'
export const SQL_VIEW_NAME = 'Data dimension usage'

export type SqlViewDefinition = {
    id: string
    name: string
    description: string
    type: 'QUERY'
    cacheStrategy: 'NO_CACHE'
    sharing: { public: string }
    sqlQuery: string
}

export const buildSqlViewDefinition = (minor: number): SqlViewDefinition => ({
    id: SQL_VIEW_ID,
    name: SQL_VIEW_NAME,
    description:
        'Installed by the Data Dimension Disabler app. Ranks categories and group sets that are enabled as data dimensions by favorite views in the last 12 months. Safe to delete; the app recreates it on demand.',
    type: 'QUERY',
    cacheStrategy: 'NO_CACHE',
    sharing: { public: 'r-------' },
    sqlQuery: buildQuery(minor),
})

export const normaliseSql = (sql: string): string =>
    sql.replace(/\s+/g, ' ').trim()

/** True when the installed view's query matches what this app version would generate for this server. */
export const isCurrentSqlQuery = (
    installedSqlQuery: string | undefined,
    minor: number
): boolean =>
    installedSqlQuery !== undefined &&
    normaliseSql(installedSqlQuery) === normaliseSql(buildQuery(minor))
```

- [ ] **Step 4: Run the tests**

Run: `yarn test sqlView && yarn lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/sql/sqlView.ts src/sql/sqlView.test.ts
git commit -m "Define the SQL view and the outdated-query check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: SQL view status hook

**Files:**
- Create: `src/hooks/useSqlViewStatus.ts`, `src/hooks/useSqlViewStatus.test.tsx`

**Interfaces:**
- Consumes: `SQL_VIEW_ID`, `isCurrentSqlQuery` (Task 5); `renderWithProvider` (Task 2).
- Produces:
  ```ts
  type SqlViewStatus = 'LOADING' | 'MISSING' | 'OUTDATED' | 'READY' | 'ERROR'
  classifyStatus(input: { loading: boolean; error?: FetchError; sqlQuery?: string; minor: number }): SqlViewStatus
  useSqlViewStatus(): { status: SqlViewStatus; error?: FetchError; refetch: () => void; minor: number }
  ```

- [ ] **Step 1: Write the failing tests**

`src/hooks/useSqlViewStatus.test.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import { screen, waitFor } from '@testing-library/react'
import React from 'react'
import { buildQuery } from '../sql/buildQuery'
import { SQL_VIEW_ID } from '../sql/sqlView'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { classifyStatus, useSqlViewStatus } from './useSqlViewStatus'

const notFound = () =>
    new FetchError({
        type: 'unknown',
        message: 'not found',
        details: { httpStatusCode: 404, httpStatus: 'Not Found' },
    })

describe('classifyStatus', () => {
    it('is LOADING while the request is in flight', () => {
        expect(classifyStatus({ loading: true, minor: 43 })).toBe('LOADING')
    })
    it('is MISSING on a 404', () => {
        expect(classifyStatus({ loading: false, error: notFound(), minor: 43 })).toBe(
            'MISSING'
        )
    })
    it('is ERROR on any other error', () => {
        const forbidden = new FetchError({
            type: 'access',
            message: 'forbidden',
            details: { httpStatusCode: 403 },
        })
        expect(classifyStatus({ loading: false, error: forbidden, minor: 43 })).toBe(
            'ERROR'
        )
    })
    it('is READY when the installed query matches this server version', () => {
        expect(
            classifyStatus({ loading: false, sqlQuery: buildQuery(41), minor: 41 })
        ).toBe('READY')
    })
    it('is OUTDATED when the installed query differs', () => {
        expect(
            classifyStatus({ loading: false, sqlQuery: 'SELECT 1', minor: 41 })
        ).toBe('OUTDATED')
        expect(
            classifyStatus({ loading: false, sqlQuery: buildQuery(40), minor: 41 })
        ).toBe('OUTDATED')
    })
})

const Probe = () => {
    const { status, minor } = useSqlViewStatus()
    return (
        <span>
            {status}:{minor}
        </span>
    )
}

describe('useSqlViewStatus', () => {
    it('fetches the view by id and reports READY for a current query', async () => {
        const sqlViews = jest.fn(() => ({
            id: SQL_VIEW_ID,
            sqlQuery: buildQuery(43),
        }))
        renderWithProvider(<Probe />, { sqlViews })
        await waitFor(() =>
            expect(screen.getByText('READY:43')).toBeInTheDocument()
        )
        expect(sqlViews).toHaveBeenCalledWith(
            'read',
            expect.objectContaining({
                resource: 'sqlViews',
                id: SQL_VIEW_ID,
                params: { fields: 'id,sqlQuery' },
            }),
            expect.anything()
        )
    })

    it('reports MISSING on 404', async () => {
        renderWithProvider(<Probe />, {
            sqlViews: () => {
                throw notFound()
            },
        })
        await waitFor(() =>
            expect(screen.getByText('MISSING:43')).toBeInTheDocument()
        )
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test useSqlViewStatus`
Expected: FAIL, cannot find module `./useSqlViewStatus`.

- [ ] **Step 3: Write the implementation**

`src/hooks/useSqlViewStatus.ts`:

```ts
import { FetchError, useConfig, useDataQuery } from '@dhis2/app-runtime'
import { isCurrentSqlQuery, SQL_VIEW_ID } from '../sql/sqlView'

export type SqlViewStatus = 'LOADING' | 'MISSING' | 'OUTDATED' | 'READY' | 'ERROR'

type QueryResult = {
    sqlView: { id: string; sqlQuery?: string }
}

const query = {
    sqlView: {
        resource: 'sqlViews',
        id: SQL_VIEW_ID,
        params: { fields: 'id,sqlQuery' },
    },
}

const isNotFound = (error: FetchError): boolean =>
    error.details?.httpStatusCode === 404

export const classifyStatus = ({
    loading,
    error,
    sqlQuery,
    minor,
}: {
    loading: boolean
    error?: FetchError
    sqlQuery?: string
    minor: number
}): SqlViewStatus => {
    if (loading) {
        return 'LOADING'
    }
    if (error) {
        return isNotFound(error) ? 'MISSING' : 'ERROR'
    }
    return isCurrentSqlQuery(sqlQuery, minor) ? 'READY' : 'OUTDATED'
}

export const useSqlViewStatus = () => {
    const { serverVersion } = useConfig()
    const minor = serverVersion?.minor ?? 0
    const { loading, error, data, refetch } = useDataQuery<QueryResult>(query)

    return {
        status: classifyStatus({
            loading,
            error,
            sqlQuery: data?.sqlView?.sqlQuery,
            minor,
        }),
        error,
        refetch,
        minor,
    }
}
```

If TypeScript rejects `useDataQuery<QueryResult>`, check the generic in `node_modules/@dhis2/app-service-data/build/types/react/hooks/useDataQuery.d.ts` and match its parameter list.

- [ ] **Step 4: Run the tests**

Run: `yarn test useSqlViewStatus && yarn lint`
Expected: PASS, lint clean. If the `CustomDataProvider` call signature in the first hook test does not match (`toHaveBeenCalledWith`), read `node_modules/@dhis2/app-service-data/build/es/react/components/CustomDataProvider.js` and `.../links/CustomDataLink.js` for the exact arguments passed to a resource function, then fix the assertion, not the hook.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSqlViewStatus.ts src/hooks/useSqlViewStatus.test.tsx
git commit -m "Add the SQL view status hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Usage data hook and row parsing

**Files:**
- Create: `src/hooks/useUsageData.ts`, `src/hooks/useUsageData.test.tsx`

**Interfaces:**
- Consumes: `SQL_VIEW_ID`, `SQL_VIEW_COLUMNS`, `isDimensionTypeKey`, `DimensionTypeKey`.
- Produces:
  ```ts
  type UsageRow = { type: DimensionTypeKey; uid: string; name: string; views: number; percent: number; percentOfViews: number }
  type ListGrid = { headers: { name: string }[]; rows: (string | number | null)[][] }
  parseUsageRows(grid: ListGrid | undefined): UsageRow[]
  useUsageData(): { rows: UsageRow[]; loading: boolean; error?: FetchError; refetch: () => void }
  ```

- [ ] **Step 1: Write the failing tests**

`src/hooks/useUsageData.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import React from 'react'
import { SQL_VIEW_ID } from '../sql/sqlView'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { parseUsageRows, useUsageData } from './useUsageData'

const grid = {
    headers: [
        { name: 'type' },
        { name: 'uid' },
        { name: 'name' },
        { name: 'views' },
        { name: 'percent' },
        { name: 'percent_of_views' },
    ],
    rows: [
        ['CATEGORY', 'cX5k9anHEHd', 'Gender', 12, 60.0, 30.0],
        ['ORGUNIT_GROUP_SET', 'J5jldMd8OHv', 'Facility Type', '8', '40', '20'],
    ],
}

describe('parseUsageRows', () => {
    it('maps columns by header name and coerces numbers', () => {
        expect(parseUsageRows(grid)).toEqual([
            {
                type: 'CATEGORY',
                uid: 'cX5k9anHEHd',
                name: 'Gender',
                views: 12,
                percent: 60,
                percentOfViews: 30,
            },
            {
                type: 'ORGUNIT_GROUP_SET',
                uid: 'J5jldMd8OHv',
                name: 'Facility Type',
                views: 8,
                percent: 40,
                percentOfViews: 20,
            },
        ])
    })

    it('tolerates a different column order', () => {
        const shuffled = {
            headers: [...grid.headers].reverse(),
            rows: grid.rows.map((row) => [...row].reverse()),
        }
        expect(parseUsageRows(shuffled)).toEqual(parseUsageRows(grid))
    })

    it('drops rows with an unknown type and returns [] for no grid', () => {
        const withJunk = {
            ...grid,
            rows: [...grid.rows, ['PROGRAM', 'x', 'y', 1, 1, 1]],
        }
        expect(parseUsageRows(withJunk)).toHaveLength(2)
        expect(parseUsageRows(undefined)).toEqual([])
        expect(parseUsageRows({ headers: grid.headers, rows: [] })).toEqual([])
    })
})

const Probe = () => {
    const { rows, loading } = useUsageData()
    if (loading) {
        return <span>loading</span>
    }
    return <span>{rows.map((row) => row.name).join(',')}</span>
}

describe('useUsageData', () => {
    it('fetches all rows of the view without paging', async () => {
        const resource = `sqlViews/${SQL_VIEW_ID}/data`
        const handler = jest.fn(() => ({ listGrid: grid }))
        renderWithProvider(<Probe />, { [resource]: handler })
        await waitFor(() =>
            expect(screen.getByText('Gender,Facility Type')).toBeInTheDocument()
        )
        expect(handler).toHaveBeenCalledWith(
            'read',
            expect.objectContaining({
                resource,
                params: { paging: false },
            }),
            expect.anything()
        )
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test useUsageData`
Expected: FAIL, cannot find module `./useUsageData`.

- [ ] **Step 3: Write the implementation**

`src/hooks/useUsageData.ts`:

```ts
import { useDataQuery } from '@dhis2/app-runtime'
import { DimensionTypeKey, isDimensionTypeKey } from '../dimensionTypes'
import { SQL_VIEW_ID } from '../sql/sqlView'

export type UsageRow = {
    type: DimensionTypeKey
    uid: string
    name: string
    views: number
    percent: number
    percentOfViews: number
}

export type ListGrid = {
    headers: { name: string }[]
    rows: (string | number | null)[][]
}

type QueryResult = { usage: { listGrid?: ListGrid } }

const query = {
    usage: {
        resource: `sqlViews/${SQL_VIEW_ID}/data`,
        // The endpoint paginates by default (50 rows); we want the full ranking.
        params: { paging: false },
    },
}

const toNumber = (value: string | number | null | undefined): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

/** Map SQL view grid rows to typed rows, looking columns up by header name. */
export const parseUsageRows = (grid: ListGrid | undefined): UsageRow[] => {
    if (!grid) {
        return []
    }
    const index = new Map(grid.headers.map((header, i) => [header.name, i]))
    const column = (row: ListGrid['rows'][number], name: string) =>
        row[index.get(name) ?? -1]

    return grid.rows.flatMap((row) => {
        const type = column(row, 'type')
        if (!isDimensionTypeKey(type)) {
            return []
        }
        return [
            {
                type,
                uid: String(column(row, 'uid') ?? ''),
                name: String(column(row, 'name') ?? ''),
                views: toNumber(column(row, 'views')),
                percent: toNumber(column(row, 'percent')),
                percentOfViews: toNumber(column(row, 'percent_of_views')),
            },
        ]
    })
}

export const useUsageData = () => {
    const { loading, error, data, refetch } = useDataQuery<QueryResult>(query)
    return {
        rows: parseUsageRows(data?.usage?.listGrid),
        loading,
        error,
        refetch,
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `yarn test useUsageData && yarn lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUsageData.ts src/hooks/useUsageData.test.tsx
git commit -m "Add the usage data hook with header-based row parsing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Mutation hooks (create / update / remove view, disable dimension)

**Files:**
- Create: `src/hooks/useSqlViewMutations.ts`, `src/hooks/useSqlViewMutations.test.tsx`, `src/hooks/useDisableDimension.ts`, `src/hooks/useDisableDimension.test.tsx`

**Interfaces:**
- Consumes: `buildSqlViewDefinition`, `SQL_VIEW_ID` (Task 5); `getDimensionType` (Task 3); `UsageRow` (Task 7).
- Produces:
  ```ts
  type MutationState = { loading: boolean; error?: FetchError }
  useSqlViewMutations(minor: number): { create(): Promise<boolean>; update(): Promise<boolean>; remove(): Promise<boolean>; state: MutationState }
  useDisableDimension(): { disable(row: UsageRow): Promise<boolean>; state: MutationState }
  ```
  Each function resolves `true` on success and `false` on failure with `state.error` set; it never throws.

- [ ] **Step 1: Write the failing tests**

`src/hooks/useSqlViewMutations.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react'
import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import React from 'react'
import { buildSqlViewDefinition, SQL_VIEW_ID } from '../sql/sqlView'
import { defaultConfig } from '../test-utils/renderWithProvider'
import { useSqlViewMutations } from './useSqlViewMutations'

const wrapperWith =
    (sqlViews: jest.Mock) =>
    ({ children }: { children: React.ReactNode }) => (
        <Provider
            config={defaultConfig}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider data={{ sqlViews }} options={{ failOnMiss: true }}>
                {children}
            </CustomDataProvider>
        </Provider>
    )

describe('useSqlViewMutations', () => {
    it('creates the view with a POST of the full definition', async () => {
        const sqlViews = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useSqlViewMutations(43), {
            wrapper: wrapperWith(sqlViews),
        })
        let ok = false
        await act(async () => {
            ok = await result.current.create()
        })
        expect(ok).toBe(true)
        expect(sqlViews).toHaveBeenCalledWith(
            'create',
            expect.objectContaining({
                resource: 'sqlViews',
                data: buildSqlViewDefinition(43),
            }),
            expect.anything()
        )
        expect(result.current.state.error).toBeUndefined()
    })

    it('updates the view with a PUT (replace) by id', async () => {
        const sqlViews = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useSqlViewMutations(40), {
            wrapper: wrapperWith(sqlViews),
        })
        await act(async () => {
            await result.current.update()
        })
        expect(sqlViews).toHaveBeenCalledWith(
            'replace',
            expect.objectContaining({
                resource: 'sqlViews',
                id: SQL_VIEW_ID,
                data: buildSqlViewDefinition(40),
            }),
            expect.anything()
        )
    })

    it('removes the view with a DELETE by id', async () => {
        const sqlViews = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useSqlViewMutations(43), {
            wrapper: wrapperWith(sqlViews),
        })
        await act(async () => {
            await result.current.remove()
        })
        expect(sqlViews).toHaveBeenCalledWith(
            'delete',
            expect.objectContaining({ resource: 'sqlViews', id: SQL_VIEW_ID }),
            expect.anything()
        )
    })

    it('reports failures through state.error and resolves false', async () => {
        const sqlViews = jest.fn(() => {
            throw new Error('403 Forbidden')
        })
        const { result } = renderHook(() => useSqlViewMutations(43), {
            wrapper: wrapperWith(sqlViews),
        })
        let ok = true
        await act(async () => {
            ok = await result.current.create()
        })
        expect(ok).toBe(false)
        expect(result.current.state.error?.message).toContain('403')
        expect(result.current.state.loading).toBe(false)
    })
})
```

`src/hooks/useDisableDimension.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react'
import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import React from 'react'
import { defaultConfig } from '../test-utils/renderWithProvider'
import { UsageRow } from './useUsageData'
import { useDisableDimension } from './useDisableDimension'

const row: UsageRow = {
    type: 'ORGUNIT_GROUP_SET',
    uid: 'J5jldMd8OHv',
    name: 'Facility Type',
    views: 0,
    percent: 0,
    percentOfViews: 0,
}

const wrapperWith =
    (data: Record<string, jest.Mock>) =>
    ({ children }: { children: React.ReactNode }) => (
        <Provider
            config={defaultConfig}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider data={data} options={{ failOnMiss: true }}>
                {children}
            </CustomDataProvider>
        </Provider>
    )

describe('useDisableDimension', () => {
    it('sends a JSON Patch setting dataDimension=false to the endpoint of the row type', async () => {
        const organisationUnitGroupSets = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useDisableDimension(), {
            wrapper: wrapperWith({ organisationUnitGroupSets }),
        })
        let ok = false
        await act(async () => {
            ok = await result.current.disable(row)
        })
        expect(ok).toBe(true)
        expect(organisationUnitGroupSets).toHaveBeenCalledWith(
            'json-patch',
            expect.objectContaining({
                resource: 'organisationUnitGroupSets',
                id: 'J5jldMd8OHv',
                data: [{ op: 'add', path: '/dataDimension', value: false }],
            }),
            expect.anything()
        )
    })

    it('resolves false and exposes the error when the server rejects', async () => {
        const organisationUnitGroupSets = jest.fn(() => {
            throw new Error('409 Conflict')
        })
        const { result } = renderHook(() => useDisableDimension(), {
            wrapper: wrapperWith({ organisationUnitGroupSets }),
        })
        let ok = true
        await act(async () => {
            ok = await result.current.disable(row)
        })
        expect(ok).toBe(false)
        expect(result.current.state.error?.message).toContain('409')
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test useSqlViewMutations useDisableDimension`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Write a shared engine-call helper and the two hooks**

`src/hooks/useEngineMutation.ts`:

```ts
import { FetchError, useDataEngine } from '@dhis2/app-runtime'
import { useCallback, useState } from 'react'

export type MutationState = { loading: boolean; error?: FetchError }

/**
 * Minimal mutation runner on top of the data engine. useDataMutation needs a
 * static mutation object, but our resources vary per call (four endpoints,
 * three view operations), so we call engine.mutate directly and keep the
 * loading/error state ourselves.
 */
export const useEngineMutation = () => {
    const engine = useDataEngine()
    const [state, setState] = useState<MutationState>({ loading: false })

    const run = useCallback(
        async (mutation: Parameters<typeof engine.mutate>[0]): Promise<boolean> => {
            setState({ loading: true, error: undefined })
            try {
                await engine.mutate(mutation)
                setState({ loading: false })
                return true
            } catch (error) {
                setState({ loading: false, error: error as FetchError })
                return false
            }
        },
        [engine]
    )

    return { run, state }
}
```

`src/hooks/useSqlViewMutations.ts`:

```ts
import { useCallback } from 'react'
import { buildSqlViewDefinition, SQL_VIEW_ID } from '../sql/sqlView'
import { useEngineMutation } from './useEngineMutation'

export const useSqlViewMutations = (minor: number) => {
    const { run, state } = useEngineMutation()

    const create = useCallback(
        () =>
            run({
                resource: 'sqlViews',
                type: 'create',
                data: buildSqlViewDefinition(minor),
            }),
        [run, minor]
    )

    // 'replace' is PUT: the whole definition, including the new name and sharing.
    const update = useCallback(
        () =>
            run({
                resource: 'sqlViews',
                id: SQL_VIEW_ID,
                type: 'replace',
                data: buildSqlViewDefinition(minor),
            }),
        [run, minor]
    )

    const remove = useCallback(
        () => run({ resource: 'sqlViews', id: SQL_VIEW_ID, type: 'delete' }),
        [run]
    )

    return { create, update, remove, state }
}
```

`src/hooks/useDisableDimension.ts`:

```ts
import { useCallback } from 'react'
import { getDimensionType } from '../dimensionTypes'
import { useEngineMutation } from './useEngineMutation'
import type { UsageRow } from './useUsageData'

const DISABLE_PATCH = [{ op: 'add', path: '/dataDimension', value: false }]

export const useDisableDimension = () => {
    const { run, state } = useEngineMutation()

    const disable = useCallback(
        (row: UsageRow) =>
            run({
                resource: getDimensionType(row.type).endpoint,
                id: row.uid,
                type: 'json-patch',
                // The engine types `data` as an object; JSON Patch is an array.
                data: DISABLE_PATCH as unknown as Record<string, unknown>,
            }),
        [run]
    )

    return { disable, state }
}
```

If `tsc` rejects the mutation literals (the `type` field widening to `string`), add `as const` to the `type` values, e.g. `type: 'create' as const`.

- [ ] **Step 4: Run the tests**

Run: `yarn test useSqlViewMutations useDisableDimension && yarn lint`
Expected: PASS, lint clean. If `CustomDataProvider` passes a different first argument than the mutation type string for `replace` / `json-patch`, read `node_modules/@dhis2/app-service-data/build/es/links/CustomDataLink.js` and adjust the assertions to the real value; the hooks are correct if the engine receives `type: 'replace'` and `type: 'json-patch'`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEngineMutation.ts src/hooks/useSqlViewMutations.ts src/hooks/useSqlViewMutations.test.tsx src/hooks/useDisableDimension.ts src/hooks/useDisableDimension.test.tsx
git commit -m "Add mutation hooks for the SQL view and for disabling a dimension

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Table utilities, type filter and usage table

**Files:**
- Create: `src/components/usageTableUtils.ts`, `src/components/usageTableUtils.test.ts`, `src/components/TypeFilter.tsx`, `src/components/UsageTable.tsx`, `src/components/UsageTable.module.css`, `src/components/UsageTable.test.tsx`

**Interfaces:**
- Consumes: `UsageRow` (Task 7); `DIMENSION_TYPES`, `DimensionTypeKey`, `getDimensionType` (Task 3).
- Produces:
  ```ts
  type SortColumn = 'type' | 'name' | 'uid' | 'views' | 'percent' | 'percentOfViews'
  type SortDirection = 'asc' | 'desc'
  type TypeFilterValue = 'ALL' | DimensionTypeKey
  sortRows(rows: UsageRow[], column: SortColumn, direction: SortDirection): UsageRow[]
  filterRows(rows: UsageRow[], filter: TypeFilterValue): UsageRow[]
  formatPercent(value: number): string   // one decimal + '%'
  <TypeFilter value onChange />           // props: { value: TypeFilterValue; onChange: (value: TypeFilterValue) => void }
  <UsageTable rows onDisable />           // props: { rows: UsageRow[]; onDisable: (row: UsageRow) => void }
  ```
  `UsageTable` owns sort and filter state; default sort is views desc.

- [ ] **Step 1: Write the failing tests**

`src/components/usageTableUtils.test.ts`:

```ts
import { UsageRow } from '../hooks/useUsageData'
import { filterRows, formatPercent, sortRows } from './usageTableUtils'

const rows: UsageRow[] = [
    { type: 'CATEGORY', uid: 'a', name: 'Gender', views: 5, percent: 50, percentOfViews: 25 },
    { type: 'ORGUNIT_GROUP_SET', uid: 'b', name: 'Area', views: 10, percent: 40, percentOfViews: 20 },
    { type: 'CATEGORY', uid: 'c', name: 'age', views: 0, percent: 0, percentOfViews: 0 },
]

describe('sortRows', () => {
    it('sorts numerically', () => {
        expect(sortRows(rows, 'views', 'desc').map((r) => r.uid)).toEqual(['b', 'a', 'c'])
        expect(sortRows(rows, 'views', 'asc').map((r) => r.uid)).toEqual(['c', 'a', 'b'])
    })
    it('sorts names case-insensitively', () => {
        expect(sortRows(rows, 'name', 'asc').map((r) => r.name)).toEqual(['age', 'Area', 'Gender'])
    })
    it('sorts by type label order and does not mutate the input', () => {
        const copy = [...rows]
        sortRows(rows, 'type', 'asc')
        expect(rows).toEqual(copy)
    })
})

describe('filterRows', () => {
    it('returns everything for ALL and only the chosen type otherwise', () => {
        expect(filterRows(rows, 'ALL')).toHaveLength(3)
        expect(filterRows(rows, 'CATEGORY').map((r) => r.uid)).toEqual(['a', 'c'])
        expect(filterRows(rows, 'DATAELEMENT_GROUP_SET')).toEqual([])
    })
})

describe('formatPercent', () => {
    it('renders one decimal with a percent sign', () => {
        expect(formatPercent(33.333)).toBe('33.3%')
        expect(formatPercent(0)).toBe('0.0%')
        expect(formatPercent(100)).toBe('100.0%')
    })
})
```

`src/components/UsageTable.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { UsageRow } from '../hooks/useUsageData'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { UsageTable } from './UsageTable'

const rows: UsageRow[] = [
    { type: 'CATEGORY', uid: 'a', name: 'Gender', views: 5, percent: 50, percentOfViews: 25 },
    { type: 'ORGUNIT_GROUP_SET', uid: 'b', name: 'Facility Type', views: 10, percent: 40, percentOfViews: 20 },
    { type: 'CATEGORY', uid: 'c', name: 'Age', views: 0, percent: 0, percentOfViews: 0 },
]

const bodyRowNames = () =>
    within(screen.getByTestId('usage-table-body'))
        .getAllByTestId('usage-row')
        .map((row) => within(row).getByTestId('usage-row-name').textContent)

describe('UsageTable', () => {
    it('renders rows sorted by views descending by default with type labels and percentages', () => {
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        expect(bodyRowNames()).toEqual(['Facility Type', 'Gender', 'Age'])
        expect(screen.getByText('Organisation unit group set')).toBeInTheDocument()
        expect(screen.getByText('50.0%')).toBeInTheDocument()
    })

    it('filters by type', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        await user.click(within(screen.getByTestId('type-filter')).getByRole('button'))
        await user.click(screen.getByText('Category', { selector: '[data-test*="option"] *, [data-test*="option"]' }))
        expect(bodyRowNames()).toEqual(['Gender', 'Age'])
    })

    it('sorts by name when the header sort icon is clicked', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        const nameHeader = screen.getByTestId('usage-header-name')
        await user.click(within(nameHeader).getByRole('button'))
        expect(bodyRowNames()).toEqual(['Age', 'Facility Type', 'Gender'])
        await user.click(within(nameHeader).getByRole('button'))
        expect(bodyRowNames()).toEqual(['Gender', 'Facility Type', 'Age'])
    })

    it('calls onDisable with the row', async () => {
        const user = userEvent.setup()
        const onDisable = jest.fn()
        renderWithProvider(<UsageTable rows={rows} onDisable={onDisable} />)
        const genderRow = screen
            .getAllByTestId('usage-row')
            .find((row) => within(row).getByTestId('usage-row-name').textContent === 'Gender')
        await user.click(within(genderRow as HTMLElement).getByRole('button', { name: 'Disable' }))
        expect(onDisable).toHaveBeenCalledWith(rows[0])
    })

    it('shows an empty state', () => {
        renderWithProvider(<UsageTable rows={[]} onDisable={jest.fn()} />)
        expect(screen.getByText('No enabled data dimensions found')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test usageTableUtils UsageTable`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Write the utilities**

`src/components/usageTableUtils.ts`:

```ts
import { DIMENSION_TYPE_KEYS, DimensionTypeKey } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'

export type SortColumn = 'type' | 'name' | 'uid' | 'views' | 'percent' | 'percentOfViews'
export type SortDirection = 'asc' | 'desc'
export type TypeFilterValue = 'ALL' | DimensionTypeKey

const compareText = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })

const compare = (a: UsageRow, b: UsageRow, column: SortColumn): number => {
    switch (column) {
        case 'type':
            return DIMENSION_TYPE_KEYS.indexOf(a.type) - DIMENSION_TYPE_KEYS.indexOf(b.type)
        case 'name':
        case 'uid':
            return compareText(a[column], b[column])
        default:
            return a[column] - b[column]
    }
}

export const sortRows = (
    rows: UsageRow[],
    column: SortColumn,
    direction: SortDirection
): UsageRow[] => {
    const sign = direction === 'asc' ? 1 : -1
    return [...rows].sort(
        (a, b) => sign * compare(a, b, column) || compareText(a.name, b.name)
    )
}

export const filterRows = (rows: UsageRow[], filter: TypeFilterValue): UsageRow[] =>
    filter === 'ALL' ? rows : rows.filter((row) => row.type === filter)

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`
```

- [ ] **Step 4: Write the TypeFilter**

`src/components/TypeFilter.tsx`:

```tsx
import i18n from '@dhis2/d2-i18n'
import { SingleSelectField, SingleSelectOption } from '@dhis2/ui'
import React from 'react'
import { DIMENSION_TYPES } from '../dimensionTypes'
import { TypeFilterValue } from './usageTableUtils'

type Props = {
    value: TypeFilterValue
    onChange: (value: TypeFilterValue) => void
}

export const TypeFilter = ({ value, onChange }: Props) => (
    <SingleSelectField
        dataTest="type-filter"
        label={i18n.t('Dimension type')}
        selected={value}
        onChange={({ selected }) => onChange(selected as TypeFilterValue)}
        inputWidth="320px"
        dense
    >
        <SingleSelectOption value="ALL" label={i18n.t('All types')} />
        {DIMENSION_TYPES.map((type) => (
            <SingleSelectOption key={type.key} value={type.key} label={type.getLabel()} />
        ))}
    </SingleSelectField>
)
```

- [ ] **Step 5: Write the UsageTable**

`src/components/UsageTable.module.css`:

```css
.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--spacers-dp16);
    margin-block-end: var(--spacers-dp12);
}

.count {
    color: var(--colors-grey700);
    font-size: 13px;
}

.uid {
    font-family: monospace;
    color: var(--colors-grey700);
}

.number {
    font-variant-numeric: tabular-nums;
}
```

`src/components/UsageTable.tsx`:

```tsx
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
} from '@dhis2/ui'
import React, { useState } from 'react'
import { getDimensionType } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'
import { TypeFilter } from './TypeFilter'
import classes from './UsageTable.module.css'
import {
    filterRows,
    formatPercent,
    SortColumn,
    SortDirection,
    sortRows,
    TypeFilterValue,
} from './usageTableUtils'

type Props = {
    rows: UsageRow[]
    onDisable: (row: UsageRow) => void
}

// Mirrors @dhis2/ui's DataTableSortDirection, which is not re-exported as a type
type HeaderSortDirection = 'asc' | 'desc' | 'default'

type ColumnDef = { column: SortColumn; label: () => string; align?: 'left' | 'right' }

const COLUMNS: ColumnDef[] = [
    { column: 'type', label: () => i18n.t('Type') },
    { column: 'name', label: () => i18n.t('Name') },
    { column: 'uid', label: () => i18n.t('UID') },
    { column: 'views', label: () => i18n.t('Views (12 months)'), align: 'right' },
    { column: 'percent', label: () => i18n.t('% of dimension views'), align: 'right' },
    { column: 'percentOfViews', label: () => i18n.t('% of favorite views'), align: 'right' },
]

export const UsageTable = ({ rows, onDisable }: Props) => {
    const [filter, setFilter] = useState<TypeFilterValue>('ALL')
    const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
        column: 'views',
        direction: 'desc',
    })

    const visibleRows = sortRows(filterRows(rows, filter), sort.column, sort.direction)

    const sortDirectionFor = (column: SortColumn): HeaderSortDirection =>
        sort.column === column ? sort.direction : 'default'

    const toggleSort = (column: SortColumn) =>
        setSort((current) => ({
            column,
            direction:
                current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }))

    return (
        <div>
            <div className={classes.toolbar}>
                <TypeFilter value={filter} onChange={setFilter} />
                <span className={classes.count}>
                    {i18n.t('{{count}} enabled dimension', {
                        count: visibleRows.length,
                        defaultValue_plural: '{{count}} enabled dimensions',
                    })}
                </span>
            </div>
            <DataTable dataTest="usage-table">
                <DataTableHead>
                    <DataTableRow>
                        {COLUMNS.map(({ column, label, align }) => (
                            <DataTableColumnHeader
                                key={column}
                                dataTest={`usage-header-${column}`}
                                align={align}
                                name={column}
                                sortDirection={sortDirectionFor(column)}
                                sortIconTitle={i18n.t('Sort by {{column}}', { column: label() })}
                                onSortIconClick={() => toggleSort(column)}
                            >
                                {label()}
                            </DataTableColumnHeader>
                        ))}
                        <DataTableColumnHeader>{i18n.t('Action')}</DataTableColumnHeader>
                    </DataTableRow>
                </DataTableHead>
                <DataTableBody dataTest="usage-table-body">
                    {visibleRows.length === 0 && (
                        <DataTableRow>
                            <DataTableCell colSpan={String(COLUMNS.length + 1)} align="center">
                                {i18n.t('No enabled data dimensions found')}
                            </DataTableCell>
                        </DataTableRow>
                    )}
                    {visibleRows.map((row) => (
                        <DataTableRow key={`${row.type}-${row.uid}`} dataTest="usage-row">
                            <DataTableCell>{getDimensionType(row.type).getLabel()}</DataTableCell>
                            <DataTableCell dataTest="usage-row-name">{row.name}</DataTableCell>
                            <DataTableCell className={classes.uid}>{row.uid}</DataTableCell>
                            <DataTableCell align="right" className={classes.number}>
                                {row.views}
                            </DataTableCell>
                            <DataTableCell align="right" className={classes.number}>
                                {formatPercent(row.percent)}
                            </DataTableCell>
                            <DataTableCell align="right" className={classes.number}>
                                {formatPercent(row.percentOfViews)}
                            </DataTableCell>
                            <DataTableCell>
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

- [ ] **Step 6: Run the tests and fix selectors against the real DOM**

Run: `yarn test usageTableUtils UsageTable && yarn lint`

The `filters by type` test depends on how `SingleSelectField` renders its options in jsdom. If it fails on the option click, run the test with `screen.debug()` after opening the select, find the option element's `data-test` (it is `dhis2-uicore-singleselectoption`), and replace the second `user.click` with:

```tsx
await user.click(
    within(screen.getByTestId('dhis2-uicore-select-menu-menuwrapper')).getByText('Category')
)
```

Adjust the test, not the component. The sort-icon button inside `DataTableColumnHeader` renders as a `<button>`; if `getByRole('button')` finds none, use `within(nameHeader).getByTitle('Sort by Name')`.

Expected: all PASS, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/usageTableUtils.ts src/components/usageTableUtils.test.ts src/components/TypeFilter.tsx src/components/UsageTable.tsx src/components/UsageTable.module.css src/components/UsageTable.test.tsx
git commit -m "Add the sortable, filterable usage table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Confirmation dialogs

**Files:**
- Create: `src/components/DisableDialog.tsx`, `src/components/DisableDialog.test.tsx`, `src/components/RemoveViewDialog.tsx`, `src/components/RemoveViewDialog.test.tsx`, `src/components/ConfirmDialog.tsx`

**Interfaces:**
- Consumes: `UsageRow`, `getDimensionType`, `MutationState` (Task 8).
- Produces:
  ```tsx
  <ConfirmDialog title body confirmLabel destructive loading error onConfirm onCancel />
  <DisableDialog row loading error onConfirm onCancel />           // onConfirm: () => void
  <RemoveViewDialog loading error onConfirm onCancel />
  ```
  Dialogs are presentational; the parent runs the mutation and closes them on success.

- [ ] **Step 1: Write the failing tests**

`src/components/DisableDialog.test.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { UsageRow } from '../hooks/useUsageData'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { DisableDialog } from './DisableDialog'

const row: UsageRow = {
    type: 'CATEGORYOPTION_GROUP_SET',
    uid: 'x1',
    name: 'Funding source',
    views: 3,
    percent: 1,
    percentOfViews: 1,
}

describe('DisableDialog', () => {
    it('names the object and its type and calls onConfirm', async () => {
        const user = userEvent.setup()
        const onConfirm = jest.fn()
        renderWithProvider(
            <DisableDialog row={row} loading={false} onConfirm={onConfirm} onCancel={jest.fn()} />
        )
        expect(screen.getByText(/Funding source/)).toBeInTheDocument()
        expect(screen.getByText(/category option group set/i)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Disable' }))
        expect(onConfirm).toHaveBeenCalled()
    })

    it('calls onCancel', async () => {
        const user = userEvent.setup()
        const onCancel = jest.fn()
        renderWithProvider(
            <DisableDialog row={row} loading={false} onConfirm={jest.fn()} onCancel={onCancel} />
        )
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onCancel).toHaveBeenCalled()
    })

    it('shows the server error and stays open', () => {
        const error = new FetchError({
            type: 'access',
            message: 'You do not have the authority to update this object',
        })
        renderWithProvider(
            <DisableDialog row={row} loading={false} error={error} onConfirm={jest.fn()} onCancel={jest.fn()} />
        )
        expect(screen.getByText(/do not have the authority/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Disable' })).toBeEnabled()
    })

    it('disables both buttons while loading', () => {
        renderWithProvider(
            <DisableDialog row={row} loading={true} onConfirm={jest.fn()} onCancel={jest.fn()} />
        )
        expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
})
```

`src/components/RemoveViewDialog.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { RemoveViewDialog } from './RemoveViewDialog'

describe('RemoveViewDialog', () => {
    it('explains the consequence and confirms', async () => {
        const user = userEvent.setup()
        const onConfirm = jest.fn()
        renderWithProvider(
            <RemoveViewDialog loading={false} onConfirm={onConfirm} onCancel={jest.fn()} />
        )
        expect(screen.getByText(/Data dimension usage/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Remove SQL view' }))
        expect(onConfirm).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test DisableDialog RemoveViewDialog`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Write the shared ConfirmDialog and the two dialogs**

`src/components/ConfirmDialog.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
    NoticeBox,
} from '@dhis2/ui'
import React from 'react'

type Props = {
    title: string
    body: React.ReactNode
    confirmLabel: string
    destructive?: boolean
    loading: boolean
    error?: FetchError
    onConfirm: () => void
    onCancel: () => void
    dataTest?: string
}

export const errorMessage = (error: FetchError): string =>
    error.details?.message || error.message || i18n.t('Unknown error')

export const ConfirmDialog = ({
    title,
    body,
    confirmLabel,
    destructive = false,
    loading,
    error,
    onConfirm,
    onCancel,
    dataTest = 'confirm-dialog',
}: Props) => (
    <Modal small onClose={loading ? undefined : onCancel} dataTest={dataTest}>
        <ModalTitle>{title}</ModalTitle>
        <ModalContent>
            {body}
            {error && (
                <div style={{ marginTop: 'var(--spacers-dp12)' }}>
                    <NoticeBox error title={i18n.t('The request failed')}>
                        {errorMessage(error)}
                    </NoticeBox>
                </div>
            )}
        </ModalContent>
        <ModalActions>
            <ButtonStrip end>
                <Button secondary onClick={onCancel} disabled={loading}>
                    {i18n.t('Cancel')}
                </Button>
                <Button
                    primary={!destructive}
                    destructive={destructive}
                    onClick={onConfirm}
                    disabled={loading}
                    loading={loading}
                >
                    {confirmLabel}
                </Button>
            </ButtonStrip>
        </ModalActions>
    </Modal>
)
```

`src/components/DisableDialog.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React from 'react'
import { getDimensionType } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'
import { ConfirmDialog } from './ConfirmDialog'

type Props = {
    row: UsageRow
    loading: boolean
    error?: FetchError
    onConfirm: () => void
    onCancel: () => void
}

export const DisableDialog = ({ row, loading, error, onConfirm, onCancel }: Props) => (
    <ConfirmDialog
        dataTest="disable-dialog"
        title={i18n.t('Disable data dimension')}
        body={
            <>
                <p>
                    {i18n.t(
                        'Disable the {{type}} "{{name}}" as a data dimension?',
                        {
                            type: getDimensionType(row.type).getLabel().toLowerCase(),
                            name: row.name,
                            interpolation: { escapeValue: false },
                        }
                    )}
                </p>
                <p>
                    {i18n.t(
                        'Favorites that use this dimension will stop working until it is re-enabled in the Maintenance app. Analytics tables shrink at the next analytics run.'
                    )}
                </p>
            </>
        }
        confirmLabel={i18n.t('Disable')}
        destructive
        loading={loading}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
)
```

`src/components/RemoveViewDialog.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React from 'react'
import { SQL_VIEW_NAME } from '../sql/sqlView'
import { ConfirmDialog } from './ConfirmDialog'

type Props = {
    loading: boolean
    error?: FetchError
    onConfirm: () => void
    onCancel: () => void
}

export const RemoveViewDialog = ({ loading, error, onConfirm, onCancel }: Props) => (
    <ConfirmDialog
        dataTest="remove-view-dialog"
        title={i18n.t('Remove the SQL view')}
        body={
            <p>
                {i18n.t(
                    'This deletes the SQL view "{{name}}" that the app installed. The app will offer to recreate it the next time it is opened.',
                    { name: SQL_VIEW_NAME, interpolation: { escapeValue: false } }
                )}
            </p>
        }
        confirmLabel={i18n.t('Remove SQL view')}
        destructive
        loading={loading}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
)
```

- [ ] **Step 4: Run the tests**

Run: `yarn test DisableDialog RemoveViewDialog && yarn lint`
Expected: PASS, lint clean. `Modal` renders through a portal; Testing Library's `screen` queries `document.body`, so no extra setup is needed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfirmDialog.tsx src/components/DisableDialog.tsx src/components/DisableDialog.test.tsx src/components/RemoveViewDialog.tsx src/components/RemoveViewDialog.test.tsx
git commit -m "Add confirmation dialogs for disabling a dimension and removing the view

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: SQL view notice and intro text

**Files:**
- Create: `src/components/SqlViewNotice.tsx`, `src/components/SqlViewNotice.test.tsx`, `src/components/Intro.tsx`, `src/components/Intro.module.css`

**Interfaces:**
- Consumes: `SqlViewStatus`, `MutationState`, `errorMessage` (Task 10).
- Produces:
  ```tsx
  <SqlViewNotice status statusError mutation onCreate onUpdate onRetry />
  // props: { status: 'MISSING' | 'OUTDATED' | 'ERROR'; statusError?: FetchError; mutation: MutationState; onCreate: () => void; onUpdate: () => void; onRetry: () => void }
  <Intro />
  ```

- [ ] **Step 1: Write the failing test**

`src/components/SqlViewNotice.test.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { SqlViewNotice } from './SqlViewNotice'

const idle = { loading: false }
const noop = jest.fn()

describe('SqlViewNotice', () => {
    it('offers to create a missing view', async () => {
        const user = userEvent.setup()
        const onCreate = jest.fn()
        renderWithProvider(
            <SqlViewNotice status="MISSING" mutation={idle} onCreate={onCreate} onUpdate={noop} onRetry={noop} />
        )
        expect(screen.getByText(/needs an SQL view/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Create SQL view' }))
        expect(onCreate).toHaveBeenCalled()
    })

    it('offers to update an outdated view', async () => {
        const user = userEvent.setup()
        const onUpdate = jest.fn()
        renderWithProvider(
            <SqlViewNotice status="OUTDATED" mutation={idle} onCreate={noop} onUpdate={onUpdate} onRetry={noop} />
        )
        expect(screen.getByText(/older version/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Update SQL view' }))
        expect(onUpdate).toHaveBeenCalled()
    })

    it('shows the status error with a retry button', async () => {
        const user = userEvent.setup()
        const onRetry = jest.fn()
        const statusError = new FetchError({ type: 'network', message: 'Failed to fetch' })
        renderWithProvider(
            <SqlViewNotice status="ERROR" statusError={statusError} mutation={idle} onCreate={noop} onUpdate={noop} onRetry={onRetry} />
        )
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Retry' }))
        expect(onRetry).toHaveBeenCalled()
    })

    it('shows a mutation error and names the authority on 403', () => {
        const error = new FetchError({
            type: 'access',
            message: 'forbidden',
            details: { httpStatusCode: 403, message: 'Access denied' },
        })
        renderWithProvider(
            <SqlViewNotice status="MISSING" mutation={{ loading: false, error }} onCreate={noop} onUpdate={noop} onRetry={noop} />
        )
        expect(screen.getByText(/Access denied/)).toBeInTheDocument()
        expect(screen.getByText(/Add\/Update SQL view/)).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test SqlViewNotice`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the components**

`src/components/SqlViewNotice.tsx`:

```tsx
import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import { Button, NoticeBox } from '@dhis2/ui'
import React from 'react'
import { MutationState } from '../hooks/useEngineMutation'
import { SQL_VIEW_NAME } from '../sql/sqlView'
import { errorMessage } from './ConfirmDialog'

type Props = {
    status: 'MISSING' | 'OUTDATED' | 'ERROR'
    statusError?: FetchError
    mutation: MutationState
    onCreate: () => void
    onUpdate: () => void
    onRetry: () => void
}

const isForbidden = (error: FetchError) => error.details?.httpStatusCode === 403

const MutationError = ({ error }: { error: FetchError }) => (
    <div style={{ marginTop: 'var(--spacers-dp12)' }}>
        <NoticeBox error title={i18n.t('The request failed')}>
            {errorMessage(error)}
            {isForbidden(error) && (
                <>
                    {' '}
                    {i18n.t(
                        'Your user needs the "Add/Update SQL view" authority (or the Superuser role) to install the view.'
                    )}
                </>
            )}
        </NoticeBox>
    </div>
)

export const SqlViewNotice = ({ status, statusError, mutation, onCreate, onUpdate, onRetry }: Props) => {
    if (status === 'ERROR') {
        return (
            <NoticeBox error title={i18n.t('Could not check the SQL view')}>
                <p>{statusError ? errorMessage(statusError) : i18n.t('Unknown error')}</p>
                <Button small onClick={onRetry}>
                    {i18n.t('Retry')}
                </Button>
            </NoticeBox>
        )
    }

    if (status === 'MISSING') {
        return (
            <NoticeBox warning title={i18n.t('SQL view not installed')}>
                <p>
                    {i18n.t(
                        'The tool needs an SQL view named "{{name}}" to count how often favorites use each dimension. Creating it requires the "Add/Update SQL view" authority. The view is public read-only and can be removed from this app at any time.',
                        { name: SQL_VIEW_NAME, interpolation: { escapeValue: false } }
                    )}
                </p>
                <Button primary small onClick={onCreate} loading={mutation.loading} disabled={mutation.loading}>
                    {i18n.t('Create SQL view')}
                </Button>
                {mutation.error && <MutationError error={mutation.error} />}
            </NoticeBox>
        )
    }

    return (
        <NoticeBox title={i18n.t('SQL view needs an update')}>
            <p>
                {i18n.t(
                    'An older version of the SQL view is installed (for example from the Category dimension disabler, or for a different DHIS2 version). Update it to include group sets and the current server version.'
                )}
            </p>
            <Button primary small onClick={onUpdate} loading={mutation.loading} disabled={mutation.loading}>
                {i18n.t('Update SQL view')}
            </Button>
            {mutation.error && <MutationError error={mutation.error} />}
        </NoticeBox>
    )
}
```

`src/components/Intro.module.css`:

```css
.intro {
    max-width: 900px;
    margin-block-end: var(--spacers-dp16);
    color: var(--colors-grey800);
    line-height: 1.5;
}

.intro summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--colors-grey900);
}

.intro p {
    margin: var(--spacers-dp8) 0;
}
```

`src/components/Intro.tsx`:

```tsx
import i18n from '@dhis2/d2-i18n'
import React from 'react'
import classes from './Intro.module.css'

export const Intro = () => (
    <details className={classes.intro} open>
        <summary>{i18n.t('About this tool')}</summary>
        <p>
            {i18n.t(
                'Categories, organisation unit group sets, data element group sets and category option group sets can be enabled as data dimensions. Enabled dimensions appear in the analytics apps, where they can be used to disaggregate data. Each enabled dimension adds a column to the analytics tables, which costs time during analytics generation and disk space.'
            )}
        </p>
        <p>
            {i18n.t(
                'The table ranks every enabled dimension by how often favorites (visualizations, maps, event visualizations) that use it were opened in the last 12 months. "% of dimension views" is the share of all such views; "% of favorite views" compares against all favorite views, including favorites that use no dimension.'
            )}
        </p>
        <p>
            {i18n.t(
                'Dimensions with no or very few views are candidates for disabling. Favorites that use a disabled dimension stop working, and section forms lose their subtotals for it, so check before disabling. A dimension can be re-enabled at any time in the Maintenance app. Try changes on a test system first.'
            )}
        </p>
    </details>
)
```

- [ ] **Step 4: Run the tests**

Run: `yarn test SqlViewNotice && yarn lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/SqlViewNotice.tsx src/components/SqlViewNotice.test.tsx src/components/Intro.tsx src/components/Intro.module.css
git commit -m "Add the SQL view notice and the intro text

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Wire the app together

**Files:**
- Modify: `src/App.tsx`, `src/App.module.css`, `src/App.test.tsx`
- Create: `src/components/UsageView.tsx`, `src/components/UsageView.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `App` (default export) and `UsageView` (`{ minor: number; onViewRemoved: () => void }`), which renders when the status is READY.

- [ ] **Step 1: Write the failing tests**

`src/components/UsageView.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { SQL_VIEW_ID } from '../sql/sqlView'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { UsageView } from './UsageView'

const grid = {
    headers: ['type', 'uid', 'name', 'views', 'percent', 'percent_of_views'].map((name) => ({ name })),
    rows: [
        ['CATEGORY', 'cat1', 'Gender', 4, 100, 50],
        ['DATAELEMENT_GROUP_SET', 'degs1', 'Diseases', 0, 0, 0],
    ],
}

describe('UsageView', () => {
    it('loads rows, disables one after confirmation, shows an alert and refetches', async () => {
        const user = userEvent.setup()
        let calls = 0
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: jest.fn(() => {
                calls += 1
                return calls === 1 ? { listGrid: grid } : { listGrid: { ...grid, rows: [grid.rows[0]] } }
            }),
            dataElementGroupSets: jest.fn(() => ({ status: 'OK' })),
            sqlViews: jest.fn(() => ({ status: 'OK' })),
        }
        renderWithProvider(<UsageView minor={43} onViewRemoved={jest.fn()} />, data)

        await screen.findByText('Diseases')
        const diseasesRow = screen
            .getAllByTestId('usage-row')
            .find((row) => within(row).getByTestId('usage-row-name').textContent === 'Diseases')
        await user.click(within(diseasesRow as HTMLElement).getByRole('button', { name: 'Disable' }))
        await user.click(within(screen.getByTestId('disable-dialog')).getByRole('button', { name: 'Disable' }))

        await waitFor(() => expect(screen.queryByTestId('disable-dialog')).not.toBeInTheDocument())
        expect(data.dataElementGroupSets).toHaveBeenCalledWith(
            'json-patch',
            expect.objectContaining({ id: 'degs1' }),
            expect.anything()
        )
        await waitFor(() => expect(screen.queryByText('Diseases')).not.toBeInTheDocument())
        expect(screen.getByText('"Diseases" is no longer a data dimension')).toBeInTheDocument()
    })

    it('removes the view after confirmation and notifies the parent', async () => {
        const user = userEvent.setup()
        const onViewRemoved = jest.fn()
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: () => ({ listGrid: grid }),
            sqlViews: jest.fn(() => ({ status: 'OK' })),
        }
        renderWithProvider(<UsageView minor={43} onViewRemoved={onViewRemoved} />, data)
        await screen.findByText('Gender')
        await user.click(screen.getByRole('button', { name: 'Remove SQL view' }))
        await user.click(within(screen.getByTestId('remove-view-dialog')).getByRole('button', { name: 'Remove SQL view' }))
        await waitFor(() => expect(onViewRemoved).toHaveBeenCalled())
        expect(data.sqlViews).toHaveBeenCalledWith('delete', expect.objectContaining({ id: SQL_VIEW_ID }), expect.anything())
    })

    it('shows a data error with retry and keeps the remove button available', async () => {
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: () => {
                throw new Error('relation "orgunitgroupset" does not exist')
            },
        }
        renderWithProvider(<UsageView minor={43} onViewRemoved={jest.fn()} />, data)
        expect(await screen.findByText(/does not exist/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove SQL view' })).toBeInTheDocument()
    })
})
```

`src/App.test.tsx` (replace):

```tsx
import { FetchError } from '@dhis2/app-runtime'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import App from './App'
import { buildQuery } from './sql/buildQuery'
import { buildSqlViewDefinition, SQL_VIEW_ID } from './sql/sqlView'
import { renderWithProvider } from './test-utils/renderWithProvider'

describe('App', () => {
    it('shows the create notice when the view is missing, creates it, then shows the table', async () => {
        const user = userEvent.setup()
        let created = false
        const data = {
            sqlViews: jest.fn((type: string) => {
                if (type === 'create') {
                    created = true
                    return { status: 'OK' }
                }
                if (!created) {
                    throw new FetchError({ type: 'unknown', message: 'nf', details: { httpStatusCode: 404 } })
                }
                return { id: SQL_VIEW_ID, sqlQuery: buildQuery(43) }
            }),
            [`sqlViews/${SQL_VIEW_ID}/data`]: () => ({
                listGrid: {
                    headers: ['type', 'uid', 'name', 'views', 'percent', 'percent_of_views'].map((name) => ({ name })),
                    rows: [['CATEGORY', 'cat1', 'Gender', 1, 100, 100]],
                },
            }),
        }
        renderWithProvider(<App />, data)
        await screen.findByText('SQL view not installed')
        await user.click(screen.getByRole('button', { name: 'Create SQL view' }))
        expect(await screen.findByText('Gender')).toBeInTheDocument()
        expect(data.sqlViews).toHaveBeenCalledWith(
            'create',
            expect.objectContaining({ data: buildSqlViewDefinition(43) }),
            expect.anything()
        )
    })

    it('shows the update notice for an outdated view', async () => {
        renderWithProvider(<App />, {
            sqlViews: () => ({ id: SQL_VIEW_ID, sqlQuery: 'SELECT 1' }),
        })
        expect(await screen.findByText('SQL view needs an update')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test UsageView App`
Expected: FAIL (module missing / title-only App).

- [ ] **Step 3: Write UsageView**

`src/components/UsageView.tsx`:

```tsx
import { useAlert } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import { Button, CircularLoader, NoticeBox } from '@dhis2/ui'
import React, { useState } from 'react'
import { useDisableDimension } from '../hooks/useDisableDimension'
import { useSqlViewMutations } from '../hooks/useSqlViewMutations'
import { UsageRow, useUsageData } from '../hooks/useUsageData'
import { errorMessage } from './ConfirmDialog'
import { DisableDialog } from './DisableDialog'
import { RemoveViewDialog } from './RemoveViewDialog'
import { UsageTable } from './UsageTable'
import classes from './UsageView.module.css'

type Props = {
    minor: number
    onViewRemoved: () => void
}

export const UsageView = ({ minor, onViewRemoved }: Props) => {
    const { rows, loading, error, refetch } = useUsageData()
    const [rowToDisable, setRowToDisable] = useState<UsageRow | null>(null)
    const [confirmRemove, setConfirmRemove] = useState(false)
    const disableMutation = useDisableDimension()
    const viewMutations = useSqlViewMutations(minor)
    const { show: showDisabled } = useAlert(
        ({ name }: { name: string }) =>
            i18n.t('"{{name}}" is no longer a data dimension', {
                name,
                interpolation: { escapeValue: false },
            }),
        { success: true }
    )

    const confirmDisable = async () => {
        if (!rowToDisable) {
            return
        }
        const ok = await disableMutation.disable(rowToDisable)
        if (ok) {
            showDisabled({ name: rowToDisable.name })
            setRowToDisable(null)
            refetch()
        }
    }

    const confirmRemoveView = async () => {
        const ok = await viewMutations.remove()
        if (ok) {
            setConfirmRemove(false)
            onViewRemoved()
        }
    }

    return (
        <div>
            {loading && (
                <div className={classes.loader}>
                    <CircularLoader />
                </div>
            )}
            {error && (
                <NoticeBox error title={i18n.t('Could not load dimension usage')}>
                    <p>{errorMessage(error)}</p>
                    <p>
                        {i18n.t(
                            'If the view exists but fails on this server version, remove it below and let the app recreate it.'
                        )}
                    </p>
                    <Button small onClick={() => refetch()}>
                        {i18n.t('Retry')}
                    </Button>
                </NoticeBox>
            )}
            {!loading && !error && <UsageTable rows={rows} onDisable={setRowToDisable} />}

            <div className={classes.footer}>
                <Button secondary small onClick={() => setConfirmRemove(true)}>
                    {i18n.t('Remove SQL view')}
                </Button>
            </div>

            {rowToDisable && (
                <DisableDialog
                    row={rowToDisable}
                    loading={disableMutation.state.loading}
                    error={disableMutation.state.error}
                    onConfirm={confirmDisable}
                    onCancel={() => setRowToDisable(null)}
                />
            )}
            {confirmRemove && (
                <RemoveViewDialog
                    loading={viewMutations.state.loading}
                    error={viewMutations.state.error}
                    onConfirm={confirmRemoveView}
                    onCancel={() => setConfirmRemove(false)}
                />
            )}
        </div>
    )
}
```

`src/components/UsageView.module.css`:

```css
.loader {
    display: flex;
    justify-content: center;
    padding: var(--spacers-dp32);
}

.footer {
    margin-block-start: var(--spacers-dp24);
    padding-block-start: var(--spacers-dp16);
    border-top: 1px solid var(--colors-grey300);
}
```

Note: the disable error stays inside the open dialog because `rowToDisable` is only cleared on success. `useDisableDimension`'s state resets on the next `run`, so cancelling and reopening shows a clean dialog.

- [ ] **Step 4: Write App**

`src/App.tsx`:

```tsx
import i18n from '@dhis2/d2-i18n'
import { CircularLoader } from '@dhis2/ui'
import React from 'react'
import classes from './App.module.css'
import { Intro } from './components/Intro'
import { SqlViewNotice } from './components/SqlViewNotice'
import { UsageView } from './components/UsageView'
import { useSqlViewMutations } from './hooks/useSqlViewMutations'
import { useSqlViewStatus } from './hooks/useSqlViewStatus'

const App = () => {
    const { status, error, refetch, minor } = useSqlViewStatus()
    const viewMutations = useSqlViewMutations(minor)

    // Refetch the status after every attempt, not only on success: a 409 on
    // create means the view appeared meanwhile (another admin, a second tab),
    // and the refetch then moves straight to OUTDATED/READY. On other errors
    // the refetch is a harmless extra GET and the notice keeps showing
    // viewMutations.state.error, which lives in this component.
    const createView = async () => {
        await viewMutations.create()
        refetch()
    }
    const updateView = async () => {
        await viewMutations.update()
        refetch()
    }

    return (
        <div className={classes.container}>
            <h1>{i18n.t('Data Dimension Disabler')}</h1>
            <Intro />
            {status === 'LOADING' && (
                <div className={classes.loader}>
                    <CircularLoader />
                </div>
            )}
            {(status === 'MISSING' || status === 'OUTDATED' || status === 'ERROR') && (
                <SqlViewNotice
                    status={status}
                    statusError={error}
                    mutation={viewMutations.state}
                    onCreate={createView}
                    onUpdate={updateView}
                    onRetry={() => refetch()}
                />
            )}
            {status === 'READY' && <UsageView minor={minor} onViewRemoved={() => refetch()} />}
        </div>
    )
}

export default App
```

Add to `src/App.module.css`:

```css
.loader {
    display: flex;
    justify-content: center;
    padding: var(--spacers-dp32);
}
```

- [ ] **Step 5: Run all tests and lint**

Run: `yarn test && yarn lint`
Expected: all suites PASS, lint clean.

- [ ] **Step 6: Smoke-run against a live 2.43 instance**

Start the dev server bound to the host-visible port with the proxy pointed at the review instance:

```bash
yarn start --port "$SANDBOX_HOST_PORT" --proxyPort "$SANDBOX_HOST_PORT_2" --proxy http://dhis2-agent-cdd-sl43:8080
```

(Run in the background and record the PID.) Then, with Playwright (see the `playwright-cli` skill) or by telling the user to open `http://localhost:$SANDBOX_HOST_PORT` and log in with server `http://localhost:$SANDBOX_HOST_PORT_2`, `admin` / `district`:

1. Expect the "SQL view not installed" notice. Click Create. Expect the table.
2. Expect rows of all four types (the SL seed has enabled categories and group sets).
3. Filter, sort, open the Disable dialog and cancel.
4. Remove the view; expect the notice again.

Take one screenshot of the table state into the scratchpad for the final report. Stop the dev server by PID.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.module.css src/App.test.tsx src/components/UsageView.tsx src/components/UsageView.module.css src/components/UsageView.test.tsx
git commit -m "Wire the status, notice, table and dialogs into the app

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: i18n strings, README, CHANGELOG, CI, CLAUDE.md

**Files:**
- Create: `i18n/en.pot` (generated), `CLAUDE.md`, `scripts/generate-view-events.sh`
- Modify: `README.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Generate the translation template**

```bash
yarn build
git status --short i18n
```

Expected: `i18n/en.pot` created/updated with every `i18n.t` string. Open it and confirm the plural entry for `{{count}} enabled dimension` is present.

- [ ] **Step 2: Rewrite the CI workflows for the platform build**

`.github/workflows/ci.yml`: replace the `Lint`, `Build` and `Upload bundle` steps with:

```yaml
            - name: Lint
              run: yarn lint

            - name: Test
              run: yarn test
              env:
                  CI: 'true'

            - name: Build
              run: yarn build

            - name: Upload bundle
              uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
              with:
                  name: app-bundle
                  path: build/bundle/*.zip
```

`.github/workflows/release.yml`: change `run: yarn run zip` to `run: yarn build` and `compiled/*.zip` to `build/bundle/*.zip` in the `gh release create` step. Keep everything else (SHA pins, changelog extraction, `--ignore-scripts`).

- [ ] **Step 3: Rewrite README.md**

Replace the file with: title `Data Dimension Disabler`; license line; an **Introduction** adapted from the current text that names all four dimension types and the map/event visualization coverage; a **How it works** section describing the SQL view (name, UID, public read-only, created/updated/removed from the app, what the two percentages mean, the 12-month window); **Permissions** (Add/Update SQL view authority to install; metadata write on the object to disable; SQL view execute to read); **Compatibility** (DHIS2 2.40 to 2.43); **Development** with:

````markdown
```
yarn install
yarn start --proxy https://play.im.dhis2.org/dev-2-43
yarn test
yarn lint
yarn build        # bundle in build/bundle/
```
````

and a note that installing the zip replaces nothing automatically: the old "Category dimension disabler" app should be uninstalled, and the app updates the old SQL view in place.

- [ ] **Step 4: Update CHANGELOG.md**

Add at the top (keep the existing sections below):

```markdown
## [1.0.0] - 2026-09-21

### Changed
- Rewritten on the DHIS2 App Platform (React, TypeScript, @dhis2/ui). Replaces the webpack build, jQuery/DataTables and the conditional legacy header bar.
- Renamed to **Data Dimension Disabler** (app key `data-dimension-disabler`). Uninstall the old "Category dimension disabler" after installing this one.
- The SQL view keeps its UID and is renamed "Data dimension usage"; an old install is detected and updated from the app. Sharing tightened to public read-only.
- Map views are now counted correctly (the view previously joined the map view uid instead of the map uid).
- Event types counted: VISUALIZATION_VIEW, MAP_VIEW, EVENT_VISUALIZATION_VIEW, EVENT_CHART_VIEW, EVENT_REPORT_VIEW.

### Added
- Organisation unit group sets, data element group sets and category option group sets, in addition to categories.
- Type filter, sortable columns, confirmation dialogs, in-app error messages.
- Support for DHIS2 2.40 to 2.43.
```

- [ ] **Step 5: Add the test helper script**

`scripts/generate-view-events.sh`:

```bash
#!/usr/bin/env bash
# Record favorite view events on a DHIS2 instance so the usage ranking is
# non-trivial when testing. Usage:
#   scripts/generate-view-events.sh http://dhis2-agent-cdd-sl43:8080 admin:district
# Records N views per favorite, where N decreases along the list, for the
# first 5 visualizations, 3 maps and 3 event visualizations.
set -euo pipefail
BASE="${1:?base url}"; AUTH="${2:-admin:district}"

record() { # eventType uid count
    for _ in $(seq 1 "$3"); do
        curl -s -o /dev/null -u "$AUTH" -X POST "$BASE/api/dataStatistics?eventType=$1&favorite=$2"
    done
    echo "$1 $2 x$3"
}

n=5
for uid in $(curl -s -u "$AUTH" "$BASE/api/visualizations?fields=id&pageSize=5&filter=categoryDimensions:!empty" | jq -r '.visualizations[].id'); do
    record VISUALIZATION_VIEW "$uid" $n; n=$((n>1 ? n-1 : 1))
done
n=3
for uid in $(curl -s -u "$AUTH" "$BASE/api/maps?fields=id&pageSize=3" | jq -r '.maps[].id'); do
    record MAP_VIEW "$uid" $n; n=$((n>1 ? n-1 : 1))
done
n=3
for uid in $(curl -s -u "$AUTH" "$BASE/api/eventVisualizations?fields=id&pageSize=3" | jq -r '.eventVisualizations[].id' 2>/dev/null); do
    record EVENT_VISUALIZATION_VIEW "$uid" $n; n=$((n>1 ? n-1 : 1))
done
```

`chmod +x scripts/generate-view-events.sh`. Run it once against `agent-cdd-sl43` and confirm with the SQL from Task 4 step 5 that `views` is now non-zero for some rows.

- [ ] **Step 6: Write CLAUDE.md**

```markdown
# Data Dimension Disabler

DHIS2 App Platform app (TypeScript, React 18, @dhis2/app-runtime, @dhis2/ui).
Ranks categories and group sets enabled as data dimensions by favorite views
in the last 12 months and lets an admin disable them.

## Layout
- `src/dimensionTypes.ts` — the single source of truth for the four dimension
  types (API endpoint + SQL names). Add a type here, nowhere else.
- `src/sql/buildQuery.ts` — generates the SQL view query per server minor
  version. `docs/schema-check.md` records the verified table names.
- `src/sql/sqlView.ts` — view UID `GOLswS44mh8` (kept from the original
  category-only app so installs upgrade in place), name, sharing, outdated check.
- `src/hooks/*` — status (MISSING/OUTDATED/READY/ERROR), usage data, mutations.
  Mutations call `engine.mutate` directly (`useEngineMutation`) because the
  resource varies per call.
- `src/components/*` — presentational; `UsageView` owns dialogs + mutations.

## Conventions
- yarn 1, `yarn lint` = eslint + prettier + tsc. Tests next to sources,
  `renderWithProvider` from `src/test-utils`. `data-test` is the test id attribute.
- Never call `i18n.t` at module scope.
- Supported servers 2.40–2.43; `minor < 41` is the only SQL version branch.

## Testing against DHIS2
- `yarn start --proxy <url>`; `scripts/generate-view-events.sh <url>` seeds view
  events so the ranking is non-trivial.
- Full multi-version review recipe: `dhis2-app-review` skill; last run recorded
  in `docs/reviews/`.
```

- [ ] **Step 7: Lint, test, build, commit**

```bash
yarn lint && yarn test && yarn build
git add -A
git commit -m "Update docs, CI workflows and translation template for 1.0.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Create the remaining review instances and prepare them

**Files:** none in the repo (instance work only).

- [ ] **Step 1: Create the three remaining instances via the broker**

Per the `dhis2-instances` skill: `agent-cdd-emis41` from `dhis2-edu-meta_2026-07-17_v41.sql.gz`, `agent-cdd-ehr42` from `dhis2-ehr-meta_2026-07-17_v42.sql.gz`, `agent-cdd-lao43` from `lao_hmis_demo_v43.sql.gz`. Same label as Task 1. Wait until all are `running` and `/api/system/info` answers with the expected version. `agent-cdd-sl40` and `agent-cdd-sl43` already exist.

- [ ] **Step 2: Make sure every instance has at least one enabled dimension of each type**

For each instance, check:

```bash
for r in categories organisationUnitGroupSets dataElementGroupSets categoryOptionGroupSets; do
  echo -n "$r enabled: "; curl -s -u admin:district "$BASE/api/$r?filter=dataDimension:eq:true&fields=id,name&pageSize=3" | jq -c "[.$r[]?.name]"
done
```

Where a type has none, enable one that has a favorite using it, or simply enable the first object with a JSON Patch:

```bash
curl -s -u admin:district -X PATCH -H 'Content-Type: application/json-patch+json' \
  "$BASE/api/<resource>/<id>" -d '[{"op":"add","path":"/dataDimension","value":true}]'
```

Record what you enabled per instance in the review notes (Task 15) so the results are interpretable.

- [ ] **Step 3: Generate view events**

```bash
for n in sl40 emis41 ehr42 lao43 sl43; do scripts/generate-view-events.sh http://dhis2-agent-cdd-$n:8080; done
```

- [ ] **Step 4: Install the legacy category-only SQL view on `agent-cdd-emis41` only**

This exercises the OUTDATED path. Post the old `sql_view_41` definition from the previous app version (git show `7b8c7e1:src/app.js`, the `sql_view_41` object) to `POST $BASE/api/sqlViews` on emis41. Expect 201.

- [ ] **Step 5: Build and install the bundle on all five instances**

```bash
yarn build
for n in sl40 emis41 ehr42 lao43 sl43; do
  curl -s -u admin:district -F "file=@build/bundle/data-dimension-disabler-1.0.0.zip" http://dhis2-agent-cdd-$n:8080/api/apps; echo " <- $n"
done
```

Expected: HTTP 2xx for each; the app appears at `/api/apps` with key `data-dimension-disabler`.

---

### Task 15: Full review with the dhis2-app-review skill

**Files:**
- Create: `docs/reviews/2026-09-21-review.md`

- [ ] **Step 1: Invoke the skill**

Invoke `dhis2-app-review` and follow its recipe end to end: static code review of the branch, architecture assessment, functional/UI testing with Playwright on all five installed instances, multi-version compatibility, severity-ranked report. Give it these app-specific checks in addition to its own list, for **each** instance:

1. Fresh load with no view: notice → Create → table with rows of all four types, `views` matching the counts generated in Task 14 (compare with `scripts/generate-view-events.sh` output and with the SQL run directly).
2. On emis41: the OUTDATED notice appears first; Update → table; the view's `name` is now "Data dimension usage" and `sharing.public` is `r-------` (`GET /api/sqlViews/GOLswS44mh8?fields=name,sharing`).
3. Filter to each type; sort by name and by views both directions.
4. Disable one object of each type: dialog text names object and type; after confirm the row disappears, an alert appears, and `GET /api/<resource>/<id>?fields=dataDimension` returns `false`. Re-enable afterwards with a PATCH so the instance stays usable.
5. Error path, on `agent-cdd-sl43` with the view removed first: create a user that can open the app but cannot create SQL views, log in as that user, load the app, click Create → the notice shows the server message and names the "Add/Update SQL view" authority; the app does not crash. Recipe:

   ```bash
   BASE=http://dhis2-agent-cdd-sl43:8080
   # The authority string the app requires is listed by the server itself:
   APP_AUTH=$(curl -s -u admin:district "$BASE/api/apps" | jq -r '.[] | select(.key=="data-dimension-disabler") | .authorities[0]')
   curl -s -u admin:district -H 'Content-Type: application/json' "$BASE/api/userRoles" -d "{\"name\":\"cdd-app-only\",\"authorities\":[\"$APP_AUTH\",\"F_SQLVIEW_EXECUTE\"]}"
   ROLE=$(curl -s -u admin:district "$BASE/api/userRoles?filter=name:eq:cdd-app-only&fields=id" | jq -r '.userRoles[0].id')
   OU=$(curl -s -u admin:district "$BASE/api/organisationUnits?level=1&fields=id" | jq -r '.organisationUnits[0].id')
   curl -s -u admin:district -H 'Content-Type: application/json' "$BASE/api/users" -d "{\"username\":\"cddlimited\",\"password\":\"Limited123!\",\"firstName\":\"CDD\",\"surname\":\"Limited\",\"userRoles\":[{\"id\":\"$ROLE\"}],\"organisationUnits\":[{\"id\":\"$OU\"}]}"
   ```

   If `.authorities` is empty for the app (the server then lets every user open it), pass only `F_SQLVIEW_EXECUTE`. Log in as `cddlimited` / `Limited123!` in the Playwright session.
6. Remove view → notice again → Create again.
7. Header bar: platform header renders on 40/41; on 42/43 the app renders inside the global shell without a double header.
8. Browser console: no errors, no React key warnings.
9. Response time of `/sqlViews/GOLswS44mh8/data` on the largest instance (lao43) noted in the report.

- [ ] **Step 2: Fix findings**

For every finding rated high or medium, fix it on the branch with a test where feasible, re-run `yarn lint && yarn test`, rebuild, reinstall on the affected instance(s), re-verify, and commit each fix separately with a message that names the finding.

- [ ] **Step 3: Write the report**

Save the skill's report as `docs/reviews/2026-09-21-review.md`: instance matrix (name, seed, version, result), findings by severity with status (fixed / open), screenshots referenced from the scratchpad are not committed; describe them in words. Commit:

```bash
git add docs/reviews/2026-09-21-review.md
git commit -m "Add the 2.40-2.43 review report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Clean up and hand off

- [ ] **Step 1: Delete the review instances**

Per the `dhis2-instances` skill, delete `agent-cdd-sl40`, `agent-cdd-emis41`, `agent-cdd-ehr42`, `agent-cdd-lao43`, `agent-cdd-sl43`. Confirm with `GET /instances` that none remain. Do not touch `agent-dimeval`, `agent-dqa` or `agent-ube-portal`.

- [ ] **Step 2: Final verification**

```bash
yarn lint && yarn test && yarn build
git status --short   # expect clean
git log --oneline origin/main..HEAD
```

Expected: clean tree, linear history from `7b8c7e1` (origin/main), no merge commits, no fix-up chains worth squashing (squash any "oops" commits with a non-interactive `git rebase` using `GIT_SEQUENCE_EDITOR`, or leave the history if every commit stands on its own).

- [ ] **Step 3: Hand off**

Invoke `superpowers:finishing-a-development-branch`. The report to the user must state: branch name and base commit (`7b8c7e1`), that the sandbox cannot push and the dhis2 org needs signed commits so they re-create the commits on the host, the review results summary with anything left open, the app rename consequence (uninstall the old app), and the location of the bundle (`build/bundle/data-dimension-disabler-1.0.0.zip`, not committed).
