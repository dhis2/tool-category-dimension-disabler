import i18n from '@dhis2/d2-i18n'
import {
    Button,
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
} from '@dhis2/ui'
import React, { useState } from 'react'
import { getDimensionType } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'
import { TypeFilter } from './TypeFilter'
import classes from './UsageTable.module.css'
import {
    filterRows,
    formatPercent,
    SortColumn,
    SortDirection,
    sortRows,
    TypeFilterValue,
} from './usageTableUtils'

type Props = {
    rows: UsageRow[]
    onDisable: (row: UsageRow) => void
}

// Mirrors @dhis2/ui's DataTableSortDirection, which is not re-exported as a type
type HeaderSortDirection = 'asc' | 'desc' | 'default'

type ColumnDef = {
    column: SortColumn
    label: () => string
    align?: 'left' | 'right'
}

const COLUMNS: ColumnDef[] = [
    { column: 'type', label: () => i18n.t('Type') },
    { column: 'name', label: () => i18n.t('Name') },
    { column: 'uid', label: () => i18n.t('UID') },
    {
        column: 'views',
        label: () => i18n.t('Views (12 months)'),
        align: 'right',
    },
    {
        column: 'percent',
        label: () => i18n.t('% of dimension views'),
        align: 'right',
    },
    {
        column: 'percentOfViews',
        label: () => i18n.t('% of favorite views'),
        align: 'right',
    },
]

export const UsageTable = ({ rows, onDisable }: Props) => {
    const [filter, setFilter] = useState<TypeFilterValue>('ALL')
    const [sort, setSort] = useState<{
        column: SortColumn
        direction: SortDirection
    }>({
        column: 'views',
        direction: 'desc',
    })

    const visibleRows = sortRows(
        filterRows(rows, filter),
        sort.column,
        sort.direction
    )

    const sortDirectionFor = (column: SortColumn): HeaderSortDirection =>
        sort.column === column ? sort.direction : 'default'

    const toggleSort = (column: SortColumn) =>
        setSort((current) => ({
            column,
            direction:
                current.column === column && current.direction === 'asc'
                    ? 'desc'
                    : 'asc',
        }))

    const countLabel =
        visibleRows.length === 1
            ? i18n.t('1 enabled dimension')
            : i18n.t('{{n}} enabled dimensions', {
                  n: visibleRows.length,
              })

    return (
        <div>
            <div className={classes.toolbar}>
                <TypeFilter value={filter} onChange={setFilter} />
                <span className={classes.count} data-test="usage-count">
                    {countLabel}
                </span>
            </div>
            <DataTable dataTest="usage-table">
                <DataTableHead>
                    <DataTableRow>
                        {COLUMNS.map(({ column, label, align }) => (
                            <DataTableColumnHeader
                                key={column}
                                dataTest={`usage-header-${column}`}
                                align={align}
                                name={column}
                                sortDirection={sortDirectionFor(column)}
                                sortIconTitle={i18n.t('Sort by {{column}}', {
                                    column: label(),
                                })}
                                onSortIconClick={() => toggleSort(column)}
                            >
                                {label()}
                            </DataTableColumnHeader>
                        ))}
                        <DataTableColumnHeader>
                            {i18n.t('Action')}
                        </DataTableColumnHeader>
                    </DataTableRow>
                </DataTableHead>
                <DataTableBody dataTest="usage-table-body">
                    {visibleRows.length === 0 && (
                        <DataTableRow>
                            <DataTableCell
                                colSpan={String(COLUMNS.length + 1)}
                                align="center"
                            >
                                {i18n.t('No enabled data dimensions found')}
                            </DataTableCell>
                        </DataTableRow>
                    )}
                    {visibleRows.map((row) => (
                        <DataTableRow
                            key={`${row.type}-${row.uid}`}
                            dataTest="usage-row"
                        >
                            <DataTableCell>
                                {getDimensionType(row.type).getLabel()}
                            </DataTableCell>
                            <DataTableCell dataTest="usage-row-name">
                                {row.name}
                            </DataTableCell>
                            <DataTableCell className={classes.uid}>
                                {row.uid}
                            </DataTableCell>
                            <DataTableCell
                                align="right"
                                className={classes.number}
                            >
                                {row.views}
                            </DataTableCell>
                            <DataTableCell
                                align="right"
                                className={classes.number}
                            >
                                {formatPercent(row.percent)}
                            </DataTableCell>
                            <DataTableCell
                                align="right"
                                className={classes.number}
                            >
                                {formatPercent(row.percentOfViews)}
                            </DataTableCell>
                            <DataTableCell>
                                <Button
                                    small
                                    destructive
                                    secondary
                                    onClick={() => onDisable(row)}
                                >
                                    {i18n.t('Disable')}
                                </Button>
                            </DataTableCell>
                        </DataTableRow>
                    ))}
                </DataTableBody>
            </DataTable>
        </div>
    )
}
