// Contas e entradas pessoais primeiro, depois as da família. Cada geração é
// independente: o erro de uma só vai para o log e não impede a outra nem a tela.
export async function ensureOccurrences(supabase: { rpc: (fn: string) => PromiseLike<{ error: unknown }> }): Promise<void> {
  for (const fn of ['generate_occurrences', 'generate_family_occurrences']) {
    try {
      const { error } = await supabase.rpc(fn)
      if (error) console.error(fn, error)
    } catch (e) {
      console.error(fn, e)
    }
  }
}
