import { FetchError, useConfig, useDataQuery } from '@dhis2/app-runtime'
import { isCurrentSqlQuery, SQL_VIEW_ID } from '../sql/sqlView'

export type SqlViewStatus =
    'LOADING' | 'MISSING' | 'OUTDATED' | 'READY' | 'ERROR'

type QueryResult = {
    sqlView: { id: string; sqlQuery?: string }
}

const query = {
    sqlView: {
        resource: 'sqlViews',
        id: SQL_VIEW_ID,
        params: { fields: 'id,sqlQuery' },
    },
}

const isNotFound = (error: FetchError): boolean =>
    error.details?.httpStatusCode === 404

export const classifyStatus = ({
    loading,
    error,
    sqlQuery,
    minor,
}: {
    loading: boolean
    error?: FetchError
    sqlQuery?: string
    minor: number
}): SqlViewStatus => {
    if (loading) {
        return 'LOADING'
    }
    if (error) {
        return isNotFound(error) ? 'MISSING' : 'ERROR'
    }
    return isCurrentSqlQuery(sqlQuery, minor) ? 'READY' : 'OUTDATED'
}

export const useSqlViewStatus = () => {
    const { serverVersion } = useConfig()
    const minor = serverVersion?.minor ?? 0
    const { loading, error, data, refetch } = useDataQuery<QueryResult>(query)

    return {
        status: classifyStatus({
            loading,
            error,
            sqlQuery: data?.sqlView?.sqlQuery,
            minor,
        }),
        error,
        refetch,
        minor,
    }
}
