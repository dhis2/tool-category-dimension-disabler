import { useAlerts } from '@dhis2/app-runtime'
import React from 'react'

// Renders alerts raised with useAlert() so tests can assert on their text.
export const MockAlertStack = () => {
    const alerts = useAlerts()
    return (
        <div data-test="mock-alert-stack">
            {alerts.map((alert) => (
                <div key={alert.id}>{alert.message}</div>
            ))}
        </div>
    )
}
