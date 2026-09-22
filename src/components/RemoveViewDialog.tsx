import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React from 'react'
import { SQL_VIEW_NAME } from '../sql/sqlView'
import { ConfirmDialog } from './ConfirmDialog'

type Props = {
    loading: boolean
    error?: FetchError
    onConfirm: () => void
    onCancel: () => void
}

export const RemoveViewDialog = ({
    loading,
    error,
    onConfirm,
    onCancel,
}: Props) => (
    <ConfirmDialog
        dataTest="remove-view-dialog"
        title={i18n.t('Remove the SQL view')}
        body={
            <p>
                {i18n.t(
                    'This deletes the SQL view "{{name}}" that the app installed. The app will offer to recreate it the next time it is opened.',
                    {
                        name: SQL_VIEW_NAME,
                        interpolation: { escapeValue: false },
                    }
                )}
            </p>
        }
        confirmLabel={i18n.t('Remove SQL view')}
        destructive
        loading={loading}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
)
