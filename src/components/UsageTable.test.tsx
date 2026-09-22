import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { UsageRow } from '../hooks/useUsageData'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { UsageTable } from './UsageTable'

const rows: UsageRow[] = [
    {
        type: 'CATEGORY',
        uid: 'a',
        name: 'Gender',
        views: 5,
        percent: 50,
        percentOfViews: 25,
    },
    {
        type: 'ORGUNIT_GROUP_SET',
        uid: 'b',
        name: 'Facility Type',
        views: 10,
        percent: 40,
        percentOfViews: 20,
    },
    {
        type: 'CATEGORY',
        uid: 'c',
        name: 'Age',
        views: 0,
        percent: 0,
        percentOfViews: 0,
    },
]

const bodyRowNames = () =>
    within(screen.getByTestId('usage-table-body'))
        .getAllByTestId('usage-row')
        .map((row) => within(row).getByTestId('usage-row-name').textContent)

describe('UsageTable', () => {
    it('renders rows sorted by views descending by default with type labels and percentages', () => {
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        expect(bodyRowNames()).toEqual(['Facility Type', 'Gender', 'Age'])
        expect(
            screen.getByText('Organisation unit group set')
        ).toBeInTheDocument()
        expect(screen.getByText('50.0%')).toBeInTheDocument()
    })

    it('filters by type', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        await user.click(
            within(screen.getByTestId('type-filter')).getByTestId(
                'dhis2-uicore-select-input'
            )
        )
        await user.click(
            screen.getByText('Category', {
                selector: '[data-test*="option"] *, [data-test*="option"]',
            })
        )
        expect(bodyRowNames()).toEqual(['Gender', 'Age'])
    })

    it('sorts by name when the header sort icon is clicked', async () => {
        const user = userEvent.setup()
        renderWithProvider(<UsageTable rows={rows} onDisable={jest.fn()} />)
        const nameHeader = screen.getByTestId('usage-header-name')
        await user.click(within(nameHeader).getByRole('button'))
        expect(bodyRowNames()).toEqual(['Age', 'Facility Type', 'Gender'])
        await user.click(within(nameHeader).getByRole('button'))
        expect(bodyRowNames()).toEqual(['Gender', 'Facility Type', 'Age'])
    })

    it('calls onDisable with the row', async () => {
        const user = userEvent.setup()
        const onDisable = jest.fn()
        renderWithProvider(<UsageTable rows={rows} onDisable={onDisable} />)
        const genderRow = screen
            .getAllByTestId('usage-row')
            .find(
                (row) =>
                    within(row).getByTestId('usage-row-name').textContent ===
                    'Gender'
            )
        await user.click(
            within(genderRow as HTMLElement).getByRole('button', {
                name: 'Disable',
            })
        )
        expect(onDisable).toHaveBeenCalledWith(rows[0])
    })

    it('shows an empty state', () => {
        renderWithProvider(<UsageTable rows={[]} onDisable={jest.fn()} />)
        expect(
            screen.getByText('No enabled data dimensions found')
        ).toBeInTheDocument()
    })
})
