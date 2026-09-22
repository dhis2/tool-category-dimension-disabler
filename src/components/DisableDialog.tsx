import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React from 'react'
import { getDimensionType } from '../dimensionTypes'
import { UsageRow } from '../hooks/useUsageData'
import { ConfirmDialog } from './ConfirmDialog'

type Props = {
    row: UsageRow
    loading: boolean
    error?: FetchError
    onConfirm: () => void
    onCancel: () => void
}

export const DisableDialog = ({
    row,
    loading,
    error,
    onConfirm,
    onCancel,
}: Props) => (
    <ConfirmDialog
        dataTest="disable-dialog"
        title={i18n.t('Disable data dimension')}
        body={
            <>
                <p>
                    {i18n.t(
                        'Disable the {{type}} "{{name}}" as a data dimension?',
                        {
                            type: getDimensionType(row.type)
                                .getLabel()
                                .toLowerCase(),
                            name: row.name,
                            interpolation: { escapeValue: false },
                        }
                    )}
                </p>
                <p>
                    {i18n.t(
                        'Favorites that use this dimension will stop working until it is re-enabled in the Maintenance app. Analytics tables shrink at the next analytics run.'
                    )}
                </p>
            </>
        }
        confirmLabel={i18n.t('Disable')}
        destructive
        loading={loading}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
)
