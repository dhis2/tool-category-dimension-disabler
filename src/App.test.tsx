import { screen } from '@testing-library/react'
import React from 'react'
import App from './App'
import { renderWithProvider } from './test-utils/renderWithProvider'

it('renders the app title', () => {
    renderWithProvider(<App />)
    expect(screen.getByText('Data Dimension Disabler')).toBeInTheDocument()
})
