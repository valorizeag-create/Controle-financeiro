# Importar extrato: desenho

Data: 2026-10-09. Aprovado em conversa, parte a parte (fluxo, duplicados, categorias, por baixo). Este documento junta as quatro partes para revisão antes do plano de implementação.

## 1. Objetivo

Deixar de anotar gasto por gasto. A pessoa baixa o extrato no app do próprio banco (PDF, CSV ou OFX), envia para a Íris, escolhe o período, revisa o que a Íris entendeu e confirma. Os registros entram no mês como se tivessem sido anotados à mão.

**Sucesso:** importar um mês inteiro em poucos minutos, revisando só o que a Íris não soube classificar, sem nenhum registro contado duas vezes.

## 2. Fora do escopo (agora)

- Ligar a Íris ao banco (Open Finance). Quebra a promessa da copy ("A Íris não se conecta à sua conta bancária nem pede senha do banco") e é pago.
- Inteligência artificial para ler ou classificar. É paga e tira o extrato do aparelho. O código fica preparado para ligar depois (caminho C), sem fazer isso agora.
- PDF escaneado (foto) e PDF com senha.
- Modelos específicos por banco. Ficam para quando chegarem extratos reais que a leitura automática errar.

## 3. Restrições que valem

- Plano gratuito: nenhum serviço pago.
- O arquivo é lido no navegador e **nunca** é enviado ao servidor nem guardado.
- RLS em toda tabela nova. Ninguém lê nem grava o que é de outra pessoa.
- Textos: a copy não cobre importação. Todo texto novo entra na lista de aprovação (`docs/decisoes-para-revisao.md`) e segue os princípios da copy (sem culpa, sem jargão, botões com verbo e objeto).
- Mobile-first. No celular não pode haver rolagem horizontal, e no computador o fluxo continua usável.

## 4. Onde fica e o fluxo

**Pontos de entrada**
- Extrato: botão "Importar extrato" no cabeçalho.
- Mais (celular) e menu lateral (computador): linha "Importar extrato".
- Anotar: link discreto no fim do painel.

**Rota:** `/extrato/importar`, com uma tela e três etapas no cliente.

**Etapa 1, escolher**
- Escolher arquivo (no computador também dá para arrastar): `.pdf`, `.csv`, `.ofx`, até 5 MB.
- "De onde é este extrato?": a conta do banco ou um dos cartões cadastrados.
- Período "De" e "Até", preenchidos com o período encontrado no arquivo. Só entram as linhas dentro dele.
- Frase de confiança: o arquivo é lido no aparelho e só os registros confirmados são salvos.

**Etapa 2, revisar**
- Lista por dia, no visual do Extrato. Cada linha tem: caixa (vai ser anotado), data, descrição do banco, valor, entrada ou gasto, e categoria (gasto) ou origem (entrada), trocáveis com um toque.
- As linhas sem categoria aparecem primeiro, destacadas.
- Linhas desmarcadas por padrão mostram o motivo (seção 5).
- Ação em massa: "Pôr em Outros as N sem categoria".
- Rodapé fixo: resumo ("23 gastos · 2 entradas") e o botão "Anotar N registros". Fica desligado enquanto houver linha marcada sem categoria.

**Etapa 3, pronto**
- Redireciona para Seu mês com o aviso "N registros anotados.".

**Arquivo não entendido**
- CSV: tela de ajuste ("Qual coluna é a data? E a descrição? E o valor?"), com uma prévia das primeiras linhas.
- PDF sem linhas reconhecidas, escaneado ou com senha: mensagem pedindo o CSV ou o OFX do banco.

## 5. Não contar duas vezes

1. **Linha já importada:** cada linha recebe uma impressão digital, `import_key`, um hash de data, valor, descrição normalizada e posição entre linhas iguais do mesmo dia. Ela é guardada no registro, com índice único `(user_id, import_key)`. Linhas já importadas ficam escondidas, e a tela mostra a contagem ("12 linhas já importadas antes").
2. **Já anotado à mão:** mesmo tipo, mesmo valor e data a até 2 dias de distância de um registro sem `import_key`, que ainda não tenha casado com outra linha. A linha vem desmarcada e mostra o registro parecido.
3. **Conta que se repete:** um gasto que casa com uma ocorrência `pending` da própria pessoa (mesmo valor, ou até 5% de diferença, e data a até 5 dias do vencimento) vira a ação "Marcar {conta} como paga". Ao salvar, a ocorrência passa a `confirmed`, com `paid_on` na data do extrato, e nenhum gasto novo é criado.
4. **Pagamento de fatura** (extrato da conta): palavras como "PAGAMENTO FATURA", "PAG FATURA" e "FATURA CARTAO" fazem a linha vir desmarcada, com o motivo de que as compras do cartão já contam uma a uma.
5. **Dinheiro entre contas próprias:** "APLICACAO", "RESGATE", "TRANSF MESMA TITULARIDADE", "ENTRE CONTAS" e semelhantes vêm desmarcadas, como dinheiro que só mudou de lugar.
6. **Extrato de cartão:** as compras entram com `card_id` do cartão escolhido. Pagamentos e créditos da própria fatura são ignorados. Estornos entram como entrada.

## 6. Categorias

Ordem de busca, para cada linha:
1. **Memória** (`import_rules`): descrição normalizada → categoria. É gravada ou atualizada ao salvar, para toda linha confirmada com categoria. Vale também para categorias criadas pela pessoa.
2. **Dicionário pronto:** palavras ligadas às chaves das categorias padrão (`default_key`), então continua valendo se a categoria for renomeada. A primeira versão tem os exemplos da Parte 3 da conversa: mercado, comer fora, transporte, saúde, assinaturas, casa, compras, educação e lazer.
3. **Entradas:** "SALARIO", "FOLHA" e "PAGTO SALARIO" viram a origem "Salário". As demais entradas ficam sem origem.
4. **Nada encontrado:** sem categoria. Nunca vai para "Outros" em silêncio.

**Normalização da descrição:** minúsculas, sem acento. Saem datas, horas, números longos, prefixos de meio de pagamento ("compra cartao", "compra no debito", "pix enviado", "pix recebido", "pagamento de boleto", "ted", "doc"), prefixos de adquirente ("ifd*", "mp*", "pag*", "pg *") e o sufixo de cidade e UF. O resultado tem no máximo 60 caracteres.

**A nota do registro** é a descrição do banco num formato legível (por exemplo, "Padaria do Zé"), com no máximo 140 caracteres. Gastos importados entram como pessoais.

## 7. Leitura dos arquivos (no navegador)

- **CSV:** detecta a codificação (UTF-8; se falhar, Windows-1252) e o separador (`;`, `,` ou tab). A linha de cabeçalho é a primeira que tem nomes conhecidos ("data", "histórico", "descrição", "lançamento", "valor", "débito", "crédito", "entrada", "saída"). Valores aceitos: `-1.234,56`, `1234.56`, `1.234,56 D/C` e colunas separadas de débito e crédito. Datas aceitas: `dd/mm/aaaa`, `dd/mm/aa`, `aaaa-mm-dd`. Se não achar as colunas, abre a tela de ajuste.
- **OFX:** lê `STMTTRN` (`DTPOSTED`, `TRNAMT`, `MEMO`/`NAME`), tanto no formato SGML quanto no XML.
- **PDF:** usa `pdfjs-dist`, carregado só na tela de importar. Extrai o texto, reconstrói as linhas pela posição e reconhece como lançamento a linha que tem data, descrição e valor (com sinal, ou com D/C). Linhas de saldo ("SALDO", "SALDO ANTERIOR") são ignoradas.
- Linhas inválidas são ignoradas, e a tela mostra a contagem ("3 linhas que a Íris não entendeu").
- O núcleo de leitura e classificação é feito de funções puras em `src/domain/importacao/`, testadas sem navegador.

## 8. Dados e servidor

**Migração**
- `transactions.import_key text`, com índice único parcial `(user_id, import_key) where import_key is not null`.
- `import_rules (user_id, merchant_key, kind, category_id, updated_at)`, com chave primária `(user_id, merchant_key, kind)`, FK `(category_id, user_id)` para `categories` com `on delete cascade` e RLS que só deixa o dono ler e gravar.

**Salvar:** uma server action valida tudo com Zod (até 1.000 linhas; valores, datas, tipos; categorias e cartão da própria pessoa; contas pendentes da própria pessoa) e chama uma função no banco, `import_statement(p_lines jsonb, p_card_id uuid)`, com `security invoker` (vale a RLS). Ela faz, numa única transação:
- insere os registros, com `import_key`, nota, categoria ou origem e `card_id`;
- marca como pagas as ocorrências escolhidas;
- grava a memória de categorias.

Se alguma `import_key` já existir, a função ignora a linha e não falha (`on conflict do nothing`) e devolve quantas linhas entraram.

O arquivo nunca passa pelo servidor.

## 9. Privacidade e textos jurídicos

- Uma frase nova na Política de privacidade, para revisão: quem importa um extrato tem o arquivo lido no próprio aparelho, e só os registros confirmados são guardados, como se tivessem sido anotados à mão.
- O "Baixar meus dados" passa a incluir a memória de categorias (bloco novo). Excluir o cadastro apaga essa memória junto (cascade por `user_id`).

## 10. Textos novos (rascunho, para aprovação)

Título "Importar extrato". "Escolher arquivo". "De onde é este extrato?". "Conta do banco". "De" e "Até". "O arquivo é lido aqui no seu aparelho. Só os registros que você confirmar são salvos.". "Escolha a categoria". "Pôr em Outros as {n} sem categoria". "Parece que você já anotou isto: {categoria}, {valor}, {data}". "Pagamento de fatura: as compras do cartão já contam uma a uma.". "Parece dinheiro entre suas contas.". "Marcar {conta} como paga". "{n} linhas já importadas antes.". "{n} linhas que a Íris não entendeu.". "Anotar {n} registros". "{n} registros anotados.". "Qual coluna é a data? E a descrição? E o valor?". "Não conseguimos ler este PDF. Tente o arquivo CSV ou OFX do seu banco.". "Este arquivo passa de 5 MB. Escolha um período menor no app do banco.". A versão final fica no plano.

## 11. Testes

- **Unitários:** leitores de CSV (variações sintéticas de bancos brasileiros), OFX e linhas de texto de PDF; normalização; dicionário; memória; casamento de duplicados, de contas pendentes, de fatura e de transferência; `import_key`; validação da server action.
- **Componentes:** as três etapas, incluindo seleção, troca de categoria, ação em massa e botão desligado.
- **Banco** (precisam de Docker): RLS de `import_rules`; `import_statement` com tudo ou nada, sem duplicar por `import_key` e sem tocar em dados de outra pessoa.
- **Ponta a ponta** (precisam de Docker): importar um CSV, revisar, anotar e ver no Seu mês; reimportar e ver as linhas escondidas.
- **No navegador real:** a leitura de PDF com arquivos de exemplo gerados na hora, no celular e no computador.

## 12. Publicação

1. SQL da migração no SQL Editor do projeto iris2, colado pela pessoa responsável.
2. Push. A Vercel publica.

## 13. Pendências conhecidas

- Validar com extratos reais dos bancos assim que houver (ajustar o dicionário e, se preciso, criar modelos por banco).
- Revisão jurídica da frase da Política de privacidade.
