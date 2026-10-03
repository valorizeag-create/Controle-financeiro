// Formato do código que o Supabase põe no link (com ou sem o prefixo "pkce_"). É segredo de uso único.
export const TOKEN_HASH = /^[A-Za-z0-9_-]{16,128}$/
