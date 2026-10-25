export type RulesBinding = { jobId: string; role: string };
export type ScheduleRecord = Record<string, unknown> & { id: string };

function binding(value: unknown): RulesBinding | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Vínculo de regra inválido.');
  }
  const row = value as Record<string, unknown>;
  if (typeof row.jobId !== 'string' || !row.jobId ||
      typeof row.role !== 'string' || !row.role) {
    throw new Error('Vínculo sem jobId/role válidos.');
  }
  return { jobId: row.jobId, role: row.role };
}
export function sameRulesBinding(a: unknown, b: unknown): boolean {
  const left = binding(a), right = binding(b);
  if (!left || !right) return left === right;
  return left.jobId === right.jobId && left.role === right.role;
}
export function readRulesMetadata(item: Record<string, unknown>) {
  const camel = binding(item.ruleBinding);
  const snake = binding(item.rule_binding);
  if (camel && snake && !sameRulesBinding(camel, snake)) {
    throw new Error('Vínculos camelCase/snake_case divergentes: ' + item.id);
  }
  const zone = item.timeZone ?? item.time_zone;
  if (zone != null && (typeof zone !== 'string' || !zone)) {
    throw new Error('Fuso inválido no item ' + item.id);
  }
  if (item.timeZone != null && item.time_zone != null &&
      item.timeZone !== item.time_zone) {
    throw new Error('Fusos divergentes no item ' + item.id);
  }
  return {
    timeZone: zone == null ? undefined : String(zone),
    ruleBinding: camel ?? snake,
  };
}
/** Mantém os campos editados; recupera somente metadados omitidos pelo mapper. */
export function preserveHourlyMetadata<T extends { id: string }>(
  incoming: T, persisted?: { id: string },
): T {
  const a = incoming as T & Record<string, unknown>;
  const b = (persisted ?? {}) as Record<string, unknown>;
  const next = readRulesMetadata(a), old = readRulesMetadata(b);
  const zone = next.timeZone ?? old.timeZone;
  const link = next.ruleBinding ?? old.ruleBinding;
  const result: Record<string, unknown> = { ...a };
  delete result.time_zone;
  delete result.rule_binding;
  if (zone !== undefined) result.timeZone = zone;
  if (link !== undefined) result.ruleBinding = link;
  return result as T;
}
/** A tabela normalizada não possui as colunas de metadados do JSONB. */
export function hydrateHourlySchedule<T extends { id: string }>(
  jsonItems: readonly T[], relationalItems: readonly T[],
): T[] {
  const json = new Map(jsonItems.map(item => [item.id, item]));
  const output = relationalItems.map(item =>
    preserveHourlyMetadata(item, json.get(item.id)));
  const ids = new Set(output.map(item => item.id));
  // Uma representação incompleta não pode apagar itens exclusivos da outra.
  for (const item of jsonItems) {
    if (!ids.has(item.id)) {
      output.push(preserveHourlyMetadata(item));
      ids.add(item.id);
    }
  }
  return output;
}
export function assertHourlyMetadata(
  stored: Record<string, unknown>,
  expected: { timeZone: string; binding?: RulesBinding },
): void {
  const actual = readRulesMetadata(stored);
  const missing: string[] = [];
  if (actual.timeZone !== expected.timeZone) {
    missing.push('timeZone: esperado=' + expected.timeZone +
      ', gravado=' + String(actual.timeZone));
  }
  if (!sameRulesBinding(actual.ruleBinding, expected.binding)) {
    missing.push('ruleBinding: esperado=' + JSON.stringify(expected.binding ?? null) +
      ', gravado=' + JSON.stringify(actual.ruleBinding ?? null));
  }
  if (missing.length) {
    throw new Error('Metadados não persistidos no item ' + stored.id +
      ': ' + missing.join('; '));
  }
}
/** Compara JSON sem depender da ordem de propriedades; preserva null e arrays. */
export function stableJson(value: unknown): string {
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(canonical);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(Object.entries(entry as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, canonical(item)]));
    }
    return entry;
  };
  const output = JSON.stringify(canonical(value));
  if (output === undefined) throw new Error('Snapshot JSON inválido.');
  return output;
}
