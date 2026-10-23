import { supabase, isSupabaseMissingTableError } from './supabaseClient';
import { ensureValidUUID, generateDeterministicUUID } from '../utils/uuid';
import { ensurePreparationDocsForTravelers } from '../utils/prepDocs';
import { deduplicateHourlySchedule, syncAllEventsToHourlySchedule, ensureHourlyScheduleItems } from '../utils/parkScheduleUtils';
import { normalizeAttractionName } from '../utils/attractionUtils';
import {
  Trip,
  ExpenseItem,
  ExpenseCategory,
  ItineraryDay,
  FlightSegment,
  CarRentalBooking,
  AccommodationBooking,
  ParkTicketPurchase,
  PreparationDocument,
  BookingMilestone,
  BaggageItem,
  Traveler,
  GlobalSettings,
  HourlyScheduleItem,
  ParkDayBooking,
  PhotoPackageItem,
  SettlementPayment,
  TravelerAttractionSelection,
  BaggageAllowance,
} from '../types';

/**
 * Robust date sanitization for PostgreSQL DATE columns
 */
export function sanitizeDate(d?: string | null): string | null {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  if (!trimmed) return null;
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Match DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Try ISO parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

export function calculateDateOffset(startDateStr: string, daysOffset: number): string {
  try {
    const parts = (startDateStr || '').split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + daysOffset);
      const y = d.getFullYear();
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mon}-${day}`;
    }
  } catch {}
  return startDateStr;
}

/**
 * Mappers between Application camelCase and Supabase snake_case
 */

export function mapTripToDb(trip: Trip | Partial<Trip>): Record<string, any> {
  const startDate = sanitizeDate(trip.startDate) || sanitizeDate(trip.settings?.startDate) || '2026-12-30';
  const durationDays = Math.max(1, trip.durationDays || trip.settings?.durationDays || 10);
  const returnDate = sanitizeDate(trip.returnDate || trip.settings?.returnDate) || calculateDateOffset(startDate, durationDays - 1);
  const validStatus = ['Planejando', 'Confirmada', 'Concluída'].includes(trip.status || '') ? trip.status : 'Planejando';
  const validTransport = ['rental', 'public', 'uber', 'mixed'].includes(trip.settings?.transportModality || '')
    ? trip.settings?.transportModality
    : 'rental';

  const row: Record<string, any> = {
    trip_code: trip.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
    trip_name: trip.tripName || trip.settings?.tripName || 'Minha Viagem Orlando',
    destination: trip.destination || trip.settings?.destination || 'Orlando, FL',
    start_date: startDate,
    return_date: returnDate,
    duration_days: durationDays,
    travelers_count: Math.max(1, trip.travelersCount || trip.travelers?.length || 1),
    dollar_rate: Number(trip.dollarRate || trip.settings?.dollarRate || 5.75),
    total_budget_goal_brl: Number(trip.totalBudgetGoalBRL || trip.settings?.totalBudgetGoalBRL || 0),
    status: validStatus,
    cover_theme: trip.coverTheme || 'magic',
    transport_modality: validTransport,
    is_flexible_dates: Boolean(trip.isFlexibleDates ?? trip.settings?.isFlexibleDates ?? false),
    flexible_outbound_start: sanitizeDate(trip.flexibleOutboundStart || trip.settings?.flexibleOutboundStart),
    flexible_outbound_end: sanitizeDate(trip.flexibleOutboundEnd || trip.settings?.flexibleOutboundEnd),
    flexible_inbound_start: sanitizeDate(trip.flexibleInboundStart || trip.settings?.flexibleInboundStart),
    flexible_inbound_end: sanitizeDate(trip.flexibleInboundEnd || trip.settings?.flexibleInboundEnd),
    flexible_min_days: trip.flexibleMinDays || trip.settings?.flexibleMinDays || null,
    flexible_max_days: trip.flexibleMaxDays || trip.settings?.flexibleMaxDays || null,
    outbound_flexibility: trip.outboundFlexibility || trip.settings?.outboundFlexibility || null,
    inbound_flexibility: trip.inboundFlexibility || trip.settings?.inboundFlexibility || null,
    flexibility_notes: trip.flexibilityNotes || trip.settings?.flexibilityNotes || null,
    module_readiness: trip.moduleReadiness || trip.settings?.moduleReadiness || {
      flights: 'pending',
      accommodations: 'pending',
      parks: 'pending',
      transport: 'pending',
      docs: 'pending',
    },
    updated_at: new Date().toISOString(),
  };
  if (trip.id) {
    row.id = ensureValidUUID(trip.id, 'trip', trip.tripCode || 'code');
  }
  return row;
}

export function mapDbToTrip(row: any): Partial<Trip> {
  const startDate = sanitizeDate(row.start_date);
  const durationDays = Number(row.duration_days) || 10;
  const returnDate = sanitizeDate(row.return_date) || (startDate ? calculateDateOffset(startDate, durationDays - 1) : undefined);

  return {
    id: row.id,
    tripCode: row.trip_code,
    tripName: row.trip_name,
    destination: row.destination,
    startDate: startDate,
    returnDate: returnDate,
    durationDays: durationDays,
    travelersCount: row.travelers_count,
    dollarRate: Number(row.dollar_rate),
    totalBudgetGoalBRL: Number(row.total_budget_goal_brl),
    status: row.status,
    coverTheme: row.cover_theme,
    isFlexibleDates: row.is_flexible_dates,
    flexibleOutboundStart: row.flexible_outbound_start,
    flexibleOutboundEnd: row.flexible_outbound_end,
    flexibleInboundStart: row.flexible_inbound_start,
    flexibleInboundEnd: row.flexible_inbound_end,
    flexibleMinDays: row.flexible_min_days,
    flexibleMaxDays: row.flexible_max_days,
    outboundFlexibility: row.outbound_flexibility,
    inboundFlexibility: row.inbound_flexibility,
    flexibilityNotes: row.flexibility_notes,
    moduleReadiness: row.module_readiness || {
      flights: 'pending',
      accommodations: 'pending',
      parks: 'pending',
      transport: 'pending',
      docs: 'pending',
    },
    createdAt: row.created_at,
  };
}

export function mapTravelerToDb(traveler: Traveler, tripId: string): Record<string, any> {
  const role = traveler.role === 'admin' ? 'admin' : 'traveler';
  const row: Record<string, any> = {
    trip_id: tripId,
    name: traveler.name,
    email: traveler.email || null,
    avatar_color: traveler.avatarColor || '#3B82F6',
    avatar_icon: traveler.avatarIcon || null,
    role: role,
    updated_at: new Date().toISOString(),
  };
  if (traveler.id) {
    row.id = ensureValidUUID(traveler.id, 'traveler', traveler.id);
  }
  return row;
}

export function mapDbToTraveler(row: any): Traveler {
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    avatarColor: row.avatar_color,
    avatarIcon: row.avatar_icon,
    role: row.role,
  };
}

/**
 * Helper to sanitize traveler IDs for Foreign Key UUID columns.
 * If 'all' or empty, returns null (so the DB foreign key is valid and null represents group/all).
 */
export function sanitizeTravelerForeignKey(id?: string | null): string | null {
  if (!id || id === 'all' || id === 'grupo') return null;
  return ensureValidUUID(id, 'traveler', id);
}

export function mapExpenseToDb(item: ExpenseItem, tripId: string, fallbackTravelerId?: string | null): Record<string, any> {
  const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
  const validDbCategories = [
    'Passagens',
    'Hospedagem',
    'Ingressos',
    'Pacotes de Fotos',
    'Alimentação',
    'Compras',
    'Transporte',
    'Seguro',
    'Documentos',
  ];
  const category = validDbCategories.includes(item.category) ? item.category : 'Pacotes de Fotos';

  const validStatuses = ['Pago', 'Pendente', 'Parcial', 'Não iniciado'];
  const status = validStatuses.includes(item.status) ? item.status : 'Pendente';

  const usd = item.estimatedValueUSD !== undefined && item.estimatedValueUSD !== null && !isNaN(Number(item.estimatedValueUSD))
    ? Number(item.estimatedValueUSD)
    : 0;
  const brl = item.estimatedValueBRL !== undefined && item.estimatedValueBRL !== null && !isNaN(Number(item.estimatedValueBRL))
    ? Number(item.estimatedValueBRL)
    : 0;
  const paidBrl = item.paidValueBRL !== undefined && item.paidValueBRL !== null && !isNaN(Number(item.paidValueBRL))
    ? Number(item.paidValueBRL)
    : 0;

  const rawPayer = item.payerId || item.responsibleTravelerId || null;
  const payerFk = sanitizeTravelerForeignKey(rawPayer);

  // If payerFk is null ("cada um pagou o seu" / grupo), payer_id remains null.
  // responsible_traveler_id will receive a valid traveler fallback only if provided (to satisfy legacy not-null schemas).
  const respTravelerFk = payerFk || (fallbackTravelerId ? sanitizeTravelerForeignKey(fallbackTravelerId) : null);

  const cleanSourceId = item.sourceId ? ensureValidUUID(item.sourceId, 'source', item.sourceId) : null;
  const sourceType = item.sourceType || (item.category === 'Pacotes de Fotos' || item.title?.toLowerCase().includes('pacote de fotos') ? 'photo_package' : null);

  const row: Record<string, any> = {
    trip_id: cleanTripId,
    title: (item.title || 'Despesa').trim(),
    category,
    estimated_value_usd: usd,
    estimated_value_brl: brl,
    paid_value_brl: paidBrl,
    paid_value_usd: item.paidValueUSD ? Number(item.paidValueUSD) : null,
    status,
    responsible_traveler_id: respTravelerFk,
    payer_id: payerFk,
    source_type: sourceType,
    source_id: cleanSourceId,
    traveler_ids: (item.travelerIds || [rawPayer || 'all']).map((tid) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    excluded: Boolean(item.excluded),
    notes: item.notes || null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_by: item.updatedBy || null,
    updated_at: new Date().toISOString(),
  };
  if (item.id) {
    row.id = ensureValidUUID(item.id, 'expense', item.title);
  }
  return row;
}

export function mapDbToExpense(row: any): ExpenseItem {
  // Se payer_id no banco for null, significa que foi dividido / cada um pagou o seu ('all')
  const payerId = row.payer_id ? row.payer_id : 'all';
  const respTravelerId = row.responsible_traveler_id || row.payer_id || 'all';

  let category: ExpenseCategory = (row.category as ExpenseCategory) || 'Compras';
  if (
    row.source_type === 'photo_package' ||
    row.category === 'Pacotes de Fotos' ||
    (row.title && row.title.toLowerCase().startsWith('pacote de fotos'))
  ) {
    category = 'Pacotes de Fotos';
  }

  return {
    id: row.id,
    title: row.title || 'Despesa',
    category,
    estimatedValueUSD: Number(row.estimated_value_usd || 0),
    estimatedValueBRL: Number(row.estimated_value_brl || 0),
    paidValueBRL: Number(row.paid_value_brl || 0),
    paidValueUSD: row.paid_value_usd ? Number(row.paid_value_usd) : undefined,
    status: row.status || 'Pendente',
    payerId: payerId,
    responsibleTravelerId: respTravelerId,
    sourceType: row.source_type || (category === 'Pacotes de Fotos' ? 'photo_package' : undefined),
    sourceId: row.source_id,
    travelerIds: Array.isArray(row.traveler_ids) && row.traveler_ids.length > 0
      ? row.traveler_ids.map((tid: string) => (tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'))
      : ['all'],
    excluded: Boolean(row.excluded),
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Deleta rigorosamente qualquer gasto vinculado a uma origem (voo, hospedagem, etc.)
 * procurando por ID determinístico, ID legado com prefixo ('exp-flight-...', 'exp-acc-...'),
 * e pelos pares (trip_id, source_type, source_id) e (trip_id, source_id).
 */
export async function deleteExpensesBySourceInDb(
  tripId: string,
  sourceType: 'flight' | 'accommodation' | 'car_rental' | 'park_ticket' | 'photo_package',
  sourceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!tripId || !tripId.trim()) {
      return { success: false, error: 'tripId obrigatório para exclusão de despesas' };
    }
    if (!sourceId) return { success: true };
    const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
    const typeMap: Record<string, string> = {
      flight: 'flight-expense',
      accommodation: 'acc-expense',
      car_rental: 'car-expense',
      park_ticket: 'ticket-expense',
      photo_package: 'photo-expense',
    };
    const expId = generateDeterministicUUID(typeMap[sourceType] || sourceType, sourceId);
    const legacyPrefix = sourceType === 'accommodation' ? 'acc' : sourceType === 'flight' ? 'flight' : sourceType;
    const legacyId = `exp-${legacyPrefix}-${sourceId}`;

    // 1. Exclusão por ID determinístico e legado restritos à viagem e ao source_type
    const { error: err1 } = await supabase
      .from('expenses')
      .delete()
      .eq('trip_id', cleanTripId)
      .eq('source_type', sourceType)
      .in('id', [expId, legacyId]);

    if (err1 && !isSupabaseMissingTableError(err1)) {
      return { success: false, error: err1.message };
    }

    // 2. Exclusão restrita por trip_id + source_type + source_id
    const { error: err2 } = await supabase
      .from('expenses')
      .delete()
      .eq('trip_id', cleanTripId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (err2 && !isSupabaseMissingTableError(err2)) {
      return { success: false, error: err2.message };
    }

    return { success: true };
  } catch (err: any) {
    if (!isSupabaseMissingTableError(err)) {
      console.warn('deleteExpensesBySourceInDb notice:', err);
    }
    return { success: false, error: err?.message || 'Erro ao excluir despesa' };
  }
}

/**
 * Auxiliar para restauração de compensação em caso de falha em etapas de exclusão.
 * Verifica os erros de cada operação de upsert e confirma se a restauração foi bem-sucedida.
 */
async function rollbackCompensation(
  snapshotExpenses: any[],
  snapshotSchedules: any[]
): Promise<{ success: boolean; error?: string }> {
  const errors: string[] = [];

  if (snapshotExpenses && snapshotExpenses.length > 0) {
    const { error: expErr } = await supabase.from('expenses').upsert(snapshotExpenses, { onConflict: 'id' });
    if (expErr && !isSupabaseMissingTableError(expErr)) {
      errors.push(`Restauração de despesas falhou: ${expErr.message}`);
    }
  }

  if (snapshotSchedules && snapshotSchedules.length > 0) {
    const { error: schedErr } = await supabase.from('hourly_schedules').upsert(snapshotSchedules, { onConflict: 'id' });
    if (schedErr && !isSupabaseMissingTableError(schedErr)) {
      errors.push(`Restauração de horários falhou: ${schedErr.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('; ') };
  }
  return { success: true };
}

/**
 * Sincroniza um gasto de outra tabela (voos, hotéis, etc.) com a tabela de expenses central.
 * Regra obrigatória: se o valor for zero nas duas moedas (USD e BRL), a despesa vinculada
 * é imediatamente excluída da tabela de expenses, mesmo se o status estiver como "Pago".
 */
async function syncToExpenses(
  tripId: string, 
  sourceType: 'flight' | 'accommodation' | 'car_rental' | 'park_ticket' | 'photo_package',
  sourceId: string,
  data: {
    title: string;
    category: any;
    usd: number;
    brl: number;
    payerId: string;
    travelerIds: string[];
    status: any;
    notes?: string;
  },
  fallbackTrip?: Partial<Trip>
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
    const numUsd = Number(data.usd) || 0;
    const numBrl = Number(data.brl) || 0;

    // Regra obrigatória: se a cobrança for zero nas duas moedas, nenhuma despesa pode existir vinculada ao item
    if (numUsd <= 0 && numBrl <= 0) {
      const delRes = await deleteExpensesBySourceInDb(cleanTripId, sourceType, sourceId);
      if (!delRes.success) {
        return { success: false, error: delRes.error || 'Falha ao excluir despesa zerada no Supabase' };
      }
      return { success: true };
    }

    const typeMap: Record<string, string> = {
      flight: 'flight-expense',
      accommodation: 'acc-expense',
      car_rental: 'car-expense',
      park_ticket: 'ticket-expense',
      photo_package: 'photo-expense'
    };

    const expId = generateDeterministicUUID(typeMap[sourceType] || sourceType, sourceId);
    const legacyPrefix = sourceType === 'accommodation' ? 'acc' : sourceType === 'flight' ? 'flight' : sourceType;
    const legacyId = `exp-${legacyPrefix}-${sourceId}`;

    // Sincronização idempotente: remover registros paralelos/duplicados da mesma origem/tipo antes de gravar
    try {
      const { data: existingRows, error: selectErr } = await supabase
        .from('expenses')
        .select('id, source_type, source_id')
        .eq('trip_id', cleanTripId);

      if (selectErr && !isSupabaseMissingTableError(selectErr)) {
        return { success: false, error: selectErr.message };
      }

      if (existingRows && existingRows.length > 0) {
        const idsToDelete = existingRows
          .filter((r: any) =>
            (r.source_type === sourceType && r.source_id === sourceId) ||
            r.id === legacyId
          )
          .map((r: any) => r.id)
          .filter((id: string) => id !== expId);

        if (idsToDelete.length > 0) {
          const { error: dedupDelErr } = await supabase
            .from('expenses')
            .delete()
            .eq('trip_id', cleanTripId)
            .in('id', idsToDelete);
          if (dedupDelErr && !isSupabaseMissingTableError(dedupDelErr)) {
            return { success: false, error: dedupDelErr.message };
          }
        }
      }
    } catch (dedupErr: any) {
      return { success: false, error: dedupErr?.message || 'Erro ao verificar duplicatas de despesas' };
    }

    const expenseItem: ExpenseItem = {
      id: expId,
      title: data.title,
      category: data.category,
      estimatedValueUSD: numUsd,
      estimatedValueBRL: numBrl,
      paidValueBRL: data.status === 'Pago' ? numBrl : 0,
      paidValueUSD: data.status === 'Pago' ? numUsd : 0,
      status: data.status,
      payerId: data.payerId,
      responsibleTravelerId: data.payerId,
      travelerIds: data.travelerIds,
      sourceType,
      sourceId,
      excluded: false,
      notes: data.notes
    };

    // Obter viajante de fallback caso a coluna no banco ainda tenha restrição NOT NULL em schemas legados
    let defaultTravelerId: string | null = null;
    if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
      defaultTravelerId = fallbackTrip.travelers[0].id;
    }

    let row = mapExpenseToDb(expenseItem, cleanTripId, defaultTravelerId);
    let { error } = await supabase.from('expenses').upsert(row, { onConflict: 'id' });

    // Se falhar por restrição NOT NULL em responsible_traveler_id, busca o primeiro viajante da viagem no banco e repete
    if (error && (error.message?.includes('responsible_traveler_id') || error.code === '23502')) {
      const { data: dbTraveler } = await supabase
        .from('travelers')
        .select('id')
        .eq('trip_id', cleanTripId)
        .limit(1)
        .maybeSingle();

      if (dbTraveler?.id) {
        row = mapExpenseToDb(expenseItem, cleanTripId, dbTraveler.id);
        const retryResult = await supabase.from('expenses').upsert(row, { onConflict: 'id' });
        error = retryResult.error;
      }
    }

    if (error) {
      if (isSupabaseMissingTableError(error)) {
        return { success: false, error: 'Tabela expenses aguardando criação no Supabase.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error(`Erro ao sincronizar gasto (${sourceType}):`, err);
    return { success: false, error: err?.message || 'Erro ao sincronizar gasto' };
  }
}

export function mapItineraryDayToDb(day: Omit<ItineraryDay, 'date'> & { date?: string }, tripId: string): Record<string, any> {
  const row: Record<string, any> = {
    trip_id: tripId,
    day_number: day.dayNumber,
    date: sanitizeDate(day.date),
    title: day.title,
    park: day.park || 'Sem Parque',
    completed: !!day.completed,
    morning: day.morning || { notes: '', where: '', dining: '' },
    afternoon: day.afternoon || { notes: '', where: '', dining: '' },
    night: day.night || { notes: '', where: '', dining: '' },
    general_notes: day.generalNotes || '',
    hourly_schedule: (day as any).hourlySchedule || [],
    updated_at: new Date().toISOString(),
  };
  if (day.id) {
    row.id = ensureValidUUID(day.id, 'day', tripId + '-' + day.dayNumber);
  }
  return row;
}

export function mapDbToItineraryDay(row: any): ItineraryDay {
  let parsedHourly: HourlyScheduleItem[] = [];
  if (Array.isArray(row.hourly_schedule)) {
    parsedHourly = row.hourly_schedule;
  } else if (typeof row.hourly_schedule === 'string' && row.hourly_schedule.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(row.hourly_schedule);
      if (Array.isArray(parsed)) parsedHourly = parsed;
    } catch {}
  } else if (Array.isArray(row.hourlySchedule)) {
    parsedHourly = row.hourlySchedule;
  }

  return {
    id: row.id,
    dayNumber: Number(row.day_number) || 1,
    date: sanitizeDate(row.date) || '',
    title: row.title,
    park: row.park,
    completed: Boolean(row.completed),
    morning: row.morning || { notes: '', where: '', dining: '' },
    afternoon: row.afternoon || { notes: '', where: '', dining: '' },
    night: row.night || { notes: '', where: '', dining: '' },
    generalNotes: row.general_notes || '',
    hourlySchedule: deduplicateHourlySchedule(parsedHourly),
  };
}

const VALID_HOURLY_CATEGORIES = [
  'transport',
  'park',
  'dining',
  'hotel',
  'shopping',
  'flight',
  'other',
] as const;

export function mapHourlyScheduleToDb(
  item: HourlyScheduleItem,
  itineraryDayId: string,
  tripId: string,
  index: number = 0
): Record<string, any> {
  const rawCat = (item.category || '').toLowerCase();
  const category = (VALID_HOURLY_CATEGORIES as readonly string[]).includes(rawCat)
    ? rawCat
    : 'other';

  const cleanTime = (item.time || '08:00').trim();
  const timeMatch = cleanTime.match(/(\d{1,2}:\d{2})/);
  const time = timeMatch
    ? (timeMatch[1].length === 4 ? `0${timeMatch[1]}` : timeMatch[1])
    : '08:00';

  const rowId = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
    ? item.id
    : ensureValidUUID(item.id, 'hourly', `${itineraryDayId}-${item.sourceType || 'gen'}-${item.sourceId || ''}-${time}-${(item.title || '').trim()}`);

  return {
    id: rowId,
    itinerary_day_id: itineraryDayId,
    trip_id: tripId,
    time,
    title: (item.title || 'Atividade').trim(),
    location: item.location ? item.location.trim() : null,
    category,
    completed: Boolean(item.completed),
    notes: item.notes ? item.notes.trim() : null,
    source_type: item.sourceType || (item.id?.startsWith('auto-show') ? 'show' : null),
    source_id: item.sourceId || null,
    created_at: new Date().toISOString(),
  };
}

export function mapDbToHourlySchedule(row: any): HourlyScheduleItem {
  const rawCat = (row.category || '').toLowerCase();
  const category = (VALID_HOURLY_CATEGORIES as readonly string[]).includes(rawCat)
    ? (rawCat as HourlyScheduleItem['category'])
    : 'other';

  return {
    id: row.id,
    time: row.time || '08:00',
    title: row.title || '',
    location: row.location || undefined,
    category,
    completed: Boolean(row.completed),
    notes: row.notes || undefined,
    sourceType: row.source_type || row.sourceType || undefined,
    sourceId: row.source_id || row.sourceId || undefined,
  };
}

export function mapParkBookingToDb(
  booking: ParkDayBooking,
  itineraryDayId: string,
  tripId: string
): Record<string, any> {
  const row: Record<string, any> = {
    itinerary_day_id: itineraryDayId,
    trip_id: tripId,
    day_number: booking.dayNumber || 1,
    park_name: booking.parkName || 'Sem Parque',
    park_id: booking.parkId || null,
    park_hours: booking.parkHours || { openingTime: '09:00', closingTime: '21:00', earlyEntryTime: '08:30' },
    park_pass_status: booking.parkPassStatus || 'Confirmado no App',
    confirmation_code: booking.confirmationCode || null,
    ticket_type: booking.ticketType || null,
    rope_drop_plan: booking.ropeDropPlan || null,
    fast_passes: Array.isArray(booking.fastPasses) ? booking.fastPasses.map(fp => ensureValidUUID(fp.id, 'fastpass', `${itineraryDayId}-${fp.attractionName}-${fp.timeWindow}`)) : [],
    dining_reservations: Array.isArray(booking.diningReservations) ? booking.diningReservations.map(dr => ensureValidUUID(dr.id, 'dining', `${itineraryDayId}-${dr.restaurantName}-${dr.time}`)) : [],
    shows_and_parades: Array.isArray(booking.showsAndParades) ? booking.showsAndParades.map(s => ensureValidUUID(s.id, 'show', `${itineraryDayId}-${s.showName}-${s.time}`)) : [],
    has_photo_package: Boolean(booking.hasPhotoPackage || booking.photoPackage),
    photo_package: booking.hasPhotoPackage && booking.photoPackage ? ensureValidUUID(booking.photoPackage.id, 'photo-pkg', `${itineraryDayId}-${booking.photoPackage.name}`) : null,
    notes: booking.notes || null,
    updated_at: new Date().toISOString(),
  };
  if (booking.id) {
    row.id = ensureValidUUID(booking.id, 'park-booking', itineraryDayId);
  }
  return row;
}

export function mapDbToParkBooking(row: any): ParkDayBooking {
  let parkHours = { openingTime: '09:00', closingTime: '21:00' };
  if (row.park_hours) {
    if (typeof row.park_hours === 'string') {
      try {
        parkHours = JSON.parse(row.park_hours);
      } catch {}
    } else if (typeof row.park_hours === 'object') {
      parkHours = row.park_hours;
    }
  }

  const parseJsonField = (val: any, fallback: any = []) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const fastPasses = parseJsonField(row.fast_passes, []);
  const diningReservations = parseJsonField(row.dining_reservations, []);
  const showsAndParades = parseJsonField(row.shows_and_parades, []);
  const photoPkgRaw = parseJsonField(row.photo_package, null);

  return {
    id: row.id,
    dayNumber: Number(row.day_number) || 1,
    date: row.date || '',
    parkName: row.park_name || '',
    parkId: row.park_id || undefined,
    parkHours,
    parkPassStatus: row.park_pass_status || 'Confirmado no App',
    confirmationCode: row.confirmation_code || undefined,
    ticketType: row.ticket_type || undefined,
    ropeDropPlan: row.rope_drop_plan || undefined,
    fastPasses: Array.isArray(fastPasses) ? fastPasses : [],
    diningReservations: Array.isArray(diningReservations) ? diningReservations : [],
    showsAndParades: Array.isArray(showsAndParades) ? showsAndParades : [],
    hasPhotoPackage: Boolean(row.has_photo_package || photoPkgRaw),
    photoPackage: photoPkgRaw && typeof photoPkgRaw === 'object' ? photoPkgRaw : undefined,
    notes: row.notes || undefined,
  };
}

export function mapFlightToDb(f: FlightSegment, tripId: string): Record<string, any> {
  const validTypes = ['outbound', 'inbound', 'connection', 'extra'];
  const type = validTypes.includes(f.type) ? f.type : 'outbound';
  const validCabins = ['Econômica', 'Premium Economy', 'Executiva', 'Primeira Classe'];
  const cabinClass = validCabins.includes(f.cabinClass) ? f.cabinClass : 'Econômica';

  const row: Record<string, any> = {
    trip_id: tripId,
    type,
    type_label: f.typeLabel || 'Voo',
    airline: f.airline || 'Companhia Aérea',
    airline_code: f.airlineCode || null,
    flight_number: f.flightNumber || '0000',
    pnr_locator: f.pnrLocator || 'N/A',
    origin_airport: f.originAirport || 'Origem',
    origin_city: f.originCity || null,
    origin_code: f.originCode || null,
    destination_airport: f.destinationAirport || 'Destino',
    destination_city: f.destinationCity || null,
    destination_code: f.destinationCode || null,
    departure_date: sanitizeDate(f.departureDate),
    departure_time: f.departureTime || '00:00',
    arrival_date: sanitizeDate(f.arrivalDate),
    arrival_time: f.arrivalTime || '00:00',
    duration: f.duration || null,
    stopovers: f.stopovers || 'Voo Direto',
    cabin_class: cabinClass,
    seats: f.seats || null,
    terminal_origin: f.terminalOrigin || null,
    terminal_destination: f.terminalDestination || null,
    gate: f.gate || null,
    baggage_allowance: f.baggageAllowance || { personalItem: true, carryOnQty: 1, checkedQty: 1, notes: '' },
    status: f.status && f.status !== 'Pago' && f.status !== 'Pendente' ? f.status : 'Emitido / Confirmado',
    payment_status: f.paymentStatus && f.paymentStatus !== 'Não informado' ? f.paymentStatus : null,
    ticket_cost_usd: f.ticketCostUSD ? Number(f.ticketCostUSD) : null,
    ticket_cost_brl: f.ticketCostBRL ? Number(f.ticketCostBRL) : null,
    payer_id: sanitizeTravelerForeignKey(f.payerId),
    notes: f.notes || null,
    passengers: f.passengers || [],
    traveler_ids: (f.travelerIds || ['all']).map((tid) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    updated_at: new Date().toISOString(),
  };
  if (f.id) {
    row.id = ensureValidUUID(f.id, 'flight', tripId + '-' + f.flightNumber);
  }
  return row;
}

export function mapDbToFlight(row: any): FlightSegment {
  let baggageAllowance: BaggageAllowance = {};
  if (typeof row.baggage_allowance === 'string') {
    try {
      baggageAllowance = JSON.parse(row.baggage_allowance);
    } catch {
      baggageAllowance = { notes: row.baggage_allowance };
    }
  } else if (row.baggage_allowance && typeof row.baggage_allowance === 'object') {
    baggageAllowance = row.baggage_allowance;
  }

  // Identificar status operacional do voo e status de pagamento
  let operationalStatus: string = row.status || 'Emitido / Confirmado';
  let paymentStatus: 'Pago' | 'Pendente' | 'Não informado' = 'Não informado';

  if (row.payment_status) {
    if (row.payment_status === 'Pago') paymentStatus = 'Pago';
    else if (row.payment_status === 'Pendente') paymentStatus = 'Pendente';
    else paymentStatus = 'Não informado';
  } else if (row.status === 'Pago') {
    // Valor legado inequivocamente de pagamento
    paymentStatus = 'Pago';
    operationalStatus = 'Emitido / Confirmado';
  } else if (row.status === 'Pendente') {
    // Valor legado inequivocamente de pagamento
    paymentStatus = 'Pendente';
    operationalStatus = 'Emitido / Confirmado';
  } else {
    // Para registros antigos sem status de pagamento identificável, exibe 'Não informado'
    paymentStatus = 'Não informado';
  }

  return {
    id: row.id,
    type: row.type,
    typeLabel: row.type_label,
    airline: row.airline,
    airlineCode: row.airline_code,
    flightNumber: row.flight_number,
    departureAirport: row.departure_airport || row.origin_airport || row.origin_code || '',
    arrivalAirport: row.arrival_airport || row.destination_airport || row.destination_code || '',
    pnrLocator: row.pnr_locator,
    originAirport: row.origin_airport,
    originCity: row.origin_city,
    originCode: row.origin_code,
    destinationAirport: row.destination_airport,
    destinationCity: row.destination_city,
    destinationCode: row.destination_code,
    departureDate: row.departure_date,
    departureTime: row.departure_time,
    arrivalDate: row.arrival_date,
    arrivalTime: row.arrival_time,
    duration: row.duration,
    stopovers: row.stopovers,
    cabinClass: row.cabin_class,
    seats: row.seats,
    terminalOrigin: row.terminal_origin,
    terminalDestination: row.terminal_destination,
    gate: row.gate,
    baggageAllowance,
    status: operationalStatus,
    paymentStatus,
    ticketCostUSD: row.ticket_cost_usd ? Number(row.ticket_cost_usd) : undefined,
    ticketCostBRL: row.ticket_cost_brl ? Number(row.ticket_cost_brl) : undefined,
    payerId: row.payer_id || 'all',
    notes: row.notes,
    passengers: row.passengers || [],
    travelerIds: (row.traveler_ids || ['all']).map((tid: string) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
  };
}

export function mapCarRentalToDb(c: CarRentalBooking, tripId: string): Record<string, any> {
  const row: Record<string, any> = {
    trip_id: tripId,
    company: c.company || 'Locadora',
    confirmation_code: c.confirmationCode || 'N/A',
    category: c.category || 'SUV / Sedan',
    pickup_location: c.pickupLocation || 'Aeroporto',
    pickup_date: sanitizeDate(c.pickupDate),
    pickup_time: c.pickupTime || '12:00',
    dropoff_location: c.dropoffLocation || 'Aeroporto',
    dropoff_date: sanitizeDate(c.dropoffDate),
    dropoff_time: c.dropoffTime || '12:00',
    cost_usd: c.costUSD ? Number(c.costUSD) : null,
    cost_brl: c.costBRL ? Number(c.costBRL) : null,
    status: c.status || 'Reservado / Confirmado',
    payment_status: c.paymentStatus && c.paymentStatus !== 'Não informado' ? c.paymentStatus : null,
    payer_id: sanitizeTravelerForeignKey(c.payerId),
    driver_name: c.driverName || null,
    included_insurances: c.includedInsurances || [],
    toll_option: c.tollOption || 'Visitor Toll Pass',
    traveler_ids: (c.travelerIds || ['all']).map((tid) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    notes: c.notes || null,
    updated_at: new Date().toISOString(),
  };
  if (c.id) {
    row.id = ensureValidUUID(c.id, 'car', tripId + '-' + c.confirmationCode);
  }
  return row;
}

export function mapDbToCarRental(row: any): CarRentalBooking {
  let operationalStatus: string = row.status || 'Reservado / Confirmado';
  let paymentStatus: 'Pago' | 'Pendente' | 'Não informado' = 'Não informado';

  if (row.payment_status) {
    if (row.payment_status === 'Pago') paymentStatus = 'Pago';
    else if (row.payment_status === 'Pendente') paymentStatus = 'Pendente';
    else paymentStatus = 'Não informado';
  } else if (row.status === 'Pago') {
    paymentStatus = 'Pago';
    operationalStatus = 'Reservado / Confirmado';
  } else if (row.status === 'Pendente' || row.status === 'Falta Pagar') {
    paymentStatus = 'Pendente';
    operationalStatus = 'Reservado / Confirmado';
  } else {
    paymentStatus = 'Não informado';
  }

  return {
    id: row.id,
    company: row.company,
    confirmationCode: row.confirmation_code,
    category: row.category,
    pickupLocation: row.pickup_location,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    dropoffLocation: row.dropoff_location,
    dropoffDate: row.dropoff_date,
    dropoffTime: row.dropoff_time,
    costUSD: row.cost_usd ? Number(row.cost_usd) : undefined,
    costBRL: row.cost_brl ? Number(row.cost_brl) : undefined,
    status: operationalStatus,
    paymentStatus,
    payerId: row.payer_id || 'all',
    driverName: row.driver_name,
    includedInsurances: row.included_insurances || [],
    tollOption: row.toll_option,
    travelerIds: (row.traveler_ids || ['all']).map((tid: string) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    notes: row.notes,
  };
}

export function mapAccommodationToDb(a: AccommodationBooking, tripId: string): Record<string, any> {
  const validTypes = ['hotel', 'resort', 'airbnb', 'house', 'other'];
  const type = validTypes.includes(a.type) ? a.type : 'hotel';

  const operationalStatus =
    a.status && a.status !== 'Pago' && a.status !== 'Pendente' && a.status !== 'Não informado'
      ? a.status
      : 'Reservado / Confirmado';

  const checkIn = sanitizeDate(a.checkInDate) || '2026-12-30';
  const checkOut = sanitizeDate(a.checkOutDate) || '2027-01-10';

  const row: Record<string, any> = {
    trip_id: tripId,
    type,
    name: a.name || 'Hospedagem',
    confirmation_code: a.confirmationCode || 'Não informado',
    address: a.address || 'Orlando, FL',
    check_in_date: checkIn,
    check_in_time: a.checkInTime || '15:00',
    check_out_date: checkOut,
    check_out_time: a.checkOutTime || '11:00',
    room_type: a.roomType || null,
    cost_usd: a.costUSD !== undefined && a.costUSD !== null && !isNaN(Number(a.costUSD)) ? Number(a.costUSD) : null,
    cost_brl: a.costBRL !== undefined && a.costBRL !== null && !isNaN(Number(a.costBRL)) ? Number(a.costBRL) : null,
    status: operationalStatus,
    payment_status: a.paymentStatus && a.paymentStatus !== 'Não informado' ? a.paymentStatus : null,
    payer_id: sanitizeTravelerForeignKey(a.payerId),
    guest_name: a.guestName || null,
    total_guests: typeof a.totalGuests === 'number' && !isNaN(a.totalGuests) && a.totalGuests > 0 ? Math.floor(a.totalGuests) : 1,
    amenities: Array.isArray(a.amenities) ? a.amenities : [],
    traveler_ids: (a.travelerIds || ['all']).map((tid) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    contact_phone: a.contactPhone || null,
    notes: a.notes || null,
    updated_at: new Date().toISOString(),
  };
  if (a.id) {
    row.id = ensureValidUUID(a.id, 'accommodation', tripId + '-' + a.confirmationCode);
  }
  return row;
}

export function mapDbToAccommodation(row: any): AccommodationBooking {
  let operationalStatus: string = row.status || 'Reservado / Confirmado';
  let paymentStatus: 'Pago' | 'Pendente' | 'Não informado' = 'Não informado';

  if (row.payment_status) {
    if (row.payment_status === 'Pago') paymentStatus = 'Pago';
    else if (row.payment_status === 'Pendente') paymentStatus = 'Pendente';
    else paymentStatus = 'Não informado';
  } else if (row.status === 'Pago') {
    paymentStatus = 'Pago';
    operationalStatus = 'Reservado / Confirmado';
  } else if (row.status === 'Pendente' || row.status === 'Falta Pagar') {
    paymentStatus = 'Pendente';
    operationalStatus = 'Reservado / Confirmado';
  } else {
    paymentStatus = 'Não informado';
  }

  return {
    id: row.id,
    type: row.type || 'hotel',
    name: row.name || 'Hospedagem',
    confirmationCode: row.confirmation_code || '',
    address: row.address || '',
    checkInDate: row.check_in_date || '2026-12-30',
    checkInTime: row.check_in_time || '15:00',
    checkOutDate: row.check_out_date || '2027-01-10',
    checkOutTime: row.check_out_time || '11:00',
    roomType: row.room_type || undefined,
    costUSD: row.cost_usd !== null && row.cost_usd !== undefined ? Number(row.cost_usd) : undefined,
    costBRL: row.cost_brl !== null && row.cost_brl !== undefined ? Number(row.cost_brl) : undefined,
    status: operationalStatus,
    paymentStatus,
    payerId: row.payer_id || 'all',
    guestName: row.guest_name || undefined,
    totalGuests: row.total_guests !== null && row.total_guests !== undefined ? Number(row.total_guests) : 1,
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    travelerIds: (row.traveler_ids || ['all']).map((tid: string) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    contactPhone: row.contact_phone || undefined,
    notes: row.notes || undefined,
  };
}

export function mapParkTicketToDb(t: ParkTicketPurchase, tripId: string): Record<string, any> {
  const row: Record<string, any> = {
    trip_id: tripId,
    title: t.title,
    type: t.type || 'individual',
    complex: t.complex,
    parks_included: t.parksIncluded || [],
    days_count: t.daysCount || 1,
    ticket_option: t.ticketOption || null,
    traveler_ids: (t.travelerIds || ['all']).map((tid) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    quantity: t.quantity || 1,
    cost_usd: t.costUSD ? Number(t.costUSD) : null,
    cost_brl: t.costBRL ? Number(t.costBRL) : null,
    payment_status: t.paymentStatus || 'Não informado',
    payer_id: sanitizeTravelerForeignKey(t.payerId),
    confirmation_code: t.confirmationCode || null,
    seller: t.seller || null,
    notes: t.notes || null,
    updated_at: new Date().toISOString(),
  };
  if (t.id) {
    row.id = ensureValidUUID(t.id, 'ticket', tripId + '-' + t.title);
  }
  return row;
}

export function mapDbToParkTicket(row: any): ParkTicketPurchase {
  let paymentStatus: ParkTicketPurchase['paymentStatus'] = 'Não informado';
  if (row.payment_status === 'Pago') {
    paymentStatus = 'Pago';
  } else if (row.payment_status === 'Pendente') {
    paymentStatus = 'Pendente';
  } else if (row.payment_status === 'Não informado') {
    paymentStatus = 'Não informado';
  } else if (row.payment_status) {
    paymentStatus = row.payment_status;
  } else {
    paymentStatus = 'Não informado';
  }

  return {
    id: row.id,
    title: row.title,
    type: row.type,
    complex: row.complex,
    parksIncluded: row.parks_included || [],
    daysCount: row.days_count,
    ticketOption: row.ticket_option,
    travelerIds: (row.traveler_ids || ['all']).map((tid: string) =>
      tid && tid !== 'all' ? ensureValidUUID(tid, 'traveler', tid) : 'all'
    ),
    quantity: row.quantity,
    costUSD: row.cost_usd ? Number(row.cost_usd) : undefined,
    costBRL: row.cost_brl ? Number(row.cost_brl) : undefined,
    paymentStatus,
    payerId: row.payer_id || 'all',
    confirmationCode: row.confirmation_code,
    seller: row.seller,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapPrepDocToDb(doc: PreparationDocument, tripId: string): Record<string, any> {
  const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
  const cleanTravelerId = doc.travelerId ? ensureValidUUID(doc.travelerId, 'traveler', doc.travelerId) : null;
  const seed = `${cleanTripId}-${cleanTravelerId || 'shared'}-${doc.title || doc.id}`;
  const docId = ensureValidUUID(doc.id, 'prep-doc', seed);

  const row: Record<string, any> = {
    id: docId,
    trip_id: cleanTripId,
    title: doc.title,
    subtitle: doc.subtitle || '',
    status: doc.status || 'Pendente',
    completed: !!doc.completed,
    completed_by_travelers: doc.completedByTravelers || {},
    traveler_id: cleanTravelerId,
    sub_items: (doc.subItems || []).map((sub, idx) => ({
      id: ensureValidUUID(sub.id, 'sub-item', `${cleanTripId}-${cleanTravelerId || 'shared'}-${doc.title}-${idx}-${sub.title}`),
      title: sub.title,
      completed: !!sub.completed,
      completedByTravelers: sub.completedByTravelers || {},
    })),
    tips: doc.tips || [],
    links: doc.links || [],
    updated_at: new Date().toISOString(),
  };
  return row;
}

export function mapDbToPrepDoc(row: any): PreparationDocument {
  const subItemsRaw = Array.isArray(row.sub_items) ? row.sub_items : [];
  const subItems = subItemsRaw.map((sub: any) => ({
    id: sub.id,
    title: sub.title,
    completed: Boolean(sub.completed),
    completedByTravelers: sub.completedByTravelers || sub.completed_by_travelers || {},
  }));

  return {
    id: row.id,
    travelerId: row.traveler_id,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status || 'Pendente',
    completed: Boolean(row.completed),
    completedByTravelers: row.completed_by_travelers || row.completedByTravelers || {},
    subItems,
    tips: row.tips || [],
    links: row.links || [],
  };
}

export function mapBaggageToDb(item: BaggageItem, tripId: string): Record<string, any> {
  const row: Record<string, any> = {
    trip_id: tripId,
    traveler_id: ensureValidUUID(item.travelerId, 'traveler', item.travelerId),
    category: item.category,
    name: item.name,
    packed: !!item.packed,
    quantity: item.quantity || 1,
    updated_at: new Date().toISOString(),
  };
  if (item.id) {
    row.id = ensureValidUUID(item.id, 'baggage', tripId + '-' + item.travelerId + '-' + item.name);
  }
  return row;
}

export function mapDbToBaggage(row: any): BaggageItem {
  return {
    id: row.id,
    travelerId: ensureValidUUID(row.traveler_id, 'traveler', row.traveler_id),
    category: row.category,
    name: row.name,
    packed: Boolean(row.packed),
    quantity: row.quantity || 1,
  };
}

export function mapMilestoneToDb(m: Omit<BookingMilestone, 'targetDate'>, tripId: string): Record<string, any> {
  const row: Record<string, any> = {
    trip_id: tripId,
    title: m.title,
    days_before_trip: m.daysBeforeTrip,
    description: m.description,
    completed: !!m.completed,
    category: m.category,
    updated_at: new Date().toISOString(),
  };
  if (m.id) {
    row.id = ensureValidUUID(m.id, 'milestone', tripId + '-' + m.title);
  }
  return row;
}

export function mapDbToMilestone(row: any): Omit<BookingMilestone, 'targetDate'> {
  return {
    id: row.id,
    title: row.title,
    daysBeforeTrip: row.days_before_trip,
    description: row.description,
    completed: Boolean(row.completed),
    category: row.category,
  };
}

export function mapSettlementPaymentToDb(p: SettlementPayment, tripId: string): Record<string, any> {
  const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
  const fromTrv = ensureValidUUID(p.fromTravelerId, 'traveler', p.fromTravelerId);
  const toTrv = ensureValidUUID(p.toTravelerId, 'traveler', p.toTravelerId);
  const id = p.id ? ensureValidUUID(p.id, 'settlement', `${cleanTripId}-${fromTrv}-${toTrv}-${p.description || ''}`) : ensureValidUUID(Date.now().toString(), 'settlement', `${cleanTripId}-${fromTrv}-${toTrv}`);

  return {
    id,
    trip_id: cleanTripId,
    from_traveler_id: fromTrv,
    to_traveler_id: toTrv,
    amount_brl: Number(p.amountBrl) || 0,
    amount_usd: p.amountUsd !== undefined && p.amountUsd !== null ? Number(p.amountUsd) : null,
    description: p.description || null,
    payment_date: sanitizeDate(p.paymentDate) || new Date().toISOString().split('T')[0],
    payment_method: p.paymentMethod || 'PIX',
    status: p.status || 'Concluído',
    updated_at: new Date().toISOString(),
  };
}

export function mapDbToSettlementPayment(row: any): SettlementPayment {
  return {
    id: row.id,
    tripId: row.trip_id,
    fromTravelerId: row.from_traveler_id,
    toTravelerId: row.to_traveler_id,
    amountBrl: Number(row.amount_brl) || 0,
    amountUsd: row.amount_usd !== null && row.amount_usd !== undefined ? Number(row.amount_usd) : undefined,
    description: row.description || '',
    paymentDate: row.payment_date || new Date().toISOString().split('T')[0],
    paymentMethod: row.payment_method || 'PIX',
    status: row.status || 'Concluído',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SupabaseFetchError {
  tripId: string;
  table: string;
  operation: string;
  message: string;
}

export interface FetchTripsResult {
  trips: Trip[];
  errors: SupabaseFetchError[];
}

/**
 * Service API Methods
 */

export const SupabaseService = {
  /**
   * Fetch all trips summary with robust error inspection on all queries (travelers, trips, and collections)
   */
  async fetchAllTrips(): Promise<FetchTripsResult | null> {
    try {
      const { data: tripsData, error: tripsErr } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });

      if (tripsErr || !tripsData || !Array.isArray(tripsData)) {
        const msg = tripsErr ? tripsErr.message : 'Dados de viagens nulos ou inválidos';
        console.warn('Supabase: Erro ou tabela ausente em trips:', msg);
        return {
          trips: [],
          errors: [{ tripId: 'global', table: 'trips', operation: 'SELECT', message: msg }]
        };
      }

      if (tripsData.length === 0) {
        return { trips: [], errors: [] };
      }

      const fullTrips: Trip[] = [];
      const allErrors: SupabaseFetchError[] = [];

      for (const tRow of tripsData) {
        const tripSummary = mapDbToTrip(tRow);
        const tripId = tRow.id;

        // Fetch travelers for this trip (Mandatory table)
        const { data: trvData, error: trvErr } = await supabase.from('travelers').select('*').eq('trip_id', tripId);
        if (trvErr || !trvData || !Array.isArray(trvData)) {
          const msg = trvErr ? trvErr.message : 'Dados de viajantes nulos ou inválidos';
          console.error(`[Supabase] Erro ou tabela ausente em travelers para a viagem ${tripId}:`, msg);
          allErrors.push({ tripId, table: 'travelers', operation: 'SELECT', message: msg });
          continue;
        }
        const travelers = trvData.map(mapDbToTraveler);

        // Fetch other collections
        const [
          { data: expData, error: expErr },
          { data: daysData, error: daysErr },
          { data: hourlyData, error: hourlyErr },
          { data: fltData, error: fltErr },
          { data: carData, error: carErr },
          { data: accData, error: accErr },
          { data: tktData, error: tktErr },
          { data: docData, error: docErr },
          { data: mlsData, error: mlsErr },
          { data: bagData, error: bagErr },
          { data: parkBookingsData, error: pbErr },
          { data: attrSelData, error: attrErr },
          { data: showsData, error: showsErr },
          { data: diningData, error: diningErr },
          { data: fastPassData, error: fpErr },
          { data: photoPkgData, error: photoErr },
        ] = await Promise.all([
          supabase.from('expenses').select('*').eq('trip_id', tripId),
          supabase.from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number', { ascending: true }),
          supabase.from('hourly_schedules').select('*').eq('trip_id', tripId).order('time', { ascending: true }),
          supabase.from('flight_segments').select('*').eq('trip_id', tripId),
          supabase.from('car_rentals').select('*').eq('trip_id', tripId),
          supabase.from('accommodations').select('*').eq('trip_id', tripId),
          supabase.from('park_ticket_purchases').select('*').eq('trip_id', tripId),
          supabase.from('preparation_documents').select('*').eq('trip_id', tripId),
          supabase.from('booking_milestones').select('*').eq('trip_id', tripId),
          supabase.from('baggage_items').select('*').eq('trip_id', tripId),
          supabase.from('park_day_bookings').select('*').eq('trip_id', tripId),
          supabase.from('traveler_attraction_selections').select('*').eq('trip_id', tripId),
          supabase.from('park_shows_reservations').select('*').eq('trip_id', tripId),
          supabase.from('park_dining_reservations').select('*').eq('trip_id', tripId),
          supabase.from('park_fast_passes').select('*').eq('trip_id', tripId),
          supabase.from('park_photo_packages').select('*').eq('trip_id', tripId),
        ]);

        // Classification of queries into mandatory and optional (including missing table errors)
        const queriesToCheck = [
          { table: 'expenses', data: expData, error: expErr, mandatory: true },
          { table: 'itinerary_days', data: daysData, error: daysErr, mandatory: true },
          { table: 'hourly_schedules', data: hourlyData, error: hourlyErr, mandatory: false },
          { table: 'flight_segments', data: fltData, error: fltErr, mandatory: false },
          { table: 'car_rentals', data: carData, error: carErr, mandatory: false },
          { table: 'accommodations', data: accData, error: accErr, mandatory: false },
          { table: 'park_ticket_purchases', data: tktData, error: tktErr, mandatory: false },
          { table: 'preparation_documents', data: docData, error: docErr, mandatory: false },
          { table: 'booking_milestones', data: mlsData, error: mlsErr, mandatory: false },
          { table: 'baggage_items', data: bagData, error: bagErr, mandatory: false },
          { table: 'park_day_bookings', data: parkBookingsData, error: pbErr, mandatory: false },
          { table: 'traveler_attraction_selections', data: attrSelData, error: attrErr, mandatory: false },
          { table: 'park_shows_reservations', data: showsData, error: showsErr, mandatory: false },
          { table: 'park_dining_reservations', data: diningData, error: diningErr, mandatory: false },
          { table: 'park_fast_passes', data: fastPassData, error: fpErr, mandatory: false },
          { table: 'park_photo_packages', data: photoPkgData, error: photoErr, mandatory: false },
        ];

        let tripHasMandatoryError = false;
        for (const q of queriesToCheck) {
          if (q.error || !q.data || !Array.isArray(q.data)) {
            const msg = q.error ? q.error.message : 'Dados retornados nulos ou inválidos';
            console.error(`[Supabase] Erro ou tabela ausente em ${q.table} para a viagem ${tripId}:`, msg);
            allErrors.push({ tripId, table: q.table, operation: 'SELECT', message: msg });
            if (q.mandatory) {
              tripHasMandatoryError = true;
            }
          }
        }

        if (tripHasMandatoryError) {
          // Se qualquer leitura necessária falhar para uma viagem, não retorne essa viagem como carregada parcialmente.
          continue;
        }

        // Map photo packages by itinerary_day_id or park_day_booking_id
        const photoPackagesByDay = new Map<string, PhotoPackageItem>();
        (photoPkgData || []).forEach((pRow: any) => {
          const pkgItem: PhotoPackageItem = {
            id: pRow.id,
            name: pRow.name || 'Pacote de Fotos',
            type: pRow.package_type || 'trip_30days',
            validityDescription: pRow.validity_description || undefined,
            complex: pRow.complex || 'Disney',
            includedParks: Array.isArray(pRow.included_parks) ? pRow.included_parks : [],
            confirmationCode: pRow.confirmation_code || undefined,
            accountEmailOrUser: pRow.account_email_or_user || undefined,
            costUSD: pRow.cost_usd !== null ? Number(pRow.cost_usd) : undefined,
            costBRL: pRow.cost_brl !== null ? Number(pRow.cost_brl) : undefined,
            status: pRow.status || 'Confirmado',
            paymentStatus: pRow.payment_status || 'Reservado / Confirmado',
            payerId: pRow.payer_id || 'all',
            travelerIds: Array.isArray(pRow.traveler_ids) ? pRow.traveler_ids : ['all'],
            notes: pRow.notes || undefined,
          };
          if (pRow.itinerary_day_id) {
            photoPackagesByDay.set(pRow.itinerary_day_id, pkgItem);
          }
          if (pRow.park_day_booking_id) {
            photoPackagesByDay.set(pRow.park_day_booking_id, pkgItem);
          }
        });

        // Map secondary show reservations by itinerary_day_id and park_day_booking_id
        const secondaryShowsByDay = new Map<string, any[]>();
        (showsData || []).forEach((s: any) => {
          const item = {
            id: s.id,
            showName: s.show_name || 'Show',
            time: s.show_time || '20:00',
            location: s.location || undefined,
            reservedArea: s.reserved_area || undefined,
            status: s.status || 'Agendado',
            notes: s.notes || undefined,
          };
          const keys = [s.itinerary_day_id, s.park_day_booking_id].filter(Boolean);
          keys.forEach((k) => {
            const list = secondaryShowsByDay.get(k) || [];
            if (!list.some((x: any) => x.id === item.id || (x.showName === item.showName && x.time === item.time))) {
              list.push(item);
            }
            secondaryShowsByDay.set(k, list);
          });
        });

        // Map secondary dining reservations by itinerary_day_id and park_day_booking_id
        const secondaryDiningByDay = new Map<string, any[]>();
        (diningData || []).forEach((dr: any) => {
          const item = {
            id: dr.id,
            restaurantName: dr.restaurant_name || 'Restaurante',
            mealType: dr.meal_type || 'Almoço (Lunch)',
            time: dr.reservation_time || '12:30',
            confirmationCode: dr.confirmation_code || undefined,
            partySize: dr.party_size || undefined,
            tableService: Boolean(dr.table_service),
            status: dr.status || 'Confirmada',
            cancellationPolicyNotes: dr.cancellation_policy_notes || undefined,
            notes: dr.notes || undefined,
          };
          const keys = [dr.itinerary_day_id, dr.park_day_booking_id].filter(Boolean);
          keys.forEach((k) => {
            const list = secondaryDiningByDay.get(k) || [];
            if (!list.some((x: any) => x.id === item.id || (x.restaurantName === item.restaurantName && x.time === item.time))) {
              list.push(item);
            }
            secondaryDiningByDay.set(k, list);
          });
        });

        // Map secondary fast passes by itinerary_day_id and park_day_booking_id
        const secondaryFastPassesByDay = new Map<string, any[]>();
        (fastPassData || []).forEach((fp: any) => {
          const item = {
            id: fp.id,
            attractionName: fp.attraction_name || 'Atração',
            timeWindow: fp.time_window || '',
            type: fp.pass_type || 'Lightning Lane Multi Pass',
            tier: fp.tier || undefined,
            status: fp.status || 'Agendado',
            partyMembers: fp.party_members || undefined,
            notes: fp.notes || undefined,
          };
          const keys = [fp.itinerary_day_id, fp.park_day_booking_id].filter(Boolean);
          keys.forEach((k) => {
            const list = secondaryFastPassesByDay.get(k) || [];
            if (!list.some((x: any) => x.id === item.id || (x.attractionName === item.attractionName && x.timeWindow === item.timeWindow))) {
              list.push(item);
            }
            secondaryFastPassesByDay.set(k, list);
          });
        });

        const parkBookingsByDayId = new Map<string, ParkDayBooking>();
        const parkBookingsByDayNum = new Map<number, ParkDayBooking>();
        (parkBookingsData || []).forEach((pbRow: any) => {
          const pb = mapDbToParkBooking(pbRow);
          // Enrich with shows
          const extraShows = [
            ...(secondaryShowsByDay.get(pbRow.itinerary_day_id) || []),
            ...(secondaryShowsByDay.get(pbRow.id) || []),
          ];
          if (extraShows.length > 0) {
            const existingShows = pb.showsAndParades || [];
            extraShows.forEach((ex) => {
              if (!existingShows.some((es) => es.id === ex.id || (es.showName === ex.showName && es.time === ex.time))) {
                existingShows.push(ex);
              }
            });
            pb.showsAndParades = existingShows;
          }

          // Enrich with dining
          const extraDining = [
            ...(secondaryDiningByDay.get(pbRow.itinerary_day_id) || []),
            ...(secondaryDiningByDay.get(pbRow.id) || []),
          ];
          if (extraDining.length > 0) {
            const existingDining = pb.diningReservations || [];
            extraDining.forEach((ex) => {
              if (!existingDining.some((ed) => ed.id === ex.id || (ed.restaurantName === ex.restaurantName && ed.time === ex.time))) {
                existingDining.push(ex);
              }
            });
            pb.diningReservations = existingDining;
          }

          // Enrich with fast passes
          const extraFp = [
            ...(secondaryFastPassesByDay.get(pbRow.itinerary_day_id) || []),
            ...(secondaryFastPassesByDay.get(pbRow.id) || []),
          ];
          if (extraFp.length > 0) {
            const existingFp = pb.fastPasses || [];
            extraFp.forEach((ex) => {
              if (!existingFp.some((ef) => ef.id === ex.id || (ef.attractionName === ex.attractionName && ef.timeWindow === ex.timeWindow))) {
                existingFp.push(ex);
              }
            });
            pb.fastPasses = existingFp;
          }

          if (pbRow.itinerary_day_id) {
            const photoPkg = photoPackagesByDay.get(pbRow.itinerary_day_id) || photoPackagesByDay.get(pb.id);
            if (photoPkg && !pb.photoPackage) {
              pb.photoPackage = photoPkg;
              pb.hasPhotoPackage = true;
            }
            parkBookingsByDayId.set(pbRow.itinerary_day_id, pb);
          }
          if (pbRow.day_number) {
            parkBookingsByDayNum.set(Number(pbRow.day_number), pb);
          }
        });

        // Also check if any standalone photo package exists for days without bookings
        (photoPkgData || []).forEach((pRow: any) => {
          if (pRow.itinerary_day_id && !parkBookingsByDayId.has(pRow.itinerary_day_id)) {
            const pkgItem = photoPackagesByDay.get(pRow.itinerary_day_id);
            if (pkgItem) {
              const matchedDay = (daysData || []).find((d: any) => d.id === pRow.itinerary_day_id);
              if (matchedDay) {
                const dayNum = Number(matchedDay.day_number) || 1;
                const existingPb = parkBookingsByDayNum.get(dayNum) || {
                  id: `pb-${pRow.itinerary_day_id}`,
                  dayNumber: dayNum,
                  date: matchedDay.date || '',
                  parkName: matchedDay.park || 'Parque',
                  parkPassStatus: 'Confirmado no App',
                  fastPasses: [],
                  diningReservations: [],
                  showsAndParades: [],
                  hasPhotoPackage: true,
                  photoPackage: pkgItem,
                };
                existingPb.hasPhotoPackage = true;
                existingPb.photoPackage = pkgItem;
                parkBookingsByDayId.set(pRow.itinerary_day_id, existingPb);
                parkBookingsByDayNum.set(dayNum, existingPb);
              }
            }
          }
        });

        const settings: GlobalSettings = {
          id: tripId,
          tripCode: tripSummary.tripCode || tripId,
          startDate: tripSummary.startDate || '2026-12-30',
          durationDays: tripSummary.durationDays || 10,
          travelersCount: travelers.length || tripSummary.travelersCount || 1,
          dollarRate: tripSummary.dollarRate || 5.75,
          totalBudgetGoalBRL: tripSummary.totalBudgetGoalBRL || 0,
          tripName: tripSummary.tripName || 'Minha Viagem',
          destination: tripSummary.destination || 'Orlando, FL',
          travelers: travelers.length > 0 ? travelers : [],
          currentUserId: travelers[0]?.id || '1',
          isFlexibleDates: tripSummary.isFlexibleDates,
          flexibleOutboundStart: tripSummary.flexibleOutboundStart,
          flexibleOutboundEnd: tripSummary.flexibleOutboundEnd,
          flexibleInboundStart: tripSummary.flexibleInboundStart,
          flexibleInboundEnd: tripSummary.flexibleInboundEnd,
          flexibleMinDays: tripSummary.flexibleMinDays,
          flexibleMaxDays: tripSummary.flexibleMaxDays,
          outboundFlexibility: tripSummary.outboundFlexibility,
          inboundFlexibility: tripSummary.inboundFlexibility,
          flexibilityNotes: tripSummary.flexibilityNotes,
        };

        const totalTripDays = Math.max(
          1,
          tripSummary.durationDays || (daysData && daysData.length > 0 ? daysData.length : 10)
        );

        // Index existing db itinerary_days
        const dbDaysMap = new Map<number, any>();
        (daysData || []).forEach((dRow: any) => {
          const dNum = Number(dRow.day_number);
          if (dNum > 0) {
            dbDaysMap.set(dNum, dRow);
          }
        });

        // Group hourly_schedules strictly by matching itinerary_day_id against real db itinerary_days id
        const hourlyByDayNumber = new Map<number, HourlyScheduleItem[]>();
        (hourlyData || []).forEach((hRow: any) => {
          const item = mapDbToHourlySchedule(hRow);
          let matchedDayNum: number | null = null;

          // Correspondência estrita usando somente o itinerary_day_id real
          for (const [dNum, dRow] of dbDaysMap.entries()) {
            if (dRow.id === hRow.itinerary_day_id) {
              matchedDayNum = dNum;
              break;
            }
          }

          if (matchedDayNum !== null) {
            const list = hourlyByDayNumber.get(matchedDayNum) || [];
            if (!list.some((existing) => existing.id === item.id)) {
              list.push(item);
            }
            hourlyByDayNumber.set(matchedDayNum, list);
          } else {
            console.warn(`[DIAGNÓSTICO] Registro de horário desassociado (sem correspondência com itinerary_day_id real): ID=${hRow.id}, itinerary_day_id=${hRow.itinerary_day_id}`);
          }
        });

        const startDate = sanitizeDate(tripSummary.startDate) || '2026-12-30';
        const returnDate = sanitizeDate(tripSummary.returnDate || tripSummary.settings?.returnDate || (startDate && totalTripDays ? calculateDateOffset(startDate, totalTripDays - 1) : null));

        // Assemble full rawDays array ensuring all duration days exist
        const rawDays: ItineraryDay[] = [];
        for (let dayNum = 1; dayNum <= totalTripDays; dayNum++) {
          const dRow = dbDaysMap.get(dayNum);
          const dedicatedHourly = hourlyByDayNumber.get(dayNum) || [];

          // Determine date for this day
          let dayDate = dRow ? sanitizeDate(dRow.date) : null;
          if (!dayDate) {
            if (dayNum === totalTripDays && returnDate) {
              dayDate = returnDate;
            } else {
              dayDate = calculateDateOffset(startDate, dayNum - 1);
            }
          }

          if (dRow) {
            const baseDay = mapDbToItineraryDay(dRow);
            baseDay.date = dayDate;
            const pb = parkBookingsByDayId.get(baseDay.id) || parkBookingsByDayNum.get(dayNum);
            if (pb) {
              baseDay.parkBooking = pb;
            }
            // Leitura por dia: A agenda de cada dia é reconstruída com base nos registros confirmados daquele dia.
            if (dedicatedHourly.length > 0) {
              baseDay.hourlySchedule = dedicatedHourly;
            } else {
              baseDay.hourlySchedule = baseDay.hourlySchedule || [];
            }
            rawDays.push(baseDay);
          } else {
            let title = 'Sem Parque';
            if (dayNum === 1) title = 'Chegada';
            else if (dayNum === totalTripDays && totalTripDays > 1) title = 'Partida';

            const pb = parkBookingsByDayNum.get(dayNum);

            rawDays.push({
              id: ensureValidUUID(null, 'day', tripId + '-' + dayNum),
              dayNumber: dayNum,
              date: dayDate,
              title,
              park: 'Sem Parque' as any,
              completed: false,
              morning: { where: '', dining: '', notes: '' },
              afternoon: { where: '', dining: '', notes: '' },
              night: { where: '', dining: '', notes: '' },
              generalNotes: '',
              hourlySchedule: dedicatedHourly.sort((a, b) =>
                (a.time || '00:00').localeCompare(b.time || '00:00')
              ),
              parkBooking: pb,
            });
          }
        }

        // Ao carregar do banco, ler e exibir estritamente os horários já persistidos.
        // Não gerar novos horários nem sobrescrever/reconciliar na leitura.
        rawDays.forEach((rd) => {
          rd.hourlySchedule = ensureHourlyScheduleItems(rd.hourlySchedule || []);
        });

        const rawDocs = (docData || []).map(mapDbToPrepDoc);
        const guaranteedPrepDocs = ensurePreparationDocsForTravelers(travelers, rawDocs, tripId);

        // Auto-sync missing documents in background to Supabase if any were newly generated
        if (guaranteedPrepDocs.length !== rawDocs.length) {
          setTimeout(() => {
            SupabaseService.syncPrepDocuments(tripId, guaranteedPrepDocs, {
              ...tripSummary,
              travelers,
            } as Trip).catch((e) => console.warn('Background prep docs auto-sync notice:', e));
          }, 100);
        }

        const attractionSelections: Record<string, boolean> = {};
        (attrSelData || []).forEach((row: any) => {
          if (row.selected && row.traveler_id && row.park_id && row.attraction_name) {
            const key = `${row.traveler_id}::${row.park_id}::${row.attraction_name}`;
            attractionSelections[key] = true;
            const norm = normalizeAttractionName(row.attraction_name);
            if (norm && norm !== row.attraction_name) {
              attractionSelections[`${row.traveler_id}::${row.park_id}::${norm}`] = true;
            }
          }
        });

        fullTrips.push({
          ...(tripSummary as Trip),
          travelers,
          settings,
          expenses: (expData || []).map(mapDbToExpense),
          rawDays,
          flights: (fltData || []).map(mapDbToFlight),
          carRentals: (carData || []).map(mapDbToCarRental),
          accommodations: (accData || []).map(mapDbToAccommodation),
          parkTickets: (tktData || []).map(mapDbToParkTicket),
          prepDocuments: guaranteedPrepDocs,
          bookingMilestones: (mlsData || []).map(mapDbToMilestone),
          baggageItems: (bagData || []).map(mapDbToBaggage),
          attractionSelections,
        });
      }

      return { trips: fullTrips, errors: allErrors };
    } catch (err: any) {
      if (!isSupabaseMissingTableError(err)) {
        console.error('Supabase fetchAllTrips failed:', err);
      }
      return {
        trips: [],
        errors: [{ tripId: 'global', table: 'general', operation: 'SELECT', message: err?.message || 'Erro desconhecido' }]
      };
    }
  },

  /**
   * Save or Update an entire Trip structure to Supabase
   */
  async syncTripToSupabase(
    trip: Trip
  ): Promise<{ success: boolean; error?: string; tablesExist?: boolean; tableErrors?: Array<{ table: string; operation: string; error: string }> }> {
    try {
      const tripDb = mapTripToDb(trip);
      const { error: tripErr } = await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
      if (tripErr) {
        if (isSupabaseMissingTableError(tripErr)) {
          return {
            success: false,
            tablesExist: false,
            error: 'Tabelas do Supabase aguardando criação (SQL).',
          };
        }
        throw tripErr;
      }

      const tripId = trip.id;
      const tableErrors: Array<{ table: string; operation: string; error: string }> = [];

      // Helper to sync sub-collections and remove deleted items from Supabase
      const syncSubCollection = async <T extends { id: string }>(
        tableName: string,
        items: T[] | undefined,
        mapFn: (item: T, tId: string) => Record<string, any>
      ) => {
        try {
          const currentItems = items || [];
          const dbRows = currentItems.map((item) => mapFn(item, tripId));
          const currentIds = dbRows.map((row) => row.id).filter(Boolean);

          const { data: existing, error: selErr } = await supabase.from(tableName).select('id').eq('trip_id', tripId);
          if (selErr) {
            tableErrors.push({ table: tableName, operation: 'SELECT', error: selErr.message });
          } else if (existing && existing.length > 0) {
            const idsToDelete = existing.map((r: any) => r.id).filter((id: string) => !currentIds.includes(id));
            if (idsToDelete.length > 0) {
              const { error: delErr } = await supabase.from(tableName).delete().eq('trip_id', tripId).in('id', idsToDelete);
              if (delErr) {
                tableErrors.push({ table: tableName, operation: 'DELETE', error: delErr.message });
              }
            }
          }

          if (dbRows.length > 0) {
            let { error: upErr } = await supabase.from(tableName).upsert(dbRows, { onConflict: 'id' });
            if (upErr && tableName === 'flight_segments' && (upErr.message?.includes('payment_status') || upErr.details?.includes('payment_status') || upErr.code === 'PGRST204')) {
              const fallbackRows = dbRows.map((r) => {
                const copy = { ...r };
                delete copy.payment_status;
                return copy;
              });
              const retryRes = await supabase.from(tableName).upsert(fallbackRows, { onConflict: 'id' });
              upErr = retryRes.error;
            }
            if (upErr) {
              tableErrors.push({ table: tableName, operation: 'UPSERT', error: upErr.message });
            }
          }
        } catch (subErr: any) {
          tableErrors.push({ table: tableName, operation: 'SYNC', error: subErr?.message || 'Erro inesperado' });
        }
      };

      // Ensure rawDays have normalized dates and deduplicated schedules before syncing
      const startDate = sanitizeDate(trip.startDate) || '2026-12-27';
      const durationDays = Math.max(1, trip.durationDays || (trip.rawDays?.length || 16));
      const normalizedRawDays = (trip.rawDays || []).map((d, index) => {
        const dayNum = d.dayNumber || index + 1;
        const realDate = calculateDateOffset(startDate, dayNum - 1);
        const deduplicatedSchedule = deduplicateHourlySchedule(d.hourlySchedule || []);
        return {
          ...d,
          dayNumber: dayNum,
          date: realDate,
          hourlySchedule: deduplicatedSchedule,
        };
      });
      trip.rawDays = normalizedRawDays;

      // 1. Travelers
      await syncSubCollection('travelers', trip.travelers, mapTravelerToDb);

      // 2. Expenses
      await syncSubCollection('expenses', trip.expenses, mapExpenseToDb);

      // 3. Itinerary Days
      await syncSubCollection('itinerary_days', trip.rawDays, mapItineraryDayToDb);

      // 3b. Hourly Schedules (Dedicated table with FK to itinerary_days and trips)
      try {
        const allHourlyItems: Array<{ item: HourlyScheduleItem; dayId: string }> = [];
        (trip.rawDays || []).forEach((d) => {
          (d.hourlySchedule || []).forEach((h) => {
            allHourlyItems.push({ item: h, dayId: d.id });
          });
        });

        const dbHourlyRows = allHourlyItems.map(({ item, dayId }, idx) => mapHourlyScheduleToDb(item, dayId, tripId, idx));
        const currentHourlyIds = dbHourlyRows.map((r) => r.id).filter(Boolean);

        const { data: existingHourly, error: hSelErr } = await supabase
          .from('hourly_schedules')
          .select('id')
          .eq('trip_id', tripId);

        if (hSelErr && !isSupabaseMissingTableError(hSelErr)) {
          tableErrors.push({ table: 'hourly_schedules', operation: 'SELECT', error: hSelErr.message });
        } else if (existingHourly && existingHourly.length > 0) {
          const staleIds = existingHourly
            .map((r: any) => r.id)
            .filter((id: string) => !currentHourlyIds.includes(id));

          if (staleIds.length > 0) {
            const { error: hDelErr } = await supabase.from('hourly_schedules').delete().eq('trip_id', tripId).in('id', staleIds);
            if (hDelErr && !isSupabaseMissingTableError(hDelErr)) {
              tableErrors.push({ table: 'hourly_schedules', operation: 'DELETE', error: hDelErr.message });
            }
          }
        }

        if (dbHourlyRows.length > 0) {
          // Prevent duplicates in upsert
          const uniqueHourlyRows = Array.from(
            new Map(dbHourlyRows.map(row => [row.id, row])).values()
          );
          const { error: hUpErr } = await supabase.from('hourly_schedules').upsert(uniqueHourlyRows, { onConflict: 'id' });
          if (hUpErr && !isSupabaseMissingTableError(hUpErr)) {
            tableErrors.push({ table: 'hourly_schedules', operation: 'UPSERT', error: hUpErr.message });
          }
        }
      } catch (hourlySyncErr: any) {
        if (!isSupabaseMissingTableError(hourlySyncErr)) {
          tableErrors.push({ table: 'hourly_schedules', operation: 'SYNC', error: hourlySyncErr?.message || 'Erro inesperado' });
        }
      }

      // 3c. Park Day Bookings
      try {
        const parkBookingsToUpsert: any[] = [];
        const parkBookingDayIds: string[] = [];
        (trip.rawDays || []).forEach((d) => {
          if (d.parkBooking && d.park && d.park !== 'Sem Parque') {
            parkBookingsToUpsert.push(mapParkBookingToDb(d.parkBooking, d.id, tripId));
            parkBookingDayIds.push(d.id);
          }
        });

        const { data: existingBookings, error: bSelErr } = await supabase
          .from('park_day_bookings')
          .select('id, itinerary_day_id')
          .eq('trip_id', tripId);

        if (bSelErr && !isSupabaseMissingTableError(bSelErr)) {
          tableErrors.push({ table: 'park_day_bookings', operation: 'SELECT', error: bSelErr.message });
        } else if (existingBookings && existingBookings.length > 0) {
          const toDelete = existingBookings
            .filter((b: any) => !parkBookingDayIds.includes(b.itinerary_day_id))
            .map((b: any) => b.id);
          if (toDelete.length > 0) {
            const { error: bDelErr } = await supabase.from('park_day_bookings').delete().eq('trip_id', tripId).in('id', toDelete);
            if (bDelErr && !isSupabaseMissingTableError(bDelErr)) {
              tableErrors.push({ table: 'park_day_bookings', operation: 'DELETE', error: bDelErr.message });
            }
          }
        }

        if (parkBookingsToUpsert.length > 0) {
          const { error: bUpErr } = await supabase.from('park_day_bookings').upsert(parkBookingsToUpsert, { onConflict: 'itinerary_day_id' });
          if (bUpErr && !isSupabaseMissingTableError(bUpErr)) {
            tableErrors.push({ table: 'park_day_bookings', operation: 'UPSERT', error: bUpErr.message });
          }
        }

        // Sincronizar tabelas secundárias para FastPasses, Refeições e Shows
        try {
          const allFastPassRows: any[] = [];
          const allDiningRows: any[] = [];
          const allShowRows: any[] = [];
          const allPhotoPkgRows: any[] = [];

          (trip.rawDays || []).forEach((d) => {
            if (d.parkBooking && d.park && d.park !== 'Sem Parque') {
              const bookingId = ensureValidUUID(d.parkBooking.id, 'park-booking', d.id);
              (d.parkBooking.fastPasses || []).forEach((fp) => {
                allFastPassRows.push({
                  id: ensureValidUUID(fp.id, 'fastpass', `${bookingId}-${fp.attractionName}-${fp.timeWindow}`),
                  trip_id: tripId,
                  park_day_booking_id: bookingId,
                  itinerary_day_id: d.id,
                  attraction_name: fp.attractionName || 'Atração',
                  time_window: fp.timeWindow || '',
                  pass_type: fp.type || 'Lightning Lane Multi Pass',
                  tier: fp.tier || null,
                  status: fp.status || 'Agendado',
                  party_members: fp.partyMembers || null,
                  notes: fp.notes || null,
                  updated_at: new Date().toISOString(),
                });
              });

              (d.parkBooking.diningReservations || []).forEach((dr) => {
                allDiningRows.push({
                  id: ensureValidUUID(dr.id, 'dining', `${bookingId}-${dr.restaurantName}-${dr.time}`),
                  trip_id: tripId,
                  park_day_booking_id: bookingId,
                  itinerary_day_id: d.id,
                  restaurant_name: dr.restaurantName || 'Restaurante',
                  meal_type: dr.mealType || 'Almoço (Lunch)',
                  reservation_time: dr.time || '12:30',
                  confirmation_code: dr.confirmationCode || null,
                  party_size: dr.partySize || null,
                  table_service: Boolean(dr.tableService),
                  status: dr.status || 'Confirmada',
                  cancellation_policy_notes: dr.cancellationPolicyNotes || null,
                  notes: dr.notes || null,
                  updated_at: new Date().toISOString(),
                });
              });

              (d.parkBooking.showsAndParades || []).forEach((show) => {
                allShowRows.push({
                  id: ensureValidUUID(show.id, 'show', `${bookingId}-${show.showName}-${show.time}`),
                  trip_id: tripId,
                  park_day_booking_id: bookingId,
                  itinerary_day_id: d.id,
                  show_name: show.showName || 'Show',
                  show_time: show.time || '20:00',
                  location: show.location || null,
                  reserved_area: show.reservedArea || null,
                  status: show.status || 'Agendado',
                  notes: show.notes || null,
                  updated_at: new Date().toISOString(),
                });
              });

              const pkg = d.parkBooking.hasPhotoPackage && d.parkBooking.photoPackage ? d.parkBooking.photoPackage : null;
              if (pkg && (pkg.costUSD || pkg.costBRL || pkg.name)) {
                allPhotoPkgRows.push({
                  id: ensureValidUUID(pkg.id, 'photo-pkg', `${bookingId}-${pkg.name}`),
                  trip_id: tripId,
                  park_day_booking_id: bookingId,
                  itinerary_day_id: d.id,
                  name: pkg.name || 'Pacote de Fotos',
                  package_type: pkg.type || 'trip_30days',
                  validity_description: pkg.validityDescription || null,
                  complex: pkg.complex || 'Disney',
                  included_parks: pkg.includedParks || [],
                  confirmation_code: pkg.confirmationCode || null,
                  account_email_or_user: pkg.accountEmailOrUser || null,
                  cost_usd: pkg.costUSD !== undefined ? Number(pkg.costUSD) : null,
                  cost_brl: pkg.costBRL !== undefined ? Number(pkg.costBRL) : null,
                  status: pkg.status || 'Confirmado',
                  payment_status: pkg.paymentStatus || 'Reservado / Confirmado',
                  payer_id: pkg.payerId || 'all',
                  traveler_ids: pkg.travelerIds || ['all'],
                  notes: pkg.notes || null,
                  updated_at: new Date().toISOString(),
                });
              }
            }
          });

          // Limpar e re-inserir registros atualizados se existirem
          const [delFp, delDin, delShow, delPhoto] = await Promise.allSettled([
            supabase.from('park_fast_passes').delete().eq('trip_id', tripId),
            supabase.from('park_dining_reservations').delete().eq('trip_id', tripId),
            supabase.from('park_shows_reservations').delete().eq('trip_id', tripId),
            supabase.from('park_photo_packages').delete().eq('trip_id', tripId),
          ]);
          if (delFp.status === 'fulfilled' && delFp.value.error && !isSupabaseMissingTableError(delFp.value.error)) {
            tableErrors.push({ table: 'park_fast_passes', operation: 'DELETE', error: delFp.value.error.message });
          }
          if (delDin.status === 'fulfilled' && delDin.value.error && !isSupabaseMissingTableError(delDin.value.error)) {
            tableErrors.push({ table: 'park_dining_reservations', operation: 'DELETE', error: delDin.value.error.message });
          }
          if (delShow.status === 'fulfilled' && delShow.value.error && !isSupabaseMissingTableError(delShow.value.error)) {
            tableErrors.push({ table: 'park_shows_reservations', operation: 'DELETE', error: delShow.value.error.message });
          }
          if (delPhoto.status === 'fulfilled' && delPhoto.value.error && !isSupabaseMissingTableError(delPhoto.value.error)) {
            tableErrors.push({ table: 'park_photo_packages', operation: 'DELETE', error: delPhoto.value.error.message });
          }

          if (allFastPassRows.length > 0) {
            const { error: fpErr } = await supabase.from('park_fast_passes').upsert(allFastPassRows, { onConflict: 'id' });
            if (fpErr && !isSupabaseMissingTableError(fpErr)) {
              tableErrors.push({ table: 'park_fast_passes', operation: 'UPSERT', error: fpErr.message });
            }
          }
          if (allDiningRows.length > 0) {
            const { error: dinErr } = await supabase.from('park_dining_reservations').upsert(allDiningRows, { onConflict: 'id' });
            if (dinErr && !isSupabaseMissingTableError(dinErr)) {
              tableErrors.push({ table: 'park_dining_reservations', operation: 'UPSERT', error: dinErr.message });
            }
          }
          if (allShowRows.length > 0) {
            const { error: showErr } = await supabase.from('park_shows_reservations').upsert(allShowRows, { onConflict: 'id' });
            if (showErr && !isSupabaseMissingTableError(showErr)) {
              tableErrors.push({ table: 'park_shows_reservations', operation: 'UPSERT', error: showErr.message });
            }
          }
          if (allPhotoPkgRows.length > 0) {
            const { error: photoErr } = await supabase.from('park_photo_packages').upsert(allPhotoPkgRows, { onConflict: 'id' });
            if (photoErr && !isSupabaseMissingTableError(photoErr)) {
              tableErrors.push({ table: 'park_photo_packages', operation: 'UPSERT', error: photoErr.message });
            }
          }
        } catch (secSyncErr: any) {
          if (!isSupabaseMissingTableError(secSyncErr)) {
            tableErrors.push({ table: 'park_secondary_tables', operation: 'SYNC', error: secSyncErr?.message || 'Erro inesperado' });
          }
        }
      } catch (pbSyncErr: any) {
        if (!isSupabaseMissingTableError(pbSyncErr)) {
          tableErrors.push({ table: 'park_day_bookings', operation: 'SYNC', error: pbSyncErr?.message || 'Erro inesperado' });
        }
      }

      // 4. Flights
      await syncSubCollection('flight_segments', trip.flights, mapFlightToDb);

      // 5. Car Rentals
      await syncSubCollection('car_rentals', trip.carRentals, mapCarRentalToDb);

      // 6. Accommodations
      await syncSubCollection('accommodations', trip.accommodations, mapAccommodationToDb);

      // 7. Park Tickets
      await syncSubCollection('park_ticket_purchases', trip.parkTickets, mapParkTicketToDb);

      // 8. Prep Docs
      await syncSubCollection('preparation_documents', trip.prepDocuments, mapPrepDocToDb);

      // 9. Baggage
      await syncSubCollection('baggage_items', trip.baggageItems, mapBaggageToDb);

      // 10. Milestones
      await syncSubCollection('booking_milestones', trip.bookingMilestones, mapMilestoneToDb);

      // 11. Traveler Attraction Selections
      try {
        const selectionsMap = trip.attractionSelections || {};
        const entries = Object.entries(selectionsMap);

        // Only upsert active selections; never mass-delete user database records
        if (entries.length > 0) {
          const dbRows: any[] = [];
          for (const [key, selected] of entries) {
            if (selected) {
              const parts = key.split('::');
              if (parts.length === 3) {
                const [travelerId, parkId, attractionName] = parts;
                const cleanTravelerId = ensureValidUUID(travelerId, 'traveler', travelerId);
                const selId = generateDeterministicUUID('attr-sel', `${tripId}-${cleanTravelerId}-${parkId}-${attractionName}`);
                dbRows.push({
                  id: selId,
                  trip_id: ensureValidUUID(tripId, 'trip', tripId),
                  traveler_id: cleanTravelerId,
                  park_id: parkId,
                  attraction_name: attractionName,
                  selected: true,
                  updated_at: new Date().toISOString(),
                });
              }
            }
          }

          if (dbRows.length > 0) {
            // Batch upsert without deleting existing records that may have different UUIDs
            for (let i = 0; i < dbRows.length; i += 50) {
              const chunk = dbRows.slice(i, i + 50);
              const { error: attrErr } = await supabase.from('traveler_attraction_selections').upsert(chunk, { onConflict: 'id' });
              if (attrErr && !isSupabaseMissingTableError(attrErr)) {
                tableErrors.push({ table: 'traveler_attraction_selections', operation: 'UPSERT', error: attrErr.message });
              }
            }
          }
        }
      } catch (attrSyncErr: any) {
        if (!isSupabaseMissingTableError(attrSyncErr)) {
          tableErrors.push({ table: 'traveler_attraction_selections', operation: 'SYNC', error: attrSyncErr?.message || 'Erro inesperado' });
        }
      }

      if (tableErrors.length > 0) {
        const errorSummary = tableErrors.map((e) => `${e.table} [${e.operation}]: ${e.error}`).join('; ');
        console.error('Supabase syncTripToSupabase subcollections failed:', errorSummary);
        return {
          success: false,
          error: `Falha na sincronização do Supabase: ${errorSummary}`,
          tablesExist: true,
          tableErrors,
        };
      }

      return { success: true, tablesExist: true };
    } catch (err: any) {
      if (isSupabaseMissingTableError(err)) {
        return {
          success: false,
          tablesExist: false,
          error: 'Tabelas do Supabase aguardando criação (SQL).',
        };
      }
      console.error('Supabase syncTripToSupabase failed:', err);
      return { success: false, error: err?.message || 'Erro ao sincronizar com o Supabase' };
    }
  },

  /**
   * Safe mock data database cleanup placeholder (no-op to protect user database data)
   */
  async cleanUpMockDatabaseData(): Promise<void> {
    // No-op: do not perform destructive deletions on user database tables
  },

  /**
   * Fetch all traveler attraction selections directly from traveler_attraction_selections table
   */
  async fetchTravelerAttractionSelections(tripId: string): Promise<TravelerAttractionSelection[]> {
    try {
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
      const { data, error } = await supabase
        .from('traveler_attraction_selections')
        .select('*')
        .eq('trip_id', cleanTripId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('Error fetching traveler_attraction_selections:', error);
        return [];
      }
      return (data || []) as TravelerAttractionSelection[];
    } catch (e) {
      console.warn('Exception in fetchTravelerAttractionSelections:', e);
      return [];
    }
  },

  /**
   * Save or Update a single traveler attraction selection in Supabase
   */
  async saveAttractionSelection(
    tripId: string,
    travelerId: string,
    parkId: string,
    attractionName: string,
    selected: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
      const cleanTravelerId = ensureValidUUID(travelerId, 'traveler', travelerId);
      const normName = normalizeAttractionName(attractionName);

      // Check if a record already exists with exact or normalized attraction name
      const { data: existingRows } = await supabase
        .from('traveler_attraction_selections')
        .select('id, attraction_name')
        .eq('trip_id', cleanTripId)
        .eq('traveler_id', cleanTravelerId)
        .eq('park_id', parkId);

      const matchedRow = (existingRows || []).find((r: any) =>
        r.attraction_name === attractionName ||
        normalizeAttractionName(r.attraction_name).toLowerCase() === normName.toLowerCase()
      );

      if (!selected) {
        if (matchedRow?.id) {
          await supabase.from('traveler_attraction_selections').delete().eq('id', matchedRow.id);
        } else {
          await supabase
            .from('traveler_attraction_selections')
            .delete()
            .eq('trip_id', cleanTripId)
            .eq('traveler_id', cleanTravelerId)
            .eq('park_id', parkId)
            .eq('attraction_name', attractionName);
        }
        return { success: true };
      }

      if (matchedRow?.id) {
        const { error } = await supabase
          .from('traveler_attraction_selections')
          .update({
            selected: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedRow.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('traveler_attraction_selections')
          .insert({
            trip_id: cleanTripId,
            traveler_id: cleanTravelerId,
            park_id: parkId,
            attraction_name: attractionName,
            selected: true,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      return { success: true };
    } catch (err: any) {
      if (isSupabaseMissingTableError(err)) {
        return { success: false, error: 'Tabela traveler_attraction_selections aguardando criação no Supabase.' };
      }
      return { success: false, error: err?.message || 'Erro ao salvar preferência de atração' };
    }
  },

  /**
   * Delete Trip
   */
  async deleteTrip(tripId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('trips').delete().eq('id', tripId);
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Delete Expense
   */
  async deleteExpense(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Delete Flight with snapshot capture & compensation rollback
   */
  async deleteFlight(id: string, tripId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!id) return { success: false, error: 'ID do voo não informado' };

      // 1. Instantâneo de segurança antes de qualquer exclusão
      let snapshotExpenses: any[] = [];
      let snapshotSchedules: any[] = [];

      if (tripId) {
        const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
        const expId = generateDeterministicUUID('flight-expense', id);
        const legacyId = `exp-flight-${id}`;

        // Capturar despesas por (source_type = 'flight' e source_id = id)
        const { data: expRows1, error: expErr1 } = await supabase
          .from('expenses')
          .select('*')
          .eq('trip_id', cleanTripId)
          .eq('source_type', 'flight')
          .eq('source_id', id);

        if (expErr1 && !isSupabaseMissingTableError(expErr1)) {
          return { success: false, error: `Falha ao carregar instantâneo de despesas por origem: ${expErr1.message}` };
        }

        // Capturar despesas por ID determinístico ou legado
        const { data: expRows2, error: expErr2 } = await supabase
          .from('expenses')
          .select('*')
          .eq('trip_id', cleanTripId)
          .in('id', [expId, legacyId]);

        if (expErr2 && !isSupabaseMissingTableError(expErr2)) {
          return { success: false, error: `Falha ao carregar instantâneo de despesas por ID: ${expErr2.message}` };
        }

        // Unificar e deduplicar snapshots de despesas
        const combinedExpenses = [...(expRows1 || []), ...(expRows2 || [])];
        const seenExpIds = new Set<string>();
        for (const e of combinedExpenses) {
          if (e && e.id && !seenExpIds.has(e.id)) {
            seenExpIds.add(e.id);
            snapshotExpenses.push(e);
          }
        }

        // Capturar horários associados ao voo
        const { data: schedRows, error: schedErr } = await supabase
          .from('hourly_schedules')
          .select('*')
          .eq('trip_id', cleanTripId)
          .eq('source_type', 'flight')
          .eq('source_id', id);

        if (schedErr && !isSupabaseMissingTableError(schedErr)) {
          return { success: false, error: `Falha ao carregar instantâneo de horários: ${schedErr.message}` };
        }

        if (schedRows) snapshotSchedules = schedRows;
      }

      // 2. Sequência de exclusões com compensação confiável
      if (tripId) {
        // Etapa A: Excluir despesas financeiras
        const expDelRes = await deleteExpensesBySourceInDb(tripId, 'flight', id);
        if (!expDelRes.success) {
          return { success: false, error: expDelRes.error || 'Falha ao excluir despesas financeiras do voo' };
        }

        // Etapa B: Excluir horários da agenda
        const schedDelRes = await this.deleteHourlySchedulesBySource(tripId, id, 'flight');
        if (!schedDelRes.success) {
          // Compensação: Restaurar despesas excluídas na Etapa A
          const rollRes = await rollbackCompensation(snapshotExpenses, []);
          if (!rollRes.success) {
            return {
              success: false,
              error: `Falha ao excluir horários do voo (${schedDelRes.error}). A restauração das despesas falhou parcialmente: ${rollRes.error}. O banco de dados pode estar em estado inconsistente.`,
            };
          }
          return { success: false, error: `${schedDelRes.error || 'Falha ao excluir horários do voo'}. As despesas foram restauradas com sucesso no banco.` };
        }
      }

      // Etapa C: Excluir segmento em flight_segments restrito por trip_id e id, e verificar linhas afetadas
      let flightQuery = supabase.from('flight_segments').delete().eq('id', id);
      if (tripId) {
        const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
        flightQuery = flightQuery.eq('trip_id', cleanTripId);
      }
      const { data: deletedFlightRows, error: flightErr } = await flightQuery.select('id');

      // Tratar QUALQUER erro na tabela principal (inclusive tabela ausente) como falha
      if (flightErr) {
        const rollRes = await rollbackCompensation(snapshotExpenses, snapshotSchedules);
        const errDetail = isSupabaseMissingTableError(flightErr)
          ? 'Tabela flight_segments não encontrada ou aguardando criação no Supabase'
          : flightErr.message;
        if (!rollRes.success) {
          return {
            success: false,
            error: `Falha ao excluir voo (${errDetail}). A restauração dos dados associados falhou parcialmente: ${rollRes.error}. O banco de dados pode estar em estado inconsistente.`,
          };
        }
        return {
          success: false,
          error: `Falha ao excluir voo (${errDetail}). Registros associados (despesas e horários) foram restaurados com sucesso no banco.`,
        };
      }

      // Confirmar que pelo menos 1 linha foi efetivamente removida
      if (!deletedFlightRows || deletedFlightRows.length === 0) {
        const rollRes = await rollbackCompensation(snapshotExpenses, snapshotSchedules);
        if (!rollRes.success) {
          return {
            success: false,
            error: `Nenhum voo foi removido do Supabase (0 linhas afetadas para esta viagem). A restauração dos dados associados falhou parcialmente: ${rollRes.error}. O banco de dados pode estar em estado inconsistente.`,
          };
        }
        return {
          success: false,
          error: `Nenhum voo foi removido do Supabase (0 linhas afetadas para esta viagem). Registros associados (despesas e horários) foram restaurados com sucesso no banco.`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao excluir voo' };
    }
  },

  /**
   * Delete all expenses linked to a specific source (flight, accommodation, etc.)
   */
  async deleteExpensesBySource(
    tripId: string,
    sourceType: 'flight' | 'accommodation' | 'car_rental' | 'park_ticket' | 'photo_package',
    sourceId: string
  ): Promise<{ success: boolean; error?: string }> {
    return deleteExpensesBySourceInDb(tripId, sourceType, sourceId);
  },

  /**
   * Save or Update a single Flight Segment in Supabase
   */
  async saveFlight(
    tripId: string,
    flight: FlightSegment,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string; warning?: string }> {
    try {
      if (!tripId || !flight) {
        return { success: false, error: 'tripId ou dados do voo ausentes' };
      }

      // 1. Ensure the parent trip exists in trips table
      try {
        const { data: tripCheck, error: tripCheckErr } = await supabase
          .from('trips')
          .select('id')
          .eq('id', tripId)
          .maybeSingle();

        if (tripCheckErr && isSupabaseMissingTableError(tripCheckErr)) {
          return { success: false, error: 'Tabelas do Supabase aguardando criação (execute o SQL).' };
        }

        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            flights: [flight],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (errCheck: any) {
        console.warn('Trip verification notice in saveFlight:', errCheck);
      }

      // 2. Upsert flight_segments
      const dbRow = mapFlightToDb(flight, tripId);
      let { error } = await supabase
        .from('flight_segments')
        .upsert(dbRow, { onConflict: 'id' });

      let paymentStatusNotPersisted = false;
      // Fallback gracioso se a coluna payment_status ainda não foi criada no Supabase via migração SQL
      if (error && (error.message?.includes('payment_status') || error.details?.includes('payment_status') || error.code === 'PGRST204')) {
        const fallbackRow = { ...dbRow };
        delete fallbackRow.payment_status;
        const retryRes = await supabase.from('flight_segments').upsert(fallbackRow, { onConflict: 'id' });
        error = retryRes.error;
        if (!error) {
          paymentStatusNotPersisted = true;
        }
      }

      if (error) {
        if (isSupabaseMissingTableError(error)) {
          return { success: false, error: 'Tabela flight_segments aguardando criação no Supabase.' };
        }
        return { success: false, error: error.message };
      }

      // 3. Sincronizar com a tabela de expenses usando o status de pagamento real
      const expenseStatus = flight.paymentStatus === 'Pago' ? 'Pago' : 'Pendente';
      const syncRes = await syncToExpenses(tripId, 'flight', flight.id, {
        title: `Passagem: ${flight.airline || 'Voo'} (${flight.typeLabel || 'Voo'}${flight.flightNumber ? ' ' + flight.flightNumber : ''})`,
        category: 'Passagens',
        usd: flight.ticketCostUSD || 0,
        brl: flight.ticketCostBRL || 0,
        payerId: flight.payerId || 'all',
        travelerIds: flight.travelerIds || ['all'],
        status: expenseStatus,
        notes: `Trecho: ${flight.originCity || flight.originAirport || 'Origem'} ➔ ${flight.destinationCity || flight.destinationAirport || 'Destino'}`
      }, fallbackTrip);

      if (!syncRes.success) {
        return { success: false, error: syncRes.error };
      }

      if (paymentStatusNotPersisted) {
        return {
          success: true,
          warning: 'O voo foi salvo, mas o status de pagamento não pôde ser persistido porque a coluna "payment_status" ainda não existe no Supabase. Execute o script SQL de migração.'
        };
      }

      return { success: true };
    } catch (err: any) {
      if (!isSupabaseMissingTableError(err)) {
        console.error('SupabaseService.saveFlight failed:', err);
      }
      return { success: false, error: err?.message || 'Erro ao salvar voo no banco' };
    }
  },

  /**
   * Delete Car Rental
   */
  async deleteCarRental(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('car_rentals').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  },

  async fetchItineraryDayById(id: string): Promise<ItineraryDay | null> {
    try {
      const { data: dayData, error: dayErr } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (dayErr || !dayData) return null;

      const { data: hourlyData, error: hourlyErr } = await supabase
        .from('hourly_schedules')
        .select('*')
        .eq('itinerary_day_id', id)
        .order('time', { ascending: true });

      const day = mapDbToItineraryDay(dayData);
      if (hourlyData) {
        day.hourlySchedule = hourlyData.map(mapDbToHourlySchedule);
      }
      return day;
    } catch {
      return null;
    }
  },

  /**
   * Delete Accommodation with snapshot capture & compensation rollback
   */
  async deleteAccommodation(id: string, tripId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!id) return { success: false, error: 'ID da hospedagem não informado' };

      // 1. Instantâneo de segurança antes de qualquer exclusão
      let snapshotExpenses: any[] = [];
      let snapshotSchedules: any[] = [];

      if (tripId) {
        const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
        const expId = generateDeterministicUUID('acc-expense', id);
        const legacyId = `exp-acc-${id}`;

        // Capturar despesas por (source_type = 'accommodation' e source_id = id)
        const { data: expRows1, error: expErr1 } = await supabase
          .from('expenses')
          .select('*')
          .eq('trip_id', cleanTripId)
          .eq('source_type', 'accommodation')
          .eq('source_id', id);

        if (expErr1 && !isSupabaseMissingTableError(expErr1)) {
          return { success: false, error: `Falha ao carregar instantâneo de despesas por origem: ${expErr1.message}` };
        }

        // Capturar despesas por ID determinístico ou legado
        const { data: expRows2, error: expErr2 } = await supabase
          .from('expenses')
          .select('*')
          .eq('trip_id', cleanTripId)
          .in('id', [expId, legacyId]);

        if (expErr2 && !isSupabaseMissingTableError(expErr2)) {
          return { success: false, error: `Falha ao carregar instantâneo de despesas por ID: ${expErr2.message}` };
        }

        // Unificar e deduplicar snapshots de despesas
        const combinedExpenses = [...(expRows1 || []), ...(expRows2 || [])];
        const seenExpIds = new Set<string>();
        for (const e of combinedExpenses) {
          if (e && e.id && !seenExpIds.has(e.id)) {
            seenExpIds.add(e.id);
            snapshotExpenses.push(e);
          }
        }

        // Capturar horários associados à hospedagem
        const { data: schedRows, error: schedErr } = await supabase
          .from('hourly_schedules')
          .select('*')
          .eq('trip_id', cleanTripId)
          .eq('source_type', 'accommodation')
          .eq('source_id', id);

        if (schedErr && !isSupabaseMissingTableError(schedErr)) {
          return { success: false, error: `Falha ao carregar instantâneo de horários: ${schedErr.message}` };
        }

        if (schedRows) snapshotSchedules = schedRows;
      }

      // 2. Sequência de exclusões com compensação confiável
      if (tripId) {
        // Etapa A: Excluir despesas financeiras
        const expDelRes = await deleteExpensesBySourceInDb(tripId, 'accommodation', id);
        if (!expDelRes.success) {
          return { success: false, error: expDelRes.error || 'Falha ao excluir despesa da hospedagem no Supabase' };
        }

        // Etapa B: Excluir horários da agenda
        const schedDelRes = await this.deleteHourlySchedulesBySource(tripId, id, 'accommodation');
        if (!schedDelRes.success) {
          // Compensação: Restaurar despesas excluídas na Etapa A
          const rollRes = await rollbackCompensation(snapshotExpenses, []);
          if (!rollRes.success) {
            return {
              success: false,
              error: `Falha ao excluir horários da hospedagem (${schedDelRes.error}). A restauração das despesas falhou parcialmente: ${rollRes.error}. O banco de dados pode estar em estado inconsistente.`,
            };
          }
          return { success: false, error: `${schedDelRes.error || 'Falha ao excluir horários da hospedagem'}. As despesas foram restauradas com sucesso no banco.` };
        }
      }

      // Etapa C: Excluir a reserva em accommodations restrita por trip_id e id, e verificar linhas afetadas
      let accQuery = supabase.from('accommodations').delete().eq('id', id);
      if (tripId) {
        const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
        accQuery = accQuery.eq('trip_id', cleanTripId);
      }
      const { data: deletedAccRows, error: accErr } = await accQuery.select('id');

      // Tratar QUALQUER erro na tabela principal (inclusive tabela ausente) como falha
      if (accErr) {
        const rollRes = await rollbackCompensation(snapshotExpenses, snapshotSchedules);
        const errDetail = isSupabaseMissingTableError(accErr)
          ? 'Tabela accommodations não encontrada ou aguardando criação no Supabase'
          : accErr.message;
        if (!rollRes.success) {
          return {
            success: false,
            error: `Falha ao excluir hospedagem (${errDetail}). A restauração dos dados associados falhou parcialmente: ${rollRes.error}. O banco de dados pode estar em estado inconsistente.`,
          };
        }
        return {
          success: false,
          error: `Falha ao excluir hospedagem (${errDetail}). Registros associados (despesas e horários) foram restaurados com sucesso no banco.`,
        };
      }

      // Confirmar que pelo menos 1 linha foi efetivamente removida
      if (!deletedAccRows || deletedAccRows.length === 0) {
        const rollRes = await rollbackCompensation(snapshotExpenses, snapshotSchedules);
        if (!rollRes.success) {
          return {
            success: false,
            error: `Nenhuma hospedagem foi removida do Supabase (0 linhas afetadas para esta viagem). A restauração dos dados associados falhou parcialmente: ${rollRes.error}. O banco de dados pode estar em estado inconsistente.`,
          };
        }
        return {
          success: false,
          error: `Nenhuma hospedagem foi removida do Supabase (0 linhas afetadas para esta viagem). Registros associados (despesas e horários) foram restaurados com sucesso no banco.`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao excluir hospedagem' };
    }
  },

  /**
   * Fetch accommodations by Trip ID directly from Supabase
   */
  async fetchAccommodationsByTripId(tripId: string): Promise<AccommodationBooking[] | null> {
    try {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from('accommodations')
        .select('*')
        .eq('trip_id', tripId)
        .order('check_in_date', { ascending: true });

      if (error) {
        if (!isSupabaseMissingTableError(error)) {
          console.error('fetchAccommodationsByTripId error:', error);
        }
        return null;
      }

      return (data || []).map(mapDbToAccommodation);
    } catch (err) {
      console.warn('fetchAccommodationsByTripId exception:', err);
      return null;
    }
  },

  /**
   * Sync all accommodations for a trip (upsert existing & delete removed)
   */
  async syncAccommodations(
    tripId: string,
    accommodations: AccommodationBooking[],
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId) return { success: false, error: 'tripId obrigatório' };

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', tripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            accommodations: accommodations,
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in syncAccommodations:', e);
      }

      const currentIds = (accommodations || []).map((a) => a.id).filter(Boolean);
      const { data: existing } = await supabase.from('accommodations').select('id').eq('trip_id', tripId);
      if (existing && existing.length > 0) {
        const toDelete = existing.map((r: any) => r.id).filter((id: string) => !currentIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('accommodations').delete().eq('trip_id', tripId).in('id', toDelete);
        }
      }

      if (accommodations && accommodations.length > 0) {
        const dbRows = accommodations.map((a) => mapAccommodationToDb(a, tripId));
        let { error: upsertErr } = await supabase.from('accommodations').upsert(dbRows, { onConflict: 'id' });
        if (upsertErr && (upsertErr.message?.includes('payment_status') || upsertErr.details?.includes('payment_status') || upsertErr.code === 'PGRST204')) {
          const fallbackRows = dbRows.map((r) => {
            const copy = { ...r };
            delete copy.payment_status;
            return copy;
          });
          const retry = await supabase.from('accommodations').upsert(fallbackRows, { onConflict: 'id' });
          upsertErr = retry.error;
        }
        if (upsertErr) {
          if (isSupabaseMissingTableError(upsertErr)) {
            return { success: false, error: 'Tabela accommodations aguardando criação no Supabase.' };
          }
          return { success: false, error: upsertErr.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar acomodações' };
    }
  },

  /**
   * Save or Update a single Accommodation in Supabase
   */
  async saveAccommodation(
    tripId: string,
    accommodation: AccommodationBooking,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string; warning?: string }> {
    try {
      if (!tripId || !accommodation) {
        return { success: false, error: 'tripId ou dados da acomodação ausentes' };
      }

      // 1. Ensure the parent trip exists in trips table
      try {
        const { data: tripCheck, error: tripCheckErr } = await supabase
          .from('trips')
          .select('id')
          .eq('id', tripId)
          .maybeSingle();

        if (tripCheckErr && isSupabaseMissingTableError(tripCheckErr)) {
          return { success: false, error: 'Tabelas do Supabase aguardando criação (execute o SQL).' };
        }

        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            accommodations: [accommodation],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (errCheck: any) {
        console.warn('Trip verification notice in saveAccommodation:', errCheck);
      }

      // 2. Upsert accommodation
      const dbRow = mapAccommodationToDb(accommodation, tripId);
      let { error } = await supabase
        .from('accommodations')
        .upsert(dbRow, { onConflict: 'id' });

      let paymentStatusNotPersisted = false;
      // Fallback gracioso se a coluna payment_status ainda não foi criada no Supabase via migração SQL
      if (error && (error.message?.includes('payment_status') || error.details?.includes('payment_status') || error.code === 'PGRST204')) {
        const fallbackRow = { ...dbRow };
        delete fallbackRow.payment_status;
        const retryRes = await supabase.from('accommodations').upsert(fallbackRow, { onConflict: 'id' });
        error = retryRes.error;
        if (!error) {
          paymentStatusNotPersisted = true;
        }
      }

      if (error) {
        if (isSupabaseMissingTableError(error)) {
          return { success: false, error: 'Tabela accommodations aguardando criação no Supabase.' };
        }
        return { success: false, error: error.message };
      }

      // 3. Sincronizar com a tabela de expenses usando o status de pagamento real
      const expenseStatus = accommodation.paymentStatus === 'Pago' ? 'Pago' : 'Pendente';
      const syncRes = await syncToExpenses(tripId, 'accommodation', accommodation.id, {
        title: `Hospedagem: ${accommodation.name || 'Reserva'}`,
        category: 'Hospedagem',
        usd: accommodation.costUSD || 0,
        brl: accommodation.costBRL || 0,
        payerId: accommodation.payerId || 'all',
        travelerIds: accommodation.travelerIds || ['all'],
        status: expenseStatus,
        notes: `Check-in: ${accommodation.checkInDate || '---'} | Check-out: ${accommodation.checkOutDate || '---'}`
      }, fallbackTrip);

      if (!syncRes.success) {
        return { success: false, error: syncRes.error };
      }

      if (paymentStatusNotPersisted) {
        return {
          success: true,
          warning: 'A hospedagem foi salva, mas o status de pagamento não pôde ser persistido porque a coluna "payment_status" ainda não existe no Supabase. Execute o script SQL de migração.'
        };
      }

      return { success: true };
    } catch (err: any) {
      if (!isSupabaseMissingTableError(err)) {
        console.error('SupabaseService.saveAccommodation failed:', err);
      }
      return { success: false, error: err?.message || 'Erro ao salvar acomodação no banco' };
    }
  },

  /**
   * Delete Park Day Booking
   */
  async deleteParkBooking(itineraryDayId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('park_day_bookings').delete().eq('itinerary_day_id', itineraryDayId);
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Delete Baggage Item
   */
  async deleteBaggageItem(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('baggage_items').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Save or Update a single Baggage Item to Supabase
   */
  async saveBaggageItem(
    tripId: string,
    item: BaggageItem,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId || !item) return { success: false, error: 'Parâmetros inválidos' };

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', tripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in saveBaggageItem:', e);
      }

      const dbRow = mapBaggageToDb(item, tripId);
      const { error: upsertErr } = await supabase.from('baggage_items').upsert(dbRow, { onConflict: 'id' });

      if (upsertErr) {
        if (isSupabaseMissingTableError(upsertErr)) {
          return { success: false, error: 'Tabela baggage_items aguardando criação no Supabase.' };
        }
        return { success: false, error: upsertErr.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao salvar item de mala' };
    }
  },

  /**
   * Sync all baggage items for a trip
   */
  async syncBaggageItems(
    tripId: string,
    items: BaggageItem[],
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId) return { success: false, error: 'tripId obrigatório' };

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', tripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in syncBaggageItems:', e);
      }

      const currentIds = (items || []).map((i) => i.id).filter(Boolean);
      const { data: existing } = await supabase.from('baggage_items').select('id').eq('trip_id', tripId);
      if (existing && existing.length > 0) {
        const toDelete = existing.map((r: any) => r.id).filter((id: string) => !currentIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('baggage_items').delete().eq('trip_id', tripId).in('id', toDelete);
        }
      }

      if (items && items.length > 0) {
        const dbRows = items.map((i) => mapBaggageToDb(i, tripId));
        const { error: upsertErr } = await supabase.from('baggage_items').upsert(dbRows, { onConflict: 'id' });
        if (upsertErr) {
          if (isSupabaseMissingTableError(upsertErr)) {
            return { success: false, error: 'Tabela baggage_items aguardando criação no Supabase.' };
          }
          return { success: false, error: upsertErr.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar itens de mala' };
    }
  },

  /**
   * Delete Itinerary Day
   */
  async deleteItineraryDay(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('itinerary_days').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Save or Update a single Car Rental in Supabase
   */
  async saveCarRental(
    tripId: string,
    rental: CarRentalBooking,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId || !rental) return { success: false, error: 'Parâmetros inválidos' };

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', tripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in saveCarRental:', e);
      }

      const dbRow = mapCarRentalToDb(rental, tripId);
      let { error: upsertErr } = await supabase.from('car_rentals').upsert(dbRow, { onConflict: 'id' });

      // Fallback gracioso se a coluna payment_status ainda não foi criada no Supabase via migração SQL
      if (upsertErr && (upsertErr.message?.includes('payment_status') || upsertErr.details?.includes('payment_status') || upsertErr.code === 'PGRST204')) {
        const fallbackRow = { ...dbRow };
        delete fallbackRow.payment_status;
        const retryRes = await supabase.from('car_rentals').upsert(fallbackRow, { onConflict: 'id' });
        upsertErr = retryRes.error;
      }

      if (upsertErr) {
        if (isSupabaseMissingTableError(upsertErr)) {
          return { success: false, error: 'Tabela car_rentals aguardando criação no Supabase.' };
        }
        return { success: false, error: upsertErr.message };
      }

      // Sincronizar com a tabela de expenses usando estritamente o status de pagamento
      const isPaid = rental.paymentStatus
        ? rental.paymentStatus === 'Pago'
        : rental.status === 'Pago';
      const syncRes = await syncToExpenses(
        tripId,
        'car_rental',
        rental.id,
        {
          title: `Transporte: Aluguel de Carro (${rental.company || 'Locadora'})`,
          category: 'Transporte',
          usd: rental.costUSD || 0,
          brl: rental.costBRL || 0,
          payerId: rental.payerId || 'all',
          travelerIds: rental.travelerIds || ['all'],
          status: isPaid ? 'Pago' : 'Pendente',
          notes: `Período: ${rental.pickupDate || '---'} a ${rental.dropoffDate || '---'}`
        },
        fallbackTrip
      );

      if (!syncRes.success) {
        return { success: false, error: syncRes.error || 'Falha ao sincronizar despesa de locação de veículo no Supabase' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao salvar aluguel de carro' };
    }
  },



  /**
   * Delete Park Photo Package and its records
   */
  async deleteParkPhotoPackage(id: string): Promise<boolean> {
    try {
      if (!id) return false;
      const cleanId = ensureValidUUID(id, 'photo-pkg', id);
      await Promise.allSettled([
        supabase.from('park_photo_packages').delete().eq('id', cleanId),
        supabase.from('park_photo_packages').delete().eq('id', id),
        supabase.from('park_photo_packages').delete().eq('park_day_booking_id', id),
        supabase.from('park_photo_packages').delete().eq('itinerary_day_id', id),
        supabase.from('park_day_bookings').update({ photo_package: null, has_photo_package: false }).eq('photo_package', cleanId),
        supabase.from('park_day_bookings').update({ photo_package: null, has_photo_package: false }).eq('photo_package', id),
        supabase.from('park_day_bookings').update({ photo_package: null, has_photo_package: false }).eq('park_day_booking_id', id),
        supabase.from('park_day_bookings').update({ photo_package: null, has_photo_package: false }).eq('itinerary_day_id', id),
      ]);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Delete Park Ticket with snapshot capture & compensation rollback
   */
  async deleteParkTicket(id: string, tripId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!id || !id.trim()) {
        return { success: false, error: 'ID do ingresso é obrigatório para exclusão.' };
      }
      if (!tripId || !tripId.trim()) {
        return { success: false, error: 'ID da viagem é obrigatório para exclusão do ingresso no Supabase.' };
      }

      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
      const expId = generateDeterministicUUID('ticket-expense', id);
      const legacyId = `exp-ticket-${id}`;

      // 1. Instantâneo de segurança antes de qualquer exclusão
      let snapshotExpenses: any[] = [];
      let snapshotSchedules: any[] = [];
      let snapshotTicket: any = null;

      // Capturar snapshot do próprio ingresso caso seja necessária restauração
      const { data: ticketRow, error: ticketFetchErr } = await supabase
        .from('park_ticket_purchases')
        .select('*')
        .eq('trip_id', cleanTripId)
        .eq('id', id)
        .maybeSingle();

      if (ticketFetchErr && !isSupabaseMissingTableError(ticketFetchErr)) {
        return { success: false, error: `Falha ao carregar instantâneo do ingresso: ${ticketFetchErr.message}` };
      }
      if (ticketRow) {
        snapshotTicket = ticketRow;
      }

      // Capturar despesas estritamente por (trip_id, source_type = 'park_ticket' e source_id = id)
      const { data: expRows1, error: expErr1 } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', cleanTripId)
        .eq('source_type', 'park_ticket')
        .eq('source_id', id);

      if (expErr1 && !isSupabaseMissingTableError(expErr1)) {
        return { success: false, error: `Falha ao carregar instantâneo de despesas por origem: ${expErr1.message}` };
      }

      // Capturar despesas por ID determinístico ou legado dentro da mesma viagem garantindo source_type = 'park_ticket'
      const { data: expRows2, error: expErr2 } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', cleanTripId)
        .eq('source_type', 'park_ticket')
        .in('id', [expId, legacyId]);

      if (expErr2 && !isSupabaseMissingTableError(expErr2)) {
        return { success: false, error: `Falha ao carregar instantâneo de despesas por ID: ${expErr2.message}` };
      }

      // Unificar e deduplicar snapshots de despesas
      const combinedExpenses = [...(expRows1 || []), ...(expRows2 || [])];
      const seenExpIds = new Set<string>();
      for (const e of combinedExpenses) {
        if (e && e.id && !seenExpIds.has(e.id)) {
          seenExpIds.add(e.id);
          snapshotExpenses.push(e);
        }
      }

      // Capturar horários associados ao ingresso (source_type = 'ticket')
      const { data: schedRows, error: schedErr } = await supabase
        .from('hourly_schedules')
        .select('*')
        .eq('trip_id', cleanTripId)
        .eq('source_type', 'ticket')
        .eq('source_id', id);

      if (schedErr && !isSupabaseMissingTableError(schedErr)) {
        return { success: false, error: `Falha ao carregar instantâneo de horários: ${schedErr.message}` };
      }

      if (schedRows) snapshotSchedules = schedRows;

      // Função de restauração compensatória caso alguma etapa subsequente falhe
      const rollbackAll = async (
        restoreExpenses: boolean,
        restoreSchedules: boolean,
        restoreTicket: boolean
      ): Promise<{
        success: boolean;
        restoredSets: string[];
        failedSets: string[];
        details: string;
      }> => {
        const restoredSets: string[] = [];
        const failedSets: string[] = [];

        if (restoreTicket && snapshotTicket) {
          const { error: tktErr } = await supabase
            .from('park_ticket_purchases')
            .upsert(snapshotTicket, { onConflict: 'id' });
          if (tktErr) {
            const errReason = isSupabaseMissingTableError(tktErr)
              ? 'tabela park_ticket_purchases ausente'
              : tktErr.message;
            failedSets.push(`ingresso (${errReason})`);
          } else {
            restoredSets.push('ingresso');
          }
        }

        if (restoreExpenses && snapshotExpenses.length > 0) {
          const { error: expErr } = await supabase
            .from('expenses')
            .upsert(snapshotExpenses, { onConflict: 'id' });
          if (expErr) {
            const errReason = isSupabaseMissingTableError(expErr)
              ? 'tabela expenses ausente'
              : expErr.message;
            failedSets.push(`despesas vinculadas (${errReason})`);
          } else {
            restoredSets.push('despesas vinculadas');
          }
        }

        if (restoreSchedules && snapshotSchedules.length > 0) {
          const { error: schedErr } = await supabase
            .from('hourly_schedules')
            .upsert(snapshotSchedules, { onConflict: 'id' });
          if (schedErr) {
            const errReason = isSupabaseMissingTableError(schedErr)
              ? 'tabela hourly_schedules ausente'
              : schedErr.message;
            failedSets.push(`horários vinculados (${errReason})`);
          } else {
            restoredSets.push('horários vinculados');
          }
        }

        const isFullyCompensated = failedSets.length === 0;
        let details = '';
        if (isFullyCompensated) {
          details = restoredSets.length > 0
            ? `Restauração compensatória concluída para: ${restoredSets.join(', ')}.`
            : 'Nenhum dado necessitou de restauração.';
        } else {
          details = `Falha na restauração compensatória: erro ao restaurar ${failedSets.join(', ')}.${
            restoredSets.length > 0
              ? ` Conjuntos restaurados parcialmente: ${restoredSets.join(', ')}.`
              : ' Nenhum conjunto pôde ser restaurado.'
          }`;
        }

        return {
          success: isFullyCompensated,
          restoredSets,
          failedSets,
          details,
        };
      };

      // 2. Sequência de exclusões com compensação confiável

      // Etapa A: Excluir despesas financeiras restritas por trip_id e source_type = 'park_ticket'
      const expDelRes = await deleteExpensesBySourceInDb(cleanTripId, 'park_ticket', id);
      if (!expDelRes.success) {
        // Compensação: Restaurar despesas que possam ter sido parcialmente removidas antes da falha
        const rollRes = await rollbackAll(true, false, false);
        const primaryError = expDelRes.error || 'Falha ao excluir despesas financeiras do ingresso';
        if (!rollRes.success) {
          return {
            success: false,
            error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
          };
        }
        return {
          success: false,
          error: `${primaryError}. ${rollRes.details}`,
        };
      }

      // Etapa B: Excluir horários da agenda (source_type = 'ticket')
      const schedDelRes = await this.deleteHourlySchedulesBySource(cleanTripId, id, 'ticket');
      if (!schedDelRes.success) {
        // Compensação: Restaurar despesas excluídas na Etapa A
        const rollRes = await rollbackAll(true, false, false);
        const primaryError = schedDelRes.error || 'Falha ao excluir horários do ingresso';
        if (!rollRes.success) {
          return {
            success: false,
            error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
          };
        }
        return {
          success: false,
          error: `${primaryError}. ${rollRes.details}`,
        };
      }

      // Etapa C: Excluir o registro em park_ticket_purchases restrito por trip_id e id, e verificar linhas afetadas
      const { data: deletedTicketRows, error: ticketErr } = await supabase
        .from('park_ticket_purchases')
        .delete()
        .eq('trip_id', cleanTripId)
        .eq('id', id)
        .select('id');

      // Tratar QUALQUER erro na tabela principal (inclusive tabela ausente) como falha
      if (ticketErr) {
        const rollRes = await rollbackAll(true, true, false);
        const errDetail = isSupabaseMissingTableError(ticketErr)
          ? 'Tabela park_ticket_purchases não encontrada ou aguardando criação no Supabase'
          : ticketErr.message;
        if (!rollRes.success) {
          return {
            success: false,
            error: `Falha ao excluir ingresso (${errDetail}). ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
          };
        }
        return {
          success: false,
          error: `Falha ao excluir ingresso (${errDetail}). ${rollRes.details}`,
        };
      }

      // Confirmar que pelo menos 1 linha foi efetivamente removida
      if (!deletedTicketRows || deletedTicketRows.length === 0) {
        const rollRes = await rollbackAll(true, true, false);
        const primaryMsg = 'Nenhum ingresso foi removido do Supabase (0 linhas afetadas para esta viagem)';
        if (!rollRes.success) {
          return {
            success: false,
            error: `${primaryMsg}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
          };
        }
        return {
          success: false,
          error: `${primaryMsg}. ${rollRes.details}`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao excluir ingresso' };
    }
  },

  /**
   * Fetch park ticket purchases by Trip ID directly from Supabase
   */
  async fetchParkTicketsByTripId(tripId: string): Promise<ParkTicketPurchase[] | null> {
    try {
      if (!tripId) return null;
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
      const { data, error } = await supabase
        .from('park_ticket_purchases')
        .select('*')
        .eq('trip_id', cleanTripId)
        .order('created_at', { ascending: true });

      if (error) {
        if (!isSupabaseMissingTableError(error)) {
          console.error('fetchParkTicketsByTripId error:', error);
        }
        return null;
      }

      return (data || []).map(mapDbToParkTicket);
    } catch (err) {
      console.warn('fetchParkTicketsByTripId exception:', err);
      return null;
    }
  },

  /**
   * Sync all park tickets for a trip (upsert existing & delete removed)
   * Financial expense synchronization is handled exclusively by PlannerContext to maintain a single source of truth.
   */
  async syncParkTickets(
    tripId: string,
    tickets: ParkTicketPurchase[],
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId || !tripId.trim()) return { success: false, error: 'tripId obrigatório para sincronização de ingressos' };
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', cleanTripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: cleanTripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in syncParkTickets:', e);
      }

      // Ensure travelers exist in DB
      if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
        try {
          const dbTravelers = fallbackTrip.travelers.map((t) => mapTravelerToDb(t, cleanTripId));
          await supabase.from('travelers').upsert(dbTravelers, { onConflict: 'id' });
        } catch (trvErr) {
          console.warn('Travelers pre-sync in syncParkTickets note:', trvErr);
        }
      }

      const currentDbRows = (tickets || []).map((t) => mapParkTicketToDb(t, cleanTripId));
      const currentIds = currentDbRows.map((r) => r.id).filter(Boolean);

      const { data: existing, error: existingErr } = await supabase
        .from('park_ticket_purchases')
        .select('id')
        .eq('trip_id', cleanTripId);

      if (existingErr) {
        const errReason = isSupabaseMissingTableError(existingErr)
          ? 'Tabela park_ticket_purchases não encontrada ou aguardando criação no Supabase'
          : existingErr.message;
        return { success: false, error: `Falha ao carregar ingressos existentes: ${errReason}` };
      }

      if (existing && existing.length > 0) {
        const toDelete = existing.map((r: any) => r.id).filter((id: string) => !currentIds.includes(id));
        if (toDelete.length > 0) {
          // 1. Capturar snapshots completos de todos os registros que serão afetados
          const { data: snapshotTickets, error: tktFetchErr } = await supabase
            .from('park_ticket_purchases')
            .select('*')
            .eq('trip_id', cleanTripId)
            .in('id', toDelete);

          if (tktFetchErr) {
            const errReason = isSupabaseMissingTableError(tktFetchErr)
              ? 'Tabela park_ticket_purchases não encontrada ou aguardando criação no Supabase'
              : tktFetchErr.message;
            return { success: false, error: `Falha ao carregar instantâneo de ingressos para sincronização: ${errReason}` };
          }

          const { data: expRows1, error: expErr1 } = await supabase
            .from('expenses')
            .select('*')
            .eq('trip_id', cleanTripId)
            .eq('source_type', 'park_ticket')
            .in('source_id', toDelete);

          if (expErr1 && !isSupabaseMissingTableError(expErr1)) {
            return { success: false, error: `Falha ao carregar instantâneo de despesas por origem na sincronização: ${expErr1.message}` };
          }

          const delExpIds = toDelete.flatMap((delId) => [
            generateDeterministicUUID('ticket-expense', delId),
            `exp-ticket-${delId}`,
          ]);

          const { data: expRows2, error: expErr2 } = await supabase
            .from('expenses')
            .select('*')
            .eq('trip_id', cleanTripId)
            .eq('source_type', 'park_ticket')
            .in('id', delExpIds);

          if (expErr2 && !isSupabaseMissingTableError(expErr2)) {
            return { success: false, error: `Falha ao carregar instantâneo de despesas por ID na sincronização: ${expErr2.message}` };
          }

          const snapshotExpenses: any[] = [];
          const seenExpIds = new Set<string>();
          for (const e of [...(expRows1 || []), ...(expRows2 || [])]) {
            if (e && e.id && !seenExpIds.has(e.id)) {
              seenExpIds.add(e.id);
              snapshotExpenses.push(e);
            }
          }

          const { data: schedRows, error: schedErr } = await supabase
            .from('hourly_schedules')
            .select('*')
            .eq('trip_id', cleanTripId)
            .eq('source_type', 'ticket')
            .in('source_id', toDelete);

          if (schedErr && !isSupabaseMissingTableError(schedErr)) {
            return { success: false, error: `Falha ao carregar instantâneo de horários na sincronização: ${schedErr.message}` };
          }
          const snapshotSchedules = schedRows || [];

          // Função de restauração compensatória em lote
          const rollbackSync = async (
            restoreExpenses: boolean,
            restoreSchedules: boolean,
            restoreTickets: boolean
          ): Promise<{
            success: boolean;
            restoredSets: string[];
            failedSets: string[];
            details: string;
          }> => {
            const restoredSets: string[] = [];
            const failedSets: string[] = [];

            if (restoreTickets && snapshotTickets && snapshotTickets.length > 0) {
              const { error: tktErr } = await supabase
                .from('park_ticket_purchases')
                .upsert(snapshotTickets, { onConflict: 'id' });
              if (tktErr) {
                const errReason = isSupabaseMissingTableError(tktErr)
                  ? 'tabela park_ticket_purchases ausente'
                  : tktErr.message;
                failedSets.push(`ingressos anteriores (${errReason})`);
              } else {
                restoredSets.push('ingressos anteriores');
              }
            }

            if (restoreExpenses && snapshotExpenses.length > 0) {
              const { error: expErr } = await supabase
                .from('expenses')
                .upsert(snapshotExpenses, { onConflict: 'id' });
              if (expErr) {
                const errReason = isSupabaseMissingTableError(expErr)
                  ? 'tabela expenses ausente'
                  : expErr.message;
                failedSets.push(`despesas vinculadas (${errReason})`);
              } else {
                restoredSets.push('despesas vinculadas');
              }
            }

            if (restoreSchedules && snapshotSchedules.length > 0) {
              const { error: schedErr } = await supabase
                .from('hourly_schedules')
                .upsert(snapshotSchedules, { onConflict: 'id' });
              if (schedErr) {
                const errReason = isSupabaseMissingTableError(schedErr)
                  ? 'tabela hourly_schedules ausente'
                  : schedErr.message;
                failedSets.push(`horários vinculados (${errReason})`);
              } else {
                restoredSets.push('horários vinculados');
              }
            }

            const isFullyCompensated = failedSets.length === 0;
            let details = '';
            if (isFullyCompensated) {
              details = restoredSets.length > 0
                ? `Restauração compensatória em lote concluída para: ${restoredSets.join(', ')}.`
                : 'Nenhum dado necessitou de restauração.';
            } else {
              details = `Falha na restauração compensatória em lote: erro ao restaurar ${failedSets.join(', ')}.${
                restoredSets.length > 0
                  ? ` Conjuntos restaurados parcialmente: ${restoredSets.join(', ')}.`
                  : ' Nenhum conjunto pôde ser restaurado.'
              }`;
            }

            return {
              success: isFullyCompensated,
              restoredSets,
              failedSets,
              details,
            };
          };

          // 2. Ordem segura de exclusão: despesas -> horários -> ingressos
          // Etapa 1: Excluir despesas vinculadas aos ingressos obsoletos
          for (const delId of toDelete) {
            const expDelRes = await deleteExpensesBySourceInDb(cleanTripId, 'park_ticket', delId);
            if (!expDelRes.success) {
              const primaryError = `Falha ao excluir despesa vinculada do ingresso ${delId}: ${expDelRes.error}`;
              const rollRes = await rollbackSync(true, false, false);
              if (!rollRes.success) {
                return {
                  success: false,
                  error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
                };
              }
              return {
                success: false,
                error: `${primaryError}. ${rollRes.details}`,
              };
            }
          }

          // Etapa 2: Excluir horários vinculados aos ingressos obsoletos
          for (const delId of toDelete) {
            const schedDelRes = await this.deleteHourlySchedulesBySource(cleanTripId, delId, 'ticket');
            if (!schedDelRes.success) {
              const primaryError = `Falha ao excluir horários vinculados do ingresso ${delId}: ${schedDelRes.error}`;
              const rollRes = await rollbackSync(true, true, false);
              if (!rollRes.success) {
                return {
                  success: false,
                  error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
                };
              }
              return {
                success: false,
                error: `${primaryError}. ${rollRes.details}`,
              };
            }
          }

          // Etapa 3: Excluir os registros de ingressos obsoletos no Supabase e validar linhas afetadas
          const { data: deletedTicketRows, error: delErr } = await supabase
            .from('park_ticket_purchases')
            .delete()
            .eq('trip_id', cleanTripId)
            .in('id', toDelete)
            .select('id');

          // Tratar QUALQUER erro (inclusive tabela ausente) como falha
          if (delErr) {
            const errDetail = isSupabaseMissingTableError(delErr)
              ? 'Tabela park_ticket_purchases não encontrada ou aguardando criação no Supabase'
              : delErr.message;
            const primaryError = `Falha ao excluir ingressos obsoletos: ${errDetail}`;
            const rollRes = await rollbackSync(true, true, false);
            if (!rollRes.success) {
              return {
                success: false,
                error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
              };
            }
            return {
              success: false,
              error: `${primaryError}. ${rollRes.details}`,
            };
          }

          // Confirmar que TODOS os IDs esperados em toDelete foram efetivamente removidos
          const deletedIds = new Set((deletedTicketRows || []).map((r: any) => r?.id).filter(Boolean));
          const missingIds = toDelete.filter((id) => !deletedIds.has(id));

          if (missingIds.length > 0) {
            const confirmedCount = deletedIds.size;
            const expectedCount = toDelete.length;
            const primaryError = `Exclusão em lote incompleta: esperava-se remover ${expectedCount} ingressos, mas ${confirmedCount} foram confirmados (não removidos: ${missingIds.join(', ')})`;
            // Restaurar despesas, horários e ingressos do snapshot
            const rollRes = await rollbackSync(true, true, true);
            if (!rollRes.success) {
              return {
                success: false,
                error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
              };
            }
            return {
              success: false,
              error: `${primaryError}. ${rollRes.details}`,
            };
          }

          // Etapa 4: Persistir novos ingressos
          if (currentDbRows.length > 0) {
            const { error: upsertErr } = await supabase.from('park_ticket_purchases').upsert(currentDbRows, { onConflict: 'id' });
            if (upsertErr) {
              const rollRes = await rollbackSync(true, true, true);
              const errReason = isSupabaseMissingTableError(upsertErr)
                ? 'Tabela park_ticket_purchases aguardando criação no Supabase.'
                : upsertErr.message;
              const primaryError = `Falha ao sincronizar ingressos: ${errReason}`;
              if (!rollRes.success) {
                return {
                  success: false,
                  error: `${primaryError}. ${rollRes.details} O banco de dados pode estar em estado parcialmente inconsistente.`,
                };
              }
              return {
                success: false,
                error: `${primaryError}. ${rollRes.details}`,
              };
            }
          }

          return { success: true };
        }
      }

      // Caso não haja itens para exclusão (toDelete.length === 0), apenas executa o upsert
      if (currentDbRows.length > 0) {
        const { error: upsertErr } = await supabase.from('park_ticket_purchases').upsert(currentDbRows, { onConflict: 'id' });
        if (upsertErr) {
          if (isSupabaseMissingTableError(upsertErr)) {
            return { success: false, error: 'Tabela park_ticket_purchases aguardando criação no Supabase.' };
          }
          return { success: false, error: `Falha ao sincronizar ingressos: ${upsertErr.message}` };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar ingressos' };
    }
  },

  /**
   * Save or Update a single Park Ticket Purchase in Supabase
   * Note: Financial expense synchronization is handled exclusively by PlannerContext to prevent race conditions and duplicate writes.
   */
  async saveParkTicket(
    tripId: string,
    ticket: ParkTicketPurchase,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId || !ticket) return { success: false, error: 'Parâmetros inválidos' };

      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', cleanTripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: cleanTripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in saveParkTicket:', e);
      }

      // Ensure travelers exist in DB before saving ticket to avoid Foreign Key violations on payer_id!
      if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
        try {
          const dbTravelers = fallbackTrip.travelers.map((t) => mapTravelerToDb(t, cleanTripId));
          await supabase.from('travelers').upsert(dbTravelers, { onConflict: 'id' });
        } catch (trvErr) {
          console.warn('Travelers pre-sync in saveParkTicket note:', trvErr);
        }
      }

      const dbRow = mapParkTicketToDb(ticket, cleanTripId);
      let { error: upsertErr } = await supabase.from('park_ticket_purchases').upsert(dbRow, { onConflict: 'id' });

      // Fallback gracioso se a coluna payment_status ainda não foi criada no Supabase via migração SQL
      if (upsertErr && (upsertErr.message?.includes('payment_status') || upsertErr.details?.includes('payment_status') || upsertErr.code === 'PGRST204')) {
        const fallbackRow = { ...dbRow };
        delete fallbackRow.payment_status;
        const retryRes = await supabase.from('park_ticket_purchases').upsert(fallbackRow, { onConflict: 'id' });
        upsertErr = retryRes.error;
      }

      if (upsertErr) {
        console.error('saveParkTicket error:', upsertErr);
        if (isSupabaseMissingTableError(upsertErr)) {
          return { success: false, error: 'Tabela park_ticket_purchases aguardando criação no Supabase.' };
        }
        return { success: false, error: upsertErr.message };
      }

      return { success: true };
    } catch (err: any) {
      console.error('saveParkTicket exception:', err);
      return { success: false, error: err?.message || 'Erro ao salvar ingresso' };
    }
  },
  async saveItineraryDay(
    tripId: string,
    day: Omit<ItineraryDay, 'date'> & { date?: string },
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string; resolvedDayId?: string; hourlyCount?: number; debugLogs?: string[] }> {
    const debugLogs: string[] = [];
    const addLog = (msg: string) => {
      debugLogs.push(msg);
    };

    try {
      if (!tripId || !day) {
        return { success: false, error: 'tripId ou dados do dia ausentes' };
      }

      addLog(`Iniciando salvamento do Dia ${day.dayNumber} (ID: ${day.id}) para Viagem ${tripId}`);

      // 1. Ensure the parent trip exists in `trips` table to prevent FK violations
      try {
        const { data: tripCheck, error: tripCheckErr } = await supabase
          .from('trips')
          .select('id')
          .eq('id', tripId)
          .maybeSingle();

        if (tripCheckErr && isSupabaseMissingTableError(tripCheckErr)) {
          addLog('Tabela trips ainda não existe no Supabase (SQL pendente).');
          return { success: false, error: 'Tabelas do Supabase aguardando criação (execute o SQL).', debugLogs };
        }

        if (!tripCheck) {
          addLog(`Viagem ${tripId} não encontrada na tabela trips. Criando registro da viagem no Supabase...`);
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            rawDays: [{ ...day, date: day.date || calculateDateOffset(fallbackTrip?.startDate || '2026-12-30', (day.dayNumber || 1) - 1) }],
          };
          const tripDb = mapTripToDb(tripToInsert);
          const { error: tripUpsertErr } = await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
          if (tripUpsertErr) {
            addLog(`Aviso ao criar viagem preliminar: ${tripUpsertErr.message}`);
          } else {
            addLog(`Viagem ${tripId} garantida na tabela trips.`);
          }
        }
      } catch (fkCheckErr: any) {
        addLog(`Verificação de viagem (não-fatal): ${fkCheckErr?.message}`);
      }

      // 2. Check if a row exists in `itinerary_days` for (trip_id, day_number) or by day.id
      let resolvedDayId = day.id;
      try {
        if (day.id) {
          const { data: byIdRow } = await supabase
            .from('itinerary_days')
            .select('id, day_number')
            .eq('id', day.id)
            .maybeSingle();
          if (byIdRow && byIdRow.id) {
            resolvedDayId = byIdRow.id;
          }
        }

        if (!resolvedDayId || resolvedDayId === day.id) {
          const { data: existingDays, error: checkDayErr } = await supabase
            .from('itinerary_days')
            .select('id, day_number')
            .eq('trip_id', tripId)
            .eq('day_number', day.dayNumber)
            .limit(1);

          if (!checkDayErr && existingDays && existingDays.length > 0) {
            resolvedDayId = existingDays[0].id;
            addLog(`Dia ${day.dayNumber} já existe no banco com ID: ${resolvedDayId}. Atualizando este registro (título: ${day.title}).`);
          }
        }
      } catch (errExisting) {
        addLog(`Aviso ao buscar dia existente: ${errExisting?.message}`);
      }

      // Ensure date is calculated and normalized for the day before saving
      let dayDate = sanitizeDate(day.date);
      if (!dayDate) {
        const baseStart = fallbackTrip?.startDate || '2026-12-27';
        const dayNum = Number(day.dayNumber) || 1;
        dayDate = calculateDateOffset(baseStart, dayNum - 1);
      }
      day.date = dayDate;

      // Manter os itens de horário fornecidos sem forçar sincronização automática artificial
      const fullHourlyItems = ensureHourlyScheduleItems(day.hourlySchedule || []);
      day.hourlySchedule = fullHourlyItems;

      // 3. Upsert into `itinerary_days` table
      const dayDb = mapItineraryDayToDb({ ...day, id: resolvedDayId, date: dayDate }, tripId);
      dayDb.date = dayDate;
      const { error: dayErr } = await supabase
        .from('itinerary_days')
        .upsert(dayDb, { onConflict: 'id' });

      if (dayErr) {
        addLog(`Erro ao salvar itinerary_days: ${dayErr.message}`);
        return { success: false, error: dayErr.message, resolvedDayId, debugLogs };
      }

      addLog(`Tabela itinerary_days atualizada com sucesso para o Dia ${day.dayNumber} (ID: ${resolvedDayId}, Data: ${dayDate}).`);

      // 4. Synchronize the dedicated `hourly_schedules` table for this day
      try {
        const dbHourlyRowsMap = new Map<string, any>();
        fullHourlyItems.forEach((item, index) => {
          const row = mapHourlyScheduleToDb(item, resolvedDayId, tripId, index);
          if (row.id) {
            dbHourlyRowsMap.set(row.id, row);
          }
        });
        const dbHourlyRows = Array.from(dbHourlyRowsMap.values());

        // Excluir horários obsoletos ou duplicados do banco que não estão na lista ativa atual
        try {
          const { data: existingDbHourly } = await supabase
            .from('hourly_schedules')
            .select('id')
            .eq('itinerary_day_id', resolvedDayId);

          if (existingDbHourly && existingDbHourly.length > 0) {
            const currentIds = dbHourlyRows.map((r) => r.id).filter(Boolean);
            const idsToDelete = existingDbHourly
              .map((r: any) => r.id)
              .filter((id: string) => !currentIds.includes(id));

            if (idsToDelete.length > 0) {
              await supabase
                .from('hourly_schedules')
                .delete()
                .eq('itinerary_day_id', resolvedDayId)
                .in('id', idsToDelete);
              addLog(`Removidos ${idsToDelete.length} horários obsoletos/duplicados da tabela hourly_schedules.`);
            }
          }
        } catch (delStaleErr: any) {
          addLog(`Aviso ao verificar horários obsoletos: ${delStaleErr?.message}`);
        }

        if (dbHourlyRows.length > 0) {
          const { error: upsertHourlyErr } = await supabase
            .from('hourly_schedules')
            .upsert(dbHourlyRows, { onConflict: 'id' });

          if (upsertHourlyErr) {
            addLog(`Erro ao gravar em hourly_schedules: ${upsertHourlyErr.message}`);
            console.error('Erro de gravação em hourly_schedules:', upsertHourlyErr);
            return {
              success: false,
              error: `Falha ao salvar horários da agenda: ${upsertHourlyErr.message}`,
              resolvedDayId,
              debugLogs,
            };
          } else {
            addLog(`${dbHourlyRows.length} horários gravados na tabela hourly_schedules com sucesso.`);
          }
        }
      } catch (hourlyErr: any) {
        addLog(`Erro sync hourly_schedules: ${hourlyErr?.message}`);
        console.error('Falha ao sincronizar hourly_schedules:', hourlyErr);
        return {
          success: false,
          error: `Falha ao sincronizar horários da agenda: ${hourlyErr?.message || 'Erro de conexão/banco'}`,
          resolvedDayId,
          debugLogs,
        };
      }

      // 5. Synchronize park_day_bookings table and secondary event tables for this day
      try {
        if (day.parkBooking && day.park && day.park !== 'Sem Parque') {
          const pbDb = mapParkBookingToDb(day.parkBooking, resolvedDayId, tripId);
          await supabase.from('park_day_bookings').upsert(pbDb, { onConflict: 'itinerary_day_id' });
          addLog(`Registro de reserva de parque salvo na tabela park_day_bookings.`);

          const bookingId = pbDb.id || ensureValidUUID(day.parkBooking.id, 'park-booking', resolvedDayId);

          // 5.1 Sincronização de tabelas secundárias para Fast Passes, Refeições e Shows
          try {
            // Fast Passes
            const fastPasses = day.parkBooking.fastPasses || [];
            const fpRows = fastPasses.map((fp) => ({
              id: ensureValidUUID(fp.id, 'fastpass', `${bookingId}-${fp.attractionName}-${fp.timeWindow}`),
              trip_id: tripId,
              park_day_booking_id: bookingId,
              itinerary_day_id: resolvedDayId,
              attraction_name: fp.attractionName || 'Atração',
              time_window: fp.timeWindow || '',
              pass_type: fp.type || 'Lightning Lane Multi Pass',
              tier: fp.tier || null,
              status: fp.status || 'Agendado',
              party_members: fp.partyMembers || null,
              notes: fp.notes || null,
              updated_at: new Date().toISOString(),
            }));
            await supabase.from('park_fast_passes').delete().eq('itinerary_day_id', resolvedDayId);
            if (fpRows.length > 0) {
              await supabase.from('park_fast_passes').upsert(fpRows, { onConflict: 'id' });
              addLog(`${fpRows.length} FastPasses sincronizados na tabela secundária park_fast_passes.`);
            }

            // Refeições / Almoço / Jantar
            const diningList = day.parkBooking.diningReservations || [];
            const dinRows = diningList.map((dr) => ({
              id: ensureValidUUID(dr.id, 'dining', `${bookingId}-${dr.restaurantName}-${dr.time}`),
              trip_id: tripId,
              park_day_booking_id: bookingId,
              itinerary_day_id: resolvedDayId,
              restaurant_name: dr.restaurantName || 'Restaurante',
              meal_type: dr.mealType || 'Almoço (Lunch)',
              reservation_time: dr.time || '12:30',
              confirmation_code: dr.confirmationCode || null,
              party_size: dr.partySize || null,
              table_service: Boolean(dr.tableService),
              status: dr.status || 'Confirmada',
              cancellation_policy_notes: dr.cancellationPolicyNotes || null,
              notes: dr.notes || null,
              updated_at: new Date().toISOString(),
            }));
            await supabase.from('park_dining_reservations').delete().eq('itinerary_day_id', resolvedDayId);
            if (dinRows.length > 0) {
              await supabase.from('park_dining_reservations').upsert(dinRows, { onConflict: 'id' });
              addLog(`${dinRows.length} refeições sincronizadas na tabela secundária park_dining_reservations.`);
            }

            // Shows e Paradas (persistidos centralizadamente em park_shows_reservations e hourly_schedules principal)
            const showsList = day.parkBooking.showsAndParades || [];
            const showRows = showsList.map((show) => ({
              id: ensureValidUUID(show.id, 'show', `${bookingId}-${show.showName}-${show.time}`),
              trip_id: tripId,
              park_day_booking_id: bookingId,
              itinerary_day_id: resolvedDayId,
              show_name: show.showName || 'Show',
              show_time: show.time || '20:00',
              location: show.location || null,
              reserved_area: show.reservedArea || null,
              status: show.status || 'Agendado',
              notes: show.notes || null,
              updated_at: new Date().toISOString(),
            }));
            await supabase.from('park_shows_reservations').delete().eq('itinerary_day_id', resolvedDayId);
            if (showRows.length > 0) {
              await supabase.from('park_shows_reservations').upsert(showRows, { onConflict: 'id' });
              addLog(`${showRows.length} shows sincronizados na tabela secundária park_shows_reservations.`);
            }
            // Photo Package
            const pkg = day.parkBooking.hasPhotoPackage && day.parkBooking.photoPackage ? day.parkBooking.photoPackage : null;
            if (pkg && (pkg.costUSD || pkg.costBRL || pkg.name)) {
              const photoPkgRow = {
                id: ensureValidUUID(pkg.id, 'photo-pkg', `${bookingId}-${pkg.name}`),
                trip_id: tripId,
                park_day_booking_id: bookingId,
                itinerary_day_id: resolvedDayId,
                name: pkg.name || 'Pacote de Fotos',
                package_type: pkg.type || 'trip_30days',
                validity_description: pkg.validityDescription || null,
                complex: pkg.complex || 'Disney',
                included_parks: pkg.includedParks || [],
                confirmation_code: pkg.confirmationCode || null,
                account_email_or_user: pkg.accountEmailOrUser || null,
                cost_usd: pkg.costUSD !== undefined ? Number(pkg.costUSD) : null,
                cost_brl: pkg.costBRL !== undefined ? Number(pkg.costBRL) : null,
                status: pkg.status || 'Confirmado',
                payment_status: pkg.paymentStatus || 'Reservado / Confirmado',
                payer_id: pkg.payerId || 'all',
                traveler_ids: pkg.travelerIds || ['all'],
                notes: pkg.notes || null,
                updated_at: new Date().toISOString(),
              };
              await supabase.from('park_photo_packages').upsert(photoPkgRow, { onConflict: 'id' });
              addLog(`Pacote de fotos sincronizado na tabela park_photo_packages.`);
            } else {
              await supabase.from('park_photo_packages').delete().eq('itinerary_day_id', resolvedDayId);
            }
          } catch (secErr: any) {
            if (!isSupabaseMissingTableError(secErr)) {
              console.warn('Sync secondary park tables note:', secErr);
            }
          }
        } else {
          await supabase.from('park_day_bookings').delete().eq('itinerary_day_id', resolvedDayId);
          try {
            await Promise.allSettled([
              supabase.from('park_fast_passes').delete().eq('itinerary_day_id', resolvedDayId),
              supabase.from('park_dining_reservations').delete().eq('itinerary_day_id', resolvedDayId),
              supabase.from('park_shows_reservations').delete().eq('itinerary_day_id', resolvedDayId),
              supabase.from('park_photo_packages').delete().eq('itinerary_day_id', resolvedDayId),
            ]);
          } catch {}
        }
      } catch (pbErr: any) {
        addLog(`Aviso sync park_day_bookings: ${pbErr?.message}`);
      }

      return {
        success: true,
        resolvedDayId,
        hourlyCount: fullHourlyItems.length,
        debugLogs,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro desconhecido ao salvar dia', debugLogs };
    }
  },



  /**
   * Fetch expenses by Trip ID directly from Supabase
   */
  async fetchExpensesByTripId(tripId: string): Promise<ExpenseItem[] | null> {
    try {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

      if (error) {
        if (!isSupabaseMissingTableError(error)) {
          console.error('fetchExpensesByTripId error:', error);
        }
        return null;
      }

      return (data || []).map(mapDbToExpense);
    } catch (err) {
      console.warn('fetchExpensesByTripId exception:', err);
      return null;
    }
  },

  /**
   * Sync all expenses for a trip (upsert existing & delete removed)
   */
  async syncExpenses(
    tripId: string,
    expenses: ExpenseItem[],
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId) return { success: false, error: 'tripId obrigatório' };
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', cleanTripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: cleanTripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: expenses,
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in syncExpenses:', e);
      }

      // Ensure travelers exist in DB
      if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
        try {
          const dbTravelers = fallbackTrip.travelers.map((t) => mapTravelerToDb(t, cleanTripId));
          await supabase.from('travelers').upsert(dbTravelers, { onConflict: 'id' });
        } catch (trvErr) {
          console.warn('Travelers pre-sync in syncExpenses note:', trvErr);
        }
      }

      // Regra obrigatória em lote:
      // Identificar e expurgar despesas zeradas de voo ou hospedagem no Supabase
      const validExpenses: ExpenseItem[] = [];
      for (const e of expenses || []) {
        const isZeroFlightOrAcc =
          (e.sourceType === 'flight' || e.sourceType === 'accommodation') &&
          (Number(e.estimatedValueUSD) || 0) <= 0 &&
          (Number(e.estimatedValueBRL) || 0) <= 0;

        if (isZeroFlightOrAcc) {
          if (e.sourceId) {
            const delRes = await deleteExpensesBySourceInDb(cleanTripId, e.sourceType as 'flight' | 'accommodation', e.sourceId);
            if (!delRes.success) {
              return { success: false, error: delRes.error || 'Falha ao excluir despesa zerada no Supabase' };
            }
          } else if (e.id) {
            const { error: idDelErr } = await supabase
              .from('expenses')
              .delete()
              .eq('trip_id', cleanTripId)
              .eq('id', e.id);

            if (idDelErr && !isSupabaseMissingTableError(idDelErr)) {
              return { success: false, error: idDelErr.message };
            }
          }
        } else {
          validExpenses.push(e);
        }
      }

      const currentIds = validExpenses.map((e) => e.id).filter(Boolean);
      const { data: existing, error: fetchErr } = await supabase
        .from('expenses')
        .select('id')
        .eq('trip_id', cleanTripId);

      if (fetchErr && !isSupabaseMissingTableError(fetchErr)) {
        return { success: false, error: fetchErr.message };
      }

      if (existing && existing.length > 0) {
        const toDelete = existing.map((r: any) => r.id).filter((id: string) => !currentIds.includes(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase
            .from('expenses')
            .delete()
            .eq('trip_id', cleanTripId)
            .in('id', toDelete);
          if (delErr && !isSupabaseMissingTableError(delErr)) {
            return { success: false, error: delErr.message };
          }
        }
      }

      if (validExpenses.length > 0) {
        const dbRows = validExpenses.map((e) => mapExpenseToDb(e, cleanTripId));
        const { error: upsertErr } = await supabase.from('expenses').upsert(dbRows, { onConflict: 'id' });
        if (upsertErr) {
          if (isSupabaseMissingTableError(upsertErr)) {
            return { success: false, error: 'Tabela expenses aguardando criação no Supabase.' };
          }
          return { success: false, error: upsertErr.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar despesas' };
    }
  },

  /**
   * Save or Update a single Expense to Supabase
   */
  async saveExpense(
    tripId: string,
    expense: ExpenseItem,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId || !expense) return { success: false, error: 'Parâmetros inválidos' };
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);

      // Regra obrigatória: se a cobrança for zero nas duas moedas para um item vinculado (voo ou hospedagem),
      // nenhuma despesa vinculada pode existir no Financeiro. Exclui e encerra sem upsert.
      const isZero = (Number(expense.estimatedValueUSD) || 0) <= 0 && (Number(expense.estimatedValueBRL) || 0) <= 0;
      if (isZero && expense.sourceType && (expense.sourceType === 'flight' || expense.sourceType === 'accommodation')) {
        if (expense.sourceId) {
          const delRes = await deleteExpensesBySourceInDb(cleanTripId, expense.sourceType, expense.sourceId);
          if (!delRes.success) {
            return { success: false, error: delRes.error || 'Falha ao excluir despesa zerada no Supabase' };
          }
          return { success: true };
        } else if (expense.id) {
          const { error: idDelErr } = await supabase
            .from('expenses')
            .delete()
            .eq('trip_id', cleanTripId)
            .eq('id', expense.id);

          if (idDelErr && !isSupabaseMissingTableError(idDelErr)) {
            return { success: false, error: idDelErr.message };
          }
          return { success: true };
        } else {
          return { success: false, error: 'Despesa zerada sem identificador de origem não foi salva.' };
        }
      }

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', cleanTripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: cleanTripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [expense],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in saveExpense:', e);
      }

      // Ensure travelers exist in DB before saving expense to avoid FK violations
      if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
        try {
          const dbTravelers = fallbackTrip.travelers.map((t) => mapTravelerToDb(t, cleanTripId));
          await supabase.from('travelers').upsert(dbTravelers, { onConflict: 'id' });
        } catch (trvErr) {
          console.warn('Travelers pre-sync in saveExpense note:', trvErr);
        }
      }

      const row = mapExpenseToDb(expense, cleanTripId);
      const { error } = await supabase.from('expenses').upsert(row, { onConflict: 'id' });

      if (error) {
        if (isSupabaseMissingTableError(error)) {
          return { success: false, error: 'Tabela expenses ainda não foi criada no Supabase.' };
        }
        console.error('saveExpense error:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      console.warn('saveExpense exception:', err);
      return { success: false, error: err?.message || 'Erro ao salvar despesa' };
    }
  },

  /**
   * Salva ou atualiza um item de horário individual diretamente no banco,
   * persistindo o item de forma explícita sem substituir ou apagar outros itens do dia.
   */
  async saveHourlyScheduleItem(
    tripId: string,
    itineraryDayId: string,
    item: HourlyScheduleItem
  ): Promise<{ success: boolean; error?: string; rowId?: string }> {
    try {
      if (!tripId || !itineraryDayId || !item) {
        return { success: false, error: 'tripId, itineraryDayId e item são obrigatórios' };
      }

      const rowId = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
        ? item.id
        : ensureValidUUID(item.id, 'hourly', `${itineraryDayId}-${item.sourceType || 'manual'}-${item.time}-${(item.title || '').trim()}`);

      const itemWithValidId = { ...item, id: rowId };
      const dbRow = mapHourlyScheduleToDb(itemWithValidId, itineraryDayId, tripId);

      const { error: upsertErr } = await supabase
        .from('hourly_schedules')
        .upsert(dbRow, { onConflict: 'id' });

      if (upsertErr) {
        console.error('Erro ao salvar item em hourly_schedules:', upsertErr.message);
        return { success: false, error: upsertErr.message };
      }

      return { success: true, rowId };
    } catch (err: any) {
      console.error('Falha ao salvar item de horário:', err);
      return { success: false, error: err?.message || 'Falha ao salvar horário' };
    }
  },

  /**
   * Delete Hourly Schedule Item
   */
  async deleteHourlySchedule(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!id) return { success: false, error: 'ID do horário é obrigatório' };
      const { error } = await supabase.from('hourly_schedules').delete().eq('id', id);
      if (error) {
        console.error('Erro ao deletar hourly_schedules:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      console.error('Falha ao deletar item de horário:', err);
      return { success: false, error: err?.message || 'Falha ao deletar horário' };
    }
  },

  /**
   * Delete Hourly Schedules by exact source_id, scoped strictly to trip_id and optionally itinerary_day_id/source_type.
   * Não utiliza correspondência parcial (LIKE) para não atingir outras viagens ou origens.
   */
  async deleteHourlySchedulesBySource(
    tripId: string,
    sourceId: string,
    sourceType?: string,
    itineraryDayId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId || !sourceId) return { success: true };
      let query = supabase
        .from('hourly_schedules')
        .delete()
        .eq('trip_id', tripId)
        .eq('source_id', sourceId); // Correspondência exata apenas

      if (sourceType) {
        query = query.eq('source_type', sourceType);
      }
      if (itineraryDayId) {
        query = query.eq('itinerary_day_id', itineraryDayId);
      }

      const { error } = await query;
      if (error) {
        console.error('Erro ao deletar hourly_schedules por origem:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      console.error('Falha em deleteHourlySchedulesBySource:', err);
      return { success: false, error: err?.message || 'Falha ao deletar horários por origem' };
    }
  },

  /**
   * Sync all preparation documents for a trip (upsert existing & delete removed)
   */
  async syncPrepDocuments(
    tripId: string,
    prepDocs: PreparationDocument[],
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!tripId) return { success: false, error: 'tripId obrigatório' };

      // Ensure parent trip exists
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', tripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: tripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in syncPrepDocuments:', e);
      }

      // Ensure travelers exist in DB before prep docs to avoid foreign key errors
      if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
        try {
          const dbTravelers = fallbackTrip.travelers.map((t) => mapTravelerToDb(t, tripId));
          await supabase.from('travelers').upsert(dbTravelers, { onConflict: 'id' });
        } catch (trvErr) {
          console.warn('Travelers pre-sync in syncPrepDocuments note:', trvErr);
        }
      }

      const dbRows = (prepDocs || []).map((d) => mapPrepDocToDb(d, tripId));
      const currentIds = dbRows.map((r) => r.id).filter(Boolean);

      const { data: existing } = await supabase.from('preparation_documents').select('id').eq('trip_id', tripId);
      if (existing && existing.length > 0) {
        const toDelete = existing.map((r: any) => r.id).filter((id: string) => !currentIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('preparation_documents').delete().eq('trip_id', tripId).in('id', toDelete);
        }
      }

      if (dbRows.length > 0) {
        const { error: upsertErr } = await supabase.from('preparation_documents').upsert(dbRows, { onConflict: 'id' });
        if (upsertErr) {
          if (isSupabaseMissingTableError(upsertErr)) {
            return { success: false, error: 'Tabela preparation_documents aguardando criação no Supabase.' };
          }
          return { success: false, error: upsertErr.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar documentos de preparação' };
    }
  },

  /**
   * Fetch settlement payments / adjustments for a trip
   */
  async fetchSettlementPayments(tripId: string): Promise<SettlementPayment[]> {
    try {
      if (!tripId) return [];
      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
      const { data, error } = await supabase
        .from('settlement_payments')
        .select('*')
        .eq('trip_id', cleanTripId)
        .order('created_at', { ascending: true });

      if (error) {
        if (isSupabaseMissingTableError(error)) {
          console.warn('Tabela settlement_payments aguardando criação no Supabase.');
          return [];
        }
        console.error('fetchSettlementPayments error:', error);
        return [];
      }

      return (data || []).map(mapDbToSettlementPayment);
    } catch (err) {
      console.warn('fetchSettlementPayments exception:', err);
      return [];
    }
  },

  /**
   * Save / Upsert a single Settlement Payment in Supabase
   */
  async saveSettlementPayment(
    tripId: string,
    payment: SettlementPayment,
    fallbackTrip?: Partial<Trip>
  ): Promise<{ success: boolean; data?: SettlementPayment; error?: string }> {
    try {
      if (!tripId || !payment) {
        return { success: false, error: 'Parâmetros inválidos para o pagamento' };
      }

      const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);

      // Ensure trip exists in DB
      try {
        const { data: tripCheck } = await supabase.from('trips').select('id').eq('id', cleanTripId).maybeSingle();
        if (!tripCheck) {
          const tripToInsert: Partial<Trip> = {
            id: cleanTripId,
            tripCode: fallbackTrip?.tripCode || `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
            tripName: fallbackTrip?.tripName || 'Minha Viagem',
            destination: fallbackTrip?.destination || 'Orlando, FL',
            startDate: fallbackTrip?.startDate || '2026-12-30',
            durationDays: fallbackTrip?.durationDays || 10,
            travelersCount: fallbackTrip?.travelersCount || 1,
            dollarRate: fallbackTrip?.dollarRate || 5.75,
            totalBudgetGoalBRL: fallbackTrip?.totalBudgetGoalBRL || 0,
            status: fallbackTrip?.status || 'Planejando',
            coverTheme: fallbackTrip?.coverTheme || 'magic',
            travelers: fallbackTrip?.travelers || [],
            expenses: [],
            rawDays: [],
            createdAt: new Date().toISOString().split('T')[0],
          };
          const tripDb = mapTripToDb(tripToInsert);
          await supabase.from('trips').upsert(tripDb, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('Trip check in saveSettlementPayment:', e);
      }

      // Ensure travelers exist in DB before saving settlement payment
      if (fallbackTrip?.travelers && fallbackTrip.travelers.length > 0) {
        try {
          const dbTravelers = fallbackTrip.travelers.map((t) => mapTravelerToDb(t, cleanTripId));
          await supabase.from('travelers').upsert(dbTravelers, { onConflict: 'id' });
        } catch (trvErr) {
          console.warn('Travelers pre-sync in saveSettlementPayment notice:', trvErr);
        }
      }

      const dbRow = mapSettlementPaymentToDb(payment, cleanTripId);
      const { data, error } = await supabase
        .from('settlement_payments')
        .upsert(dbRow, { onConflict: 'id' })
        .select()
        .maybeSingle();

      if (error) {
        if (isSupabaseMissingTableError(error)) {
          return { success: false, error: 'Tabela settlement_payments aguardando criação no Supabase.' };
        }
        console.error('saveSettlementPayment error:', error);
        return { success: false, error: error.message };
      }

      const saved = data ? mapDbToSettlementPayment(data) : payment;
      return { success: true, data: saved };
    } catch (err: any) {
      console.warn('saveSettlementPayment exception:', err);
      return { success: false, error: err?.message || 'Erro ao salvar acerto de contas' };
    }
  },

  /**
   * Delete a Settlement Payment from Supabase
   */
  async deleteSettlementPayment(id: string): Promise<boolean> {
    try {
      if (!id) return false;
      const { error } = await supabase.from('settlement_payments').delete().eq('id', id);
      if (error) {
        console.error('deleteSettlementPayment error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('deleteSettlementPayment exception:', err);
      return false;
    }
  },
};
