# Íris — Etapa 7: Roteiro de desenvolvimento

Status: **proposto, aguardando aprovação** · Base: [requisitos](etapa-2-requisitos.md) · [arquitetura](etapa-3-arquitetura.md) · [UI](etapa-5-ui.md) · [protótipo](https://claude.ai/artifact/6WwTy3f8GoUcuXYigncNLd)

O produto é grande demais para um único plano. Ele foi dividido em **10 planos**, cada um entregando software que funciona e pode ser testado sozinho. Só o Plano 1 está detalhado agora; cada plano seguinte será escrito e aprovado por você antes de começar, já com o que aprendemos no anterior.

| # | Plano | Entrega | Requisitos |
|---|---|---|---|
| **1** | **Fundação e núcleo individual** | Criar cadastro (e-mail e Google), entrar, anotar gasto e entrada, ver o Seu mês com números corretos | RF-01–04, 10–13 (parcial), 31–33 (parcial), RN-01–06, RNF-01–11 base |
| 2 | Extrato, onboarding e ajustes básicos | Extrato com busca e filtros, editar e excluir; onboarding completo; saldo inicial e perfil; categorias próprias | RF-05–09 (menos instalar), 13, 19–21, 36–37, 51 |
| 3 | Contas e recorrências | Contas a pagar e a receber, mensais e anuais, marcar como paga, "Disponível depois das contas" | RF-15–18, RN-10–12, A1 |
| 4 | Parcelas e cartões | Parcelado, quitar e devolver; cartões ilustrativos, atalhos no Anotar, total por cartão | RF-14, 58–61, RN-07–09, 29–32 |
| 5 | Metas | Criar, guardar, tirar, usar o dinheiro, sobra, meta concluída | RF-25–30, RN-13–16 |
| 6 | Planejamento e relatórios | Planejado por categoria, estados, relatórios e comparações | RF-22–24, 38–40 |
| 7 | Família | Criar, convidar, gastos e contas comuns, metas da família, saída e transferência | RF-41–45, RN-17–26 |
| 8 | PWA e notificações | Instalar, push, e-mails (convites, resumo), tarefas agendadas | RF-07–08, 46–50, RNF-03 |
| 9 | Seus dados e lançamento | Exportar CSV, excluir cadastro, termos e privacidade, Supabase Pro, domínio | RF-52–54, RNF-07 |
| 10 | Landing e desktop completo | Landing (seções 1–9 da copy) e as demais telas desktop | RF-55–57, RNF-02 |

As telas que ainda não foram desenhadas (landing, desktop das telas secundárias, criar meta, guardar/tirar, criar conta recorrente, convidar, categorias) serão desenhadas **no início do plano que as implementa**, no mesmo visual aprovado, e passam pela sua aprovação antes do código.

## Como cada plano é executado

1. Eu escrevo o plano detalhado → você aprova.
2. Implementação tarefa a tarefa, com teste antes do código.
3. Revisão de código ao fim do plano.
4. Você testa a versão e aprova (Etapa 8 acontece dentro de cada plano, e de novo no fim).
