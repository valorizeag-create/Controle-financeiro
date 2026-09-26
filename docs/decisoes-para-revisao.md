# Íris — Decisões para sua revisão

Decisões tomadas durante o desenvolvimento, quando a documentação aprovada não definia o detalhe. Cada uma diz o que foi decidido e por quê. Qualquer uma pode ser revertida.

## Plano 1

| # | Decisão | Motivo |
|---|---|---|
| 1 | "Disponível depois das contas" no mês atual inclui também contas **vencidas de meses anteriores** ainda não pagas. Em meses passados ou futuros, só as contas daquele mês. | Uma conta atrasada continua devida; escondê-la deixaria o número otimista demais. |
| 2 | Meses futuros mostram, em "Saiu", os gastos já datados para eles (ex.: parcelas). O Saldo total considera só o que aconteceu até hoje. | Ao olhar novembro, a pessoa espera ver a parcela de novembro. |
| 3 | Valores digitados com espaço no meio ("1 2") ou só com vírgula são recusados com "Esse valor não parece certo. Use apenas números." | Evita que um erro de digitação vire outro valor válido. |
| 4 | Datas aceitas: de 01/01/2000 até 1 ano à frente para gastos; **entradas só até hoje** ("Escolha o dia."). | Um ano digitado errado sumiria do mês; dinheiro que não chegou não conta (regra RN-12). |
| 5 | A navegação entre meses vai de 2000 a 2099. | Mesmo limite das datas de registro. |
| 6 | Forma de pagamento desconhecida (fora da lista) é tratada como "Não informar". | Evita mensagem de erro técnica em inglês. |
| 7 | A categoria "Outros" não pode ser excluída, e as categorias padrão não perdem sua identificação interna. | "Outros" recebe os gastos de categorias excluídas (RN-27). |
| 8 | Senha com no máximo 72 bytes (letras acentuadas contam mais), mesma mensagem "Use até 72 caracteres.". | Limite técnico do armazenamento seguro de senhas. |
| 9 | Troca de senha exige login recente (configuração de segurança do Supabase). | Protege a conta se alguém tiver acesso a uma sessão antiga. |
| 10 | O histórico completo é lido em páginas de 1.000 registros. | O banco corta respostas grandes sem avisar; o Saldo total ficaria errado. |
| 11 | Logo provisório (círculo verde com "íris" escura) usado no app até existir o definitivo. | Aprovado na Etapa 5 (V2). |

## Plano 2

| # | Decisão | Motivo |
|---|---|---|
| 12 | Barra inferior com 4 itens até existir Metas: Seu mês · Extrato · Anotar · Mais. Metas entra no Plano 5. | Não mostrar botão que leva a tela vazia. |
| 13 | Menu lateral lista as áreas diretamente (Seu mês, Extrato, Categorias, Configurações); "Mais" é só do celular. | No desktop há espaço; o "Mais" existe para caber na barra do celular. |
| 14 | Onboarding "concluído" = salvou ou pulou "Quanto você tem hoje?". Quem para antes volta às boas-vindas ao abrir o app; quem concluiu nunca volta. Cadastros anteriores ao Plano 2 contam como concluídos. | Garante que ninguém caia no Seu mês sem ter visto o saldo inicial, sem prender quem já usa. |
| 15 | Saldo inicial em branco vale R$ 0,00; valor negativo não é aceito nesta versão. | É opcional; negativo pede texto próprio (dívida), que não está na copy. |
| 16 | Período do Extrato = mês, com as mesmas setas do Seu mês; a busca vale dentro do mês escolhido. | Coerente com o "Seu mês"; evita misturar meses sem aviso. |
| 17 | Busca por valor aceita parte do número ("142" encontra R$ 142,30), com ou sem milhar, vírgula, ponto ou "R$". | É como a pessoa lembra do valor. |
| 18 | Tocar num registro abre a edição (o mesmo formulário do Anotar); "Excluir" fica dentro da edição, com confirmação. | Um toque a menos que um menu de ações; excluir sempre confirmado. |
| 19 | Depois de editar, a tela volta ao Extrato no mês do registro — se a data mudou de mês, no mês novo. | A pessoa vê onde o registro foi parar. |
| 20 | "Outros" não pode ser renomeada (nem excluída) e fica sempre por último; categorias padrão podem ser renomeadas e excluídas. | A confirmação diz 'vão para "Outros"'; o nome precisa continuar verdadeiro. |
| 21 | Nomes de categoria não diferenciam maiúsculas nem espaços extras; acentos diferenciam ("Saude" ≠ "Saúde"). | Evita duplicatas óbvias sem instalar extensão de acentos no banco. |
| 22 | E-mail aparece em Configurações só para leitura; trocar e-mail fica para o Plano 9. | Trocar e-mail exige confirmação por e-mail (SMTP próprio, Plano 8/9). |
| 23 | "Mudar senha" usa a tela "Crie uma nova senha."; com login antigo, a Íris pede para sair e entrar de novo. | O Supabase exige login recente para trocar senha (decisão 9). |
| 24 | "Sair da Íris?" pede confirmação também no menu lateral do desktop. | Mesmo comportamento em todo lugar. |
| 25 | Fechar Anotar/Editar com algo digitado pergunta "Descartar este registro?". | Evita perder o que foi digitado por um toque sem querer. |

## Textos novos usados (fora da copy oficial)

Aprovados antes: "Falta o seu nome.", "Falta a senha.", "Use até {n} caracteres.", "Escolha o dia.", "Crie uma nova senha.", "Salvar nova senha", "Voltar", formas de pagamento (Pix, Dinheiro, Boleto, Débito, Crédito, Outra forma, Não informar).
Plano 2: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-25-iris-plano-2-extrato-onboarding.md`.
