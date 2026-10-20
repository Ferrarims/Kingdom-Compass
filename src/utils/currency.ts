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

export const parseInputToNumber = (valStr: string, currency: CurrencyType = 'BRL'): number => {
  if (!valStr) return 0;
  let clean = valStr.trim();
  if (currency === 'BRL') {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(/,/g, '');
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
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
