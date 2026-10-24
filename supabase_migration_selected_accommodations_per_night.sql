-- Migration: Adicionar suporte para seleção de acomodação por noite em caso de sobreposição de reservas
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS selected_accommodations_per_night JSONB DEFAULT '{}'::jsonb;
