import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { ColumnChooser } from './ColumnChooser'

describe('ColumnChooser', () => {
    it('lists every column, disables the always-visible ones and toggles the rest', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()
        renderWithProvider(
            <ColumnChooser
                visible={['type', 'name', 'uid', 'views']}
                onChange={onChange}
            />
        )
        await user.click(screen.getByRole('button', { name: /Columns/ }))
        const menu = screen.getByTestId('column-chooser-menu')
        expect(within(menu).getAllByRole('menuitemcheckbox')).toHaveLength(10)
        const typeItem = within(menu).getByRole('menuitemcheckbox', {
            name: /Type/,
        })
        expect(typeItem).toHaveAttribute('aria-checked', 'true')
        expect(typeItem).toHaveAttribute('aria-disabled', 'true')

        await user.click(
            within(menu).getByRole('menuitemcheckbox', { name: /Public/ })
        )
        expect(onChange).toHaveBeenLastCalledWith([
            'type',
            'name',
            'uid',
            'publicFavorites',
            'views',
        ])

        await user.click(
            within(menu).getByRole('menuitemcheckbox', { name: /UID/ })
        )
        expect(onChange).toHaveBeenLastCalledWith(['type', 'name', 'views'])
    })
})
