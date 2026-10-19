import { ExchangeRateData } from '../types';

export const fetchLiveExchangeRate = async (): Promise<ExchangeRateData> => {
  // Safe default exchange rate
  const fallbackData: ExchangeRateData = {
    rate: 5.75,
    bid: 5.74,
    ask: 5.76,
    high: 5.78,
    low: 5.72,
    pctChange: 0.20,
    lastUpdated: new Date().toLocaleTimeString('pt-BR'),
    source: 'Cotação Comercial Estimada',
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
    return serverJson.data;
  }

  // Fallback 1: Direct AwesomeAPI (Dólar Comercial Oficial Brasil)
  const awesomeJson = await safeFetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
    cache: 'no-store',
  });
  if (awesomeJson && awesomeJson.USDBRL) {
    const item = awesomeJson.USDBRL;
    const rate = parseFloat(item.bid || item.ask || '5.75');
    return {
      rate,
      bid: item.bid ? parseFloat(item.bid) : undefined,
      ask: item.ask ? parseFloat(item.ask) : undefined,
      high: item.high ? parseFloat(item.high) : undefined,
      low: item.low ? parseFloat(item.low) : undefined,
      pctChange: item.pctChange ? parseFloat(item.pctChange) : undefined,
      varBid: item.varBid ? parseFloat(item.varBid) : undefined,
      lastUpdated: item.create_date || new Date().toLocaleTimeString('pt-BR'),
      source: 'AwesomeAPI (Dólar Comercial Oficial)',
    };
  }

  // Fallback 2: Open ER API
  const erJson = await safeFetch('https://open.er-api.com/v6/latest/USD', {
    cache: 'no-store',
  });
  if (erJson && erJson.rates && erJson.rates.BRL) {
    const rate = parseFloat(erJson.rates.BRL);
    return {
      rate,
      lastUpdated: new Date().toLocaleTimeString('pt-BR'),
      source: 'ExchangeRate API Global',
    };
  }

  // Fallback 3: Safe default exchange rate
  return fallbackData;
};
