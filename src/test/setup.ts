import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Without vitest globals, @testing-library/react cannot auto-register its cleanup hook
afterEach(() => {
  cleanup()
})
