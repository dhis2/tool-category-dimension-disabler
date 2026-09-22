import i18n from '@dhis2/d2-i18n'
import { CircularLoader } from '@dhis2/ui'
import React from 'react'
import classes from './App.module.css'
import { Intro } from './components/Intro'
import { SqlViewNotice } from './components/SqlViewNotice'
import { UsageView } from './components/UsageView'
import { useSqlViewMutations } from './hooks/useSqlViewMutations'
import { useSqlViewStatus } from './hooks/useSqlViewStatus'

const App = () => {
    const { status, error, refetch, minor } = useSqlViewStatus()
    const viewMutations = useSqlViewMutations(minor)

    // Refetch the status after every attempt, not only on success: a 409 on
    // create means the view appeared meanwhile (another admin, a second tab),
    // and the refetch then moves straight to OUTDATED/READY. On other errors
    // the refetch is a harmless extra GET and the notice keeps showing
    // viewMutations.state.error, which lives in this component.
    const createView = async () => {
        await viewMutations.create()
        refetch()
    }
    const updateView = async () => {
        await viewMutations.update()
        refetch()
    }

    return (
        <div className={classes.container}>
            <h1>{i18n.t('Data Dimension Disabler')}</h1>
            <Intro />
            {status === 'LOADING' && (
                <div className={classes.loader}>
                    <CircularLoader />
                </div>
            )}
            {(status === 'MISSING' ||
                status === 'OUTDATED' ||
                status === 'ERROR') && (
                <SqlViewNotice
                    status={status}
                    statusError={error}
                    mutation={viewMutations.state}
                    onCreate={createView}
                    onUpdate={updateView}
                    onRetry={() => refetch()}
                />
            )}
            {status === 'READY' && (
                <UsageView minor={minor} onViewRemoved={() => refetch()} />
            )}
        </div>
    )
}

export default App
