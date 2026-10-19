import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowRightLeft,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { ExchangeRateData } from '../types';
import { fetchLiveExchangeRate } from '../services/exchangeRateService';

export type { ExchangeRateData };
export { fetchLiveExchangeRate };

export const LiveExchangeRateWidget: React.FC = () => {
  const {
    settings,
    updateSettings,
    liveExchangeRate,
    refreshLiveExchangeRate,
  } = usePlanner();

  const [exchangeData, setExchangeData] = useState<ExchangeRateData | null>(liveExchangeRate);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync with context's liveExchangeRate when available
  useEffect(() => {
    if (liveExchangeRate) {
      setExchangeData(liveExchangeRate);
    }
  }, [liveExchangeRate]);

  // Quick Converter States
  const effectiveLiveRate = exchangeData?.rate || liveExchangeRate?.rate || settings.dollarRate || 5.75;
  const [simUsd, setSimUsd] = useState<number>(100);
  const [simBrl, setSimBrl] = useState<number>(Math.round(100 * effectiveLiveRate * 100) / 100);
  const [includeCardTaxes, setIncludeCardTaxes] = useState<boolean>(false); // IOF 4.38% + ~2% spread

  const effectiveConverterRate = includeCardTaxes
    ? effectiveLiveRate * 1.0638
    : effectiveLiveRate;

  useEffect(() => {
    setSimBrl(Math.round(simUsd * effectiveConverterRate * 100) / 100);
  }, [effectiveConverterRate]);

  const handleSimUsdChange = (val: number) => {
    setSimUsd(val);
    setSimBrl(Math.round(val * effectiveConverterRate * 100) / 100);
  };

  const handleSimBrlChange = (val: number) => {
    setSimBrl(val);
    setSimUsd(Math.round((val / effectiveConverterRate) * 100) / 100);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
      {/* Header Bar */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-[#1A2B4C] to-[#2A437E] text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#D4AF37]" />
              Cotação Oficial do Dia em Tempo Real
            </span>
          </div>
          <h3 className="text-xl font-bold font-serif text-white flex items-center gap-2">
            Cotação do Dólar
          </h3>
          <p className="text-xs text-slate-300">
            Todo o orçamento da viagem é atualizado automaticamente com a cotação oficial do dia.
          </p>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-5 sm:p-6 space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Grid: 2 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Live Exchange Rate Metric */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Dólar Comercial do Dia
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {exchangeData?.source || 'AwesomeAPI / Cotação Oficial'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#1A2B4C] font-mono">
                    R$ {effectiveLiveRate.toFixed(2)}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    / 1 US$
                  </span>

                  {exchangeData?.pctChange !== undefined && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5 ${
                        exchangeData.pctChange >= 0
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {exchangeData.pctChange >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {exchangeData.pctChange >= 0 ? '+' : ''}
                      {exchangeData.pctChange.toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* Day Details */}
                <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">
                      Máxima do Dia
                    </span>
                    <strong className="text-slate-700 font-mono">
                      {exchangeData?.high ? `R$ ${exchangeData.high.toFixed(2)}` : `R$ ${effectiveLiveRate.toFixed(2)}`}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">
                      Mínima do Dia
                    </span>
                    <strong className="text-slate-700 font-mono">
                      {exchangeData?.low ? `R$ ${exchangeData.low.toFixed(2)}` : `R$ ${effectiveLiveRate.toFixed(2)}`}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Status Info Footer */}
              <div className="pt-3 border-t border-slate-200 space-y-1 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Câmbio sincronizado automaticamente no orçamento</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Todos os cálculos e gastos em dólar são convertidos utilizando o câmbio oficial do dia.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Interactive Quick Currency Converter */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/90 space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#1A2B4C] uppercase tracking-wider flex items-center gap-1">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Conversor Rápido
                  </span>

                  <button
                    type="button"
                    onClick={() => setIncludeCardTaxes(!includeCardTaxes)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      includeCardTaxes
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                    title="Inclui IOF de 4,38% + spread bancário de ~2%"
                  >
                    {includeCardTaxes ? '💳 Com IOF' : '💵 Comercial'}
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Input USD */}
                  <div className="space-y-1 bg-white p-2.5 rounded-xl border border-amber-200">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">
                      Dólar (USD)
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-2.5 font-bold text-slate-400">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={simUsd ? simUsd.toFixed(2).replace('.', ',') : ''}
                        onChange={(e) => {
                          const num = parseFloat(e.target.value.replace(',', '.')) || 0;
                          setSimUsd(num);
                          setSimBrl(Math.round(num * effectiveConverterRate * 100) / 100);
                        }}
                        className="w-full pl-6 pr-2 py-1 rounded-lg font-mono font-bold text-sm text-[#1A2B4C] focus:outline-none bg-white"
                        placeholder="100,00"
                      />
                    </div>
                  </div>

                  {/* Input BRL */}
                  <div className="space-y-1 bg-white p-2.5 rounded-xl border border-amber-200">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">
                      Reais (BRL)
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-2.5 font-bold text-slate-400">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={simBrl ? simBrl.toFixed(2).replace('.', ',') : ''}
                        onChange={(e) => {
                          const num = parseFloat(e.target.value.replace(',', '.')) || 0;
                          setSimBrl(num);
                          setSimUsd(Math.round((num / effectiveConverterRate) * 100) / 100);
                        }}
                        className="w-full pl-8 pr-2 py-1 rounded-lg font-mono font-bold text-sm text-emerald-800 focus:outline-none bg-white"
                        placeholder="575,00"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Preset Buttons */}
              <div className="pt-2 border-t border-amber-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Atalhos de Compras:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  {[50, 100, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSimUsdChange(preset)}
                      className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-[#1A2B4C] font-semibold text-[10px] cursor-pointer"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
