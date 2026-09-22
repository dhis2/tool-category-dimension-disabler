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
            ({
                prefix,
                favoriteJoin,
            }) => `      SELECT DISTINCT d.${type.dimensionForeignKey} AS objectid, f.uid AS favoriteuid
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
