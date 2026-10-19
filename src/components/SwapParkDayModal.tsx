import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeftRight,
  Calendar,
  Sparkles,
  Zap,
  Utensils,
  Moon,
  Clock,
  ShieldCheck,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { ItineraryDay } from '../types';
import { isDayWithPark } from '../utils/parkScheduleUtils';
import { formatDisplayDate } from '../context/PlannerContext';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';

interface SwapParkDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDay: ItineraryDay | null;
  allDays: ItineraryDay[];
  onConfirmSwap: (sourceDayNumber: number, targetDayNumber: number) => void;
}

export const SwapParkDayModal: React.FC<SwapParkDayModalProps> = ({
  isOpen,
  onClose,
  sourceDay,
  allDays,
  onConfirmSwap,
}) => {
  const [selectedTargetDayNumber, setSelectedTargetDayNumber] = useState<number | null>(null);

  // Set default target day when opened (first day without park, or next day)
  useEffect(() => {
    if (isOpen && sourceDay) {
      const freeDay = allDays.find(
        (d) => d.dayNumber !== sourceDay.dayNumber && !isDayWithPark(d)
      );
      if (freeDay) {
        setSelectedTargetDayNumber(freeDay.dayNumber);
      } else {
        const otherDay = allDays.find((d) => d.dayNumber !== sourceDay.dayNumber);
        setSelectedTargetDayNumber(otherDay ? otherDay.dayNumber : null);
      }
    } else {
      setSelectedTargetDayNumber(null);
    }
  }, [isOpen, sourceDay, allDays]);

  const targetDay = allDays.find((d) => d.dayNumber === selectedTargetDayNumber);
  const targetHasPark = targetDay ? isDayWithPark(targetDay) : false;

  const handleConfirm = () => {
    if (sourceDay && selectedTargetDayNumber && selectedTargetDayNumber !== sourceDay.dayNumber) {
      onConfirmSwap(sourceDay.dayNumber, selectedTargetDayNumber);
      onClose();
    }
  };

  useConfirmationKeyboard({
    isOpen,
    onConfirm: handleConfirm,
    onCancel: onClose,
    enabled: Boolean(selectedTargetDayNumber && selectedTargetDayNumber !== sourceDay?.dayNumber),
  });

  if (!isOpen || !sourceDay) return null;

  const sourceFastPasses = sourceDay.parkBooking?.fastPasses?.length || 0;
  const sourceDining = sourceDay.parkBooking?.diningReservations?.length || 0;
  const sourceShows = sourceDay.parkBooking?.showsAndParades?.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-swap-park-title"
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white p-5 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 id="modal-swap-park-title" className="text-lg sm:text-xl font-bold font-serif text-white tracking-tight">
                Trocar Parque de Dia
              </h2>
              <p className="text-xs text-slate-200 mt-0.5">
                Mova este parque para um dia livre ou permute com outro parque agendado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Source Park Summary Box */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Parque Selecionado (Origem)
              </span>
              <span className="text-xs font-mono font-bold text-slate-600">
                {formatDisplayDate(sourceDay.date)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1A2B4C] text-[#D4AF37] font-mono font-black text-sm flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] uppercase tracking-tighter opacity-80">DIA</span>
                <span className="leading-none">{sourceDay.dayNumber}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 font-serif truncate">
                  {sourceDay.park}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                  {sourceFastPasses > 0 && (
                    <span className="flex items-center gap-1 text-amber-700 font-medium">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      {sourceFastPasses} FastPass
                    </span>
                  )}
                  {sourceDining > 0 && (
                    <span className="flex items-center gap-1 text-blue-700 font-medium">
                      <Utensils className="w-3.5 h-3.5 text-blue-500" />
                      {sourceDining} Dining
                    </span>
                  )}
                  {sourceShows > 0 && (
                    <span className="flex items-center gap-1 text-purple-700 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      {sourceShows} Shows
                    </span>
                  )}
                  {sourceFastPasses === 0 && sourceDining === 0 && sourceShows === 0 && (
                    <span>Roteiro padrão e atrações cadastradas</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Target Day Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Escolha o dia de destino para a troca:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-2xl bg-white custom-scrollbar">
              {allDays
                .filter((d) => d.dayNumber !== sourceDay.dayNumber)
                .map((day) => {
                  const hasPark = isDayWithPark(day);
                  const isSelected = selectedTargetDayNumber === day.dayNumber;

                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedTargetDayNumber(day.dayNumber)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-[#1A2B4C] bg-[#1A2B4C]/5 ring-2 ring-[#1A2B4C]/20 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-[#1A2B4C] text-[#D4AF37]'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          D{day.dayNumber}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {hasPark ? day.park : 'Dia Livre (Sem Parque)'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {formatDisplayDate(day.date)}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            hasPark
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {hasPark ? 'Permuta' : 'Livre'}
                        </span>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[#1A2B4C] text-white flex items-center justify-center">
                            <Check className="w-3 h-3 text-[#D4AF37]" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Dynamic Live Preview Box */}
          {targetDay && (
            <div
              className={`p-4 rounded-2xl border transition-all ${
                targetHasPark
                  ? 'bg-blue-50/70 border-blue-200 text-blue-950'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    targetHasPark
                      ? 'bg-blue-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {targetHasPark ? (
                    <ArrowLeftRight className="w-4 h-4" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-sm">
                    {targetHasPark
                      ? 'Permuta Mútua entre Parques'
                      : 'Transferência Direta para Dia Livre'}
                  </div>
                  {targetHasPark ? (
                    <p className="leading-relaxed">
                      <strong>{sourceDay.park}</strong> migra para o{' '}
                      <strong>Dia {targetDay.dayNumber}</strong> ({formatDisplayDate(targetDay.date)}), enquanto{' '}
                      <strong>{targetDay.park}</strong> assume o{' '}
                      <strong>Dia {sourceDay.dayNumber}</strong> ({formatDisplayDate(sourceDay.date)}). Todos os roteiros, FastPasses, reservas de restaurantes e atrações de ambos os parques são preservados intactos.
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      O cadastro completo de <strong>{sourceDay.park}</strong> e todo o seu roteiro (manhã, tarde, noite, reservas e atrações) serão movidos para o{' '}
                      <strong>Dia {targetDay.dayNumber}</strong> ({formatDisplayDate(targetDay.date)}). O{' '}
                      <strong>Dia {sourceDay.dayNumber}</strong> ficará livre ("Sem Parque").
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Protective Notice */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-100/80 border border-slate-200 text-slate-600 text-[11px] leading-snug">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Integridade Garantida:</strong> Voos e horários de check-in / check-out de acomodações continuam fixos em suas datas reais do calendário da viagem.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedTargetDayNumber || selectedTargetDayNumber === sourceDay.dayNumber}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              selectedTargetDayNumber && selectedTargetDayNumber !== sourceDay.dayNumber
                ? 'bg-[#1A2B4C] hover:bg-[#2A437E] text-white cursor-pointer active:scale-95'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
            <span>
              {targetHasPark ? 'Confirmar Permuta Mútua' : 'Confirmar Transferência'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
