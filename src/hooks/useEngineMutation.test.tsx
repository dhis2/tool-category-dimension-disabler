import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { defaultConfig } from '../test-utils/renderWithProvider'
import { useEngineMutation } from './useEngineMutation'

const wrapperWith =
    (data: Record<string, jest.Mock>) =>
    ({ children }: { children: React.ReactNode }) => (
        <Provider
            config={defaultConfig}
            userInfo={undefined}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider data={data} options={{ failOnMiss: true }}>
                {children}
            </CustomDataProvider>
        </Provider>
    )

describe('useEngineMutation', () => {
    it('reports the error and clears loading after a failed call', async () => {
        const categories = jest.fn(() => {
            throw new Error('409 Conflict')
        })
        const { result } = renderHook(() => useEngineMutation(), {
            wrapper: wrapperWith({ categories }),
        })

        await act(async () => {
            await result.current.run({
                resource: 'categories',
                id: 'cat1',
                type: 'json-patch',
                data: [] as unknown as Record<string, unknown>,
            })
        })

        expect(result.current.state.loading).toBe(false)
        expect(result.current.state.error?.message).toContain('409')
    })

    // Regression test for L5: reset() used to be a no-op while a call was
    // still in flight (`pendingCalls.current === 0` guarded the whole
    // update), so a stale error from one call could survive a reset() that
    // happened while a second, overlapping call was still pending.
    it('reset() clears a stale error even while another call is still in flight, without clobbering loading', async () => {
        let rejectFirstCall: ((error: Error) => void) | undefined
        let resolveSecondCall: (() => void) | undefined
        const categories = jest.fn(
            () =>
                new Promise((_resolve, reject) => {
                    rejectFirstCall = reject
                })
        )
        const organisationUnitGroupSets = jest.fn(
            () =>
                new Promise((resolve) => {
                    resolveSecondCall = () => resolve({ status: 'OK' })
                })
        )
        const { result } = renderHook(() => useEngineMutation(), {
            wrapper: wrapperWith({ categories, organisationUnitGroupSets }),
        })

        // Two calls overlap - e.g. one row's slow request is still pending
        // when a second row's is started.
        let firstCallDone: Promise<boolean> = Promise.resolve(false)
        let secondCallDone: Promise<boolean> = Promise.resolve(false)
        act(() => {
            firstCallDone = result.current.run({
                resource: 'categories',
                id: 'cat1',
                type: 'json-patch',
                data: [] as unknown as Record<string, unknown>,
            })
            secondCallDone = result.current.run({
                resource: 'organisationUnitGroupSets',
                id: 'ougs1',
                type: 'json-patch',
                data: [] as unknown as Record<string, unknown>,
            })
        })
        expect(result.current.state.loading).toBe(true)

        // The first call settles with an error while the second is still
        // pending, so its error is the current state - exactly the "stale
        // error from a previous row" the dialog must not keep showing.
        await act(async () => {
            rejectFirstCall?.(new Error('409 Conflict'))
            await firstCallDone
        })
        expect(result.current.state.error?.message).toContain('409')
        expect(result.current.state.loading).toBe(true)

        // Reopening the dialog for yet another row calls reset(): the stale
        // 409 must be cleared even though the second call has not settled.
        act(() => {
            result.current.reset()
        })
        expect(result.current.state.error).toBeUndefined()
        expect(result.current.state.loading).toBe(true)

        await act(async () => {
            resolveSecondCall?.()
            await secondCallDone
        })
        expect(result.current.state.loading).toBe(false)
        expect(result.current.state.error).toBeUndefined()
    })
})
