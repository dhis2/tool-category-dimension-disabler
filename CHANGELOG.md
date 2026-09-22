# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-09-21

### Changed

- Rewritten on the DHIS2 App Platform (React, TypeScript, @dhis2/ui).
  Replaces the webpack build, jQuery/DataTables and the conditional legacy
  header bar.
- Renamed to **Data Dimension Disabler** (app key `data-dimension-disabler`).
  Uninstall the old "Category dimension disabler" after installing this one.
- The SQL view keeps its UID and is renamed "Data dimension usage"; an old
  install is detected and updated in place from the app. Sharing tightened
  to public read-only (`r-r-----`: metadata read plus data read, since the
  view's data endpoint requires data read).
- Map views are now counted correctly, through the `mapmapviews` join table
  (the view previously joined the map view UID instead of the map UID that
  view events are recorded against).
- Event types counted: VISUALIZATION_VIEW, MAP_VIEW, EVENT_VISUALIZATION_VIEW,
  EVENT_CHART_VIEW, EVENT_REPORT_VIEW.

### Added

- Organisation unit group sets, data element group sets and category option
  group sets, in addition to categories. Data element group set dimensions
  are ranked from visualizations only, since no map view or event
  visualization join table exists for them.
- Type filter, sortable columns, confirmation dialogs, in-app error messages.
- Support for DHIS2 2.40 to 2.43.

## [0.1.0]

### Added

- Initial release.
- Updated automation to release zip artifact.

## [0.1.1]

### Added

- Include DHIS2 header bar

### Fixed

- Fixed webpack config to properly load project
