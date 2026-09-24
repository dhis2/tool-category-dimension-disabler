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
        'favorites',
        'public_favorites',
        'shared_favorites',
        'private_favorites',
        'views',
        'percent',
        'percent_of_views',
    ].map((name) => ({ name })),
    rows: [
        ['CATEGORY', 'cat1', 'Gender', 2, 1, 1, 0, 4, 100, 50],
        ['DATAELEMENT_GROUP_SET', 'degs1', 'Diseases', 0, 0, 0, 0, 0, 0, 0],
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

    it('shows a fresh success alert for each of two disables done in quick succession', async () => {
        // Regression test for M1: useAlert() keeps the id of the alert it
        // last raised in a ref and reuses it while that alert is still on
        // screen. In the real app that means the second AlertBar is never
        // remounted, so it inherits the first alert's almost-expired
        // auto-hide timer and disappears immediately - but MockAlertStack
        // has no timer at all, so that part of the bug can't be observed
        // through it: with or without the fix, only the latest message is
        // present after the second disable (the fix's hide() call removes
        // the first entry; the bug's id reuse just overwrites it in place).
        // What MockAlertStack *can* show is the mechanism: whether the
        // second alert got a fresh id (fixed) or reused the first one
        // (buggy, and the actual root cause of the disappearing toast). So
        // this test checks both: the second message is shown, and its
        // `data-alert-id` differs from the first alert's - i.e. it is a new
        // alert, not the first one silently overwritten.
        const user = userEvent.setup()
        const threeRowGrid = {
            ...grid,
            rows: [
                ...grid.rows,
                [
                    'ORGUNIT_GROUP_SET',
                    'ougs1',
                    'Facility Type',
                    1,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                ],
            ],
        }
        let calls = 0
        const data = {
            [`sqlViews/${SQL_VIEW_ID}/data`]: jest.fn(async () => {
                calls += 1
                if (calls === 1) {
                    return { listGrid: threeRowGrid }
                }
                if (calls === 2) {
                    return {
                        listGrid: {
                            ...threeRowGrid,
                            rows: threeRowGrid.rows.filter(
                                (row) => row[2] !== 'Diseases'
                            ),
                        },
                    }
                }
                return {
                    listGrid: {
                        ...threeRowGrid,
                        rows: threeRowGrid.rows.filter(
                            (row) => row[2] === 'Facility Type'
                        ),
                    },
                }
            }),
            dataElementGroupSets: jest.fn(async () => ({ status: 'OK' })),
            categories: jest.fn(async () => ({ status: 'OK' })),
        }
        renderWithProvider(
            <UsageView minor={43} onViewRemoved={jest.fn()} />,
            data
        )

        const disableRow = async (name: string) => {
            await screen.findByText(name)
            const row = screen
                .getAllByTestId('usage-row')
                .find(
                    (candidate) =>
                        within(candidate).getByTestId('usage-row-name')
                            .textContent === name
                )
            await user.click(
                within(row as HTMLElement).getByRole('button', {
                    name: 'Disable',
                })
            )
            await user.click(
                within(screen.getByTestId('disable-dialog')).getByRole(
                    'button',
                    { name: 'Disable' }
                )
            )
            await waitFor(() =>
                expect(
                    screen.queryByTestId('disable-dialog')
                ).not.toBeInTheDocument()
            )
        }

        await disableRow('Diseases')
        const firstAlert = screen.getByText(
            '"Diseases" is no longer a data dimension'
        )
        const firstAlertId = firstAlert.getAttribute('data-alert-id')

        await disableRow('Gender')
        const secondAlert = await screen.findByText(
            '"Gender" is no longer a data dimension'
        )
        const secondAlertId = secondAlert.getAttribute('data-alert-id')

        // The fix removes the previous alert before raising the new one, so
        // the first message does not linger once the second has been shown...
        expect(
            screen.queryByText('"Diseases" is no longer a data dimension')
        ).not.toBeInTheDocument()
        // ...and, crucially, the second alert is a genuinely new one, not
        // the first alert's id reused with an overwritten message (the bug).
        expect(secondAlertId).not.toBeNull()
        expect(secondAlertId).not.toBe(firstAlertId)
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
