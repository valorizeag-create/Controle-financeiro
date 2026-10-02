import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    // Pausa a agenda (pg_cron) durante os testes e retoma no fim.
    globalSetup: ['tests/db/global-setup.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
