/**
 * Centralized currency formatting, parsing, and input masking utilities for BRL and USD.
 * 
 * BRL mask: 1.234,56 (thousands dot, decimal comma)
 * USD mask: 1,234.56 (thousands comma, decimal dot)
 * Banking-style right-to-left typing for numeric inputs.
 */

export type CurrencyType = 'BRL' | 'USD';

/**
 * Parses any input string (or number) into a numeric value.
 */
export const parseInputToNumber = (valStr: string | number | undefined | null): number => {
  if (valStr === undefined || valStr === null || valStr === '') return 0;
  if (typeof valStr === 'number') return isNaN(valStr) ? 0 : valStr;

  let clean = valStr.trim();
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.indexOf(',') > clean.indexOf('.')) {
      // e.g. 1.234,56 -> dot is thousands, comma is decimal
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // e.g. 1,234.56 -> comma is thousands, dot is decimal
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    // only comma -> could be BRL decimal (123,45) or thousands (1,234)
    // In banking inputs, if there's no dot, comma is decimal if 1 or 2 digits follow, or thousands.
    // Let's support both comma as decimal
    clean = clean.replace(',', '.');
  }

  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Formats a numeric value for display according to the specified currency.
 * BRL: 1.234,56
 * USD: 1,234.56
 */
export const formatInputDisplay = (val: number | undefined | null, currency: CurrencyType = 'BRL'): string => {
  if (val === undefined || val === null || isNaN(val)) return '0,00';
  const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
  return val.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Formats currency with symbol (e.g., R$ 1.234,56 or US$ 1,234.56).
 */
export const formatCurrencySymbol = (val: number | undefined | null, currency: CurrencyType = 'BRL'): string => {
  if (val === undefined || val === null || isNaN(val)) val = 0;
  const formatted = formatInputDisplay(val, currency);
  return currency === 'BRL' ? `R$ ${formatted}` : `US$ ${formatted}`;
};

/**
 * Processes banking-style right-to-left typing for currency input fields.
 * Extracts digits, treats them as cents, and formats according to currency.
 */
export const handleCurrencyTyping = (
  rawInput: string,
  currency: CurrencyType = 'BRL'
): { numericValue: number; displayValue: string } => {
  const digits = rawInput.replace(/\D/g, '');
  if (!digits || digits === '') {
    return { numericValue: 0, displayValue: '' };
  }

  const numericValue = parseInt(digits, 10) / 100;
  const displayValue = formatInputDisplay(numericValue, currency);
  return { numericValue, displayValue };
};
