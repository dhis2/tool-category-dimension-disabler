import { useAlert } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import { Button, CircularLoader, NoticeBox } from '@dhis2/ui'
import React, { useState } from 'react'
import { useDisableDimension } from '../hooks/useDisableDimension'
import { useSqlViewMutations } from '../hooks/useSqlViewMutations'
import { UsageRow, useUsageData } from '../hooks/useUsageData'
import { errorMessage } from './ConfirmDialog'
import { DisableDialog } from './DisableDialog'
import { RemoveViewDialog } from './RemoveViewDialog'
import { UsageTable } from './UsageTable'
import classes from './UsageView.module.css'

type Props = {
    minor: number
    onViewRemoved: () => void
}

export const UsageView = ({ minor, onViewRemoved }: Props) => {
    const { rows, loading, error, refetch } = useUsageData()
    const [rowToDisable, setRowToDisable] = useState<UsageRow | null>(null)
    const [confirmRemove, setConfirmRemove] = useState(false)
    const disableMutation = useDisableDimension()
    const viewMutations = useSqlViewMutations(minor)
    const { show: showDisabled, hide: hideDisabled } = useAlert(
        ({ name }: { name: string }) =>
            i18n.t('"{{name}}" is no longer a data dimension', {
                name,
                interpolation: { escapeValue: false },
            }),
        { success: true }
    )

    // Reset the mutation's error/loading state whenever a dialog is opened
    // or dismissed, so a failure from a previous row/attempt doesn't linger
    // and show up again when the dialog is reopened for something else.
    const openDisableDialog = (row: UsageRow) => {
        disableMutation.reset()
        setRowToDisable(row)
    }

    const cancelDisableDialog = () => {
        disableMutation.reset()
        setRowToDisable(null)
    }

    const openRemoveDialog = () => {
        viewMutations.reset()
        setConfirmRemove(true)
    }

    const cancelRemoveDialog = () => {
        viewMutations.reset()
        setConfirmRemove(false)
    }

    const confirmDisable = async () => {
        if (!rowToDisable) {
            return
        }
        const ok = await disableMutation.disable(rowToDisable)
        if (ok) {
            // useAlert keeps the id of the alert it last raised in a ref and
            // reuses it while that alert is still on screen, so a second
            // show() in quick succession would silently replace the first
            // message instead of raising a new one (and inherit its
            // almost-expired auto-hide timer). hide() removes the current
            // alert and clears the ref, so the next show() always allocates
            // a fresh id.
            hideDisabled()
            showDisabled({ name: rowToDisable.name })
            setRowToDisable(null)
            refetch()
        }
    }

    const confirmRemoveView = async () => {
        const ok = await viewMutations.remove()
        if (ok) {
            setConfirmRemove(false)
            onViewRemoved()
        }
    }

    return (
        <div>
            {loading && (
                <div className={classes.loader}>
                    <CircularLoader />
                </div>
            )}
            {error && (
                <NoticeBox
                    error
                    title={i18n.t('Could not load dimension usage')}
                >
                    <p>{errorMessage(error)}</p>
                    <p>
                        {i18n.t(
                            'If the view exists but fails on this server version, remove it below and let the app recreate it.'
                        )}
                    </p>
                    <Button small onClick={() => refetch()}>
                        {i18n.t('Retry')}
                    </Button>
                </NoticeBox>
            )}
            {!loading && !error && (
                <UsageTable rows={rows} onDisable={openDisableDialog} />
            )}

            <div className={classes.footer}>
                <Button secondary small onClick={openRemoveDialog}>
                    {i18n.t('Remove SQL view')}
                </Button>
            </div>

            {rowToDisable && (
                <DisableDialog
                    row={rowToDisable}
                    loading={disableMutation.state.loading}
                    error={disableMutation.state.error}
                    onConfirm={confirmDisable}
                    onCancel={cancelDisableDialog}
                />
            )}
            {confirmRemove && (
                <RemoveViewDialog
                    loading={viewMutations.state.loading}
                    error={viewMutations.state.error}
                    onConfirm={confirmRemoveView}
                    onCancel={cancelRemoveDialog}
                />
            )}
        </div>
    )
}
