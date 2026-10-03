import type { MetadataRoute } from 'next'

export const SEO_TITLE = 'Íris — Veja para onde seu dinheiro vai'
export const SEO_DESCRIPTION = 'App gratuito de finanças pessoais. Anote seus gastos em segundos e entenda seu mês de um jeito simples, visual e sem planilha.'

// Tudo o que exige sessão ou carrega segredo na URL. As páginas públicas (/, /entrar, /criar-cadastro, /termos, /privacidade) ficam de fora.
export const PRIVATE_PREFIXES: readonly string[] = [
  '/inicio', '/extrato', '/anotar', '/contas', '/cartoes', '/metas', '/planejamento', '/relatorios', '/familia', '/categorias',
  '/configuracoes', '/mais', '/boas-vindas', '/convite/', '/nova-senha', '/recuperar-senha', '/confirmar-email', '/cadastro-excluido',
  '/auth/', '/api/',
]

export function robotsFor(siteUrl: string): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] }, sitemap: `${siteUrl}/sitemap.xml` }
}

// Termos e Privacidade só entram quando os textos deixam de ser rascunho.
export function sitemapFor(siteUrl: string, legalReady: boolean): MetadataRoute.Sitemap {
  const legal = legalReady ? [`${siteUrl}/termos`, `${siteUrl}/privacidade`] : []
  return [
    { url: `${siteUrl}/`, changeFrequency: 'monthly', priority: 1 },
    ...legal.map((url) => ({ url, changeFrequency: 'yearly' as const, priority: 0.3 })),
  ]
}
