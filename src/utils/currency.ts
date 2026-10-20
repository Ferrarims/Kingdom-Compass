/**
 * Utilities for formatting and parsing currency inputs.
 */

export type CurrencyType = 'BRL' | 'USD';

/**
 * Format a numeric value into BRL or USD currency string.
 * BRL: 1.234,56
 * USD: 1,234.56
 */
export const formatCurrency = (val: number | null | undefined, currency: CurrencyType = 'BRL', showSymbol: boolean = true): string => {
  if (val === null || val === undefined || isNaN(val)) {
    return currency === 'BRL' ? (showSymbol ? 'R$ 0,00' : '0,00') : (showSymbol ? '$ 0.00' : '0.00');
  }

  const parts = val.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  let formattedInteger = '';
  if (currency === 'BRL') {
    formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const result = `${formattedInteger},${decimalPart}`;
    return showSymbol ? `R$ ${result}` : result;
  } else {
    formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = `${formattedInteger}.${decimalPart}`;
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
    return isNaN(valStr) ? null : valStr;
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
    return isNaN(parsed) ? null : parsed;
  } else {
    // Strict USD format: optional thousand separators (,) and mandatory dot decimals (.) with 2 digits
    const usdRegex = /^(\d{1,3}(,\d{3})*|\d+)(\.\d{2})?$/;
    if (!usdRegex.test(clean)) return null;
    const numStr = clean.replace(/,/g, '');
    const parsed = Number(numStr);
    return isNaN(parsed) ? null : parsed;
  }
};

export const digitsToNumber = (digitsStr: string): number => {
  const digits = digitsStr.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

export const formatInputDisplay = (val: number | null | undefined, currency: CurrencyType = 'BRL'): string => {
  if (val === null || val === undefined || isNaN(val)) return '';
  return formatCurrency(val, currency, false);
};
