import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.local' })
// Em desenvolvimento o service worker só registra com esta variável. Os testes de "Sem conexão" e de lembretes
// precisam dele; o servidor que o Playwright sobe herda o valor.
process.env.NEXT_PUBLIC_REGISTER_SW ||= '1'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/entrar', reuseExistingServer: true, timeout: 120_000 },
})
