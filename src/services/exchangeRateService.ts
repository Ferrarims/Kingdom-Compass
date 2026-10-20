import { ExchangeRateData } from '../types';

export const fetchLiveExchangeRate = async (): Promise<ExchangeRateData> => {
  // Helper to validate rate value
  const isValidRate = (val: any): boolean => {
    const num = typeof val === 'number' ? val : parseFloat(val);
    return !isNaN(num) && isFinite(num) && num > 0;
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
  if (serverJson && serverJson.success && serverJson.data && isValidRate(serverJson.data.rate)) {
    return {
      ...serverJson.data,
      isEstimate: false,
    };
  }

  // Fallback 1: Direct AwesomeAPI (Dólar Comercial Oficial Brasil)
  const awesomeJson = await safeFetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
    cache: 'no-store',
  });
  if (awesomeJson && awesomeJson.USDBRL) {
    const item = awesomeJson.USDBRL;
    const bidVal = item.bid ? parseFloat(item.bid) : NaN;
    const askVal = item.ask ? parseFloat(item.ask) : NaN;
    const rateVal = isValidRate(bidVal) ? bidVal : (isValidRate(askVal) ? askVal : NaN);

    if (isValidRate(rateVal)) {
      return {
        rate: rateVal,
        bid: isValidRate(bidVal) ? bidVal : undefined,
        ask: isValidRate(askVal) ? askVal : undefined,
        high: isValidRate(item.high) ? parseFloat(item.high) : undefined,
        low: isValidRate(item.low) ? parseFloat(item.low) : undefined,
        pctChange: isValidRate(item.pctChange) ? parseFloat(item.pctChange) : undefined,
        varBid: isValidRate(item.varBid) ? parseFloat(item.varBid) : undefined,
        lastUpdated: item.create_date || new Date().toLocaleTimeString('pt-BR'),
        source: 'AwesomeAPI (Dólar Comercial Oficial)',
        isEstimate: false,
      };
    }
  }

  // Fallback 2: Open ER API
  const erJson = await safeFetch('https://open.er-api.com/v6/latest/USD', {
    cache: 'no-store',
  });
  if (erJson && erJson.rates && isValidRate(erJson.rates.BRL)) {
    const rateVal = parseFloat(erJson.rates.BRL);
    return {
      rate: rateVal,
      lastUpdated: new Date().toLocaleTimeString('pt-BR'),
      source: 'ExchangeRate API Global',
      isEstimate: false,
    };
  }

  // Fallback 3: Fixed estimation when all sources fail / return invalid data
  // Clearly identified as estimation, NOT consulted, no fictitious high/low/buy/sell values.
  return {
    rate: 5.75,
    lastUpdated: new Date().toLocaleTimeString('pt-BR'),
    source: 'Estimativa Fixa (Cotação não consultada com sucesso)',
    isEstimate: true,
  };
};
