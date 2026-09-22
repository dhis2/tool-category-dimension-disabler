import { useCallback } from 'react'
import { getDimensionType } from '../dimensionTypes'
import { useEngineMutation } from './useEngineMutation'
import type { UsageRow } from './useUsageData'

const DISABLE_PATCH = [{ op: 'add', path: '/dataDimension', value: false }]

export const useDisableDimension = () => {
    const { run, state } = useEngineMutation()

    const disable = useCallback(
        (row: UsageRow) =>
            run({
                resource: getDimensionType(row.type).endpoint,
                id: row.uid,
                type: 'json-patch',
                // The engine types `data` as an object; JSON Patch is an array.
                data: DISABLE_PATCH as unknown as Record<string, unknown>,
            }),
        [run]
    )

    return { disable, state }
}
