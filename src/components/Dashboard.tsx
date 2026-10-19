import React, { useState } from 'react';
import {
  Compass,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Plane,
  Hotel,
  Ticket,
  Luggage,
  Users,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  Car,
  FileCheck2,
  X,
  Check,
  RefreshCw,
} from 'lucide-react';
import { usePlanner, formatDisplayDate } from '../context/PlannerContext';

export const Dashboard: React.FC = () => {
  const {
    settings,
    daysCountdown,
    financialSummary,
    overallProgress,
    setActiveTab,
    itineraryDays,
    prepDocuments,
    currencyView,
    setIsSettingsOpen,
    expenses,
    flights,
    accommodations,
    carRentals,
    parkTickets,
    updateExpense,
    addNotification,
  } = usePlanner();

  const [isPendingExplanationOpen, setIsPendingExplanationOpen] = useState(false);
  const [isAutoEqualizing, setIsAutoEqualizing] = useState(false);

  const formatCurrency = (valBRL: number, valUSD?: number) => {
    if (currencyView === 'USD') {
      const usd = valUSD !== undefined ? valUSD : valBRL / (settings.dollarRate || 5.75);
      return `$ ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `R$ ${valBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleEqualizePaidValues = () => {
    setIsAutoEqualizing(true);
    let updatedCount = 0;
    expenses.forEach((exp) => {
      if (exp.status === 'Pago' || exp.status === 'Parcial' || (exp.paidValueBRL || 0) < exp.estimatedValueBRL) {
        if (exp.estimatedValueBRL > 0) {
          updateExpense(exp.id, {
            paidValueBRL: exp.estimatedValueBRL,
            paidValueUSD: exp.estimatedValueUSD,
            status: 'Pago',
          });
          updatedCount++;
        }
      }
    });
    setTimeout(() => {
      setIsAutoEqualizing(false);
      setIsPendingExplanationOpen(false);
      addNotification(`Equalizou ${updatedCount} item(ns) da tabela financeira para 100% pago.`);
    }, 400);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-8">
      {/* Header Banner & Core KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Painel Principal & Indicadores de Progresso (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 p-6 sm:p-7 rounded-2xl shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] block mb-1">
                  Painel Principal da Viagem
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl text-[#1A2B4C] leading-tight font-bold">
                  {settings.tripName || 'Nossa Viagem a Orlando'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 italic mt-0.5">
                  {formatDisplayDate(settings.startDate, false)} ({settings.durationDays} dias de magia)
                </p>
              </div>
              <div className="text-right bg-[#F9F7F2] p-3 rounded-xl border border-slate-200 shrink-0 ml-2">
                <span className="text-3xl sm:text-4xl font-serif text-[#D4AF37] font-bold block leading-none">
                  {daysCountdown}
                </span>
                <span className="text-[9px] uppercase tracking-widest block text-slate-500 font-bold mt-1">
                  {daysCountdown === 1 ? 'Dia Restante' : 'Dias Restantes'}
                </span>
              </div>
            </div>

            {/* Indicator Progress Bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {/* Bar 1: Financeiro */}
              <div className="bg-[#F9F7F2]/80 border border-slate-200 p-3.5 rounded-xl space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Saúde Financeira</span>
                  </span>
                  <span className="text-[#1A2B4C] font-mono">{financialSummary.paidPercentage}% PAGO</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-emerald-600 rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(4, financialSummary.paidPercentage)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  {financialSummary.totalPendingBRL <= 0
                    ? 'Orçamento 100% quitado!'
                    : `Restam ${formatCurrency(financialSummary.totalPendingBRL)} pendentes.`}
                </p>
              </div>

              {/* Bar 2: Checklist & Documentos */}
              <div className="bg-[#F9F7F2]/80 border border-slate-200 p-3.5 rounded-xl space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Checklist de Preparativos</span>
                  </span>
                  <span className="text-[#1A2B4C] font-mono">{overallProgress.checklistProgressPercent}% PRONTO</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-[#1A2B4C] rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(4, overallProgress.checklistProgressPercent)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  {overallProgress.checklistProgressPercent >= 90
                    ? 'Documentos e vistos praticamente prontos!'
                    : 'Acompanhe os documentos e requisitos na aba Preparativos.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo Financeiro Box (4 cols) */}
        <div className="lg:col-span-4 bg-gradient-to-br from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] p-6 sm:p-7 rounded-2xl shadow-md text-white flex flex-col justify-between border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-[#D4AF37]/10 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs uppercase tracking-[0.2em] text-[#D4AF37] font-bold">
                Resumo Financeiro
              </h3>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                financialSummary.paidPercentage >= 99
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
              }`}>
                {financialSummary.paidPercentage}% Pago
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-semibold">
                  TOTAL INVESTIDO (PAGO)
                </span>
                <span className="text-2xl sm:text-3xl font-serif text-[#D4AF37] font-bold">
                  {formatCurrency(financialSummary.totalPaidBRL)}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-semibold">
                    VALOR RESTANTE (PENDENTE)
                  </span>
                  {financialSummary.totalPendingBRL > 0 && (
                    <button
                      onClick={() => setIsPendingExplanationOpen(true)}
                      className="text-[10px] text-amber-300 hover:text-white underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>Por que {formatCurrency(financialSummary.totalPendingBRL)}?</span>
                    </button>
                  )}
                </div>
                <span className="text-xl sm:text-2xl font-serif text-white font-bold block mt-0.5">
                  {formatCurrency(financialSummary.totalPendingBRL)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/10 flex justify-between items-center text-xs text-slate-300">
            <span className="text-slate-300">Rateio por Pessoa ({settings.travelersCount}):</span>
            <span className="font-bold text-white text-sm font-serif">
              {formatCurrency(financialSummary.costPerPersonBRL, financialSummary.costPerPersonUSD)}
            </span>
          </div>
        </div>
      </div>

      {/* Roteiro Diário & Rateio de Gastos Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Roteiro Diário (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h3 className="font-serif text-xl text-[#1A2B4C] font-bold">
              Roteiro Diário &amp; Programação
            </h3>
            <button
              onClick={() => setActiveTab('itinerary')}
              className="text-xs font-bold text-[#D4AF37] hover:text-[#1A2B4C] uppercase tracking-wider transition-colors cursor-pointer"
            >
              Ver Roteiro Completo →
            </button>
          </div>

          <div className="space-y-3">
            {itineraryDays.slice(0, 4).map((day, idx) => {
              const isGold = idx === 0 || day.completed;
              return (
                <div
                  key={day.dayNumber}
                  onClick={() => setActiveTab('itinerary')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                    isGold
                      ? 'bg-white border-[#D4AF37]/50 shadow-xs hover:border-[#D4AF37]'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-serif font-bold text-xs shrink-0 ${
                        isGold ? 'bg-[#1A2B4C] text-[#D4AF37]' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {day.dayNumber}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                        {formatDisplayDate(day.date, true)}
                      </span>
                      <h4 className="text-sm font-bold text-[#1A2B4C] group-hover:text-[#D4AF37] transition-colors leading-tight">
                        {day.title}
                      </h4>
                      {day.park && day.park !== 'Sem Parque' && (
                        <span className="text-[11px] text-[#D4AF37] font-semibold block mt-0.5">
                          🎡 {day.park}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {day.completed ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Concluído
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Módulos da Viagem (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h3 className="font-serif text-xl text-[#1A2B4C] font-bold">
              Módulos da Viagem
            </h3>
            <span className="text-xs text-slate-400 font-medium">Acesso rápido</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setActiveTab('flights')}
              className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-[#D4AF37] hover:shadow-2xs transition-all text-left group cursor-pointer"
            >
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg w-fit mb-2">
                <Plane className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-[#1A2B4C] group-hover:text-[#D4AF37]">Passagens</h4>
              <p className="text-[10px] text-slate-500">{flights.length} voo(s) cadastrado(s)</p>
            </button>

            <button
              onClick={() => setActiveTab('accommodations')}
              className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-[#D4AF37] hover:shadow-2xs transition-all text-left group cursor-pointer"
            >
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg w-fit mb-2">
                <Hotel className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-[#1A2B4C] group-hover:text-[#D4AF37]">Hospedagem</h4>
              <p className="text-[10px] text-slate-500">{accommodations.length} reserva(s)</p>
            </button>

            <button
              onClick={() => setActiveTab('parks')}
              className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-[#D4AF37] hover:shadow-2xs transition-all text-left group cursor-pointer"
            >
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg w-fit mb-2">
                <Ticket className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-[#1A2B4C] group-hover:text-[#D4AF37]">Parques</h4>
              <p className="text-[10px] text-slate-500">{parkTickets.length} pacote(s) de ingressos</p>
            </button>

            <button
              onClick={() => setActiveTab('financial')}
              className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-[#D4AF37] hover:shadow-2xs transition-all text-left group cursor-pointer"
            >
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg w-fit mb-2">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-[#1A2B4C] group-hover:text-[#D4AF37]">Financeiro</h4>
              <p className="text-[10px] text-slate-500">{financialSummary.paidPercentage}% quitado</p>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Explicação do Pendente Financeiro */}
      {isPendingExplanationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-amber-500" />
                <h3 className="font-serif text-lg font-bold text-[#1A2B4C]">
                  Detalhamento do Saldo Pendente
                </h3>
              </div>
              <button
                onClick={() => setIsPendingExplanationOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O valor de <strong className="text-[#1A2B4C]">{formatCurrency(financialSummary.totalPendingBRL)}</strong> ainda
              está marcado como <span className="text-amber-600 font-bold">Pendente</span> ou{' '}
              <span className="text-blue-600 font-bold">Parcial</span> na tabela financeira de despesas da viagem.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-2">
              <span className="font-bold text-[#1A2B4C] block">O que isso significa?</span>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                <li>Algumas despesas orçadas ainda não tiveram o valor pago preenchido igual ao valor estimado.</li>
                <li>Módulos com status em planejamento também entram como estimativa até serem quitados.</li>
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                onClick={handleEqualizePaidValues}
                disabled={isAutoEqualizing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {isAutoEqualizing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Equalizando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Marcar Tudo Como 100% Pago</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsPendingExplanationOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
