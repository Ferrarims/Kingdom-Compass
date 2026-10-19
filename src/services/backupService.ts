import { supabase, isSupabaseMissingTableError } from './supabaseClient';

export const ALL_TABLE_NAMES = [
  'trips',
  'travelers',
  'itinerary_days',
  'accommodations',
  'car_rentals',
  'flight_segments',
  'park_ticket_purchases',
  'expenses',
  'baggage_items',
  'booking_milestones',
  'preparation_documents',
  'settlement_payments',
  'traveler_attraction_selections',
  'park_day_bookings',
  'hourly_schedules',
  'park_dining_reservations',
  'park_fast_passes',
  'park_shows_reservations',
  'park_photo_packages',
] as const;

export type TableName = typeof ALL_TABLE_NAMES[number];

export interface BackupPayload {
  appName: string;
  backupVersion: string;
  createdAt: string;
  tables: Record<string, any[]>;
  localState?: Record<string, any>;
}

/**
  Generate a complete JSON backup payload containing all 19 Supabase tables and context fallback data
 */
export async function generateFullBackupPayload(contextData?: any): Promise<BackupPayload> {
  const tablesData: Record<string, any[]> = {};

  for (const tableName of ALL_TABLE_NAMES) {
    try {
      const { data, error } = await supabase.from(tableName).select('*');
      if (!error && Array.isArray(data)) {
        tablesData[tableName] = data;
      } else {
        tablesData[tableName] = [];
      }
    } catch {
      tablesData[tableName] = [];
    }
  }

  const payload: BackupPayload = {
    appName: 'KingdomCompass',
    backupVersion: '2.0',
    createdAt: new Date().toISOString(),
    tables: tablesData,
  };

  if (contextData) {
    payload.localState = {
      trips: contextData.trips || [],
      activeTripId: contextData.activeTripId || null,
      settings: contextData.settings || null,
      expenses: contextData.expenses || [],
      itineraryDays: contextData.itineraryDays || [],
      flights: contextData.flights || [],
      accommodations: contextData.accommodations || [],
      carRentals: contextData.carRentals || [],
      parkTickets: contextData.parkTickets || [],
      prepDocuments: contextData.prepDocuments || [],
      baggageItems: contextData.baggageItems || [],
      bookingMilestones: contextData.bookingMilestones || [],
    };
  }

  return payload;
}

/**
 * Download backup JSON file to user's computer
 */
export function downloadBackupFile(payload: BackupPayload) {
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `backup_kingdomcompass_${dateStr}.json`;
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse and validate a JSON backup payload
 */
export function validateBackupPayload(jsonContent: string | object): {
  valid: boolean;
  payload?: BackupPayload;
  error?: string;
  summary?: { tableCount: number; recordCount: number; tableDetails: Record<string, number> };
} {
  try {
    let parsed: any;
    if (typeof jsonContent === 'string') {
      parsed = JSON.parse(jsonContent);
    } else {
      parsed = jsonContent;
    }

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'O conteúdo do arquivo não é um JSON válido.' };
    }

    const tables = parsed.tables || {};
    const tableDetails: Record<string, number> = {};
    let totalRecords = 0;

    for (const key of Object.keys(tables)) {
      if (Array.isArray(tables[key])) {
        tableDetails[key] = tables[key].length;
        totalRecords += tables[key].length;
      }
    }

    if (totalRecords === 0 && (!parsed.localState || Object.keys(parsed.localState).length === 0)) {
      return { valid: false, error: 'O arquivo de backup está vazio ou não contém tabelas reconhecidas.' };
    }

    return {
      valid: true,
      payload: parsed as BackupPayload,
      summary: {
        tableCount: Object.keys(tableDetails).length,
        recordCount: totalRecords,
        tableDetails,
      },
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Falha ao analisar o arquivo JSON.' };
  }
}

/**
 * Restore database and local state from a backup payload
 */
export async function executeBackupRestore(
  payload: BackupPayload
): Promise<{ success: boolean; restoredTables: Record<string, number>; totalRestored: number; error?: string }> {
  try {
    const restoredTables: Record<string, number> = {};
    let totalRestored = 0;
    const tables = payload.tables || {};

    // Restore each table in parent-first dependency order
    for (const tableName of ALL_TABLE_NAMES) {
      const rows = tables[tableName];
      if (Array.isArray(rows) && rows.length > 0) {
        try {
          // Batch upsert rows
          const { error } = await supabase.from(tableName).upsert(rows, { onConflict: 'id' });
          if (error) {
            console.warn(`Aviso ao restaurar tabela ${tableName}:`, error.message);
          } else {
            restoredTables[tableName] = rows.length;
            totalRestored += rows.length;
          }
        } catch (err) {
          console.warn(`Exceção ao restaurar tabela ${tableName}:`, err);
        }
      }
    }

    return {
      success: true,
      restoredTables,
      totalRestored,
    };
  } catch (err: any) {
    return {
      success: false,
      restoredTables: {},
      totalRestored: 0,
      error: err?.message || 'Erro ao restaurar o backup.',
    };
  }
}
