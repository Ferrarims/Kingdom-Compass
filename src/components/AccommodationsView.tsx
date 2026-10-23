import React, { useState, useEffect, useRef } from 'react';
import { usePlanner, calculateDateOffset, formatDisplayDate, getTripEndDate } from '../context/PlannerContext';
import { AccommodationBooking } from '../types';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { TravelerSelector } from './TravelerSelector';
import { PaymentSection, PaymentStatusType } from './PaymentSection';
import { LogisticsCardHeader } from './LogisticsCardHeader';
import {
  Building2,
  Home,
  Hotel,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  CheckCircle2,
  Plus,
  Trash2,
  Edit3,
  FileText,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Info,
  X,
  Copy,
  Check,
  Sparkles,
  Users,
  CreditCard,
  Wifi,
  Car,
  Utensils,
  Key,
  HelpCircle,
  Cloud,
  RefreshCw,
  Eye,
  Plane,
  Navigation,
} from 'lucide-react';

export const AccommodationsView: React.FC = () => {
  const {
    accommodations,
    addAccommodation,
    updateAccommodation,
    deleteAccommodation,
    syncAccommodationsToSupabase,
    reloadAccommodationsFromSupabase,
    applySmartAccommodationRules,
    getDay1AccommodationTimeline,
    supabaseStatus,
    settings,
    openOverviewModal,
  } = usePlanner();

  // Determine min and max allowed dates for the active trip



  // Determine min and max allowed dates for the active trip
  const isFlexible = !!settings.isFlexibleDates;
  const tripMinDate = isFlexible
    ? (settings.flexibleOutboundStart || settings.startDate || '2026-12-30')
    : (settings.startDate || '2026-12-30');

  const tripMaxDate = isFlexible
    ? (settings.flexibleInboundEnd || (settings.startDate ? getTripEndDate(settings.startDate, settings.durationDays) : '2027-01-10'))
    : (settings.startDate ? getTripEndDate(settings.startDate, settings.durationDays) : '2027-01-10');

  const [activeSubTab, setActiveSubTab] = useState<'all' | 'resorts' | 'hotels' | 'airbnb' | 'tips'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<AccommodationBooking | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [accToDelete, setAccToDelete] = useState<AccommodationBooking | null>(null);

  useConfirmationKeyboard({
    isOpen: !!accToDelete,
    onConfirm: async () => {
      if (accToDelete) {
        const idToDelete = accToDelete.id;
        const res = await deleteAccommodation(idToDelete);
        if (res && res.success === false) {
          setValidationError(res.error || 'Erro ao excluir hospedagem.');
        } else {
          setAccToDelete(null);
          if (editingAcc && editingAcc.id === idToDelete) {
            setIsModalOpen(false);
          }
        }
      }
    },
    onCancel: () => setAccToDelete(null),
  });

  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Omit<AccommodationBooking, 'id'>>({
    type: 'resort',
    name: '',
    confirmationCode: '',
    address: '',
    checkInDate: tripMinDate,
    checkInTime: '15:00',
    checkOutDate: tripMaxDate,
    checkOutTime: '11:00',
    roomType: '',
    costUSD: 0,
    costBRL: 0,
    status: 'Não informado',
    payerId: settings.currentUserId || 'all',
    travelerIds: ['all'],
    guestName: '',
    totalGuests: 1,
    amenities: [],
    contactPhone: '',
    notes: '',
  });

  const selectedGuestsCount = formData.travelerIds?.includes('all')
    ? (settings.travelers?.length || 1)
    : (formData.travelerIds?.length || 1);
  const guestCount = Math.max(1, selectedGuestsCount);

  const availableAmenities = [
    'Estacionamento Gratuito nos Parques Disney',
    'Transporte Gratuito de Disney Skyliner',
    'Entrada Antecipada de 30 Minutos nos Parques',
    'Piscina Aquecida',
    'Cozinha Completa',
    'Churrasqueira Privativa',
    'Lavadora & Secadora',
    'Fechadura Eletrônica (Self Check-in)',
    'Wi-Fi de Alta Velocidade',
    'Academia / Fitness Center',
    'Translado Gratuito para Aeroporto/Parques',
    'Sem Resort Fee',
  ];

  const handleOpenAddModal = () => {
    setEditingAcc(null);
    setValidationError(null);
    setFormData({
      type: 'resort',
      name: '',
      confirmationCode: '',
      address: '',
      checkInDate: tripMinDate,
      checkInTime: '15:00',
      checkOutDate: tripMaxDate,
      checkOutTime: '11:00',
      roomType: '',
      costUSD: 0,
      costBRL: 0,
      status: 'Não informado',
      payerId: settings.currentUserId || 'all',
      travelerIds: ['all'],
      guestName: '',
      totalGuests: settings.travelers?.length || 1,
      amenities: [],
      contactPhone: '',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc: AccommodationBooking) => {
    setEditingAcc(acc);
    setValidationError(null);

    // Validate if the accommodation dates fall within current active trip's allowed window
    // If not (e.g. from an old template/trip), adjust to the valid trip dates so the calendar opens on the correct month with allowed days active
    const validCheckIn = (acc.checkInDate && acc.checkInDate >= tripMinDate && acc.checkInDate <= tripMaxDate)
      ? acc.checkInDate
      : tripMinDate;

    const validCheckOut = (acc.checkOutDate && acc.checkOutDate >= validCheckIn && acc.checkOutDate <= tripMaxDate)
      ? acc.checkOutDate
      : (tripMaxDate >= validCheckIn ? tripMaxDate : validCheckIn);

    // Identificar status de pagamento sem presumir pago para confirmações operacionais
    let initialPaymentStatus: 'Pago' | 'Pendente' | 'Não informado' = 'Não informado';
    if (acc.status === 'Pago') {
      initialPaymentStatus = 'Pago';
    } else if (acc.status === 'Pendente' || acc.status === 'Falta Pagar') {
      initialPaymentStatus = 'Pendente';
    } else {
      initialPaymentStatus = 'Não informado';
    }

    setFormData({
      type: acc.type,
      name: acc.name,
      confirmationCode: acc.confirmationCode,
      address: acc.address,
      checkInDate: validCheckIn,
      checkInTime: acc.checkInTime || '15:00',
      checkOutDate: validCheckOut,
      checkOutTime: acc.checkOutTime || '11:00',
      roomType: acc.roomType || '',
      costUSD: acc.costUSD || 0,
      costBRL: acc.costBRL || (acc.costUSD ? acc.costUSD * (settings.dollarRate || 5.75) : 0),
      status: initialPaymentStatus,
      payerId: acc.payerId || 'all',
      travelerIds: acc.travelerIds || ['all'],
      guestName: acc.guestName || '',
      totalGuests: acc.totalGuests || (acc.travelerIds?.includes('all') ? (settings.travelers?.length || 1) : (acc.travelerIds?.length || 1)),
      amenities: acc.amenities || [],
      contactPhone: acc.contactPhone || '',
      notes: acc.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleToggleAmenity = (amenity: string) => {
    const current = formData.amenities || [];
    if (current.includes(amenity)) {
      setFormData({ ...formData, amenities: current.filter((a) => a !== amenity) });
    } else {
      setFormData({ ...formData, amenities: [...current, amenity] });
    }
  };

  const [isSavingAcc, setIsSavingAcc] = useState(false);
  const accSubmitLockRef = useRef(false);

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accSubmitLockRef.current || isSavingAcc) return;
    accSubmitLockRef.current = true;
    setIsSavingAcc(true);
    try {
      const accName = formData.name.trim() || 'Nova Hospedagem';
      const dataToSave = { ...formData, name: accName };

      // Validate check-in and check-out dates based on fixed vs flexible trip settings
      const isFlexible = !!settings.isFlexibleDates;
      let minDate: string;
      let maxDate: string;

      if (isFlexible) {
        minDate = settings.flexibleOutboundStart || settings.startDate || '2026-12-30';
        maxDate = settings.flexibleInboundEnd || (settings.startDate ? calculateDateOffset(settings.startDate, settings.durationDays) : '2027-01-11');
      } else {
        minDate = settings.startDate || '2026-12-30';
        maxDate = settings.startDate ? calculateDateOffset(settings.startDate, settings.durationDays) : '2027-01-11';
      }

      if (dataToSave.checkInDate < minDate || dataToSave.checkInDate > maxDate) {
        dataToSave.checkInDate = minDate;
      }
      if (dataToSave.checkOutDate < minDate || dataToSave.checkOutDate > maxDate) {
        dataToSave.checkOutDate = maxDate;
      }
      if (dataToSave.checkOutDate < dataToSave.checkInDate) {
        dataToSave.checkOutDate = dataToSave.checkInDate;
      }

      setValidationError(null);

      let res: { success: boolean; error?: string };
      if (editingAcc) {
        res = await updateAccommodation(editingAcc.id, dataToSave);
      } else {
        res = await addAccommodation(dataToSave);
      }

      if (res && res.success === false) {
        setValidationError(res.error || 'Erro ao salvar hospedagem no Supabase.');
        return;
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setValidationError(err?.message || 'Erro inesperado ao salvar hospedagem.');
    } finally {
      accSubmitLockRef.current = false;
      setIsSavingAcc(false);
    }
  };

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  const { handleBackdropClick: handleAccModalBackdrop } = useModalKeyEvents({
    isOpen: isModalOpen && !accToDelete,
    onCancel: () => setIsModalOpen(false),
    onSave: () => handleSaveForm({ preventDefault: () => {} } as React.FormEvent),
  });

  const { handleBackdropClick: handleDeleteAccBackdrop } = useModalKeyEvents({
    isOpen: !!accToDelete,
    onCancel: () => setAccToDelete(null),
    onSave: () => {
      if (accToDelete) {
        const idToDelete = accToDelete.id;
        deleteAccommodation(idToDelete);
        setAccToDelete(null);
        if (editingAcc && editingAcc.id === idToDelete) {
          setIsModalOpen(false);
        }
      }
    },
  });

  // Filter & Sort logic
  const filteredAccommodations = accommodations
    .filter((acc) => {
      if (activeSubTab === 'resorts') return acc.type === 'resort';
      if (activeSubTab === 'hotels') return acc.type === 'hotel';
      if (activeSubTab === 'airbnb') return acc.type === 'airbnb' || acc.type === 'house';
      return true;
    })
    .sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));

  // Financial Stats
  const totalCostUSD = accommodations.reduce((acc, a) => acc + (a.costUSD || 0), 0);
  const totalCostBRL = accommodations.reduce(
    (acc, a) => acc + (a.costBRL || (a.costUSD ? a.costUSD * settings.dollarRate : 0)),
    0
  );

  const calculateNights = (inDate: string, outDate: string) => {
    try {
      const d1 = new Date(inDate).getTime();
      const d2 = new Date(outDate).getTime();
      const diffDays = Math.round((d2 - d1) / (1000 * 3600 * 24));
      return Math.max(1, diffDays);
    } catch {
      return 1;
    }
  };

  const getTypeBadge = (type: AccommodationBooking['type']) => {
    switch (type) {
      case 'resort':
        return { label: 'Resort Temático', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Sparkles };
      case 'hotel':
        return { label: 'Hotel Tradicional', bg: 'bg-blue-100 text-blue-800 border-blue-200', icon: Hotel };
      case 'airbnb':
        return { label: 'Airbnb / Apê', bg: 'bg-rose-100 text-rose-800 border-rose-200', icon: Home };
      case 'house':
        return { label: 'Casa de Temporada (Villa)', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Building2 };
      default:
        return { label: 'Hospedagem', bg: 'bg-slate-100 text-slate-800 border-slate-200', icon: Hotel };
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
              <span>Logística de Hospedagem & Estadia</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight">
              Reservas de Hotéis, Resorts & Airbnb
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Organize todas as estadias da viagem: vouchers de confirmação, horários de check-in/out, comodidades do resort e custos integrados.
            </p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end justify-center gap-2.5 self-end lg:self-auto ml-auto w-full sm:w-auto">
            <button
              type="button"
              id="btn-overview-accommodations"
              onClick={() => openOverviewModal('accommodations')}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
              title="Abrir Visão Geral de Hospedagens"
            >
              <Eye className="w-4 h-4 text-[#1A2B4C]" />
              <span>Visão Geral</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 text-[#1A2B4C]" />
              <span>Nova Reserva de Hotel/Airbnb</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-white">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Reservas Cadastradas
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-[#D4AF37]">
              {accommodations.length} {accommodations.length === 1 ? 'local' : 'locais'}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Noites Totais de Viagem
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-white">
              {accommodations.reduce((total, a) => total + calculateNights(a.checkInDate, a.checkOutDate), 0)} noites
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Custo Total (Dólar)
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300">
              US$ {totalCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Custo Convertido (BRL)
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-white">
              R$ {totalCostBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>



      {/* Navigation Sub-Tabs (Accommodation Categories) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'all', label: 'Todas as Hospedagens', icon: Building2, count: accommodations.length },
          {
            id: 'resorts',
            label: 'Resorts Disney & Universal',
            icon: Sparkles,
            count: accommodations.filter((a) => a.type === 'resort').length,
          },
          {
            id: 'hotels',
            label: 'Hotéis Parceiros',
            icon: Hotel,
            count: accommodations.filter((a) => a.type === 'hotel').length,
          },
          {
            id: 'airbnb',
            label: 'Airbnb & Casas',
            icon: Home,
            count: accommodations.filter((a) => a.type === 'airbnb' || a.type === 'house').length,
          },
        ].map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <IconComp className={`w-4 h-4 ${isActive ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* DEDICATED HIGHLIGHTED LINE FOR DICAS & REGRAS */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        activeSubTab === 'tips'
          ? 'bg-gradient-to-r from-[#1A2B4C] via-[#243A66] to-[#1A2B4C] text-white border-[#D4AF37] shadow-md ring-2 ring-[#D4AF37]/30'
          : 'bg-gradient-to-r from-amber-50/90 via-white to-amber-50/60 border-amber-200/90 hover:border-amber-300 shadow-2xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              activeSubTab === 'tips'
                ? 'bg-[#D4AF37] text-[#1A2B4C]'
                : 'bg-amber-100 text-amber-900 border border-amber-200'
            }`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  activeSubTab === 'tips'
                    ? 'bg-[#D4AF37] text-[#1A2B4C]'
                    : 'bg-amber-200/80 text-amber-950'
                }`}>
                  Guia Prático & Economia
                </span>
                <span className={`text-xs font-bold ${activeSubTab === 'tips' ? 'text-slate-200' : 'text-slate-500'}`}>
                  Check-in, Resort Fees, Benefícios Disney & Dicas Airbnb
                </span>
              </div>
              <h3 className={`text-sm sm:text-base font-bold font-serif mt-0.5 ${
                activeSubTab === 'tips' ? 'text-white' : 'text-[#1A2B4C]'
              }`}>
                Dicas de Check-in, Taxas de Resort & Vantagens Disney
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab(activeSubTab === 'tips' ? 'all' : 'tips')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                activeSubTab === 'tips'
                  ? 'bg-[#D4AF37] hover:bg-[#c49f2c] text-[#1A2B4C]'
                  : 'bg-[#1A2B4C] hover:bg-[#243A66] text-white'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>{activeSubTab === 'tips' ? 'Fechar Guia de Dicas' : 'Ver Guia Completo de Dicas'}</span>
            </button>
          </div>
        </div>
      </div>



      {/* VIEW: Tips & Rules */}
      {activeSubTab === 'tips' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Disney Resorts */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-indigo-900 font-bold font-serif text-lg">
              <Sparkles className="w-5 h-5 text-[#D4AF37]" />
              Vantagens de se Hospedar no Resort Disney
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Early Theme Park Entry:</strong> Entrada 30 minutos mais cedo em todos os 4 parques temáticos Disney todos os dias.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Transporte Gratuito Interno:</strong> Monotrilho, Disney Skyliner, Barcos e Ônibus ilimitados para todos os parques e Disney Springs.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Estacionamento Grátis nos Parques:</strong> Hóspedes de resorts Disney não pagam a taxa de estacionamento diário nos parques (economia de ~US$ 30/dia).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Reserva de Lightning Lane Antecipada:</strong> Agende atrações do Disney Lightning Lane com até 7 dias de antecedência do check-in.
                </span>
              </li>
            </ul>
          </div>

          {/* Card 2: Airbnb / Kissimmee */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-rose-900 font-bold font-serif text-lg">
              <Home className="w-5 h-5 text-rose-600" />
              Dicas para Casas Airbnb / Kissimmee
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Cozinha Completa & Economia:</strong> Excelente para famílias grandes. Permite fazer café da manhã e jantar em casa, reduzindo os custos com restaurantes.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Keyless Entry & Self Check-in:</strong> Certifique-se de obter a senha do teclado eletrônico com o anfitrião 24h antes da viagem.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Aquecimento de Piscina:</strong> Se viajar no inverno (Dezembro/Janeiro), confirme se a taxa de aquecimento da piscina (Pool Heat) já está inclusa na diária.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Compras no Supermercado:</strong> Faça uma parada inicial no Walmart ou Target para abastecer garrafas de água, snacks e itens de higiene.
                </span>
              </li>
            </ul>
          </div>

          {/* Card 3: Regra de Logística & Check-in */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-[#1A2B4C] font-bold font-serif text-lg">
              <Navigation className="w-5 h-5 text-indigo-600" />
              Regra de Logística do 1º Dia & Roteiro
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Último Evento no Aeroporto:</strong> O check-in é calculado após a retirada do carro alugado ou término dos trâmites de imigração/bagagem.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Tempo Maps:</strong> O horário considera a distância real de carro entre o aeroporto e o endereço registrado da acomodação.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero Duplicidade:</strong> Se já houver check-in ou deslocamento registrado, o app atualiza in-place sem criar itens repetidos.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Início & Fim do Dia:</strong> O 1º dia acaba na acomodação. Nos demais dias da viagem sem chegada em aeroporto, o dia sempre inicia e encerra na acomodação.
                </span>
              </li>
            </ul>
          </div>
        </div>
      ) : filteredAccommodations.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <Hotel className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">Nenhuma reserva cadastrada nesta categoria</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Adicione a sua reserva de hotel, resort Disney ou casa no Airbnb para visualizar todos os detalhes e comprovantes.
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] cursor-pointer inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-[#D4AF37]" />
            Adicionar Hospedagem
          </button>
        </div>
      ) : (
        /* ACCOMMODATIONS LIST */
        <div className="space-y-6">
          {filteredAccommodations.map((acc, aIdx) => {
            const badge = getTypeBadge(acc.type);
            const BadgeIcon = badge.icon;
            const nights = calculateNights(acc.checkInDate, acc.checkOutDate);
            const costUsd = acc.costUSD || 0;
            const costBrl = acc.costBRL || (costUsd ? costUsd * settings.dollarRate : 0);

            return (
              <div
                key={`${acc.id}-${aIdx}`}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-[#D4AF37]/50 hover:shadow-xs transition-all overflow-hidden space-y-0"
              >
                {/* Standardized Logistics Header */}
                <LogisticsCardHeader
                  icon={<BadgeIcon className="w-5 h-5 text-[#D4AF37]" />}
                  categoryLabel={badge.label}
                  categoryBadgeColor="bg-[#D4AF37] text-[#1A2B4C]"
                  status={acc.status}
                  title={acc.name}
                  subtitle={
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="text-slate-200">{acc.address}</span>
                      {acc.address && (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(acc.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#D4AF37] font-bold hover:underline flex items-center gap-0.5 ml-1"
                        >
                          <span>Abrir Mapa</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </span>
                  }
                  confirmationCodes={acc.confirmationCode}
                  codeLabel="Voucher"
                  extraBadges={
                    acc.payerId && acc.payerId !== 'all' ? (
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold bg-white/10 text-indigo-200 border border-indigo-400/30 flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-indigo-300" />
                        Pago por: {settings.travelers.find((t) => t.id === acc.payerId)?.name || 'Viajante'}
                      </span>
                    ) : undefined
                  }
                  onEdit={() => handleOpenEditModal(acc)}
                  editTitle={`Editar reserva de ${acc.name}`}
                  onDelete={() => setAccToDelete(acc)}
                  deleteTitle={`Excluir reserva de ${acc.name}`}
                />

                {/* Main Card Info Body */}
                <div className="p-5 sm:p-6 space-y-5">
                  {/* Check-in & Check-out Timeline Box */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                        Check-in (Entrada)
                      </span>
                      <strong className="text-base sm:text-lg font-bold text-slate-900 block font-mono">
                        {formatDisplayDate(acc.checkInDate)}
                      </strong>
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        A partir das {acc.checkInTime || '15:00'}
                      </span>
                    </div>

                    <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                        Check-out (Saída)
                      </span>
                      <strong className="text-base sm:text-lg font-bold text-slate-900 block font-mono">
                        {formatDisplayDate(acc.checkOutDate)}
                      </strong>
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Até às {acc.checkOutTime || '11:00'}
                      </span>
                    </div>

                    <div className="sm:border-l sm:border-slate-200 sm:pl-4 flex flex-col justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Duração da Estadia
                      </span>
                      <span className="text-xl sm:text-2xl font-black font-mono text-[#1A2B4C] mt-0.5">
                        {nights} {nights === 1 ? 'noite' : 'noites'}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5">
                        Total da hospedagem no período
                      </span>
                    </div>
                  </div>

                  {/* 4-Column Balanced Grid: Room Type, Guests/Contact, Amenities, Financial */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
                    {/* Room Type */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                          <Hotel className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Quarto / Acomodação</span>
                        </div>
                        <p className="font-bold text-slate-900 text-xs mt-1">
                          {acc.roomType || 'Standard / A definir'}
                        </p>
                      </div>
                      <p className="text-slate-500 text-[11px] pt-1.5 border-t border-slate-200/70">
                        {badge.label}
                      </p>
                    </div>

                    {/* Guests & Contact */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                          <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Hóspedes & Contato</span>
                        </div>
                        <p className="font-bold text-slate-900 text-xs mt-1">
                          {acc.totalGuests || 1} {(acc.totalGuests || 1) === 1 ? 'Hóspede' : 'Hóspedes'}
                        </p>
                      </div>
                      <div className="text-[11px] pt-1.5 border-t border-slate-200/70">
                        {acc.contactPhone ? (
                          <a
                            href={`tel:${acc.contactPhone}`}
                            className="text-[#1A2B4C] font-bold hover:underline font-mono"
                          >
                            📞 {acc.contactPhone}
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">Contato via app</span>
                        )}
                      </div>
                    </div>

                    {/* Amenities & Benefits */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                          <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Comodidades ({acc.amenities?.length || 0})</span>
                        </div>
                        {acc.amenities && acc.amenities.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1 max-h-14 overflow-y-auto custom-scrollbar">
                            {acc.amenities.slice(0, 3).map((item, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md bg-white text-slate-700 text-[10px] font-semibold border border-slate-200"
                              >
                                {item}
                              </span>
                            ))}
                            {acc.amenities.length > 3 && (
                              <span className="text-[10px] font-bold text-slate-500 self-center">
                                +{acc.amenities.length - 3} mais
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic mt-1">
                            Nenhum benefício extra
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                        Benefícios inclusos
                      </span>
                    </div>

                    {/* Financial Investment */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Investimento Total</span>
                        </div>
                        <div className="mt-1">
                          <div className="text-sm sm:text-base font-bold text-[#1A2B4C] font-mono tabular-nums">
                            US$ {costUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums block">
                            R$ {costBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-amber-800 font-bold bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200 w-fit">
                        {acc.payerId && acc.payerId !== 'all'
                          ? `Pago: ${settings.travelers.find((t) => t.id === acc.payerId)?.name || 'Viajante'}`
                          : 'Rateio do Grupo'}
                      </span>
                    </div>
                  </div>

                  {/* Observações & Instruções de Check-in */}
                  {acc.notes && (
                    <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="font-bold block text-amber-950">Observações & Instruções de Check-in:</span>
                        <p className="leading-relaxed">{acc.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADD / EDIT ACCOMMODATION */}
      {isModalOpen && (
        <div
          onClick={handleAccModalBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-6xl w-full shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Hotel className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    {editingAcc ? 'Edição de Hospedagem' : 'Nova Reserva'} • Resorts Disney, Universal & Hotéis
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    {editingAcc ? 'Editar Reserva de Hospedagem' : 'Cadastrar Reserva de Hospedagem'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 sm:p-6 space-y-8 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              {validationError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold block text-rose-950">Erro de Período de Hospedagem:</span>
                    <p className="leading-relaxed whitespace-pre-line font-medium">{validationError}</p>
                  </div>
                </div>
              )}

              {/* 1. TIPO DE HOSPEDAGEM & IDENTIFICAÇÃO */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  1. Tipo de Hospedagem & Identificação
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'resort', label: 'Resort Temático', icon: Sparkles },
                      { id: 'hotel', label: 'Hotel Tradicional', icon: Hotel },
                      { id: 'airbnb', label: 'Airbnb / Apê', icon: Home },
                      { id: 'house', label: 'Casa de Temporada', icon: Building2 },
                    ].map((t) => {
                      const IconC = t.icon;
                      const selected = formData.type === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, type: t.id as any })}
                          className={`p-2.5 rounded-xl border text-[10px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                            selected
                              ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <IconC className={`w-4 h-4 ${selected ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 block">Nome do Hotel / Propriedade *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
                        placeholder="Ex: Disney's Pop Century Resort"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 block">Código de Confirmação / Voucher</label>
                      <input
                        type="text"
                        value={formData.confirmationCode}
                        onChange={(e) => setFormData({ ...formData, confirmationCode: e.target.value.toUpperCase() })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
                        placeholder="Ex: RES-DIS-98421"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. LOCALIZAÇÃO & CONTATO */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  2. Localização & Contato
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Endereço Completo</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
                        placeholder="Ex: 1050 Century Dr, Lake Buena Vista, FL 32830"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. DATAS & HORÁRIOS */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  3. Datas & Horários (Check-in & Check-out)
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block flex items-center gap-1">
                        Data Check-in <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        min={tripMinDate}
                        max={tripMaxDate}
                        value={formData.checkInDate}
                        onChange={(e) => {
                          const newCheckIn = e.target.value;
                          let newCheckOut = formData.checkOutDate;
                          if (!newCheckOut || newCheckIn > newCheckOut || newCheckOut < tripMinDate || newCheckOut > tripMaxDate) {
                            newCheckOut = tripMaxDate >= newCheckIn ? tripMaxDate : newCheckIn;
                          }
                          setFormData({
                            ...formData,
                            checkInDate: newCheckIn,
                            checkOutDate: newCheckOut,
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-400 font-medium">Mín: {formatDisplayDate(tripMinDate, false)}</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block flex items-center gap-1">
                        Hora Check-in
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-2.5 top-2.5 w-3 h-3 text-slate-400" />
                        <input
                          type="time"
                          value={formData.checkInTime}
                          onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                          className="w-full pl-8 pr-2 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white cursor-pointer"
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium">Padrão: 15:00</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block flex items-center gap-1">
                        Data Check-out <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        min={formData.checkInDate && formData.checkInDate >= tripMinDate && formData.checkInDate <= tripMaxDate ? formData.checkInDate : tripMinDate}
                        max={tripMaxDate}
                        value={formData.checkOutDate}
                        onChange={(e) => setFormData({ ...formData, checkOutDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-400 font-medium">Máx: {formatDisplayDate(tripMaxDate, false)}</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block flex items-center gap-1">
                        Hora Check-out
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-2.5 top-2.5 w-3 h-3 text-slate-400" />
                        <input
                          type="time"
                          value={formData.checkOutTime}
                          onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                          className="w-full pl-8 pr-2 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white cursor-pointer"
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium">Padrão: 11:00</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. ACOMODAÇÃO & HÓSPEDES */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  4. Acomodação & Hóspedes
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700 block">Categoria do Quarto / Descrição</label>
                      <input
                        type="text"
                        value={formData.roomType || ''}
                        onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
                        placeholder="Ex: Quarto Standard 2 Camas Queen"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 block">Total de Hóspedes</label>
                      <div className="relative">
                        <Users className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={formData.totalGuests}
                          onChange={(e) => setFormData({ ...formData, totalGuests: parseInt(e.target.value) || 1 })}
                          className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
                          title="Calculado automaticamente pelos viajantes selecionados abaixo"
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium italic">Vínculo automático com a seleção de viajantes</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. COMODIDADES & BENEFÍCIOS */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  5. Comodidades & Benefícios
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-2">Selecione os itens inclusos na reserva</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableAmenities.map((amenity) => {
                      const isSelected = (formData.amenities || []).includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          onClick={() => handleToggleAmenity(amenity)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1A2B4C] text-white border border-[#1A2B4C]'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 6. VIAJANTES / HÓSPEDES */}
              <TravelerSelector
                label="6. VIAJANTES / HÓSPEDES"
                travelers={settings.travelers || []}
                selectedIds={formData.travelerIds || ['all']}
                onChange={(ids) => {
                  const total = ids.includes('all') ? (settings.travelers?.length || 1) : ids.length;
                  setFormData((prev) => ({
                    ...prev,
                    travelerIds: ids,
                    totalGuests: total > 0 ? total : 1,
                  }));
                }}
              />

              {/* 7. CUSTOS & PAGAMENTO */}
              <PaymentSection
                sectionNumber={7}
                sectionTitle="CUSTOS & PAGAMENTO"
                pricingMode="total"
                dollarRate={settings.dollarRate || 5.75}
                unitCostUSD={formData.costUSD ? formData.costUSD / guestCount : null}
                unitCostBRL={formData.costBRL ? formData.costBRL / guestCount : null}
                totalCostUSD={formData.costUSD !== undefined && formData.costUSD !== null ? formData.costUSD : null}
                totalCostBRL={formData.costBRL !== undefined && formData.costBRL !== null ? formData.costBRL : null}
                onChangeCosts={(_unitUSD, _unitBRL, totalUSD, totalBRL) => {
                  setFormData((prev) => ({
                    ...prev,
                    costUSD: totalUSD ?? 0,
                    costBRL: totalBRL ?? 0,
                  }));
                }}
                paymentStatus={
                  formData.status === 'Pago'
                    ? 'Pago'
                    : formData.status === 'Pendente' || formData.status === 'Falta Pagar'
                    ? 'Pendente'
                    : 'Não informado'
                }
                onChangePaymentStatus={(status: PaymentStatusType) => {
                  setFormData((prev) => ({
                    ...prev,
                    status,
                  }));
                }}
                payerId={formData.payerId || 'all'}
                onChangePayerId={(payerId) => {
                  setFormData((prev) => ({
                    ...prev,
                    payerId,
                  }));
                }}
                travelers={settings.travelers || []}
                passengerCount={guestCount}
                passengerLabel="hóspede"
                unitLabelUSD="Valor Total da Hospedagem (US$)"
                unitLabelBRL="Valor Total da Hospedagem (R$)"
                showPayerSelector={true}
              />

              {/* 8. OBSERVAÇÕES & INSTRUÇÕES */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  8. Observações & Instruções
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Observações & Instruções de Check-in</label>
                    <textarea
                      rows={3}
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] bg-white"
                      placeholder="Ex: Solicitar quartos conjugados no andar térreo. Senha da fechadura: 4921."
                    />
                  </div>
                </div>
              </div>

              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                {editingAcc ? (
                  <button
                    type="button"
                    onClick={() => setAccToDelete(editingAcc)}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    title="Excluir esta reserva"
                    aria-label={`Excluir reserva de ${editingAcc.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Excluir Reserva</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAcc}
                    className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingAcc ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                        <span>Salvando...</span>
                      </>
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

      {/* DELETE ACCOMMODATION CONFIRMATION MODAL */}
      {accToDelete && (
        <div
          onClick={handleDeleteAccBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-700">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-rose-950 font-serif">Excluir Reserva de Hotel</h3>
                  <p className="text-[11px] text-rose-700">Confirmação de exclusão da hospedagem</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p className="text-sm font-semibold text-slate-900">
                Tem certeza que deseja excluir a reserva <strong className="text-[#1A2B4C]">"{accToDelete.name}"</strong>?
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-slate-600">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Tipo:</span>
                  <span className="font-bold text-slate-800">{getTypeBadge(accToDelete.type).label}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Período:</span>
                  <span className="font-mono text-slate-800 font-semibold">{accToDelete.checkInDate} até {accToDelete.checkOutDate}</span>
                </div>
                {accToDelete.confirmationCode && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Código:</span>
                    <span className="font-mono text-slate-800 font-bold">{accToDelete.confirmationCode}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Valor:</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    US$ {(accToDelete.costUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} (R$ {(accToDelete.costBRL || ((accToDelete.costUSD || 0) * settings.dollarRate)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  </span>
                </div>
                <p className="text-[11px] text-rose-600 pt-2 border-t border-slate-200 font-medium">
                  ⚠️ Esta ação removerá o voucher, as datas de estadia e os custos associados a esta hospedagem.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAccToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const idToDelete = accToDelete.id;
                  deleteAccommodation(idToDelete);
                  setAccToDelete(null);
                  if (editingAcc && editingAcc.id === idToDelete) {
                    setIsModalOpen(false);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm cursor-pointer text-xs flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};
