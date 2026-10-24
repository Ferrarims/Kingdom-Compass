import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Plus,
  Calendar,
  Users,
  Clock,
  Compass,
  ArrowRight,
  Edit3,
  Trash2,
  Copy,
  DollarSign,
  CheckCircle2,
  Sliders,
  Plane,
  Luggage,
  MapPin,
  Check,
  Info,
  ChevronRight,
  Sun,
  ShieldCheck,
  HeartHandshake,
  X,
  AlertCircle,
  Key,
  Mail,
  Lock,
  UserCheck,
  LogOut,
  User,
  RefreshCw,
  Database,
} from 'lucide-react';
import { usePlanner, formatDisplayDate, calculateDateOffset, normalizeDateToYMD, getTripEndDate, calculateDurationFromDates } from '../context/PlannerContext';
import { Trip, Traveler, AiParsedData } from '../types';
import { SendTripEmailModal } from './SendTripEmailModal';
import { BackupModal } from './BackupModal';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { generateUUID } from '../utils/uuid';

export const HomeTripsView: React.FC = () => {
  const {
    trips,
    visibleTrips,
    activeTripId,
    selectTrip,
    addTrip,
    updateTrip,
    deleteTrip,
    duplicateTrip,
    setActiveTab,
    importAiParsedData,
    authSession,
    loginWithCode,
    logoutCode,
    liveExchangeRate,
    supabaseStatus,
    reloadFromSupabase,
  } = usePlanner();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  useConfirmationKeyboard({
    isOpen: !!tripToDelete,
    onConfirm: () => {
      if (tripToDelete) {
        const idToDelete = tripToDelete.id;
        setTripToDelete(null);
        if (editingTrip) {
          setIsModalOpen(false);
        }
        deleteTrip(idToDelete);
      }
    },
    onCancel: () => setTripToDelete(null),
  });

  // Portal Landing state (when !authSession)
  const [portalTab, setPortalTab] = useState<'open' | 'create'>('open');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalSuccess, setPortalSuccess] = useState<string | null>(null);
  const [isCreatingPortalTrip, setIsCreatingPortalTrip] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const portalQuickCreateLockRef = useRef(false);
  const saveTripModalLockRef = useRef(false);

  // Quick Create inline fields
  const [newTripNameInput, setNewTripNameInput] = useState('Férias Mágicas em Orlando');
  const [newDestInput, setNewDestInput] = useState('Walt Disney World & Universal Orlando');
  const [newStartDateInput, setNewStartDateInput] = useState('2026-12-30');
  const [newEndDateInput, setNewEndDateInput] = useState('2027-01-10');
  const [newIsFlexible, setNewIsFlexible] = useState(false);
  const [newDurationDaysInput, setNewDurationDaysInput] = useState(11);
  const [newFlexOutboundStart, setNewFlexOutboundStart] = useState('2026-12-30');
  const [newFlexOutboundEnd, setNewFlexOutboundEnd] = useState('2027-01-06');
  const [newFlexInboundStart, setNewFlexInboundStart] = useState('2027-01-10');
  const [newFlexInboundEnd, setNewFlexInboundEnd] = useState('2027-01-17');
  const [newOrganizerName, setNewOrganizerName] = useState('');
  const [newOrganizerEmail, setNewOrganizerEmail] = useState('');

  // Form state for Modal
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('Walt Disney World & Universal Orlando');
  const [startDate, setStartDate] = useState('2026-12-30');
  const [durationDays, setDurationDays] = useState(11);
  const [isFlexibleDates, setIsFlexibleDates] = useState(false);
  const [flexibleOutboundStart, setFlexibleOutboundStart] = useState('2026-12-30');
  const [flexibleOutboundEnd, setFlexibleOutboundEnd] = useState('2027-01-06');
  const [flexibleInboundStart, setFlexibleInboundStart] = useState('2027-01-10');
  const [flexibleInboundEnd, setFlexibleInboundEnd] = useState('2027-01-17');
  const [outboundFlexibility, setOutboundFlexibility] = useState('Datas Fixas');
  const [inboundFlexibility, setInboundFlexibility] = useState('Datas Fixas');
  const [flexibilityNotes, setFlexibilityNotes] = useState('');
  const [totalBudgetGoalBRL, setTotalBudgetGoalBRL] = useState(85000);
  const [dollarRate, setDollarRate] = useState(5.75);

  // Travelers state for the creation modal
  const [travelers, setTravelers] = useState<Traveler[]>([]);

  const [newTravelerName, setNewTravelerName] = useState('');
  const [newTravelerEmail, setNewTravelerEmail] = useState('');

  const handlePortalLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setPortalError(null);
    setPortalSuccess(null);

    if (!loginEmail.trim()) {
      setPortalError('Por favor, informe seu e-mail cadastrado.');
      return;
    }
    if (!loginCode.trim()) {
      setPortalError('Por favor, informe o código de acesso da viagem.');
      return;
    }

    const res = loginWithCode(loginEmail, loginCode);
    if (res.success) {
      setPortalSuccess(res.message);
    } else {
      setPortalError(res.message);
    }
  };

  const handlePortalQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portalQuickCreateLockRef.current || isCreatingPortalTrip) return;
    portalQuickCreateLockRef.current = true;
    setPortalError(null);
    setPortalSuccess(null);

    if (!newTripNameInput.trim()) {
      setPortalError('Por favor, digite o nome da viagem.');
      portalQuickCreateLockRef.current = false;
      return;
    }
    if (!newOrganizerName.trim() || !newOrganizerEmail.trim()) {
      setPortalError('Por favor, informe o Nome e E-mail do organizador da viagem.');
      portalQuickCreateLockRef.current = false;
      return;
    }

    setIsCreatingPortalTrip(true);
    try {
      const organizer: Traveler = {
        id: generateUUID(),
        name: newOrganizerName.trim(),
        email: newOrganizerEmail.trim().toLowerCase(),
        avatarColor: '#E5A93C',
        role: 'admin',
      };

      const sDate = normalizeDateToYMD(newStartDateInput) || '2026-12-30';
      const eDate = normalizeDateToYMD(newEndDateInput) || calculateDateOffset(sDate, 11);

      let days: number;
      let finalOutStart: string;
      let finalOutEnd: string;
      let finalInStart: string;
      let finalInEnd: string;
      let outFlexText: string;
      let inFlexText: string;

      if (newIsFlexible) {
        days = Math.max(1, Number(newDurationDaysInput) || 10);
        finalOutStart = sDate;
        finalOutEnd = calculateDateOffset(finalOutStart, 7);
        finalInStart = calculateDateOffset(finalOutStart, days);
        finalInEnd = calculateDateOffset(finalOutStart, days + 7);
        outFlexText = 'Data Não Definida';
        inFlexText = 'Data Não Definida';
      } else {
        days = calculateDurationFromDates(sDate, eDate);
        finalOutStart = sDate;
        finalOutEnd = calculateDateOffset(sDate, 7);
        finalInStart = eDate;
        finalInEnd = calculateDateOffset(eDate, 7);
        outFlexText = 'Datas Fixas';
        inFlexText = 'Datas Fixas';
      }

      const res = await addTrip({
        tripName: newTripNameInput.trim(),
        destination: newDestInput.trim(),
        startDate: finalOutStart,
        durationDays: days,
        isFlexibleDates: newIsFlexible,
        flexibleOutboundStart: finalOutStart,
        flexibleOutboundEnd: finalOutEnd,
        flexibleInboundStart: finalInStart,
        flexibleInboundEnd: finalInEnd,
        outboundFlexibility: outFlexText,
        inboundFlexibility: inFlexText,
        flexibilityNotes: newIsFlexible ? 'Viagem criada com data não definida' : 'Viagem criada com datas fixas',
        totalBudgetGoalBRL: 75000,
        dollarRate: 5.75,
        travelers: [organizer],
      });

      if (res.success && res.trip) {
        loginWithCode(newOrganizerEmail, res.trip.tripCode || res.trip.id);
        setPortalSuccess(`✨ Viagem criada com sucesso! Código gerado: ${res.trip.tripCode || res.trip.id}`);
      } else {
        setPortalError(res.error || 'Erro ao persistir a viagem no Supabase.');
      }
    } catch (err: any) {
      setPortalError(err?.message || 'Erro inesperado ao cadastrar viagem.');
    } finally {
      portalQuickCreateLockRef.current = false;
      setIsCreatingPortalTrip(false);
    }
  };

  const handleQuickFillPortal = (email: string, code: string) => {
    setPortalTab('open');
    setLoginEmail(email);
    setLoginCode(code);
    setPortalError(null);
  };

  const handleOpenCreateModal = () => {
    const defaultStart = '2026-12-30';
    const defaultOutEnd = calculateDateOffset(defaultStart, 7);
    const defaultInStart = calculateDateOffset(defaultStart, 11);
    const defaultInEnd = calculateDateOffset(defaultOutEnd, 11);

    setEditingTrip(null);
    setTripName('Magia e Férias em Orlando');
    setDestination('Walt Disney World & Universal Orlando');
    setStartDate(defaultStart);
    setDurationDays(11);
    setIsFlexibleDates(false);
    setFlexibleOutboundStart(defaultStart);
    setFlexibleOutboundEnd(defaultOutEnd);
    setFlexibleInboundStart(defaultInStart);
    setFlexibleInboundEnd(defaultInEnd);
    setOutboundFlexibility(`Ida entre ${formatDisplayDate(defaultStart, false)} e ${formatDisplayDate(defaultOutEnd, false)}`);
    setInboundFlexibility(`Volta entre ${formatDisplayDate(defaultInStart, false)} e ${formatDisplayDate(defaultInEnd, false)}`);
    setFlexibilityNotes('Preferência por voos diretos e datas com menores tarifas aéreas.');
    setTotalBudgetGoalBRL(75000);
    setDollarRate(5.75);
    const organizerName = authSession?.travelerName || 'Organizador';
    const organizerEmail = authSession?.email || '';
    setTravelers([
      {
        id: generateUUID(),
        name: organizerName,
        email: organizerEmail,
        avatarColor: '#E5A93C',
        role: 'admin',
      },
    ]);
    setNewTravelerName('');
    setNewTravelerEmail('');
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (trip: Trip, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTrip(trip);
    setTripName(trip.tripName);
    setDestination(trip.destination);
    const currentStart = normalizeDateToYMD(trip.startDate) || '2026-12-30';
    setStartDate(currentStart);
    setDurationDays(trip.durationDays);
    setIsFlexibleDates(trip.isFlexibleDates ?? false);

    const outStart = normalizeDateToYMD(trip.flexibleOutboundStart || currentStart);
    const outEnd = normalizeDateToYMD(trip.flexibleOutboundEnd || calculateDateOffset(outStart, 7));
    const inStart = normalizeDateToYMD(trip.flexibleInboundStart || calculateDateOffset(outStart, trip.durationDays));
    const inEnd = normalizeDateToYMD(trip.flexibleInboundEnd || calculateDateOffset(outEnd, trip.durationDays));

    setFlexibleOutboundStart(outStart);
    setFlexibleOutboundEnd(outEnd);
    setFlexibleInboundStart(inStart);
    setFlexibleInboundEnd(inEnd);
    setOutboundFlexibility(trip.outboundFlexibility || `Ida entre ${formatDisplayDate(outStart, false)} e ${formatDisplayDate(outEnd, false)}`);
    setInboundFlexibility(trip.inboundFlexibility || `Volta entre ${formatDisplayDate(inStart, false)} e ${formatDisplayDate(inEnd, false)}`);
    setFlexibilityNotes(trip.flexibilityNotes || '');
    setTotalBudgetGoalBRL(trip.totalBudgetGoalBRL || 75000);
    setDollarRate(trip.dollarRate || 5.75);
    setTravelers(trip.travelers || []);
    setNewTravelerName('');
    setNewTravelerEmail('');
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleAddTraveler = () => {
    if (!newTravelerName.trim()) return;
    const colors = ['#E5A93C', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const sanitizedEmail = newTravelerEmail.trim() || `${newTravelerName.toLowerCase().replace(/\s+/g, '')}@exemplo.com`;
    const newT: Traveler = {
      id: generateUUID(),
      name: newTravelerName.trim(),
      email: sanitizedEmail,
      avatarColor: randomColor,
      role: 'traveler',
    };
    setTravelers((prev) => [...prev, newT]);
    setNewTravelerName('');
    setNewTravelerEmail('');
  };

  const handleRemoveTraveler = (id: string) => {
    if (travelers.length <= 1) {
      alert('A viagem precisa ter pelo menos 1 viajante.');
      return;
    }
    setTravelers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaveTrip = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    if (saveTripModalLockRef.current || isSavingTrip) return;
    saveTripModalLockRef.current = true;
    setIsSavingTrip(true);
    try {
      const finalTripName = tripName.trim() || editingTrip?.tripName || (destination ? `Viagem a ${destination}` : 'Viagem Orlando 2026/2027');

      let currentTravelers = [...travelers];
      if (newTravelerName.trim()) {
        const colors = ['#E5A93C', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const sanitizedEmail = newTravelerEmail.trim() || `${newTravelerName.toLowerCase().replace(/\s+/g, '')}@exemplo.com`;
        const newT: Traveler = {
          id: generateUUID(),
          name: newTravelerName.trim(),
          email: sanitizedEmail,
          avatarColor: randomColor,
          role: 'traveler',
        };
        currentTravelers.push(newT);
        setTravelers(currentTravelers);
        setNewTravelerName('');
        setNewTravelerEmail('');
      }

      const finalStartDate = normalizeDateToYMD(startDate || flexibleOutboundStart || '2026-12-30');
      const finalOutboundStart = normalizeDateToYMD(isFlexibleDates ? (flexibleOutboundStart || finalStartDate) : finalStartDate);
      const finalOutboundEnd = normalizeDateToYMD(isFlexibleDates ? (flexibleOutboundEnd || calculateDateOffset(finalOutboundStart, 7)) : calculateDateOffset(finalStartDate, 7));
      const finalInboundStart = normalizeDateToYMD(isFlexibleDates ? (flexibleInboundStart || calculateDateOffset(finalOutboundStart, durationDays)) : calculateDateOffset(finalStartDate, durationDays));
      const finalInboundEnd = normalizeDateToYMD(isFlexibleDates ? (flexibleInboundEnd || calculateDateOffset(finalOutboundEnd, durationDays)) : calculateDateOffset(finalStartDate, durationDays + 7));

      const effectiveOutFlex = isFlexibleDates
        ? 'Data Não Definida'
        : 'Datas Fixas';
      const effectiveInFlex = isFlexibleDates
        ? 'Data Não Definida'
        : 'Datas Fixas';

      if (editingTrip) {
        const res = await updateTrip(editingTrip.id, {
          tripName: finalTripName,
          destination: destination || editingTrip.destination,
          startDate: finalStartDate,
          durationDays,
          isFlexibleDates,
          flexibleOutboundStart: finalOutboundStart,
          flexibleOutboundEnd: finalOutboundEnd,
          flexibleInboundStart: finalInboundStart,
          flexibleInboundEnd: finalInboundEnd,
          outboundFlexibility: effectiveOutFlex,
          inboundFlexibility: effectiveInFlex,
          flexibilityNotes,
          totalBudgetGoalBRL,
          dollarRate,
          travelers: currentTravelers,
          travelersCount: currentTravelers.length,
        });
        if (res && !res.success) {
          setSaveError(res.error || 'Erro ao salvar viagem.');
          setIsSavingTrip(false);
          saveTripModalLockRef.current = false;
          return;
        }
      } else {
        const res = await addTrip({
          tripName: finalTripName,
          destination: destination || 'Orlando, Flórida',
          startDate: finalStartDate,
          durationDays,
          isFlexibleDates,
          flexibleOutboundStart: finalOutboundStart,
          flexibleOutboundEnd: finalOutboundEnd,
          flexibleInboundStart: finalInboundStart,
          flexibleInboundEnd: finalInboundEnd,
          outboundFlexibility: effectiveOutFlex,
          inboundFlexibility: effectiveInFlex,
          flexibilityNotes,
          totalBudgetGoalBRL,
          dollarRate,
          travelers: currentTravelers,
        });
        if (res && !res.success) {
          setSaveError(res.error || 'Erro ao criar viagem.');
          setIsSavingTrip(false);
          saveTripModalLockRef.current = false;
          return;
        }
      }

      setIsModalOpen(false);
      setIsSavingTrip(false);
      saveTripModalLockRef.current = false;
    } catch (err: any) {
      setSaveError(err?.message || 'Erro inesperado ao salvar viagem.');
      setIsSavingTrip(false);
      saveTripModalLockRef.current = false;
    }
  };

  const { handleBackdropClick: handleTripModalBackdrop } = useModalKeyEvents({
    isOpen: isModalOpen && !tripToDelete && !showEmailModal,
    onCancel: () => setIsModalOpen(false),
    onSave: () => {
      handleSaveTrip();
    },
  });

  const { handleBackdropClick: handleDeleteTripBackdrop } = useModalKeyEvents({
    isOpen: !!tripToDelete,
    onCancel: () => setTripToDelete(null),
    onSave: () => {
      if (!tripToDelete) return;
      const idToDelete = tripToDelete.id;
      setTripToDelete(null);
      if (editingTrip) {
        setIsModalOpen(false);
      }
      deleteTrip(idToDelete);
    },
  });

  // ---------------------------------------------------------------------------
  // RENDER 1: UNAUTHENTICATED (SHOW ONLY E-MAIL + CODE PORTAL & CREATE BUTTON, NO TRIPS)
  // ---------------------------------------------------------------------------
  if (!authSession) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Portal Banner Header */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] font-bold text-xs uppercase tracking-widest shadow-2xs">
              <Sparkles className="w-4 h-4" />
              <span>Portal de Acesso Exclusivo</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight">
              KingdomCompass Portal de Entrada
            </h1>
            <p className="text-slate-200 text-xs sm:text-sm">
              Informe seu <strong>E-mail</strong> e <strong>Código de Acesso</strong> para acessar ou cadastrar sua viagem.
            </p>
          </div>
        </div>

        {/* Main Portal Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Navigation Tabs Header */}
          <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPortalTab('open');
                setPortalError(null);
                setPortalSuccess(null);
              }}
              className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                portalTab === 'open'
                  ? 'bg-[#1A2B4C] text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Key className={`w-4 h-4 ${portalTab === 'open' ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
              <span>Entrar em Viagem Cadastrada</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPortalTab('create');
                setPortalError(null);
                setPortalSuccess(null);
              }}
              className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                portalTab === 'create'
                  ? 'bg-[#1A2B4C] text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>Cadastrar Nova Viagem</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBackupModalOpen(true)}
              className="py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              title="Gerar ou restaurar backup do banco de dados (19 tabelas)"
            >
              <Database className="w-4 h-4 text-[#D4AF37]" />
              <span>Backup / Restaurar</span>
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {portalError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-3 animate-in fade-in duration-150">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <span>{portalError}</span>
              </div>
            )}

            {portalSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-3 animate-in fade-in duration-150">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{portalSuccess}</span>
              </div>
            )}

            {/* TAB 1: ENTER EXISTING TRIP */}
            {portalTab === 'open' && (
              <div className="space-y-6">
                <form onSubmit={handlePortalLogin} className="space-y-4 max-w-lg mx-auto">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 block text-xs flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-[#1A2B4C]" />
                      <span>Seu E-mail Cadastrado:</span>
                    </label>
                    <div className="relative flex items-center">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5" />
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="ex: seu.email@exemplo.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#1A2B4C] focus:border-[#1A2B4C] text-slate-800 text-xs font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 block text-xs flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-[#1A2B4C]" />
                      <span>Código de Acesso da Viagem:</span>
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5" />
                      <input
                        type="text"
                        required
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                        placeholder="ex: CODIGO-DA-VIAGEM"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#1A2B4C] focus:border-[#1A2B4C] text-slate-800 text-xs font-mono font-bold uppercase tracking-wider"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer transform hover:-translate-y-0.5 mt-2"
                  >
                    <Key className="w-4 h-4 text-[#D4AF37]" />
                    <span>Entrar e Acessar Viagem</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: CREATE NEW TRIP */}
            {portalTab === 'create' && (
              <form onSubmit={handlePortalQuickCreate} className="space-y-4 max-w-xl mx-auto">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block text-xs">
                    Nome da Viagem:
                  </label>
                  <input
                    type="text"
                    required
                    value={newTripNameInput}
                    onChange={(e) => setNewTripNameInput(e.target.value)}
                    placeholder="ex: Férias Mágicas em Orlando"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Destino Principal:</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDestInput}
                    onChange={(e) => setNewDestInput(e.target.value)}
                    placeholder="ex: Walt Disney World & Universal Orlando"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                  />
                </div>

                {/* DATES & DATA NÃO DEFINIDA BOX */}
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/90 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-slate-800 block text-xs flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Viagem com data não definida?</span>
                      </span>
                      <p className="text-[11px] text-amber-900 mt-0.5">
                        {newIsFlexible
                          ? 'Data não definida: informe apenas quantos dias vai ser a viagem.'
                          : 'Datas fixas: informe a data de início e de fim.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      id="btn-toggle-portal-flexible"
                      onClick={() => setNewIsFlexible(!newIsFlexible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        newIsFlexible ? 'bg-[#D4AF37]' : 'bg-slate-300'
                      }`}
                      title={newIsFlexible ? 'Alternar para datas fixas' : 'Alternar para data não definida'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          newIsFlexible ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {!newIsFlexible ? (
                    /* DATAS FIXAS */
                    <div className="space-y-2.5 animate-in fade-in duration-150">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Data de Início:</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={newStartDateInput}
                            onChange={(e) => {
                              const newStart = e.target.value;
                              setNewStartDateInput(newStart);
                              if (newStart && newEndDateInput && newEndDateInput < newStart) {
                                setNewEndDateInput(newStart);
                              }
                            }}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-[#1A2B4C]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block text-xs flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Data de Fim (Retorno):</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={newEndDateInput}
                            min={newStartDateInput}
                            onChange={(e) => setNewEndDateInput(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-[#1A2B4C]"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* DATA NÃO DEFINIDA - SOMENTE QUANTOS DIAS VAI SER A VIAGEM */
                    <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                      <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C] flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Quantos dias vai ser a viagem?</span>
                          </label>
                          <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                            {newDurationDaysInput} {newDurationDaysInput === 1 ? 'Dia' : 'Dias'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Informe somente o número de dias da viagem. O planejamento será feito em Dia 1, Dia 2, etc.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            min={1}
                            max={60}
                            required
                            value={newDurationDaysInput}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 1;
                              setNewDurationDaysInput(val);
                            }}
                            className="w-full sm:w-40 p-2 rounded-lg border border-amber-300 text-sm font-bold text-[#1A2B4C] focus:ring-2 focus:ring-[#D4AF37] outline-hidden bg-white shadow-2xs"
                          />
                          <span className="text-xs text-slate-600 font-medium">dias de roteiro</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <h5 className="font-bold text-xs text-[#1A2B4C] font-serif flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#D4AF37]" />
                    <span>Dados do Organizador (Seus Dados):</span>
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 block text-xs">
                        Seu Nome:
                      </label>
                      <div className="relative flex items-center">
                        <User className="w-4 h-4 text-slate-400 absolute left-3" />
                        <input
                          type="text"
                          required
                          value={newOrganizerName}
                          onChange={(e) => setNewOrganizerName(e.target.value)}
                          placeholder="ex: Fernando"
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 block text-xs">
                        Seu E-mail:
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3" />
                        <input
                          type="email"
                          required
                          value={newOrganizerEmail}
                          onChange={(e) => setNewOrganizerEmail(e.target.value)}
                          placeholder="ex: seu.email@exemplo.com"
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-[#1A2B4C]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingPortalTrip}
                  className="w-full py-3.5 rounded-xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingPortalTrip ? (
                    <span>Salvando viagem no Supabase...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-[#D4AF37]" />
                      <span>Cadastrar Viagem e Gerar Código</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER 2: AUTHENTICATED (SHOW ACTIVE SESSION & AUTHENTICATED TRIP ONLY)
  // ---------------------------------------------------------------------------
  const activeTripObj = visibleTrips.find((t) => t.id === activeTripId) || visibleTrips[0];

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-4 lg:pb-0">
      {/* Top Banner / Welcome - Widescreen Layout matching Image 2 */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        {/* Background Decorative Pattern */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
              <span>Central de Planejamentos de Viagem</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white leading-tight">
              Minhas Viagens Mágicas
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Você está conectado como <strong className="text-white">{authSession.travelerName}</strong> ({authSession.email}). Visualizando sua viagem ativa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Session Indicator Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-medium text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Código: <strong className="font-mono text-white">{authSession.tripCode}</strong></span>
            </div>

            {/* Backup Button */}
            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] border border-[#D4AF37]/40 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Gerar ou restaurar backup do banco de dados (19 tabelas)"
            >
              <Database className="w-4 h-4" />
              <span>Backup &amp; Restauração</span>
            </button>

            <button
              onClick={logoutCode}
              className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair / Trocar Viagem</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supabase Error Banner with Retry */}
      {supabaseStatus.error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-150 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-rose-950 block">Falha na Sincronização / Leitura com o Supabase</span>
              <span className="text-rose-800 text-[11px] leading-relaxed">{supabaseStatus.error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => reloadFromSupabase()}
            disabled={supabaseStatus.syncing}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-60 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${supabaseStatus.syncing ? 'animate-spin' : ''}`} />
            <span>{supabaseStatus.syncing ? 'Tentando...' : 'Tentar Novamente'}</span>
          </button>
        </div>
      )}

      {/* List of Trip Cards */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base sm:text-lg font-bold font-serif text-[#1A2B4C] flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#D4AF37]" />
            <span>Sua Viagem Liberada por Código</span>
          </h2>
        </div>

        {!activeTripObj ? (
          <div className="bg-white rounded-2xl p-8 sm:p-12 text-center border border-slate-200 shadow-2xs space-y-3">
            <Compass className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-base text-slate-700">Nenhuma viagem associada a este código</h3>
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold cursor-pointer"
            >
              Criar Nova Viagem
            </button>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {visibleTrips.map((trip) => {
              const isActive = trip.id === activeTripId;
              const endDateStr = getTripEndDate(trip.startDate, trip.durationDays);

              return (
                <div
                  key={trip.id}
                  onClick={() => {
                    selectTrip(trip.id);
                    setActiveTab('journey');
                  }}
                  className={`w-full bg-white rounded-2xl border transition-all duration-200 shadow-xs relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:border-[#D4AF37]/50 ${
                    isActive
                      ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Top Color Banner - Widescreen Layout */}
                  <div
                    className={`bg-gradient-to-r ${
                      trip.coverTheme || 'from-[#1A2B4C] via-[#243B68] to-[#1A2B4C]'
                    } px-4 py-2.5 sm:px-5 sm:py-3 text-white relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3`}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-[#1A2B4C] font-bold text-[10px] uppercase tracking-wider shadow-2xs">
                        {trip.status || 'Planejando'}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold font-serif text-white">
                        {trip.tripName}
                      </h3>
                      <span className="hidden md:inline text-slate-400 text-xs">•</span>
                      <p className="text-xs text-slate-200 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>{trip.destination}</span>
                      </p>
                    </div>

                    {/* Card Actions (Edit, Delete) */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="flex items-center gap-1 bg-black/25 backdrop-blur-xs rounded-lg p-1">
                        <button
                          onClick={(e) => handleOpenEditModal(trip, e)}
                          className="p-1 text-slate-200 hover:text-white hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                          title="Editar Viagem"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTripToDelete(trip);
                          }}
                          className="p-1 text-slate-200 hover:text-red-300 hover:bg-red-500/30 rounded-md transition-colors cursor-pointer"
                          title="Excluir Viagem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Content Details - 2x2 Grid Layout with Larger Cards */}
                  <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    {/* Card 1: Período & Duração (Top Left) */}
                    <div className="bg-slate-50/90 hover:bg-slate-50 p-4 sm:p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between transition-all">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                        <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-[#D4AF37]" />
                          <span>Período da Viagem</span>
                        </span>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs">
                          ⏱ {trip.durationDays} {trip.isFlexibleDates ? 'Dias planejados' : 'Dias'}
                        </span>
                      </div>

                      {trip.isFlexibleDates ? (
                        <div className="space-y-1 py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base">📅</span>
                            <span className="font-bold text-[#1A2B4C] text-sm sm:text-base">
                              Data não definida
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 block pl-6">
                            Duração definida: <strong>{trip.durationDays} dias</strong>
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1 py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base">📅</span>
                            <span className="font-bold text-[#1A2B4C] text-sm sm:text-base">
                              {formatDisplayDate(trip.startDate, false)}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 block pl-6">
                            até <strong>{formatDisplayDate(endDateStr, false)}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card 2: Status das Datas (Top Right) */}
                    <div className="bg-amber-50/40 hover:bg-amber-50/60 p-4 sm:p-4.5 rounded-2xl border border-amber-200/80 shadow-2xs space-y-3 flex flex-col justify-between transition-all">
                      <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
                        <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-[#D4AF37]" />
                          <span>Status das Datas</span>
                        </span>
                        {trip.isFlexibleDates ? (
                          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold shadow-2xs flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Data Não Definida
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Datas Fixas
                          </span>
                        )}
                      </div>

                      {trip.isFlexibleDates ? (
                        <div className="space-y-1.5 text-xs text-amber-950 py-0.5">
                          <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200/70 shadow-2xs">
                            <span className="text-[10px] text-amber-800 block uppercase font-bold">⏱ Duração do Roteiro</span>
                            <span className="font-bold text-slate-900 text-xs block mt-0.5">
                              {trip.durationDays} {trip.durationDays === 1 ? 'Dia' : 'Dias'} a programar
                            </span>
                            <span className="text-[11px] text-slate-500 block mt-0.5">
                              As datas definitivas serão configuradas no momento oportuno.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic py-2">
                          Viagem com datas fixas de embarque e retorno confirmadas.
                        </p>
                      )}
                    </div>

                    {/* Card 3: Quem Vai & Cotação USD (Bottom Left) */}
                    <div className="bg-slate-50/90 hover:bg-slate-50 p-4 sm:p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between transition-all">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-[#1A2B4C]" />
                          <span>Quem Vai ({trip.travelers?.length || 0})</span>
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {trip.travelers?.length === 1 ? '1 Viajante' : `${trip.travelers?.length || 0} Viajantes`}
                        </span>
                      </div>

                      <div className="flex items-center justify-start gap-3 py-1">
                        <div className="flex -space-x-2 overflow-hidden items-center">
                          {trip.travelers?.slice(0, 5).map((t) => (
                            <div
                              key={t?.id || Math.random()}
                              className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs text-white font-bold shrink-0 shadow-xs"
                              style={{ backgroundColor: t?.avatarColor || '#D4AF37' }}
                              title={`${t?.name || 'Viajante'} (${t?.role === 'admin' ? 'Organizador' : 'Viajante'})`}
                            >
                              {(t?.name || 'V').charAt(0)}
                            </div>
                          ))}
                          {(trip.travelers?.length || 0) > 5 && (
                            <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-700 flex items-center justify-center text-xs text-white font-bold shrink-0 shadow-xs">
                              +{(trip.travelers?.length || 0) - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Código & Compartilhamento (Bottom Right) */}
                    <div className="bg-amber-50/60 hover:bg-amber-50/80 p-4 sm:p-4.5 rounded-2xl border border-amber-200/80 shadow-2xs space-y-3 flex flex-col justify-between transition-all">
                      <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
                        <div className="flex items-center gap-1.5">
                          <Key className="w-4 h-4 text-[#D4AF37] shrink-0" />
                          <span className="text-[11px] text-slate-600 uppercase font-bold">Código de Acesso</span>
                        </div>
                        <span className="font-bold text-[#1A2B4C] text-xs sm:text-sm font-mono bg-white px-3 py-1 rounded-xl border border-amber-300 shadow-2xs">
                          {trip.tripCode || trip.id}
                        </span>
                      </div>

                      <div className="flex w-full">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTrip(trip);
                            setTripName(trip.tripName);
                            setDestination(trip.destination);
                            setStartDate(trip.startDate);
                            setDurationDays(trip.durationDays);
                            setTravelers(trip.travelers || []);
                            setShowEmailModal(true);
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#1A2B4C] hover:bg-[#243B68] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs hover:shadow-sm border border-transparent"
                          title="Enviar por E-mail"
                        >
                          <Mail className="w-4 h-4 text-[#D4AF37]" />
                          <span>Enviar código por E-mail</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: CREATE / EDIT TRIP */}
      {isModalOpen && (
        <div
          onClick={handleTripModalBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
        >
          <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Compass className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    {editingTrip ? 'Edição de Viagem' : 'Nova Viagem'} • Orlando Magic Planner
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    {editingTrip ? 'Editar Parâmetros da Viagem' : 'Criar Nova Viagem Mágica'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Fechar"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTrip} className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs">
              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">

                {saveError && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 shadow-2xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{saveError}</span>
                  </div>
                )}

              {/* SECTION 1: TRIP IDENTIFICATION */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">1. Identificação da Viagem</h4>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Nome da Viagem *</label>
                      <input
                        type="text"
                        value={tripName}
                        onChange={(e) => setTripName(e.target.value)}
                        placeholder="Ex: Magia em Família - Orlando 2026"
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Destino Principal *</label>
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="Ex: Walt Disney World & Universal Orlando"
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-bold text-[#1A2B4C] shrink-0 shadow-2xs">
                        <Key className="w-4 h-4 text-[#D4AF37]" />
                      </div>
                      <div>
                        <span className="font-bold text-[#1A2B4C] text-xs flex items-center gap-2">
                          Código:
                          <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                            {editingTrip?.tripCode || editingTrip?.id || 'NOVA-VIAGEM'}
                          </span>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Enviar Código</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 2: DATES & FLEXIBILITY */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">2. Datas e Planejamento</h4>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-bold text-slate-700">Data não definida?</label>
                    <button
                      type="button"
                      onClick={() => setIsFlexibleDates(!isFlexibleDates)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        isFlexibleDates ? 'bg-[#D4AF37]' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isFlexibleDates ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {isFlexibleDates ? (
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Duração Total (dias)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={durationDays}
                          onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 1)}
                          className="w-full sm:w-44 p-2.5 rounded-lg border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[#D4AF37] outline-hidden"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Saída</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            setStartDate(newStart);
                            if (newStart) {
                              const currentEnd = getTripEndDate(startDate, durationDays);
                              setDurationDays(calculateDurationFromDates(newStart, currentEnd));
                            }
                          }}
                          className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Retorno (Duração: {durationDays} dias)</label>
                        <input
                          type="date"
                          value={getTripEndDate(startDate, durationDays)}
                          onChange={(e) => {
                            const newEnd = e.target.value;
                            if (newEnd && startDate) setDurationDays(calculateDurationFromDates(startDate, newEnd));
                          }}
                          className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: TRAVELERS */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">3. Integrantes do Grupo ({travelers.length})</h4>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Nome</label>
                      <input
                        type="text"
                        value={newTravelerName}
                        onChange={(e) => setNewTravelerName(e.target.value)}
                        placeholder="Nome"
                        className="w-full p-2.5 rounded-lg border border-slate-200 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTraveler())}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">E-mail</label>
                      <input
                        type="email"
                        value={newTravelerEmail}
                        onChange={(e) => setNewTravelerEmail(e.target.value)}
                        placeholder="E-mail"
                        className="w-full p-2.5 rounded-lg border border-slate-200 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTraveler())}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTraveler}
                    disabled={!newTravelerName.trim()}
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold cursor-pointer hover:bg-slate-900 transition-colors"
                  >
                    Adicionar Integrante
                  </button>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {travelers.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white" style={{ backgroundColor: t.avatarColor || '#D4AF37' }}>
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 block">{t.name}</span>
                            <span className="text-[10px] text-slate-500">{t.email}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTraveler(t.id)}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>


              </div>

              {/* Modal Actions */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                {editingTrip ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTripToDelete(editingTrip);
                    }}
                    className="px-3.5 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>Excluir</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTrip}
                    className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingTrip ? (
                      <span>Salvando...</span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                        <span>Salvar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TRIP CONFIRMATION MODAL */}
      {tripToDelete && (
        <div
          onClick={handleDeleteTripBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-700">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-red-900 font-serif">Excluir Viagem</h3>
              </div>
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p className="text-sm font-semibold text-slate-900">
                Tem certeza que deseja excluir a viagem <strong className="text-[#1A2B4C]">"{tripToDelete.tripName}"</strong>?
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Destino:</span>
                  <strong className="text-slate-800">{tripToDelete.destination}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Integrantes:</span>
                  <strong className="text-slate-800">{tripToDelete.travelers?.length || 0} viajantes</strong>
                </div>
                <p className="text-[11px] text-red-600 pt-2 border-t border-slate-200 font-medium">
                  ⚠️ Esta ação é permanente. Todos os voos, roteiros, despesas, viajantes e dados desta viagem serão excluídos.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const idToDelete = tripToDelete.id;
                  setTripToDelete(null);
                  if (editingTrip) {
                    setIsModalOpen(false);
                  }
                  deleteTrip(idToDelete);
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

      {/* Send Email Modal */}
      <SendTripEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        tripName={tripName}
        destination={destination}
        startDate={startDate}
        durationDays={durationDays}
        tripCode={editingTrip?.tripCode || editingTrip?.id || activeTripId || ''}
        travelers={travelers}
      />

      {/* Backup Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </div>
  );
};
