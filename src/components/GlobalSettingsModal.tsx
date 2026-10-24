import React, { useState } from 'react';
import {
  X,
  Calendar,
  Users,
  DollarSign,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Key,
  Mail,
  Plane,
} from 'lucide-react';
import { usePlanner, formatDisplayDate, calculateDateOffset, normalizeDateToYMD, getTripEndDate, calculateDurationFromDates } from '../context/PlannerContext';
import { Traveler, AiParsedData } from '../types';
import { SendTripEmailModal } from './SendTripEmailModal';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { parseInputToNumber, formatInputDisplay } from '../utils/currency';
import { generateUUID } from '../utils/uuid';
import { MoneyInput } from './MoneyInput';

export const GlobalSettingsModal: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen, settings, updateSettings, deleteTrip, trips, activeTripId } = usePlanner();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  useConfirmationKeyboard({
    isOpen: showDeleteConfirm,
    onConfirm: () => {
      setShowDeleteConfirm(false);
      setIsSettingsOpen(false);
      deleteTrip(settings.id);
    },
    onCancel: () => setShowDeleteConfirm(false),
  });

  const [startDate, setStartDate] = useState(settings.startDate);
  const [durationDays, setDurationDays] = useState(settings.durationDays);
  const [travelersCount, setTravelersCount] = useState(settings.travelersCount);
  const [dollarRate, setDollarRate] = useState(settings.dollarRate);
  const [tripName, setTripName] = useState(settings.tripName);
  const [destination, setDestination] = useState(settings.destination);
  const [isFlexibleDates, setIsFlexibleDates] = useState(settings.isFlexibleDates ?? true);
  const [flexibleOutboundStart, setFlexibleOutboundStart] = useState(settings.flexibleOutboundStart || settings.startDate || '2026-12-30');
  const [flexibleOutboundEnd, setFlexibleOutboundEnd] = useState(settings.flexibleOutboundEnd || calculateDateOffset(settings.startDate || '2026-12-30', 7));
  const [flexibleInboundStart, setFlexibleInboundStart] = useState(settings.flexibleInboundStart || calculateDateOffset(settings.startDate || '2026-12-30', settings.durationDays || 11));
  const [flexibleInboundEnd, setFlexibleInboundEnd] = useState(settings.flexibleInboundEnd || calculateDateOffset(settings.startDate || '2026-12-30', (settings.durationDays || 11) + 7));
  const [outboundFlexibility, setOutboundFlexibility] = useState(settings.outboundFlexibility || 'Datas Fixas');
  const [inboundFlexibility, setInboundFlexibility] = useState(settings.inboundFlexibility || 'Datas Fixas');
  const [flexibilityNotes, setFlexibilityNotes] = useState(settings.flexibilityNotes || '');
  const [travelersList, setTravelersList] = useState<Traveler[]>(settings.travelers);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [newTravelerEmail, setNewTravelerEmail] = useState('');

  // Input formatting temporary states
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState('');

  const AVATAR_COLORS = ['#E5A93C', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#F97316', '#06B6D4', '#84CC16'];

  const handleAddTraveler = () => {
    if (!newTravelerName.trim()) return;
    const newId = generateUUID();
    const color = AVATAR_COLORS[travelersList.length % AVATAR_COLORS.length];
    const newT: Traveler = {
      id: newId,
      name: newTravelerName.trim(),
      email: newTravelerEmail.trim() || `${newTravelerName.toLowerCase().replace(/\s+/g, '')}@exemplo.com`,
      avatarColor: color,
      role: 'traveler',
    };
    const updated = [...travelersList, newT];
    setTravelersList(updated);
    setTravelersCount(updated.length);
    setNewTravelerName('');
    setNewTravelerEmail('');
  };

  const handleRemoveTraveler = (id: string) => {
    if (travelersList.length <= 1) {
      alert('A viagem precisa ter pelo menos 1 viajante.');
      return;
    }
    const updated = travelersList.filter((t) => t.id !== id);
    setTravelersList(updated);
    setTravelersCount(updated.length);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);

    try {
      let currentTravelers = [...travelersList];
      if (newTravelerName.trim()) {
        const newId = generateUUID();
        const color = AVATAR_COLORS[travelersList.length % AVATAR_COLORS.length];
        const newT: Traveler = {
          id: newId,
          name: newTravelerName.trim(),
          email: newTravelerEmail.trim() || `${newTravelerName.toLowerCase().replace(/\s+/g, '')}@exemplo.com`,
          avatarColor: color,
          role: 'traveler',
        };
        currentTravelers.push(newT);
        setTravelersList(currentTravelers);
        setNewTravelerName('');
        setNewTravelerEmail('');
      }

      const effectiveStartDate = normalizeDateToYMD(startDate || flexibleOutboundStart || '2026-12-30');
      const calculatedReturnDate = calculateDateOffset(effectiveStartDate, Number(durationDays) - 1);
      const effectiveOutStart = normalizeDateToYMD(isFlexibleDates ? (flexibleOutboundStart || effectiveStartDate) : effectiveStartDate);
      const effectiveOutEnd = normalizeDateToYMD(isFlexibleDates ? (flexibleOutboundEnd || calculateDateOffset(effectiveOutStart, 7)) : calculateDateOffset(effectiveStartDate, 7));
      const effectiveInStart = normalizeDateToYMD(isFlexibleDates ? (flexibleInboundStart || calculateDateOffset(effectiveOutStart, durationDays)) : calculateDateOffset(effectiveStartDate, durationDays));
      const effectiveInEnd = normalizeDateToYMD(isFlexibleDates ? (flexibleInboundEnd || calculateDateOffset(effectiveOutEnd, durationDays)) : calculateDateOffset(effectiveStartDate, durationDays + 7));

      const effectiveOutFlex = isFlexibleDates ? 'Data Não Definida' : 'Datas Fixas';
      const effectiveInFlex = isFlexibleDates ? 'Data Não Definida' : 'Datas Fixas';

      const res = await updateSettings({
        startDate: effectiveStartDate,
        returnDate: calculatedReturnDate,
        durationDays: Number(durationDays),
        travelersCount: currentTravelers.length,
        dollarRate: Number(dollarRate),
        tripName: tripName.trim() || settings.tripName,
        destination: destination.trim() || settings.destination,
        isFlexibleDates,
        flexibleOutboundStart: effectiveOutStart,
        flexibleOutboundEnd: effectiveOutEnd,
        flexibleInboundStart: effectiveInStart,
        flexibleInboundEnd: effectiveInEnd,
        outboundFlexibility: effectiveOutFlex,
        inboundFlexibility: effectiveInFlex,
        flexibilityNotes: isFlexibleDates ? 'Viagem com data não definida' : flexibilityNotes,
        travelers: currentTravelers,
      });

      if (res && res.success === false) {
        setErrorMsg(res.error || 'Erro ao salvar parâmetros da viagem no Supabase.');
        setIsSaving(false);
        return;
      }

      setIsSettingsOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen: isSettingsOpen && !showDeleteConfirm && !showEmailModal,
    onCancel: () => setIsSettingsOpen(false),
    onSave: () => handleSave(),
  });

  const { handleBackdropClick: handleDeleteBackdrop } = useModalKeyEvents({
    isOpen: showDeleteConfirm,
    onCancel: () => setShowDeleteConfirm(false),
    onSave: () => {
      setShowDeleteConfirm(false);
      setIsSettingsOpen(false);
      deleteTrip(settings.id);
    },
  });

  if (!isSettingsOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
    >
      <div
        id="modal-global-settings"
        className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Preferências Gerais da Viagem • Câmbio, Viajantes & Datas
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Configurações Globais
              </h2>
            </div>
          </div>

          <button
            id="btn-close-settings-modal"
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {/* Trip Name & Destination Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="input-trip-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Viagem / Grupo
              </label>
              <input
                id="input-trip-name"
                type="text"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="Ex: Orlando Mágico 2026"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-[#1A2B4C] focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
              />
            </div>

            <div>
              <label htmlFor="input-destination" className="block text-xs font-semibold text-slate-700 mb-1">
                Destino Principal
              </label>
              <input
                id="input-destination"
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Ex: Walt Disney World & Universal Orlando"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-[#1A2B4C] focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
              />
            </div>
          </div>

          {/* DATES & DATA NÃO DEFINIDA BOX */}
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300/80 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="font-bold text-[#1A2B4C] block text-xs sm:text-sm flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  <span>Viagem com data não definida?</span>
                </span>
                <p className="text-[11px] text-amber-900 mt-0.5">
                  Ative caso ainda não tenha as datas exatas. Você só precisará informar a quantidade de dias da viagem.
                </p>
              </div>

              <button
                type="button"
                id="toggle-flexible-dates-global"
                onClick={() => setIsFlexibleDates(!isFlexibleDates)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  isFlexibleDates ? 'bg-[#D4AF37]' : 'bg-slate-300'
                }`}
                title={isFlexibleDates ? 'Definir datas exatas' : 'Alternar para data não definida'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isFlexibleDates ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {isFlexibleDates ? (
              <div className="space-y-4 pt-3 border-t border-amber-200 animate-in fade-in duration-200">
                {/* Duração da Viagem em dias */}
                <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C] flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#D4AF37]" />
                      Quantos dias vai ser a viagem? (Duração Total)
                    </label>
                    <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-md">
                      {durationDays} {durationDays === 1 ? 'Dia' : 'Dias'} de Viagem
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Coloque apenas a quantidade de dias da viagem. O planejamento será organizado dia a dia (Dia 1, Dia 2...) sem necessidade de datas fixas.
                  </p>
                  <div className="flex items-center gap-2 pt-1.5">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={durationDays}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        setDurationDays(val);
                      }}
                      className="w-full sm:w-44 p-2.5 rounded-lg border border-amber-300 text-sm font-bold text-[#1A2B4C] focus:ring-2 focus:ring-[#D4AF37] outline-hidden bg-white shadow-2xs"
                      required
                    />
                    <span className="text-xs text-slate-600 font-medium">dias de roteiro e programação</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Quando Datas Fixas estiver selecionado */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 animate-in fade-in duration-200">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data Exata de Saída (Início)
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setStartDate(newStart);
                      if (newStart) {
                        const currentEnd = getTripEndDate(startDate, durationDays);
                        const newDur = calculateDurationFromDates(newStart, currentEnd);
                        setDurationDays(newDur);
                      }
                    }}
                    className="w-full p-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#1A2B4C]"
                    required
                  />
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data Exata de Retorno (Fim)
                  </label>
                  <input
                    type="date"
                    value={getTripEndDate(startDate, durationDays)}
                    onChange={(e) => {
                      const newEnd = e.target.value;
                      if (newEnd && startDate) {
                        const newDur = calculateDurationFromDates(startDate, newEnd);
                        setDurationDays(newDur);
                      }
                    }}
                    className="w-full p-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#1A2B4C]"
                    required
                  />
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Duração da Viagem
                  </label>
                  <div className="p-2 rounded-lg bg-blue-50/80 border border-blue-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-900 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Calculada:</span>
                    </span>
                    <span className="font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-xs">
                      {calculateDurationFromDates(startDate, getTripEndDate(startDate, durationDays))} Dias
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium mt-1.5">
                    {formatDisplayDate(startDate, false)} até {formatDisplayDate(getTripEndDate(startDate, durationDays), false)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Viajantes e Cotação do Dólar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 2. Number of Travelers */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-[#D4AF37] transition-colors">
              <label htmlFor="input-travelers-count" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1A2B4C] mb-2">
                <Users className="w-4 h-4 text-[#D4AF37]" />
                Total de Integrantes
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="input-travelers-count"
                  type="number"
                  min="1"
                  max="30"
                  value={travelersCount}
                  onChange={(e) => {
                    const count = Math.max(1, parseInt(e.target.value) || 1);
                    setTravelersCount(count);
                  }}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-[#1A2B4C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] bg-white"
                />
                <span className="text-xs font-bold text-slate-500">pessoas</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Rateio automático de custos para cada integrante.
              </p>
            </div>

            {/* 3. Dollar Rate */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-[#D4AF37] transition-colors">
              <label htmlFor="input-dollar-rate" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1A2B4C] mb-2">
                <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                Cotação Dólar (R$)
              </label>
              <div>
                <MoneyInput
                  currency="BRL"
                  variant="light"
                  value={dollarRate}
                  onChange={(val) => setDollarRate(val || 5.75)}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Conversão USD ⇄ BRL em tempo real no app.
              </p>
            </div>
          </div>

          {/* Trip Code & Access Control Box */}
          <div className="bg-gradient-to-r from-[#1A2B4C]/5 via-amber-500/10 to-[#1A2B4C]/5 p-4 rounded-xl border border-amber-300/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#D4AF37]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                  Código de Acesso desta Viagem:
                </h4>
              </div>
              <span className="font-mono text-xs font-bold bg-white text-[#1A2B4C] px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs select-all">
                {settings.tripCode || activeTripId}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              🔒 <strong>Controle de Acesso:</strong> Os viajantes cadastrados abaixo (Nome + E-mail) usam este <strong>Código ({settings.tripCode || activeTripId})</strong> e seu respectivo <strong>E-mail</strong> para acessar somente a esta viagem com privacidade total.
            </p>

            {/* Email Dispatch Action Button */}
            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
              <button
                type="button"
                id="btn-send-trip-info-email"
                onClick={() => setShowEmailModal(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1A2B4C] hover:bg-[#2C4475] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4 text-[#D4AF37]" />
                <span>Enviar Informações & Código por E-mail</span>
              </button>
            </div>
          </div>

          {/* Travelers Roster Section */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                  Integrantes do Grupo ({travelersList.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Cadastre o Nome e o E-mail de cada pessoa para liberar o acesso exclusivo por Código.
                </p>
              </div>
            </div>

            {/* List of current travelers */}
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {travelersList.map((traveler, idx) => (
                <div
                  key={traveler.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-6.5 h-6.5 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: traveler.avatarColor }}
                    >
                      {(traveler?.name || 'V').charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-[#1A2B4C]">{traveler?.name || 'Viajante'}</span>
                      <span className="text-slate-500 ml-2 text-[11px] font-mono">
                        ‹{traveler.email || 'sem e-mail'}›
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {idx === 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                        Organizador
                      </span>
                    )}
                    {travelersList.length > 1 && (
                      <button
                        type="button"
                        id={`btn-remove-traveler-${traveler.id}`}
                        onClick={() => handleRemoveTraveler(traveler.id)}
                        className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                        title="Remover viajante"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Traveler row */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-slate-100">
              <input
                id="input-new-traveler-name"
                type="text"
                data-prevent-modal-enter="true"
                placeholder="Nome da pessoa *"
                value={newTravelerName}
                onChange={(e) => setNewTravelerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTraveler();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              />
              <input
                id="input-new-traveler-email"
                type="email"
                data-prevent-modal-enter="true"
                placeholder="E-mail para acesso *"
                value={newTravelerEmail}
                onChange={(e) => setNewTravelerEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTraveler();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              />
              <button
                type="button"
                id="btn-add-traveler"
                onClick={handleAddTraveler}
                disabled={!newTravelerName.trim() || !newTravelerEmail.trim()}
                className="px-4 py-2 bg-[#1A2B4C] text-white rounded-lg text-xs font-bold hover:bg-[#2C4475] disabled:opacity-50 transition-colors flex items-center justify-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cadastrar</span>
              </button>
            </div>
          </div>

          </div>

          {/* Footer Buttons */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3.5 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              <span>Excluir</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                id="btn-cancel-settings"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                id="btn-save-global-settings"
                className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] hover:bg-[#253D6B] text-white text-xs font-bold tracking-wide shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-[#D4AF37]" />
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          onClick={handleDeleteBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-700">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-red-900 font-serif">Excluir Viagem Ativa</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p className="text-sm font-semibold text-slate-900">
                Tem certeza que deseja excluir a viagem <strong className="text-[#1A2B4C]">"{settings.tripName}"</strong>?
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Destino:</span>
                  <strong className="text-slate-800">{settings.destination}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Integrantes:</span>
                  <strong className="text-slate-800">{settings.travelers?.length || 0} viajantes</strong>
                </div>
                <p className="text-[11px] text-red-600 pt-2 border-t border-slate-200 font-medium">
                  ⚠️ Esta ação é permanente e removerá todos os voos, roteiros, despesas, viajantes e dados desta viagem.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setIsSettingsOpen(false);
                  deleteTrip(settings.id);
                }}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm cursor-pointer text-xs flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Dispatch Modal */}
      <SendTripEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        tripName={tripName || settings.tripName}
        destination={destination || settings.destination}
        startDate={startDate || settings.startDate}
        durationDays={durationDays || settings.durationDays}
        tripCode={settings.tripCode || activeTripId}
        travelers={travelersList}
      />
    </div>
  );
};
