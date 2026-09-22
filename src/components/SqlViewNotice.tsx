import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import { Button, NoticeBox } from '@dhis2/ui'
import React from 'react'
import { MutationState } from '../hooks/useEngineMutation'
import { SQL_VIEW_NAME } from '../sql/sqlView'
import { errorMessage } from './ConfirmDialog'

type Props = {
    status: 'MISSING' | 'OUTDATED' | 'ERROR'
    statusError?: FetchError
    mutation: MutationState
    onCreate: () => void
    onUpdate: () => void
    onRetry: () => void
}

const isForbidden = (error: FetchError) => error.details?.httpStatusCode === 403

const MutationError = ({ error }: { error: FetchError }) => (
    <div style={{ marginTop: 'var(--spacers-dp12)' }}>
        <NoticeBox
            error
            title={i18n.t('The request failed')}
            dataTest="sql-view-mutation-error"
        >
            {errorMessage(error)}
            {isForbidden(error) && (
                <>
                    {' '}
                    {i18n.t(
                        'Your user needs the "Add/Update SQL view" authority (or the Superuser role) to install the view.'
                    )}
                </>
            )}
        </NoticeBox>
    </div>
)

export const SqlViewNotice = ({
    status,
    statusError,
    mutation,
    onCreate,
    onUpdate,
    onRetry,
}: Props) => {
    if (status === 'ERROR') {
        return (
            <NoticeBox error title={i18n.t('Could not check the SQL view')}>
                <p>
                    {statusError
                        ? errorMessage(statusError)
                        : i18n.t('Unknown error')}
                </p>
                <Button small onClick={onRetry}>
                    {i18n.t('Retry')}
                </Button>
            </NoticeBox>
        )
    }

    if (status === 'MISSING') {
        return (
            <NoticeBox warning title={i18n.t('SQL view not installed')}>
                <p>
                    {i18n.t(
                        'The tool needs an SQL view named "{{name}}" to count how often favorites use each dimension. Creating it requires the "Add/Update SQL view" authority. The view is public read-only and can be removed from this app at any time.',
                        {
                            name: SQL_VIEW_NAME,
                            interpolation: { escapeValue: false },
                        }
                    )}
                </p>
                <Button
                    primary
                    small
                    onClick={onCreate}
                    loading={mutation.loading}
                    disabled={mutation.loading}
                >
                    {i18n.t('Create SQL view')}
                </Button>
                {mutation.error && <MutationError error={mutation.error} />}
            </NoticeBox>
        )
    }

    return (
        <NoticeBox title={i18n.t('SQL view needs an update')}>
            <p>
                {i18n.t(
                    'An older version of the SQL view is installed (for example from the Category dimension disabler, or for a different DHIS2 version). Update it to include group sets and the current server version.'
                )}
            </p>
            <Button
                primary
                small
                onClick={onUpdate}
                loading={mutation.loading}
                disabled={mutation.loading}
            >
                {i18n.t('Update SQL view')}
            </Button>
            {mutation.error && <MutationError error={mutation.error} />}
        </NoticeBox>
    )
}
