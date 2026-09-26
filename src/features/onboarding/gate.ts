// Quem ainda não concluiu o onboarding (cadastro novo ou quem fechou o app no
// meio) volta a ele. Sem perfil legível (erro momentâneo), não redireciona:
// evita um vai e vem entre /inicio e /boas-vindas.
export function needsOnboarding(profile: { onboarded_at: string | null } | null): boolean {
  return profile !== null && profile.onboarded_at === null
}
