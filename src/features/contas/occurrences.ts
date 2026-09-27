export async function ensureOccurrences(supabase: { rpc: (fn: string) => PromiseLike<{ error: unknown }> }): Promise<void> {
  try {
    const { error } = await supabase.rpc('generate_occurrences')
    if (error) console.error('generate_occurrences', error)
  } catch (e) {
    console.error('generate_occurrences', e)
  }
}
