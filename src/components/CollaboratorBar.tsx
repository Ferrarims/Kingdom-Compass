import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  ChevronDown,
  RefreshCw,
  Zap,
  Check,
  Sparkles,
  Database,
  Cloud,
} from 'lucide-react';
import { usePlanner, formatDisplayDate, getTripEndDate } from '../context/PlannerContext';

interface CollaboratorBarProps {
  onToggleMobileMenu: () => void;
}

export const CollaboratorBar: React.FC<CollaboratorBarProps> = ({ onToggleMobileMenu }) => {
  const {
    settings,
    currencyView,
    setCurrencyView,
    activeTab,
    setActiveTab,
    liveExchangeRate,
    isFetchingExchangeRate,
    refreshLiveExchangeRate,
    applyLiveRateToTrip,
    supabaseStatus,
    reloadFromSupabase,
  } = usePlanner();

  const [rateDropdownOpen, setRateDropdownOpen] = useState(false);
  const rateRef = useRef<HTMLDivElement>(null);

  const displayRate = liveExchangeRate?.rate || settings.dollarRate;

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rateRef.current && !rateRef.current.contains(event.target as Node)) {
        setRateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      id="collaborator-top-bar"
      className="collaborator-bar sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-2.5 sm:h-16 flex items-center justify-between shadow-2xs min-h-[56px]"
    >
      {/* Left: Mobile Toggle & Settings Metrics */}
      <div className="flex items-center space-x-4 sm:space-x-8 min-w-0">
        <button
          id="btn-mobile-menu"
          onClick={onToggleMobileMenu}
          aria-label="Abrir menu"
          className="lg:hidden p-2 rounded-lg text-[#1A2B4C] hover:bg-slate-100 transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Home / Login / Cadastro Header Title */}
        {activeTab === 'home' && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1A2B4C] flex items-center justify-center text-[#D4AF37] font-bold text-xs shadow-2xs">
              KC
            </div>
            <span className="font-serif font-bold text-[#1A2B4C] text-sm tracking-tight">
              KingdomCompass <span className="font-sans text-xs font-normal text-slate-500 hidden sm:inline">| Planejador Mágico de Viagens</span>
            </span>
          </div>
        )}

        {/* Global Key Variables Bar - Visible whenever inside an active trip (activeTab !== 'home') */}
        {activeTab !== 'home' && (
          <div className="flex items-center space-x-3 sm:space-x-5 md:space-x-6 min-w-0">
            {/* Data Início e Fim */}
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold flex items-center gap-1 whitespace-nowrap">
                <span>🗓️</span> Data Início e Fim
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#1A2B4C] whitespace-nowrap truncate">
                {settings.isFlexibleDates && settings.flexibleOutboundStart
                  ? `${formatDisplayDate(settings.flexibleOutboundStart, false)} a ${formatDisplayDate(settings.flexibleInboundEnd || settings.flexibleInboundStart || getTripEndDate(settings.startDate, settings.durationDays), false)}`
                  : `${formatDisplayDate(settings.startDate, false)} a ${formatDisplayDate(getTripEndDate(settings.startDate, settings.durationDays), false)}`}
              </span>
            </div>

            {/* Cotação do Dólar do Dia (USD) - Hidden on mobile */}
            <div className="relative hidden sm:block" ref={rateRef}>
              <button
                type="button"
                id="btn-top-exchange-rate"
                onClick={() => setRateDropdownOpen(!rateDropdownOpen)}
                className="flex flex-col border-l pl-3 sm:pl-5 border-slate-200 text-left hover:opacity-85 transition-all cursor-pointer group"
                title="Clique para ver detalhes do câmbio comercial do dia"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">
                    Cotação do Dia
                  </span>
                  {liveExchangeRate && (
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 leading-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                      Ao Vivo
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 sm:gap-1.5">
                  <span className="text-xs sm:text-sm font-bold text-[#1A2B4C] whitespace-nowrap group-hover:text-[#D4AF37] transition-colors">
                    R$ {displayRate.toFixed(2).replace('.', ',')}
                  </span>
                  {liveExchangeRate?.pctChange !== undefined && (
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold inline-flex items-center ${
                        liveExchangeRate.pctChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {liveExchangeRate.pctChange >= 0 ? '+' : ''}
                      {liveExchangeRate.pctChange.toFixed(2)}%
                    </span>
                  )}
                  <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors" />
                </div>
              </button>

              {/* Rate Popover */}
              {rateDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-[#1A2B4C] uppercase tracking-wide">
                        Cotação Comercial do Dia
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      {liveExchangeRate?.source || 'AwesomeAPI Oficial'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs text-slate-500 font-medium">Dólar Comercial Hoje:</span>
                      <span className="text-lg font-black text-[#1A2B4C] font-mono">
                        R$ {displayRate.toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    {liveExchangeRate && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase">Máxima Hoje</span>
                          <span className="font-semibold text-slate-700">
                            R$ {liveExchangeRate.high ? liveExchangeRate.high.toFixed(2).replace('.', ',') : displayRate.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase">Mínima Hoje</span>
                          <span className="font-semibold text-slate-700">
                            R$ {liveExchangeRate.low ? liveExchangeRate.low.toFixed(2).replace('.', ',') : displayRate.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-semibold">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Cotação sincronizada em tempo real</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => refreshLiveExchangeRate(true)}
                        disabled={isFetchingExchangeRate}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3 h-3 text-slate-600 ${isFetchingExchangeRate ? 'animate-spin' : ''}`} />
                        <span>{isFetchingExchangeRate ? 'Atualizando...' : 'Recarregar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('financial');
                          setRateDropdownOpen(false);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-amber-200"
                      >
                        <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                        <span>Ver Finanças</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Viajantes */}
            <div className="hidden lg:flex flex-col border-l pl-3 sm:pl-5 border-slate-200">
              <span className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Viajantes</span>
              <span className="text-xs sm:text-sm font-bold text-[#1A2B4C] whitespace-nowrap">
                {String(settings.travelersCount).padStart(2, '0')} Pessoas
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Actions & Currency Switcher - Visible whenever inside an active trip view (activeTab !== 'home') */}
      {activeTab !== 'home' && (
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {/* Currency Switcher (Real / Dólar) - Hidden on mobile */}
          <div
            id="topbar-currency-selector"
            className="hidden sm:flex items-center bg-slate-100/90 p-0.5 sm:p-1 rounded-xl border border-slate-200 shadow-2xs"
            title="Alternar exibição de moeda: Real (R$) ou Dólar (US$)"
          >
            <button
              id="currency-toggle-brl"
              type="button"
              onClick={() => setCurrencyView('BRL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                currencyView === 'BRL'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#1A2B4C] hover:bg-slate-200/60'
              }`}
              title="Exibir todos os valores em Reais (R$)"
              aria-label="Selecionar moeda Real"
            >
              <span>R$</span>
              <span className="hidden sm:inline font-semibold text-[11px]">Real</span>
            </button>
            <button
              id="currency-toggle-usd"
              type="button"
              onClick={() => setCurrencyView('USD')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                currencyView === 'USD'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#1A2B4C] hover:bg-slate-200/60'
              }`}
              title="Exibir todos os valores em Dólares (US$)"
              aria-label="Selecionar moeda Dólar"
            >
              <span>US$</span>
              <span className="hidden sm:inline font-semibold text-[11px]">Dólar</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
