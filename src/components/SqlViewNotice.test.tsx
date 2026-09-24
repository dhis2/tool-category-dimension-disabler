import { FetchError } from '@dhis2/app-runtime'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { SqlViewNotice } from './SqlViewNotice'

const idle = { loading: false }
const noop = jest.fn()

describe('SqlViewNotice', () => {
    it('offers to create a missing view', async () => {
        const user = userEvent.setup()
        const onCreate = jest.fn()
        renderWithProvider(
            <SqlViewNotice
                status="MISSING"
                mutation={idle}
                onCreate={onCreate}
                onUpdate={noop}
                onRetry={noop}
            />
        )
        expect(screen.getByText(/needs an SQL view/)).toBeInTheDocument()
        await user.click(
            screen.getByRole('button', { name: 'Create SQL view' })
        )
        expect(onCreate).toHaveBeenCalled()
    })

    it('offers to update an outdated view', async () => {
        const user = userEvent.setup()
        const onUpdate = jest.fn()
        renderWithProvider(
            <SqlViewNotice
                status="OUTDATED"
                mutation={idle}
                onCreate={noop}
                onUpdate={onUpdate}
                onRetry={noop}
            />
        )
        expect(screen.getByText(/older version/)).toBeInTheDocument()
        await user.click(
            screen.getByRole('button', { name: 'Update SQL view' })
        )
        expect(onUpdate).toHaveBeenCalled()
    })

    it('shows the status error with a retry button', async () => {
        const user = userEvent.setup()
        const onRetry = jest.fn()
        const statusError = new FetchError({
            type: 'network',
            message: 'Failed to fetch',
        })
        renderWithProvider(
            <SqlViewNotice
                status="ERROR"
                statusError={statusError}
                mutation={idle}
                onCreate={noop}
                onUpdate={noop}
                onRetry={onRetry}
            />
        )
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Retry' }))
        expect(onRetry).toHaveBeenCalled()
    })

    it('shows a mutation error and names the authority on 403', () => {
        const error = new FetchError({
            type: 'access',
            message: 'forbidden',
            details: { httpStatusCode: 403, message: 'Access denied' },
        })
        renderWithProvider(
            <SqlViewNotice
                status="MISSING"
                mutation={{ loading: false, error }}
                onCreate={noop}
                onUpdate={noop}
                onRetry={noop}
            />
        )
        const mutationError = within(
            screen.getByTestId('sql-view-mutation-error')
        )
        expect(mutationError.getByText(/Access denied/)).toBeInTheDocument()
        expect(
            mutationError.getByText(/Add\/Update SQL view/)
        ).toBeInTheDocument()
    })
})
