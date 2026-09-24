import { FetchError } from '@dhis2/app-runtime'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import App from './App'
import { buildQuery } from './sql/buildQuery'
import { buildSqlViewDefinition, SQL_VIEW_ID } from './sql/sqlView'
import { renderWithProvider } from './test-utils/renderWithProvider'

describe('App', () => {
    it('shows the create notice when the view is missing, creates it, then shows the table', async () => {
        // react-query logs the initial 404 via console.error in non-production
        // builds; it is an expected outcome here, not a bug.
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const user = userEvent.setup()
        let created = false
        const data = {
            sqlViews: jest.fn(
                async (
                    type: string
                ): Promise<
                    { status: string } | { id: string; sqlQuery: string }
                > => {
                    if (type === 'create') {
                        created = true
                        return { status: 'OK' }
                    }
                    if (!created) {
                        throw new FetchError({
                            type: 'unknown',
                            message: 'nf',
                            details: { httpStatusCode: 404 },
                        })
                    }
                    return { id: SQL_VIEW_ID, sqlQuery: buildQuery(43) }
                }
            ),
            [`sqlViews/${SQL_VIEW_ID}/data`]: async () => ({
                listGrid: {
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
                        ['CATEGORY', 'cat1', 'Gender', 1, 0, 1, 0, 1, 100, 100],
                    ],
                },
            }),
        }
        renderWithProvider(<App />, data)
        await screen.findByText('SQL view not installed')
        await user.click(
            screen.getByRole('button', { name: 'Create SQL view' })
        )
        expect(await screen.findByText('Gender')).toBeInTheDocument()
        expect(data.sqlViews).toHaveBeenCalledWith(
            'create',
            expect.objectContaining({ data: buildSqlViewDefinition(43) }),
            expect.anything()
        )
        consoleError.mockRestore()
    })

    it('shows the update notice for an outdated view', async () => {
        renderWithProvider(<App />, {
            sqlViews: async () => ({ id: SQL_VIEW_ID, sqlQuery: 'SELECT 1' }),
        })
        expect(
            await screen.findByText('SQL view needs an update')
        ).toBeInTheDocument()
        expect(screen.getByText('About this tool')).toBeInTheDocument()
    })
})
