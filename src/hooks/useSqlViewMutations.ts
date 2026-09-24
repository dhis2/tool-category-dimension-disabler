import { FetchError } from '@dhis2/app-runtime'
import { useCallback } from 'react'
import { buildSqlViewDefinition, SQL_VIEW_ID } from '../sql/sqlView'
import { useEngineMutation } from './useEngineMutation'

// `minor` is undefined only while the server version isn't known, which
// classifies the status as ERROR (see useSqlViewStatus) - a state in which
// the UI never offers a create/update action. This guard exists so the
// types (and this hook, in isolation) are correct regardless.
const unknownServerVersionError = (): FetchError =>
    new FetchError({ type: 'unknown', message: 'Server version unknown' })

export const useSqlViewMutations = (minor: number | undefined) => {
    const { run, state, reset, fail } = useEngineMutation()

    const create = useCallback(
        () =>
            minor === undefined
                ? Promise.resolve(fail(unknownServerVersionError()))
                : run({
                      resource: 'sqlViews',
                      type: 'create',
                      data: buildSqlViewDefinition(minor),
                  }),
        [run, fail, minor]
    )

    // 'replace' is PUT: the whole definition, including the new name and sharing.
    const update = useCallback(
        () =>
            minor === undefined
                ? Promise.resolve(fail(unknownServerVersionError()))
                : run({
                      resource: 'sqlViews',
                      id: SQL_VIEW_ID,
                      type: 'replace',
                      data: buildSqlViewDefinition(minor),
                  }),
        [run, fail, minor]
    )

    const remove = useCallback(
        () => run({ resource: 'sqlViews', id: SQL_VIEW_ID, type: 'delete' }),
        [run]
    )

    return { create, update, remove, state, reset }
}
