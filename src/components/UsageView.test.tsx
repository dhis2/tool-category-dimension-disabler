import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { SQL_VIEW_ID } from '../sql/sqlView'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { UsageView } from './UsageView'

const grid = {
    headers: [
        'type',
        'uid',
        'name',
        'views',
        'percent',
        'percent_of_views',
    ].map((name) => ({ name })),
    rows: [
        ['CATEGORY', 'cat1', 'Gender', 4, 100, 50],
        ['DATAELEMENT_GROUP_SET', 'degs1', 'Diseases', 0, 0, 0],
    ],
}

describe('UsageView', () => {
    it('loads rows, disables one after confirmation, shows an alert and refetches', async () => {
        const user = userEvent.setup()
        let calls = 0
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: jest.fn(async () => {
                calls += 1
                return calls === 1
                    ? { listGrid: grid }
                    : { listGrid: { ...grid, rows: [grid.rows[0]] } }
            }),
            dataElementGroupSets: jest.fn(async () => ({ status: 'OK' })),
            sqlViews: jest.fn(async () => ({ status: 'OK' })),
        }
        renderWithProvider(
            <UsageView minor={43} onViewRemoved={jest.fn()} />,
            data
        )

        await screen.findByText('Diseases')
        const diseasesRow = screen
            .getAllByTestId('usage-row')
            .find(
                (row) =>
                    within(row).getByTestId('usage-row-name').textContent ===
                    'Diseases'
            )
        await user.click(
            within(diseasesRow as HTMLElement).getByRole('button', {
                name: 'Disable',
            })
        )
        await user.click(
            within(screen.getByTestId('disable-dialog')).getByRole('button', {
                name: 'Disable',
            })
        )

        await waitFor(() =>
            expect(
                screen.queryByTestId('disable-dialog')
            ).not.toBeInTheDocument()
        )
        expect(data.dataElementGroupSets).toHaveBeenCalledWith(
            'json-patch',
            expect.objectContaining({ id: 'degs1' }),
            expect.anything()
        )
        await waitFor(() =>
            expect(screen.queryByText('Diseases')).not.toBeInTheDocument()
        )
        expect(
            screen.getByText('"Diseases" is no longer a data dimension')
        ).toBeInTheDocument()
    })

    it('removes the view after confirmation and notifies the parent', async () => {
        const user = userEvent.setup()
        const onViewRemoved = jest.fn()
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: async () => ({ listGrid: grid }),
            sqlViews: jest.fn(async () => ({ status: 'OK' })),
        }
        renderWithProvider(
            <UsageView minor={43} onViewRemoved={onViewRemoved} />,
            data
        )
        await screen.findByText('Gender')
        await user.click(
            screen.getByRole('button', { name: 'Remove SQL view' })
        )
        await user.click(
            within(screen.getByTestId('remove-view-dialog')).getByRole(
                'button',
                { name: 'Remove SQL view' }
            )
        )
        await waitFor(() => expect(onViewRemoved).toHaveBeenCalled())
        expect(data.sqlViews).toHaveBeenCalledWith(
            'delete',
            expect.objectContaining({ id: SQL_VIEW_ID }),
            expect.anything()
        )
    })

    it('shows a data error with retry and keeps the remove button available', async () => {
        // react-query logs the query error via console.error in non-production
        // builds; it is an expected outcome here, not a bug.
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: async () => {
                throw new Error('relation "orgunitgroupset" does not exist')
            },
        }
        renderWithProvider(
            <UsageView minor={43} onViewRemoved={jest.fn()} />,
            data
        )
        expect(await screen.findByText(/does not exist/)).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Retry' })
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Remove SQL view' })
        ).toBeInTheDocument()
        consoleError.mockRestore()
    })

    it('clears a stale mutation error when the dialog is reopened for another row', async () => {
        const user = userEvent.setup()
        const categories = jest.fn(() => {
            throw new Error('409 Conflict')
        })
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: async () => ({ listGrid: grid }),
            categories,
        }
        renderWithProvider(
            <UsageView minor={43} onViewRemoved={jest.fn()} />,
            data
        )

        await screen.findByText('Gender')
        const genderRow = screen
            .getAllByTestId('usage-row')
            .find(
                (row) =>
                    within(row).getByTestId('usage-row-name').textContent ===
                    'Gender'
            )
        await user.click(
            within(genderRow as HTMLElement).getByRole('button', {
                name: 'Disable',
            })
        )
        await user.click(
            within(screen.getByTestId('disable-dialog')).getByRole('button', {
                name: 'Disable',
            })
        )

        const dialog = await screen.findByTestId('disable-dialog')
        expect(within(dialog).getByText(/409 Conflict/)).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByTestId('disable-dialog')).not.toBeInTheDocument()

        const diseasesRow = screen
            .getAllByTestId('usage-row')
            .find(
                (row) =>
                    within(row).getByTestId('usage-row-name').textContent ===
                    'Diseases'
            )
        await user.click(
            within(diseasesRow as HTMLElement).getByRole('button', {
                name: 'Disable',
            })
        )

        const reopenedDialog = await screen.findByTestId('disable-dialog')
        expect(
            within(reopenedDialog).queryByText(/409 Conflict/)
        ).not.toBeInTheDocument()
    })
})
