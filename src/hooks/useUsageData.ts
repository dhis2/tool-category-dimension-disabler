import { useDataQuery } from '@dhis2/app-runtime'
import { DimensionTypeKey, isDimensionTypeKey } from '../dimensionTypes'
import { SQL_VIEW_COLUMNS } from '../sql/buildQuery'
import { SQL_VIEW_ID } from '../sql/sqlView'

export type UsageRow = {
    type: DimensionTypeKey
    uid: string
    name: string
    favorites: number
    publicFavorites: number
    sharedFavorites: number
    privateFavorites: number
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

// Column names, in the order buildQuery.ts's SELECT emits them - kept as
// named constants (rather than repeating the string literals below) so a
// column rename in one place can't drift from the other without a compiler
// error.
const [
    TYPE,
    UID,
    NAME,
    FAVORITES,
    PUBLIC,
    SHARED,
    PRIVATE,
    VIEWS,
    PERCENT,
    PERCENT_OF_VIEWS,
] = SQL_VIEW_COLUMNS

/** Map SQL view grid rows to typed rows, looking columns up by header name. */
export const parseUsageRows = (grid: ListGrid | undefined): UsageRow[] => {
    if (!grid) {
        return []
    }
    const index = new Map(grid.headers.map((header, i) => [header.name, i]))
    const column = (
        row: ListGrid['rows'][number],
        name: (typeof SQL_VIEW_COLUMNS)[number]
    ) => row[index.get(name) ?? -1]

    return grid.rows.flatMap((row) => {
        const type = column(row, TYPE)
        if (!isDimensionTypeKey(type)) {
            return []
        }
        return [
            {
                type,
                uid: String(column(row, UID) ?? ''),
                name: String(column(row, NAME) ?? ''),
                favorites: toNumber(column(row, FAVORITES)),
                publicFavorites: toNumber(column(row, PUBLIC)),
                sharedFavorites: toNumber(column(row, SHARED)),
                privateFavorites: toNumber(column(row, PRIVATE)),
                views: toNumber(column(row, VIEWS)),
                percent: toNumber(column(row, PERCENT)),
                percentOfViews: toNumber(column(row, PERCENT_OF_VIEWS)),
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
