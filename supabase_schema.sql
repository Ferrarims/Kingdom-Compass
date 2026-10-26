-- =====================================================================
-- ESQUEMA COMPLETO DO BANCO DE DADOS - SUPABASE / POSTGRESQL (UUID NATIVO)
-- Aplicativo: Planejador de Viagem Orlando & Parques (Kingdom Compass)
-- Compatível com Supabase (PostgreSQL 14/15/16)
--
-- NOTA: Todas as tabelas possuem Chaves Estrangeiras (FK) completas com
-- nomes de constraint explícitos, integridade referencial (ON DELETE / ON UPDATE)
-- e índices otimizados para performance.
-- =====================================================================

-- 0. Limpeza preventiva das tabelas (ordem reversa de dependência)
DROP TABLE IF EXISTS public.settlement_payments CASCADE;
DROP TABLE IF EXISTS public.baggage_items CASCADE;
DROP TABLE IF EXISTS public.booking_milestones CASCADE;
DROP TABLE IF EXISTS public.preparation_documents CASCADE;
DROP TABLE IF EXISTS public.park_ticket_purchases CASCADE;
DROP TABLE IF EXISTS public.accommodations CASCADE;
DROP TABLE IF EXISTS public.car_rentals CASCADE;
DROP TABLE IF EXISTS public.flight_segments CASCADE;
DROP TABLE IF EXISTS public.park_day_bookings CASCADE;
DROP TABLE IF EXISTS public.custom_route_stops CASCADE;
DROP TABLE IF EXISTS public.hourly_schedules CASCADE;
DROP TABLE IF EXISTS public.itinerary_days CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.auth_sessions CASCADE;
DROP TABLE IF EXISTS public.travelers CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 2. TABELAS PRINCIPAIS (COM UUID NATIVO E CHAVES ESTRANGEIRAS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- TABELA: trips (Viagens)
-- ---------------------------------------------------------------------
CREATE TABLE public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_code TEXT NOT NULL,
    trip_name TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT 'Orlando, FL',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_days INTEGER NOT NULL DEFAULT 10,
    travelers_count INTEGER NOT NULL DEFAULT 1,
    dollar_rate NUMERIC(10, 4) NOT NULL DEFAULT 5.7500,
    total_budget_goal_brl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Planejando',
    cover_theme TEXT DEFAULT 'magic',
    transport_modality TEXT DEFAULT 'rental',
    is_flexible_dates BOOLEAN NOT NULL DEFAULT false,
    flexible_outbound_start DATE,
    flexible_outbound_end DATE,
    flexible_inbound_start DATE,
    flexible_inbound_end DATE,
    flexible_min_days INTEGER,
    flexible_max_days INTEGER,
    outbound_flexibility TEXT,
    inbound_flexibility TEXT,
    flexibility_notes TEXT,
    module_readiness JSONB DEFAULT '{"flights": "pending", "accommodations": "pending", "parks": "pending", "transport": "pending", "docs": "pending"}'::jsonb,
    selected_accommodations_per_night JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- TABELA: travelers (Viajantes / Integrantes do Grupo)
-- ---------------------------------------------------------------------
CREATE TABLE public.travelers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#3B82F6',
    avatar_icon TEXT,
    role TEXT NOT NULL DEFAULT 'traveler',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT travelers_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: auth_sessions (Sessões e Acessos à Viagem)
-- ---------------------------------------------------------------------
CREATE TABLE public.auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    trip_code TEXT NOT NULL,
    email TEXT NOT NULL,
    traveler_name TEXT NOT NULL,
    authenticated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT auth_sessions_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: expenses (Despesas e Orçamento Financeiro)
-- ---------------------------------------------------------------------
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    estimated_value_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    estimated_value_brl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_value_brl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pendente',
    responsible_traveler_id UUID,
    excluded BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    payer_id UUID,
    source_type TEXT,
    source_id UUID,
    paid_value_usd NUMERIC,
    CONSTRAINT expenses_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT expenses_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT expenses_responsible_traveler_id_fkey FOREIGN KEY (responsible_traveler_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- TABELA: itinerary_days (Dias do Roteiro)
-- ---------------------------------------------------------------------
CREATE TABLE public.itinerary_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    day_number INTEGER NOT NULL,
    date DATE,
    title TEXT NOT NULL,
    park TEXT NOT NULL DEFAULT 'Sem Parque',
    completed BOOLEAN NOT NULL DEFAULT false,
    morning JSONB NOT NULL DEFAULT '{"notes": "", "where": "", "dining": ""}'::jsonb,
    afternoon JSONB NOT NULL DEFAULT '{"notes": "", "where": "", "dining": ""}'::jsonb,
    night JSONB NOT NULL DEFAULT '{"notes": "", "where": "", "dining": ""}'::jsonb,
    general_notes TEXT,
    hourly_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT itinerary_days_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: hourly_schedules (Cronograma Hora a Hora por Dia)
-- ---------------------------------------------------------------------
CREATE TABLE public.hourly_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_day_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    time TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    category TEXT DEFAULT 'other',
    completed BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    source_type TEXT,
    source_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hourly_schedules_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT hourly_schedules_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: custom_route_stops (Paradas e Rotas no Mapa)
-- ---------------------------------------------------------------------
CREATE TABLE public.custom_route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_day_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    lat NUMERIC(10, 7) NOT NULL,
    lng NUMERIC(10, 7) NOT NULL,
    time TEXT,
    notes TEXT,
    stop_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT custom_route_stops_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT custom_route_stops_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: park_day_bookings (Reservas e Detalhes do Dia de Parque)
-- ---------------------------------------------------------------------
CREATE TABLE public.park_day_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_day_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    day_number INTEGER NOT NULL,
    park_name TEXT NOT NULL,
    park_id TEXT,
    park_hours JSONB DEFAULT '{"closingTime": "21:00", "openingTime": "09:00", "earlyEntryTime": "08:30"}'::jsonb,
    park_pass_status TEXT NOT NULL DEFAULT 'Confirmado no App',
    confirmation_code TEXT,
    ticket_type TEXT,
    rope_drop_plan TEXT,
    fast_passes JSONB DEFAULT '[]'::jsonb,
    dining_reservations JSONB DEFAULT '[]'::jsonb,
    shows_and_parades JSONB DEFAULT '[]'::jsonb,
    has_photo_package BOOLEAN DEFAULT false,
    photo_package JSONB DEFAULT NULL::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT park_day_bookings_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_day_bookings_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA SECUNDÁRIA: park_fast_passes (Agendamentos individuais de FastPass / Lightning Lane)
-- ---------------------------------------------------------------------
CREATE TABLE public.park_fast_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL,
    attraction_name TEXT,
    time_window TEXT,
    pass_type TEXT NOT NULL DEFAULT 'Lightning Lane Multi Pass',
    tier TEXT,
    status TEXT NOT NULL DEFAULT 'Agendado',
    party_members TEXT,
    notes TEXT,
    charge_mode TEXT DEFAULT 'paid',
    cost_usd NUMERIC(10, 2),
    cost_brl NUMERIC(12, 2),
    payment_status TEXT NOT NULL DEFAULT 'Não informado',
    payer_id TEXT NOT NULL DEFAULT 'all',
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    reservation_required BOOLEAN DEFAULT false,
    reservation_status TEXT DEFAULT 'Não necessária',
    reservation_confirmation_code TEXT,
    courtesy_provider TEXT,
    attraction_reservations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT park_fast_passes_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_fast_passes_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_fast_passes_attraction_reservations_array_check CHECK (jsonb_typeof(attraction_reservations) = 'array')
);

-- ---------------------------------------------------------------------
-- TABELA SECUNDÁRIA: park_dining_reservations (Reservas de Refeições / Almoço / Jantar)
-- ---------------------------------------------------------------------
CREATE TABLE public.park_dining_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL,
    restaurant_name TEXT NOT NULL,
    meal_type TEXT NOT NULL DEFAULT 'Almoço (Lunch)',
    reservation_time TEXT NOT NULL,
    confirmation_code TEXT,
    party_size INTEGER,
    table_service BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'Confirmada',
    cancellation_policy_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT park_dining_reservations_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_dining_reservations_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA SECUNDÁRIA: park_shows_reservations (Shows, Fogos e Paradas Agendados)
-- ---------------------------------------------------------------------
CREATE TABLE public.park_shows_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL,
    show_name TEXT NOT NULL,
    show_time TEXT NOT NULL,
    location TEXT,
    reserved_area TEXT,
    status TEXT NOT NULL DEFAULT 'Agendado',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT park_shows_reservations_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_shows_reservations_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: flight_segments (Voos e Conexões)
-- ---------------------------------------------------------------------
CREATE TABLE public.flight_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    type TEXT NOT NULL,
    type_label TEXT NOT NULL DEFAULT 'Voo',
    airline TEXT NOT NULL,
    airline_code TEXT,
    flight_number TEXT NOT NULL,
    pnr_locator TEXT NOT NULL,
    origin_airport TEXT NOT NULL,
    origin_city TEXT,
    origin_code TEXT,
    destination_airport TEXT NOT NULL,
    destination_city TEXT,
    destination_code TEXT,
    departure_date DATE NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_date DATE NOT NULL,
    arrival_time TEXT NOT NULL,
    duration TEXT,
    stopovers TEXT DEFAULT 'Voo Direto',
    cabin_class TEXT DEFAULT 'Econômica',
    seats TEXT,
    terminal_origin TEXT,
    terminal_destination TEXT,
    gate TEXT,
    baggage_allowance JSONB DEFAULT '{"notes": "", "carryOnQty": 1, "checkedQty": 1, "personalItem": true}'::jsonb,
    status TEXT NOT NULL DEFAULT 'Emitido / Confirmado',
    payment_status TEXT DEFAULT NULL,
    ticket_cost_usd NUMERIC(10, 2),
    ticket_cost_brl NUMERIC(12, 2),
    notes TEXT,
    passengers JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    payer_id UUID,
    CONSTRAINT flight_segments_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT flight_segments_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- TABELA: car_rentals (Aluguel de Carro)
-- ---------------------------------------------------------------------
CREATE TABLE public.car_rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    company TEXT NOT NULL,
    confirmation_code TEXT NOT NULL,
    category TEXT NOT NULL,
    pickup_location TEXT NOT NULL,
    pickup_date DATE NOT NULL,
    pickup_time TEXT NOT NULL,
    dropoff_location TEXT NOT NULL,
    dropoff_date DATE NOT NULL,
    dropoff_time TEXT NOT NULL,
    cost_usd NUMERIC(10, 2),
    cost_brl NUMERIC(12, 2),
    status TEXT NOT NULL DEFAULT 'Reservado / Confirmado',
    driver_name TEXT,
    included_insurances JSONB DEFAULT '[]'::jsonb,
    toll_option TEXT DEFAULT 'Visitor Toll Pass',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    payer_id UUID,
    CONSTRAINT car_rentals_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT car_rentals_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- TABELA: accommodations (Hospedagens)
-- ---------------------------------------------------------------------
CREATE TABLE public.accommodations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    confirmation_code TEXT NOT NULL,
    address TEXT NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time TEXT NOT NULL DEFAULT '15:00',
    check_out_date DATE NOT NULL,
    check_out_time TEXT NOT NULL DEFAULT '11:00',
    room_type TEXT,
    cost_usd NUMERIC(10, 2),
    cost_brl NUMERIC(12, 2),
    status TEXT NOT NULL DEFAULT 'Reservado / Confirmado',
    guest_name TEXT,
    total_guests INTEGER DEFAULT 1,
    amenities JSONB DEFAULT '[]'::jsonb,
    contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    payer_id UUID,
    CONSTRAINT accommodations_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT accommodations_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- TABELA: park_ticket_purchases (Ingressos de Parques)
-- ---------------------------------------------------------------------
CREATE TABLE public.park_ticket_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'individual',
    complex TEXT NOT NULL,
    parks_included JSONB DEFAULT '[]'::jsonb,
    days_count INTEGER NOT NULL DEFAULT 1,
    ticket_option TEXT,
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    quantity INTEGER NOT NULL DEFAULT 1,
    cost_usd NUMERIC(10, 2),
    cost_brl NUMERIC(12, 2),
    payment_status TEXT NOT NULL DEFAULT 'Pago',
    confirmation_code TEXT,
    seller TEXT,
    notes TEXT,
    voucher_attachment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payer_id UUID,
    CONSTRAINT park_ticket_purchases_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_ticket_purchases_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- TABELA: preparation_documents (Documentos e Preparativos)
-- ---------------------------------------------------------------------
CREATE TABLE public.preparation_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendente',
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_by_travelers JSONB DEFAULT '{}'::jsonb,
    sub_items JSONB DEFAULT '[]'::jsonb,
    tips JSONB DEFAULT '[]'::jsonb,
    links JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    traveler_id UUID,
    CONSTRAINT preparation_documents_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT preparation_documents_traveler_id_fkey FOREIGN KEY (traveler_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: baggage_items (Itens de Mala de Viagem)
-- ---------------------------------------------------------------------
CREATE TABLE public.baggage_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    traveler_id UUID NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    packed BOOLEAN NOT NULL DEFAULT false,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT baggage_items_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT baggage_items_traveler_id_fkey FOREIGN KEY (traveler_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: booking_milestones (Marcos / Lembretes de Reservas)
-- ---------------------------------------------------------------------
CREATE TABLE public.booking_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    title TEXT NOT NULL,
    days_before_trip INTEGER NOT NULL,
    description TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT booking_milestones_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TABELA: settlement_payments (Acertos de Contas e Ajustes entre Viajantes)
-- ---------------------------------------------------------------------
CREATE TABLE public.settlement_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    from_traveler_id UUID NOT NULL,
    to_traveler_id UUID NOT NULL,
    amount_brl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount_usd NUMERIC(10, 2) DEFAULT 0.00,
    description TEXT,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'PIX',
    status TEXT NOT NULL DEFAULT 'Concluído',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT settlement_payments_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT settlement_payments_from_traveler_id_fkey FOREIGN KEY (from_traveler_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT settlement_payments_to_traveler_id_fkey FOREIGN KEY (to_traveler_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- =====================================================================
-- 3. ÍNDICES DE PERFORMANCE PARA TODAS AS CHAVES ESTRANGEIRAS
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_travelers_trip_id ON public.travelers(trip_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_trip_id ON public.auth_sessions(trip_id);

CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON public.expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_payer_id ON public.expenses(payer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_resp_traveler_id ON public.expenses(responsible_traveler_id);

CREATE INDEX IF NOT EXISTS idx_itinerary_days_trip_id ON public.itinerary_days(trip_id);

CREATE INDEX IF NOT EXISTS idx_hourly_schedules_trip_id ON public.hourly_schedules(trip_id);
CREATE INDEX IF NOT EXISTS idx_hourly_schedules_day_id ON public.hourly_schedules(itinerary_day_id);

CREATE INDEX IF NOT EXISTS idx_custom_route_stops_trip_id ON public.custom_route_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_custom_route_stops_day_id ON public.custom_route_stops(itinerary_day_id);

CREATE INDEX IF NOT EXISTS idx_park_day_bookings_trip_id ON public.park_day_bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_day_bookings_day_id ON public.park_day_bookings(itinerary_day_id);

CREATE INDEX IF NOT EXISTS idx_park_fast_passes_trip_id ON public.park_fast_passes(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_fast_passes_day_id ON public.park_fast_passes(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_park_fast_passes_booking_id ON public.park_fast_passes(park_day_booking_id);

CREATE INDEX IF NOT EXISTS idx_park_dining_reservations_trip_id ON public.park_dining_reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_dining_reservations_day_id ON public.park_dining_reservations(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_park_dining_reservations_booking_id ON public.park_dining_reservations(park_day_booking_id);

CREATE INDEX IF NOT EXISTS idx_park_shows_reservations_trip_id ON public.park_shows_reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_shows_reservations_day_id ON public.park_shows_reservations(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_park_shows_reservations_booking_id ON public.park_shows_reservations(park_day_booking_id);

CREATE INDEX IF NOT EXISTS idx_flight_segments_trip_id ON public.flight_segments(trip_id);
CREATE INDEX IF NOT EXISTS idx_flight_segments_payer_id ON public.flight_segments(payer_id);

CREATE INDEX IF NOT EXISTS idx_car_rentals_trip_id ON public.car_rentals(trip_id);
CREATE INDEX IF NOT EXISTS idx_car_rentals_payer_id ON public.car_rentals(payer_id);

CREATE INDEX IF NOT EXISTS idx_accommodations_trip_id ON public.accommodations(trip_id);
CREATE INDEX IF NOT EXISTS idx_accommodations_payer_id ON public.accommodations(payer_id);

CREATE INDEX IF NOT EXISTS idx_park_ticket_purchases_trip_id ON public.park_ticket_purchases(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_ticket_purchases_payer_id ON public.park_ticket_purchases(payer_id);

CREATE INDEX IF NOT EXISTS idx_preparation_documents_trip_id ON public.preparation_documents(trip_id);
CREATE INDEX IF NOT EXISTS idx_preparation_documents_traveler_id ON public.preparation_documents(traveler_id);

CREATE INDEX IF NOT EXISTS idx_baggage_items_trip_id ON public.baggage_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_baggage_items_traveler_id ON public.baggage_items(traveler_id);

CREATE INDEX IF NOT EXISTS idx_booking_milestones_trip_id ON public.booking_milestones(trip_id);

CREATE INDEX IF NOT EXISTS idx_settlement_payments_trip_id ON public.settlement_payments(trip_id);
CREATE INDEX IF NOT EXISTS idx_settlement_payments_from_traveler ON public.settlement_payments(from_traveler_id);
CREATE INDEX IF NOT EXISTS idx_settlement_payments_to_traveler ON public.settlement_payments(to_traveler_id);

-- ---------------------------------------------------------------------
-- TABELA: traveler_attraction_selections (Desejos de Atrações por Viajante)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traveler_attraction_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    traveler_id UUID NOT NULL,
    park_id TEXT NOT NULL,
    attraction_name TEXT NOT NULL,
    selected BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT traveler_attraction_selections_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT traveler_attraction_selections_traveler_id_fkey FOREIGN KEY (traveler_id) REFERENCES public.travelers(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_traveler_attraction_selections_trip_id ON public.traveler_attraction_selections(trip_id);
CREATE INDEX IF NOT EXISTS idx_traveler_attraction_selections_traveler_id ON public.traveler_attraction_selections(traveler_id);
CREATE INDEX IF NOT EXISTS idx_traveler_attraction_selections_park ON public.traveler_attraction_selections(park_id);

-- =====================================================================
-- 4. HABILITAR ROW LEVEL SECURITY (RLS) & POLÍTICAS DE ACESSO
-- =====================================================================
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_day_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_fast_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_dining_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_shows_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_ticket_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baggage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all operations for anon" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Allow all operations for anon" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- =====================================================================
-- 5. SCRIPT DE MIGRAÇÃO RÁPIDA (CASO O BANCO JÁ ESTEJA CRIADO)
-- Execute este bloco no Supabase SQL Editor se você já rodou o schema antes:
-- =====================================================================
/*
ALTER TABLE public.park_day_bookings ADD COLUMN IF NOT EXISTS fast_passes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.park_day_bookings ADD COLUMN IF NOT EXISTS dining_reservations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.park_day_bookings ADD COLUMN IF NOT EXISTS shows_and_parades JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.park_fast_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
    attraction_name TEXT NOT NULL,
    time_window TEXT NOT NULL,
    pass_type TEXT NOT NULL DEFAULT 'Lightning Lane Multi Pass',
    tier TEXT,
    status TEXT NOT NULL DEFAULT 'Agendado',
    party_members TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.park_dining_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
    restaurant_name TEXT NOT NULL,
    meal_type TEXT NOT NULL DEFAULT 'Almoço (Lunch)',
    reservation_time TEXT NOT NULL,
    confirmation_code TEXT,
    party_size INTEGER,
    table_service BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'Confirmada',
    cancellation_policy_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.park_shows_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
    show_name TEXT NOT NULL,
    show_time TEXT NOT NULL,
    location TEXT,
    reserved_area TEXT,
    status TEXT NOT NULL DEFAULT 'Agendado',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_park_fast_passes_trip_id ON public.park_fast_passes(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_fast_passes_day_id ON public.park_fast_passes(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_park_dining_reservations_trip_id ON public.park_dining_reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_dining_reservations_day_id ON public.park_dining_reservations(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_park_shows_reservations_trip_id ON public.park_shows_reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_shows_reservations_day_id ON public.park_shows_reservations(itinerary_day_id);

ALTER TABLE public.park_fast_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_dining_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_shows_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for anon" ON public.park_fast_passes;
CREATE POLICY "Allow all operations for anon" ON public.park_fast_passes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for anon" ON public.park_dining_reservations;
CREATE POLICY "Allow all operations for anon" ON public.park_dining_reservations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for anon" ON public.park_shows_reservations;
CREATE POLICY "Allow all operations for anon" ON public.park_shows_reservations FOR ALL USING (true) WITH CHECK (true);
*/

-- =====================================================================
-- MIGRATION: Tabela park_photo_packages (Pacotes de Fotos / Memory Maker)
-- Execute no Editor SQL do Supabase caso seu banco já esteja criado:
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.park_photo_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    park_day_booking_id UUID,
    itinerary_day_id UUID NOT NULL,
    name TEXT NOT NULL,
    package_type TEXT NOT NULL DEFAULT 'trip_30days',
    validity_description TEXT,
    complex TEXT NOT NULL DEFAULT 'Disney',
    included_parks JSONB DEFAULT '[]'::jsonb,
    confirmation_code TEXT,
    account_email_or_user TEXT,
    cost_usd NUMERIC(10, 2),
    cost_brl NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'Confirmado',
    payment_status TEXT NOT NULL DEFAULT 'Reservado / Confirmado',
    payer_id TEXT DEFAULT 'all',
    traveler_ids JSONB DEFAULT '["all"]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT park_photo_packages_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT park_photo_packages_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_park_photo_packages_trip_id ON public.park_photo_packages(trip_id);
CREATE INDEX IF NOT EXISTS idx_park_photo_packages_day_id ON public.park_photo_packages(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_park_photo_packages_booking_id ON public.park_photo_packages(park_day_booking_id);

ALTER TABLE public.park_photo_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for anon" ON public.park_photo_packages;
CREATE POLICY "Allow all operations for anon" ON public.park_photo_packages FOR ALL USING (true) WITH CHECK (true);

-- Compatibilidade adicional caso deseje também colunas diretas em park_day_bookings:
ALTER TABLE public.park_day_bookings 
ADD COLUMN IF NOT EXISTS has_photo_package BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS photo_package JSONB DEFAULT NULL::jsonb;

CREATE INDEX IF NOT EXISTS idx_park_day_bookings_photo_pkg ON public.park_day_bookings USING gin (photo_package);



-- Configuração persistente do motor central de regras do roteiro.
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS itinerary_rules_config JSONB NOT NULL DEFAULT '{}'::jsonb;

