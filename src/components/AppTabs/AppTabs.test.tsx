import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppTabs } from './AppTabs'

describe('AppTabs', () => {
  it('shows the Creator Fund tab only when the service says the wallet is an admin', () => {
    const { rerender } = render(<AppTabs activeView="map" onViewChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Creator Fund' })).toBeNull()

    rerender(<AppTabs activeView="map" onViewChange={vi.fn()} showCreatorFund />)
    expect(screen.getByRole('button', { name: 'Creator Fund' })).toBeTruthy()
  })
})
