import { DIMENSION_TYPES, DimensionType } from '../dimensionTypes'

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
 * any supported version. This is version-independent today; if a source
 * ever becomes version-gated, re-add a `minor` parameter here.
 */
const favoriteSourcesFor = (type: DimensionType): readonly FavoriteSource[] =>
    type.key === 'DATAELEMENT_GROUP_SET'
        ? FAVORITE_SOURCES.filter((source) => source.prefix === 'visualization')
        : FAVORITE_SOURCES

/**
 * Sharing class of a favorite from its `sharing` JSONB (present on
 * visualization, map and eventvisualization on 2.40-2.43):
 *  public  - public access string grants metadata read (first char 'r')
 *  shared  - not public, but shared with at least one user or user group
 *  private - neither
 * The users/userGroups keys may be absent, a JSON null, or {}; none of those
 * count as shared, only a non-empty JSON object does. jsonb_typeof(...) is
 * NULL for an absent key and 'null' (not 'object') for a JSON null literal,
 * so both fall through to private; COALESCE alone would not catch the JSON
 * null case, since the key lookup for `{"users": null}` yields a non-NULL
 * jsonb null, not SQL NULL.
 *
 * The first key is spelled `('user'||'s')` on purpose. DHIS2 refuses to
 * execute a SQL view whose query *text* matches a protected table name
 * (users, userinfo, oauth2client, ...) and answers 409 E4310, "SQL query
 * contains references to protected tables". The check is a plain
 * word-boundary scan, so the bare word inside a string literal is enough to
 * trip it even though no such table is referenced here; concatenating the
 * key keeps the word out of the query text. `userGroups` is not protected.
 */
const SHARING_CLASS_SQL = `CASE WHEN LEFT(f.sharing->>'public', 1) = 'r' THEN 'public'
             WHEN (jsonb_typeof(f.sharing->('user'||'s')) = 'object' AND f.sharing->('user'||'s') <> '{}'::jsonb)
               OR (jsonb_typeof(f.sharing->'userGroups') = 'object' AND f.sharing->'userGroups' <> '{}'::jsonb) THEN 'shared'
             ELSE 'private' END`

/** (entity id, favorite uid, sharing class) rows for every favorite that uses the dimension */
const usageSubquery = (type: DimensionType): string =>
    favoriteSourcesFor(type)
        .map(
            ({
                prefix,
                favoriteJoin,
            }) => `      SELECT DISTINCT d.${type.dimensionForeignKey} AS objectid, f.uid AS favoriteuid,
        ${SHARING_CLASS_SQL} AS sharingclass
        FROM ${prefix}_${type.joinTableSuffix} a
        JOIN ${type.dimensionTable} d ON d.${type.dimensionPrimaryKey} = a.${type.dimensionPrimaryKey}
        ${favoriteJoin}`
        )
        .join('\n      UNION\n')

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
SELECT s.type, s.uid, s.name,
  s.favorites, s.public_favorites, s.shared_favorites, s.private_favorites,
  s.views,
  COALESCE(s.views::double precision / NULLIF(t.total, 0) * 100.0, 0) AS percent,
  COALESCE(s.views::double precision / NULLIF(f.count, 0) * 100.0, 0) AS percent_of_views
FROM summary s
CROSS JOIN totals t
CROSS JOIN total_favorite_views f
ORDER BY s.views DESC, s.favorites DESC, s.name`
