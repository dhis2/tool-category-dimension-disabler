import { useCallback } from 'react'
import { buildSqlViewDefinition, SQL_VIEW_ID } from '../sql/sqlView'
import { useEngineMutation } from './useEngineMutation'

export const useSqlViewMutations = (minor: number) => {
    const { run, state, reset } = useEngineMutation()

    const create = useCallback(
        () =>
            run({
                resource: 'sqlViews',
                type: 'create',
                data: buildSqlViewDefinition(minor),
            }),
        [run, minor]
    )

    // 'replace' is PUT: the whole definition, including the new name and sharing.
    const update = useCallback(
        () =>
            run({
                resource: 'sqlViews',
                id: SQL_VIEW_ID,
                type: 'replace',
                data: buildSqlViewDefinition(minor),
            }),
        [run, minor]
    )

    const remove = useCallback(
        () => run({ resource: 'sqlViews', id: SQL_VIEW_ID, type: 'delete' }),
        [run]
    )

    return { create, update, remove, state, reset }
}
