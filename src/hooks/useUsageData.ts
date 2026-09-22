import { useDataQuery } from '@dhis2/app-runtime'
import { DimensionTypeKey, isDimensionTypeKey } from '../dimensionTypes'
import { SQL_VIEW_ID } from '../sql/sqlView'

export type UsageRow = {
    type: DimensionTypeKey
    uid: string
    name: string
    views: number
    percent: number
    percentOfViews: number
}

export type ListGrid = {
    headers: { name: string }[]
    rows: (string | number | null)[][]
}

type QueryResult = { usage: { listGrid?: ListGrid } }

const query = {
    usage: {
        resource: `sqlViews/${SQL_VIEW_ID}/data`,
        // The endpoint paginates by default (50 rows); we want the full ranking.
        params: { paging: false },
    },
}

const toNumber = (value: string | number | null | undefined): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

/** Map SQL view grid rows to typed rows, looking columns up by header name. */
export const parseUsageRows = (grid: ListGrid | undefined): UsageRow[] => {
    if (!grid) {
        return []
    }
    const index = new Map(grid.headers.map((header, i) => [header.name, i]))
    const column = (row: ListGrid['rows'][number], name: string) =>
        row[index.get(name) ?? -1]

    return grid.rows.flatMap((row) => {
        const type = column(row, 'type')
        if (!isDimensionTypeKey(type)) {
            return []
        }
        return [
            {
                type,
                uid: String(column(row, 'uid') ?? ''),
                name: String(column(row, 'name') ?? ''),
                views: toNumber(column(row, 'views')),
                percent: toNumber(column(row, 'percent')),
                percentOfViews: toNumber(column(row, 'percent_of_views')),
            },
        ]
    })
}

export const useUsageData = () => {
    const { loading, error, data, refetch } = useDataQuery<QueryResult>(query)
    return {
        rows: parseUsageRows(data?.usage?.listGrid),
        loading,
        error,
        refetch,
    }
}
