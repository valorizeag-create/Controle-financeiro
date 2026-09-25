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

## Textos novos usados (fora da copy oficial)

Aprovados antes: "Falta o seu nome.", "Falta a senha.", "Use até {n} caracteres.", "Escolha o dia.", "Crie uma nova senha.", "Salvar nova senha", "Voltar", formas de pagamento (Pix, Dinheiro, Boleto, Débito, Crédito, Outra forma, Não informar).
