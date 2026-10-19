/**
 * Utilities for formatting and parsing currency inputs.
 */

export const parseInputToNumber = (valStr: string): number => {
  let clean = valStr.trim();
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.indexOf(',') > clean.indexOf('.')) {
      clean = clean.replace(/\./g, '');
    } else {
      clean = clean.replace(/,/g, '');
    }
  }
  clean = clean.replace(',', '.');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

export const formatInputDisplay = (val: number): string => {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
