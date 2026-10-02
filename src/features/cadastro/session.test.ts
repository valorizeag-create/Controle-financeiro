import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ jar: [] as { name: string }[], deleted: [] as string[] }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => h.jar, delete: (name: string) => void h.deleted.push(name) }),
}))
const { endLocalSession } = await import('./session')

beforeEach(() => {
  h.deleted = []
  h.jar = [
    { name: 'sb-127-auth-token' }, { name: 'sb-127-auth-token.0' }, { name: 'sb-127-auth-token.1' },
    { name: 'sb-127-auth-token-code-verifier' }, { name: 'iris_flash' }, { name: 'outro' },
  ]
})

test('sai só deste aparelho e apaga os cookies da sessão que tiverem sobrado', async () => {
  const signOut = vi.fn(async () => ({ error: null }))
  await endLocalSession({ auth: { signOut } } as never)
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(h.deleted.sort()).toEqual(['sb-127-auth-token', 'sb-127-auth-token-code-verifier', 'sb-127-auth-token.0', 'sb-127-auth-token.1'])
})

test('nunca lança: o serviço de login recusando (cadastro já excluído) ou fora do ar não prende a pessoa', async () => {
  await expect(endLocalSession({ auth: { signOut: async () => ({ error: { status: 403 } }) } } as never)).resolves.toBeUndefined()
  await expect(endLocalSession({ auth: { signOut: async () => { throw new Error('rede') } } } as never)).resolves.toBeUndefined()
  expect(h.deleted).toHaveLength(8)
})
