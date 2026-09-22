import { FetchError, useConfig, useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
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

// The platform normally fills serverVersion in, so this is a defensive
// fallback rather than a case seen in practice. A missing minor version
// used to default to 0, i.e. the pre-2.41 schema; that made the app
// misclassify a correct view as OUTDATED on a modern server and, if the
// user pressed Update, install a view that fails at query time.
const unknownServerVersionError = (): FetchError =>
    new FetchError({
        type: 'unknown',
        message: i18n.t(
            'Could not determine the DHIS2 server version, so the SQL view cannot be checked.'
        ),
    })

export const classifyStatus = ({
    loading,
    error,
    sqlQuery,
    minor,
}: {
    loading: boolean
    error?: FetchError
    sqlQuery?: string
    /** undefined means the server version isn't known - never defaulted */
    minor?: number
}): SqlViewStatus => {
    if (loading) {
        return 'LOADING'
    }
    if (error) {
        return isNotFound(error) ? 'MISSING' : 'ERROR'
    }
    if (minor === undefined) {
        return 'ERROR'
    }
    return isCurrentSqlQuery(sqlQuery, minor) ? 'READY' : 'OUTDATED'
}

export const useSqlViewStatus = () => {
    const { serverVersion } = useConfig()
    const minor = serverVersion?.minor
    const { loading, error, data, refetch } = useDataQuery<QueryResult>(query)
    const status = classifyStatus({
        loading,
        error,
        sqlQuery: data?.sqlView?.sqlQuery,
        minor,
    })

    return {
        status,
        error:
            error ??
            (status === 'ERROR' && minor === undefined
                ? unknownServerVersionError()
                : undefined),
        refetch,
        // Only consumed to build a query (READY/OUTDATED, and MISSING's
        // "Create SQL view") once the real minor is known - if it weren't,
        // status is ERROR and neither of those is reachable, so callers
        // never see `undefined` in practice.
        minor,
    }
}
