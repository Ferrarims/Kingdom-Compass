import { ExchangeRateData } from '../types';

export const fetchLiveExchangeRate = async (): Promise<ExchangeRateData> => {
  // Strict numeric parser: accepts numbers and strict numeric strings, rejects partial like "5.75abc"
  const parseStrictRate = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
      return (!isNaN(val) && isFinite(val) && val > 0) ? val : null;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return null;
      const num = Number(trimmed);
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed) && parsed > 0 && !isNaN(num) && num === parsed) {
        return parsed;
      }
    }
    return null;
  };

  // Safe fetch helper that ignores network/cors errors
  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Ignore network / cors errors silently
    }
    return null;
  };

  // Primary: Server-side proxy route (bypasses CORS and network issues)
  const serverJson = await safeFetch('/api/exchange-rate');
  if (serverJson && serverJson.success && serverJson.data) {
    const rateVal = parseStrictRate(serverJson.data.rate);
    if (rateVal !== null) {
      return {
        ...serverJson.data,
        rate: rateVal,
        isEstimate: false,
      };
    }
  }

  // Fallback 1: Direct AwesomeAPI (Dólar Comercial Oficial Brasil)
  const awesomeJson = await safeFetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
    cache: 'no-store',
  });
  if (awesomeJson && awesomeJson.USDBRL) {
    const item = awesomeJson.USDBRL;
    const bidVal = parseStrictRate(item.bid);
    const askVal = parseStrictRate(item.ask);
    const rateVal = bidVal !== null ? bidVal : (askVal !== null ? askVal : null);

    if (rateVal !== null) {
      return {
        rate: rateVal,
        bid: bidVal !== null ? bidVal : undefined,
        ask: askVal !== null ? askVal : undefined,
        high: parseStrictRate(item.high) !== null ? parseStrictRate(item.high)! : undefined,
        low: parseStrictRate(item.low) !== null ? parseStrictRate(item.low)! : undefined,
        pctChange: parseStrictRate(item.pctChange) !== null ? parseStrictRate(item.pctChange)! : undefined,
        varBid: parseStrictRate(item.varBid) !== null ? parseStrictRate(item.varBid)! : undefined,
        lastUpdated: item.create_date || new Date().toLocaleTimeString('pt-BR'),
        source: 'AwesomeAPI (Dólar Comercial Oficial)',
        isEstimate: false,
      };
    }
  }

  // Fallback 2: Open ER API (Validate result === 'success')
  const erJson = await safeFetch('https://open.er-api.com/v6/latest/USD', {
    cache: 'no-store',
  });
  if (erJson && erJson.result === 'success' && erJson.rates && erJson.rates.BRL) {
    const rateVal = parseStrictRate(erJson.rates.BRL);
    if (rateVal !== null) {
      return {
        rate: rateVal,
        lastUpdated: erJson.time_last_update_utc || new Date().toLocaleTimeString('pt-BR'),
        source: 'ExchangeRate API Global',
        isEstimate: false,
      };
    }
  }

  // Fallback 3: Fixed estimation when all sources fail / return invalid data
  // lastUpdated set to "Não consultada", isEstimate: true, no fictitious high/low/buy/sell values.
  return {
    rate: 5.75,
    lastUpdated: 'Não consultada',
    source: 'Estimativa Fixa (Cotação não consultada)',
    isEstimate: true,
  };
};
