# Data Dimension Disabler

> ![Maturity: Validated](https://img.shields.io/badge/maturity-Validated-yellow)  
> Intended use: review use of data dimensions in favourites and analytics, to quickly disable those that are not used.  
> Maintainers: HISP Centre implementation team.
>
> **WARNING**  
> This tool is intended to be used by system administrators, not end users. It is available as a DHIS2 app, but has not been through the same rigorous testing as normal core apps. It should be used with care, and always tested in a development environment.

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

Alongside the view counts, the view counts the **favorites** themselves:
how many distinct visualizations, maps and event visualizations use the
dimension at all, whether or not anyone has opened them. That total is split
by how each favorite is shared, from its `sharing` JSONB column:

- **Public** — the favorite's public access string grants at least metadata
  read (it starts with `r`), so everyone who can log in can find it.
- **Shared** — not public, but shared with at least one user or user group
  (a non-empty `users` or `userGroups` object in the sharing JSON). An
  absent key, a JSON `null` and an empty `{}` all count as "not shared".
- **Private** — neither of the above: only the owner can open it.

The three add up to the Favorites total. The split matters when deciding
whether a dimension is safe to disable: a dimension used only by a handful
of private favorites affects far fewer people than one used by public
favorites that anyone can open from a dashboard, even when the view counts
look the same.

The table shows two percentages per dimension: **"% of dimension views"** is
that dimension's share of all views counted across every enabled dimension,
and **"% of favorite views"** compares the same count against every favorite
view recorded in the same window, including favorites that use no dimension
at all — a low number there means the dimension is barely used relative to
overall system activity, not just relative to other dimensions. These
definitions, and those of the other numeric columns, are also available in
the app itself: hover the ⓘ icon in a column header.

The view is created with `public: 'r-r-----'` sharing (metadata read plus
data read; the `/sqlViews/{uid}/data` endpoint that returns the ranked rows
requires data read specifically). It can be removed again from within the
app at any time — the app offers to recreate it the next time it is opened.

### Manage view

The **Manage view** button above the table shows or hides any column except Type
and Name, which are always shown. The table starts with Type, Name, UID,
Favorites, Views and "% of dimension views"; Public, Shared, Private and
"% of favorite views" start hidden. The choice is remembered in the browser's
`localStorage` (key `data-dimension-disabler.columns`), so it is per browser
and per user, not a server-side setting: it survives a reload but does not
follow the user to another machine.

## Permissions

- **Add/Update SQL view** authority (or Superuser) — required to install or
  update the "Data dimension usage" SQL view.
- **Metadata write** on a category, organisation unit group set, data
  element group set or category option group set — required to disable it
  as a data dimension.
- **Data read** on the "Data dimension usage" SQL view — required to read
  the view's data and see the usage ranking at all. Its `r-r-----` sharing
  (see above) already grants this to every logged-in user. The **SQL view
  execute** authority is _not_ what is checked here: a demo `admin` without
  it still reads the ranking fine, while removing data read from the view's
  sharing makes the data endpoint answer `409 E4312` ("Current user is not
  authorised to read data from SQL view") regardless of that authority.
- On DHIS2 2.42 and later, the global app shell also requires the
  server-generated **M_datadimensiondisabler** authority to open the app at
  all — without it, the shell answers "Unable to find an app for this URL".

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
