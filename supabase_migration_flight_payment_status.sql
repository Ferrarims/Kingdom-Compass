-- =====================================================================
-- MIGRAÇÃO NÃO DESTRUTIVA: Adiciona payment_status em flight_segments
-- Projeto: Kingdom Compass
-- =====================================================================

-- 1. Adicionar a coluna payment_status permitindo NULL (não destrutiva)
ALTER TABLE public.flight_segments 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT NULL;

-- 2. Backfill seguro: apenas para registros legados onde o status era inequivocamente de pagamento
UPDATE public.flight_segments
SET payment_status = 'Pago'
WHERE (payment_status IS NULL OR payment_status = '') AND status = 'Pago';

UPDATE public.flight_segments
SET payment_status = 'Pendente'
WHERE (payment_status IS NULL OR payment_status = '') AND status = 'Pendente';

-- 3. Para os registros que tinham 'Pago' ou 'Pendente' gravados no campo status,
-- restaurar o status operacional do voo para o padrão 'Emitido / Confirmado'
UPDATE public.flight_segments
SET status = 'Emitido / Confirmado'
WHERE status IN ('Pago', 'Pendente');

-- NOTA: Registros com status operacional ('Emitido / Confirmado', 'Check-in Aberto',
-- 'Check-in Realizado', 'Embarcado', 'Concluído', etc.) permanecem com payment_status NULL
-- (exibidos na interface como 'Não informado' até que o usuário defina expressamente).
