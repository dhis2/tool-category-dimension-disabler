"""The SQL view as the previous "Category dimension disabler" app installed it.

Used by the outdated-view flow: install this, open the app, and it must offer
to update the view in place (same UID) rather than create a second one.
The definition is the one from the pre-migration app (categories only,
`public: rwrw----`, old name), with the 2.41+ table name.
"""

LEGACY_SQL_QUERY = """  WITH summary as (
SELECT z.uid,z.name,COALESCE(rs.count,0) as count FROM category z
LEFT JOIN (
SELECT y.categoryid, COUNT(*) FROM datastatisticsevent x
INNER JOIN (
SELECT DISTINCT b.categoryid,c.uid
from visualization_categorydimensions a
JOIN categorydimension b on a.categorydimensionid = b.categorydimensionid
JOIN visualization c on a.visualizationid = c.visualizationid
) y on x.favoriteuid = y.uid
WHERE AGE(NOW(),timestamp) < '12 month'::interval
GROUP BY categoryid ) rs on z.categoryid = rs.categoryid
WHERE z.datadimension = TRUE
  ),
  totals as (
    SELECT SUM(count) as total_count from summary
  )
SELECT a.uid,a.name,a.count,
COALESCE(a.count::double precision / NULLIF(b.total_count,0) * 100.0,0) as percent
from summary a
CROSS JOIN totals b
ORDER BY count DESC
"""

LEGACY_SQL_QUERY_40 = LEGACY_SQL_QUERY.replace(
    "FROM category z", "FROM dataelementcategory z"
)

LEGACY_NAME = "Category dimension usage"


def legacy_definition(view_id, minor):
    """The legacy view definition for a server minor version."""
    query = LEGACY_SQL_QUERY_40 if minor < 41 else LEGACY_SQL_QUERY
    return {
        "id": view_id,
        "name": LEGACY_NAME,
        "type": "QUERY",
        "cacheStrategy": "NO_CACHE",
        "sharing": {"public": "rwrw----"},
        "sqlQuery": query,
    }
