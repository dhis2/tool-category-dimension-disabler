import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { renderWithProvider } from '../test-utils/renderWithProvider'
import { RemoveViewDialog } from './RemoveViewDialog'

describe('RemoveViewDialog', () => {
    it('explains the consequence and confirms', async () => {
        const user = userEvent.setup()
        const onConfirm = jest.fn()
        renderWithProvider(
            <RemoveViewDialog
                loading={false}
                onConfirm={onConfirm}
                onCancel={jest.fn()}
            />
        )
        expect(screen.getByText(/Data dimension usage/)).toBeInTheDocument()
        await user.click(
            screen.getByRole('button', { name: 'Remove SQL view' })
        )
        expect(onConfirm).toHaveBeenCalled()
    })
})
