import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import { render } from '@testing-library/react'
import React from 'react'
import { MockAlertStack } from './MockAlertStack'

type CustomData = React.ComponentProps<typeof CustomDataProvider>['data']

export type ProviderConfig = {
    baseUrl: string
    apiVersion: number
    serverVersion?: {
        major: number
        minor: number
        patch?: number
        full: string
    }
}

export const defaultConfig: ProviderConfig = {
    baseUrl: 'http://localhost:8080',
    apiVersion: 43,
    serverVersion: { major: 2, minor: 43, patch: 0, full: '2.43.0' },
}

export const renderWithProvider = (
    ui: React.ReactElement,
    data: CustomData = {},
    config: ProviderConfig = defaultConfig
) =>
    render(
        <Provider
            config={config}
            userInfo={undefined}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider data={data} options={{ failOnMiss: true }}>
                {ui}
                <MockAlertStack />
            </CustomDataProvider>
        </Provider>
    )
