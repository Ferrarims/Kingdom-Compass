import React, { useState } from 'react';
import {
  Key,
  Mail,
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ShieldCheck,
  UserCheck,
  LogOut,
  Copy,
  Check,
  Plus,
  Compass,
  Calendar,
  MapPin,
  Clock,
  User,
  ArrowRight
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { Traveler } from '../types';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { generateUUID } from '../utils/uuid';

interface TripAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TripAccessModal: React.FC<TripAccessModalProps> = ({ isOpen, onClose }) => {
  const {
    trips,
    activeTripId,
    loginWithCode,
    logoutCode,
    authSession,
    settings,
    addTrip,
    selectTrip
  } = usePlanner();

  const [activeTab, setActiveTab] = useState<'open' | 'create'>('open');

  // Open Trip state
  const [email, setEmail] = useState<string>('');
  const [tripCode, setTripCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Create Trip state
  const [newTripName, setNewTripName] = useState('Férias Mágicas em Orlando');
  const [newDestination, setNewDestination] = useState('Walt Disney World & Universal Orlando');
  const [newStartDate, setNewStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newDurationDays, setNewDurationDays] = useState(12);
  const [isFlexibleDates, setIsFlexibleDates] = useState(false);
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');

  const handleOpenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg('Por favor, digite seu e-mail de cadastro.');
      return;
    }

    if (!tripCode.trim()) {
      setErrorMsg('Por favor, informe o código de acesso da viagem.');
      return;
    }

    const res = loginWithCode(email, tripCode);
    if (res.success) {
      setSuccessMsg(res.message);
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newTripName.trim()) {
      setErrorMsg('Por favor, digite o nome da viagem.');
      return;
    }

    if (!organizerName.trim() || !organizerEmail.trim()) {
      setErrorMsg('Por favor, informe seu Nome e E-mail de organizador da viagem.');
      return;
    }

    const organizerTraveler: Traveler = {
      id: generateUUID(),
      name: organizerName.trim(),
      email: organizerEmail.trim().toLowerCase(),
      role: 'admin',
      avatarColor: '#E5A93C'
    };

    const createdTrip = addTrip({
      tripName: newTripName.trim(),
      destination: newDestination.trim(),
      startDate: newStartDate,
      durationDays: Number(newDurationDays) || 10,
      isFlexibleDates,
      outboundFlexibility: isFlexibleDates ? 'Data Não Definida' : 'Datas Fixas',
      inboundFlexibility: isFlexibleDates ? 'Data Não Definida' : 'Datas Fixas',
      flexibilityNotes: isFlexibleDates ? 'Viagem com data não definida' : 'Viagem criada via Portal de Entrada',
      totalBudgetGoalBRL: 75000,
      dollarRate: 5.75,
      travelers: [organizerTraveler]
    });

    if (createdTrip) {
      // Authenticate as the new trip organizer automatically
      const res = loginWithCode(organizerEmail, createdTrip.tripCode || createdTrip.id);
      if (res.success) {
        setSuccessMsg(`✨ Viagem criada com sucesso! Seu código de acesso é: ${createdTrip.tripCode}`);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        selectTrip(createdTrip.id);
        onClose();
      }
    }
  };

  const handleQuickFill = (testEmail: string, testCode: string) => {
    setActiveTab('open');
    setEmail(testEmail);
    setTripCode(testCode);
    setErrorMsg(null);
  };

  const handleCopyCurrentCode = () => {
    const codeToCopy = settings.tripCode || activeTripId;
    navigator.clipboard.writeText(codeToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen,
    onCancel: onClose,
    onSave: () => {
      const fakeEvt = { preventDefault: () => {} } as React.FormEvent;
      if (activeTab === 'open') {
        handleOpenSubmit(fakeEvt);
      } else {
        handleCreateSubmit(fakeEvt);
      }
    },
  });

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl overflow-hidden flex flex-col h-[90vh] max-h-[92vh] my-auto animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Portal de Acesso • Orlando Magic Planner
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Acesso & Abertura de Viagens
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('open');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'open'
                ? 'bg-white text-[#1A2B4C] shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Key className={`w-4 h-4 ${activeTab === 'open' ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
            <span>Abrir Viagem Salva</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'bg-[#1A2B4C] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Plus className="w-4 h-4 text-[#D4AF37]" />
            <span>Criar Nova Viagem</span>
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto min-h-0 custom-scrollbar flex-1 text-xs">
          {/* Active Session Status if logged in */}
          {authSession && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-xs text-emerald-900 font-serif">
                    Sessão Ativa: {authSession.travelerName} ({authSession.email})
                  </h4>
                  <p className="text-[11px] text-emerald-700 font-mono">
                    Código: <strong>{authSession.tripCode}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logoutCode}
                className="px-2.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: OPEN EXISTING TRIP WITH EMAIL & CODE */}
          {activeTab === 'open' && (
            <div className="space-y-5">
              {!authSession && (
                <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span className="font-bold text-[#1A2B4C] text-xs font-serif">
                        Viagem Atual: {settings.tripName || 'Viagem Ativa'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCurrentCode}
                      className="px-2 py-0.5 rounded-lg bg-white border border-amber-300 text-[#1A2B4C] hover:bg-amber-100 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#D4AF37]" />
                          <span>Copiar Código</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-amber-200 font-mono font-bold text-xs text-[#1A2B4C]">
                    <span>Código: {settings.tripCode || activeTripId}</span>
                    <span className="text-[10px] text-slate-500 font-sans font-normal">
                      Insira abaixo o e-mail cadastrado
                    </span>
                  </div>
                </div>
              )}

              <form onSubmit={handleOpenSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-[#1A2B4C]" />
                    <span>Seu E-mail Cadastrado:</span>
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ex: seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#1A2B4C] focus:border-[#1A2B4C] text-slate-800 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-[#1A2B4C]" />
                    <span>Código de Acesso da Viagem:</span>
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3" />
                    <input
                      type="text"
                      required
                      value={tripCode}
                      onChange={(e) => setTripCode(e.target.value.toUpperCase())}
                      placeholder="ex: CODIGO-DA-VIAGEM"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#1A2B4C] focus:border-[#1A2B4C] text-slate-800 text-xs font-mono font-bold uppercase tracking-wider"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#1A2B4C] hover:bg-[#2C4475] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Key className="w-4 h-4 text-[#D4AF37]" />
                  <span>Salvar</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: CREATE NEW TRIP */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-amber-100/60 border border-amber-200 space-y-1">
                <h4 className="font-bold text-xs text-[#1A2B4C] font-serif flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>Cadastrar Nova Viagem com Código Exclusivo</span>
                </h4>
                <p className="text-[11px] text-slate-600">
                  Ao criar, o sistema gerará um Código de Acesso único para você convidar os integrantes da sua viagem.
                </p>
              </div>

              {/* Trip Name */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block text-xs">
                  Nome da Viagem:
                </label>
                <input
                  type="text"
                  required
                  value={newTripName}
                  onChange={(e) => setNewTripName(e.target.value)}
                  placeholder="ex: Férias Mágicas em Orlando"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                />
              </div>

              {/* Destination */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Destino Principal:</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  placeholder="ex: Walt Disney World & Universal Orlando"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                />
              </div>

              {/* Dates & Data Não Definida */}
              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/90 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-800 block text-xs flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Viagem com data não definida?</span>
                    </span>
                    <p className="text-[11px] text-amber-900 mt-0.5">
                      {isFlexibleDates
                        ? 'Informe apenas a quantidade de dias da viagem.'
                        : 'Defina a data exata de início da viagem.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFlexibleDates(!isFlexibleDates)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      isFlexibleDates ? 'bg-[#D4AF37]' : 'bg-slate-300'
                    }`}
                    title={isFlexibleDates ? 'Definir data de início' : 'Alternar para data não definida'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isFlexibleDates ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {isFlexibleDates ? (
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Quantos dias vai ser a viagem?</span>
                      </label>
                      <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                        {newDurationDays} {newDurationDays === 1 ? 'Dia' : 'Dias'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Informe apenas a duração da viagem. O roteiro será organizado dia a dia.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        required
                        value={newDurationDays}
                        onChange={(e) => setNewDurationDays(Number(e.target.value))}
                        className="w-full sm:w-40 p-2 rounded-lg border border-amber-300 text-sm font-bold text-[#1A2B4C] focus:ring-2 focus:ring-[#D4AF37] outline-hidden bg-white shadow-2xs"
                      />
                      <span className="text-xs text-slate-600 font-medium">dias de roteiro</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Data de Início:</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-[#1A2B4C]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Duração (dias):</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        required
                        value={newDurationDays}
                        onChange={(e) => setNewDurationDays(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-[#1A2B4C]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Organizer Name & Email */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <h5 className="font-bold text-xs text-[#1A2B4C] font-serif flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#D4AF37]" />
                  <span>Dados do Organizador (Você):</span>
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block text-xs">
                      Seu Nome:
                    </label>
                    <div className="relative flex items-center">
                      <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
                      <input
                        type="text"
                        required
                        value={organizerName}
                        onChange={(e) => setOrganizerName(e.target.value)}
                        placeholder="ex: Fernando"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block text-xs">
                      Seu E-mail:
                    </label>
                    <div className="relative flex items-center">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
                      <input
                        type="email"
                        required
                        value={organizerEmail}
                        onChange={(e) => setOrganizerEmail(e.target.value)}
                        placeholder="ex: seu.email@exemplo.com"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#1A2B4C] hover:bg-[#2C4475] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>Salvar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
