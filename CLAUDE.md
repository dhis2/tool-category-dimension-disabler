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
  category-only app so installs upgrade in place), name, sharing, outdated
  check.
- `src/hooks/*` — status (LOADING/MISSING/OUTDATED/READY/ERROR), usage data,
  mutations. Mutations call `engine.mutate` directly (`useEngineMutation`)
  because the resource varies per call; it exposes `run`, `state` and
  `reset` (`reset` clears a stale mutation error when a dialog is opened for
  a different row or cancelled, without clobbering a concurrent call's
  loading state).
- `src/components/columns.ts` — the single source of truth for the usage
  table's columns (key, label, header tooltip, alignment, formatter, whether
  it can be hidden) plus the default visible set. Add or change a column
  here; `UsageTable` and `ColumnChooser` both render from it. Visibility is
  persisted per browser in `localStorage` under
  `data-dimension-disabler.columns` (a JSON array of column keys).
- `src/components/*` — presentational; `UsageView` owns dialogs + mutations.

## Conventions

- yarn 1, `yarn lint` = eslint + prettier + tsc. Tests next to sources,
  `renderWithProvider` from `src/test-utils`. `data-test` is the test id
  attribute.
- Never call `i18n.t` at module scope.
- The SQL view text must not contain a protected table name such as `users`
  (also `userinfo`, `oauth2client`): DHIS2 scans the query text with a
  word-boundary match and returns `409 E4310` from
  `/api/sqlViews/{uid}/data`, even when the word is only a JSON key in a
  string literal. Spell such keys by concatenation — `('user'||'s')`.
- Supported servers 2.40–2.43; `minor < 41` is the only SQL version branch
  (the category table was renamed from `dataelementcategory` to `category`
  in 2.41).

## Testing against DHIS2

- `yarn start --proxy <url>`; `scripts/generate-view-events.sh <url>` seeds
  view events so the ranking is non-trivial.
- Full multi-version review recipe: `dhis2-app-review` skill; last run
  recorded in `docs/review-2026-09-21/`. Reusable e2e suite: `e2e/README.md`.
