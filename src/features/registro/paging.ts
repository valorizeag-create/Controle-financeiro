export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    out.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return out
}
