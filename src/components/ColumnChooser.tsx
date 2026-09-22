import i18n from '@dhis2/d2-i18n'
import { DropdownButton, FlyoutMenu, MenuItem } from '@dhis2/ui'
import React, { useState } from 'react'
import { COLUMN_DEFS, ColumnKey } from './columns'

type Props = {
    visible: ColumnKey[]
    onChange: (visible: ColumnKey[]) => void
}

export const ColumnChooser = ({ visible, onChange }: Props) => {
    const [open, setOpen] = useState(false)

    const toggle = (key: ColumnKey) => {
        const next = visible.includes(key)
            ? visible.filter((k) => k !== key)
            : [...visible, key]
        // keep display order
        onChange(COLUMN_DEFS.map((c) => c.key).filter((k) => next.includes(k)))
    }

    return (
        <DropdownButton
            small
            secondary
            open={open}
            onClick={() => setOpen((current) => !current)}
            dataTest="column-chooser"
            component={
                <FlyoutMenu dense dataTest="column-chooser-menu">
                    {COLUMN_DEFS.map((column) => (
                        <MenuItem
                            key={column.key}
                            dataTest={`column-chooser-${column.key}`}
                            checkbox
                            checked={visible.includes(column.key)}
                            disabled={column.alwaysVisible}
                            label={column.label()}
                            onClick={() => toggle(column.key)}
                        />
                    ))}
                </FlyoutMenu>
            }
        >
            {i18n.t('Columns')}
        </DropdownButton>
    )
}
