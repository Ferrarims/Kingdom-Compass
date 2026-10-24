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

export function validatePartialPayment(
  totalBrl: number,
  totalUsd: number,
  paidBrl: number | null | undefined,
  paidUsd: number | null | undefined,
  rate: number
): { valid: boolean; error?: string; paidBrl: number; paidUsd: number } {
  const r = Number(rate);
  if (isNaN(r) || !isFinite(r) || r <= 0) {
    return { valid: false, error: 'Cotação da viagem inválida ou ausente para validar pagamento parcial.', paidBrl: 0, paidUsd: 0 };
  }

  const totBrl = Number(totalBrl);
  const totUsd = Number(totalUsd);

  if ((isNaN(totBrl) || totBrl <= 0) && (isNaN(totUsd) || totUsd <= 0)) {
    return { valid: false, error: 'O valor total da reserva é zero ou inválido para pagamento Parcial.', paidBrl: 0, paidUsd: 0 };
  }

  const effectiveTotBrl = totBrl > 0 ? totBrl : totUsd * r;
  const effectiveTotUsd = totUsd > 0 ? totUsd : totBrl / r;

  if (effectiveTotBrl <= 0 || effectiveTotUsd <= 0 || !isFinite(effectiveTotBrl) || !isFinite(effectiveTotUsd)) {
    return { valid: false, error: 'O valor total calculado é inválido para pagamento Parcial.', paidBrl: 0, paidUsd: 0 };
  }

  const pBrl = paidBrl !== undefined && paidBrl !== null ? Number(paidBrl) : 0;
  const pUsd = paidUsd !== undefined && paidUsd !== null ? Number(paidUsd) : 0;

  if (isNaN(pBrl) || !isFinite(pBrl) || isNaN(pUsd) || !isFinite(pUsd)) {
    return { valid: false, error: 'Os valores pagos informados são inválidos (não finitos).', paidBrl: 0, paidUsd: 0 };
  }

  if (pBrl <= 0 && pUsd <= 0) {
    return { valid: false, error: 'Para pagamento Parcial, o valor pago deve ser maior que zero e menor que o valor total.', paidBrl: 0, paidUsd: 0 };
  }

  let finalPaidBrl = pBrl;
  let finalPaidUsd = pUsd;

  if (pBrl > 0) {
    if (pBrl <= 0 || pBrl >= effectiveTotBrl) {
      return { valid: false, error: 'Para pagamento Parcial, o valor pago em R$ deve ser maior que zero e menor que o valor total.', paidBrl: pBrl, paidUsd: pUsd };
    }
    finalPaidUsd = Math.round((pBrl / r) * 100) / 100;
  }

  if (pUsd > 0) {
    if (pUsd <= 0 || pUsd >= effectiveTotUsd) {
      return { valid: false, error: 'Para pagamento Parcial, o valor pago em US$ deve ser maior que zero e menor que o valor total.', paidBrl: pBrl, paidUsd: pUsd };
    }
    finalPaidBrl = Math.round(pUsd * r * 100) / 100;
  }

  if (pBrl > 0 && pUsd > 0) {
    const expectedUsdFromBrl = pBrl / r;
    if (Math.abs(expectedUsdFromBrl - pUsd) / pUsd > 0.1 && Math.abs(expectedUsdFromBrl - pUsd) > 5) {
      return { valid: false, error: 'Os valores pagos em BRL e USD são incompatíveis com a cotação vigente da viagem.', paidBrl: pBrl, paidUsd: pUsd };
    }
  }

  return { valid: true, paidBrl: finalPaidBrl, paidUsd: finalPaidUsd };
}
