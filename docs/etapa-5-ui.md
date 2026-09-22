# Íris — Etapa 5: UI

Status: **APROVADA em 2026-09-22** · Telas: [Proposta visual](https://claude.ai/artifact/L8qNfYaaRz3go5UxbNepcp)

Base visual: manual "Ramtabs Design System" adaptado para a Íris (nome trocado; símbolo do trevo **não** usado). Textos seguem só o documento de copy da Íris (V4).

## Decisões

| ID | Decisão |
|---|---|
| V1 | Manual usado como base visual, com o nome Íris. |
| V2 | Logo provisório: círculo verde com "íris" escura (conceito de enxergar). Substituir quando houver logo definitivo. |
| V3 | Escala para celular: texto 15–16 px, controles 44–52 px. |
| V5 | Gasto em tom neutro; "passou do planejado" em âmbar suave com texto; sem vermelho de alerta (vermelho só para erro de sistema). |
| V6 | Fora: tabela densa, mini-gráficos, busca ⌘K. Cartão desenhado do manual usado nos cartões ilustrativos. |
| V7 | Modo escuro depois da v1. |

## Tokens

| Token | Valor | Uso |
|---|---|---|
| brand | `#A0E870` | Único destaque: Anotar, item ativo, progresso, seleção |
| brand-ink | `#122801` | Texto sobre o verde; números de destaque |
| brand-wash | `#EEF4E9` / borda `#DDF6C9` | Cartão do Disponível, seleção, fundo de ícones de entrada |
| brand-text | `#22500A` / hover `#3F7D1C` | Links, rótulos verdes; entradas `+` em `#3F7D1C` |
| selecionado | borda `#6CBF38` 1.5 px + fundo `#EEF4E9` | Chips e opções marcadas |
| canvas | `#F8F8F8` | Fundo do app |
| card | `#FFFFFF`, borda `#ECECEC`, raio 12, sombra `0 1px 2px rgba(18,40,1,.04)` | Cartões |
| sunken | `#F2F2F2` | Saldo total, trilhos de barra, fundos de ícone, segmentado |
| texto | `#171717` primário · `#3A3A3A` corpo · `#666666` secundário · `#525252` inativo | |
| controle | borda `#E4E4E4`, raio 8–10 | Botões secundários e campos |
| âmbar | fundo `#FFF8E8`, texto `#8A4204`, barra `#F2B54A` | "Passou do planejado" |
| gasto (gráfico) | `#525252` | Barras de categoria |
| scrim | `rgba(18,40,1,.32)` | Atrás de painéis |
| fonte | Geist 400/500/600/700, números tabulares | |
| raios | 8 controles · 10 painéis internos · 12 cartões · 16 destaque/cartão ilustrativo · 20 painel inferior · pill | |
| ícones | Lucide, contorno 1.8 px | |
| movimento | 120 ms cor · 180 ms · 400 ms painel inferior · `cubic-bezier(.2,0,0,1)` | |

## Textos novos aprovados

- "Aqui aparecem só os gastos marcados como da família."
- "O Disponível e as entradas de cada pessoa nunca aparecem aqui."
- "A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão."
- "Como pagou?" · "Outra forma" · "Para onde vai o dinheiro da casa"
