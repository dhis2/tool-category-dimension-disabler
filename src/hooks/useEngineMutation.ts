import { FetchError, useDataEngine } from '@dhis2/app-runtime'
import { useCallback, useRef, useState } from 'react'

export type MutationState = { loading: boolean; error?: FetchError }

/**
 * Minimal mutation runner on top of the data engine. useDataMutation needs a
 * static mutation object, but our resources vary per call (four endpoints,
 * three view operations), so we call engine.mutate directly and keep the
 * loading/error state ourselves.
 */
export const useEngineMutation = () => {
    const engine = useDataEngine()
    const [state, setState] = useState<MutationState>({ loading: false })
    // Counts calls from this hook instance that are still in flight, so that
    // one call settling doesn't clear `loading` while another - started
    // earlier or later, it doesn't matter - is still pending.
    const pendingCalls = useRef(0)

    const run = useCallback(
        async (
            mutation: Parameters<typeof engine.mutate>[0]
        ): Promise<boolean> => {
            pendingCalls.current += 1
            setState({ loading: true, error: undefined })
            try {
                await engine.mutate(mutation)
                pendingCalls.current -= 1
                setState({ loading: pendingCalls.current > 0 })
                return true
            } catch (error) {
                pendingCalls.current -= 1
                setState({
                    loading: pendingCalls.current > 0,
                    error: error as FetchError,
                })
                return false
            }
        },
        [engine]
    )

    return { run, state }
}
