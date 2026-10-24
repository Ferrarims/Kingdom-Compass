-- Migration: Standardize Expense Statuses and Categories
-- This migration updates the constraints on the 'expenses' table to support new canonical statuses 
-- and the 'Pacotes de Fotos' category. It also neutralizes the default payment status for tickets and photo packages.

-- 1. Update Expense Status Constraint
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check CHECK (status IN ('Pago', 'Pendente', 'Parcial', 'Não informado', 'Não iniciado'));

-- 2. Update Expense Category Constraint
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category IN ('Passagens', 'Hospedagem', 'Ingressos', 'Pacotes de Fotos', 'Alimentação', 'Compras', 'Transporte', 'Seguro', 'Documentos'));

-- 3. Neutralize default payment status for Park Ticket Purchases
-- Change from 'Pago' or other legacy defaults to 'Não informado'
ALTER TABLE park_ticket_purchases ALTER COLUMN payment_status SET DEFAULT 'Não informado';

-- 4. Neutralize default payment status for Park Photo Packages
ALTER TABLE park_photo_packages ALTER COLUMN payment_status SET DEFAULT 'Não informado';

-- 5. Ensure existing data is normalized (Optional but recommended)
UPDATE expenses SET status = 'Não informado' WHERE status = 'Não iniciado';
UPDATE park_photo_packages SET payment_status = 'Não informado' WHERE payment_status = 'Reservado / Confirmado';
UPDATE park_photo_packages SET payment_status = 'Pendente' WHERE payment_status = 'Falta Pagar';
