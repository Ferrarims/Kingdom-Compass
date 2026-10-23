/**
 * Utilities for formatting and parsing currency inputs.
 */

export type CurrencyType = 'BRL' | 'USD';

/**
 * Safely coerces any input (number, string, null, undefined) to a finite number or null.
 * Handles Brazilian (1.234,56), US (1,234.56), standard floats (1234.56), and currency symbols.
 */
export const coerceToNumber = (val: number | string | null | undefined): number | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? null : val;
  }
  if (typeof val === 'string') {
    const clean = val
      .replace(/^(R\$|US\$|\$|BRL|USD)\s*/i, '')
      .replace(/\s*(BRL|USD)$/i, '')
      .trim();
    if (!clean) return null;

    // Check if it's already a standard JavaScript number string: "123.45" or "-123.45" or "123"
    if (/^-?\d+(\.\d+)?$/.test(clean)) {
      const num = Number(clean);
      return isNaN(num) || !isFinite(num) ? null : num;
    }

    // Check if it's Brazilian format with comma decimal: "123,45" or "1.234,56"
    if (/^-?(\d{1,3}(\.\d{3})*|\d+)(,\d+)?$/.test(clean)) {
      const num = Number(clean.replace(/\./g, '').replace(',', '.'));
      return isNaN(num) || !isFinite(num) ? null : num;
    }

    // Check if it's US format with comma thousands: "1,234.56"
    if (/^-?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/.test(clean)) {
      const num = Number(clean.replace(/,/g, ''));
      return isNaN(num) || !isFinite(num) ? null : num;
    }

    // Fallback: strip unexpected characters and try parsing
    const fallbackStr = clean.replace(/[^\d.,-]/g, '');
    if (!fallbackStr) return null;
    if (fallbackStr.includes(',') && !fallbackStr.includes('.')) {
      const num = Number(fallbackStr.replace(',', '.'));
      return isNaN(num) || !isFinite(num) ? null : num;
    }
    const num = Number(fallbackStr.replace(/,/g, ''));
    return isNaN(num) || !isFinite(num) ? null : num;
  }
  return null;
};

/**
 * Format a numeric or string value into BRL or USD currency string.
 * BRL: 1.234,56
 * USD: 1,234.56
 */
export const formatCurrency = (
  val: number | string | null | undefined,
  currency: CurrencyType = 'BRL',
  showSymbol: boolean = true
): string => {
  const num = coerceToNumber(val);
  if (num === null) {
    return currency === 'BRL' ? (showSymbol ? 'R$ 0,00' : '0,00') : (showSymbol ? '$ 0.00' : '0.00');
  }

  const isNegative = num < 0;
  const absVal = Math.abs(num);
  const parts = absVal.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  let formattedInteger = '';
  if (currency === 'BRL') {
    formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const result = `${isNegative ? '-' : ''}${formattedInteger},${decimalPart}`;
    return showSymbol ? `R$ ${result}` : result;
  } else {
    formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = `${isNegative ? '-' : ''}${formattedInteger}.${decimalPart}`;
    return showSymbol ? `$ ${result}` : result;
  }
};

/**
 * Strict parser validating full string according to currency format.
 * Rejects partially numeric text or invalid separator positions.
 */
export const parseInputToNumber = (valStr: string | number | null | undefined, currency: CurrencyType = 'BRL'): number | null => {
  if (valStr === null || valStr === undefined) return null;
  if (typeof valStr === 'number') {
    return isNaN(valStr) || !isFinite(valStr) ? null : valStr;
  }
  const clean = String(valStr)
    .replace(/^(R\$|US\$|\$|BRL|USD)\s*/i, '')
    .replace(/\s*(BRL|USD)$/i, '')
    .trim();
  if (!clean) return null;

  if (currency === 'BRL') {
    // Strict BRL format: optional thousand separators (.) and mandatory comma decimals (,) with 2 digits
    const brlRegex = /^(\d{1,3}(\.\d{3})*|\d+)(,\d{2})?$/;
    if (!brlRegex.test(clean)) return null;
    const numStr = clean.replace(/\./g, '').replace(',', '.');
    const parsed = Number(numStr);
    return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
  } else {
    // Strict USD format: optional thousand separators (,) and mandatory dot decimals (.) with 2 digits
    const usdRegex = /^(\d{1,3}(,\d{3})*|\d+)(\.\d{2})?$/;
    if (!usdRegex.test(clean)) return null;
    const numStr = clean.replace(/,/g, '');
    const parsed = Number(numStr);
    return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
  }
};

export const digitsToNumber = (digitsStr: string): number => {
  const digits = digitsStr.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

export const formatInputDisplay = (val: number | string | null | undefined, currency: CurrencyType = 'BRL'): string => {
  const num = coerceToNumber(val);
  if (num === null) return '';
  return formatCurrency(num, currency, false);
};
