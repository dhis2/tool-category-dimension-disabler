import { DIMENSION_TYPE_KEYS, DimensionTypeKey } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'
import type { ColumnKey } from './columns'

export type SortColumn = ColumnKey
export type SortDirection = 'asc' | 'desc'
export type TypeFilterValue = 'ALL' | DimensionTypeKey

const compareText = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })

const compare = (a: UsageRow, b: UsageRow, column: SortColumn): number => {
    switch (column) {
        case 'type':
            return (
                DIMENSION_TYPE_KEYS.indexOf(a.type) -
                DIMENSION_TYPE_KEYS.indexOf(b.type)
            )
        case 'name':
        case 'uid':
            return compareText(a[column], b[column])
        default:
            return a[column] - b[column]
    }
}

export const sortRows = (
    rows: UsageRow[],
    column: SortColumn,
    direction: SortDirection
): UsageRow[] => {
    const sign = direction === 'asc' ? 1 : -1
    return [...rows].sort(
        (a, b) => sign * compare(a, b, column) || compareText(a.name, b.name)
    )
}

export const filterRows = (
    rows: UsageRow[],
    filter: TypeFilterValue
): UsageRow[] =>
    filter === 'ALL' ? rows : rows.filter((row) => row.type === filter)

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`
