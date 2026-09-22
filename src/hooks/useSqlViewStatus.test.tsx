import { FetchError } from '@dhis2/app-runtime'
import { screen, waitFor } from '@testing-library/react'
import React from 'react'
import { buildQuery } from '../sql/buildQuery'
import { SQL_VIEW_ID } from '../sql/sqlView'
import {
    defaultConfig,
    renderWithProvider,
} from '../test-utils/renderWithProvider'
import { classifyStatus, useSqlViewStatus } from './useSqlViewStatus'

const notFound = () =>
    new FetchError({
        type: 'unknown',
        message: 'not found',
        details: { httpStatusCode: 404, httpStatus: 'Not Found' },
    })

describe('classifyStatus', () => {
    it('is LOADING while the request is in flight', () => {
        expect(classifyStatus({ loading: true, minor: 43 })).toBe('LOADING')
    })
    it('is MISSING on a 404', () => {
        expect(
            classifyStatus({ loading: false, error: notFound(), minor: 43 })
        ).toBe('MISSING')
    })
    it('is ERROR on any other error', () => {
        const forbidden = new FetchError({
            type: 'access',
            message: 'forbidden',
            details: { httpStatusCode: 403 },
        })
        expect(
            classifyStatus({ loading: false, error: forbidden, minor: 43 })
        ).toBe('ERROR')
    })
    it('is READY when the installed query matches this server version', () => {
        expect(
            classifyStatus({
                loading: false,
                sqlQuery: buildQuery(41),
                minor: 41,
            })
        ).toBe('READY')
    })
    it('is OUTDATED when the installed query differs', () => {
        expect(
            classifyStatus({ loading: false, sqlQuery: 'SELECT 1', minor: 41 })
        ).toBe('OUTDATED')
        expect(
            classifyStatus({
                loading: false,
                sqlQuery: buildQuery(40),
                minor: 41,
            })
        ).toBe('OUTDATED')
    })
    it('is ERROR, not OUTDATED against the pre-2.41 schema, when the server version is unknown', () => {
        // A missing minor used to default to 0 (the pre-2.41 schema), which
        // could misclassify a current view as OUTDATED and, on Update,
        // install a view that fails at query time on a modern server.
        expect(
            classifyStatus({
                loading: false,
                sqlQuery: buildQuery(43),
                minor: undefined,
            })
        ).toBe('ERROR')
    })
})

const Probe = () => {
    const { status, minor } = useSqlViewStatus()
    return (
        <span>
            {status}:{minor}
        </span>
    )
}

describe('useSqlViewStatus', () => {
    it('fetches the view by id and reports READY for a current query', async () => {
        // async so the mock's return type matches CustomResourceFactory's
        // Promise<JsonValue | undefined>, per @dhis2/data-engine's CustomDataLink
        const sqlViews = jest.fn(async () => ({
            id: SQL_VIEW_ID,
            sqlQuery: buildQuery(43),
        }))
        renderWithProvider(<Probe />, { sqlViews })
        await waitFor(() =>
            expect(screen.getByText('READY:43')).toBeInTheDocument()
        )
        expect(sqlViews).toHaveBeenCalledWith(
            'read',
            expect.objectContaining({
                resource: 'sqlViews',
                id: SQL_VIEW_ID,
                params: { fields: 'id,sqlQuery' },
            }),
            expect.anything()
        )
    })

    it('reports MISSING on 404', async () => {
        // react-query logs query errors via console.error in non-production
        // builds; a 404 here is an expected outcome for this test, not a bug.
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        renderWithProvider(<Probe />, {
            sqlViews: () => {
                throw notFound()
            },
        })
        await waitFor(() =>
            expect(screen.getByText('MISSING:43')).toBeInTheDocument()
        )
        consoleError.mockRestore()
    })

    it('reports ERROR with a clear message when the server does not supply a version', async () => {
        const sqlViews = jest.fn(async () => ({
            id: SQL_VIEW_ID,
            sqlQuery: buildQuery(43),
        }))
        const ErrorProbe = () => {
            const { status, error } = useSqlViewStatus()
            return (
                <span>
                    {status}:{error?.message}
                </span>
            )
        }
        renderWithProvider(
            <ErrorProbe />,
            { sqlViews },
            { ...defaultConfig, serverVersion: undefined }
        )
        await waitFor(() =>
            expect(
                screen.getByText(
                    'ERROR:Could not determine the DHIS2 server version, so the SQL view cannot be checked.'
                )
            ).toBeInTheDocument()
        )
    })
})
