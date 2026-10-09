-- Bandeira do cartão (Visa, Mastercard, American Express), opcional: cartões já
-- criados e os de outras bandeiras ficam sem (null). Só identifica o cartão na
-- tela; nenhum número do cartão é guardado. A política cards_own (RLS) já cobre
-- a coluna nova: só o dono lê e altera.
alter table public.cards
  add column brand text check (brand in ('visa', 'mastercard', 'amex'));
