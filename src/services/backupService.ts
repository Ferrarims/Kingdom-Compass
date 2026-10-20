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
 * Generate a JSON backup payload containing all 19 Supabase tables using deterministic pagination (.order('id').range(...)).
 * Treats any non-array response as a table failure.
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
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          tableFailed = true;
          errorMessage = error.message;
          break;
        }

        if (!Array.isArray(data)) {
          tableFailed = true;
          errorMessage = 'Resposta inválida do servidor (dados não retornados em formato de array)';
          break;
        }

        allRows = allRows.concat(data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
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
 * Parse and validate a JSON backup payload with strict appName === "KingdomCompass" and backupVersion === "2.0".
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

    if (parsed.appName !== 'KingdomCompass') {
      return { valid: false, error: `Arquivo incompatível: appName '${parsed.appName}' inválido. Esperado: 'KingdomCompass'.` };
    }

    if (parsed.backupVersion !== '2.0') {
      return { valid: false, error: `Versão de backup incompatível ('${parsed.backupVersion}'). Suportada estritamente: '2.0'.` };
    }

    if (!parsed.tables || typeof parsed.tables !== 'object') {
      return { valid: false, error: 'O arquivo não contém a estrutura de tabelas esperada.' };
    }

    const tables = parsed.tables;
    const tableDetails: Record<string, number> = {};
    let totalRecords = 0;

    for (const tableName of ALL_TABLE_NAMES) {
      if (!(tableName in tables)) {
        return { valid: false, error: `Tabela obrigatória '${tableName}' está ausente no arquivo.` };
      }
      const rows = tables[tableName];
      if (!Array.isArray(rows)) {
        return { valid: false, error: `A tabela '${tableName}' não é um array válido.` };
      }

      // Check row validity & uniqueness of IDs within table
      const seenIds = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row !== 'object') {
          return { valid: false, error: `A tabela '${tableName}' contém registros inválidos (não são objetos).` };
        }
        if (row.id === null || row.id === undefined || String(row.id).trim() === '') {
          return { valid: false, error: `A tabela '${tableName}' contém registro sem ID válido.` };
        }
        const strId = String(row.id);
        if (seenIds.has(strId)) {
          return { valid: false, error: `ID duplicado ('${strId}') encontrado na tabela '${tableName}'.` };
        }
        seenIds.add(strId);
      }

      tableDetails[tableName] = rows.length;
      totalRecords += rows.length;
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
 * Restore database from a backup payload with rigorous pre-write validation and exact set chunk verification (200 IDs).
 */
export async function executeBackupRestore(
  payload: BackupPayload
): Promise<RestoreResult> {
  // Pre-write validation
  const validation = validateBackupPayload(payload);
  if (!validation.valid || !validation.payload) {
    return {
      success: false,
      isPartial: false,
      tableMetrics: {},
      totalExpected: 0,
      totalRestored: 0,
      totalVerified: 0,
      failedTables: [],
      error: validation.error || 'Falha na validação pré-gravação do arquivo de backup.',
    };
  }

  const tableMetrics: Record<string, TableRestoreMetrics> = {};
  const failedTables: string[] = [];
  let totalExpected = 0;
  let totalRestored = 0;
  let totalVerified = 0;
  let tablesSuccessfulCount = 0;
  let tablesEmptyCount = 0;

  const tables = payload.tables;

  for (const tableName of ALL_TABLE_NAMES) {
    const rows = tables[tableName];
    if (!Array.isArray(rows)) {
      tableMetrics[tableName] = {
        expectedCount: 0,
        writtenCount: 0,
        verifiedCount: 0,
        status: 'failed',
        error: 'Tabela ausente ou inválida',
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

    const expectedCount = rows.length;
    totalExpected += expectedCount;

    try {
      // Sanitize rows if table is park_ticket_purchases to omit legacy voucher_attachment
      const sanitizedRows = tableName === 'park_ticket_purchases'
        ? rows.map((r: any) => {
            if (!r || typeof r !== 'object') return r;
            const { voucher_attachment, voucherAttachment, ...rest } = r;
            return rest;
          })
        : rows;

      // 1. Batch upsert rows and select ids
      const { data: upsertData, error: upsertError } = await supabase
        .from(tableName)
        .upsert(sanitizedRows, { onConflict: 'id' })
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

      // 2. Exact set chunk verification (200 IDs at a time)
      const expectedIds = new Set(rows.map((r: any) => String(r.id)));
      const foundIds = new Set<string>();
      let verifyFailed = false;
      let verifyErrorMsg = '';

      const CHUNK_SIZE = 200;
      const idList = Array.from(expectedIds);

      for (let i = 0; i < idList.length; i += CHUNK_SIZE) {
        const chunkIds = idList.slice(i, i + CHUNK_SIZE);
        const { data: verifyData, error: verifyError } = await supabase
          .from(tableName)
          .select('id')
          .in('id', chunkIds);

        if (verifyError || !Array.isArray(verifyData)) {
          verifyFailed = true;
          verifyErrorMsg = verifyError?.message || 'Erro ao consultar chunk de IDs para verificação';
          break;
        }

        for (const item of verifyData) {
          if (item && item.id !== undefined && item.id !== null) {
            foundIds.add(String(item.id));
          }
        }
      }

      // Verify that every expected ID is present in foundIds
      let allExpectedFound = !verifyFailed;
      if (!verifyFailed) {
        for (const id of expectedIds) {
          if (!foundIds.has(id)) {
            allExpectedFound = false;
            break;
          }
        }
      }

      const verifiedCount = foundIds.size;

      if (verifyFailed || !allExpectedFound || verifiedCount < expectedCount) {
        tableMetrics[tableName] = {
          expectedCount,
          writtenCount,
          verifiedCount,
          status: 'failed',
          error: verifyErrorMsg || `Verificação incorreta: esperados ${expectedCount} IDs únicos, confirmados ${verifiedCount}`,
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

  const success = failedTables.length === 0;
  const isPartial = !success && totalRestored > 0 && failedTables.length > 0;

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
