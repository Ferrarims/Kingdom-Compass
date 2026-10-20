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

export interface BackupGenerationResult {
  success: boolean;
  payload?: BackupPayload;
  tableCounts: Record<string, number>;
  tableErrors: Record<string, string>;
  failedTables: string[];
  totalRecords: number;
}

export interface TableRestoreMetrics {
  expectedCount: number;
  writtenCount: number;
  verifiedCount: number;
  status: 'restored' | 'empty' | 'missing_in_file' | 'failed';
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  isPartial: boolean;
  tableMetrics: Record<string, TableRestoreMetrics>;
  totalExpected: number;
  totalRestored: number;
  totalVerified: number;
  failedTables: string[];
  error?: string;
}

/**
 * Generate a JSON backup payload containing all 19 Supabase tables with rigorous validation.
 * Differentiates truly empty tables (data: []) from queries with errors, exceptions, or invalid responses.
 * Fails the backup generation if any table query fails.
 */
export async function generateFullBackupPayload(contextData?: any): Promise<BackupGenerationResult> {
  const tablesData: Record<string, any[]> = {};
  const tableCounts: Record<string, number> = {};
  const tableErrors: Record<string, string> = {};
  const failedTables: string[] = [];
  let totalRecords = 0;

  for (const tableName of ALL_TABLE_NAMES) {
    try {
      const { data, error } = await supabase.from(tableName).select('*');
      
      if (error) {
        tableErrors[tableName] = error.message;
        failedTables.push(tableName);
      } else if (!Array.isArray(data)) {
        tableErrors[tableName] = 'Resposta inválida do servidor (dados não retornados em formato de array)';
        failedTables.push(tableName);
      } else {
        tablesData[tableName] = data;
        tableCounts[tableName] = data.length;
        totalRecords += data.length;
      }
    } catch (err: any) {
      tableErrors[tableName] = err?.message || 'Exceção inesperada ao consultar tabela';
      failedTables.push(tableName);
    }
  }

  const success = failedTables.length === 0;

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

  return {
    success,
    payload: success ? payload : undefined,
    tableCounts,
    tableErrors,
    failedTables,
    totalRecords,
  };
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
 * Restore database from a backup payload with rigorous validation:
 * - Requires all 19 expected tables for version 2.0 to be present (missing_in_file marked as error / partial).
 * - Validates IDs on all rows before upserting.
 * - Does NOT assume writtenCount = expectedCount without confirmed upsert and subsequent ID verification query in Supabase.
 * - Handles empty/no-op backups correctly.
 */
export async function executeBackupRestore(
  payload: BackupPayload
): Promise<RestoreResult> {
  const tableMetrics: Record<string, TableRestoreMetrics> = {};
  const failedTables: string[] = [];
  const missingTables: string[] = [];
  let totalExpected = 0;
  let totalRestored = 0;
  let totalVerified = 0;
  let tablesAttemptedCount = 0;
  let tablesSuccessfulCount = 0;
  let tablesEmptyCount = 0;

  const tables = payload.tables || {};

  for (const tableName of ALL_TABLE_NAMES) {
    if (!(tableName in tables)) {
      tableMetrics[tableName] = {
        expectedCount: 0,
        writtenCount: 0,
        verifiedCount: 0,
        status: 'missing_in_file',
        error: 'Tabela obrigatória ausente no arquivo de backup',
      };
      missingTables.push(tableName);
      failedTables.push(tableName);
      continue;
    }

    const rows = tables[tableName];
    if (!Array.isArray(rows)) {
      tableMetrics[tableName] = {
        expectedCount: 0,
        writtenCount: 0,
        verifiedCount: 0,
        status: 'failed',
        error: 'Dados da tabela no backup não estão em formato de array',
      };
      failedTables.push(tableName);
      continue;
    }

    if (rows.length === 0) {
      tableMetrics[tableName] = {
        expectedCount: 0,
        writtenCount: 0,
        verifiedCount: 0,
        status: 'empty',
      };
      tablesEmptyCount++;
      continue;
    }

    // Validate that all rows have a valid non-empty id
    const invalidRow = rows.find((r: any) => !r || r.id === null || r.id === undefined || String(r.id).trim() === '');
    if (invalidRow) {
      tableMetrics[tableName] = {
        expectedCount: rows.length,
        writtenCount: 0,
        verifiedCount: 0,
        status: 'failed',
        error: 'Registros contêm IDs ausentes ou inválidos',
      };
      failedTables.push(tableName);
      continue;
    }

    const expectedCount = rows.length;
    totalExpected += expectedCount;
    tablesAttemptedCount++;

    try {
      // 1. Batch upsert rows and select ids
      const { data: upsertData, error: upsertError } = await supabase
        .from(tableName)
        .upsert(rows, { onConflict: 'id' })
        .select('id');

      if (upsertError || !Array.isArray(upsertData)) {
        tableMetrics[tableName] = {
          expectedCount,
          writtenCount: 0,
          verifiedCount: 0,
          status: 'failed',
          error: upsertError?.message || 'Upsert não retornou confirmação válida de gravação',
        };
        failedTables.push(tableName);
        continue;
      }

      const writtenCount = upsertData.length;

      // 2. Verify persistence by querying IDs back from Supabase
      const ids = rows.map((r: any) => r.id);
      const { data: verifyData, error: verifyError } = await supabase
        .from(tableName)
        .select('id')
        .in('id', ids);

      if (verifyError || !Array.isArray(verifyData)) {
        tableMetrics[tableName] = {
          expectedCount,
          writtenCount,
          verifiedCount: 0,
          status: 'failed',
          error: `Erro ao confirmar persistência: ${verifyError?.message || 'Resposta inválida'}`,
        };
        failedTables.push(tableName);
        continue;
      }

      const verifiedCount = verifyData.length;

      if (verifiedCount < expectedCount) {
        tableMetrics[tableName] = {
          expectedCount,
          writtenCount,
          verifiedCount,
          status: 'failed',
          error: `Verificação incompleta: esperados ${expectedCount}, confirmados no Supabase ${verifiedCount}`,
        };
        failedTables.push(tableName);
      } else {
        tableMetrics[tableName] = {
          expectedCount,
          writtenCount,
          verifiedCount,
          status: 'restored',
        };
        totalRestored += writtenCount;
        totalVerified += verifiedCount;
        tablesSuccessfulCount++;
      }
    } catch (err: any) {
      tableMetrics[tableName] = {
        expectedCount,
        writtenCount: 0,
        verifiedCount: 0,
        status: 'failed',
        error: err?.message || 'Exceção ao processar restauração da tabela',
      };
      failedTables.push(tableName);
    }
  }

  // Success is true ONLY if:
  // 1. Zero failed tables and zero missing tables.
  // 2. All 19 tables are represented (restored or empty).
  const success = failedTables.length === 0 && missingTables.length === 0;
  const isPartial = !success && (tablesSuccessfulCount > 0 || tablesEmptyCount > 0 || missingTables.length > 0);

  return {
    success,
    isPartial,
    tableMetrics,
    totalExpected,
    totalRestored,
    totalVerified,
    failedTables,
    error: failedTables.length > 0 ? `Falhas detectadas nas tabelas: ${failedTables.join(', ')}` : undefined,
  };
}
