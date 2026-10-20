import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowRightLeft,
  Zap,
  CheckCircle2,
  Loader2,
  HelpCircle,
  ShieldAlert,
  RefreshCw,
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
    isFetchingExchangeRate,
    refreshLiveExchangeRate,
    applyLiveRateToTrip,
  } = usePlanner();

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isUnavailable = !liveExchangeRate && !isFetchingExchangeRate;
  const isEstimate = !!liveExchangeRate?.isEstimate;
  const isRealFetched = liveExchangeRate && !liveExchangeRate.isEstimate;

  const displayRate = isRealFetched
    ? liveExchangeRate.rate
    : isEstimate
    ? liveExchangeRate.rate
    : settings.dollarRate || 5.75;

  // Quick Converter / Simulator States
  const [simUsd, setSimUsd] = useState<number>(100);
  const [simBrl, setSimBrl] = useState<number>(Math.round(100 * displayRate * 100) / 100);
  const [includeCardTaxes, setIncludeCardTaxes] = useState<boolean>(false); // IOF 4.38% + ~2% spread

  const effectiveConverterRate = includeCardTaxes
    ? displayRate * 1.0638
    : displayRate;

  useEffect(() => {
    setSimBrl(Math.round(simUsd * effectiveConverterRate * 100) / 100);
  }, [effectiveConverterRate, simUsd]);

  const handleSimUsdChange = (val: number) => {
    setSimUsd(val);
    setSimBrl(Math.round(val * effectiveConverterRate * 100) / 100);
  };

  const handleApplyEstimateWithConfirmation = () => {
    if (window.confirm('As fontes de cotação falharam e este valor é uma estimativa não consultada. Deseja realmente aplicar esta taxa estimada à viagem?')) {
      applyLiveRateToTrip(true);
      setSuccessMsg('Taxa estimada aplicada à viagem com confirmação explícita.');
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleManualRefresh = async () => {
    const res = await refreshLiveExchangeRate(true);
    // Only show success message when a real valid quotation has been consulted and applied
    if (res.success && res.data && !res.isEstimate) {
      setSuccessMsg('Cotação real consultada e aplicada com sucesso.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setSuccessMsg(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
      {/* Header Bar */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-[#1A2B4C] to-[#2A437E] text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isFetchingExchangeRate ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  Consulta em Andamento...
                </span>
              </>
            ) : isEstimate ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-amber-300" />
                  Cotação Não Consultada (Estimativa Fixa)
                </span>
              </>
            ) : isRealFetched ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#D4AF37]" />
                  Cotação Oficial do Dia em Tempo Real
                </span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  Cotação Indisponível
                </span>
              </>
            )}
          </div>
          <h3 className="text-xl font-bold font-serif text-white flex items-center gap-2">
            Cotação do Dólar
          </h3>
          <p className="text-xs text-slate-300">
            {isFetchingExchangeRate
              ? 'Buscando cotação atualizada nas fontes oficiais...'
              : isEstimate
              ? 'As fontes de cotação oficiais falharam. Esta é uma estimativa fixa e não foi aplicada automaticamente.'
              : isRealFetched
              ? 'Cotação real consultada com sucesso e aplicada automaticamente ao orçamento da viagem.'
              : 'Nenhuma cotação ao vivo foi consultada nesta sessão. O sistema utiliza a taxa configurada na viagem.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isFetchingExchangeRate}
          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer self-start md:self-auto border border-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingExchangeRate ? 'animate-spin' : ''}`} />
          {isFetchingExchangeRate ? 'Consultando...' : 'Atualizar Cotação'}
        </button>
      </div>

      {/* Main Content Body */}
      <div className="p-5 sm:p-6 space-y-6">
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Warning banner when estimate */}
        {isEstimate && !isFetchingExchangeRate && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="font-bold text-amber-950 block">
                  Atenção: Cotação não consultada com sucesso (Valor Estimado)
                </strong>
                <p className="text-amber-900 leading-relaxed">
                  Nenhuma fonte externa respondeu com dados válidos. O valor de <strong>R$ {displayRate.toFixed(2)}</strong> é uma <strong>estimativa fixa</strong> e <strong>não foi aplicada</strong> automaticamente à viagem para preservar sua taxa configurada (R$ {settings.dollarRate.toFixed(2)}).
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleApplyEstimateWithConfirmation}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
              >
                Solicitar Confirmação e Aplicar Taxa Estimada
              </button>
            </div>
          </div>
        )}

        {/* Unavailable state banner */}
        {isUnavailable && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="font-bold">Cotação Real Ainda Não Consultada nesta Sessão</span>
            </div>
            <p className="text-slate-600">
              Clique em <strong>Atualizar Cotação</strong> para consultar fontes externas em tempo real. O orçamento utiliza atualmente a sua taxa configurada na viagem (R$ {settings.dollarRate.toFixed(2)}).
            </p>
          </div>
        )}

        {isFetchingExchangeRate && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
            <div>
              <strong className="block font-bold">Consulta em andamento...</strong>
              <span className="text-slate-500">Verificando fontes de câmbio oficiais (AwesomeAPI, Servidor, Open ER).</span>
            </div>
          </div>
        )}

        {/* Grid: 2 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Exchange Rate Metric Card */}
          <div className="space-y-4">
            <div className={`p-5 rounded-2xl border space-y-4 h-full flex flex-col justify-between ${
              isEstimate ? 'bg-amber-50/40 border-amber-200' : isUnavailable ? 'bg-slate-50 border-slate-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {isEstimate
                      ? 'Taxa Estimada (Não Consultada)'
                      : isRealFetched
                      ? 'Dólar Comercial do Dia'
                      : 'Taxa Configurada na Viagem'}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    isEstimate
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : isRealFetched
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}>
                    {liveExchangeRate?.source || 'Taxa Manual da Viagem'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-black font-mono ${
                    isEstimate ? 'text-amber-900' : isRealFetched ? 'text-[#1A2B4C]' : 'text-slate-700'
                  }`}>
                    R$ {displayRate.toFixed(2)}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    / 1 US$
                  </span>

                  {isRealFetched && liveExchangeRate?.pctChange !== undefined && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5 ${
                        liveExchangeRate.pctChange >= 0
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {liveExchangeRate.pctChange >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {liveExchangeRate.pctChange >= 0 ? '+' : ''}
                      {liveExchangeRate.pctChange.toFixed(2)}%
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
                      {isRealFetched && liveExchangeRate?.high ? `R$ ${liveExchangeRate.high.toFixed(2)}` : 'N/D (Não consultada)'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">
                      Mínima do Dia
                    </span>
                    <strong className="text-slate-700 font-mono">
                      {isRealFetched && liveExchangeRate?.low ? `R$ ${liveExchangeRate.low.toFixed(2)}` : 'N/D (Não consultada)'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Status Info Footer */}
              <div className="pt-3 border-t border-slate-200 space-y-1 text-xs">
                {isEstimate ? (
                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Taxa não consultada. Viagem preserva R$ {settings.dollarRate.toFixed(2)}</span>
                  </div>
                ) : isRealFetched ? (
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Cotação consultada e sincronizada no orçamento</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-600 font-semibold text-[11px]">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Utilizando taxa configurada na viagem (R$ {settings.dollarRate.toFixed(2)})</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-400">
                  {isEstimate
                    ? 'Nenhuma alteração automática foi aplicada ao seu planejamento.'
                    : isRealFetched
                    ? 'Todos os cálculos e gastos em dólar utilizam esta cotação real.'
                    : 'Clique em Atualizar Cotação para buscar valores de mercado em tempo real.'}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Interactive Quick Currency Converter / Simulator */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/90 space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#1A2B4C] uppercase tracking-wider flex items-center gap-1">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
                    {isEstimate ? 'Simulador (Taxa Estimada)' : isRealFetched ? 'Conversor Rápido' : 'Simulador (Taxa da Viagem)'}
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

                <div className="text-[10px] text-slate-600 font-medium bg-amber-100/70 px-2.5 py-1 rounded-md mb-2">
                  {isRealFetched
                    ? '💡 Conversão baseada na cotação real consultada hoje.'
                    : 'ℹ️ Simulador utilizando a taxa configurada na viagem (R$ ' + displayRate.toFixed(2) + ').'}
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
                          handleSimUsdChange(num);
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
