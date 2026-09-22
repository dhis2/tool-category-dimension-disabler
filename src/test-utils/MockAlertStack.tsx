import { useAlerts } from '@dhis2/app-runtime'
import React from 'react'

// Renders alerts raised with useAlert() so tests can assert on their text.
// The alert's id is exposed as `data-alert-id` (not just used as the React
// key) so a test can tell a freshly allocated alert apart from the same
// alert's message being overwritten in place - the distinction M1's fix
// depends on.
export const MockAlertStack = () => {
    const alerts = useAlerts()
    return (
        <div data-test="mock-alert-stack">
            {alerts.map((alert) => (
                <div key={alert.id} data-alert-id={alert.id}>
                    {alert.message}
                </div>
            ))}
        </div>
    )
}
