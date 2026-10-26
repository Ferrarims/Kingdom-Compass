import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  MapPin,
  Utensils,
  Moon,
  Flame,
  Search,
  CheckCircle2,
  Waves,
  Rocket,
  TreePine,
  Filter,
  Calendar,
  Zap,
  Ticket,
  Clock,
  Plus,
  ArrowRight,
  ArrowLeftRight,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Edit3,
  CalendarDays,
  ShieldCheck,
  Building2,
  Trash2,
  Info,
  DollarSign,
  Layers,
  Users,
  CreditCard,
  Receipt,
  FileCheck,
  FileText,
  Tag,
  Camera,
  Eye,
} from 'lucide-react';
import { PARKS_GUIDE_DATA } from '../data/initialData';
import { ParkInfo, ItineraryDay, ParkTicketPurchase } from '../types';
import { isDayWithPark, clearParkReferencesFromDay } from '../utils/parkScheduleUtils';
import { usePlanner, formatDisplayDate } from '../context/PlannerContext';
import { ParkBookingModal } from './ParkBookingModal';
import { ParkTicketModal } from './ParkTicketModal';
import { SwapParkDayModal } from './SwapParkDayModal';
import { LogisticsCardHeader } from './LogisticsCardHeader';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { isAttractionMatch, normalizeAttractionName } from '../utils/attractionUtils';
import { AttractionComparisonModal } from './AttractionComparisonModal';
import { getRealPhotoPackagesList, getPhotoPackageForDay } from '../utils/photoPackageUtils';
import {
  getAttractionImage,
  getRestaurantImage,
  getParkCoverImage
} from '../data/attractionImages';
import { AttractionPhotoModal, PhotoModalItem } from './AttractionPhotoModal';

export const ParksGuideView: React.FC = () => {
  const {
    itineraryDays,
    updateItineraryDay,
    swapOrMoveParkDay,
    parkTickets,
    addParkTicket,
    updateParkTicket,
    deleteParkTicket,
    settings,
    financialSummary,
    currencyView,
    activeTripId,
    attractionSelections,
    toggleAttractionSelection,
    openOverviewModal,
    expenses = [],
    evaluateAndCorrectAllItems,
  } = usePlanner();

  const dollarRate = settings.dollarRate || 5.75;

  const tripPhotoPackages = useMemo(() => {
    return getRealPhotoPackagesList(itineraryDays, expenses, parkTickets);
  }, [itineraryDays, expenses, parkTickets]);

  const getTicketPackageName = (ticketTypeIdOrName?: string) => {
    if (!ticketTypeIdOrName) return '';
    const found = parkTickets.find(
      (t) => t.id === ticketTypeIdOrName || t.title === ticketTypeIdOrName
    );
    return found ? found.title : ticketTypeIdOrName;
  };

  // Top Sub Tabs: 'schedule' (Parques da Minha Viagem) vs 'tickets' (Ingressos & Combos) vs 'guide' (Guia Oficial dos 17 Parques)
  const [activeMainTab, setActiveMainTab] = useState<'schedule' | 'tickets' | 'guide'>('schedule');
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState<boolean>(false);
  const [isAllExpanded, setIsAllExpanded] = useState<boolean>(true);

  // Filter & Search states for Guia
  const [selectedResort, setSelectedResort] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeParkId, setActiveParkId] = useState<string>(PARKS_GUIDE_DATA[0].id);

  // Modal states for park day booking / registration
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingModalDay, setBookingModalDay] = useState<ItineraryDay | null>(null);
  const [preselectedParkName, setPreselectedParkName] = useState<string | undefined>(undefined);
  const [bookingModalInitialTab, setBookingModalInitialTab] = useState<'general' | 'fastpass' | 'dining' | 'shows' | 'photos'>('general');
  const [dayParkToDelete, setDayParkToDelete] = useState<{ dayId: string; dayNumber: number; parkName: string } | null>(null);

  // Modal states for swapping / moving park days
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapSourceDay, setSwapSourceDay] = useState<ItineraryDay | null>(null);

  const handleOpenSwapModal = (day: ItineraryDay) => {
    setSwapSourceDay(day);
    setIsSwapModalOpen(true);
  };

  // Modal states for ticket purchase registration
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketToEdit, setTicketToEdit] = useState<ParkTicketPurchase | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<ParkTicketPurchase | null>(null);

  // Photo Lightbox Modal State
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState<boolean>(false);
  const [selectedPhotoItem, setSelectedPhotoItem] = useState<PhotoModalItem | null>(null);

  const openPhotoModal = (item: PhotoModalItem) => {
    setSelectedPhotoItem(item);
    setIsPhotoModalOpen(true);
  };

  // Keyboard accessibility: Enter to confirm, Esc to cancel
  useConfirmationKeyboard({
    isOpen: !!dayParkToDelete,
    onConfirm: () => {
      if (dayParkToDelete) {
        updateItineraryDay(dayParkToDelete.dayId, {
          park: 'Sem Parque',
          parkBooking: undefined,
        });
        setDayParkToDelete(null);
      }
    },
    onCancel: () => setDayParkToDelete(null),
  });

  useConfirmationKeyboard({
    isOpen: !!ticketToDelete,
    onConfirm: async () => {
      if (ticketToDelete) {
        const res = await deleteParkTicket(ticketToDelete.id);
        if (res && !res.success) {
          return;
        }
        setTicketToDelete(null);
      }
    },
    onCancel: () => setTicketToDelete(null),
  });

  // Selected filter for My Trip Schedule (only for days with parks)
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'fastpass' | 'dining' | 'shows' | 'photos'>('all');

  // Filter for Tickets tab
  const [ticketFilterComplex, setTicketFilterComplex] = useState<string>('all');

  // Group counts for guide
  const disneyCount = useMemo(() => PARKS_GUIDE_DATA.filter((p) => p.resort === 'Walt Disney World').length, []);
  const universalCount = useMemo(() => PARKS_GUIDE_DATA.filter((p) => p.resort === 'Universal Orlando Resort').length, []);
  const seaworldCount = useMemo(() => PARKS_GUIDE_DATA.filter((p) => p.resort === 'SeaWorld Parks & Entertainment').length, []);
  const outrosCount = useMemo(() => PARKS_GUIDE_DATA.filter((p) => p.resort === 'Outros Parques & Experiências' || p.resort === 'Outros').length, []);

  const filteredParks = useMemo(() => {
    return PARKS_GUIDE_DATA.filter((p) => {
      const matchResort =
        selectedResort === 'all' ||
        p.resort === selectedResort ||
        (selectedResort === 'Outros Parques & Experiências' && (p.resort === 'Outros Parques & Experiências' || p.resort === 'Outros'));

      const matchType = selectedType === 'all' || p.parkType === selectedType;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.mustDoAttractions.some((a) => a.toLowerCase().includes(q)) ||
        p.bestDining.some((d) => d.toLowerCase().includes(q)) ||
        p.proTips.some((t) => t.toLowerCase().includes(q));

      return matchResort && matchType && matchSearch;
    });
  }, [selectedResort, selectedType, searchQuery]);

  const activePark =
    filteredParks.find((p) => p.id === activeParkId) ||
    filteredParks[0] ||
    PARKS_GUIDE_DATA[0];

  // Filtered days that ACTUALLY have a park assigned (Strictly hiding days without a park)
  const tripDaysWithParks = useMemo(() => {
    return itineraryDays.filter(isDayWithPark);
  }, [itineraryDays]);

  const totalFastPasses = useMemo(() => {
    return tripDaysWithParks.reduce((acc, d) => acc + (d.parkBooking?.fastPasses?.length || 0), 0);
  }, [tripDaysWithParks]);

  const totalDiningReservations = useMemo(() => {
    return tripDaysWithParks.reduce((acc, d) => acc + (d.parkBooking?.diningReservations?.length || 0), 0);
  }, [tripDaysWithParks]);

  const totalShowsScheduled = useMemo(() => {
    return tripDaysWithParks.reduce((acc, d) => acc + (d.parkBooking?.showsAndParades?.length || 0), 0);
  }, [tripDaysWithParks]);

  // Ticket totals calculations
  const totalTicketsCostUSD = useMemo(() => {
    return (parkTickets || []).reduce((sum, t) => {
      if (t.costUSD) return sum + t.costUSD;
      if (t.costBRL) return sum + t.costBRL / dollarRate;
      return sum;
    }, 0);
  }, [parkTickets, dollarRate]);

  const totalTicketsCostBRL = useMemo(() => {
    return (parkTickets || []).reduce((sum, t) => {
      if (t.costBRL) return sum + t.costBRL;
      if (t.costUSD) return sum + t.costUSD * dollarRate;
      return sum;
    }, 0);
  }, [parkTickets, dollarRate]);

  const filteredTickets = useMemo(() => {
    if (ticketFilterComplex === 'all') return parkTickets || [];
    return (parkTickets || []).filter((t) => t.complex === ticketFilterComplex);
  }, [parkTickets, ticketFilterComplex]);

  // Quick Match Park Helper
  const getParkGuideInfo = (parkName: string) => {
    return PARKS_GUIDE_DATA.find((p) => parkName.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(parkName.toLowerCase()));
  };

  // Open modal to register a park to a day
  const handleOpenRegisterModal = (
    targetDay?: ItineraryDay,
    targetParkName?: string,
    initialTab: 'general' | 'fastpass' | 'dining' | 'shows' | 'photos' = 'general'
  ) => {
    if (targetDay) {
      setBookingModalDay(targetDay);
    } else {
      const dayWithoutPark = itineraryDays.find((d) => !isDayWithPark(d));
      setBookingModalDay(dayWithoutPark || itineraryDays[0] || null);
    }
    setPreselectedParkName(targetParkName);
    setBookingModalInitialTab(initialTab);
    setIsBookingModalOpen(true);
  };

  const handleUnlinkParkFromDay = (dayId: string, dayNumber: number, parkName: string) => {
    setDayParkToDelete({
      dayId,
      dayNumber,
      parkName,
    });
  };

  // Ticket Modal Handlers
  const handleOpenNewTicketModal = () => {
    setTicketToEdit(null);
    setIsTicketModalOpen(true);
  };

  const handleOpenEditTicketModal = (ticket: ParkTicketPurchase) => {
    setTicketToEdit(ticket);
    setIsTicketModalOpen(true);
  };

  const handleSaveTicket = async (ticketData: Omit<ParkTicketPurchase, 'id'>, editId?: string) => {
    if (editId) {
      return await updateParkTicket(editId, ticketData);
    } else {
      return await addParkTicket(ticketData);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header Banner with Internal KPI Summary Cards */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
              <span>Gestão de Ingressos, Atrações & Dining</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight">
              Parques e Ingressos de Orlando
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Cadastre suas <strong>compras de ingressos</strong> (individuais ou combos multi-dias/parques) com sincronização financeira automática. 
              Organize os dias de parque, <strong>Fast Pass (Lightning Lane / Express)</strong>, reservas de <strong>almoço com personagens</strong> e consulte o guia estratégico dos 17 parques.
            </p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end justify-center gap-2.5 self-end lg:self-auto ml-auto w-full sm:w-auto">
            {/* Button 0: Visão Geral */}
            <button
              type="button"
              id="btn-overview-parks"
              onClick={() => openOverviewModal('parks')}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto whitespace-nowrap"
              title="Abrir Visão Geral de Parques e Ingressos"
            >
              <Eye className="w-4 h-4 text-[#1A2B4C]" />
              <span>Visão Geral</span>
            </button>

            {/* Button 1: Cadastrar Compra de Ingresso */}
            <button
              onClick={handleOpenNewTicketModal}
              id="btn-cadastrar-ingresso-header"
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-[#1A2B4C]" />
              <span>Cadastrar Compra de Ingresso</span>
            </button>

            {/* Button 2: Agendar Parque no Dia */}
            <button
              onClick={() => handleOpenRegisterModal()}
              id="btn-agendar-parque-dia-header"
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-[#1A2B4C]" />
              <span>Agendar Parque no Dia</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards inside Header Blue Box */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-white relative z-10">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                Ingressos / Combos
              </span>
              <Ticket className="w-3.5 h-3.5 text-[#D4AF37]" />
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-[#D4AF37] block mt-1">
              {(parkTickets || []).length} {(parkTickets || []).length === 1 ? 'pacote' : 'pacotes'}
            </span>
            <span className="text-[10px] text-slate-300 block mt-0.5">
              ≈ R$ {totalTicketsCostBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                Dias de Parque
              </span>
              <Calendar className="w-3.5 h-3.5 text-blue-300" />
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-white block mt-1">
              {tripDaysWithParks.length} {tripDaysWithParks.length === 1 ? 'dia' : 'dias'}
            </span>
            <span className="text-[10px] text-slate-300 block mt-0.5">Agendados no roteiro</span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                Fast Pass / LL
              </span>
              <Zap className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-white block mt-1">
              {totalFastPasses} agendados
            </span>
            <span className="text-[10px] text-slate-300 block mt-0.5">Atrações sem fila</span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                Dining & Shows
              </span>
              <Utensils className="w-3.5 h-3.5 text-rose-300" />
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-white block mt-1">
              {totalDiningReservations + totalShowsScheduled} reservas
            </span>
            <span className="text-[10px] text-slate-300 block mt-0.5">Restaurantes e espetáculos</span>
          </div>
        </div>
      </div>



      {/* Main Mode Toggle: Roteiro x Ingressos Comprados x Guia Oficial */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <button
            onClick={() => setActiveMainTab('schedule')}
            id="tab-schedule-parks"
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainTab === 'schedule'
                ? 'bg-[#1A2B4C] text-white shadow-sm ring-2 ring-[#D4AF37]/40'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Calendar className="w-4 h-4 text-[#D4AF37]" />
            <span>📅 Parques da Minha Viagem ({tripDaysWithParks.length})</span>
          </button>

          <button
            onClick={() => setActiveMainTab('tickets')}
            id="tab-tickets-manager"
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainTab === 'tickets'
                ? 'bg-[#1A2B4C] text-white shadow-sm ring-2 ring-[#D4AF37]/40'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Ticket className="w-4 h-4 text-[#D4AF37]" />
            <span>🎟️ Ingressos & Combos Comprados ({(parkTickets || []).length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: PARQUES E RESERVAS DA MINHA VIAGEM (APENAS DIAS COM PARQUE)        */}
      {/* ========================================================================= */}
      {activeMainTab === 'schedule' && (
        <div className="space-y-6">
          {/* Filter Bar for Parks */}
          {tripDaysWithParks.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2 hidden sm:inline">
                  Filtrar Parques:
                </span>
                <button
                  onClick={() => setScheduleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    scheduleFilter === 'all'
                      ? 'bg-[#1A2B4C] text-white shadow-2xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Todos os Parques ({tripDaysWithParks.length})
                </button>
                <button
                  onClick={() => setScheduleFilter('fastpass')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    scheduleFilter === 'fastpass'
                      ? 'bg-[#1A2B4C] text-white shadow-2xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ⚡ Com Fast Pass ({tripDaysWithParks.filter((d) => (d.parkBooking?.fastPasses?.length || 0) > 0).length})
                </button>
                <button
                  onClick={() => setScheduleFilter('dining')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    scheduleFilter === 'dining'
                      ? 'bg-[#1A2B4C] text-white shadow-2xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  🍽️ Com Reserva Dining ({tripDaysWithParks.filter((d) => (d.parkBooking?.diningReservations?.length || 0) > 0).length})
                </button>
                <button
                  onClick={() => setScheduleFilter('shows')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    scheduleFilter === 'shows'
                      ? 'bg-[#1A2B4C] text-white shadow-2xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  🎆 Com Shows ({tripDaysWithParks.filter((d) => (d.parkBooking?.showsAndParades?.length || 0) > 0).length})
                </button>
                <button
                  onClick={() => setScheduleFilter('photos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    scheduleFilter === 'photos'
                      ? 'bg-purple-700 text-white shadow-2xs'
                      : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                  }`}
                >
                  📸 Com Pacote Fotos ({tripDaysWithParks.filter((d) => Boolean(getPhotoPackageForDay(d, tripPhotoPackages))).length})
                </button>
              </div>
            </div>
          )}

          {/* Empty State when no days have parks assigned */}
          {tripDaysWithParks.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-2xs space-y-4">
              <div className="w-16 h-16 bg-[#1A2B4C]/5 text-[#1A2B4C] rounded-2xl flex items-center justify-center mx-auto border border-slate-200">
                <Ticket className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-lg font-bold font-serif text-[#1A2B4C]">
                  Nenhum parque agendado ainda
                </h3>
                <p className="text-xs sm:text-sm text-slate-500">
                  Vincule seus parques aos dias de viagem para começar a planejar FastPass (Lightning Lane), reservas de restaurantes temáticos e shows de fogos.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => handleOpenRegisterModal()}
                  className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer transform hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4 text-[#1A2B4C]" />
                  <span>Agendar Primeiro Parque</span>
                </button>
              </div>
            </div>
          ) : (
            /* Cards List of Days with Parks */
            <div className="grid grid-cols-1 gap-6">
              {tripDaysWithParks
                .filter((day) => {
                  if (scheduleFilter === 'fastpass') return (day.parkBooking?.fastPasses?.length || 0) > 0;
                  if (scheduleFilter === 'dining') return (day.parkBooking?.diningReservations?.length || 0) > 0;
                  if (scheduleFilter === 'shows') return (day.parkBooking?.showsAndParades?.length || 0) > 0;
                  if (scheduleFilter === 'photos') return Boolean(getPhotoPackageForDay(day, tripPhotoPackages));
                  return true;
                })
                .map((day) => {
                  const guideInfo = getParkGuideInfo(day.park);
                  const pb = day.parkBooking;
                  const dayPhotoPkg = getPhotoPackageForDay(day, tripPhotoPackages);

                  return (
                    <div
                      key={day.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden hover:shadow-md transition-all group"
                    >
                      {/* Park Card Header Standardized */}
                      <LogisticsCardHeader
                        icon={
                          <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex flex-col items-center justify-center shrink-0">
                            <span className="text-[9px] font-bold uppercase text-[#D4AF37]">DIA</span>
                            <span className="text-base font-black text-white leading-none font-mono">
                              {day.dayNumber}
                            </span>
                          </div>
                        }
                        categoryLabel={`DIA ${day.dayNumber} • ${guideInfo?.resort || 'Parque Temático'}`}
                        status={pb?.parkPassStatus || 'Confirmado no App'}
                        title={day.park}
                        subtitle={
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>{formatDisplayDate(day.date)}</span>
                            {pb?.ticketType && (
                              <span className="text-[#D4AF37] font-semibold text-[11px]">
                                • {getTicketPackageName(pb.ticketType)}
                              </span>
                            )}
                          </span>
                        }
                        confirmationCodes={pb?.confirmationCode}
                        codeLabel="Voucher / Confirmação"
                        extraBadges={
                          dayPhotoPkg ? (
                            <span
                              onClick={() => handleOpenRegisterModal(day, day.park, 'photos')}
                              className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/40 flex items-center gap-1 cursor-pointer hover:bg-purple-500/50 transition-colors"
                              title="Clique para gerenciar o Pacote de Fotos"
                            >
                              <Camera className="w-3 h-3 text-purple-300" />
                              <span>PhotoPass / Fotos</span>
                            </span>
                          ) : undefined
                        }
                        extraActions={
                          <button
                            type="button"
                            onClick={() => handleOpenSwapModal(day)}
                            className="px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                            title="Trocar parque de dia ou permutar com outro dia"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5 text-[#1A2B4C]" />
                            <span>Trocar Dia</span>
                          </button>
                        }
                        onEdit={() => handleOpenRegisterModal(day, day.park)}
                        editLabel="Editar Reservas"
                        editTitle="Editar reservas deste parque"
                        onDelete={() => handleUnlinkParkFromDay(day.id, day.dayNumber, day.park)}
                        deleteLabel="Desvincular"
                        deleteTitle="Desvincular parque deste dia"
                      />

                      {/* Card Body - 4 Functional Blocks */}
                      <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-700 bg-slate-50/50">
                        {/* Block 1: Park Hours & Rope Drop Strategy */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                          <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-100 pb-2">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span>Horários & Rope Drop</span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-slate-600">
                              <span>Abertura Oficial:</span>
                              <strong className="text-slate-900 font-mono">
                                {pb?.parkHours?.openingTime || (guideInfo ? '09:00' : '09:00')}
                              </strong>
                            </div>
                            <div className="flex justify-between items-center text-slate-600">
                              <span>Encerramento:</span>
                              <strong className="text-slate-900 font-mono">
                                {pb?.parkHours?.closingTime || (guideInfo ? '21:00' : '21:00')}
                              </strong>
                            </div>
                            {pb?.parkHours?.earlyEntryTime && (
                              <div className="flex justify-between items-center text-emerald-700 font-semibold">
                                <span>Early Entry (Hóspedes):</span>
                                <strong className="font-mono">{pb.parkHours.earlyEntryTime}</strong>
                              </div>
                            )}
                          </div>
                          {pb?.ropeDropPlan && (
                            <div className="pt-2 border-t border-slate-100">
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                Estratégia de Chegada:
                              </span>
                              <p className="text-[11px] text-slate-700 italic mt-0.5 leading-tight">
                                "{pb.ropeDropPlan}"
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Block 2: Fast Pass / Lightning Lane */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                              <Zap className="w-4 h-4 text-amber-500" />
                              <span>Fast Pass ({pb?.fastPasses?.length || 0})</span>
                            </div>
                            <button
                              onClick={() => handleOpenRegisterModal(day, day.park, 'fastpass')}
                              className="text-[10px] text-amber-700 font-bold hover:underline cursor-pointer"
                            >
                              + Adicionar
                            </button>
                          </div>
                          {(!pb?.fastPasses || pb.fastPasses.length === 0) ? (
                            <p
                              onClick={() => handleOpenRegisterModal(day, day.park, 'fastpass')}
                              className="text-[11px] text-slate-400 italic py-2 cursor-pointer hover:text-amber-700 transition-colors"
                              title="Clique para agendar Fast Pass"
                            >
                              Nenhuma atração sem fila agendada para este dia.
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                              {pb.fastPasses.map((fp) => {
                                const passTypeTitle = (fp.type && fp.type.trim()) ? fp.type.trim() : 'Fast Pass';

                                // Extract scheduled attractions or fallback legacy
                                const reservationsList: Array<{ attractionName: string; timeWindow?: string }> = [];
                                if (fp.attractionReservations && fp.attractionReservations.length > 0) {
                                  fp.attractionReservations.forEach((res) => {
                                    const name = (res.attractionName || '').trim();
                                    const time = (res.timeWindow || (res as any).timeSlot || '').trim();
                                    if (name) {
                                      reservationsList.push({ attractionName: name, timeWindow: time });
                                    }
                                  });
                                } else if (fp.attractionName && fp.attractionName.trim()) {
                                  const time = (fp.timeWindow || (fp as any).timeSlot || '').trim();
                                  reservationsList.push({ attractionName: fp.attractionName.trim(), timeWindow: time });
                                }

                                const isReservationRequired = fp.reservationRequired !== false;

                                return (
                                  <div
                                    key={fp.id}
                                    onClick={() => handleOpenRegisterModal(day, day.park, 'fastpass')}
                                    className="p-2 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px] cursor-pointer hover:bg-amber-100/90 transition-colors space-y-1"
                                    title="Clique para gerenciar Fast Pass"
                                  >
                                    {/* Header: Pass Type in Bold / Highlight */}
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-amber-950 text-[11px] truncate">
                                        ⚡ {passTypeTitle}
                                      </span>
                                      {fp.chargeMode === 'hotel_courtesy' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200/80 text-amber-900 shrink-0">
                                          Cortesia
                                        </span>
                                      )}
                                      {fp.chargeMode === 'free' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                          Gratuito
                                        </span>
                                      )}
                                    </div>

                                    {/* Attractions / Reservation Status Details */}
                                    {!isReservationRequired ? (
                                      <p className="text-[10px] text-amber-700/90 italic font-medium">
                                        Sem agendamento individual
                                      </p>
                                    ) : reservationsList.length === 0 ? (
                                      <p className="text-[10px] text-amber-700/80 italic font-medium">
                                        Ainda sem atrações agendadas
                                      </p>
                                    ) : (
                                      <div className="space-y-0.5 pt-0.5 border-t border-amber-200/50">
                                        {reservationsList.map((res, idx) => (
                                          <div key={idx} className="flex items-center justify-between gap-1 text-[10px]">
                                            <span className="text-amber-900 font-medium truncate">
                                              • {res.attractionName}
                                            </span>
                                            {res.timeWindow && (
                                              <span className="font-mono text-amber-800 font-bold shrink-0">
                                                {res.timeWindow}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Block 3: Dining Reservations */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                              <Utensils className="w-4 h-4 text-rose-500" />
                              <span>Dining ({pb?.diningReservations?.length || 0})</span>
                            </div>
                            <button
                              onClick={() => handleOpenRegisterModal(day, day.park, 'dining')}
                              className="text-[10px] text-rose-700 font-bold hover:underline cursor-pointer"
                            >
                              + Adicionar
                            </button>
                          </div>
                          {(!pb?.diningReservations || pb.diningReservations.length === 0) ? (
                            <p
                              onClick={() => handleOpenRegisterModal(day, day.park, 'dining')}
                              className="text-[11px] text-slate-400 italic py-2 cursor-pointer hover:text-rose-700 transition-colors"
                              title="Clique para agendar refeição"
                            >
                              Refeições rápidas livres (Quick Service).
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                              {pb.diningReservations.map((dr) => (
                                <div
                                  key={dr.id}
                                  onClick={() => handleOpenRegisterModal(day, day.park, 'dining')}
                                  className="p-1.5 rounded-lg bg-rose-50/70 border border-rose-100 text-[11px] space-y-0.5 cursor-pointer hover:bg-rose-100/80 transition-colors"
                                  title="Clique para gerenciar reservas de refeição"
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="font-bold text-rose-900 truncate">
                                      {dr.restaurantName}
                                    </span>
                                    <span className="font-mono text-[10px] font-bold text-rose-800">
                                      {dr.time}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[10px] text-rose-700">
                                    <span>{dr.mealType} ({dr.partySize}p)</span>
                                    {dr.confirmationCode && (
                                      <span className="font-mono">#{dr.confirmationCode}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Block 4: Night Show & Parades */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                              <Moon className="w-4 h-4 text-indigo-500" />
                              <span>Shows & Fogos</span>
                            </div>
                            <button
                              onClick={() => handleOpenRegisterModal(day, day.park, 'shows')}
                              className="text-[10px] text-indigo-700 font-bold hover:underline cursor-pointer"
                            >
                              + Adicionar
                            </button>
                          </div>
                          {(!pb?.showsAndParades || pb.showsAndParades.length === 0) ? (
                            <div>
                              {guideInfo?.nightShow ? (
                                <div
                                  onClick={() => handleOpenRegisterModal(day, day.park, 'shows')}
                                  className="p-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[11px] cursor-pointer hover:bg-indigo-100/70 transition-colors"
                                  title="Clique para agendar show"
                                >
                                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">
                                    Recomendação do Guia:
                                  </span>
                                  <p className="font-semibold text-indigo-900 mt-0.5">
                                    {guideInfo.nightShow}
                                  </p>
                                </div>
                              ) : (
                                <p
                                  onClick={() => handleOpenRegisterModal(day, day.park, 'shows')}
                                  className="text-[11px] text-slate-400 italic py-2 cursor-pointer hover:text-indigo-600 transition-colors"
                                  title="Clique para agendar show"
                                >
                                  Nenhum show agendado ainda.
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                              {pb.showsAndParades.map((sh) => (
                                <div
                                  key={sh.id}
                                  onClick={() => handleOpenRegisterModal(day, day.park, 'shows')}
                                  className="p-1.5 rounded-lg bg-indigo-50/70 border border-indigo-100 text-[11px] flex items-center justify-between gap-1 cursor-pointer hover:bg-indigo-100/80 transition-colors"
                                  title="Clique para gerenciar shows"
                                >
                                  <div className="truncate">
                                    <p className="font-bold text-indigo-900 truncate">{sh.showName}</p>
                                    {sh.location && (
                                      <p className="text-[10px] text-indigo-700">{sh.location}</p>
                                    )}
                                  </div>
                                  <span className="font-mono text-[10px] font-bold text-indigo-800 shrink-0">
                                    {sh.time}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Photo Package Section / Memory Maker */}
                      <div className="px-5 sm:px-6 pb-3 pt-0 bg-slate-50/50">
                        {(() => {
                          const dayPhotoPkg = getPhotoPackageForDay(day, tripPhotoPackages);
                          if (dayPhotoPkg) {
                            return (
                              <div
                                onClick={() => handleOpenRegisterModal(day, day.park, 'photos')}
                                className="p-3.5 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50/60 to-purple-50 border border-purple-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs cursor-pointer hover:border-purple-300 transition-all group"
                                title="Clique para ver ou gerenciar detalhes do Pacote de Fotos"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                    <Camera className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100/90 px-2 py-0.5 rounded-full border border-purple-200">
                                        📸 Pacote de Fotos Ativo
                                      </span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200/80 text-purple-900">
                                        {dayPhotoPkg.type === 'trip_30days'
                                          ? 'Validade: 30 Dias (Múltiplos Parques)'
                                          : dayPhotoPkg.type === 'daily'
                                          ? 'Validade: 1 Dia'
                                          : 'Multi-Dias'}
                                      </span>
                                      {dayPhotoPkg.status && (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" />
                                          {dayPhotoPkg.status}
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-xs sm:text-sm font-bold text-purple-950 mt-1 font-serif group-hover:text-purple-700 transition-colors">
                                      {dayPhotoPkg.name}
                                    </h4>
                                    <div className="flex items-center gap-3 text-[11px] text-purple-900/80 mt-0.5 flex-wrap">
                                      {dayPhotoPkg.code && (
                                        <span className="font-mono font-bold bg-white/70 px-2 py-0.5 rounded border border-purple-100">
                                          Voucher: #{dayPhotoPkg.code}
                                        </span>
                                      )}
                                      {dayPhotoPkg.notes && (
                                        <span className="text-slate-600">{dayPhotoPkg.notes}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenRegisterModal(day, day.park, 'photos');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto shrink-0"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>Gerenciar Fotos</span>
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <Camera className="w-4 h-4 text-purple-400 shrink-0" />
                                <span className="text-slate-600 font-medium text-[11px]">
                                  Pacote de Fotos (PhotoPass / Memory Maker): Não cadastrado neste dia.
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenRegisterModal(day, day.park, 'photos')}
                                className="px-2.5 py-1 rounded-lg text-purple-700 hover:text-purple-900 hover:bg-purple-50 font-bold text-[11px] flex items-center gap-1 border border-purple-200 transition-colors self-start sm:self-auto cursor-pointer"
                              >
                                <Plus className="w-3 h-3 text-purple-600" />
                                <span>+ Adicionar Pacote de Fotos</span>
                              </button>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Observações Gerais embaixo do card */}
                      {(pb?.notes || day.generalNotes) ? (
                        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 bg-slate-50/50">
                          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
                            <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="space-y-0.5 flex-1 min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                                Observações & Estratégia do Dia:
                              </span>
                              <p className="text-xs text-amber-950 leading-relaxed whitespace-pre-line font-medium">
                                {pb?.notes || day.generalNotes}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: INGRESSOS & COMBOS COMPRADOS (SINCRONIZADOS COM O FINANCEIRO)     */}
      {/* ========================================================================= */}
      {activeMainTab === 'tickets' && (
        <div className="space-y-6">
          {/* Ticket Highlights Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs border-l-4 border-l-[#1A2B4C]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Total de Pacotes Cadastrados
              </span>
              <p className="text-2xl font-bold text-[#1A2B4C] font-serif">
                {(parkTickets || []).length} {(parkTickets || []).length === 1 ? 'pacote' : 'pacotes'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Combos multi-dias e ingressos individuais
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs border-l-4 border-l-emerald-600">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Total Investido em Ingressos (BRL)
              </span>
              <p className="text-2xl font-bold text-emerald-700 font-serif">
                R$ {totalTicketsCostBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                ≈ US$ {totalTicketsCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Câmbio: R$ {dollarRate.toFixed(2).replace('.', ',')})
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs border-l-4 border-l-[#D4AF37]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Status de Quitação
              </span>
              <p className="text-2xl font-bold text-amber-800 font-serif">
                {(parkTickets || []).filter((t) => t.paymentStatus === 'Pago').length} de {(parkTickets || []).length} Pagos
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {(parkTickets || []).filter((t) => t.paymentStatus !== 'Pago').length} com pagamento pendente
              </p>
            </div>
          </div>

          {/* Complex Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            <button
              onClick={() => setTicketFilterComplex('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                ticketFilterComplex === 'all'
                  ? 'bg-[#1A2B4C] text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos ({(parkTickets || []).length})
            </button>
            {['Disney', 'Universal', 'SeaWorld', 'Discovery Cove', 'Legoland', 'Kennedy Space Center'].map((comp) => {
              const count = (parkTickets || []).filter((t) => t.complex === comp).length;
              if (count === 0 && ticketFilterComplex !== comp) return null;
              return (
                <button
                  key={comp}
                  onClick={() => setTicketFilterComplex(comp)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    ticketFilterComplex === comp
                      ? 'bg-[#1A2B4C] text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {comp} ({count})
                </button>
              );
            })}
          </div>

          {/* Tickets List */}
          {filteredTickets.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-2xs space-y-4">
              <div className="w-16 h-16 bg-[#D4AF37]/15 text-[#D4AF37] rounded-2xl flex items-center justify-center mx-auto border border-[#D4AF37]/30">
                <Ticket className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-lg font-bold font-serif text-[#1A2B4C]">
                  Nenhum ingresso cadastrado neste filtro
                </h3>
                <p className="text-xs sm:text-sm text-slate-500">
                  Cadastre as compras de ingressos da sua viagem (individuais ou combos multi-parques) para manter seus vouchers centralizados e custos sincronizados.
                </p>
              </div>
              <button
                onClick={handleOpenNewTicketModal}
                className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs rounded-xl inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#1A2B4C]" />
                <span>Cadastrar Compra de Ingresso</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {filteredTickets.map((ticket) => {
                const costBrl = ticket.costBRL || (ticket.costUSD ? ticket.costUSD * dollarRate : 0);
                const costUsd = ticket.costUSD || (ticket.costBRL ? ticket.costBRL / dollarRate : 0);

                // Resolver nomes e lista de viajantes do pacote
                const ticketTravelers = ticket.travelerIds || [];
                const travelersList = settings.travelers || [];
                const isAllTravelers = ticketTravelers.includes('all') || ticketTravelers.length === 0 || (travelersList.length > 0 && ticketTravelers.length === travelersList.length);
                const matchingTravelers = isAllTravelers
                  ? travelersList
                  : travelersList.filter((t) => ticketTravelers.includes(t.id));

                return (
                  <div
                    key={ticket.id}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group"
                  >
                    <div>
                      {/* Standardized Header - Stacked layout for 2-column grid */}
                      <LogisticsCardHeader
                        layout="stacked"
                        icon={
                          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                            <Ticket className="w-5 h-5 text-[#D4AF37]" />
                          </div>
                        }
                        categoryLabel={`${ticket.complex || 'Ingresso'} • ${ticket.type === 'combo' ? 'Combo Multi-Parques' : 'Individual'}`}
                        status={
                          ticket.paymentStatus === 'Pago'
                            ? 'Quitado'
                            : ticket.paymentStatus?.includes('Previsão')
                            ? 'Apenas Previsão'
                            : ticket.paymentStatus || 'Confirmado'
                        }
                        title={ticket.title}
                        subtitle={
                          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-300">
                            <span className="font-semibold text-amber-300">
                              📦 {ticket.quantity || 1} {(ticket.quantity || 1) === 1 ? 'Pacote / Ingresso' : 'Pacotes / Ingressos'}
                            </span>
                            {ticket.seller && (
                              <span className="break-words">
                                • Emitido por: <strong className="text-white font-medium">{ticket.seller}</strong>
                              </span>
                            )}
                          </div>
                        }
                        confirmationCodes={ticket.confirmationCode}
                        codeLabel="Código / Voucher"
                        onEdit={() => handleOpenEditTicketModal(ticket)}
                        editTitle="Editar dados do ingresso"
                        onDelete={() => setTicketToDelete(ticket)}
                        deleteTitle="Excluir ingresso"
                      />

                      {/* Ticket Body Content */}
                      <div className="p-5 sm:p-6 space-y-5">
                        {/* 5-Column Balanced Grid for Park Ticket Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs">
                          {/* Box 1: Complexo & Parques Inclusos */}
                          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Ticket className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>Complexo & Parques</span>
                              </div>
                              <p className="font-bold text-slate-900 text-xs mt-1">
                                {ticket.complex || 'Atração / Parque'}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(ticket.parksIncluded || []).map((pName) => (
                                  <span
                                    key={pName}
                                    className="px-2 py-0.5 bg-white text-slate-800 rounded-md text-[10px] font-semibold border border-slate-200"
                                  >
                                    🎡 {pName}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                              {ticket.type === 'combo' ? 'Combo Multi-Parques' : 'Ingresso Individual'}
                            </span>
                          </div>

                          {/* Box 2: Modalidade & Duração */}
                          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>Modalidade & Duração</span>
                              </div>
                              <p className="font-bold text-slate-900 text-xs mt-1">
                                {ticket.daysCount} {ticket.daysCount === 1 ? 'Dia de Parque' : 'Dias de Parques'}
                              </p>
                              <p className="text-[11px] text-amber-900 font-semibold mt-0.5">
                                {ticket.ticketOption || 'Opção Padrão'}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium pt-1.5 border-t border-slate-200/70 block">
                              Qtd: {ticket.quantity || 1} {ticket.quantity === 1 ? 'ingresso' : 'ingressos'}
                            </span>
                          </div>

                          {/* Box 3: Participantes Vinculados */}
                          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>Participantes Vinculados</span>
                              </div>
                              <p className="font-medium text-slate-800 text-xs mt-1 leading-snug break-words">
                                {isAllTravelers
                                  ? (settings.travelers || []).map((t) => t.name || 'Viajante').join(', ') || 'Todos os Viajantes'
                                  : matchingTravelers.map((t) => t.name || 'Viajante').join(', ') || 'Todos os Viajantes'}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                              Titulares dos ingressos
                            </span>
                          </div>

                          {/* Box 4: Emissão & Voucher */}
                          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>Emissão & Voucher</span>
                              </div>
                              <p className="font-bold text-slate-900 text-xs mt-1 truncate">
                                Vendedor: {ticket.seller || 'Não informado'}
                              </p>
                              <p className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
                                Voucher: {ticket.confirmationCode || 'Pendente'}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/70 block">
                              Comprovante de compra
                            </span>
                          </div>

                          {/* Box 5: Standardized Financial Block */}
                          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Investimento do Ingresso</span>
                              </div>
                              <div className="mt-1">
                                <div className="text-base sm:text-lg font-bold text-[#1A2B4C] font-mono tabular-nums">
                                  R$ {costBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <span className="text-xs text-slate-500 font-mono tabular-nums block">
                                  (US$ {costUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-slate-200/70">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border w-fit ${
                                  ticket.paymentStatus === 'Pago'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : ticket.paymentStatus === 'Pendente'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-300'
                                }`}
                              >
                                {ticket.paymentStatus === 'Pago'
                                  ? '✓ Pago'
                                  : ticket.paymentStatus === 'Pendente'
                                  ? '⏳ Pendente'
                                  : '⚪ Não informado'}
                              </span>
                              <span className="text-[10px] text-amber-800 font-bold bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200/80 w-fit">
                                {!ticket.payerId || ticket.payerId === 'all' || ticket.payerId === 'grupo'
                                  ? 'Dividido pelo grupo'
                                  : `Pagador: ${(settings.travelers || []).find((t) => t.id === ticket.payerId)?.name || 'Viajante'}`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Notes if present */}
                        {ticket.notes && (
                          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
                            <FileText className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-bold block text-amber-950">Observações do Ingresso:</span>
                              <p className="leading-relaxed">{ticket.notes}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Section: Pacotes de Fotos & Memory Maker Comprados */}
          {tripPhotoPackages.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-purple-600" />
                  <h3 className="text-base font-bold font-serif text-[#1A2B4C]">
                    Pacotes de Fotos & Memory Maker Comprados ({tripPhotoPackages.length})
                  </h3>
                </div>
                <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
                  📸 Sincronizados com os Parques
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tripPhotoPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="bg-white rounded-2xl border border-purple-200 p-4 shadow-2xs space-y-3 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                          <Camera className="w-4 h-4" />
                        </span>
                        <div>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                            {pkg.complex || 'Complexo'}
                          </span>
                          <h4 className="font-bold text-slate-900 text-sm mt-0.5">{pkg.name}</h4>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {pkg.status || 'Ativo'}
                      </span>
                    </div>

                    {(pkg.code || (pkg as any).confirmationCode) && (
                      <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-purple-800 block">Código / Voucher</span>
                          <span className="font-mono font-bold text-purple-950">{pkg.code || (pkg as any).confirmationCode}</span>
                        </div>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-200/70 px-2 py-0.5 rounded">
                          Voucher Ativo
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      {pkg.parks && pkg.parks.length > 0 ? (
                        <span className="text-slate-600">
                          Parques: <strong>{pkg.parks.join(', ')}</strong>
                        </span>
                      ) : pkg.notes ? (
                        <span className="text-slate-600 truncate max-w-[200px]" title={pkg.notes}>
                          {pkg.notes}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Válido para a viagem ({pkg.complex})</span>
                      )}
                      {(pkg.costBRL !== undefined || pkg.costUSD !== undefined) && (
                        <span className="font-mono font-bold text-emerald-800">
                          {pkg.costBRL ? `R$ ${pkg.costBRL.toFixed(2).replace('.', ',')}` : `US$ ${(pkg.costUSD || 0).toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: GUIA COMPLETO DOS 17 PARQUES & ATRAÇÕES ESTRATÉGICAS              */}
      {/* ========================================================================= */}
      {activeMainTab === 'guide' && (
        <div className="space-y-8">
          {/* Filter and Search Bar Hub */}
          <div className="space-y-4">
            {/* Search and Type filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por parque, atração (ex: Mako, Harry Potter, TRON), restaurante ou dica..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#1A2B4C] focus:border-[#1A2B4C]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Park Type Badges */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar shrink-0">
                <button
                  onClick={() => setSelectedType('all')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    selectedType === 'all'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Todos os Tipos
                </button>
                <button
                  onClick={() => setSelectedType('Temático')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    selectedType === 'Temático'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🎡 Temáticos
                </button>
                <button
                  onClick={() => setSelectedType('Aquático')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    selectedType === 'Aquático'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🌊 Aquáticos
                </button>
                <button
                  onClick={() => setSelectedType('Experiência Imersiva')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    selectedType === 'Experiência Imersiva'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🤿 Mergulho & Imersão
                </button>
                <button
                  onClick={() => setSelectedType('Ciência & Espaço')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    selectedType === 'Ciência & Espaço'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🚀 NASA & Espaço
                </button>
              </div>
            </div>

            {/* Resort Filter Tabs - Ocupando a tela até o fim do frame */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 w-full">
              <button
                onClick={() => setSelectedResort('all')}
                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer w-full justify-center flex items-center gap-1 ${
                  selectedResort === 'all'
                    ? 'bg-[#1A2B4C] text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Todos os Parques ({PARKS_GUIDE_DATA.length})
              </button>
              <button
                onClick={() => setSelectedResort('Walt Disney World')}
                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                  selectedResort === 'Walt Disney World'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>🏰 Walt Disney World</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                  {disneyCount}
                </span>
              </button>
              <button
                onClick={() => setSelectedResort('Universal Orlando Resort')}
                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                  selectedResort === 'Universal Orlando Resort'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>🌐 Universal Orlando</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                  {universalCount}
                </span>
              </button>
              <button
                onClick={() => setSelectedResort('SeaWorld Parks & Entertainment')}
                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                  selectedResort === 'SeaWorld Parks & Entertainment'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>🐬 SeaWorld Parks</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                  {seaworldCount}
                </span>
              </button>
              <button
                onClick={() => setSelectedResort('Outros Parques & Experiências')}
                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                  selectedResort === 'Outros Parques & Experiências'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>🚀 Outros (NASA / Legoland)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                  {outrosCount}
                </span>
              </button>
            </div>

            {/* Action Buttons Row: Comparar Desejos, Expandir, Recolher */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 w-full">
              <button
                onClick={() => setIsComparisonModalOpen(true)}
                className="px-4 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#C59B27] hover:from-[#C59B27] hover:to-[#B38920] text-slate-900 font-black rounded-xl shadow-sm text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer border border-amber-300/60 whitespace-nowrap"
              >
                <Users className="w-4 h-4 text-slate-900" />
                <span>📊 Comparar Desejos do Grupo</span>
              </button>
              <button
                onClick={() => setIsAllExpanded(true)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer border whitespace-nowrap ${
                  isAllExpanded
                    ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="Expandir Tudo"
              >
                <span>Expandir Todos</span>
              </button>
              <button
                onClick={() => setIsAllExpanded(false)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer border whitespace-nowrap ${
                  !isAllExpanded
                    ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="Recolher Tudo"
              >
                <span>Recolher</span>
              </button>
            </div>
          </div>

          {/* Quick Park Switcher Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {filteredParks.map((p) => {
              const isSelected = p.id === activeParkId;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveParkId(p.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#1A2B4C] text-white shadow-sm ring-2 ring-[#D4AF37]/50'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span className="text-sm">{p.icon}</span>
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>

          {/* Full Park Strategic Detail View */}
          {activePark && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-6">
              {/* Park Hero Card Header */}
              <div
                className={`p-6 sm:p-8 bg-gradient-to-r ${activePark.colorTheme} text-white flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
              >
                <div className="space-y-2 max-w-2xl relative z-10">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-white">
                      {activePark.resort}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-black/20 text-slate-100">
                      {activePark.parkType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{activePark.icon}</span>
                    <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight">
                      {activePark.name}
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-100 leading-relaxed font-normal">
                    {activePark.description}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-3 shrink-0 relative z-10">
                  <button
                    onClick={() => handleOpenRegisterModal(undefined, activePark.name)}
                    className="px-4 py-2.5 bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer transform hover:-translate-y-0.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 text-[#1A2B4C]" />
                    <span>Agendar Parque no Dia</span>
                  </button>
                </div>
              </div>

              {/* Park Strategic Sections Grid */}
              {isAllExpanded && (
                <div className="p-6 sm:p-8 pt-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1: Must-Do Attractions */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-serif">Atrações Imperdíveis (Must-Do)</span>
                    </div>
                    <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      {activePark.mustDoAttractions.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {activePark.mustDoAttractions.map((att, idx) => {
                      const cleanName = att.replace(/\(.*?\)/g, '').trim();
                      const imgUrl = getAttractionImage(cleanName, activePark.name);
                      return (
                        <div
                          key={idx}
                          className="p-3.5 bg-white rounded-xl border border-slate-200 hover:border-amber-400 transition-all shadow-2xs space-y-2 group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-900 leading-snug flex-1">
                              {att}
                            </h4>
                            <button
                              onClick={() =>
                                openPhotoModal({
                                  title: cleanName,
                                  category: 'attraction',
                                  parkName: activePark.name,
                                  description: att,
                                  imageUrl: imgUrl,
                                })
                              }
                              className="text-[10px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer border border-amber-200/80 transition-all"
                            >
                              <Camera className="w-3 h-3 text-amber-700" />
                              <span>Fotos & Vídeos</span>
                            </button>
                          </div>

                          {/* Traveler attraction selections */}
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Desejo:</span>
                            {(settings.travelers || []).map((trav) => {
                              const isChecked = isAttractionMatch(attractionSelections, trav.id, activePark.id, att);
                              return (
                                <button
                                  key={trav.id}
                                  type="button"
                                  onClick={() => toggleAttractionSelection(trav.id, activePark.id, normalizeAttractionName(att) || att)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                                    isChecked
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
                                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                  }`}
                                  title={`Marcar que ${trav.name} quer ir em ${att}`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: trav.avatarColor || '#3B82F6' }}
                                  />
                                  <span>{trav.name.split(' ')[0]}</span>
                                  {isChecked && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Best Dining & Snacks */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold">
                      <Utensils className="w-4 h-4 text-rose-500" />
                      <span className="text-sm font-serif">Melhor Gastronomia & Snacks</span>
                    </div>
                    <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                      {activePark.bestDining.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {activePark.bestDining.map((din, idx) => {
                      const cleanName = din.replace(/\(.*?\)/g, '').trim();
                      const imgUrl = getRestaurantImage(cleanName, activePark.name);
                      return (
                        <div
                          key={idx}
                          className="p-3.5 bg-white rounded-xl border border-slate-200 hover:border-rose-400 transition-all shadow-2xs space-y-2 group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-900 leading-snug flex-1">
                              {din}
                            </h4>
                            <button
                              onClick={() =>
                                openPhotoModal({
                                  title: cleanName,
                                  category: 'restaurant',
                                  parkName: activePark.name,
                                  description: din,
                                  imageUrl: imgUrl,
                                })
                              }
                              className="text-[10px] font-bold text-rose-900 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer border border-rose-200/80 transition-all"
                            >
                              <Camera className="w-3 h-3 text-rose-700" />
                              <span>Fotos & Vídeos</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 3: Pro Tips & Crowd Control */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-200 pb-2.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-serif">Dicas de Especialista (Pro Tips)</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {activePark.proTips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold text-xs mt-0.5">•</span>
                        <span className="leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              )}

              {/* Night Show / Event Highlight banner if exists */}
              {activePark.nightShow && (
                <div className="mx-6 sm:mx-8 mb-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-indigo-900/50">
                  <div className="flex items-center gap-3">
                    <Moon className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] block">
                        Espetáculo Noturno & Destaque Especial
                      </span>
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5">
                        {activePark.nightShow}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenRegisterModal(undefined, activePark.name, 'shows')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <Moon className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Agendar Show no Roteiro</span>
                  </button>
                </div>
              )}

              {/* PhotoPass & Photography Package Highlight Banner */}
              <div className="mx-6 sm:mx-8 mb-6 p-4 rounded-2xl bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-purple-800/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600/50 border border-purple-400/30 text-purple-200 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5 text-purple-300" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 block">
                      Fotografia Oficial & Pacote de Fotos (PhotoPass / Memory Maker)
                    </span>
                    <p className="text-xs text-slate-200 mt-0.5 max-w-2xl">
                      {activePark.resort === 'Walt Disney World'
                        ? 'O Disney Memory Maker (30 dias) cobre fotos e vídeos de alta resolução em todos os 4 parques Disney e aquáticos. Também há opção de pacote diário (1 dia).'
                        : activePark.resort === 'Universal Orlando Resort'
                        ? 'O My Universal Photos oferece opções de 1 dia ou 3 dias ilimitados cobrindo Universal Studios Florida, Islands of Adventure e Volcano Bay.'
                        : 'Capture todas as memórias com fotos digitais ilimitadas nas principais atrações e com fotógrafos oficiais do parque.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenRegisterModal(undefined, activePark.name, 'photos')}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Camera className="w-3.5 h-3.5 text-purple-200" />
                  <span>Configurar Pacote de Fotos</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ticket Purchase Modal */}
      {isTicketModalOpen && (
        <ParkTicketModal
          isOpen={isTicketModalOpen}
          onClose={() => {
            setIsTicketModalOpen(false);
            setTicketToEdit(null);
          }}
          ticketToEdit={ticketToEdit}
          onSave={handleSaveTicket}
        />
      )}

      {/* Booking Modal (Schedule Park on Day) */}
      {isBookingModalOpen && (
        <ParkBookingModal
          isOpen={isBookingModalOpen}
          onClose={() => {
            setIsBookingModalOpen(false);
            setBookingModalDay(null);
            setPreselectedParkName(undefined);
            setBookingModalInitialTab('general');
          }}
          day={bookingModalDay || itineraryDays[0]}
          allDays={itineraryDays}
          initialParkName={preselectedParkName}
          initialTab={bookingModalInitialTab}
          onSave={async (updates, targetDayId) => {
            try {
              const idToUpdate = targetDayId || bookingModalDay?.id || itineraryDays[0]?.id;
              if (idToUpdate) {
                const res = await updateItineraryDay(idToUpdate, updates);
                return res || { success: false, error: 'Resposta vazia do servidor' };
              }
              return { success: false, error: 'Identificador do dia não encontrado' };
            } catch (err: any) {
              return { success: false, error: err?.message || 'Erro inesperado ao salvar dia' };
            }
          }}
          onRemovePark={async (targetDayId, cleanedDay) => {
            try {
              const idToUpdate = targetDayId || bookingModalDay?.id || itineraryDays[0]?.id;
              if (!idToUpdate) return { success: false, error: 'Identificador do dia não encontrado' };
              const targetDay = itineraryDays.find((d) => d.id === idToUpdate) || bookingModalDay || itineraryDays[0];
              const cleaned = cleanedDay || (targetDay ? clearParkReferencesFromDay(targetDay, itineraryDays.length) : {
                park: 'Sem Parque',
                parkBooking: undefined,
              });
              const res = await updateItineraryDay(idToUpdate, cleaned);
              return res || { success: false, error: 'Resposta vazia do servidor' };
            } catch (err: any) {
              return { success: false, error: err?.message || 'Erro inesperado ao desvincular parque' };
            }
          }}
        />
      )}

      {/* Confirmation Modal: Delete Ticket Purchase */}
      {ticketToDelete && (
        <div
          onClick={() => setTicketToDelete(null)}
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
                <h3 className="font-bold text-slate-900 text-base">Excluir Compra de Ingresso?</h3>
                <p className="text-xs text-slate-500">O gasto associado será removido do Planejamento Financeiro.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{ticketToDelete.title}</span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Complexo: <strong>{ticketToDelete.complex}</strong> • {ticketToDelete.daysCount} {ticketToDelete.daysCount === 1 ? 'dia' : 'dias'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTicketToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteParkTicket(ticketToDelete.id);
                  if (res && !res.success) {
                    return;
                  }
                  setTicketToDelete(null);
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

      {/* Confirmation Modal: Remove Park from Day */}
      {dayParkToDelete && (
        <div
          onClick={() => setDayParkToDelete(null)}
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
                <h3 className="font-bold text-slate-900 text-base">Desvincular Parque do Roteiro?</h3>
                <p className="text-xs text-slate-500">O Dia {dayParkToDelete.dayNumber} ficará como livre.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Dia {dayParkToDelete.dayNumber} — {dayParkToDelete.parkName}</span>
              </div>
              <p className="text-slate-500 text-[11px]">
                As reservas de FastPass, restaurantes e shows vinculadas a este dia serão removidas.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDayParkToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  updateItineraryDay(dayParkToDelete.dayId, {
                    park: 'Sem Parque',
                    parkBooking: undefined,
                  });
                  setDayParkToDelete(null);
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

      {/* Swap Park Day Modal */}
      <SwapParkDayModal
        isOpen={isSwapModalOpen}
        onClose={() => {
          setIsSwapModalOpen(false);
          setSwapSourceDay(null);
        }}
        sourceDay={swapSourceDay}
        allDays={itineraryDays}
        onConfirmSwap={async (sourceDayNum, targetDayNum) => {
          swapOrMoveParkDay(sourceDayNum, targetDayNum);
          if (activeTripId) await evaluateAndCorrectAllItems(activeTripId);
        }}
      />

      {/* Attraction & Park Photo Modal Lightbox */}
      <AttractionPhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        item={selectedPhotoItem}
      />

      {/* Attraction Comparison & Summary Modal */}
      <AttractionComparisonModal
        isOpen={isComparisonModalOpen}
        onClose={() => setIsComparisonModalOpen(false)}
        travelers={settings.travelers || []}
        parksData={PARKS_GUIDE_DATA}
        attractionSelections={attractionSelections}
        onToggleSelection={toggleAttractionSelection}
        tripId={activeTripId || settings.id}
      />
    </div>
  );
};
