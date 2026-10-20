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
 * Generate a JSON backup payload containing all 19 Supabase tables using stable pagination (chunks of 1000 rows).
 * Fails backup generation if any page query fails.
 */
export async function generateFullBackupPayload(contextData?: any): Promise<BackupGenerationResult> {
  const tablesData: Record<string, any[]> = {};
  const tableCounts: Record<string, number> = {};
  const tableErrors: Record<string, string> = {};
  const failedTables: string[] = [];
  let totalRecords = 0;
  const PAGE_SIZE = 1000;

  for (const tableName of ALL_TABLE_NAMES) {
    try {
      let from = 0;
      let allRows: any[] = [];
      let hasMore = true;
      let tableFailed = false;
      let errorMessage = '';

      while (hasMore) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          tableFailed = true;
          errorMessage = error.message;
          break;
        }

        if (Array.isArray(data)) {
          allRows = allRows.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            from += PAGE_SIZE;
          }
        } else {
          hasMore = false;
        }
      }

      if (tableFailed) {
        tableErrors[tableName] = errorMessage;
        failedTables.push(tableName);
      } else {
        tablesData[tableName] = allRows;
        tableCounts[tableName] = allRows.length;
        totalRecords += allRows.length;
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

    // 1. Validate appName and backupVersion before accepting
    if (parsed.appName && parsed.appName !== 'KingdomCompass') {
      return { valid: false, error: `Aplicativo incompatível (${parsed.appName}). Esperado: KingdomCompass.` };
    }

    if (parsed.backupVersion && parsed.backupVersion !== '2.0') {
      return { valid: false, error: `Versão de backup incompatível (${parsed.backupVersion}). Suportada: 2.0.` };
    }

    if (!parsed.tables || typeof parsed.tables !== 'object') {
      return { valid: false, error: 'O arquivo não contém a estrutura de tabelas esperada.' };
    }

    const tables = parsed.tables;
    const tableDetails: Record<string, number> = {};
    let totalRecords = 0;

    for (const key of Object.keys(tables)) {
      if (Array.isArray(tables[key])) {
        tableDetails[key] = tables[key].length;
        totalRecords += tables[key].length;
      }
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
 * Restore database from a backup payload with strict pre-write validation and ID verification in safe chunks:
 * - Rejects incompatible files before any write.
 * - Uses batch chunking (200 IDs) for verification.
 * - Strict isPartial: true ONLY when at least one table with records was successfully restored and verified, but another failed/missing.
 * - If totalRestored === 0, does not report partial restoration.
 */
export async function executeBackupRestore(
  payload: BackupPayload
): Promise<RestoreResult> {
  // 1. Pre-write validation of structure, appName, and version
  if (!payload || typeof payload !== 'object' || !payload.tables) {
    return {
      success: false,
      isPartial: false,
      tableMetrics: {},
      totalExpected: 0,
      totalRestored: 0,
      totalVerified: 0,
      failedTables: [],
      error: 'Arquivo de backup inválido ou estrutura de tabelas ausente.',
    };
  }

  if (payload.appName && payload.appName !== 'KingdomCompass') {
    return {
      success: false,
      isPartial: false,
      tableMetrics: {},
      totalExpected: 0,
      totalRestored: 0,
      totalVerified: 0,
      failedTables: [],
      error: `Arquivo incompatível: appName '${payload.appName}' não suportado.`,
    };
  }

  if (payload.backupVersion && payload.backupVersion !== '2.0') {
    return {
      success: false,
      isPartial: false,
      tableMetrics: {},
      totalExpected: 0,
      totalRestored: 0,
      totalVerified: 0,
      failedTables: [],
      error: `Versão de backup incompatível (${payload.backupVersion}). Versão suportada: 2.0.`,
    };
  }

  const tableMetrics: Record<string, TableRestoreMetrics> = {};
  const failedTables: string[] = [];
  const missingTables: string[] = [];
  let totalExpected = 0;
  let totalRestored = 0;
  let totalVerified = 0;
  let tablesSuccessfulCount = 0;
  let tablesEmptyCount = 0;

  const tables = payload.tables;

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

      // 2. Verify persistence in safe chunks (200 IDs at a time)
      const ids = rows.map((r: any) => r.id);
      const CHUNK_SIZE = 200;
      let verifiedCount = 0;
      let verifyFailed = false;
      let verifyErrorMsg = '';

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunkIds = ids.slice(i, i + CHUNK_SIZE);
        const { data: verifyData, error: verifyError } = await supabase
          .from(tableName)
          .select('id')
          .in('id', chunkIds);

        if (verifyError || !Array.isArray(verifyData)) {
          verifyFailed = true;
          verifyErrorMsg = verifyError?.message || 'Erro ao consultar chunk de IDs';
          break;
        }
        verifiedCount += verifyData.length;
      }

      if (verifyFailed || verifiedCount < expectedCount) {
        tableMetrics[tableName] = {
          expectedCount,
          writtenCount,
          verifiedCount,
          status: 'failed',
          error: verifyErrorMsg || `Verificação incompleta: esperados ${expectedCount}, confirmados ${verifiedCount}`,
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

  // Success is true ONLY if zero failed tables and zero missing tables.
  const success = failedTables.length === 0 && missingTables.length === 0;

  // isPartial is true ONLY when at least one table with records was successfully restored (totalRestored > 0),
  // but there are failed tables or missing tables. If totalRestored === 0, it's not partial (it's total failure or incompatible).
  const isPartial = !success && totalRestored > 0 && (failedTables.length > 0 || missingTables.length > 0);

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
