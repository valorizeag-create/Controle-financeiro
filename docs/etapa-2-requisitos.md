# Íris — Etapa 2: Requisitos

Status: **APROVADO em 2026-09-22** · Versão 5 (inclui a mudança M1 — cartões ilustrativos, aprovada depois) · Base: respostas da Etapa 1 + [Documento-base de comunicação](https://claude.ai/artifact/GjLmkNKXindMZcm1z49gLq) (referência oficial de copy).

Itens marcados com **[PENDENTE]** dependem de decisão ainda não tomada.

---

## 1. Visão em uma frase

Web app gratuito (PWA, sem lojas) que mostra para onde o dinheiro de uma pessoa vai, com registro manual em segundos e uma área opcional de família para os gastos comuns.

## 1.1 Terminologia fixa

| Termo | Significa | Nunca usar para |
|---|---|---|
| **cadastro** | O acesso do usuário: "Criar meu cadastro", "Entrar", "Excluir meu cadastro" | — |
| **conta** | Somente conta a pagar (boleto, luz, aluguel) | Acesso do usuário ou conta bancária |
| **Disponível** | Número do mês (RN-01) | Saldo acumulado |
| **Saldo total** | Número acumulado de todo o histórico (RN-04) | — |
| **Guardado** | Dinheiro em metas | — |

---

## 2. Regras de negócio (os números)

### Mês e saldo
| ID | Regra |
|---|---|
| RN-01 | **Disponível do mês** = entradas recebidas no mês − gastos do mês pagos com dinheiro do mês − valores guardados em metas no mês + valores retirados de metas no mês. No dashboard: **Entrou − Saiu − Guardado este mês = Disponível**. A terceira linha só aparece quando há valor e troca de nome conforme o líquido do mês (guardado − retirado): positivo → "Guardado este mês: {valor}" (sai do Disponível); negativo → "Tirado das metas: {valor}" (volta para o Disponível). Nenhum rótulo mostra valor negativo. |
| RN-01a | Gastos pagos com meta ficam **fora do "Saiu"** e aparecem no extrato e nas categorias com a etiqueta "pago com a meta {meta}". |
| RN-01b | Texto de ajuda do Disponível (substitui o da copy): "O que entrou, menos o que saiu e o que você guardou neste mês." |
| RN-02 | O Disponível **não herda** sobra do mês anterior. A sobra só aparece no Saldo total. |
| RN-03 | **Disponível depois das contas** = Disponível do mês − contas "a pagar" do mês ainda não pagas. |
| RN-04 | **Saldo total** = saldo inicial + todas as entradas recebidas − todos os gastos registrados (histórico inteiro). |
| RN-05 | O Saldo total exibe a linha **Guardado**. Guardar e retirar não alteram o Saldo total; só mudam quanto dele está guardado. |

### Gastos, cartão e parcelas
| ID | Regra |
|---|---|
| RN-06 | Gasto no cartão à vista conta no **mês da compra**. |
| RN-07 | Gasto parcelado: o usuário registra o total e o nº de parcelas. O app cria uma parcela por mês, **a 1ª no mês da compra**. |
| RN-08 | **Quitação antecipada**: as parcelas futuras são canceladas e o valor quitado entra como um gasto único no mês do pagamento. |
| RN-09 | **Devolução**: as parcelas futuras são canceladas; as já contadas permanecem. |

### Recorrências
| ID | Regra |
|---|---|
| RN-10 | Recorrências podem ser **mensais** ou **anuais**. |
| RN-11 | Conta recorrente: o app cria cada ocorrência como **a pagar**. Só sai do Disponível quando é marcada como **paga**. |
| RN-12 | Entrada recorrente: o app cria cada ocorrência como **a receber**. Só entra no Disponível quando o usuário confirma. Dinheiro que não chegou não conta. |

### Metas
| ID | Regra |
|---|---|
| RN-13 | Guardar numa meta tira o valor do Disponível do mês e soma em Guardado. |
| RN-14 | Retirar de uma meta devolve o valor ao **Disponível do mês atual** e subtrai de Guardado. |
| RN-15 | **Usar o dinheiro da meta** registra o gasto (com categoria) e zera o Guardado daquela meta. Esse gasto **não sai do Disponível**, porque o dinheiro já saiu quando foi guardado; ele reduz apenas o Saldo total. |
| RN-15a | Gasto **maior** que o guardado: a diferença sai do Disponível do mês de quem registrou o uso. |
| RN-15b | Gasto **menor** que o guardado: a sobra continua na meta. A Íris pergunta "Sobraram {valor} na meta. Quer devolver para o seu mês?" com os botões "Devolver" e "Deixar guardado". O padrão é deixar guardado. |
| RN-16 | Excluir uma meta mantém o valor guardado no histórico. |

### Privacidade e família
| ID | Regra |
|---|---|
| RN-17 | Todo registro pertence a quem o registrou e é **privado por padrão**. |
| RN-18 | Gasto marcado **"da família"** sai do Disponível de quem registrou e aparece somado no espaço da família. Não existe caixa da família. |
| RN-19 | A família só tem **gastos** comuns na v1. Entradas são sempre individuais. |
| RN-20 | Conta recorrente da família: qualquer membro pode marcar como paga; o valor sai do Disponível de quem marcou. |
| RN-21 | Gasto da família pode ser editado ou excluído por quem registrou e pelo administrador. |
| RN-22 | Meta da família: aportes de cada membro saem do Disponível de quem guardou. Metas individuais são privadas. |
| RN-22a | Meta da família — **retirar**: cada membro retira só o que ele mesmo guardou; o valor volta ao Disponível dele. |
| RN-22b | Meta da família — **usar**: só o administrador. Se o gasto passar do guardado, a diferença sai do Disponível de quem registrou o uso. |
| RN-22c | Uso de meta da família: o gasto é repartido entre os membros **na proporção do que cada um guardou** (reduz o Saldo total de cada um nessa proporção). No espaço da família aparece como uma compra só. A sobra fica na meta na mesma proporção, e cada um pode retirar a própria parte (RN-22a). |
| RN-22d | Membro que **sai da família**: sua parte nas metas da família volta para o Disponível dele no mês da saída. A família recebe: "{nome} saiu da família, e {valor} da meta {meta} voltaram para {nome}." |
| RN-22e | Membro que **exclui o cadastro**: sua parte sai das metas da família, e o guardado da família diminui (gastos são histórico e ficam como "Ex-membro"; guardado é dinheiro atual da pessoa). A tela de exclusão avisa: "Sua parte nas metas da família ({valor}) também sairá delas." A família recebe: "Um membro saiu da família, e a meta {meta} foi atualizada." |
| RN-23 | Membro que sai ou é removido: seus gastos comuns continuam no histórico da família, com o nome dele, e continuam no histórico pessoal dele. |
| RN-24 | Membro que **exclui o cadastro**: dados pessoais apagados; gastos comuns permanecem na família como **"Ex-membro"**, sem nome. |
| RN-25 | Administrador que quer sair escolhe outro membro como administrador. Se for o único membro, a família é encerrada. |
| RN-26 | Uma pessoa participa de no máximo **uma família** na v1. |

### Cartões ilustrativos (M1)
| ID | Regra |
|---|---|
| RN-29 | Um cartão guarda só **apelido, tipo (crédito/débito) e cor**. Nenhum número, nem parcial. |
| RN-30 | O total de um cartão é o **gasto no mês** feito com ele, incluindo as parcelas do mês. Segue a RN-06 (mês da compra). Rótulo: "Gasto neste cartão em {mês}". Nunca "Fatura". |
| RN-31 | Cartões são **individuais e privados**. Um gasto da família pago com o cartão de alguém conta no total do cartão dessa pessoa; a família não vê os cartões. |
| RN-32 | Excluir um cartão: os gastos continuam no histórico como "Cartão excluído" e os valores não mudam (K5 A). |

### Gerais
| ID | Regra |
|---|---|
| RN-27 | Excluir uma categoria move seus gastos para "Outros". |
| RN-28 | Moeda: somente real (R$). Idioma: somente português do Brasil. |

---

## 3. Requisitos funcionais

### 3.1 Acesso
- RF-01 Criar cadastro com nome, e-mail e senha (mín. 8 caracteres).
- RF-02 Criar cadastro e entrar com Google.
- RF-03 Entrar, sair e recuperar senha por link no e-mail.
- RF-04 Sessão expirada pede para entrar de novo, preservando o que estava sendo digitado quando possível.

### 3.2 Onboarding
- RF-05 Três telas de apresentação, puláveis (copy oficial).
- RF-06 Pergunta opcional "Quanto você tem hoje?" (saldo inicial), editável depois em Configurações.
- RF-07 Convite para instalar: "Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes." Com instrução específica para iPhone.
- RF-08 Pedido de permissão de notificação só depois da instalação ou de uma ação que dê contexto.
- RF-09 Primeira ação sugerida: "Que tal anotar seu primeiro gasto?"

### 3.3 Registro
- RF-10 **Anotar gasto**: valor, categoria, data (padrão: hoje) e, se a pessoa tiver cartões cadastrados, **atalhos de um toque para os cartões**, com o último usado pré-selecionado e um atalho visível "Outra forma" que desmarca o cartão (K6 A). Em "mais detalhes": nota, outras formas de pagamento (Pix, dinheiro, boleto, débito sem cartão cadastrado), "da família", "se repete" (mensal/anual), "foi parcelado". Ajusta a decisão I3.
- RF-11 **Registrar entrada**: valor, de onde veio, data. Opção "se repete" (mensal/anual).
- RF-12 Botão "Anotar" sempre acessível nas telas principais.
- RF-13 Editar e excluir registros próprios, com confirmação na exclusão.
- RF-14 Parcelado: ver as parcelas geradas; **quitar antecipadamente** (RN-08) ou **cancelar por devolução** (RN-09).

### 3.4 Contas e recorrências
- RF-15 Lista de contas do mês: a pagar, pagas, vencidas.
- RF-16 Marcar conta como paga (pela lista, pelo dashboard ou pela notificação).
- RF-17 Confirmar entrada "a receber", podendo ajustar o valor antes de confirmar.
- RF-18 Encerrar ou alterar uma recorrência sem apagar o histórico.

### 3.5 Categorias
- RF-19 Categorias padrão de gasto: Casa, Mercado, Transporte, Comer fora, Saúde, Lazer, Assinaturas, Educação, Compras, Outros.
- RF-20 Criar, renomear e excluir categorias próprias ("Outros" não pode ser excluída).
- RF-21 Entradas usam origem ("de onde veio") com sugestões: salário, freela, presente, outros.

### 3.5b Cartões (M1)
- RF-58 Tela **Cartões** (em "Mais" no celular, no menu lateral no desktop): cadastrar, editar e excluir cartões ilustrativos (apelido, tipo, cor).
- RF-59 Cada cartão mostra "Gasto neste cartão em {mês}", com navegação entre meses e acesso aos gastos daquele cartão.
- RF-60 Filtro por cartão no Extrato.
- RF-61 O dashboard **não** ganha bloco de cartões (wireframe aprovado mantido).

### 3.6 Planejamento (individual)
- RF-22 Definir valor planejado por categoria para o mês.
- RF-23 Mostrar "{gasto} de {planejado}" e estados: dentro, perto do limite, passou do planejado.
- RF-24 Oferecer repetir o planejamento do mês anterior.

### 3.7 Metas
- RF-25 Criar meta: nome, valor, prazo (opcional), individual ou da família.
- RF-26 Guardar dinheiro na meta (RN-13).
- RF-27 Retirar dinheiro da meta (RN-14).
- RF-28 Usar o dinheiro da meta (RN-15).
- RF-29 Progresso: quanto falta, percentual e, se houver prazo, quanto guardar por mês.
- RF-30 Meta concluída com comemoração moderada.

### 3.8 Dashboard ("Seu mês")
- RF-31 Destaque: Disponível do mês. Logo abaixo: Disponível depois das contas.
- RF-32 Entrou · Saiu · Guardado este mês (só quando houver valor), fechando a conta do Disponível (RN-01).
- RF-33 Maior gasto do mês, planejado mais relevante, meta em destaque, próximas contas.
- RF-34 Saldo total com linha Guardado, em segundo plano.
- RF-35 Alternar para o espaço da família, se o usuário tiver uma.

### 3.9 Extrato
- RF-36 Lista de tudo o que entrou e saiu, agrupada por dia.
- RF-37 Busca por nome, valor ou categoria. Filtros: entradas, gastos, categoria, período.

### 3.10 Relatórios
- RF-38 Resumo de cada mês (entrou, saiu, guardado).
- RF-39 Gastos por categoria e comparação com o mês anterior, em frases antes de gráficos.
- RF-40 Filtros: este mês, mês passado, últimos 3 meses, personalizado.

### 3.11 Família
- RF-41 Criar família (quem cria vira administrador).
- RF-42 Convidar por e-mail ou link; o convidado aceita após criar o cadastro ou entrar.
- RF-43 Espaço da família: gastos comuns do mês, por categoria e por membro; contas da família; metas da família.
- RF-44 Administrador remove membros e edita/exclui gastos comuns.
- RF-45 Membro pode sair da família; administrador transfere o papel antes de sair (RN-25).

### 3.12 Notificações
- RF-46 Push (principal): conta vence amanhã, conta vence hoje, planejado quase no limite, meta perto, entrada a receber, mês fechado.
- RF-47 Lembrete diário para anotar: **desligado por padrão**.
- RF-48 Mensagem de retomada após dias sem registro, sem culpa.
- RF-49 E-mail: recuperação de senha, convites da família, resumo mensal.
- RF-50 Cada tipo de notificação pode ser ligado ou desligado em Configurações.

### 3.13 Configurações e dados
- RF-51 Editar nome, e-mail, senha e saldo inicial.
- RF-52 Exportar todos os dados (formato a definir na Etapa 3).
- RF-53 Excluir o cadastro, com opção de baixar os dados antes e confirmação digitando EXCLUIR. Texto de aviso: "Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome."
- RF-54 Termos de uso e Política de privacidade acessíveis.

### 3.14 Landing page
- RF-55 Landing no mesmo domínio, com as seções 1–9 da copy oficial e o SEO definido.
- RF-56 CTAs levam ao cadastro no site. Nunca "baixe o app" nem selos de loja.
- RF-57 Seção de confiança só publica itens que existam de fato (exportação, exclusão, LGPD).

---

## 4. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **Mobile first**: uso com uma mão, alvos de toque ≥ 44 px, ação principal ao alcance do polegar. |
| RNF-02 | **Desktop**: layout próprio que aproveita o espaço, não uma versão esticada do celular. |
| RNF-03 | **PWA** instalável (manifest, service worker, ícones), sem publicação em lojas. |
| RNF-04 | **Desempenho**: primeira tela útil em até ~2 s em 4G; registrar um gasto em até 3 toques após abrir. |
| RNF-05 | **Acessibilidade**: WCAG 2.2 AA (contraste, leitores de tela, teclado, sem depender só de cor). |
| RNF-06 | **Segurança**: isolamento de dados no banco (row level security) garantindo que o privado nunca apareça para a família; validação no servidor; HTTPS. |
| RNF-07 | **LGPD**: dados no Brasil (região São Paulo), exportação, exclusão, política de privacidade e termos antes do lançamento público. |
| RNF-08 | **Copy**: todo texto de interface segue o documento-base; textos novos passam pela sua aprovação. |
| RNF-09 | **Estados**: carregamento, vazio, erro, sucesso e **sem conexão** tratados em todas as telas. Sem conexão, o formulário mantém o que foi digitado para a pessoa tentar de novo. |
| RNF-10 | **Manutenção**: código organizado e documentado para ser mantido por você com o Claude Code. |
| RNF-11 | **Cálculos consistentes**: as regras RN-01 a RN-16 ficam num único lugar do código, cobertas por testes automatizados (em especial RN-15, para o gasto de meta nunca sair duas vezes). |

---

## 5. Stack

| Camada | Decisão | Observação |
|---|---|---|
| Front-end | Next.js como PWA | App e landing no mesmo projeto e domínio. |
| Back-end | Supabase (Auth, Postgres, row level security, funções agendadas) | Login com e-mail e Google. Região São Paulo. |
| Hospedagem | Netlify | Já conectada. |
| E-mail | Provedor SMTP próprio (ex.: Resend) | Obrigatório para convites e resumo mensal. |
| Push | Web Push (padrão do navegador) | Envio pelas funções agendadas. |
| Plano | Gratuito no desenvolvimento e testes; **Supabase Pro (~US$ 25/mês) no lançamento público** | Evita pausa por inatividade. O custo é confirmado por você no momento do lançamento. |

---

## 6. Fora da v1 (decidido)

Contas bancárias · Conexão com banco (Open Finance) · Importação de extrato · Controle de fatura de cartão · Entradas da família · Planejamento da família · Papéis além de administrador e membro · Mais de uma família por pessoa · Recorrência semanal · Funcionamento offline · Outras moedas e idiomas · App nas lojas.

---

## 7. Pendências

| ID | Pergunta |
|---|---|
| — | Copy nova (família, Saldo total, Guardado, a receber, instalação, termos "cadastro") será escrita nas Etapas 4–5 para sua aprovação. |
