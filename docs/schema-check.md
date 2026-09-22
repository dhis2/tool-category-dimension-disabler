# Schema check for the Data dimension usage SQL view

Checked 2026-09-21 on Sierra Leone 2.40.x and 2.43.x seeds, via broker instances
`agent-cdd-sl40` (DHIS2 2.40.12, seed `dhis2-db-sierra-leone_V40.sql.gz`) and
`agent-cdd-sl43` (DHIS2 2.43.1, seed `dhis2-db-sierra-leone_v43.sql.gz`).

## Result

- All expected tables and columns exist on both versions: **NO** — two real
  differences from the spec's expectations (see below). Everything else
  matches exactly on both 2.40 and 2.43.

- **Category table**: confirmed as expected — `dataelementcategory` on 2.40,
  `category` on 2.43 (`categoryid` PK on both, both have `uid`, `name`,
  `datadimension`). No other dimension-type entity table (`orgunitgroupset`,
  `dataelementgroupset`, `categoryoptiongroupset`) is renamed between
  versions, and all four have `uid`, `name`, `datadimension` on both
  versions.

- **`map_mapviews` does not exist — on either version.** The spec's expected
  name is wrong, not version-dependent. The real join table between `map`
  and `mapview` is **`mapmapviews`** (no underscore), with columns `mapid,
  mapviewid, sort_order` — identical on 2.40 and 2.43. Task 4's
  `buildQuery.ts` must join `mapmapviews`, not `map_mapviews`.

- **`mapview_dataelementgroupsetdimensions` and
  `eventvisualization_dataelementgroupsetdimensions` do not exist — on
  either version.** This is not a 2.40-vs-2.43 difference; DATAELEMENT_GROUP_SET
  dimensions are only ever attached to `visualization` favorites in the
  schema. Only `visualization_dataelementgroupsetdimensions` exists (on both
  versions). Task 4's `favoriteSourcesFor`/join-table logic needs to skip the
  DATAELEMENT_GROUP_SET × (map view | event visualization) combination
  entirely, on every version — not gate it behind a version check.

- Missing tables on 2.40 (vs. 2.43): **none**, other than the expected
  `category`/`dataelementcategory` naming swap. Every other table in the
  checked list that exists on 2.43 also exists on 2.40 with the same
  columns.

- Every other expected table/column matches exactly, on both versions:
  `categorydimension(categorydimensionid, categoryid)`,
  `orgunitgroupsetdimension(orgunitgroupsetdimensionid, orgunitgroupsetid)`,
  `dataelementgroupsetdimension(dataelementgroupsetdimensionid, dataelementgroupsetid)`,
  `categoryoptiongroupsetdimension(categoryoptiongroupsetdimensionid, categoryoptiongroupsetid)`,
  the `visualization_*dimensions`, `mapview_*dimensions` and
  `eventvisualization_*dimensions` join tables that do exist (favorite id +
  dimension-table id, plus `sort_order`), `visualization(visualizationid,
  uid)`, `mapview(mapviewid, uid)`, `map(mapid, uid)`,
  `eventvisualization(eventvisualizationid, uid)`, and
  `datastatisticsevent(eventid, eventtype, timestamp, username, favoriteuid)`.

- `datastatisticsevent.eventtype` values seen (both versions, same set):
  `DASHBOARD_VIEW`, `DATA_SET_REPORT_VIEW`, `EVENT_CHART_VIEW`,
  `EVENT_REPORT_VIEW`, `MAP_VIEW`, `PASSIVE_DASHBOARD_VIEW`,
  `VISUALIZATION_VIEW`. Note: **`EVENT_VISUALIZATION_VIEW` was not observed
  on either seed** — event-visualization views are recorded as
  `EVENT_CHART_VIEW` or `EVENT_REPORT_VIEW` instead (legacy chart/report
  distinction retained in this enum even though the entity table was
  unified into `eventvisualization`). Task 4's `VIEW_EVENT_TYPES` list
  should rely on `EVENT_CHART_VIEW`/`EVENT_REPORT_VIEW` to count event
  visualization views; treat `EVENT_VISUALIZATION_VIEW` as belt-and-braces
  only, not as the value actually written by the server on these versions.

## Raw output

### agent-cdd-sl40 (DHIS2 2.40.12) — table/column dump

```
categorydimension: categorydimensionid, categoryid
categoryoptiongroupset: categoryoptiongroupsetid, uid, code, created, lastupdated, name, description, datadimension, userid, publicaccess, datadimensiontype, lastupdatedby, translations, attributevalues, sharing, shortname
categoryoptiongroupsetdimension: categoryoptiongroupsetdimensionid, categoryoptiongroupsetid
dataelementcategory: categoryid, name, uid, code, lastupdated, created, datadimension, userid, publicaccess, datadimensiontype, lastupdatedby, translations, attributevalues, sharing, shortname, description
dataelementgroupset: dataelementgroupsetid, name, description, compulsory, uid, code, lastupdated, created, userid, publicaccess, datadimension, lastupdatedby, translations, attributevalues, sharing, shortname
dataelementgroupsetdimension: dataelementgroupsetdimensionid, dataelementgroupsetid
datastatisticsevent: eventid, eventtype, timestamp, username, favoriteuid
eventvisualization: eventvisualizationid, uid, code, created, lastupdated, name, relativeperiodsid, userorganisationunit, userorganisationunitchildren, userorganisationunitgrandchildren, externalaccess, userid, publicaccess, programid, programstageid, startdate, enddate, sortorder, toplimit, outputtype, dataelementvaluedimensionid, attributevaluedimensionid, aggregationtype, collapsedatadimensions, hidenadata, completedonly, description, title, lastupdatedby, subtitle, hidetitle, hidesubtitle, programstatus, eventstatus, favorites, subscribers, timefield, translations, orgunitfield, userorgunittype, sharing, attributevalues, type, showdata, rangeaxismaxvalue, rangeaxisminvalue, rangeaxissteps, rangeaxisdecimals, domainaxislabel, rangeaxislabel, hidelegend, targetlinevalue, targetlinelabel, baselinevalue, baselinelabel, regressiontype, hideemptyrowitems, percentstackedvalues, cumulativevalues, nospacebetweencolumns, datatype, hideemptyrows, digitgroupseparator, displaydensity, fontsize, showhierarchy, rowtotals, coltotals, showdimensionlabels, rowsubtotals, colsubtotals, legacy, simpledimensions, eventrepetitions, legendsetid, legenddisplaystrategy, legenddisplaystyle, legendshowkey, sorting, skiprounding, relativeperiods
eventvisualization_categorydimensions: eventvisualizationid, sort_order, categorydimensionid
eventvisualization_categoryoptiongroupsetdimensions: eventvisualizationid, sort_order, categoryoptiongroupsetdimensionid
eventvisualization_orgunitgroupsetdimensions: eventvisualizationid, sort_order, orgunitgroupsetdimensionid
map: mapid, name, uid, lastupdated, userid, longitude, latitude, zoom, created, publicaccess, code, externalaccess, basemap, description, title, lastupdatedby, favorites, subscribers, translations, sharing, attributevalues
mapview: mapviewid, method, classes, colorlow, colorhigh, radiuslow, radiushigh, uid, lastupdated, layer, legendsetid, opacity, orgunitgroupsetid, arearadius, created, userorganisationunit, userorganisationunitchildren, userorganisationunitgrandchildren, relativeperiodsid, hidden, labels, labelfontsize, labelfontweight, labelfontstyle, labelfontcolor, programid, programstageid, startdate, enddate, eventclustering, eventpointcolor, eventpointradius, colorscale, config, code, description, aggregationtype, eventcoordinatefield, lastupdatedby, styledataitem, trackedentitytypeid, programstatus, followup, organisationunitselectionmode, translations, renderingstrategy, userorgunittype, thematicmaptype, nodatacolor, eventstatus, organisationunitcolor, orgunitfield, labeltemplate, relativeperiods
mapview_categorydimensions: mapviewid, categorydimensionid, sort_order
mapview_categoryoptiongroupsetdimensions: mapviewid, sort_order, categoryoptiongroupsetdimensionid
mapview_orgunitgroupsetdimensions: mapviewid, sort_order, orgunitgroupsetdimensionid
orgunitgroupset: orgunitgroupsetid, name, description, compulsory, exclusive, uid, code, lastupdated, created, datadimension, userid, publicaccess, includesubhierarchyinanalytics, lastupdatedby, translations, attributevalues, sharing, shortname
orgunitgroupsetdimension: orgunitgroupsetdimensionid, orgunitgroupsetid
visualization: visualizationid, uid, name, type, code, title, subtitle, description, created, startdate, enddate, sortorder, toplimit, userid, userorgunittype, publicaccess, displaydensity, fontsize, relativeperiodsid, digitgroupseparator, legendsetid, legenddisplaystyle, legenddisplaystrategy, aggregationtype, regressiontype, targetlinevalue, targetlinelabel, rangeaxislabel, rangeaxismaxvalue, rangeaxissteps, rangeaxisdecimals, rangeaxisminvalue, domainaxislabel, baselinevalue, baselinelabel, numbertype, measurecriteria, hideemptyrowitems, percentstackedvalues, nospacebetweencolumns, regression, externalaccess, userorganisationunit, userorganisationunitchildren, userorganisationunitgrandchildren, paramreportingperiod, paramorganisationunit, paramparentorganisationunit, paramgrandparentorganisationunit, rowtotals, coltotals, cumulative, rowsubtotals, colsubtotals, completedonly, skiprounding, showdimensionlabels, hidetitle, hidesubtitle, hidelegend, hideemptycolumns, hideemptyrows, showhierarchy, showdata, lastupdatedby, lastupdated, favorites, subscribers, translations, series, fontstyle, colorset, sharing, serieskey, axes, outlieranalysis, legendshowkey, fixcolumnheaders, fixrowheaders, attributevalues, icons, relativeperiods
visualization_categorydimensions: visualizationid, categorydimensionid, sort_order
visualization_categoryoptiongroupsetdimensions: visualizationid, sort_order, categoryoptiongroupsetdimensionid
visualization_dataelementgroupsetdimensions: visualizationid, sort_order, dataelementgroupsetdimensionid
visualization_orgunitgroupsetdimensions: visualizationid, sort_order, orgunitgroupsetdimensionid
```

Not in this list (verified missing by direct `information_schema.tables`
lookup): `category` (exists as `dataelementcategory` on 2.40 — expected),
`map_mapviews` (real name is `mapmapviews` — see below),
`mapview_dataelementgroupsetdimensions`,
`eventvisualization_dataelementgroupsetdimensions` (do not exist on 2.40).

Follow-up lookup — the real map/mapview join table:

```
=== sl40: tables matching map/mapview ===
externalmaplayer
map
maplayer
maplegend
maplegendset
mapmapviews
mapview
mapview_attributedimensions
mapview_categorydimensions
mapview_categoryoptiongroupsetdimensions
mapview_columns
mapview_datadimensionitems
mapview_dataelementdimensions
mapview_filters
mapview_itemorgunitgroups
mapview_organisationunits
mapview_orgunitgroupsetdimensions
mapview_orgunitlevels
mapview_periods

=== sl40 mapmapviews columns ===
mapid
mapviewid
sort_order
```

### agent-cdd-sl40 (DHIS2 2.40.12) — eventtype counts

```
DASHBOARD_VIEW|502
DATA_SET_REPORT_VIEW|12
EVENT_CHART_VIEW|60
EVENT_REPORT_VIEW|451
MAP_VIEW|74
PASSIVE_DASHBOARD_VIEW|73
VISUALIZATION_VIEW|1499
```

### agent-cdd-sl43 (DHIS2 2.43.1) — table/column dump

```
category: categoryid, name, uid, code, lastupdated, created, datadimension, userid, publicaccess, datadimensiontype, lastupdatedby, translations, attributevalues, sharing, shortname, description
categorydimension: categorydimensionid, categoryid
categoryoptiongroupset: categoryoptiongroupsetid, uid, code, created, lastupdated, name, description, datadimension, userid, publicaccess, datadimensiontype, lastupdatedby, translations, attributevalues, sharing, shortname
categoryoptiongroupsetdimension: categoryoptiongroupsetdimensionid, categoryoptiongroupsetid
dataelementgroupset: dataelementgroupsetid, name, description, compulsory, uid, code, lastupdated, created, userid, publicaccess, datadimension, lastupdatedby, translations, attributevalues, sharing, shortname
dataelementgroupsetdimension: dataelementgroupsetdimensionid, dataelementgroupsetid
datastatisticsevent: eventid, eventtype, timestamp, username, favoriteuid
eventvisualization: eventvisualizationid, uid, code, created, lastupdated, name, relativeperiodsid, userorganisationunit, userorganisationunitchildren, userorganisationunitgrandchildren, externalaccess, userid, publicaccess, programid, programstageid, startdate, enddate, sortorder, toplimit, outputtype, dataelementvaluedimensionid, attributevaluedimensionid, aggregationtype, collapsedatadimensions, hidenadata, completedonly, description, title, lastupdatedby, subtitle, hidetitle, hidesubtitle, programstatus, eventstatus, favorites, subscribers, timefield, translations, orgunitfield, userorgunittype, sharing, attributevalues, type, showdata, rangeaxismaxvalue, rangeaxisminvalue, rangeaxissteps, rangeaxisdecimals, domainaxislabel, rangeaxislabel, hidelegend, targetlinevalue, targetlinelabel, baselinevalue, baselinelabel, regressiontype, hideemptyrowitems, percentstackedvalues, cumulativevalues, nospacebetweencolumns, datatype, hideemptyrows, digitgroupseparator, displaydensity, fontsize, showhierarchy, rowtotals, coltotals, showdimensionlabels, rowsubtotals, colsubtotals, legacy, simpledimensions, eventrepetitions, legendsetid, legenddisplaystrategy, legenddisplaystyle, legendshowkey, sorting, skiprounding, trackedentitytypeid, relativeperiods, hideemptycolumns, fixcolumnheaders, fixrowheaders
eventvisualization_categorydimensions: eventvisualizationid, sort_order, categorydimensionid
eventvisualization_categoryoptiongroupsetdimensions: eventvisualizationid, sort_order, categoryoptiongroupsetdimensionid
eventvisualization_orgunitgroupsetdimensions: eventvisualizationid, sort_order, orgunitgroupsetdimensionid
map: mapid, name, uid, lastupdated, userid, longitude, latitude, zoom, created, publicaccess, code, externalaccess, basemap, description, title, lastupdatedby, favorites, subscribers, translations, sharing, attributevalues, basemaps
mapview: mapviewid, method, classes, colorlow, colorhigh, radiuslow, radiushigh, uid, lastupdated, layer, legendsetid, opacity, orgunitgroupsetid, arearadius, created, userorganisationunit, userorganisationunitchildren, userorganisationunitgrandchildren, relativeperiodsid, hidden, labels, labelfontsize, labelfontweight, labelfontstyle, labelfontcolor, programid, programstageid, startdate, enddate, eventclustering, eventpointcolor, eventpointradius, colorscale, config, code, description, aggregationtype, eventcoordinatefield, lastupdatedby, styledataitem, trackedentitytypeid, programstatus, followup, organisationunitselectionmode, translations, renderingstrategy, userorgunittype, thematicmaptype, nodatacolor, eventstatus, organisationunitcolor, orgunitfield, labeltemplate, relativeperiods, name, eventcoordinatefieldfallback
mapview_categorydimensions: mapviewid, categorydimensionid, sort_order
mapview_categoryoptiongroupsetdimensions: mapviewid, sort_order, categoryoptiongroupsetdimensionid
mapview_orgunitgroupsetdimensions: mapviewid, sort_order, orgunitgroupsetdimensionid
orgunitgroupset: orgunitgroupsetid, name, description, compulsory, exclusive, uid, code, lastupdated, created, datadimension, userid, publicaccess, includesubhierarchyinanalytics, lastupdatedby, translations, attributevalues, sharing, shortname
orgunitgroupsetdimension: orgunitgroupsetdimensionid, orgunitgroupsetid
visualization: visualizationid, uid, name, type, code, title, subtitle, description, created, startdate, enddate, sortorder, toplimit, userid, userorgunittype, publicaccess, displaydensity, fontsize, relativeperiodsid, digitgroupseparator, legendsetid, legenddisplaystyle, legenddisplaystrategy, aggregationtype, regressiontype, targetlinevalue, targetlinelabel, rangeaxislabel, rangeaxismaxvalue, rangeaxissteps, rangeaxisdecimals, rangeaxisminvalue, domainaxislabel, baselinevalue, baselinelabel, numbertype, measurecriteria, hideemptyrowitems, percentstackedvalues, nospacebetweencolumns, regression, externalaccess, userorganisationunit, userorganisationunitchildren, userorganisationunitgrandchildren, paramreportingperiod, paramorganisationunit, paramparentorganisationunit, paramgrandparentorganisationunit, rowtotals, coltotals, cumulative, rowsubtotals, colsubtotals, completedonly, skiprounding, showdimensionlabels, hidetitle, hidesubtitle, hidelegend, hideemptycolumns, hideemptyrows, showhierarchy, showdata, lastupdatedby, lastupdated, favorites, subscribers, translations, series, fontstyle, colorset, sharing, serieskey, axes, outlieranalysis, legendshowkey, fixcolumnheaders, fixrowheaders, attributevalues, icons, sorting, relativeperiods
visualization_categorydimensions: visualizationid, categorydimensionid, sort_order
visualization_categoryoptiongroupsetdimensions: visualizationid, sort_order, categoryoptiongroupsetdimensionid
visualization_dataelementgroupsetdimensions: visualizationid, sort_order, dataelementgroupsetdimensionid
visualization_orgunitgroupsetdimensions: visualizationid, sort_order, orgunitgroupsetdimensionid
```

Not in this list (verified missing by direct `information_schema.tables`
lookup): `dataelementcategory` (exists as `category` on 2.43 — expected),
`map_mapviews` (real name is `mapmapviews`, same on 2.43),
`mapview_dataelementgroupsetdimensions`,
`eventvisualization_dataelementgroupsetdimensions` (do not exist on 2.43
either).

### agent-cdd-sl43 (DHIS2 2.43.1) — eventtype counts

```
DASHBOARD_VIEW|524
DATA_SET_REPORT_VIEW|12
EVENT_CHART_VIEW|60
EVENT_REPORT_VIEW|451
MAP_VIEW|74
PASSIVE_DASHBOARD_VIEW|123
VISUALIZATION_VIEW|1513
```
