import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://fmwikutwogsvobbyzjpk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd2lrdXR3b2dzdm9iYnl6anBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTEzNDUsImV4cCI6MjEwMzI2NzM0NX0.sap72mGbzeypWPfLX0HI-GG43eOixK3Ek3XimHDGKVk';

export function cleanSupabaseUrl(url: string): string {
  if (!url) return '';
  let cleaned = url.trim();
  // Remove /rest/v1 or /rest/v1/ if user pasted API endpoint URL
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

export function getSupabaseConfig() {
  try {
    let savedUrl = localStorage.getItem('supabase_custom_url');
    const savedKey = localStorage.getItem('supabase_custom_key');

    // Clean up if saved URL had /rest/v1/ appended erroneously
    if (savedUrl) {
      const cleaned = cleanSupabaseUrl(savedUrl);
      if (cleaned !== savedUrl) {
        localStorage.setItem('supabase_custom_url', cleaned);
        savedUrl = cleaned;
      }
    }

    return {
      url: cleanSupabaseUrl(savedUrl || import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL),
      key: savedKey || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
      isCustom: !!(savedUrl || savedKey),
    };
  } catch (e) {
    return {
      url: cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL),
      key: import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
      isCustom: false,
    };
  }
}

const currentConfig = getSupabaseConfig();
export const SUPABASE_URL = currentConfig.url;
export const SUPABASE_ANON_KEY = currentConfig.key;

export let supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export function updateSupabaseCredentials(url: string, key: string) {
  const cleanedUrl = cleanSupabaseUrl(url);
  const trimmedKey = key.trim();

  try {
    if (cleanedUrl) localStorage.setItem('supabase_custom_url', cleanedUrl);
    if (trimmedKey) localStorage.setItem('supabase_custom_key', trimmedKey);
  } catch (e) {}

  supabase = createClient(cleanedUrl, trimmedKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export function resetSupabaseCredentials() {
  try {
    localStorage.removeItem('supabase_custom_url');
    localStorage.removeItem('supabase_custom_key');
  } catch (e) {}
  supabase = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export function isSupabaseMissingTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || error.details || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST106' ||
    msg.includes('does not exist') ||
    msg.includes('relation')
  );
}

/**
 * Quick connection health check
 */
export async function checkSupabaseConnection(): Promise<{ ok: boolean; message: string; tablesExist?: boolean }> {
  try {
    const { data, error } = await supabase.from('trips').select('id, trip_code').limit(1);
    if (error) {
      const msg = String(error.message || error.details || '').toLowerCase();
      if (error.code === 'PGRST125' || msg.includes('invalid path')) {
        return {
          ok: false,
          tablesExist: false,
          message: 'URL do Supabase incorreta! Por favor remova "/rest/v1/" do final da URL.',
        };
      }
      if (isSupabaseMissingTableError(error)) {
        return {
          ok: true,
          tablesExist: false,
          message: 'As tabelas ainda não foram criadas no banco de dados do Supabase.',
        };
      }
      return { ok: false, message: error.message };
    }
    return {
      ok: true,
      tablesExist: true,
      message: 'Conectado e sincronizado com o Supabase com sucesso!',
    };
  } catch (err: any) {
    if (isSupabaseMissingTableError(err)) {
      return {
        ok: true,
        tablesExist: false,
        message: 'As tabelas ainda não foram criadas no banco de dados do Supabase.',
      };
    }
    return { ok: false, message: err?.message || 'Falha ao conectar com o Supabase' };
  }
}

