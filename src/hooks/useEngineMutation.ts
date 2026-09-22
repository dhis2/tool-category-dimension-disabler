import { FetchError, useDataEngine } from '@dhis2/app-runtime'
import { useCallback, useState } from 'react'

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

    const run = useCallback(
        async (
            mutation: Parameters<typeof engine.mutate>[0]
        ): Promise<boolean> => {
            setState({ loading: true, error: undefined })
            try {
                await engine.mutate(mutation)
                setState({ loading: false })
                return true
            } catch (error) {
                setState({ loading: false, error: error as FetchError })
                return false
            }
        },
        [engine]
    )

    return { run, state }
}
