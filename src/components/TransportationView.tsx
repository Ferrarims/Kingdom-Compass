import React, { useState, useRef } from 'react';
import { usePlanner, calculateDateOffset } from '../context/PlannerContext';
import { CarRentalBooking } from '../types';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { TravelerSelector } from './TravelerSelector';
import { PaymentSection, PaymentStatusType } from './PaymentSection';
import { LogisticsCardHeader } from './LogisticsCardHeader';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import {
  Car,
  Calendar,
  Clock,
  DollarSign,
  MapPin,
  CheckCircle2,
  Plus,
  Trash2,
  Edit3,
  FileText,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Compass,
  Info,
  KeyRound,
  X,
  ChevronRight,
  CreditCard,
  Navigation,
  Bus,
  Sparkles,
  Shuffle,
  Check,
  Train,
  Ticket,
  Eye,
  RefreshCw,
  Users,
} from 'lucide-react';

export const TransportationView: React.FC = () => {
  const {
    carRentals,
    addCarRental,
    updateCarRental,
    deleteCarRental,
    settings,
    updateSettings,
    flights,
    openOverviewModal,
  } = usePlanner();

  // Active Modality selected by user (only set if explicitly chosen in settings or if car rentals exist)
  const selectedModality = settings.transportModality || (carRentals && carRentals.length > 0 ? 'rental' : undefined);

  // Helper to clean duplicate comma-separated address parts
  const cleanAddressString = (addr?: string): string => {
    if (!addr) return '';
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    const unique: string[] = [];
    for (const p of parts) {
      if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) {
        unique.push(p);
      }
    }
    return unique.join(', ');
  };

  // Sub-tabs navigation
  const [activeTab, setActiveTab] = useState<'rentals' | 'uber' | 'public' | 'tolls' | 'traffic_rules'>('rentals');

  // Modal state for Add/Edit Rental
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<CarRentalBooking | null>(null);
  const [rentalToDelete, setRentalToDelete] = useState<CarRentalBooking | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useConfirmationKeyboard({
    isOpen: !!rentalToDelete,
    onConfirm: () => {
      if (rentalToDelete) {
        deleteCarRental(rentalToDelete.id);
        setRentalToDelete(null);
      }
    },
    onCancel: () => setRentalToDelete(null),
  });

  const [isSaving, setIsSaving] = useState(false);
  const rentalFormSubmitLockRef = useRef(false);

  const adjustTime = (timeStr: string, hourDelta: number): string => {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const totalMins = h * 60 + m + hourDelta * 60;
    const normalizedMins = (totalMins + 24 * 60) % (24 * 60);
    const newH = Math.floor(normalizedMins / 60);
    const newM = normalizedMins % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  };

  const outboundFlight = flights?.find((f) => f.type === 'outbound');
  const inboundFlight = flights?.find((f) => f.type === 'inbound');

  const defaultPickupDate = outboundFlight?.arrivalDate || settings.startDate || '';
  const defaultPickupTime = outboundFlight?.arrivalTime ? adjustTime(outboundFlight.arrivalTime, 1) : '';

  const defaultDropoffDate = inboundFlight?.departureDate || settings.returnDate || '';
  const defaultDropoffTime = inboundFlight?.departureTime ? adjustTime(inboundFlight.departureTime, -1) : '';

  // Form State
  const [formData, setFormData] = useState<Omit<CarRentalBooking, 'id'>>({
    company: '',
    confirmationCode: '',
    category: '',
    pickupLocation: '',
    pickupDate: defaultPickupDate,
    pickupTime: defaultPickupTime,
    dropoffLocation: '',
    dropoffDate: defaultDropoffDate,
    dropoffTime: defaultDropoffTime,
    costUSD: 0,
    costBRL: 0,
    status: 'Reservado / Confirmado',
    paymentStatus: 'Não informado',
    payerId: settings.currentUserId || 'all',
    travelerIds: ['all'],
    driverName: '',
    includedInsurances: [
      'CDW / LDW (Proteção contra Colisão e Roubo)',
      'SLI / ALI (Proteção contra Terceiros)',
    ],
    tollOption: 'Visitor Toll Pass (Gratuito MCO)',
    notes: '',
  });

  const participantCount = (formData.travelerIds || ['all']).includes('all')
    ? (settings.travelers?.length || 1)
    : (formData.travelerIds?.length || 1);

  const handleSelectModality = (modality: 'rental' | 'public' | 'uber') => {
    const nextModality = selectedModality === modality ? undefined : modality;
    updateSettings({ transportModality: nextModality });
    if (nextModality === 'rental') setActiveTab('rentals');
    if (nextModality === 'uber') setActiveTab('uber');
    if (nextModality === 'public') setActiveTab('public');
  };

  const handleOpenAddModal = () => {
    setEditingRental(null);
    setValidationError(null);
    setFormData({
      company: '',
      confirmationCode: '',
      category: '',
      pickupLocation: '',
      pickupDate: defaultPickupDate,
      pickupTime: defaultPickupTime,
      dropoffLocation: '',
      dropoffDate: defaultDropoffDate,
      dropoffTime: defaultDropoffTime,
      costUSD: 0,
      costBRL: 0,
      status: 'Reservado / Confirmado',
      paymentStatus: 'Não informado',
      payerId: settings.currentUserId || 'all',
      travelerIds: ['all'],
      driverName: '',
      includedInsurances: [
        'CDW / LDW (Proteção contra Colisão e Roubo)',
        'SLI / ALI (Proteção contra Terceiros)',
      ],
      tollOption: 'Visitor Toll Pass (Gratuito MCO)',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rental: CarRentalBooking) => {
    setEditingRental(rental);
    setValidationError(null);
    setFormData({
      company: rental.company || '',
      confirmationCode: rental.confirmationCode || '',
      category: rental.category || '',
      pickupLocation: rental.pickupLocation || '',
      pickupDate: rental.pickupDate || defaultPickupDate,
      pickupTime: rental.pickupTime || '',
      dropoffLocation: rental.dropoffLocation || '',
      dropoffDate: rental.dropoffDate || defaultDropoffDate,
      dropoffTime: rental.dropoffTime || '',
      costUSD: rental.costUSD ?? 0,
      costBRL: rental.costBRL ?? 0,
      status: rental.status || 'Reservado / Confirmado',
      paymentStatus: (rental.paymentStatus as PaymentStatusType) || (rental.status === 'Pago' ? 'Pago' : 'Não informado'),
      payerId: rental.payerId || 'all',
      travelerIds: rental.travelerIds && rental.travelerIds.length > 0 ? rental.travelerIds : ['all'],
      driverName: rental.driverName || '',
      includedInsurances: rental.includedInsurances || [],
      tollOption: rental.tollOption || 'Visitor Toll Pass (Gratuito MCO)',
      notes: rental.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rentalFormSubmitLockRef.current || isSaving) return;

    if (!formData.company?.trim()) {
      setValidationError('Por favor, informe a empresa locadora.');
      return;
    }
    if (!formData.category?.trim()) {
      setValidationError('Por favor, informe a categoria ou modelo do veículo.');
      return;
    }
    if (!formData.pickupDate) {
      setValidationError('Por favor, informe a data de retirada.');
      return;
    }
    if (!formData.dropoffDate) {
      setValidationError('Por favor, informe a data de devolução.');
      return;
    }
    if (formData.dropoffDate < formData.pickupDate) {
      setValidationError('A data de devolução não pode ser anterior à data de retirada.');
      return;
    }

    setValidationError(null);
    rentalFormSubmitLockRef.current = true;
    setIsSaving(true);
    try {
      const cleanedData = {
        ...formData,
        pickupLocation: cleanAddressString(formData.pickupLocation),
        dropoffLocation: cleanAddressString(formData.dropoffLocation),
        paymentStatus: formData.paymentStatus || 'Não informado',
      };
      let res: { success: boolean; error?: string } | undefined;
      if (editingRental) {
        res = await updateCarRental(editingRental.id, cleanedData);
      } else {
        res = await addCarRental(cleanedData);
      }
      if (res && !res.success) {
        setValidationError(res.error || 'Erro ao salvar aluguel de veículo.');
        return;
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setValidationError(`Erro inesperado ao salvar aluguel de veículo: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      rentalFormSubmitLockRef.current = false;
      setIsSaving(false);
    }
  };

  const { handleBackdropClick: handleRentalModalBackdrop } = useModalKeyEvents({
    isOpen: isModalOpen,
    onCancel: () => setIsModalOpen(false),
    onSave: () => handleSubmitModal({ preventDefault: () => {} } as React.FormEvent),
  });

  // Helper for dates
  const formatDateBR = (dateStr?: string) => {
    if (!dateStr) return '---';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Summary Metrics
  const primaryRental = carRentals[0];
  const totalCostUSD = carRentals.reduce((sum, r) => sum + (r.costUSD || 0), 0);
  const totalCostBRL = carRentals.reduce(
    (sum, r) => sum + (r.costBRL || (r.costUSD || 0) * (settings.dollarRate || 5.75)),
    0
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* HEADER BANNER */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37] mb-1">
              <Car className="w-4 h-4" />
              <span>Mobilidade & Logística na Flórida</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif">
              Transporte & Mobilidade
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 mt-2 max-w-2xl leading-relaxed">
              Defina sua estratégia de transporte na Flórida: selecione se irá <strong>Alugar Carro</strong>, usar <strong>Uber/Táxi</strong>, <strong>Transporte Público</strong> ou um plano <strong>Misto</strong>.
            </p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end justify-center gap-2.5 self-end lg:self-auto ml-auto w-full sm:w-auto">
            <button
              type="button"
              id="btn-overview-transport"
              onClick={() => openOverviewModal('transport')}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
              title="Abrir Visão Geral de Transporte e Mobilidade"
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
              <span>Cadastrar Veículo</span>
            </button>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Shuffle className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Estratégia Escolhida</span>
            </div>
            {selectedModality ? (
              <>
                <p className="text-sm font-bold text-white mt-1 truncate capitalize">
                  {selectedModality === 'rental' && '🚗 Carro Alugado'}
                  {selectedModality === 'uber' && '🚕 Uber & Táxi'}
                  {selectedModality === 'public' && '🚌 Transporte Público'}
                </p>
                <p className="text-[11px] text-emerald-300 truncate">
                  Ativa no Planejamento
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-amber-300 mt-1 truncate">
                  Sem plano escolhido
                </p>
                <p className="text-[11px] text-slate-300 truncate">
                  Pendente de escolha
                </p>
              </>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Veículos Registrados</span>
            </div>
            <p className="text-sm font-bold text-white mt-1">
              {carRentals.length} Veículo(s)
            </p>
            <p className="text-[11px] text-slate-300 truncate">
              {primaryRental ? primaryRental.company : 'Nenhuma locação'}
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Investimento Estimado</span>
            </div>
            <p className="text-sm font-bold text-white mt-1">
              US$ {totalCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-amber-300 font-semibold">
              R$ {totalCostBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pedágio Inteligente</span>
            </div>
            <p className="text-sm font-bold text-white mt-1">
              Visitor Toll Pass
            </p>
            <p className="text-[11px] text-amber-300">
              Economia de taxas no MCO
            </p>
          </div>
        </div>
      </div>



      {/* MODALITY SELECTOR SECTION (ALUGAR CARRO / TRANSPORTE PÚBLICO / UBER / MISTO) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#D4AF37] uppercase">
              <Shuffle className="w-4 h-4" />
              <span>Selecione a Modalidade de Transporte da Sua Viagem</span>
            </div>
            <h2 className="text-lg font-bold font-serif text-[#1A2B4C]">
              Como você pretende se locomover em Orlando & Flórida?
            </h2>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {selectedModality && (
              <button
                type="button"
                onClick={() => updateSettings({ transportModality: undefined })}
                className="text-[11px] text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-full font-semibold transition-colors cursor-pointer"
              >
                Limpar escolha
              </button>
            )}
            <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-semibold">
              {selectedModality ? 'Clique na opção desejada para alterar' : 'Selecione uma opção abaixo'}
            </span>
          </div>
        </div>

        {/* 3 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Option 1: Carro Alugado */}
          <button
            type="button"
            onClick={() => handleSelectModality('rental')}
            className={`p-6 rounded-2xl border text-left transition-all relative cursor-pointer flex flex-col justify-between ${
              selectedModality === 'rental'
                ? 'border-2 border-[#1A2B4C] bg-blue-50/50 shadow-md ring-2 ring-[#1A2B4C]/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            {selectedModality === 'rental' && (
              <span className="absolute top-4 right-4 bg-[#1A2B4C] text-[#D4AF37] p-1.5 rounded-full shadow-sm">
                <Check className="w-4 h-4" />
              </span>
            )}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
                <Car className="w-6 h-6 text-[#1A2B4C]" />
              </div>
              <h3 className="font-bold text-base text-[#1A2B4C]">1. Alugar Carro</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Locação na Alamo, Hertz, Avis ou Sixt. Total liberdade de porta-malas para compras no Walmart, Outlets e viagens.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">Média diária:</span>
              <strong className="text-blue-900">$35 - $70/dia</strong>
            </div>
          </button>

          {/* Option 2: Uber / Lyft */}
          <button
            type="button"
            onClick={() => handleSelectModality('uber')}
            className={`p-6 rounded-2xl border text-left transition-all relative cursor-pointer flex flex-col justify-between ${
              selectedModality === 'uber'
                ? 'border-2 border-[#1A2B4C] bg-amber-50/50 shadow-md ring-2 ring-[#1A2B4C]/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            {selectedModality === 'uber' && (
              <span className="absolute top-4 right-4 bg-[#1A2B4C] text-[#D4AF37] p-1.5 rounded-full shadow-sm">
                <Check className="w-4 h-4" />
              </span>
            )}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
                <Navigation className="w-6 h-6 text-amber-900" />
              </div>
              <h3 className="font-bold text-base text-[#1A2B4C]">2. Uber / Lyft / Táxi</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Deslocamentos 100% por aplicativo. Sem custos de estacionamento ($30/dia), pedágios ou combustível.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">Média por corrida:</span>
              <strong className="text-amber-900">$18 - $40/trecho</strong>
            </div>
          </button>

          {/* Option 3: Transporte Público */}
          <button
            type="button"
            onClick={() => handleSelectModality('public')}
            className={`p-6 rounded-2xl border text-left transition-all relative cursor-pointer flex flex-col justify-between ${
              selectedModality === 'public'
                ? 'border-2 border-[#1A2B4C] bg-emerald-50/50 shadow-md ring-2 ring-[#1A2B4C]/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            {selectedModality === 'public' && (
              <span className="absolute top-4 right-4 bg-[#1A2B4C] text-[#D4AF37] p-1.5 rounded-full shadow-sm">
                <Check className="w-4 h-4" />
              </span>
            )}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold">
                <Bus className="w-6 h-6 text-emerald-900" />
              </div>
              <h3 className="font-bold text-base text-[#1A2B4C]">3. Transporte Público & Shuttles</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ônibus Lynx, Trem Brightline (Miami x Orlando), Shuttles dos hotéis e transporte gratuito Disney (Skyliner & Monorail).
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">Custo médio:</span>
              <strong className="text-emerald-900">Grátis a $2/passeio</strong>
            </div>
          </button>
        </div>
      </div>

      {/* TABS NAVIGATION BAR */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('rentals')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'rentals'
              ? 'bg-[#1A2B4C] text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Car className="w-4 h-4 text-[#D4AF37]" />
          <span>Aluguel de Carro ({carRentals.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('uber')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'uber'
              ? 'bg-[#1A2B4C] text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Navigation className="w-4 h-4 text-[#D4AF37]" />
          <span>Uber, Lyft & Táxi</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('public')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'public'
              ? 'bg-[#1A2B4C] text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Bus className="w-4 h-4 text-[#D4AF37]" />
          <span>Transporte Público, Brightline & Disney</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tolls')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'tolls'
              ? 'bg-[#1A2B4C] text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4 text-[#D4AF37]" />
          <span>Pedágios (Visitor Toll Pass)</span>
        </button>
      </div>

      {/* DEDICATED HIGHLIGHTED LINE FOR REGRAS DE TRÂNSITO & SEGURANÇA */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        activeTab === 'traffic_rules'
          ? 'bg-gradient-to-r from-[#1A2B4C] via-[#243A66] to-[#1A2B4C] text-white border-[#D4AF37] shadow-md ring-2 ring-[#D4AF37]/30'
          : 'bg-gradient-to-r from-amber-50/90 via-white to-amber-50/60 border-amber-200/90 hover:border-amber-300 shadow-2xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              activeTab === 'traffic_rules'
                ? 'bg-[#D4AF37] text-[#1A2B4C]'
                : 'bg-amber-100 text-amber-900 border border-amber-200'
            }`}>
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  activeTab === 'traffic_rules'
                    ? 'bg-[#D4AF37] text-[#1A2B4C]'
                    : 'bg-amber-200/80 text-amber-950'
                }`}>
                  Guia Prático & Segurança
                </span>
                <span className={`text-xs font-bold ${activeTab === 'traffic_rules' ? 'text-slate-200' : 'text-slate-500'}`}>
                  Conversão à Direita, CNH Brasileira, Abastecimento e Cadeirinhas
                </span>
              </div>
              <h3 className={`text-sm sm:text-base font-bold font-serif mt-0.5 ${
                activeTab === 'traffic_rules' ? 'text-white' : 'text-[#1A2B4C]'
              }`}>
                Regras Importantes de Trânsito para Dirigir na Flórida
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'traffic_rules' ? 'rentals' : 'traffic_rules')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                activeTab === 'traffic_rules'
                  ? 'bg-[#D4AF37] hover:bg-[#c49f2c] text-[#1A2B4C]'
                  : 'bg-[#1A2B4C] hover:bg-[#243A66] text-white'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>{activeTab === 'traffic_rules' ? 'Fechar Regras de Trânsito' : 'Ver Regras de Trânsito'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: RENTALS LIST */}
      {activeTab === 'rentals' && (
        <div className="space-y-6">
          {carRentals.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-2xs space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 text-[#D4AF37] flex items-center justify-center mx-auto border border-amber-200">
                <Car className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-lg font-bold text-[#1A2B4C] font-serif">Nenhum Veículo Cadastrado</h3>
                <p className="text-xs text-slate-600">
                  Cadastre a reserva do seu carro para ter em mãos o número de confirmação, horários de retirada no aeroporto e vouchers.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="px-5 py-2.5 rounded-xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-xs transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>Cadastrar Primeiro Veículo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {carRentals.map((rental, rIdx) => {
                const costBRLCalculated =
                  rental.costBRL || (rental.costUSD || 0) * (settings.dollarRate || 5.75);
                const costUsd = rental.costUSD || 0;

                return (
                  <div
                    key={`${rental.id}-${rIdx}`}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-[#D4AF37]/50 hover:shadow-xs transition-all overflow-hidden space-y-0"
                  >
                    {/* Standardized Logistics Header */}
                    <LogisticsCardHeader
                      icon={<Car className="w-5 h-5 text-[#D4AF37]" />}
                      categoryLabel={rental.company || 'Aluguel de Carro'}
                      categoryBadgeColor="bg-[#D4AF37] text-[#1A2B4C]"
                      status={rental.status || 'Reservado / Confirmado'}
                      title={rental.category}
                      subtitle={
                        <span className="flex items-center gap-2 flex-wrap text-slate-200">
                          <span>
                            Condutor: <strong>{rental.driverName || 'Não Informado'}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Pedágio: <strong>{rental.tollOption || 'Visitor Toll Pass'}</strong>
                          </span>
                        </span>
                      }
                      confirmationCodes={rental.confirmationCode}
                      codeLabel="Reserva"
                      onEdit={() => handleOpenEditModal(rental)}
                      editTitle="Editar Veículo"
                      onDelete={() => setRentalToDelete(rental)}
                      deleteTitle="Excluir Veículo"
                    />

                    {/* Content Details */}
                    <div className="p-5 sm:p-6 space-y-5">
                      {/* Pick-up & Drop-off Timeline Box */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80">
                        {/* Pickup */}
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Retirada (Pick-up)</span>
                          </div>
                          <p className="text-xs font-bold text-[#1A2B4C] leading-snug">
                            {cleanAddressString(rental.pickupLocation)}
                          </p>
                          <p className="text-xs text-slate-600 font-medium flex items-center gap-1 pt-1">
                            <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>{formatDateBR(rental.pickupDate)}</span>
                            <span>•</span>
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>A partir de {rental.pickupTime || '14:30'}</span>
                          </p>
                        </div>

                        {/* Dropoff */}
                        <div className="space-y-1 md:border-l md:border-slate-200 md:pl-4">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Devolução (Drop-off)</span>
                          </div>
                          <p className="text-xs font-bold text-[#1A2B4C] leading-snug">
                            {cleanAddressString(rental.dropoffLocation)}
                          </p>
                          <p className="text-xs text-slate-600 font-medium flex items-center gap-1 pt-1">
                            <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>{formatDateBR(rental.dropoffDate)}</span>
                            <span>•</span>
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Até às {rental.dropoffTime || '12:00'}</span>
                          </p>
                        </div>
                      </div>

                      {/* 5-Column Balanced Grid: Driver, Tolls, Insurances, Passengers, Financial */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs">
                        {/* Driver */}
                        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>Condutor Principal</span>
                            </div>
                            <p className="font-bold text-slate-900 text-xs mt-1">
                              {rental.driverName || 'Não Informado'}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                            CNH válida exigida
                          </span>
                        </div>

                        {/* Toll Option */}
                        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>Opção de Pedágio</span>
                            </div>
                            <p className="font-bold text-amber-900 text-xs mt-1">
                              {rental.tollOption || 'Visitor Toll Pass'}
                            </p>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-semibold pt-1.5 border-t border-slate-200/70 block">
                            ✓ Isento de taxas abusivas
                          </span>
                        </div>

                        {/* Insurances & Coverage */}
                        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Seguros Inclusos ({rental.includedInsurances?.length || 0})</span>
                            </div>
                            {rental.includedInsurances && rental.includedInsurances.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {rental.includedInsurances.slice(0, 2).map((ins, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-semibold border border-emerald-200 truncate max-w-[140px]"
                                  >
                                    ✓ {ins}
                                  </span>
                                ))}
                                {rental.includedInsurances.length > 2 && (
                                  <span className="text-[10px] font-bold text-slate-500 self-center">
                                    +{rental.includedInsurances.length - 2} mais
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic mt-1">
                                Seguro CDW/LDW padrão
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                            Proteção contratada
                          </span>
                        </div>

                        {/* Linked Passengers / Participants */}
                        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>Passageiros Vinculados</span>
                            </div>
                            {(() => {
                              const rTrvs = rental.travelerIds || [];
                              const allTrvs = settings.travelers || [];
                              const isAll = !rTrvs || rTrvs.length === 0 || rTrvs.includes('all') || (allTrvs.length > 0 && rTrvs.length === allTrvs.length);
                              const matchedNames = isAll
                                ? allTrvs.map((t) => t.name || 'Viajante')
                                : allTrvs.filter((t) => rTrvs.includes(t.id)).map((t) => t.name || 'Viajante');
                              const namesStr = matchedNames.length > 0 ? matchedNames.join(', ') : 'Todos os Viajantes';
                              return (
                                <p className="font-medium text-slate-800 text-xs mt-1 leading-snug break-words">
                                  {namesStr}
                                </p>
                              );
                            })()}
                          </div>
                          <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                            Ocupantes do veículo
                          </span>
                        </div>

                        {/* Cost & Investment (Standardized Financial Block) */}
                        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Investimento da Locação</span>
                            </div>
                            <div className="mt-1">
                              <div className="text-base sm:text-lg font-bold text-[#1A2B4C] font-mono tabular-nums">
                                R$ {costBRLCalculated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                              <span className="text-xs text-slate-500 font-mono tabular-nums block">
                                (US$ {costUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-slate-200/70">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border w-fit ${
                                rental.paymentStatus === 'Pago'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : rental.paymentStatus === 'Pendente'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              {rental.paymentStatus === 'Pago'
                                ? '✓ Pago'
                                : rental.paymentStatus === 'Pendente'
                                ? '⏳ Pendente'
                                : '⚪ Não informado'}
                            </span>
                            <span className="text-[10px] text-amber-800 font-bold bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200/80 w-fit">
                              {!rental.payerId || rental.payerId === 'all' || rental.payerId === 'grupo'
                                ? 'Dividido pelo grupo'
                                : `Pagador: ${(settings.travelers || []).find((t) => t.id === rental.payerId)?.name || 'Viajante'}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Observações & Dicas da Locadora */}
                      {rental.notes && (
                        <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold block text-amber-950">Instruções & Dicas da Locadora:</span>
                            <p className="leading-relaxed">{rental.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UBER, LYFT & TÁXI */}
      {activeTab === 'uber' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
              <Navigation className="w-4 h-4" />
              <span>Calculadora & Guia de Mobilidade por Aplicativo</span>
            </div>
            <h2 className="text-2xl font-bold font-serif text-[#1A2B4C] mt-1">
              Uber, Lyft & Táxi em Orlando
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              O serviço de Uber/Lyft em Orlando funciona perfeitamente. Use este guia para prever os valores de corridas por trecho e descobrir os pontos exatos de embarque nos parques.
            </p>
          </div>

          {/* Fare Calculator Grid */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#1A2B4C] font-serif flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Estimativa Média de Valores de Corridas (UberX / Lyft Standard)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#1A2B4C] flex items-center justify-between">
                  <span>MCO ➔ Disney Resorts</span>
                  <span className="text-emerald-700 font-mono font-bold">US$ 35 - 50</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tempo estimado: 25 a 35 minutos pela FL-417 S.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#1A2B4C] flex items-center justify-between">
                  <span>MCO ➔ Universal Resorts</span>
                  <span className="text-emerald-700 font-mono font-bold">US$ 30 - 45</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tempo estimado: 20 a 30 minutos via I-4 W.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#1A2B4C] flex items-center justify-between">
                  <span>Disney ➔ Universal</span>
                  <span className="text-emerald-700 font-mono font-bold">US$ 22 - 32</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tempo estimado: 15 a 22 minutos via I-4.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#1A2B4C] flex items-center justify-between">
                  <span>Hotel ➔ Outlets Premium</span>
                  <span className="text-emerald-700 font-mono font-bold">US$ 15 - 25</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Vineland Ave ou International Drive.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#1A2B4C] flex items-center justify-between">
                  <span>Disney ➔ Walmart / Target</span>
                  <span className="text-emerald-700 font-mono font-bold">US$ 12 - 18</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Unidades do Walmart na Vineland ou 192.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#1A2B4C] flex items-center justify-between">
                  <span>UberXL (6 Passa.)</span>
                  <span className="text-amber-700 font-mono font-bold">+40% a 60%</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Ideal para grupos com malas ou carrinhos de bebê.
                </p>
              </div>
            </div>
          </div>

          {/* Pickup Locations Tips */}
          <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
            <h3 className="font-bold text-sm text-amber-950 flex items-center gap-2 font-serif">
              <MapPin className="w-4 h-4 text-amber-700" />
              Pontos de Embarque de Uber / Lyft nos Parques
            </h3>
            <ul className="space-y-2 text-xs text-amber-900 leading-relaxed">
              <li>
                🏰 <strong>Magic Kingdom:</strong> Os Ubers não vão direto ao portão principal. Eles deixam e pegam passageiros no <em>Transportation and Ticket Center (TTC)</em>. De lá você pega o Monorail ou o Ferry Boat.
              </li>
              <li>
                🌐 <strong>EPCOT, Hollywood Studios & Animal Kingdom:</strong> Pontos de Uber sinalizados como <em>Rideshare Pick-Up Zone</em> bem na saída da portaria de cada parque.
              </li>
              <li>
                🎢 <strong>Universal Studios & Islands of Adventure:</strong> O ponto fica no 5º andar do edifício garagem da Universal (Parking Garage - Rideshare Zone).
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 3: TRANSPORTE PÚBLICO, BRIGHTLINE & DISNEY */}
      {activeTab === 'public' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
              <Bus className="w-4 h-4" />
              <span>Conexões Públicas & Complexos</span>
            </div>
            <h2 className="text-2xl font-bold font-serif text-[#1A2B4C] mt-1">
              Trem Brightline, Transportes Gratuitos Disney & Ônibus Lynx
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Utilize o sistema de transporte da Flórida para economizar ou integrar trajetos entre cidades (Miami - Orlando) e parques.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Brightline */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="p-3 rounded-lg bg-amber-500 text-[#1A2B4C] w-fit font-bold text-xs flex items-center gap-2">
                <Train className="w-4 h-4" />
                <span>Trem Brightline (Miami ➔ Orlando)</span>
              </div>
              <h4 className="font-bold text-sm text-[#1A2B4C]">Alta Velocidade & Luxo</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Conecta Miami Central, Aventura, Fort Lauderdale e West Palm Beach diretamente ao <strong>Terminal C do Aeroporto MCO em Orlando</strong> em ~3h.
              </p>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                🎫 Passagens a partir de US$ 79 / adulto com Wi-Fi gratuito a bordo.
              </div>
            </div>

            {/* Disney Transportation */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="p-3 rounded-lg bg-[#1A2B4C] text-white w-fit font-bold text-xs flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span>Transporte Gratuito Disney</span>
              </div>
              <h4 className="font-bold text-sm text-[#1A2B4C]">Skyliner, Monorail & Buses</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Hóspedes de hotéis Disney ou visitantes com ingressos utilizam sem custo o <strong>Disney Skyliner</strong> (teleférico), o icônico <strong>Monorail</strong> e ônibus expressos entre parques.
              </p>
              <div className="text-[11px] text-[#1A2B4C] font-semibold pt-2 border-t border-slate-200">
                ✨ Economia de $30/dia de estacionamento do parque.
              </div>
            </div>

            {/* Lynx Bus */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="p-3 rounded-lg bg-blue-700 text-white w-fit font-bold text-xs flex items-center gap-2">
                <Bus className="w-4 h-4 text-blue-200" />
                <span>Ônibus Urbano Lynx</span>
              </div>
              <h4 className="font-bold text-sm text-[#1A2B4C]">Opção Super Econômica</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Linha 111 e Linha 42 conectam o Aeroporto MCO à International Drive e Disney Springs por apenas <strong>US$ 2.00</strong> a passagem.
              </p>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                🚌 Recomendado para viajantes solo ou mochileiros com orçamento reduzido.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TOLLS GUIDE (VISITOR TOLL PASS) */}
      {activeTab === 'tolls' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
              <CreditCard className="w-4 h-4" />
              <span>Economia Real em Pedágios</span>
            </div>
            <h2 className="text-2xl font-bold font-serif text-[#1A2B4C] mt-1">
              Guia do Visitor Toll Pass no Aeroporto de Orlando (MCO)
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Evite pagar as abusivas taxas diárias das locadoras de carro ($10 a $15/dia). O <strong>Visitor Toll Pass</strong> é uma tag física 100% gratuita disponibilizada pelo governo no próprio aeroporto MCO.
            </p>
          </div>

          {/* 4 Steps Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                1
              </div>
              <h3 className="font-bold text-sm text-[#1A2B4C]">Baixe o App Antes de Viajar</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Baixe o aplicativo oficial <strong>Visitor Toll Pass</strong> no celular, crie sua conta e cadastre um cartão de crédito internacional.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                2
              </div>
              <h3 className="font-bold text-sm text-[#1A2B4C]">Retire no Aeroporto MCO</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                No desembarque do MCO (Terminais A, B ou C), dirija-se à máquina de autoatendimento perto das esteiras de malas e escaneie o QR Code do app para liberar a tag.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                3
              </div>
              <h3 className="font-bold text-sm text-[#1A2B4C]">Pendure no Espelho Retrovisor</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ao retirar o carro alugado, coloque o cartão do Visitor Toll Pass pendurado no espelho retrovisor. Passe direto por todas as faixas "E-PASS / SunPass" sem parar.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                4
              </div>
              <h3 className="font-bold text-sm text-[#1A2B4C]">Devolva nas Caixas do Aeroporto</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                No dia de ir embora, antes de passar pelo raio-x do aeroporto MCO, deposite a tag nas caixas coletoras vermelhas dispostas no terminal.
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h3 className="text-base font-bold text-[#1A2B4C] font-serif">
              Comparativo de Custos de Pedágio na Flórida
            </h3>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1A2B4C] text-white font-serif uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Opção</th>
                    <th className="p-3">Taxa de Adesão</th>
                    <th className="p-3">Valor por Pedágio</th>
                    <th className="p-3">Vantagem Principal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  <tr className="bg-emerald-50/50 font-bold text-emerald-950">
                    <td className="p-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Visitor Toll Pass (MCO)</span>
                    </td>
                    <td className="p-3 text-emerald-700 font-bold">R$ 0,00 (Gratuito)</td>
                    <td className="p-3">Tarifa Oficial com Desconto (Menor Preço)</td>
                    <td className="p-3">Sem nenhuma taxa diária da locadora. Tag física no retrovisor.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold">Tag da Locadora (Alamo/Avis/Hertz)</td>
                    <td className="p-3 text-rose-600 font-bold">US$ 4.95 a 11.95 por DIA</td>
                    <td className="p-3">Tarifa Cheia sem Desconto</td>
                    <td className="p-3 text-slate-600">Prático, porém muito caro para viagens longas de 10-14 dias.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold">SunPass Proprio (Comprar no Target/Publix)</td>
                    <td className="p-3">US$ 4.99 (Comprar o adesivo)</td>
                    <td className="p-3">Tarifa Oficial com Desconto</td>
                    <td className="p-3 text-slate-600">Útil caso desembarque em Miami (MIA) ou Tampa (TPA).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TRAFFIC RULES */}
      {activeTab === 'traffic_rules' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
              <Compass className="w-4 h-4" />
              <span>Segurança na Estrada</span>
            </div>
            <h2 className="text-2xl font-bold font-serif text-[#1A2B4C] mt-1">
              Regras Importantes de Trânsito para Dirigir na Flórida
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Dirigir nos Estados Unidos é muito tranquilo e organizado. Confira as regras principais para não cometer infrações e ter uma viagem perfeita.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-sm text-[#1A2B4C] flex items-center gap-2 font-serif">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                CNH Brasileira Válida + Passaporte
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Você pode dirigir legalmente na Flórida usando sua <strong>CNH brasileira física ou digital ativa</strong> juntamente com o seu passaporte. A Permissão Internacional para Dirigir (PID) é recomendada, mas não é obrigatória para turismo.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-sm text-[#1A2B4C] flex items-center gap-2 font-serif">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                Conversão à Direita no Sinal Vermelho
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Na Flórida, é permitido virar à direita no semáforo vermelho, <strong>desde que você pare totalmente o veículo primeiro</strong>, verifique se não há pedestres ou carros passando, e que não haja uma placa dizendo "NO TURN ON RED".
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-sm text-[#1A2B4C] flex items-center gap-2 font-serif">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                Assento Infantil & Cadeirinhas (Car Seat / Booster)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                É obrigatório o uso de assentos especiais por idade: bebês até 3 anos usam bebê conforto/cadeira; crianças de 4 e 5 anos usam assento de elevação (booster). A fiscalização é rigorosa.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-sm text-[#1A2B4C] flex items-center gap-2 font-serif">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                Como Abastecer nos Postos (Gasoline Unleaded 87)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Os postos são autoatendimento (Pay First). Pague primeiro no caixa informando o número da bomba e o valor desejado em dólares. A gasolina padrão para carros alugados é a <strong>Regular Unleaded (87)</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CAR RENTAL */}
      {isModalOpen && (
        <div
          onClick={handleRentalModalBackdrop}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200 overflow-hidden"
        >
          <div className="bg-white rounded-3xl max-w-5xl w-full p-0 flex flex-col shadow-2xl h-[90vh] max-h-[92vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    {editingRental ? 'Edição de Aluguel' : 'Novo Aluguel de Veículo'} • Transporte & Mobilidade
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    {editingRental ? 'Editar Contrato de Locação' : 'Cadastrar Novo Aluguel de Veículo'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                {/* Validation Error Banner */}
                {validationError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start justify-between gap-3 animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{validationError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setValidationError(null)}
                      className="text-rose-500 hover:text-rose-700 cursor-pointer p-0.5 rounded-md hover:bg-rose-100"
                      aria-label="Fechar alerta de erro"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* 1. DADOS DA LOCAÇÃO, VEÍCULO & CONDUTOR */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    1. Dados da Locação, Veículo & Condutor
                  </label>
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                          Empresa Locadora <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                          placeholder="Ex: Alamo, Hertz, Avis, Sixt..."
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                          required
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {['Alamo', 'Hertz', 'Avis', 'Sixt', 'Budget', 'National'].map((comp) => (
                            <button
                              key={comp}
                              type="button"
                              onClick={() => setFormData({ ...formData, company: comp })}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer border ${
                                formData.company === comp
                                  ? 'bg-[#1A2B4C] text-white border-[#1A2B4C]'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#1A2B4C]'
                              }`}
                            >
                              {comp}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Código da Reserva / PNR / Voucher
                        </label>
                        <input
                          type="text"
                          value={formData.confirmationCode || ''}
                          onChange={(e) => setFormData({ ...formData, confirmationCode: e.target.value.toUpperCase() })}
                          placeholder="Ex: ALM-983142"
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                          Categoria do Veículo <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          placeholder="Ex: Minivan 7 Lugares, SUV Grande, Sedan Intermediário..."
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Status Operacional da Reserva
                        </label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs cursor-pointer"
                        >
                          <option value="Reservado / Confirmado">✅ Reservado / Confirmado</option>
                          <option value="Confirmado">📋 Confirmado</option>
                          <option value="Check-in Realizado">🔑 Check-in / Retirado</option>
                          <option value="Em Andamento">🚗 Em Andamento</option>
                          <option value="Concluído">🏁 Concluído / Devolvido</option>
                          <option value="Cancelado">❌ Cancelado</option>
                        </select>
                        <span className="text-[10px] text-slate-400 block">
                          Status da operação do veículo (independente do pagamento).
                        </span>
                      </div>
                    </div>

                    {/* Condutor Principal com campo próprio e distinção clara do pagador */}
                    <div className="pt-3 border-t border-slate-200/80 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                          <span>Condutor Principal (Motorista Habilitado)</span>
                        </label>
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                          ⚠️ O condutor dirige o carro; o pagador é definido na seção de Custos & Pagamento.
                        </span>
                      </div>
                      <input
                        type="text"
                        value={formData.driverName || ''}
                        onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                        placeholder="Ex: Nome Completo do Motorista Principal"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                      />
                      {settings.travelers && settings.travelers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-semibold text-slate-400 mr-1">Preencher com viajante:</span>
                          {settings.travelers.map((trv) => {
                            const isSelected = formData.driverName === trv.name;
                            return (
                              <button
                                key={trv.id}
                                type="button"
                                onClick={() => setFormData({ ...formData, driverName: trv.name })}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer border ${
                                  isSelected
                                    ? 'bg-[#1A2B4C] text-white border-[#1A2B4C]'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-[#1A2B4C]'
                                }`}
                              >
                                👤 {trv.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. RETIRADA (PICK-UP) */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    2. Retirada (Pick-up)
                  </label>
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                          Data de Retirada <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="date"
                            value={formData.pickupDate}
                            onChange={(e) => setFormData({ ...formData, pickupDate: e.target.value })}
                            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs cursor-pointer"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                          Horário de Retirada
                        </label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="time"
                            value={formData.pickupTime}
                            onChange={(e) => setFormData({ ...formData, pickupTime: e.target.value })}
                            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Local de Retirada
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={formData.pickupLocation}
                          onChange={(e) => setFormData({ ...formData, pickupLocation: e.target.value })}
                          placeholder="Ex: Aeroporto de Orlando (MCO) - Terminal Principal"
                          className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {[
                          'Aeroporto de Orlando (MCO)',
                          'Aeroporto de Miami (MIA)',
                          'Aeroporto de Tampa (TPA)',
                          'Disney Car Care Center',
                        ].map((loc) => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => setFormData({ ...formData, pickupLocation: loc })}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer border ${
                              formData.pickupLocation === loc
                                ? 'bg-[#1A2B4C] text-white border-[#1A2B4C]'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-[#1A2B4C]'
                            }`}
                          >
                            📍 {loc}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. DEVOLUÇÃO (DROP-OFF) */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    3. Devolução (Drop-off)
                  </label>
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                          Data de Devolução <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="date"
                            value={formData.dropoffDate}
                            onChange={(e) => setFormData({ ...formData, dropoffDate: e.target.value })}
                            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs cursor-pointer"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                          Horário de Devolução
                        </label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="time"
                            value={formData.dropoffTime}
                            onChange={(e) => setFormData({ ...formData, dropoffTime: e.target.value })}
                            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 block">
                          Local de Devolução
                        </label>
                        {formData.pickupLocation && (
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, dropoffLocation: formData.pickupLocation })}
                            className="text-[11px] font-bold text-[#1A2B4C] hover:text-[#D4AF37] cursor-pointer flex items-center gap-1"
                          >
                            🔄 Mesmo local da retirada
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={formData.dropoffLocation}
                          onChange={(e) => setFormData({ ...formData, dropoffLocation: e.target.value })}
                          placeholder="Ex: Aeroporto de Orlando (MCO)"
                          className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {[
                          'Aeroporto de Orlando (MCO)',
                          'Aeroporto de Miami (MIA)',
                          'Aeroporto de Tampa (TPA)',
                        ].map((loc) => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => setFormData({ ...formData, dropoffLocation: loc })}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer border ${
                              formData.dropoffLocation === loc
                                ? 'bg-[#1A2B4C] text-white border-[#1A2B4C]'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-[#1A2B4C]'
                            }`}
                          >
                            📍 {loc}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. SEGUROS & PEDÁGIOS */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    4. Seguros & Pedágios
                  </label>
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-2">
                        Coberturas de Seguro Incluídas
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          'CDW / LDW (Proteção contra Colisão e Roubo)',
                          'SLI / ALI (Proteção contra Terceiros)',
                          'PAI / PEC (Proteção contra Acidentes Pessoais)',
                          'Assistência Rodoviária 24h',
                        ].map((ins) => {
                          const isChecked = formData.includedInsurances?.includes(ins);
                          return (
                            <label
                              key={ins}
                              className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors cursor-pointer text-xs font-medium ${
                                isChecked
                                  ? 'bg-white border-[#1A2B4C] text-slate-900 shadow-2xs'
                                  : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const current = formData.includedInsurances || [];
                                  const updated = e.target.checked
                                    ? [...current, ins]
                                    : current.filter((i) => i !== ins);
                                  setFormData({ ...formData, includedInsurances: updated });
                                }}
                                className="w-4 h-4 rounded text-[#1A2B4C] focus:ring-[#1A2B4C]"
                              />
                              <span>{ins}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80 space-y-2">
                      <label className="text-xs font-bold text-slate-700 block">Opção de Pedágio</label>
                      <select
                        value={formData.tollOption}
                        onChange={(e) => setFormData({ ...formData, tollOption: e.target.value })}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs cursor-pointer"
                      >
                        <option value="Visitor Toll Pass (Gratuito MCO)">Visitor Toll Pass (Gratuito MCO - Recomendado)</option>
                        <option value="Tag da Locadora">Tag da Locadora (SunPass / E-Toll com taxa diária)</option>
                        <option value="SunPass Próprio">SunPass Próprio (Comprado no Walgreens/Publix)</option>
                        <option value="Pagar na Faixa">Pagar na Faixa / Toll-By-Plate</option>
                      </select>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        💡 <strong>Dica de Economia:</strong> No aeroporto MCO você pode retirar a tag gratuita do <strong>Visitor Toll Pass</strong> e pagar somente o valor oficial dos pedágios sem taxa de serviço da locadora.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5. PARTICIPANTES / VIAJANTES DO VEÍCULO (Imediatamente antes de Custos & Pagamento) */}
                <TravelerSelector
                  label="5. Participantes / Viajantes do Veículo"
                  travelers={settings.travelers || []}
                  selectedIds={formData.travelerIds || ['all']}
                  onChange={(ids) => setFormData((prev) => ({ ...prev, travelerIds: ids }))}
                />

                {/* 6. CUSTOS & PAGAMENTO (Reutiliza PaymentSection no modo total) */}
                <PaymentSection
                  sectionNumber={6}
                  sectionTitle="CUSTOS & PAGAMENTO"
                  pricingMode="total"
                  dollarRate={settings.dollarRate || 5.75}
                  unitCostUSD={participantCount > 0 && formData.costUSD ? formData.costUSD / participantCount : null}
                  unitCostBRL={participantCount > 0 && formData.costBRL ? formData.costBRL / participantCount : null}
                  totalCostUSD={formData.costUSD !== undefined && formData.costUSD !== null ? formData.costUSD : null}
                  totalCostBRL={formData.costBRL !== undefined && formData.costBRL !== null ? formData.costBRL : null}
                  onChangeCosts={(_unitUSD, _unitBRL, totalUSD, totalBRL) => {
                    setFormData((prev) => ({
                      ...prev,
                      costUSD: totalUSD ?? 0,
                      costBRL: totalBRL ?? 0,
                    }));
                  }}
                  paymentStatus={formData.paymentStatus || 'Não informado'}
                  onChangePaymentStatus={(status: PaymentStatusType) => {
                    setFormData((prev) => ({
                      ...prev,
                      paymentStatus: status,
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
                  selectedTravelerIds={formData.travelerIds || ['all']}
                  passengerCount={participantCount}
                  passengerLabel="passageiro"
                  unitLabelUSD="Valor Total da Locação (US$)"
                  unitLabelBRL="Valor Total da Locação (R$)"
                  summaryTitle="Resumo da Locação para "
                  fixedCostDescription="Valor total fixo da locação do veículo (não multiplicado pelo nº de passageiros)"
                  showPayerSelector={true}
                />

                {/* 7. OBSERVAÇÕES & INSTRUÇÕES */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    7. Observações & Instruções
                  </label>
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-2">
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      placeholder="Ex: Skip the Counter ativado no app da locadora. Retirar veículo direto na garagem sem passar pelo balcão."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                {editingRental ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setRentalToDelete(editingRental);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    title="Excluir este aluguel"
                    aria-label={`Excluir aluguel de ${editingRental.company}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Excluir Aluguel</span>
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
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
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



      {/* MODAL: CONFIRM DELETE CAR RENTAL */}
      {rentalToDelete && (
        <div
          onClick={() => setRentalToDelete(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Excluir Aluguel de Carro?</h3>
                <p className="text-xs text-slate-500">Esta ação removerá o veículo cadastrado.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{rentalToDelete.company}</span>
              </div>
              <p className="text-slate-600 font-medium">{rentalToDelete.category}</p>
              {rentalToDelete.confirmationCode && (
                <p className="text-slate-400 font-mono text-[11px]">Reserva: #{rentalToDelete.confirmationCode}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRentalToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCarRental(rentalToDelete.id);
                  setRentalToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
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

export default TransportationView;
