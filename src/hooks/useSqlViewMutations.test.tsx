import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { buildSqlViewDefinition, SQL_VIEW_ID } from '../sql/sqlView'
import { defaultConfig } from '../test-utils/renderWithProvider'
import { useSqlViewMutations } from './useSqlViewMutations'

const wrapperWith =
    (sqlViews: jest.Mock) =>
    ({ children }: { children: React.ReactNode }) => (
        <Provider
            config={defaultConfig}
            userInfo={undefined}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider
                data={{ sqlViews }}
                options={{ failOnMiss: true }}
            >
                {children}
            </CustomDataProvider>
        </Provider>
    )

describe('useSqlViewMutations', () => {
    it('creates the view with a POST of the full definition', async () => {
        const sqlViews = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useSqlViewMutations(43), {
            wrapper: wrapperWith(sqlViews),
        })
        let ok = false
        await act(async () => {
            ok = await result.current.create()
        })
        expect(ok).toBe(true)
        expect(sqlViews).toHaveBeenCalledWith(
            'create',
            expect.objectContaining({
                resource: 'sqlViews',
                data: buildSqlViewDefinition(43),
            }),
            expect.anything()
        )
        expect(result.current.state.error).toBeUndefined()
    })

    it('updates the view with a PUT (replace) by id', async () => {
        const sqlViews = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useSqlViewMutations(40), {
            wrapper: wrapperWith(sqlViews),
        })
        await act(async () => {
            await result.current.update()
        })
        expect(sqlViews).toHaveBeenCalledWith(
            'replace',
            expect.objectContaining({
                resource: 'sqlViews',
                id: SQL_VIEW_ID,
                data: buildSqlViewDefinition(40),
            }),
            expect.anything()
        )
    })

    it('removes the view with a DELETE by id', async () => {
        const sqlViews = jest.fn(() => ({ status: 'OK' }))
        const { result } = renderHook(() => useSqlViewMutations(43), {
            wrapper: wrapperWith(sqlViews),
        })
        await act(async () => {
            await result.current.remove()
        })
        expect(sqlViews).toHaveBeenCalledWith(
            'delete',
            expect.objectContaining({ resource: 'sqlViews', id: SQL_VIEW_ID }),
            expect.anything()
        )
    })

    it('reports failures through state.error and resolves false', async () => {
        const sqlViews = jest.fn(() => {
            throw new Error('403 Forbidden')
        })
        const { result } = renderHook(() => useSqlViewMutations(43), {
            wrapper: wrapperWith(sqlViews),
        })
        let ok = true
        await act(async () => {
            ok = await result.current.create()
        })
        expect(ok).toBe(false)
        expect(result.current.state.error?.message).toContain('403')
        expect(result.current.state.loading).toBe(false)
    })
})
