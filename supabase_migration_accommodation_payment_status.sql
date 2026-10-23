-- =====================================================================
-- MIGRAÇÃO NÃO DESTRUTIVA: Adiciona payment_status em accommodations
-- Projeto: Kingdom Compass
-- =====================================================================

-- 1. Adicionar a coluna payment_status permitindo NULL (não destrutiva)
ALTER TABLE public.accommodations 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT NULL;

-- 2. Backfill seguro: apenas para registros legados onde o status era inequivocamente de pagamento
UPDATE public.accommodations
SET payment_status = 'Pago'
WHERE (payment_status IS NULL OR payment_status = '') AND status = 'Pago';

UPDATE public.accommodations
SET payment_status = 'Pendente'
WHERE (payment_status IS NULL OR payment_status = '') AND (status = 'Pendente' OR status = 'Falta Pagar');

-- 3. Para os registros que tinham 'Pago' ou 'Pendente' gravados no campo status,
-- restaurar o status operacional da hospedagem para o padrão 'Reservado / Confirmado'
UPDATE public.accommodations
SET status = 'Reservado / Confirmado'
WHERE status IN ('Pago', 'Pendente', 'Falta Pagar');

-- NOTA: Registros com status operacional ('Reservado / Confirmado', 'Confirmado',
-- 'Check-in Realizado', 'Concluído', etc.) mantêm seu status operacional intacto e
-- permanecem com payment_status NULL (exibidos na interface como 'Não informado'
-- até que o usuário defina expressamente o status financeiro).
