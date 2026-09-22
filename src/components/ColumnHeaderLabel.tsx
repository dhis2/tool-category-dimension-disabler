import { IconInfo16, Tooltip } from '@dhis2/ui'
import React from 'react'
import classes from './ColumnHeaderLabel.module.css'
import { ColumnDef } from './columns'

export const ColumnHeaderLabel = ({ column }: { column: ColumnDef }) => (
    <span className={classes.label}>
        {column.label()}
        {column.description && (
            <Tooltip content={column.description()} maxWidth={320}>
                <span
                    className={classes.icon}
                    data-test={`column-info-${column.key}`}
                    aria-label={column.description()}
                >
                    <IconInfo16 />
                </span>
            </Tooltip>
        )}
    </span>
)
