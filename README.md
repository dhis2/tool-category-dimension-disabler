# Data Dimension Disabler

## License

© Copyright 2024 University of Oslo, BSD-3-Clause. See [LICENSE](LICENSE).

## Introduction

Categories, organisation unit group sets, data element group sets and
category option group sets can each be enabled as a **data dimension**.
Enabled dimensions appear in the analytics apps (Data Visualizer, Maps, Event
Visualizer, Event Reports), where they can be used to disaggregate data — for
example splitting a category combination such as "Age/Sex" into its
individual categories. Every enabled dimension also adds a column to the
DHIS2 analytics tables, which costs time during analytics generation and
disk space, whether or not anyone actually uses it in a favorite.

This app ranks every currently enabled dimension by how often the favorites
that use it were opened in the last 12 months, across visualizations, maps
and event visualizations — data element group set dimensions can only be
attached to visualizations, since no equivalent join table exists for maps
or event visualizations. Dimensions with no or very few views are good
candidates for disabling. The app lets an admin disable a dimension directly
from the table, with a confirmation dialog that explains the consequence:
favorites that use a disabled dimension stop working until it is re-enabled,
and section forms lose their subtotals for it. A dimension can always be
re-enabled again in the Maintenance app, so try changes on a test system
first.

## How it works

The ranking is powered by an SQL view named **"Data dimension usage"**
(UID `GOLswS44mh8`, kept from the original "Category dimension disabler" app
so an existing install is upgraded in place rather than duplicated). The app
checks for this view on startup and offers to create it if missing, or to
update it if an older version is installed — for example the legacy
category-only view, or a view generated for a different DHIS2 server
version. The view is never installed silently; a notice always asks first,
because creating or replacing it requires the "Add/Update SQL view"
authority.

The view's query, for each dimension type:

- takes every category, organisation unit group set, data element group set
  and category option group set that currently has `dataDimension = true`;
- joins it, through the relevant `*dimension` and favorite join tables, to
  every visualization, map and event visualization that uses it as a
  dimension (map favorites are reached through the `mapmapviews` join table,
  since a map view event is recorded against the map's UID, not the map
  view's);
- counts how many `datastatisticsevent` rows of type `VISUALIZATION_VIEW`,
  `MAP_VIEW`, `EVENT_VISUALIZATION_VIEW`, `EVENT_CHART_VIEW` or
  `EVENT_REPORT_VIEW` were recorded against those favorites in the last 12
  months.

The table shows two percentages per dimension: **"% of dimension views"** is
that dimension's share of all views counted across every enabled dimension,
and **"% of favorite views"** compares the same count against every favorite
view recorded in the same window, including favorites that use no dimension
at all — a low number there means the dimension is barely used relative to
overall system activity, not just relative to other dimensions.

The view is created with `public: 'r-r-----'` sharing (metadata read plus
data read; the `/sqlViews/{uid}/data` endpoint that returns the ranked rows
requires data read specifically). It can be removed again from within the
app at any time — the app offers to recreate it the next time it is opened.

## Permissions

- **Add/Update SQL view** authority (or Superuser) — required to install or
  update the "Data dimension usage" SQL view.
- **Metadata write** on a category, organisation unit group set, data
  element group set or category option group set — required to disable it
  as a data dimension.
- **SQL view execute** authority — required to read the view's data and see
  the usage ranking at all.

## Compatibility

DHIS2 2.40 to 2.43.

## Development

```
yarn install
yarn start --proxy https://play.im.dhis2.org/dev-2-43
yarn test
yarn lint
yarn build        # bundle in build/bundle/
```

`scripts/generate-view-events.sh <base-url> [user:password]` records
favorite-view events against a test instance, so the ranking has non-trivial
data to show while developing.

## Upgrading from Category dimension disabler

Installing this app does not automatically remove or replace the old
"Category dimension disabler" app — uninstall it yourself after installing
Data Dimension Disabler. The old app's SQL view is detected on startup and
updated in place (same UID, new name and content), so no usage history or
manual re-configuration is needed; it is not created a second time under a
new UID.
