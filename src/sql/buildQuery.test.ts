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
        expect(sql.match(/UNION ALL/g)).toHaveLength(
            DIMENSION_TYPE_KEYS.length - 1
        )
    })

    it('joins all three favorite kinds for categories and org unit / category option group sets', () => {
        const sql = buildQuery(43)
        expect(sql).toContain('FROM visualization_categorydimensions a')
        expect(sql).toContain('FROM mapview_categorydimensions a')
        expect(sql).toContain('FROM eventvisualization_categorydimensions a')
        expect(sql).toContain('FROM visualization_orgunitgroupsetdimensions a')
        expect(sql).toContain('FROM mapview_orgunitgroupsetdimensions a')
        expect(sql).toContain(
            'FROM eventvisualization_orgunitgroupsetdimensions a'
        )
        expect(sql).toContain(
            'FROM visualization_categoryoptiongroupsetdimensions a'
        )
        expect(sql).toContain('FROM mapview_categoryoptiongroupsetdimensions a')
        expect(sql).toContain(
            'FROM eventvisualization_categoryoptiongroupsetdimensions a'
        )
    })

    it('joins data element group sets to visualizations only (no map view / event visualization join tables exist)', () => {
        for (const minor of [40, 43]) {
            const sql = buildQuery(minor)
            expect(sql).toContain(
                'FROM visualization_dataelementgroupsetdimensions a'
            )
            expect(sql).not.toContain('mapview_dataelementgroupsetdimensions')
            expect(sql).not.toContain(
                'eventvisualization_dataelementgroupsetdimensions'
            )
        }
    })

    it('counts map views against the map uid, not the map view uid', () => {
        const sql = buildQuery(43)
        expect(sql).toContain(
            'JOIN mapmapviews mm ON mm.mapviewid = a.mapviewid'
        )
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

    it('classifies each favorite as public, shared or private from its sharing JSON', () => {
        const sql = buildQuery(43)
        // one classification per favorite kind (visualization, map, eventvisualization)
        expect(
            sql.match(
                /CASE WHEN LEFT\(f\.sharing->>'public', 1\) = 'r' THEN 'public'/g
            )?.length
        ).toBe(
            // 3 kinds for CATEGORY, ORGUNIT_GROUP_SET, CATEGORYOPTION_GROUP_SET + 1 for DATAELEMENT_GROUP_SET
            3 * 3 + 1
        )
        expect(sql).toContain(
            "jsonb_typeof(f.sharing->'users') = 'object' AND f.sharing->'users' <> '{}'::jsonb"
        )
        expect(sql).toContain(
            "jsonb_typeof(f.sharing->'userGroups') = 'object' AND f.sharing->'userGroups' <> '{}'::jsonb"
        )
    })

    it('counts favorites once per dimension and splits them by sharing class', () => {
        const sql = buildQuery(43)
        expect(
            sql.match(/COUNT\(DISTINCT y\.favoriteuid\) AS favorites/g)
        ).toHaveLength(4)
        expect(
            sql.match(
                /COUNT\(DISTINCT y\.favoriteuid\) FILTER \(WHERE y\.sharingclass = 'public'\) AS public_favorites/g
            )
        ).toHaveLength(4)
        expect(
            sql.match(
                /FILTER \(WHERE y\.sharingclass = 'shared'\) AS shared_favorites/g
            )
        ).toHaveLength(4)
        expect(
            sql.match(
                /FILTER \(WHERE y\.sharingclass = 'private'\) AS private_favorites/g
            )
        ).toHaveLength(4)
    })

    it('selects the documented output columns in order', () => {
        const sql = buildQuery(43)
        const selectLine = sql.slice(sql.lastIndexOf('SELECT s.type'))
        expect(SQL_VIEW_COLUMNS).toEqual([
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
        ])
        expect(selectLine).toMatch(
            /SELECT s\.type, s\.uid, s\.name,\s+s\.favorites, s\.public_favorites, s\.shared_favorites, s\.private_favorites,\s+s\.views,[\s\S]*AS percent,[\s\S]*AS percent_of_views/
        )
    })

    it('contains no statement terminator (DHIS2 rejects it)', () => {
        expect(buildQuery(43)).not.toContain(';')
    })
})
