import React, { useState, useMemo } from 'react';
import {
  Plane,
  Plus,
  Calendar,
  Clock,
  MapPin,
  Luggage,
  ShieldCheck,
  FileText,
  ExternalLink,
  Edit3,
  Trash2,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Info,
  Sparkles,
  Users,
  Compass,
  Download,
  Upload,
  Ticket,
  DollarSign,
  CreditCard,
  X,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { usePlanner, formatDisplayDate, getTripEndDate } from '../context/PlannerContext';
import { FlightSegment } from '../types';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { parseInputToNumber, formatInputDisplay } from '../utils/currency';
import { TravelerSelector } from './TravelerSelector';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';

const getCheckInUrl = (airlineName: string) => {
  const name = (airlineName || '').toLowerCase();
  if (name.includes('latam')) return 'https://www.latamairlines.com/br/pt/check-in';
  if (name.includes('azul')) return 'https://www.voeazul.com.br';
  if (name.includes('american') || name.includes('aa')) return 'https://www.aa.com/checkout/checkin';
  if (name.includes('copa')) return 'https://checkin.copaair.com';
  if (name.includes('gol')) return 'https://www.voegol.com.br/check-in';
  if (name.includes('united')) return 'https://www.united.com/en/us/checkin';
  if (name.includes('delta')) return 'https://www.delta.com/check-in/start';
  return `https://www.google.com/search?q=${encodeURIComponent(airlineName + ' fazer check-in online')}`;
};

const formatFlightRoute = (flight: {
  originCity?: string;
  originCode?: string;
  originAirport?: string;
  destinationCity?: string;
  destinationCode?: string;
  destinationAirport?: string;
}) => {
  let origText = flight.originCity || flight.originAirport || 'Origem';
  if (flight.originCode && !origText.includes(`(${flight.originCode})`)) {
    origText = `${origText} (${flight.originCode})`;
  }

  let destText = flight.destinationCity || flight.destinationAirport || 'Destino';
  if (flight.destinationCode && !destText.includes(`(${flight.destinationCode})`)) {
    destText = `${destText} (${flight.destinationCode})`;
  }

  return `${origText} ➔ ${destText}`;
};

export const FlightsView: React.FC = () => {
  const {
    flights,
    addFlight,
    updateFlight,
    deleteFlight,
    addFlightAttachment,
    removeFlightAttachment,
    currencyView,
    settings,
    openOverviewModal,
  } = usePlanner();

  // Determine min and max allowed dates for the active trip
  const isFlexible = !!settings.isFlexibleDates;
  const tripMinDate = isFlexible
    ? (settings.flexibleOutboundStart || settings.startDate || '2026-12-30')
    : (settings.startDate || '2026-12-30');

  const tripMaxDate = isFlexible
    ? (settings.flexibleInboundEnd || (settings.startDate ? getTripEndDate(settings.startDate, settings.durationDays) : '2027-01-10'))
    : (settings.startDate ? getTripEndDate(settings.startDate, settings.durationDays) : '2027-01-10');

  const [copiedPnr, setCopiedPnr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<FlightSegment | null>(null);
  const [flightToDelete, setFlightToDelete] = useState<FlightSegment | null>(null);

  useConfirmationKeyboard({
    isOpen: !!flightToDelete,
    onConfirm: () => {
      if (flightToDelete) {
        deleteFlight(flightToDelete.id);
        setFlightToDelete(null);
      }
    },
    onCancel: () => setFlightToDelete(null),
  });
  const [activeTabSub, setActiveTabSub] = useState<'tickets' | 'mco_guide' | 'baggage_rules'>('tickets');
  const [selectedAirportGuide, setSelectedAirportGuide] = useState<'MCO' | 'MIA' | 'TPA'>('MCO');

  // Input formatting temporary states
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [unitCostUSD, setUnitCostUSD] = useState<string>('');
  const [unitCostBRL, setUnitCostBRL] = useState<string>('');

  // Attachment upload modal state
  const [attModalFlightId, setAttModalFlightId] = useState<string | null>(null);
  const [newAttName, setNewAttName] = useState('');
  const [newAttType, setNewAttType] = useState<'pdf' | 'ticket' | 'image'>('pdf');

  // Form State
  const [formData, setFormData] = useState<Omit<FlightSegment, 'id'>>({
    type: 'outbound',
    typeLabel: 'Voo de Ida',
    airline: '',
    airlineCode: '',
    flightNumber: '',
    pnrLocator: '',
    originAirport: '',
    originCity: '',
    originCode: '',
    destinationAirport: '',
    destinationCity: '',
    destinationCode: '',
    departureDate: settings.startDate,
    departureTime: '',
    arrivalDate: settings.startDate,
    arrivalTime: '',
    duration: '',
    stopovers: '',
    cabinClass: 'Econômica',
    seats: '',
    terminalOrigin: '',
    terminalDestination: '',
    gate: '',
    baggageAllowance: {
      personalItem: true,
      carryOnQty: 1,
      checkedQty: 0,
      notes: '',
    },
    status: 'Emitido / Confirmado',
    ticketCostUSD: 0,
    ticketCostBRL: 0,
    notes: '',
    travelerIds: ['all'],
    passengers: (settings.travelers || []).map((t) => t?.name || 'Viajante'),
    attachments: [],
  });

  const handleCopyPnr = (pnr: string) => {
    navigator.clipboard.writeText(pnr);
    setCopiedPnr(pnr);
    setTimeout(() => setCopiedPnr(null), 2000);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAtt, setIsSavingAtt] = useState(false);
  const handleOpenAddModal = () => {
    setEditingFlight(null);
    setFormData({
      type: 'outbound',
      typeLabel: 'Voo de Ida',
      airline: '',
      airlineCode: '',
      flightNumber: '',
      pnrLocator: '',
      originAirport: '',
      originCity: '',
      originCode: '',
      destinationAirport: '',
      destinationCity: '',
      destinationCode: '',
      departureDate: settings.startDate,
      departureTime: '',
      arrivalDate: settings.startDate,
      arrivalTime: '',
      duration: '',
      stopovers: '',
      cabinClass: 'Econômica',
      seats: '',
      terminalOrigin: '',
      terminalDestination: '',
      gate: '',
      baggageAllowance: {
        personalItem: true,
        carryOnQty: 1,
        checkedQty: 0,
        notes: '',
      },
      status: 'Emitido / Confirmado',
      ticketCostUSD: 0,
      ticketCostBRL: 0,
      notes: '',
      travelerIds: ['all'],
      passengers: (settings.travelers || []).map((t) => t?.name || 'Viajante'),
      attachments: [],
    });
    setUnitCostUSD('');
    setUnitCostBRL('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (flight: FlightSegment) => {
    setEditingFlight(flight);
    setFormData({
      type: flight.type,
      typeLabel: flight.typeLabel,
      airline: flight.airline,
      airlineCode: flight.airlineCode || '',
      flightNumber: flight.flightNumber,
      pnrLocator: flight.pnrLocator,
      originAirport: flight.originAirport,
      originCity: flight.originCity,
      originCode: flight.originCode,
      destinationAirport: flight.destinationAirport,
      destinationCity: flight.destinationCity,
      destinationCode: flight.destinationCode,
      departureDate: flight.departureDate,
      departureTime: flight.departureTime,
      arrivalDate: flight.arrivalDate,
      arrivalTime: flight.arrivalTime,
      duration: flight.duration,
      stopovers: flight.stopovers,
      cabinClass: flight.cabinClass,
      seats: flight.seats,
      terminalOrigin: flight.terminalOrigin || '',
      terminalDestination: flight.terminalDestination || '',
      gate: flight.gate || '',
      baggageAllowance: { ...flight.baggageAllowance },
      status: flight.status,
      ticketCostUSD: flight.ticketCostUSD || 0,
      ticketCostBRL: flight.ticketCostBRL || 0,
      notes: flight.notes || '',
      travelerIds: flight.travelerIds || ['all'],
      passengers: flight.passengers || (settings.travelers || []).map((t) => t?.name || 'Viajante'),
      attachments: flight.attachments || [],
    });

    const travelers = settings.travelers || [];
    const q = (flight.travelerIds?.includes('all') ? travelers.length : flight.travelerIds?.length) || travelers.length || 1;
    if (flight.ticketCostUSD) setUnitCostUSD((flight.ticketCostUSD / q).toFixed(2));
    else setUnitCostUSD('');
    if (flight.ticketCostBRL) setUnitCostBRL((flight.ticketCostBRL / q).toFixed(2));
    else setUnitCostBRL('');

    setModalOpen(true);
  };

  const handleSaveFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    
    const flightNum = formData.flightNumber.trim() || 'VOO-001';

    let originC = formData.originCity.trim() || formData.originAirport || 'Origem';
    let destC = formData.destinationCity.trim() || formData.destinationAirport || 'Destino';
    
    let originCd = formData.originCode.trim();
    if (!originCd && formData.originAirport) {
      const match = formData.originAirport.match(/\(([A-Z]{3})\)/);
      if (match) originCd = match[1];
    }

    let destCd = formData.destinationCode.trim();
    if (!destCd && formData.destinationAirport) {
      const match = formData.destinationAirport.match(/\(([A-Z]{3})\)/);
      if (match) destCd = match[1];
    }

    if (originCd && originC.endsWith(`(${originCd})`)) {
      originC = originC.replace(`(${originCd})`, '').trim();
    }
    if (destCd && destC.endsWith(`(${destCd})`)) {
      destC = destC.replace(`(${destCd})`, '').trim();
    }

    const dataToSave = {
      ...formData,
      flightNumber: flightNum,
      originCity: originC,
      destinationCity: destC,
      originCode: originCd,
      destinationCode: destCd,
    };

    try {
      if (editingFlight) {
        await updateFlight(editingFlight.id, dataToSave);
      } else {
        await addFlight(dataToSave);
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar voo:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attModalFlightId || !newAttName.trim() || isSavingAtt) return;
    
    setIsSavingAtt(true);
    try {
      await addFlightAttachment(attModalFlightId, {
        name: newAttName.trim(),
        type: newAttType,
        url: '#',
      });
      setAttModalFlightId(null);
      setNewAttName('');
    } catch (err) {
      console.error('Erro ao adicionar anexo:', err);
    } finally {
      setIsSavingAtt(false);
    }
  };

  const { handleBackdropClick: handleFlightModalBackdrop } = useModalKeyEvents({
    isOpen: modalOpen && !attModalFlightId,
    onCancel: () => setModalOpen(false),
    onSave: () => handleSaveFlight({ preventDefault: () => {} } as React.FormEvent),
  });

  const { handleBackdropClick: handleAttModalBackdrop } = useModalKeyEvents({
    isOpen: !!attModalFlightId,
    onCancel: () => setAttModalFlightId(null),
    onSave: () => handleAddAttachment({ preventDefault: () => {} } as React.FormEvent),
  });

  // Financial Summary for Flights
  const totalFlightsCostBRL = useMemo(() => {
    return flights.reduce((sum, f) => sum + (f.ticketCostBRL || 0), 0);
  }, [flights]);

  const totalFlightsCostUSD = useMemo(() => {
    return flights.reduce((sum, f) => sum + (f.ticketCostUSD || 0), 0);
  }, [flights]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37]">
              <Plane className="w-4 h-4" />
              <span>Logística de Voo & E-Tickets</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight">
              Passagens Aéreas & Vouchers
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Centralize os bilhetes de voo de ida e volta, localizadores de reserva (PNR), cartões de embarque, franquia de bagagens e orientações de imigração no Aeroporto de Orlando (MCO).
            </p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end justify-center gap-2.5 self-end lg:self-auto ml-auto w-full sm:w-auto">
            <button
              type="button"
              id="btn-overview-flights"
              onClick={() => openOverviewModal('flights')}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
              title="Abrir Visão Geral de Passagens Aéreas"
            >
              <Eye className="w-4 h-4 text-[#1A2B4C]" />
              <span>Visão Geral</span>
            </button>
            <button
              id="btn-add-flight"
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 text-[#1A2B4C]" />
              <span>Adicionar Voo / Trecho</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Strip inside Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-white relative z-10">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Passageiros / Viajantes
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-white block mt-1">
              {(settings.travelers || []).length} {((settings.travelers || []).length === 1) ? 'Viajante' : 'Viajantes'}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Custo Total das Passagens
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400 block mt-1">
              {currencyView === 'BRL'
                ? `R$ ${totalFlightsCostBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : `US$ ${totalFlightsCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Localizadores (PNR)
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-amber-300 block mt-1">
              {Array.from(new Set(flights.map(f => (f.pnrLocator || '').trim()).filter(p => p && p !== 'N/A'))).length || 0}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Quantidade de Voos
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-[#D4AF37] block mt-1">
              {flights.length} {flights.length === 1 ? 'Voo' : 'Voos'}
            </span>
          </div>
        </div>
      </div>



      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTabSub('tickets')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTabSub === 'tickets'
              ? 'bg-[#1A2B4C] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Meus Voos & Bilhetes ({flights.length})</span>
        </button>

        <button
          onClick={() => setActiveTabSub('mco_guide')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTabSub === 'mco_guide'
              ? 'bg-[#1A2B4C] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Compass className="w-4 h-4 text-[#D4AF37]" />
          <span>Guia dos Aeroportos (Orlando, Miami, Tampa) & Imigração</span>
        </button>

        <button
          onClick={() => setActiveTabSub('baggage_rules')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTabSub === 'baggage_rules'
              ? 'bg-[#1A2B4C] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Luggage className="w-4 h-4" />
          <span>Regras de Bagagem & Regulamento TSA</span>
        </button>
      </div>

      {/* TAB 1: TICKETS & FLIGHT CARDS */}
      {activeTabSub === 'tickets' && (
        <div className="space-y-6">
          {/* List of Flight Cards */}
          {flights.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-slate-200 space-y-3">
              <Plane className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="font-bold text-base text-slate-700">Nenhum voo cadastrado</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Clique no botão acima para cadastrar os detalhes dos seus voos de ida e volta para Orlando.
              </p>
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 rounded-lg bg-[#1A2B4C] text-white text-xs font-bold cursor-pointer"
              >
                Cadastrar Primeiro Voo
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {[...flights].sort((a, b) => {
                const dateA = a.departureDate || '9999-12-31';
                const dateB = b.departureDate || '9999-12-31';
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return (a.departureTime || '').localeCompare(b.departureTime || '');
              }).map((flight, fIdx) => (
                <div
                  key={`${flight.id}-${fIdx}`}
                  className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-[#D4AF37]/50"
                >
                  {/* Flight Header */}
                  <div className="bg-[#1A2B4C] text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D4AF37]/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-xl shrink-0">
                        ✈️
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-xs bg-[#D4AF37] text-[#1A2B4C] font-bold text-[10px] uppercase tracking-wider">
                            {flight.typeLabel}
                          </span>
                          <span className="text-xs text-slate-300 font-semibold flex items-center gap-2 flex-wrap">
                            <span>{flight.airline} ({flight.flightNumber})</span>
                            <a
                              href={getCheckInUrl(flight.airline)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[#D4AF37]/25 hover:bg-[#D4AF37]/45 border border-[#D4AF37]/40 text-[#D4AF37] hover:text-[#f3d36b] transition-colors text-[10px] font-bold uppercase tracking-wider cursor-pointer ml-1"
                              title="Fazer Check-in online na companhia aérea"
                            >
                              <span>Check-in</span>
                              <ExternalLink className="w-2.5 h-2.5 text-[#D4AF37]" />
                            </a>
                          </span>
                        </div>
                        <h3 className="text-lg font-bold font-serif text-white mt-0.5">
                          {formatFlightRoute(flight)}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* PNR Code Pill */}
                      <div className="bg-white/10 p-2 rounded-xl border border-white/15 flex flex-col gap-1 min-w-[140px]">
                        <span className="text-[9px] uppercase text-slate-300 font-bold tracking-wider">
                          Localizador(es) PNR:
                        </span>
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const flightPnrs = (flight.pnrLocator || '')
                              .split(/[,/•;\s]+/)
                              .map((p) => p.trim().toUpperCase())
                              .filter((p) => Boolean(p && p !== 'N/A' && p !== 'N/D'));
                            if (flightPnrs.length === 0) {
                              return <span className="font-mono font-bold text-xs text-[#D4AF37]">N/A</span>;
                            }
                            return flightPnrs.map((pnrCode, pIdx) => (
                              <div
                                key={pIdx}
                                className="flex items-center justify-between gap-2 bg-white/10 px-2 py-0.5 rounded-md border border-white/10 hover:bg-white/15 transition-colors"
                              >
                                <span className="font-mono font-bold text-xs text-[#D4AF37]">{pnrCode}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPnr(pnrCode)}
                                  className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                  title={`Copiar ${pnrCode}`}
                                >
                                  {copiedPnr === pnrCode ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>

                      {/* Edit / Delete actions */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(flight)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
                          title="Editar Voo"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFlightToDelete(flight)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-600 text-red-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
                          title="Excluir Voo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Flight Boarding Route Details */}
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-slate-50 rounded-xl p-5 border border-slate-200">
                      {/* Departure */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Partida
                        </span>
                        <div className="text-2xl font-bold font-serif text-[#1A2B4C]">
                          {flight.departureTime}
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {flight.originAirport}
                        </p>
                        <p className="text-xs text-slate-500">
                          📅 {formatDisplayDate(flight.departureDate)}
                        </p>
                        {flight.terminalOrigin && (
                          <span className="inline-block px-2 py-0.5 rounded-xs bg-slate-200 text-slate-700 text-[10px] font-semibold mt-1">
                            {flight.terminalOrigin}
                          </span>
                        )}
                      </div>

                      {/* Flight Path / Duration */}
                      <div className="flex flex-col items-center justify-center text-center space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">
                          ⏱ {flight.duration}
                        </span>
                        <div className="w-full flex items-center justify-center gap-2">
                          <div className="h-0.5 flex-1 bg-slate-300"></div>
                          <div className="p-1.5 rounded-full bg-[#1A2B4C] text-white">
                            <Plane className="w-3.5 h-3.5" />
                          </div>
                          <div className="h-0.5 flex-1 bg-slate-300"></div>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
                          {flight.stopovers}
                        </span>
                      </div>

                      {/* Arrival */}
                      <div className="space-y-1 md:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Chegada
                        </span>
                        <div className="text-2xl font-bold font-serif text-[#1A2B4C]">
                          {flight.arrivalTime}
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {flight.destinationAirport}
                        </p>
                        <p className="text-xs text-slate-500">
                          📅 {formatDisplayDate(flight.arrivalDate)}
                        </p>
                        {flight.terminalDestination && (
                          <span className="inline-block px-2 py-0.5 rounded-xs bg-slate-200 text-slate-700 text-[10px] font-semibold mt-1">
                            {flight.terminalDestination}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cabin, Seats, Passengers & Baggage grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      {/* Class & Seats */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase text-[10px]">
                          <Ticket className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Classe & Assentos</span>
                        </div>
                        <p className="font-bold text-slate-800 text-xs">
                          {flight.cabinClass}
                        </p>
                        <p className="text-slate-600">
                          <strong>Assentos:</strong> {flight.seats || 'A atribuir no check-in'}
                        </p>
                      </div>

                      {/* Baggage Allowance */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase text-[10px]">
                          <Luggage className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Franquia de Bagagem</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-xs bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                            ✓ Item Pessoal (Mochila)
                          </span>
                          <span className="px-2 py-0.5 rounded-xs bg-blue-50 text-blue-800 font-bold text-[10px] border border-blue-200">
                            {flight.baggageAllowance.carryOnQty}x Mão (10kg)
                          </span>
                          <span className="px-2 py-0.5 rounded-xs bg-purple-50 text-purple-800 font-bold text-[10px] border border-purple-200">
                            {flight.baggageAllowance.checkedQty}x Despachada (23kg)
                          </span>
                        </div>
                        {flight.baggageAllowance.notes && (
                          <p className="text-[11px] text-slate-500 leading-tight">
                            {flight.baggageAllowance.notes}
                          </p>
                        )}
                      </div>

                      {/* Passengers */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase text-[10px]">
                          <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Passageiros ({flight.passengers?.length || 0})</span>
                        </div>
                        <p className="text-slate-700 font-medium leading-relaxed">
                          {flight.passengers?.join(', ') || 'Todos os viajantes'}
                        </p>
                      </div>
                    </div>

                    {/* Flight Notes */}
                    {flight.notes && (
                      <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <strong className="font-bold block">Observações do Voo:</strong>
                          <p className="leading-relaxed">{flight.notes}</p>
                        </div>
                      </div>
                    )}


                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AIRPORT & IMMIGRATION GUIDES (ORLANDO, MIAMI, TAMPA) */}
      {activeTabSub === 'mco_guide' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
            <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                  <Compass className="w-4 h-4" />
                  <span>Desembarque Sem Estresse na Flórida</span>
                </div>
                <h2 className="text-2xl font-bold font-serif text-[#1A2B4C] mt-1">
                  Guia de Chegada & Imigração por Aeroporto
                </h2>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                  A sua viagem pode desembarcar em <strong>Orlando (MCO)</strong>, <strong>Miami (MIA)</strong> ou <strong>Tampa (TPA)</strong>. Selecione o aeroporto para ver dicas de imigração e transporte até o hotel.
                </p>
              </div>

              {/* Airport Switcher Pills */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedAirportGuide('MCO')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedAirportGuide === 'MCO'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Plane className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Orlando (MCO)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAirportGuide('MIA')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedAirportGuide === 'MIA'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Plane className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Miami (MIA)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAirportGuide('TPA')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedAirportGuide === 'TPA'
                      ? 'bg-[#1A2B4C] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Plane className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Tampa (TPA)</span>
                </button>
              </div>
            </div>

            {/* ORLANDO MCO GUIDE */}
            {selectedAirportGuide === 'MCO' && (
              <div className="space-y-6">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <strong className="font-bold">Distância até os Parques em Orlando:</strong> Direto no coração da cidade! Apenas 20 a 30 minutos de carro (via SR-417 ou Beachline Expwy).
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Step 1 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      1
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Imigração Americana (US CBP)
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Ao sair do avião (Terminais A, B ou no Terminal C), dirija-se à fila de passaportes. Tenha em mãos passaporte com visto válido e comprovantes.
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      <li className="flex items-start gap-1.5">
                        <span className="text-[#D4AF37] font-bold">•</span>
                        <span>Passaportes válidos de toda a família.</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-[#D4AF37] font-bold">•</span>
                        <span>Endereço do hotel/resort em Orlando.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Step 2 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      2
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Trem Monotrilho APM & Bagagem
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Após aprovação da imigração, embarque no trem automatizado (APM) rumo ao Terminal Principal para retirada das malas nas esteiras.
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      <li className="flex items-start gap-1.5">
                        <span className="text-[#D4AF37] font-bold">•</span>
                        <span>No Terminal C, o recolhimento de malas ocorre antes do APM.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Step 3 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      3
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Locadoras de Carro no Próprio Prédio
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Garagem de locadoras (Alamo, Hertz, Avis) no Nível 1. Não precisa de transfer de van! Uber/Lyft disponíveis nos Níveis 2 e 3.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* MIAMI MIA GUIDE */}
            {selectedAirportGuide === 'MIA' && (
              <div className="space-y-6">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <strong className="font-bold">Distância até os Parques em Orlando:</strong> ~3h30 de viagem de carro (via Florida's Turnpike) ou ~3h no trem de alta velocidade <strong>Brightline</strong> (direto da estação Miami Central para a Estação MCO Terminal C).
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Step 1 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      1
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Imigração em Miami (MIA / FLL)
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Miami costuma ter voos diretos muito frequentes do Brasil. A imigração pode ter filas moderadas em horários de pico.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      2
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      MIA Mover & Car Rental Center
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Siga o monotrilho interno "MIA Mover" até o enorme centro de locadoras para retirar seu veículo alugado antes da viagem até Orlando.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      3
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Trem de Alta Velocidade Brightline
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Uma opção excelente sem dirigir: você embarca no trem Brightline e desembarca confortavelmente dentro do Terminal C em Orlando!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAMPA TPA GUIDE */}
            {selectedAirportGuide === 'TPA' && (
              <div className="space-y-6">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <strong className="font-bold">Distância até os Parques em Orlando:</strong> ~1h15 de viagem de carro (via rodovia I-4 East). Muito perto do Busch Gardens em Tampa e rápido acesso à Disney!
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Step 1 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      1
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Imigração Rápida em Tampa
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      O Aeroporto de Tampa é considerado um dos mais ágeis da Flórida. As filas de imigração e alfândega costumam ser bem mais curtas!
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      2
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Monotrilho SkyConnect & Malas
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      O trem SkyConnect leva do terminal até o centro de locadoras em menos de 5 minutos com toda praticidade.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A2B4C] text-white font-bold flex items-center justify-center text-sm font-serif">
                      3
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] font-serif">
                      Viagem Direta pela I-4 East
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      De Tampa para a Disney é um trajeto reto pela rodovia I-4 East, passando perto do Busch Gardens no caminho!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Pro Tip Callout */}
            <div className="p-5 rounded-xl bg-[#1A2B4C] text-white flex items-start gap-4 border border-[#D4AF37]/30">
              <Sparkles className="w-6 h-6 text-[#D4AF37] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <span className="font-bold uppercase text-[#D4AF37] tracking-wider block">
                  Dica Especial KingdomCompass para Vôos Noturnos ou com Conexão
                </span>
                <p className="text-slate-200 leading-relaxed">
                  Se o seu voo chegar em Orlando, Miami ou Tampa bem cedo pela manhã (ex: 6h40 AM), os quartos do hotel podem ainda não estar prontos para check-in. Você pode ir direto ao resort, fazer o pré-check-in no balcão, deixar todas as malas guardadas gratuitamente com o <strong>Bell Services</strong> e já seguir para curtir o Disney Springs ou a piscina do resort!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BAGGAGE RULES & TSA REGULATIONS */}
      {activeTabSub === 'baggage_rules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                <Luggage className="w-4 h-4" />
                <span>Normas Internacionais de Aviação</span>
              </div>
              <h2 className="text-2xl font-bold font-serif text-[#1A2B4C] mt-1">
                Franquia de Bagagem & Segurança da TSA nos EUA
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
                Evite taxas extras e retenção de itens nos raio-x dos aeroportos seguindo as especificações padrão das companhias aéreas e da Transportation Security Administration (TSA).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Item Pessoal */}
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-[#1A2B4C] font-bold text-sm font-serif">
                  <span>🎒</span>
                  <h3>Item Pessoal (Personal Item)</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Gratuito em todas as tarifas. Deve ser acomodado obrigatoriamente <strong>embaixo do assento à sua frente</strong>.
                </p>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                  <p><strong>Exemplos:</strong> Mochila pequena, bolsa de mão, pasta de notebook.</p>
                  <p><strong>Dimensões máx:</strong> 45 x 35 x 20 cm.</p>
                </div>
              </div>

              {/* Mala de Mão */}
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-[#1A2B4C] font-bold text-sm font-serif">
                  <span>🧳</span>
                  <h3>Mala de Mão (Carry-On)</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Acomodada no compartimento superior (bin) da cabine.
                </p>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                  <p><strong>Peso máximo:</strong> 10 kg por passageiro.</p>
                  <p><strong>Dimensões máx:</strong> 55 x 35 x 25 cm (com rodinhas).</p>
                </div>
              </div>

              {/* Mala Despachada */}
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-[#1A2B4C] font-bold text-sm font-serif">
                  <span>📦</span>
                  <h3>Mala Despachada (Checked Bag)</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Entregue no balcão de check-in e enviada ao porão da aeronave.
                </p>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                  <p><strong>Peso máximo:</strong> 23 kg (50 lbs).</p>
                  <p><strong>Atenção:</strong> Malas com peso de 24kg a 32kg pagam taxa pesada de excesso de bagagem!</p>
                </div>
              </div>
            </div>

            {/* TSA Safety Alert Box */}
            <div className="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Regras Críticas da TSA para Raio-X & Bagagem</span>
              </div>
              <ul className="space-y-1.5 text-xs text-rose-800 leading-relaxed pl-1">
                <li>• <strong>Líquidos na Mala de Mão:</strong> Todos os recipientes de líquidos, géis e perfumes devem ter no máximo 100ml e caber em 1 saquinho plástico transparente vedado de até 1 Litro.</li>
                <li>• <strong>Baterias de Lítio e Powerbanks:</strong> PROIBIDO despachar na mala grande! Carregadores portáteis e baterias sobressalentes DEVEM ir obrigatoriamente na mala de mão.</li>
                <li>• <strong>Cadeados TSA:</strong> Na mala despachada, use exclusivamente cadeados com selo TSA (diamante vermelho) para que agentes alfandegários possam inspecionar a mala sem quebrar o fecho.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT FLIGHT */}
      {modalOpen && (
        <div
          onClick={handleFlightModalBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Plane className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    {editingFlight ? 'Edição de Trecho Aéreo' : 'Novo Cadastro de Voo'} • {formData.typeLabel}
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    {editingFlight ? 'Editar Voo / Trecho' : 'Cadastrar Novo Voo / Trecho'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFlight} className="flex flex-col flex-1 min-h-0 overflow-hidden text-slate-700">
              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              {/* 1. INFORMAÇÕES BÁSICAS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  1. Informações Básicas do Voo (Tipo, Cia & PNR)
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  {/* Type Label */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo do Trecho</label>
                    <select
                      value={formData.typeLabel}
                      onChange={(e) => {
                        const val = e.target.value;
                        let typeVal: 'outbound' | 'inbound' | 'connection' | 'extra' = 'outbound';
                        if (val.includes('Volta')) typeVal = 'inbound';
                        if (val.includes('Conexão')) typeVal = 'connection';
                        if (val.includes('Interno')) typeVal = 'extra';

                        setFormData({ ...formData, typeLabel: val, type: typeVal });
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer"
                    >
                      <option value="Voo de Ida">Voo de Ida</option>
                      <option value="Voo de Volta">Voo de Volta</option>
                      <option value="Conexão / Escala">Conexão / Escala</option>
                      <option value="Voo Interno / Extra">Voo Interno / Extra</option>
                    </select>
                  </div>

                  {/* Airline */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Companhia Aérea</label>
                    <input
                      type="text"
                      value={formData.airline}
                      onChange={(e) => setFormData({ ...formData, airline: e.target.value })}
                      placeholder="Ex: LATAM Airlines, Azul, American Airlines"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      required
                    />
                  </div>

                  {/* Flight Number */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Número do Voo</label>
                    <input
                      type="text"
                      value={formData.flightNumber}
                      onChange={(e) => setFormData({ ...formData, flightNumber: e.target.value.toUpperCase() })}
                      placeholder="Ex: LA8126"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      required
                    />
                  </div>

                  {/* PNR Locator */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Localizador de Reserva (PNR)</label>
                    <input
                      type="text"
                      value={formData.pnrLocator}
                      onChange={(e) => setFormData({ ...formData, pnrLocator: e.target.value.toUpperCase() })}
                      placeholder="Ex: K9X2PZ"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                    />
                  </div>
                </div>
              </div>

              {/* 2. ROTA: ORIGEM & DESTINO */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  2. Rota: Origem & Destino (Aeroportos)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-600">Aeroporto de Origem</label>
                      {formData.originAirport && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, originAirport: '', originCity: '', originCode: '' })}
                          className="text-[10px] text-rose-600 hover:underline cursor-pointer font-semibold"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formData.originAirport}
                      onChange={(e) => setFormData({ ...formData, originAirport: e.target.value })}
                      placeholder="Ex: São Paulo - Guarulhos (GRU)"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      required
                    />
                    {/* Origin Quick Presets */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(formData.type === 'inbound'
                        ? [
                            { label: '✈️ Orlando (MCO)', airport: 'Orlando International Airport (MCO)', city: 'Orlando', code: 'MCO', isFlorida: true },
                            { label: '✈️ Miami (MIA)', airport: 'Miami International Airport (MIA)', city: 'Miami', code: 'MIA', isFlorida: true },
                            { label: '✈️ Tampa (TPA)', airport: 'Tampa International Airport (TPA)', city: 'Tampa', code: 'TPA', isFlorida: true },
                            { label: '✈️ Fort Lauderdale (FLL)', airport: 'Fort Lauderdale-Hollywood Int (FLL)', city: 'Fort Lauderdale', code: 'FLL', isFlorida: true },
                          ]
                        : [
                            { label: 'GRU (Guarulhos)', airport: 'São Paulo - Guarulhos (GRU)', city: 'São Paulo', code: 'GRU', isFlorida: false },
                            { label: 'VCP (Viracopos)', airport: 'Campinas - Viracopos (VCP)', city: 'Campinas', code: 'VCP', isFlorida: false },
                            { label: 'GIG (Galeão)', airport: 'Rio de Janeiro - Galeão (GIG)', city: 'Rio de Janeiro', code: 'GIG', isFlorida: false },
                            { label: 'BSB (Brasília)', airport: 'Brasília (BSB)', city: 'Brasília', code: 'BSB', isFlorida: false },
                          ]
                      ).map((item) => {
                        const isSelected = formData.originCode === item.code || formData.originAirport.includes(item.code);
                        const btnClass = item.isFlorida
                          ? (isSelected 
                              ? 'bg-[#D4AF37] text-[#1A2B4C] font-bold ring-2 ring-[#1A2B4C]/20' 
                              : 'bg-amber-50 hover:bg-[#1A2B4C] hover:text-white text-amber-900 border border-amber-200 font-bold')
                          : (isSelected
                              ? 'bg-[#1A2B4C] text-white font-semibold ring-2 ring-[#D4AF37]/40'
                              : 'bg-slate-100 hover:bg-[#1A2B4C] hover:text-white text-slate-700 font-semibold');
                        return (
                          <button
                            key={item.code}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setFormData({
                                  ...formData,
                                  originAirport: '',
                                  originCity: '',
                                  originCode: '',
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  originAirport: item.airport,
                                  originCity: item.city,
                                  originCode: item.code,
                                });
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] transition-all cursor-pointer ${btnClass}`}
                            title={isSelected ? "Clique para deselecionar" : "Clique para selecionar"}
                          >
                            {item.label} {isSelected && '✕'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-600">Aeroporto de Destino (Chegada)</label>
                      {formData.destinationAirport && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, destinationAirport: '', destinationCity: '', destinationCode: '' })}
                          className="text-[10px] text-rose-600 hover:underline cursor-pointer font-semibold"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formData.destinationAirport}
                      onChange={(e) => setFormData({ ...formData, destinationAirport: e.target.value })}
                      placeholder="Ex: Orlando International (MCO), Miami (MIA) ou Tampa (TPA)"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      required
                    />
                    {/* Destination Airport Presets */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(formData.type === 'inbound'
                        ? [
                            { label: 'GRU (Guarulhos)', airport: 'São Paulo - Guarulhos (GRU)', city: 'São Paulo', code: 'GRU', isFlorida: false },
                            { label: 'VCP (Viracopos)', airport: 'Campinas - Viracopos (VCP)', city: 'Campinas', code: 'VCP', isFlorida: false },
                            { label: 'GIG (Galeão)', airport: 'Rio de Janeiro - Galeão (GIG)', city: 'Rio de Janeiro', code: 'GIG', isFlorida: false },
                            { label: 'BSB (Brasília)', airport: 'Brasília (BSB)', city: 'Brasília', code: 'BSB', isFlorida: false },
                          ]
                        : [
                            { label: '✈️ Orlando (MCO)', airport: 'Orlando International Airport (MCO)', city: 'Orlando', code: 'MCO', isFlorida: true },
                            { label: '✈️ Miami (MIA)', airport: 'Miami International Airport (MIA)', city: 'Miami', code: 'MIA', isFlorida: true },
                            { label: '✈️ Tampa (TPA)', airport: 'Tampa International Airport (TPA)', city: 'Tampa', code: 'TPA', isFlorida: true },
                            { label: '✈️ Fort Lauderdale (FLL)', airport: 'Fort Lauderdale-Hollywood Int (FLL)', city: 'Fort Lauderdale', code: 'FLL', isFlorida: true },
                          ]
                      ).map((item) => {
                        const isSelected = formData.destinationCode === item.code || formData.destinationAirport.includes(item.code);
                        const btnClass = item.isFlorida
                          ? (isSelected 
                              ? 'bg-[#D4AF37] text-[#1A2B4C] font-bold ring-2 ring-[#1A2B4C]/20' 
                              : 'bg-amber-50 hover:bg-[#1A2B4C] hover:text-white text-amber-900 border border-amber-200 font-bold')
                          : (isSelected
                              ? 'bg-[#1A2B4C] text-white font-semibold ring-2 ring-[#D4AF37]/40'
                              : 'bg-slate-100 hover:bg-[#1A2B4C] hover:text-white text-slate-700 font-semibold');
                        return (
                          <button
                            key={item.code}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setFormData({
                                  ...formData,
                                  destinationAirport: '',
                                  destinationCity: '',
                                  destinationCode: '',
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  destinationAirport: item.airport,
                                  destinationCity: item.city,
                                  destinationCode: item.code,
                                });
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] transition-all cursor-pointer ${btnClass}`}
                            title={isSelected ? "Clique para deselecionar" : "Clique para selecionar"}
                          >
                            {item.label} {isSelected && '✕'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. DATAS & HORÁRIOS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  3. Datas & Horários (Partida & Chegada)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Data & Hora de Partida</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formData.departureDate}
                        onChange={(e) => setFormData({ ...formData, departureDate: e.target.value })}
                        min={tripMinDate}
                        max={tripMaxDate}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      />
                      <input
                        type="time"
                        value={formData.departureTime}
                        onChange={(e) => setFormData({ ...formData, departureTime: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Data & Hora de Chegada</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formData.arrivalDate}
                        onChange={(e) => setFormData({ ...formData, arrivalDate: e.target.value })}
                        min={tripMinDate}
                        max={tripMaxDate}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      />
                      <input
                        type="time"
                        value={formData.arrivalTime}
                        onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. CLASSE, ASSENTOS & CONEXÕES */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  4. Classe, Assentos & Conexões
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Classe de Cabine</label>
                    <select
                      value={formData.cabinClass}
                      onChange={(e) => setFormData({ ...formData, cabinClass: e.target.value as any })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer"
                    >
                      <option value="Econômica">Econômica</option>
                      <option value="Premium Economy">Premium Economy</option>
                      <option value="Executiva">Executiva</option>
                      <option value="Primeira Classe">Primeira Classe</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Assentos do Grupo</label>
                    <input
                      type="text"
                      value={formData.seats}
                      onChange={(e) => setFormData({ ...formData, seats: e.target.value })}
                      placeholder="Ex: 14A, 14B, 14C"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Escalas / Conexões</label>
                    <input
                      type="text"
                      value={formData.stopovers}
                      onChange={(e) => setFormData({ ...formData, stopovers: e.target.value })}
                      placeholder="Ex: Voo Direto ou 1 parada em Miami"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                    />
                  </div>
                </div>
              </div>

              {/* 5. VIAJANTES DO PACOTE */}
              <TravelerSelector
                label="5. Viajantes do Pacote & Passageiros"
                travelers={settings.travelers || []}
                selectedIds={formData.travelerIds || ['all']}
                onChange={(ids) => {
                  const travelers = settings.travelers || [];
                  const passengers = ids.includes('all')
                    ? travelers.map(t => t.name)
                    : travelers.filter(t => ids.includes(t.id)).map(t => t.name);
                  
                  const q = ids.includes('all') ? travelers.length : ids.length;
                  const unitUSD = parseInputToNumber(unitCostUSD);
                  const unitBRL = parseInputToNumber(unitCostBRL);
                  const rate = settings.dollarRate || 5.75;

                  setFormData({ 
                    ...formData, 
                    travelerIds: ids, 
                    passengers,
                    ticketCostUSD: unitUSD * q,
                    ticketCostBRL: unitBRL * q
                  });
                }}
              />

              {/* 6. FRANQUIA DE BAGAGEM & CUSTOS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  6. Franquia de Bagagem & Custos
                </label>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Malas de Mão (10kg por pessoa)</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.baggageAllowance.carryOnQty}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            baggageAllowance: {
                              ...formData.baggageAllowance,
                              carryOnQty: parseInt(e.target.value, 10) || 0,
                            },
                          })
                        }
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Malas Despachadas (23kg por pessoa)</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.baggageAllowance.checkedQty}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            baggageAllowance: {
                              ...formData.baggageAllowance,
                              checkedQty: parseInt(e.target.value, 10) || 0,
                            },
                          })
                        }
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                      />
                    </div>
                  </div>

                  {/* Unit Costs & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                        Valor a Pagar (US$)
                        <span className="text-[9px] text-slate-400 font-mono">USD/pessoa</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">$</span>
                        <input
                          type="text"
                          value={unitCostUSD}
                          onChange={(e) => {
                            const val = e.target.value;
                            setUnitCostUSD(val);
                            const usd = parseInputToNumber(val);
                            const rate = settings.dollarRate || 5.75;
                            const brl = usd * rate;
                            setUnitCostBRL(brl.toFixed(2).replace('.', ','));
                            
                            const travelers = settings.travelers || [];
                            const q = (formData.travelerIds?.includes('all') ? travelers.length : formData.travelerIds?.length) || travelers.length || 1;
                            setFormData({
                              ...formData,
                              ticketCostUSD: usd * q,
                              ticketCostBRL: Math.round(usd * q * rate * 100) / 100
                            });
                          }}
                          placeholder="0,00"
                          className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                        Valor a Pagar (R$)
                        <span className="text-[9px] text-slate-400 font-mono">BRL/pessoa</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                        <input
                          type="text"
                          value={unitCostBRL}
                          onChange={(e) => {
                            const val = e.target.value;
                            setUnitCostBRL(val);
                            const brl = parseInputToNumber(val);
                            const rate = settings.dollarRate || 5.75;
                            const usd = rate > 0 ? brl / rate : 0;
                            setUnitCostUSD(usd.toFixed(2).replace('.', ','));

                            const travelers = settings.travelers || [];
                            const q = (formData.travelerIds?.includes('all') ? travelers.length : formData.travelerIds?.length) || travelers.length || 1;
                            setFormData({
                              ...formData,
                              ticketCostBRL: brl * q,
                              ticketCostUSD: Math.round((brl * q / rate) * 100) / 100
                            });
                          }}
                          placeholder="0,00"
                          className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                        Status do Pagamento
                        <span className="opacity-0 text-[9px] font-mono">_</span>
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer h-[38px]"
                      >
                        <option value="Emitido / Confirmado">✅ Emitido / Confirmado</option>
                        <option value="Check-in Aberto">💡 Check-in Aberto</option>
                        <option value="Check-in Realizado">✔️ Check-in Realizado</option>
                        <option value="Embarcado">✈️ Embarcado</option>
                        <option value="Concluído">🏁 Concluído</option>
                      </select>
                    </div>
                  </div>

                  {/* Summary Calculations & Payer */}
                  <div className="pt-4 border-t border-slate-200/60 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#2A437E]" />
                        <span>
                          Subtotal para <strong className="text-slate-800">
                            {(formData.travelerIds?.includes('all') ? settings.travelers?.length : formData.travelerIds?.length) || settings.travelers?.length || 1}
                          </strong> {((formData.travelerIds?.includes('all') ? settings.travelers?.length : formData.travelerIds?.length) || settings.travelers?.length || 1) === 1 ? 'passagem' : 'passagens'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 flex flex-col items-end min-w-[100px]">
                          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">Total USD</span>
                          <span className="text-xs font-mono font-bold text-emerald-700">
                            US$ {(formData.ticketCostUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 flex flex-col items-end min-w-[100px]">
                          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">Total BRL</span>
                          <span className="text-xs font-mono font-bold text-[#1A2B4C]">
                            R$ {(formData.ticketCostBRL || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                        <label className="text-[11px] font-bold text-slate-700">Responsável pelo Pagamento</label>
                      </div>
                      <select
                        value={formData.payerId || 'all'}
                        onChange={(e) => setFormData({ ...formData, payerId: e.target.value })}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 min-w-[200px]"
                      >
                        <option value="all">👥 Dividido pelo grupo</option>
                        {settings.travelers.map((t) => (
                          <option key={t.id} value={t.id}>👤 {t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 7. OBSERVAÇÕES */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  7. Observações & Dicas do Voo
                </label>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Ex: Levar travesseiro de pescoço, fones de ouvido P2 para o entretenimento de bordo, passaportes na mochila."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 h-24"
                  />
                </div>
              </div>

              </div>

              {/* Modal Actions */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                {editingFlight && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingFlight;
                      setModalOpen(false);
                      setFlightToDelete(target);
                    }}
                    className="mr-auto px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <CheckCircle2 className={`w-4 h-4 ${isSaving ? 'text-white' : 'text-[#D4AF37]'}`} />
                  <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ATTACHMENT UPLOAD */}
      {attModalFlightId && (
        <div
          onClick={handleAttModalBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
        >
          <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Paperclip className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Documentos & Passagens Aéreas
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Anexar Bilhete / Cartão de Embarque
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAttModalFlightId(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAttachment} className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs">
              <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome do Documento / Voucher</label>
                  <input
                    type="text"
                    value={newAttName}
                    onChange={(e) => setNewAttName(e.target.value)}
                    placeholder="Ex: Bilhetes_Eletronicos_LATAM_Ida.pdf"
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Arquivo</label>
                  <select
                    value={newAttType}
                    onChange={(e) => setNewAttType(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                  >
                    <option value="pdf">Documento PDF (e-Ticket)</option>
                    <option value="ticket">Cartão de Embarque / Wallet</option>
                    <option value="image">Imagem / Captura de Tela</option>
                  </select>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[11px] leading-relaxed">
                  ℹ️ No ambiente simulado KingdomCompass, o voucher fica vinculado de forma segura e sincronizada com todos os viajantes da família.
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setAttModalFlightId(null)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAtt}
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <CheckCircle2 className={`w-4 h-4 ${isSavingAtt ? 'text-white' : 'text-[#D4AF37]'}`} />
                  <span>{isSavingAtt ? 'Salvando...' : 'Salvar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE FLIGHT */}
      {flightToDelete && (
        <div
          onClick={() => setFlightToDelete(null)}
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
                <h3 className="font-bold text-slate-900 text-base">Excluir Passagem Aérea?</h3>
                <p className="text-xs text-slate-500">Esta ação removerá o voo e seus horários do roteiro.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{flightToDelete.airline} ({flightToDelete.flightNumber})</span>
              </div>
              <p className="text-slate-600 font-medium">
                {formatFlightRoute(flightToDelete)}
              </p>
              {flightToDelete.pnrLocator && (
                <p className="text-slate-400 font-mono text-[11px]">Localizador: #{flightToDelete.pnrLocator}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFlightToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteFlight(flightToDelete.id);
                  setFlightToDelete(null);
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
