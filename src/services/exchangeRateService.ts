import { ExchangeRateData } from '../types';

const isPositiveRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const parseFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePositiveRate = (value: unknown): number | null => {
  const parsed = parseFiniteNumber(value);
  return parsed !== null && isPositiveRate(parsed) ? parsed : null;
};

export const fetchLiveExchangeRate = async (): Promise<ExchangeRateData> => {
  // This value is only a reference estimate. It must never be treated as a live quote.
  const fallbackData: ExchangeRateData = {
    rate: 5.75,
    lastUpdated: 'Não consultada',
    source: 'Estimativa de referência (fontes indisponíveis)',
    isEstimated: true,
  };

  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      if (res.ok) return await res.json();
    } catch {
      // Continue to the next provider when a source is unavailable.
    }
    return null;
  };

  // Primary: server-side proxy route.
  const serverJson = await safeFetch('/api/exchange-rate');
  if (serverJson?.success && serverJson.data) {
    const rate = parsePositiveRate(serverJson.data.rate);
    if (rate !== null) {
      return {
        ...serverJson.data,
        rate,
        lastUpdated: serverJson.data.lastUpdated || new Date().toLocaleTimeString('pt-BR'),
        source: serverJson.data.source || 'Cotação consultada pelo servidor',
        isEstimated: false,
      };
    }
  }

  // Fallback 1: AwesomeAPI (Dólar Comercial Brasil).
  const awesomeJson = await safeFetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
    cache: 'no-store',
  });
  const item = awesomeJson?.USDBRL;
  if (item) {
    const rate = parsePositiveRate(item.bid) ?? parsePositiveRate(item.ask);
    if (rate !== null) {
      return {
        rate,
        bid: parsePositiveRate(item.bid) ?? undefined,
        ask: parsePositiveRate(item.ask) ?? undefined,
        high: parsePositiveRate(item.high) ?? undefined,
        low: parsePositiveRate(item.low) ?? undefined,
        pctChange: parseFiniteNumber(item.pctChange) ?? undefined,
        varBid: parseFiniteNumber(item.varBid) ?? undefined,
        lastUpdated: item.create_date || new Date().toLocaleTimeString('pt-BR'),
        source: 'AwesomeAPI (Dólar Comercial Oficial)',
        isEstimated: false,
      };
    }
  }

  // Fallback 2: Open ER API.
  const erJson = await safeFetch('https://open.er-api.com/v6/latest/USD');
  const rate = parsePositiveRate(erJson?.rates?.BRL);
  if (erJson?.result === 'success' && rate !== null) {
    return {
      rate,
      lastUpdated: new Date().toLocaleTimeString('pt-BR'),
      source: 'ExchangeRate API Global',
      isEstimated: false,
    };
  }

  // Never present a fixed value as a quote retrieved from a source.
  return fallbackData;
};
