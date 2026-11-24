import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const envVariables = loadEnv(mode, process.cwd())

  return {
    plugins: [react()],
    define: {
      'process.env': {
        VITE_REACT_APP_DCL_DEFAULT_ENV: envVariables.VITE_REACT_APP_DCL_DEFAULT_ENV,
      }
    },
    ...(command === 'build' ? { base: envVariables.VITE_BASE_URL } : undefined),
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8' as const,
        // Scoped to the feature-flags code so the 80% threshold is enforceable
        // without failing on the untested legacy codebase
        include: ['src/features/flags/**/*.{ts,tsx}', 'src/pages/FeatureFlagsPage.tsx'],
        thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
      }
    },
  }
})
