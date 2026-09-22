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
        { name: 'favorites' },
        { name: 'public_favorites' },
        { name: 'shared_favorites' },
        { name: 'private_favorites' },
        { name: 'views' },
        { name: 'percent' },
        { name: 'percent_of_views' },
    ],
    rows: [
        ['CATEGORY', 'cX5k9anHEHd', 'Gender', 7, 4, 2, 1, 12, 60.0, 30.0],
        [
            'ORGUNIT_GROUP_SET',
            'J5jldMd8OHv',
            'Facility Type',
            '3',
            '3',
            '0',
            '0',
            '8',
            '40',
            '20',
        ],
    ],
}

describe('parseUsageRows', () => {
    it('maps columns by header name and coerces numbers', () => {
        expect(parseUsageRows(grid)).toEqual([
            {
                type: 'CATEGORY',
                uid: 'cX5k9anHEHd',
                name: 'Gender',
                favorites: 7,
                publicFavorites: 4,
                sharedFavorites: 2,
                privateFavorites: 1,
                views: 12,
                percent: 60,
                percentOfViews: 30,
            },
            {
                type: 'ORGUNIT_GROUP_SET',
                uid: 'J5jldMd8OHv',
                name: 'Facility Type',
                favorites: 3,
                publicFavorites: 3,
                sharedFavorites: 0,
                privateFavorites: 0,
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
            rows: [...grid.rows, ['PROGRAM', 'x', 'y', 1, 1, 1, 1, 1, 1, 1]],
        }
        expect(parseUsageRows(withJunk)).toHaveLength(2)
        expect(parseUsageRows(undefined)).toEqual([])
        expect(parseUsageRows({ headers: grid.headers, rows: [] })).toEqual([])
    })

    it('defaults the favorite counts to 0 when the view predates them', () => {
        const legacy = {
            headers: [
                'type',
                'uid',
                'name',
                'views',
                'percent',
                'percent_of_views',
            ].map((name) => ({ name })),
            rows: [['CATEGORY', 'a', 'Age', 1, 1, 1]],
        }
        expect(parseUsageRows(legacy)[0]).toMatchObject({
            favorites: 0,
            publicFavorites: 0,
            sharedFavorites: 0,
            privateFavorites: 0,
        })
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
        const handler = jest.fn(async () => ({ listGrid: grid }))
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
