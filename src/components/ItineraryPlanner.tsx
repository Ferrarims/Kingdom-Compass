import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Sun,
  Sunset,
  Moon,
  Utensils,
  MapPin,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  FileText,
  Paperclip,
  Printer,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Edit3,
  Download,
  Share2,
  Ticket,
  Zap,
  Hotel,
  Home,
  Car,
  Plane,
  Search,
  Check,
  X,
  Layers,
  ShoppingBag,
  Info,
  SlidersHorizontal,
  Compass,
  AlertCircle,
  Terminal,
  Camera,
} from 'lucide-react';
import {
  usePlanner,
  formatDisplayDate,
  getTripEndDate,
  getAutofillForDay,
  isDateInPast,
  isDateToday,
  isDateTimeInPast,
  isDayEffectivelyCompleted,
  isScheduleItemEffectivelyCompleted,
} from '../context/PlannerContext';
import { PARKS_GUIDE_DATA } from '../data/initialData';
import { HourlyScheduleItem, ItineraryDay, FlightSegment } from '../types';
import { isDayWithPark, isNonParkEvent, clearParkReferencesFromDay, compareScheduleItemOrder, deduplicateHourlySchedule } from '../utils/parkScheduleUtils';
import { ParkBookingModal } from './ParkBookingModal';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { SupabaseService } from '../services/supabaseService';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { generateUUID } from '../utils/uuid';

const cleanText = (text?: string): string => {
  if (!text) return '';
  return text.replace(/^sugest[ãa]o:\s*/i, '').trim();
};

export const isArrivalInBrazilDay = (day: any): boolean => {
  if (!day) return false;

  const titleLower = (day.title || '').toLowerCase();
  const parkLower = (day.park || '').toLowerCase();

  const isTitleTripEnd =
    titleLower.includes('fim da viagem') ||
    titleLower.includes('chegada no brasil') ||
    titleLower.includes('chegada ao brasil') ||
    titleLower.includes('desembarque no brasil') ||
    titleLower.includes('desembarque em guarulhos') ||
    titleLower.includes('desembarque em sp') ||
    titleLower.includes('retorno ao brasil') ||
    titleLower.includes('pouso no brasil') ||
    parkLower.includes('fim da viagem') ||
    parkLower.includes('chegada no brasil');

  if (isTitleTripEnd) return true;

  const sched = day.hourlySchedule || [];
  if (sched.length > 0) {
    const hasBrazilArrival = sched.some((item: any) => {
      const t = (item.title || '').toLowerCase();
      const loc = (item.location || '').toLowerCase();
      return (
        (t.includes('chegada em') || t.includes('pouso em') || t.includes('desembarque em')) &&
        (loc.includes('guarulhos') || loc.includes('gru') || loc.includes('são paulo') || loc.includes('rio de janeiro') || loc.includes('gig') || loc.includes('brasil'))
      );
    });

    const hasOrlandoDeparture = sched.some((item: any) => {
      const t = (item.title || '').toLowerCase();
      return t.includes('decolagem') || t.includes('sair do hotel') || t.includes('mco') || t.includes('orlando');
    });

    if (hasBrazilArrival && !hasOrlandoDeparture) {
      return true;
    }
  }

  return false;
};

const isPeriodProgrammed = (day: any, periodKey?: 'morning' | 'afternoon' | 'night'): boolean => {
  if (!day) return false;

  // 1. Theme park assigned
  if (day.park && day.park !== 'Sem Parque' && !/^(sem parque|descanso|livre|compras)$/i.test(day.park)) {
    return true;
  }

  // 2. Scheduled hourly items or park booking
  if (day.hourlySchedule && day.hourlySchedule.length > 0) return true;
  if (day.parkBooking) return true;

  // 3. Flight / Arrival / Departure / Registered activity keywords
  const titleText = (day.title || '').toLowerCase();
  const whereText = periodKey ? (day[periodKey]?.where || '').toLowerCase() : `${day.morning?.where || ''} ${day.afternoon?.where || ''} ${day.night?.where || ''}`.toLowerCase();
  const diningText = periodKey ? (day[periodKey]?.dining || '').toLowerCase() : `${day.morning?.dining || ''} ${day.afternoon?.dining || ''} ${day.night?.dining || ''}`.toLowerCase();
  const notesText = periodKey ? (day[periodKey]?.notes || '').toLowerCase() : `${day.morning?.notes || ''} ${day.afternoon?.notes || ''} ${day.night?.notes || ''}`.toLowerCase();

  const combined = `${titleText} ${whereText} ${diningText} ${notesText}`;

  const flightAndEventKeywords = [
    'voo', 'flight', 'desembarque', 'embarque', 'check-in', 'checkin', 'aeroporto',
    'mco', 'arajet', 'latam', 'gol', 'azul', 'american', 'delta', 'united', 'copa',
    'transfer', 'uber', 'locadora', 'retirada', 'devolução', 'chegada', 'partida',
    'reserva', 'ingresso', 'ticket', 'agendado', 'agendamento'
  ];

  if (flightAndEventKeywords.some(kw => combined.includes(kw))) {
    return true;
  }

  return false;
};

export const ItineraryPlanner: React.FC = () => {
  const {
    itineraryDays,
    updateItineraryDay,
    saveHourlyScheduleItem,
    deleteHourlyScheduleItem,
    toggleDayCompleted,
    addItineraryDay,
    deleteItineraryDay,
    addAttachmentToDay,
    removeAttachmentFromDay,
    settings,
    currentUser,
    flights,
    carRentals,
    accommodations,
    expenses,
    parkTickets,
    daysCountdown,
    openOverviewModal,
  } = usePlanner();

  // Selected Day & View Mode State
  const [selectedDayId, setSelectedDayId] = useState<string>(itineraryDays[0]?.id || '');
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single'); // 'single' day focus or 'all' days list
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAllDayIds, setExpandedAllDayIds] = useState<Record<string, boolean>>({});

  // Sync selected day with list
  const prevLengthRef = React.useRef(itineraryDays.length);
  React.useEffect(() => {
    if (itineraryDays.length > prevLengthRef.current) {
      const lastDay = itineraryDays[itineraryDays.length - 1];
      if (lastDay) {
        setSelectedDayId(lastDay.id);
        setSelectedDayNumber(lastDay.dayNumber);
      }
    } else if (!selectedDayId || !itineraryDays.some((d) => d.id === selectedDayId)) {
      const foundByNum = itineraryDays.find((d) => d.dayNumber === selectedDayNumber);
      if (foundByNum) {
        setSelectedDayId(foundByNum.id);
      } else if (itineraryDays[0]) {
        setSelectedDayId(itineraryDays[0].id);
        setSelectedDayNumber(itineraryDays[0].dayNumber);
      }
    }
    prevLengthRef.current = itineraryDays.length;
  }, [itineraryDays, selectedDayId, selectedDayNumber]);

  // Modals state
  const [newAttName, setNewAttName] = useState('');
  const [newAttType, setNewAttType] = useState<'pdf' | 'ticket' | 'image'>('pdf');
  const [attModalOpen, setAttModalOpen] = useState(false);

  // Park Change Quick Modal
  const [parkModalOpen, setParkModalOpen] = useState(false);
  const [parkModalTargetDayId, setParkModalTargetDayId] = useState<string>('');
  const [fullParkBookingOpen, setFullParkBookingOpen] = useState(false);
  const [fullParkBookingInitialTab, setFullParkBookingInitialTab] = useState<'general' | 'fastpass' | 'dining' | 'shows' | 'photos'>('general');

  const handleOpenFullParkBooking = (tab: 'general' | 'fastpass' | 'dining' | 'shows' | 'photos' = 'general') => {
    setFullParkBookingInitialTab(tab);
    setFullParkBookingOpen(true);
  };
  const [tempDayTitle, setTempDayTitle] = useState('');
  const [tempDayPark, setTempDayPark] = useState('');
  const [tempDayGeneralNotes, setTempDayGeneralNotes] = useState('');

  // Hourly Item Modal state (Add / Edit)
  const [isHourlyModalOpen, setIsHourlyModalOpen] = useState(false);
  const [hourlyTargetDayId, setHourlyTargetDayId] = useState<string>('');
  const [editingHourlyItemId, setEditingHourlyItemId] = useState<string | null>(null);
  const [hourlyForm, setHourlyForm] = useState({
    time: '08:00',
    title: '',
    location: '',
    category: 'park' as HourlyScheduleItem['category'],
    notes: '',
  });

  // PDF Export Modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState<'all' | 'selected'>('all');


  const [overviewSearchQuery, setOverviewSearchQuery] = useState('');

  const photoPackagesList = React.useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      complex?: string;
      code?: string;
      type?: string;
      status?: string;
      notes?: string;
      parks?: string[];
      source?: string;
    }> = [];

    const seenKeys = new Set<string>();

    (itineraryDays || []).forEach((d) => {
      const pb = d.parkBooking;
      if (pb?.photoPackage) {
        const pkg = pb.photoPackage;
        const key = pkg.id || `pkg-${pkg.name}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: key,
            name: pkg.name || 'Pacote de Fotos',
            complex: pkg.complex || (d.park.includes('Disney') ? 'Disney' : d.park.includes('Universal') ? 'Universal' : 'SeaWorld'),
            code: pkg.confirmationCode,
            type: pkg.type,
            status: pkg.status || 'Ativo',
            notes: pkg.notes || pkg.validityDescription,
            parks: pkg.includedParks,
            source: `Dia ${d.dayNumber} (${d.park})`,
          });
        }
      } else if (pb?.hasPhotoPackage) {
        const key = `day-photo-${d.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: key,
            name: `Pacote de Fotos / PhotoPass`,
            complex: d.park.includes('Disney') ? 'Disney' : d.park.includes('Universal') ? 'Universal' : 'SeaWorld',
            code: pb.confirmationCode,
            status: 'Ativo',
            source: `Dia ${d.dayNumber} (${d.park})`,
          });
        }
      }
    });

    (expenses || []).forEach((exp) => {
      if ((exp.category === 'Pacotes de Fotos' || exp.sourceType === 'photo_package') && !exp.excluded) {
        const key = exp.sourceId || exp.id;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: key,
            name: exp.title,
            complex: exp.title.toLowerCase().includes('disney') ? 'Disney' : exp.title.toLowerCase().includes('universal') ? 'Universal' : 'Outro',
            status: exp.status === 'Pago' ? 'Confirmado' : 'Pendente',
            notes: exp.notes,
            source: 'Financeiro / Despesas',
          });
        }
      }
    });

    (parkTickets || []).forEach((tk) => {
      const titleLower = (tk.title || '').toLowerCase();
      if (titleLower.includes('foto') || titleLower.includes('photo') || titleLower.includes('memory maker')) {
        const key = tk.id;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: key,
            name: tk.title,
            complex: tk.complex,
            code: tk.confirmationCode,
            status: tk.paymentStatus || 'Pago',
            notes: tk.notes,
            parks: tk.parksIncluded,
            source: 'Ingressos Comprados',
          });
        }
      }
    });

    return list;
  }, [itineraryDays, expenses, parkTickets]);

  const getDayPhotoPackage = React.useCallback(
    (day: ItineraryDay) => {
      if (!day) return null;
      if (day.parkBooking?.photoPackage) {
        const pkg = day.parkBooking.photoPackage;
        return {
          name: pkg.name || 'Pacote de Fotos (PhotoPass / Memory Maker)',
          code: pkg.confirmationCode,
          complex: pkg.complex || (day.park?.includes('Disney') ? 'Disney' : day.park?.includes('Universal') ? 'Universal' : 'Outro'),
          details: pkg.validityDescription || pkg.notes,
        };
      }
      if (day.parkBooking?.hasPhotoPackage) {
        return {
          name: 'Pacote de Fotos (PhotoPass / Memory Maker)',
          code: day.parkBooking.confirmationCode,
          complex: day.park?.includes('Disney') ? 'Disney' : day.park?.includes('Universal') ? 'Universal' : 'Outro',
          details: 'Ativo para este dia de parque',
        };
      }

      if (!day.park || day.park === 'Sem Parque' || day.park === 'Livre' || !isDayWithPark(day)) return null;

      const parkLower = day.park.toLowerCase();
      const parkComplex = parkLower.includes('disney') || parkLower.includes('kingdom') || parkLower.includes('epcot') || parkLower.includes('hollywood') || parkLower.includes('blizzard') || parkLower.includes('typhoon')
        ? 'disney'
        : parkLower.includes('universal') || parkLower.includes('volcano') || parkLower.includes('epic') || parkLower.includes('adventure') || parkLower.includes('studios')
        ? 'universal'
        : parkLower.includes('seaworld') || parkLower.includes('busch') || parkLower.includes('aquatica') || parkLower.includes('discovery')
        ? 'seaworld'
        : 'outro';

      const matched = photoPackagesList.find((pkg) => {
        const pkgComplex = (pkg.complex || '').toLowerCase();
        const pkgName = (pkg.name || '').toLowerCase();
        if (pkgComplex && pkgComplex !== 'outro') {
          if (pkgComplex.includes(parkComplex) || parkComplex.includes(pkgComplex)) return true;
        }
        if (pkgName.includes(parkComplex) || (parkComplex === 'disney' && (pkgName.includes('memory') || pkgName.includes('photopass')))) return true;
        if (pkg.parks && pkg.parks.some((p) => p.toLowerCase().includes(parkLower) || parkLower.includes(p.toLowerCase()))) return true;
        return false;
      });

      if (matched) {
        return {
          name: matched.name,
          code: matched.code,
          complex: matched.complex,
          details: matched.notes || (matched.complex ? `Pacote ${matched.complex} Ativo` : 'Pacote de Fotos Ativo'),
        };
      }

      if (photoPackagesList.length > 0 && isDayWithPark(day)) {
        const firstPkg = photoPackagesList[0];
        return {
          name: firstPkg.name,
          code: firstPkg.code,
          complex: firstPkg.complex,
          details: firstPkg.notes || 'Pacote de Fotos da Viagem Ativo',
        };
      }

      return null;
    },
    [photoPackagesList]
  );

  // Confirmation states
  const [confirmDelete, setConfirmDelete] = useState<{ dayId: string; itemId: string; title: string } | null>(null);
  const [confirmAutoFill, setConfirmAutoFill] = useState(false);

  useConfirmationKeyboard({
    isOpen: !!confirmDelete,
    onConfirm: () => {
      if (confirmDelete) {
        handleDeleteScheduleItem(confirmDelete.dayId, confirmDelete.itemId);
        setConfirmDelete(null);
      }
    },
    onCancel: () => setConfirmDelete(null),
  });

  useConfirmationKeyboard({
    isOpen: confirmAutoFill,
    onConfirm: () => {
      handleAutoFillAllDays();
      setConfirmAutoFill(false);
    },
    onCancel: () => setConfirmAutoFill(false),
  });

  const activeDay: ItineraryDay =
    itineraryDays.find((d) => d.id === selectedDayId) ||
    itineraryDays.find((d) => d.dayNumber === selectedDayNumber) ||
    itineraryDays[0] ||
    ({
      id: 'day-1',
      dayNumber: 1,
      date: '2026-12-30',
      title: 'Chegada',
      park: 'Sem Parque',
      completed: false,
      morning: { where: '', dining: '', notes: '' },
      afternoon: { where: '', dining: '', notes: '' },
      night: { where: '', dining: '', notes: '' },
      generalNotes: '',
      hourlySchedule: [],
      attachments: [],
    } as ItineraryDay);

  const currentDayIndex = itineraryDays.findIndex((d) => d.id === activeDay.id || d.dayNumber === activeDay.dayNumber);
  const hasPrevDay = currentDayIndex > 0;
  const hasNextDay = currentDayIndex >= 0 && currentDayIndex < itineraryDays.length - 1;

  // Helper: Find accommodation for a given day
  const getAccommodationForDay = (dayDate: string, dayNum: number) => {
    if (!accommodations || accommodations.length === 0) return null;
    if (!settings.isFlexibleDates && dayDate) {
      const found = accommodations.find((a) => {
        return dayDate >= a.checkInDate && dayDate <= a.checkOutDate;
      });
      if (found) return found;
      return null;
    }
    return null;
  };

  // Helper: Find car rental info
  const carRentalInfo = carRentals && carRentals.length > 0 ? carRentals[0] : null;
  const outboundFlight = flights.find((f) => f.type === 'outbound');
  const inboundFlight = flights.find((f) => f.type === 'inbound');

  // Helper: Group duplicate flight tickets (e.g. bought separately per passenger) into single route items with combined PNRs
  const groupedFlightSegments = useMemo(() => {
    if (!flights || flights.length === 0) return [];

    const norm = (s?: string) => (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const groups: { [key: string]: { flight: FlightSegment; pnrs: Set<string>; passengers: Set<string> } } = {};

    flights.forEach((f) => {
      const airline = norm(f.airline);
      const flightNumber = norm(f.flightNumber);
      const origin = norm(f.originCode || f.originAirport || f.originCity);
      const dest = norm(f.destinationCode || f.destinationAirport || f.destinationCity);
      const depDate = norm(f.departureDate);
      const depTime = norm(f.departureTime);
      const type = norm(f.type);

      // Primary key by flight number + date + route/type
      let groupKey = '';
      if (flightNumber) {
        groupKey = `${type}_${airline}_${flightNumber}_${depDate}_${origin}_${dest}`;
      } else {
        groupKey = `${type}_${airline}_${origin}_${dest}_${depDate}_${depTime}`;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          flight: f,
          pnrs: new Set<string>(),
          passengers: new Set<string>(),
        };
      }

      const rawPnr = (f.pnrLocator || (f as any).confirmationCode || '').trim();
      if (rawPnr && rawPnr !== 'N/A' && rawPnr !== 'N/D') {
        rawPnr.split(/[,/•;\s]+/).forEach((p) => {
          const clean = p.trim().toUpperCase();
          if (clean && clean !== 'N/A' && clean !== 'N/D') {
            groups[groupKey].pnrs.add(clean);
          }
        });
      }

      if (f.passengers && Array.isArray(f.passengers)) {
        f.passengers.forEach((p) => {
          if (p && p.trim()) groups[groupKey].passengers.add(p.trim());
        });
      }
    });

    return Object.values(groups).map((g) => ({
      flight: g.flight,
      pnrs: Array.from(g.pnrs),
      passengers: Array.from(g.passengers),
    }));
  }, [flights]);

  // Helper: Format airport and flight details
  const getAirportLabel = (city?: string, code?: string, airportName?: string, fallback: string = 'N/D') => {
    const c = (city || '').trim();
    const cd = (code || '').trim();
    const ap = (airportName || '').trim();

    if (c && cd) {
      if (c.includes(`(${cd})`)) return c;
      return `${c} (${cd})`;
    }
    if (cd) return cd;
    if (c) return c;
    if (ap) return ap;
    return fallback;
  };

  const getFlightDisplayInfo = (flight: FlightSegment, customPnrs?: string[]) => {
    const origin = getAirportLabel(flight.originCity, flight.originCode, flight.originAirport, 'Origem');
    const destination = getAirportLabel(flight.destinationCity, flight.destinationCode, flight.destinationAirport, 'Destino');
    
    // Resolve PNRs list
    let pnrsList: string[] = [];
    if (customPnrs && customPnrs.length > 0) {
      pnrsList = customPnrs;
    } else {
      const rawPnr = (flight.pnrLocator || (flight as any).confirmationCode || '').trim();
      if (rawPnr && rawPnr !== 'N/A' && rawPnr !== 'N/D') {
        rawPnr.split(/[,/•;\s]+/).forEach((p) => {
          const clean = p.trim().toUpperCase();
          if (clean && clean !== 'N/A' && clean !== 'N/D') pnrsList.push(clean);
        });
      }
    }
    const uniquePnrs = Array.from(new Set(pnrsList));

    const airlineAndFlight = [flight.airline, flight.flightNumber].filter(Boolean).join(' ');
    const hasStopovers = !!flight.stopovers && flight.stopovers.trim() !== '' && !flight.stopovers.toLowerCase().includes('direto');

    return {
      origin,
      destination,
      pnrs: uniquePnrs,
      airlineAndFlight: airlineAndFlight || 'Voo',
      departureFormatted: flight.departureTime
        ? `${flight.departureTime}${flight.departureDate ? ` (${formatDisplayDate(flight.departureDate, false)})` : ''}`
        : (flight.departureDate ? formatDisplayDate(flight.departureDate, false) : 'A definir'),
      arrivalFormatted: flight.arrivalTime
        ? `${flight.arrivalTime}${flight.arrivalDate && flight.arrivalDate !== flight.departureDate ? ` (+1 dia, ${formatDisplayDate(flight.arrivalDate, false)})` : ''}`
        : '',
      hasStopovers,
      stopoversText: flight.stopovers,
      duration: flight.duration,
    };
  };

  // Helper: Get hourly schedule (exibe o estado persistido sem criar eventos virtuais durante a renderização)
  const getHourlySchedule = (day: ItineraryDay): HourlyScheduleItem[] => {
    return (day.hourlySchedule || []).slice().sort(compareScheduleItemOrder);
  };

  // Toggle single hourly item
  const handleToggleScheduleItem = async (dayId: string, itemId: string) => {
    const day = itineraryDays.find((d) => d.id === dayId);
    if (!day) return;

    const item = (day.hourlySchedule || []).find((i) => i.id === itemId);
    if (!item) return;

    const isCurrentEffective = isScheduleItemEffectivelyCompleted(day.date, item, settings.isFlexibleDates);
    const updatedItem: HourlyScheduleItem = {
      ...item,
      completed: !isCurrentEffective,
    };
    await saveHourlyScheduleItem(dayId, updatedItem);
  };

  // Delete hourly item
  const handleDeleteScheduleItem = async (dayId: string, itemId: string) => {
    await deleteHourlyScheduleItem(dayId, itemId);
  };

  // Open Hourly modal for add or edit
  const handleOpenHourlyModal = (dayId?: string, itemToEdit?: HourlyScheduleItem) => {
    const targetId = dayId || activeDay?.id || (itineraryDays[0] && itineraryDays[0].id) || '';
    setHourlyTargetDayId(targetId);
    if (itemToEdit) {
      setEditingHourlyItemId(itemToEdit.id);
      setHourlyForm({
        time: itemToEdit.time || '08:00',
        title: itemToEdit.title || '',
        location: itemToEdit.location || '',
        category: itemToEdit.category || 'park',
        notes: itemToEdit.notes || '',
      });
    } else {
      setEditingHourlyItemId(null);
      setHourlyForm({
        time: '08:00',
        title: '',
        location: '',
        category: 'park',
        notes: '',
      });
    }
    setIsHourlyModalOpen(true);
  };

  // Save hourly item
  const handleSaveHourlyItem = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!hourlyForm.title.trim()) {
      return;
    }

    // Resolve target day safely
    const targetDay =
      itineraryDays.find((d) => d.id === hourlyTargetDayId) ||
      itineraryDays.find((d) => d.id === selectedDayId) ||
      activeDay ||
      itineraryDays[0];

    if (!targetDay) {
      return;
    }
    const targetDayId = targetDay.id;

    let success = false;
    if (editingHourlyItemId) {
      const existing = (targetDay.hourlySchedule || []).find((i) => i.id === editingHourlyItemId);
      const updatedItem: HourlyScheduleItem = {
        id: editingHourlyItemId,
        time: hourlyForm.time || '08:00',
        title: hourlyForm.title.trim(),
        location: hourlyForm.location.trim() || targetDay.park || '',
        category: hourlyForm.category || 'park',
        notes: hourlyForm.notes.trim(),
        completed: existing?.completed || false,
        sourceType: existing?.sourceType || 'manual',
        sourceId: existing?.sourceId,
      };
      success = await saveHourlyScheduleItem(targetDayId, updatedItem);
    } else {
      const newItem: HourlyScheduleItem = {
        id: generateUUID(),
        time: hourlyForm.time || '08:00',
        title: hourlyForm.title.trim(),
        location: hourlyForm.location.trim() || targetDay.park || '',
        category: hourlyForm.category || 'park',
        completed: false,
        notes: hourlyForm.notes.trim(),
        sourceType: 'manual',
      };
      success = await saveHourlyScheduleItem(targetDayId, newItem);
    }

    if (success) {
      setIsHourlyModalOpen(false);
      setEditingHourlyItemId(null);
    }
  };

  // Quick Park selection Modal Save
  const openParkModal = (day: ItineraryDay) => {
    setParkModalTargetDayId(day.id);
    setSelectedDayId(day.id);
    setSelectedDayNumber(day.dayNumber);
    setTempDayTitle(day.title || '');
    setTempDayPark(day.park || '');
    setTempDayGeneralNotes(day.generalNotes || '');
    setParkModalOpen(true);
  };

  const [isSaving, setIsSaving] = useState(false);
  const handleSaveParkModal = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const targetDay =
        itineraryDays.find((d) => d.id === parkModalTargetDayId) ||
        itineraryDays.find((d) => d.id === selectedDayId) ||
        activeDay;
      if (!targetDay) return;

      const trimmedTitle = tempDayTitle.trim();
      const trimmedPark = tempDayPark.trim() || 'Sem Parque';
      const trimmedNotes = tempDayGeneralNotes.trim();
      const isParkChanged = trimmedPark.toLowerCase() !== (targetDay.park || '').trim().toLowerCase();
      const isNonPark = isNonParkEvent(trimmedPark);

      // Prioritize title and general notes explicitly entered by the user
      const updates: any = {
        title: trimmedTitle || targetDay.title || 'Sem Parque',
        park: trimmedPark,
        generalNotes: trimmedNotes,
      };

      if (isNonPark) {
        updates.parkBooking = undefined;
      }

      if (isParkChanged) {
        const autofill = getAutofillForDay(
          targetDay.dayNumber,
          trimmedPark,
          flights,
          itineraryDays.length,
          PARKS_GUIDE_DATA
        );
        // ONLY override title with autofill if the user did not explicitly enter a title
        if (!trimmedTitle) {
          updates.title = autofill.title || targetDay.title || 'Sem Parque';
        }
        updates.morning = autofill.morning;
        updates.afternoon = autofill.afternoon;
        updates.night = autofill.night;
        // Use autofill general notes only if user didn't write custom notes
        if (!trimmedNotes) {
          updates.generalNotes = autofill.generalNotes;
        }
        // Reset hourly schedule to let dynamic generate based on new park
        updates.hourlySchedule = [];
      }

      updateItineraryDay(targetDay.id, updates);
      setParkModalOpen(false);
      setParkModalTargetDayId('');
    } catch (err) {
      console.error("Erro ao salvar dia:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Attachment upload handler
  const handleSimulatedFileUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttName.trim() || !activeDay) return;

    addAttachmentToDay(activeDay.id, {
      name: newAttName.endsWith('.pdf') ? newAttName : `${newAttName}.pdf`,
      type: newAttType,
      url: '#',
      size: `${(Math.random() * 2 + 0.5).toFixed(1)} MB`,
    });
    setNewAttName('');
    setAttModalOpen(false);
  };

  // Auto fill all days
  const handleAutoFillAllDays = () => {
    itineraryDays.forEach((day) => {
      const autofill = getAutofillForDay(
        day.dayNumber,
        day.park,
        flights,
        itineraryDays.length,
        PARKS_GUIDE_DATA
      );
      updateItineraryDay(day.id, {
        title: autofill.title,
        morning: autofill.morning,
        afternoon: autofill.afternoon,
        night: autofill.night,
        generalNotes: autofill.generalNotes,
        hourlySchedule: [], // Re-generate smart default
      });
    });
  };

  // Modal keyboard listeners
  const { handleBackdropClick: handleHourlyBackdrop } = useModalKeyEvents({
    isOpen: isHourlyModalOpen,
    onCancel: () => setIsHourlyModalOpen(false),
    onSave: () => handleSaveHourlyItem({ preventDefault: () => {} } as React.FormEvent),
  });

  const { handleBackdropClick: handleParkModalBackdrop } = useModalKeyEvents({
    isOpen: parkModalOpen,
    onCancel: () => setParkModalOpen(false),
    onSave: () => handleSaveParkModal(),
  });

  const { handleBackdropClick: handleAttModalBackdrop } = useModalKeyEvents({
    isOpen: attModalOpen,
    onCancel: () => setAttModalOpen(false),
    onSave: () => handleSimulatedFileUpload({ preventDefault: () => {} } as React.FormEvent),
  });

  const { handleBackdropClick: handlePdfModalBackdrop } = useModalKeyEvents({
    isOpen: pdfModalOpen,
    onCancel: () => setPdfModalOpen(false),
    onSave: () => {
      setPdfModalOpen(false);
      executePrintPdf(pdfScope);
    },
  });



  // Filter days if search query present
  const filteredDays = useMemo(() => {
    if (!searchQuery.trim()) return itineraryDays;
    const q = searchQuery.toLowerCase();
    return itineraryDays.filter((day) => {
      const matchTitle = day.title.toLowerCase().includes(q);
      const matchPark = day.park.toLowerCase().includes(q);
      const matchNotes = day.generalNotes.toLowerCase().includes(q);
      const matchMorning = day.morning.where.toLowerCase().includes(q);
      const matchAfternoon = day.afternoon.where.toLowerCase().includes(q);
      const matchNight = day.night.where.toLowerCase().includes(q);
      const matchSchedule = (day.hourlySchedule || []).some(
        (item) => item.title.toLowerCase().includes(q) || (item.location && item.location.toLowerCase().includes(q))
      );
      return matchTitle || matchPark || matchNotes || matchMorning || matchAfternoon || matchNight || matchSchedule;
    });
  }, [itineraryDays, searchQuery]);

  // Helper to check if a schedule item belongs to an Airbnb accommodation
  const isAirbnbItem = (cat?: HourlyScheduleItem['category'], item?: HourlyScheduleItem): boolean => {
    if (cat === 'transport' || item?.category === 'transport' || item?.sourceType === 'transport') return false;
    const t = (item?.title || '').toLowerCase();
    if (t.includes('rumo ao aeroporto') || t.includes('aeroporto') || t.includes('deslocamento') || t.includes('transporte') || t.includes('chegada ao aeroporto') || t.includes('decolagem')) {
      return false;
    }
    if (cat === 'hotel' || item?.category === 'hotel') return false;
    if (cat === 'airbnb' || item?.category === 'airbnb') return true;
    if (!item) return false;

    const n = (item.notes || '').toLowerCase();
    const l = (item.location || '').toLowerCase();
    const id = (item.id || '').toLowerCase();

    // Check against all accommodations in the trip
    const matchedAcc = accommodations.find((a) =>
      (item.sourceId && (item.sourceId === a.id || item.sourceId.includes(a.id))) ||
      (a.name && (t.includes(a.name.toLowerCase()) || l.includes(a.name.toLowerCase()))) ||
      (a.address && l.includes(a.address.toLowerCase()))
    );

    if (matchedAcc) {
      const isHotelType = matchedAcc.type === 'hotel' || matchedAcc.type === 'resort' || matchedAcc.type === 'traditional';
      if (isHotelType) return false;

      const isAccAirbnb =
        matchedAcc.type === 'airbnb' ||
        matchedAcc.type === 'house' ||
        (matchedAcc.name && matchedAcc.name.toLowerCase().includes('airbnb'));

      if (isAccAirbnb) {
        if (
          item.sourceType === 'accommodation' ||
          t.includes('check-in') ||
          t.includes('check-out') ||
          id.includes('hourly-acc') ||
          id.includes('auto-inicio') ||
          id.includes('auto-retorno')
        ) {
          return true;
        }
      }
    }

    if (t.includes('airbnb') || l.includes('airbnb') || id.includes('airbnb')) {
      return true;
    }

    return false;
  };

  // Helper category badge colors for timeline items
  const getCategoryBadge = (cat?: HourlyScheduleItem['category'], item?: HourlyScheduleItem) => {
    if (isAirbnbItem(cat, item)) {
      return { label: 'Airbnb', bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: Home };
    }

    switch (cat) {
      case 'transport':
        return { label: 'Transporte', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: Car };
      case 'park':
        return { label: 'Parque & Atração', bg: 'bg-amber-50 text-amber-800 border-amber-200', icon: Sparkles };
      case 'dining':
        return { label: 'Refeição & Reserva', bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: Utensils };
      case 'hotel':
        return { label: 'Hotel & Resort', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Hotel };
      case 'airbnb':
        return { label: 'Airbnb', bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: Home };
      case 'shopping':
        return { label: 'Compras & Outlets', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ShoppingBag };
      case 'flight':
        return { label: 'Voo & Aeroporto', bg: 'bg-teal-50 text-teal-700 border-teal-200', icon: Plane };
      default:
        return { label: 'Atividade', bg: 'bg-slate-50 text-slate-700 border-slate-200', icon: Clock };
    }
  };

  // Helper function to generate complete standalone HTML document for printing / PDF saving
  // Matches the exact visual layout and design of the Master Overview Popup Modal
  const buildPdfHtml = (scope: 'all' | 'selected' | 'summary') => {
    const printDays = scope === 'selected' ? [activeDay] : itineraryDays;
    const isSummary = scope === 'summary';
    const tripTitle = isSummary
      ? `Resumo Executivo da Viagem — ${settings.tripName || 'Kingdom Compass'}`
      : (settings.tripName || 'Roteiro de Viagem');
    const destination = settings.destination || 'Orlando, Flórida';
    const tripEndDate = itineraryDays[itineraryDays.length - 1]?.date || getTripEndDate(settings.startDate, settings.durationDays);
    const periodStr = settings.isFlexibleDates
      ? `Data Não Definida (${settings.durationDays} dias)`
      : `${formatDisplayDate(settings.startDate, false)} até ${formatDisplayDate(tripEndDate, false)}`;
    const travelersStr = (settings.travelers || []).map((t) => t.name).join(', ') || `${settings.travelersCount} Viajantes`;

    const escapeHtml = (text?: string) => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const getCategoryDetails = (cat?: HourlyScheduleItem['category'], item?: HourlyScheduleItem) => {
      if (isAirbnbItem(cat, item)) {
        return { label: 'Airbnb', icon: '🏡', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' };
      }
      switch (cat) {
        case 'transport':
          return { label: 'Transporte', icon: '🚗', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' };
        case 'park':
          return { label: 'Parque & Atração', icon: '🎢', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
        case 'dining':
          return { label: 'Refeição & Reserva', icon: '🍽️', color: '#be123c', bg: '#fff1f2', border: '#fecdd3' };
        case 'hotel':
          return { label: 'Hotel & Resort', icon: '🏨', color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' };
        case 'airbnb':
          return { label: 'Airbnb', icon: '🏡', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' };
        case 'shopping':
          return { label: 'Compras & Outlets', icon: '🛍️', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' };
        case 'flight':
          return { label: 'Voo & Aeroporto', icon: '✈️', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' };
        default:
          return { label: 'Programação', icon: '📌', color: '#334155', bg: '#f8fafc', border: '#e2e8f0' };
      }
    };

    let metricsHtml = '';
    if (scope === 'all' || scope === 'summary') {
      const totalScheduleItems = itineraryDays.reduce((acc, d) => acc + (d.hourlySchedule?.length || 0), 0);
      const completedDaysCount = itineraryDays.filter(d => isDayEffectivelyCompleted(d, settings.isFlexibleDates)).length;
      const parksCount = itineraryDays.filter(d => isDayWithPark(d)).length;
      const freeDaysCount = itineraryDays.filter(d => !isDayWithPark(d)).length;
      const pct = Math.round((completedDaysCount / (itineraryDays.length || 1)) * 100);

      metricsHtml = `
        <div class="pdf-section">
          <div class="section-header">
            <span class="sec-icon">📊</span>
            <span class="sec-title">Métricas Executivas do Roteiro</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
            <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:10px 12px; border-radius:10px;">
              <span style="font-size:9px; font-weight:700; text-transform:uppercase; color:#64748b; display:block;">Duração Total</span>
              <div style="font-size:15px; font-weight:800; font-family:'Playfair Display', serif; color:#1A2B4C; margin-top:2px;">${settings.durationDays} Dias</div>
              <span style="font-size:9px; color:#64748b;">Início: ${escapeHtml(formatDisplayDate(settings.startDate, false))}</span>
            </div>
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:10px 12px; border-radius:10px;">
              <span style="font-size:9px; font-weight:700; text-transform:uppercase; color:#047857; display:block;">Progresso do Roteiro</span>
              <div style="font-size:15px; font-weight:800; font-family:'Playfair Display', serif; color:#065f46; margin-top:2px;">${completedDaysCount} / ${itineraryDays.length} Dias</div>
              <span style="font-size:9px; color:#047857;">${pct}% concluído</span>
            </div>
            <div style="background:#fffbeb; border:1px solid #fde68a; padding:10px 12px; border-radius:10px;">
              <span style="font-size:9px; font-weight:700; text-transform:uppercase; color:#b45309; display:block;">Parques e Atrações</span>
              <div style="font-size:15px; font-weight:800; font-family:'Playfair Display', serif; color:#78350f; margin-top:2px;">${parksCount} Parques</div>
              <span style="font-size:9px; color:#b45309;">${freeDaysCount} Dias Livres/Compras</span>
            </div>
            <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px 12px; border-radius:10px;">
              <span style="font-size:9px; font-weight:700; text-transform:uppercase; color:#1d4ed8; display:block;">Tabela Hora a Hora</span>
              <div style="font-size:15px; font-weight:800; font-family:'Playfair Display', serif; color:#1e40af; margin-top:2px;">${totalScheduleItems} Atividades</div>
              <span style="font-size:9px; color:#1d4ed8;">Dólar Base: R$ ${(settings.dollarRate || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    }

    let logisticsHtml = '';
    if (scope === 'all' || scope === 'summary') {
      logisticsHtml = `
        <div class="pdf-section">
          <div class="section-header">
            <span class="sec-icon">🧭</span>
            <span class="sec-title">Logística & Informações Mestres da Viagem</span>
          </div>

          <div class="logistics-grid">
            <!-- Flight Card -->
            <div class="dossier-card">
              <div class="dossier-card-head flight-head">
                <span>✈️ PASSAGENS AÉREAS</span>
                <span class="head-tag">Voos Confirmados</span>
              </div>
              <div class="dossier-card-body">
                ${
                  groupedFlightSegments && groupedFlightSegments.length > 0
                    ? groupedFlightSegments.map(({ flight, pnrs }, idx) => {
                        const info = getFlightDisplayInfo(flight, pnrs);
                        const isOutbound = flight.type === 'outbound';
                        const isInbound = flight.type === 'inbound';
                        const isConn = flight.type === 'connection';
                        const label = isOutbound ? 'IDA' : isInbound ? 'VOLTA' : isConn ? 'CONEXÃO' : `VOO ${idx + 1}`;

                        return `
                          <div class="flight-seg" style="${idx > 0 ? 'margin-top:8px; padding-top:8px; border-top:1px dashed #cbd5e1;' : ''}">
                            <div class="seg-type">${label}: <strong>${escapeHtml(info.airlineAndFlight)}</strong></div>
                            <div class="seg-route">
                              <span>${escapeHtml(info.origin)}</span>
                              <span class="route-arrow">✈ ➔</span>
                              <span>${escapeHtml(info.destination)}</span>
                            </div>
                            <div class="seg-time">
                              Partida: <strong>${escapeHtml(info.departureFormatted)}</strong>
                              ${info.arrivalFormatted ? ` | Chegada: <strong>${escapeHtml(info.arrivalFormatted)}</strong>` : ''}
                              ${info.duration ? ` (${escapeHtml(info.duration)})` : ''}
                            </div>
                            ${info.hasStopovers ? `<div style="font-size:9.5px; color:#b45309; margin-top:2px; font-weight:600;">⚠️ Escala/Conexão: ${escapeHtml(info.stopoversText)}</div>` : ''}
                            ${info.pnrs.length > 0 ? `<div class="pnr-box">Localizador${info.pnrs.length > 1 ? 'es' : ''} PNR: <strong>${escapeHtml(info.pnrs.join(' • '))}</strong></div>` : ''}
                          </div>
                        `;
                      }).join('')
                    : `<div class="empty-notice">Nenhum voo cadastrado</div>`
                }
              </div>
            </div>

            <!-- Accommodation Card -->
            <div class="dossier-card">
              <div class="dossier-card-head hotel-head">
                <span>🏨 HOSPEDAGEM PRINCIPAL</span>
                <span class="head-tag">Reserva de Hotel</span>
              </div>
              <div class="dossier-card-body">
                ${
                  accommodations && accommodations.length > 0
                    ? `<div>
                         <div class="hotel-name">${escapeHtml(accommodations[0].name)}</div>
                         ${accommodations[0].address ? `<div class="hotel-addr">📍 ${escapeHtml(accommodations[0].address)}</div>` : ''}
                         <div class="check-times">
                           <div><span>Check-in:</span> <strong>${escapeHtml(accommodations[0].checkInTime || '15:00')}</strong></div>
                           <div><span>Check-out:</span> <strong>${escapeHtml(accommodations[0].checkOutTime || '11:00')}</strong></div>
                         </div>
                         ${accommodations[0].confirmationCode ? `<div class="pnr-box">Confirmação: <strong>${escapeHtml(accommodations[0].confirmationCode)}</strong></div>` : ''}
                       </div>`
                    : `<div class="empty-notice">Hospedagem não cadastrada</div>`
                }
              </div>
            </div>

            <!-- Car Rental Card -->
            <div class="dossier-card">
              <div class="dossier-card-head car-head">
                <span>🚗 TRANSPORTE & VEÍCULO</span>
                <span class="head-tag">Locação</span>
              </div>
              <div class="dossier-card-body">
                ${
                  carRentalInfo
                    ? `<div>
                         <div class="hotel-name">${escapeHtml(carRentalInfo.company || 'Locadora de Veículos')}</div>
                         <div class="hotel-addr">Categoria: <strong>${escapeHtml(carRentalInfo.category || 'Veículo')}</strong></div>
                         <div class="check-times" style="margin-top:6px;">
                           <div><span>Retirada:</span> <strong>${escapeHtml(carRentalInfo.pickupLocation || 'Aeroporto')}</strong> às ${escapeHtml(carRentalInfo.pickupTime || '10:00')}</div>
                           <div><span>Devolução:</span> <strong>${escapeHtml(carRentalInfo.dropoffLocation || 'Aeroporto')}</strong> às ${escapeHtml(carRentalInfo.dropoffTime || '16:00')}</div>
                         </div>
                         ${carRentalInfo.confirmationCode ? `<div class="pnr-box">Confirmação: <strong>${escapeHtml(carRentalInfo.confirmationCode)}</strong></div>` : ''}
                       </div>`
                    : `<div class="empty-notice">Locação de veículo não cadastrada</div>`
                }
              </div>
            </div>
          </div>
        </div>
      `;
    }

    let summaryTableHtml = '';
    if (scope === 'all' || scope === 'summary') {
      const rows = itineraryDays
        .map(
          (d, idx) => `
          <tr class="${idx % 2 === 0 ? 'even-row' : 'odd-row'}">
            <td class="col-day">D${d.dayNumber}</td>
            <td class="col-date">${settings.isFlexibleDates ? `Dia ${d.dayNumber}` : escapeHtml(formatDisplayDate(d.date, false))}</td>
            <td class="col-park">
              <span class="park-badge-mini">${escapeHtml(d.park || d.title)}</span>
            </td>
            <td class="col-status">${d.completed ? '<span class="badge-done">✓ Feito</span>' : '<span class="badge-plan">Planejado</span>'}</td>
          </tr>
        `
        )
        .join('');

      summaryTableHtml = `
        <div class="pdf-section">
          <div class="section-header">
            <span class="sec-icon">📅</span>
            <span class="sec-title">Panorama Geral do Roteiro (Calendário Resumo)</span>
          </div>

          <div class="table-container">
            <table class="master-summary-table">
              <thead>
                <tr>
                  <th style="width:38px; text-align:center;">Dia</th>
                  <th style="width:85px;">Data</th>
                  <th>Parque / Destaque</th>
                  <th style="width:65px; text-align:center;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    const daysCardsHtml = printDays
      .map((day) => {
        const schedule = getHourlySchedule(day);
        const hotelForDay = getAccommodationForDay(day.date, day.dayNumber);

        let hourlyHtml = '';
        if (schedule.length > 0) {
          const items = schedule
            .map((item) => {
              const cat = getCategoryDetails(item.category, item);
              return `
              <tr>
                <td class="col-time-cell">
                  <span class="time-badge">
                    <span class="time-icon">🕒</span> ${escapeHtml(item.time || '--:--')}
                  </span>
                </td>
                <td class="col-cat-cell">
                  <span class="cat-badge-table" style="background:${cat.bg}; color:${cat.color}; border:1px solid ${cat.border};">
                    ${cat.icon} ${escapeHtml(cat.label)}
                  </span>
                </td>
                <td class="col-activity-cell">
                  <div class="act-title">${escapeHtml(item.title)}</div>
                  ${item.notes ? `<div class="act-desc">${escapeHtml(item.notes)}</div>` : ''}
                </td>
                <td class="col-loc-cell">
                  ${
                    item.location
                      ? `<div class="loc-text"><span class="loc-pin">📍</span> ${escapeHtml(item.location)}</div>`
                      : `<span class="empty-dash">—</span>`
                  }
                </td>
              </tr>
            `;
            })
            .join('');

          hourlyHtml = `
            <div class="day-subsection">
              <div class="subsection-title-row">
                <div class="sec-title-left">
                  <span>🕒</span>
                  <span>CRONOGRAMA & TABELA HORA A HORA</span>
                </div>
                <span class="items-count-badge">${schedule.length} ${schedule.length === 1 ? 'item' : 'itens'}</span>
              </div>
              <div class="hourly-table-container">
                <table class="hourly-pdf-table">
                  <thead>
                    <tr>
                      <th style="width: 85px;">HORÁRIO</th>
                      <th style="width: 150px;">CATEGORIA</th>
                      <th>ATIVIDADE / DESCRIÇÃO</th>
                      <th style="width: 210px;">LOCAL / NOTAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }

        return `
          <div class="day-dossier-page">
            <!-- Day Page Header -->
            <div class="day-hero-header">
              <div class="day-hero-left">
                <div class="day-pill-number">DIA ${day.dayNumber}</div>
                <div class="day-hero-text">
                  <h2 class="day-main-title">${escapeHtml(day.title)}</h2>
                  <div class="day-date-sub">
                    ${!settings.isFlexibleDates ? `<strong>${escapeHtml(formatDisplayDate(day.date, true))}</strong> • ` : ''}
                    Destino Principal: <span class="dest-highlight">${escapeHtml(day.park)}</span>
                  </div>
                </div>
              </div>

              <div class="day-hero-right">
                ${hotelForDay ? `<div class="hotel-pill">🏨 <strong>Hospedagem:</strong> ${escapeHtml(hotelForDay.name)}</div>` : ''}
                ${
                  day.parkBooking?.parkHours
                    ? `<div class="hours-pill">
                         🎢 <strong>Horário do Parque:</strong> ${escapeHtml(day.parkBooking.parkHours.openingTime)} – ${escapeHtml(day.parkBooking.parkHours.closingTime)}
                         ${day.parkBooking.parkHours.earlyEntryTime ? `<span class="early-tag">Early: ${escapeHtml(day.parkBooking.parkHours.earlyEntryTime)}</span>` : ''}
                       </div>`
                    : ''
                }
                ${(() => {
                  const photoPkg = getDayPhotoPackage(day);
                  return photoPkg
                    ? `<div class="hours-pill" style="background:#faf5ff; border-color:#e9d5ff; color:#581c87;">
                         📸 <strong>Pacote de Fotos:</strong> ${escapeHtml(photoPkg.name)}
                         ${photoPkg.code ? ` (Código: ${escapeHtml(photoPkg.code)})` : ''}
                       </div>`
                    : '';
                })()}
              </div>
            </div>

            <!-- Hourly Schedule Timeline -->
            ${hourlyHtml}

            <!-- Attached Vouchers -->
            ${
              day.attachments && day.attachments.length > 0
                ? `<div class="day-attached-vouchers">
                     <span>📎 <strong>Vouchers & Ingressos Vinculados:</strong></span>
                     <span>${day.attachments.map((a) => escapeHtml(a.name)).join(' • ')}</span>
                   </div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(tripTitle)} • Guia Oficial de Roteiro (PDF)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&display=swap" rel="stylesheet">
  <style>
    /* RESET & BASE */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      color: #1A2B4C;
      line-height: 1.5;
      padding: 24px;
      font-size: 11px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .pdf-canvas {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* TOP SCREEN BAR */
    .screen-action-bar {
      background: #0f172a;
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.3);
      border: 1px solid #D4AF37;
    }
    .screen-action-left h4 {
      font-size: 14px;
      font-weight: 700;
      color: #D4AF37;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .screen-action-left p {
      font-size: 11px;
      color: #94a3b8;
    }
    .btn-print-action {
      background: #D4AF37;
      color: #0f172a;
      border: none;
      font-weight: 800;
      font-size: 13px;
      padding: 9px 20px;
      border-radius: 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(212, 175, 55, 0.35);
      transition: all 0.2s ease;
    }
    .btn-print-action:hover { background: #e6be44; transform: translateY(-1px); }
    .btn-close-action {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 12px;
      padding: 9px 16px;
      border-radius: 10px;
      cursor: pointer;
    }
    .btn-close-action:hover { background: rgba(255, 255, 255, 0.2); }

    /* EDITORIAL LUXURY COVER BANNER */
    .luxury-cover {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1A2B4C 100%);
      border: 2px solid #D4AF37;
      border-radius: 18px;
      padding: 24px 28px;
      color: #ffffff;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 30px -10px rgba(15, 23, 42, 0.25);
      break-inside: avoid;
    }
    .luxury-cover::after {
      content: '';
      position: absolute;
      top: -50px;
      right: -50px;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .cover-top-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #D4AF37;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(212, 175, 55, 0.4);
      padding-bottom: 3px;
    }
    .cover-main-flex {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }
    .cover-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 26px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      margin-bottom: 6px;
    }
    .cover-dest {
      font-size: 12px;
      color: #cbd5e1;
      margin-bottom: 3px;
    }
    .cover-travelers {
      font-size: 11px;
      color: #94a3b8;
    }
    .cover-meta-card {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(212, 175, 55, 0.35);
      border-radius: 12px;
      padding: 12px 18px;
      text-align: right;
      min-width: 200px;
      backdrop-filter: blur(4px);
    }
    .meta-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #D4AF37; letter-spacing: 1px; }
    .meta-dates { font-size: 13px; font-weight: 700; color: #ffffff; margin: 3px 0; }
    .meta-sub { font-size: 10px; color: #cbd5e1; }

    /* PDF SECTIONS & CARDS */
    .pdf-section {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.05);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .sec-icon { font-size: 16px; }
    .sec-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14px;
      font-weight: 700;
      color: #1A2B4C;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    /* LOGISTICS DOSSIER */
    .logistics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .dossier-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .dossier-card-head {
      padding: 7px 12px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #ffffff;
    }
    .flight-head { background: #1e3a8a; }
    .hotel-head { background: #b45309; }
    .car-head { background: #047857; }
    .head-tag {
      background: rgba(255, 255, 255, 0.2);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 8.5px;
      font-weight: 700;
    }
    .dossier-card-body {
      padding: 10px 12px;
      font-size: 10.5px;
      color: #334155;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .seg-type { font-weight: 700; color: #1A2B4C; font-size: 10.5px; }
    .seg-route {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 800;
      font-size: 13px;
      color: #1e3a8a;
      margin: 2px 0;
    }
    .route-arrow { color: #D4AF37; font-size: 11px; }
    .seg-time { font-size: 10px; color: #64748b; margin-bottom: 4px; }
    .pnr-box {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 3px 6px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 9.5px;
      color: #0369a1;
      margin-top: 4px;
    }
    .hotel-name { font-weight: 700; font-size: 11.5px; color: #1A2B4C; line-height: 1.3; }
    .hotel-addr { font-size: 9.5px; color: #64748b; margin-top: 2px; }
    .check-times {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      font-size: 10px;
      background: #ffffff;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .empty-notice { color: #94a3b8; font-style: italic; font-size: 10px; padding: 6px 0; }

    /* MASTER SUMMARY TABLE */
    .table-container {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    .master-summary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .master-summary-table th {
      background: #1A2B4C;
      color: #ffffff;
      padding: 7px 10px;
      text-align: left;
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.3px;
    }
    .master-summary-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .even-row { background: #ffffff; }
    .odd-row { background: #f8fafc; }
    .col-day { font-weight: 800; color: #1A2B4C; text-align: center; }
    .col-date { font-weight: 600; color: #475569; white-space: nowrap; }
    .col-park { font-weight: 700; }
    .park-badge-mini {
      background: #eef2ff;
      color: #1e3a8a;
      border: 1px solid #c7d2fe;
      padding: 2px 7px;
      border-radius: 6px;
      display: inline-block;
      font-size: 10px;
    }
    .col-turn { color: #334155; max-width: 180px; }
    .badge-done {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
      font-weight: 700;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .badge-plan {
      background: #f1f5f9;
      color: #64748b;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* DAY DOSSIER FULL PAGE CARD */
    .day-dossier-page {
      background: #ffffff;
      border: 2px solid #cbd5e1;
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      gap: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 8px;
    }
    .day-hero-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
      gap: 16px;
    }
    .day-hero-left {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .day-pill-number {
      background: #1A2B4C;
      color: #D4AF37;
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 15px;
      font-weight: 800;
      padding: 6px 14px;
      border-radius: 10px;
      border: 1px solid #D4AF37;
      box-shadow: 0 2px 6px rgba(26, 43, 76, 0.2);
      white-space: nowrap;
    }
    .day-main-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 17px;
      font-weight: 700;
      color: #1A2B4C;
      line-height: 1.2;
    }
    .day-date-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .dest-highlight {
      color: #1e3a8a;
      font-weight: 700;
    }
    .day-hero-right {
      text-align: right;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-end;
    }
    .hotel-pill {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      color: #334155;
    }
    .hours-pill {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
    }
    .early-tag {
      background: #92400e;
      color: #ffffff;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8.5px;
      margin-left: 4px;
    }

    .day-notes-banner {
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 10px;
      padding: 8px 12px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      color: #854d0e;
      font-size: 10.5px;
    }
    .notes-icon { font-size: 14px; }

    /* TIMELINE & HOURLY TABLE SECTION */
    .day-subsection { display: flex; flex-direction: column; gap: 8px; }
    .subsection-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #1A2B4C;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .subsection-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sec-title-left {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #1A2B4C;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .items-count-badge {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
    }
    .hourly-table-container {
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }
    .hourly-pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      text-align: left;
    }
    .hourly-pdf-table thead tr {
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
    }
    .hourly-pdf-table th {
      padding: 8px 12px;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
    }
    .hourly-pdf-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    .hourly-pdf-table tbody tr:last-child {
      border-bottom: none;
    }
    .hourly-pdf-table td {
      padding: 8px 12px;
      vertical-align: top;
    }
    .col-time-cell { white-space: nowrap; }
    .time-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #1A2B4C;
      font-family: monospace;
      font-weight: 700;
      font-size: 11px;
      padding: 2.5px 7px;
      border-radius: 6px;
    }
    .time-icon { opacity: 0.6; font-size: 10px; }
    .col-cat-cell { white-space: nowrap; }
    .cat-badge-table {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      padding: 2.5px 8px;
      border-radius: 6px;
    }
    .col-activity-cell { vertical-align: top; }
    .act-title {
      font-weight: 700;
      font-size: 11.5px;
      color: #1E293B;
      line-height: 1.35;
    }
    .act-desc {
      font-size: 10px;
      color: #64748b;
      font-style: italic;
      margin-top: 2px;
      line-height: 1.35;
    }
    .col-loc-cell { vertical-align: top; color: #334155; }
    .loc-text {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      font-size: 10.5px;
      color: #334155;
      line-height: 1.35;
    }
    .loc-pin { color: #f43f5e; font-size: 10px; flex-shrink: 0; }
    .empty-dash { color: #94a3b8; font-size: 10px; }

    /* PERIODS TRIAD */
    .periods-triad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .period-column {
      border-radius: 12px;
      border: 1px solid;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .morning-col { background: #fffdf5; border-color: #fde68a; }
    .afternoon-col { background: #f8faff; border-color: #bfdbfe; }
    .night-col { background: #faf8ff; border-color: #c7d2fe; }

    .period-col-header {
      padding: 6px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .morning-col .period-col-header { background: #fef3c7; }
    .afternoon-col .period-col-header { background: #dbeafe; }
    .night-col .period-col-header { background: #e0e7ff; }

    .p-icon { font-size: 14px; }
    .p-name { font-weight: 800; font-size: 11px; letter-spacing: 0.5px; }
    .morning-col .p-name { color: #92400e; }
    .afternoon-col .p-name { color: #1e40af; }
    .night-col .p-name { color: #3730a3; }
    .p-sub { font-size: 8.5px; color: #64748b; }

    .period-col-body {
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 10px;
    }
    .p-label { font-weight: 700; color: #475569; font-size: 9px; text-transform: uppercase; display: block; }
    .p-val { color: #1A2B4C; font-weight: 500; line-height: 1.35; }
    .dining-val { color: #be123c; font-weight: 600; }
    .p-notes-box {
      background: rgba(255,255,255,0.7);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 9px;
      color: #64748b;
    }
    .p-notes-label { font-weight: 700; color: #334155; }

    .day-attached-vouchers {
      font-size: 9.5px;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 6px 10px;
      border-radius: 8px;
      display: flex;
      gap: 6px;
      align-items: center;
    }

    /* PRINT SPECIFIC RULES */
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        color: #1A2B4C !important;
        font-size: 10pt;
      }
      .screen-action-bar { display: none !important; }
      .pdf-canvas { max-width: 100% !important; margin: 0 !important; gap: 14px !important; }
      .pdf-section, .day-dossier-page, .luxury-cover {
        box-shadow: none !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      @page {
        margin: 10mm 12mm;
        size: A4 portrait;
      }
    }
  </style>
</head>
<body>
  <div class="pdf-canvas">
    <!-- Top Action Bar (Screen Only) -->
    <div class="screen-action-bar">
      <div class="screen-action-left">
        <h4>✨ GUIA DE VIAGEM & ROTEIRO OFICIAL (PDF)</h4>
        <p>Clique no botão para imprimir ou salvar como PDF no seu computador ou celular.</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <button class="btn-print-action" onclick="window.print()">
          <span>🖨️ Imprimir / Salvar PDF</span>
        </button>
        <button class="btn-close-action" onclick="window.close()">Fechar</button>
      </div>
    </div>

    <!-- Editorial Luxury Cover Banner -->
    <div class="luxury-cover">
      <div class="cover-top-badge">${isSummary ? '👑 KINGDOM COMPASS • RESUMO EXECUTIVO DA VIAGEM' : '👑 KINGDOM COMPASS • GUIA DE BORDO & DOSSIÊ OFICIAL'}</div>
      <div class="cover-main-flex">
        <div>
          <h1 class="cover-title">${escapeHtml(tripTitle)}</h1>
          <div class="cover-dest">📍 Destino: <strong>${escapeHtml(destination)}</strong></div>
          <div class="cover-travelers">👥 Viajantes: <strong>${escapeHtml(travelersStr)}</strong></div>
        </div>
        <div class="cover-meta-card">
          <div class="meta-tag">Período da Viagem</div>
          <div class="meta-dates">${escapeHtml(periodStr)}</div>
          <div class="meta-sub">${settings.durationDays} Dias de Roteiro • Cotação: R$ ${(settings.dollarRate || 0).toFixed(2)}</div>
        </div>
      </div>
    </div>

    <!-- Executive Metrics -->
    ${metricsHtml}

    <!-- Logistics Dossier -->
    ${logisticsHtml}

    <!-- Master Summary Table -->
    ${summaryTableHtml}

    <!-- Detailed Days Dossier Pages -->
    ${daysCardsHtml}
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch(e) {
          console.warn('Auto print error:', e);
        }
      }, 450);
    });
  </script>
</body>
</html>`;
  };

  // Execution method that triggers print safely across all browser/iframe contexts
  const executePrintPdf = (scope: 'all' | 'selected' | 'summary') => {
    const htmlContent = buildPdfHtml(scope);

    // Strategy 1: Open a dedicated print window
    try {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.focus();
        return;
      }
    } catch (e) {
      console.warn('window.open blocked, trying Blob URL / iframe...', e);
    }

    // Strategy 2: Blob URL download/open
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener,noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 2000);
      return;
    } catch (e) {
      console.warn('Blob fallback failed, trying DOM print...', e);
    }

    // Strategy 3: Fallback standard print
    setTimeout(() => {
      window.print();
    }, 150);
  };

  if (!activeDay) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-slate-500">Nenhum dia cadastrado no roteiro.</p>
      </div>
    );
  }

  // Days to print
  const daysToPrint = pdfScope === 'selected' ? [activeDay] : itineraryDays;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ========================================================================= */}
      {/* SCREEN-ONLY INTERACTIVE UI                                                */}
      {/* ========================================================================= */}
      <div className="screen-only space-y-6">
        {/* HEADER HERO BANNER (Unified Master + Daily) */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37]">
                <Calendar className="w-4 h-4" />
                <span>Roteiro Mágico Unificado • Dia a Dia com Hora a Hora</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white">
                Roteiro Completo da Viagem
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 max-w-2xl leading-relaxed">
                Tudo o que você fará em cada dia da sua viagem: transporte, abertura de parques, rope drop, fast passes, refeições, shows noturnos e contratos organizados hora a hora.
              </p>
            </div>

            {/* Header Content: Botão de Ação no Canto Direito Superior */}
            <div className="flex flex-col gap-2.5 self-start md:self-auto min-w-[180px] w-full sm:w-auto">
              <button
                id="btn-open-master-overview-modal"
                type="button"
                onClick={() => openOverviewModal('itinerary')}
                className="w-full px-5 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2c] text-[#1A2B4C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md transform hover:-translate-y-0.5 active:scale-95"
                title="Abrir o resumo e visão geral da viagem"
              >
                <Layers className="w-4 h-4 text-[#1A2B4C]" />
                <span>Visão Geral</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/15 text-xs">
            <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
              <div className="text-slate-300 text-[10px] font-bold uppercase">Duração Total</div>
              <div className="text-base sm:text-lg font-bold font-serif text-[#D4AF37] mt-0.5">
                {settings.durationDays} Dias
              </div>
              <div className="text-[10px] text-slate-300">
                {formatDisplayDate(settings.startDate)}
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
              <div className="text-slate-300 text-[10px] font-bold uppercase">Contagem Regressiva</div>
              <div className="text-base sm:text-lg font-bold font-serif text-emerald-400 mt-0.5">
                {daysCountdown > 0 ? `${daysCountdown} dias` : 'Chegou a Viagem!'}
              </div>
              <div className="text-[10px] text-slate-300">
                {itineraryDays.filter((d) => d.completed).length} de {itineraryDays.length} dias concluídos
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
              <div className="text-slate-300 text-[10px] font-bold uppercase">Veículo / Locadora</div>
              <div className="text-sm font-bold text-blue-300 mt-1 truncate">
                {carRentalInfo ? (carRentalInfo.company || carRentalInfo.category || 'Veículo Cadastrado') : 'Não cadastrado'}
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                {carRentalInfo
                  ? (carRentalInfo.category
                      ? `${carRentalInfo.category}${carRentalInfo.pickupLocation ? ` • ${carRentalInfo.pickupLocation}` : ''}`
                      : (carRentalInfo.pickupLocation ? `Retirada: ${carRentalInfo.pickupLocation}` : 'Veículo Confirmado'))
                  : 'Pendente de cadastro'}
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
              <div className="text-slate-300 text-[10px] font-bold uppercase">Hospedagem Principal</div>
              <div className="text-sm font-bold text-amber-300 mt-1 truncate">
                {accommodations && accommodations.length > 0 ? accommodations[0].name : 'Não cadastrada'}
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                {accommodations && accommodations.length > 0
                  ? (accommodations[0].roomType || accommodations[0].address || (accommodations[0].confirmationCode ? `Confirmação: ${accommodations[0].confirmationCode}` : 'Hospedagem Confirmada'))
                  : 'Pendente de cadastro'}
              </div>
            </div>
          </div>
        </div>

        {/* VIEW MODE SELECTOR & SEARCH BAR */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* View Mode Toggle: Single Day Focus vs All Days Master */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                type="button"
                id="btn-view-mode-single"
                onClick={() => setViewMode('single')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'single'
                    ? 'bg-[#1A2B4C] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Dia a Dia Detalhado (Foco no Dia)</span>
              </button>

              <button
                type="button"
                id="btn-view-mode-all"
                onClick={() => setViewMode('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'all'
                    ? 'bg-[#1A2B4C] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Visão Geral (Todos os {itineraryDays.length} Dias)</span>
              </button>
            </div>

            {/* Quick Search & Actions */}
            <div className="flex items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar atração, parque, voo ou refeição..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* HORIZONTAL CAROUSEL OF DAYS (Always visible for easy clicking) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Selecione o Dia da Viagem:
              </span>
              <span className="text-[11px] text-slate-400 font-semibold">
                {itineraryDays.filter((d) => d.completed).length} de {itineraryDays.length} concluídos
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
              {itineraryDays.map((day, dIdx) => {
                const isSelected = viewMode === 'single' && day.id === activeDay.id;
                const dateDisplay = formatDisplayDate(day.date, false);
                return (
                  <button
                    key={`${day.id}-${dIdx}`}
                    id={`btn-carousel-day-${day.dayNumber}`}
                    onClick={() => {
                      setSelectedDayId(day.id);
                      setSelectedDayNumber(day.dayNumber);
                      if (viewMode === 'all') {
                        setViewMode('single');
                      }
                    }}
                    className={`min-w-[130px] p-2.5 rounded-xl border text-left transition-all shrink-0 relative cursor-pointer ${
                      isSelected
                        ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#D4AF37] hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-[#D4AF37]' : 'text-slate-400'}`}>
                        Dia {day.dayNumber}
                      </span>
                      {day.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Circle className={`w-3 h-3 ${isSelected ? 'text-slate-400' : 'text-slate-300'}`} />
                      )}
                    </div>
                    <p className="text-xs font-bold truncate leading-tight">
                      {isDayWithPark(day) ? (day.park || day.title).split('/')[0] : (day.title || day.park || 'Sem Parque')}
                    </p>
                    {!settings.isFlexibleDates && (
                      <p className={`text-[10px] mt-0.5 font-medium ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                        {dateDisplay.split(' de ')[0]} {dateDisplay.split(' de ')[1]?.slice(0, 3)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW MODE 1: SINGLE DAY DETAILED VIEW (TIMELINE HORA A HORA + PERIODS)    */}
        {/* ========================================================================= */}
        {viewMode === 'single' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-5 sm:p-7 space-y-6">
            {/* DAY HEADER BAR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-lg bg-[#1A2B4C] text-[#D4AF37] font-serif font-bold text-xs shadow-xs">
                    DIA {activeDay.dayNumber}
                  </span>
                  {!settings.isFlexibleDates && (
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                      {formatDisplayDate(activeDay.date, true)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <h2 className="text-xl sm:text-2xl font-bold font-serif text-[#1A2B4C]">
                    {activeDay.title}
                  </h2>
                  <button
                    id={`btn-edit-park-modal-${activeDay.id}`}
                    onClick={() => openParkModal(activeDay)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#1A2B4C] hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Alterar Parque ou Título deste Dia"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <p className="font-semibold text-[#1A2B4C] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Parque / Atividade: <span className="text-slate-800 font-bold">{activeDay.park}</span>
                  </p>
                  {activeDay.parkBooking?.parkPassStatus && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                        activeDay.parkBooking.parkPassStatus.includes('Previsão')
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : activeDay.parkBooking.parkPassStatus === 'Pendente'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {activeDay.parkBooking.parkPassStatus.includes('Previsão') ? '💡 ' : '✅ '}
                      {activeDay.parkBooking.parkPassStatus}
                    </span>
                  )}
                  <button
                    onClick={() => openParkModal(activeDay)}
                    className="text-[11px] font-bold text-[#1A2B4C] hover:text-[#D4AF37] underline cursor-pointer"
                  >
                    (Alterar Parque / Dicas)
                  </button>
                </div>

                {/* Quick Park Features: Fast Pass, Dining, Shows, Photos */}
                {activeDay.park && activeDay.park !== 'Sem Parque' && !isNonParkEvent(activeDay.park) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleOpenFullParkBooking('fastpass')}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Gerenciar Fast Pass / Lightning Lane"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>Fast Pass ({activeDay.parkBooking?.fastPasses?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenFullParkBooking('dining')}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Gerenciar Reservas de Restaurantes"
                    >
                      <Utensils className="w-3.5 h-3.5 text-rose-500" />
                      <span>Restaurantes ({activeDay.parkBooking?.diningReservations?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenFullParkBooking('shows')}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Gerenciar Shows e Fogos"
                    >
                      <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Shows & Fogos ({activeDay.parkBooking?.showsAndParades?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenFullParkBooking('photos')}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        activeDay.parkBooking?.hasPhotoPackage
                          ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-300'
                          : 'bg-purple-50/60 hover:bg-purple-100 text-purple-800 border-purple-200'
                      }`}
                      title="Gerenciar Pacote de Fotos / PhotoPass / Memory Maker"
                    >
                      <Camera className="w-3.5 h-3.5 text-purple-600" />
                      <span>
                        {activeDay.parkBooking?.hasPhotoPackage
                          ? '📸 PhotoPass Ativo'
                          : '+ Pacote de Fotos'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Car Rental Pickup / Dropoff Notice */}
                {(() => {
                  const isDayOne = activeDay.dayNumber === 1;
                  const isLastDay = activeDay.dayNumber === itineraryDays.length;
                  const dayPickups = carRentals?.filter((r) => r.pickupDate === activeDay.date || (isDayOne && !r.pickupDate)) || [];
                  const dayDropoffs = carRentals?.filter((r) => r.dropoffDate === activeDay.date || (isLastDay && !r.dropoffDate)) || [];

                  if (dayPickups.length === 0 && dayDropoffs.length === 0) return null;

                  return (
                    <div className="space-y-2 mt-3 pt-3 border-t border-slate-100">
                      {dayPickups.map((rental) => (
                        <div key={`pickup-${rental.id}`} className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-blue-600 shrink-0" />
                            <div>
                              <span className="font-bold">🚗 Retirada de Carro Alugado:</span> {rental.company || 'Locadora'} — {rental.category || 'Veículo'} às {rental.pickupTime || '10:00'}
                              <div className="text-[11px] text-blue-700 mt-0.5">Local: {rental.pickupLocation || 'Aeroporto MCO'} | Reserva: {rental.confirmationCode || 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {dayDropoffs.map((rental) => (
                        <div key={`dropoff-${rental.id}`} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-amber-600 shrink-0" />
                            <div>
                              <span className="font-bold">🚗 Devolução de Carro Alugado:</span> {rental.company || 'Locadora'} — {rental.category || 'Veículo'} às {rental.dropoffTime || '16:00'}
                              <div className="text-[11px] text-amber-700 mt-0.5">Local: {rental.dropoffLocation || 'Aeroporto MCO'}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Day Header Right CTAs */}
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const isDayDone = isDayEffectivelyCompleted(activeDay, settings.isFlexibleDates);
                  const isPastDate = isDateInPast(activeDay.date, settings.isFlexibleDates);

                  return (
                    <button
                      id={`btn-toggle-complete-day-${activeDay.id}`}
                      onClick={() => toggleDayCompleted(activeDay.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isDayDone
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      }`}
                      title={isPastDate ? 'Concluído automaticamente pois a data já passou' : 'Clique para alternar o status do dia'}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${isDayDone ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>{isDayDone ? (isPastDate ? 'Dia Concluído (Automático)' : 'Dia Concluído') : 'Marcar Concluído'}</span>
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* QUICK LOGISTICS BADGE BAR (Park hours, Hotel, Car) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Parque & Horários</span>
                  <span className="font-bold text-[#1A2B4C]">
                    {(() => {
                      if (!isDayWithPark(activeDay)) {
                        return 'Dia livre / sem parque';
                      }
                      if (activeDay.parkBooking?.parkHours) {
                        const { openingTime, closingTime, earlyEntryTime } = activeDay.parkBooking.parkHours;
                        if (earlyEntryTime) {
                          return `${openingTime} - ${closingTime} (Early: ${earlyEntryTime})`;
                        }
                        return `${openingTime} - ${closingTime}`;
                      }
                      // Check if there are opening/closing times in the hourly schedule
                      const openingItem = activeDay.hourlySchedule?.find((i) => {
                        const t = (i.title || '').toLowerCase();
                        return t.includes('abertura') || t.includes('chegada ao parque');
                      });
                      const closingItem = activeDay.hourlySchedule?.find((i) => {
                        const t = (i.title || '').toLowerCase();
                        return t.includes('encerramento') || t.includes('saída do parque');
                      });
                      if (openingItem && closingItem) {
                        return `${openingItem.time} - ${closingItem.time}`;
                      }
                      return '09:00 - 21:00';
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                  <Hotel className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Hospedagem</span>
                  <span className="font-bold text-[#1A2B4C] truncate block">
                    {getAccommodationForDay(activeDay.date, activeDay.dayNumber)?.name || 'Nenhuma cadastrada'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                  <Car className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Transporte / Carro</span>
                  <span className="font-bold text-[#1A2B4C] truncate block">
                    {carRentalInfo ? `${carRentalInfo.company}${carRentalInfo.category ? ` (${carRentalInfo.category})` : ''}` : 'Nenhum cadastrado'}
                  </span>
                </div>
              </div>
            </div>

            {/* Photo Package Banner */}
            {(() => {
              const photoPkg = getDayPhotoPackage(activeDay);
              if (!photoPkg) return null;
              return (
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-purple-950">
                          📸 Pacote de Fotos Ativo: {photoPkg.name}
                        </span>
                        {photoPkg.code && (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                            #{photoPkg.code}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-purple-700 mt-0.5">
                        {photoPkg.details || 'Download ilimitado de fotos profissionais no app oficial do parque.'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-200/80 text-purple-900 shrink-0">
                    Fotos Ilimitadas
                  </span>
                </div>
              );
            })()}

            {/* ========================================================================= */}
            {/* SECTION 1: MASTER HOURLY SCHEDULE TIMELINE (HORA A HORA)                  */}
            {/* ========================================================================= */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#1A2B4C] text-[#D4AF37] flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] uppercase tracking-wide">
                      Cronograma Passo a Passo (Hora a Hora)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Ordem cronológica das atividades e compromissos do Dia {activeDay.dayNumber}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-add-hourly-item"
                    onClick={() => handleOpenHourlyModal(activeDay?.id)}
                    className="px-3 py-1.5 rounded-xl bg-[#1A2B4C] hover:bg-[#243B68] text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Adicionar Horário</span>
                  </button>
                </div>
              </div>

              {/* TIMELINE LIST */}
              {getHourlySchedule(activeDay).length === 0 ? (
                <div className="bg-slate-50/80 border border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-3 my-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Roteiro em branco para este dia</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
                      Nenhum horário cadastrado ainda. Adicione seus próprios compromissos e atividades.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      id="btn-add-hourly-empty-state"
                      onClick={() => handleOpenHourlyModal(activeDay?.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#1A2B4C] hover:bg-[#243B68] text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Adicionar Horário</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative pl-4 sm:pl-6 border-l-2 border-[#1A2B4C]/20 space-y-3.5 my-2">
                  {getHourlySchedule(activeDay).map((item, iIdx) => {
                  const badge = getCategoryBadge(item.category, item);
                  const Icon = badge.icon;
                  const isItemDone = isScheduleItemEffectivelyCompleted(activeDay.date, item, settings.isFlexibleDates);
                  const isTimePast = isDateTimeInPast(activeDay.date, item.time, settings.isFlexibleDates);
                  const isParkOpening = item.title.toLowerCase().includes('abre') || item.title.toLowerCase().includes('abertura') || item.title.toLowerCase().includes('rope drop');
                  const isCarPickup = item.title.toLowerCase().includes('carro') || item.title.toLowerCase().includes('locadora');
                  const isFireworks = item.title.toLowerCase().includes('fogos') || item.title.toLowerCase().includes('show');

                  return (
                    <div
                      key={`${item.id}-${iIdx}`}
                      className={`relative bg-white rounded-xl p-3.5 border transition-all ${
                        isItemDone
                          ? 'bg-slate-50/80 border-slate-200 opacity-75'
                          : isParkOpening
                          ? 'border-amber-300 bg-amber-50/30 shadow-xs'
                          : isCarPickup
                          ? 'border-blue-300 bg-blue-50/30 shadow-xs'
                          : isFireworks
                          ? 'border-purple-300 bg-purple-50/30 shadow-xs'
                          : 'border-slate-200 shadow-xs hover:border-slate-300'
                      }`}
                    >
                      {/* Timeline Dot on the left line */}
                      <div
                        className={`absolute -left-[23px] sm:-left-[31px] top-4 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                          isItemDone
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-[#1A2B4C]'
                        }`}
                      />

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {/* Complete Checkbox */}
                          <button
                            type="button"
                            onClick={() => handleToggleScheduleItem(activeDay.id, item.id)}
                            className="mt-0.5 p-1 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer shrink-0"
                            title={
                              isItemDone
                                ? isTimePast
                                  ? 'Concluído automaticamente pelo horário. Clique para alternar'
                                  : 'Marcar como não feito'
                                : 'Marcar como concluído'
                            }
                          >
                            {isItemDone ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                            )}
                          </button>

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Time Pill */}
                              <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                                isItemDone ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'text-[#1A2B4C] bg-slate-100 border-slate-200'
                              }`}>
                                {item.time}
                              </span>

                              {/* Category Badge */}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${badge.bg}`}>
                                <Icon className="w-3 h-3" />
                                {badge.label}
                              </span>

                              {item.location && (
                                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  {item.location}
                                </span>
                              )}

                              {isTimePast && (
                                <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded font-semibold">
                                  Auto (horário decorrido)
                                </span>
                              )}
                            </div>

                            <h4 className={`text-sm font-bold ${isItemDone ? 'line-through text-slate-400' : 'text-[#1A2B4C]'}`}>
                              {item.title}
                            </h4>

                            {item.notes && (
                              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/60 mt-1">
                                <strong>Dica:</strong> {item.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Edit & Delete buttons */}
                        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenHourlyModal(activeDay?.id, item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1A2B4C] hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Editar horário"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete({
                                dayId: activeDay.id,
                                itemId: item.id,
                                title: item.title,
                              });
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 3: GENERAL NOTES                                                 */}
            {/* ========================================================================= */}
            <div className="pt-4 border-t border-slate-200">
              {/* General Notes */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C] flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Observações Gerais do Grupo para o Dia {activeDay.dayNumber}
                </label>
                <textarea
                  rows={3}
                  value={activeDay.generalNotes}
                  onChange={(e) =>
                    updateItineraryDay(activeDay.id, { generalNotes: e.target.value })
                  }
                  placeholder="Ex: Usar roupas leves, levar garrafinha de água recarregável e definir ponto de encontro no castelo..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-700 bg-slate-50 focus:ring-2 focus:ring-[#1A2B4C]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 2: ALL DAYS MASTER PANORAMA (FULL LIST OF ALL DAYS)             */}
        {/* ========================================================================= */}
        {viewMode === 'all' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-700">
                Mostrando <strong className="text-[#1A2B4C]">{filteredDays.length}</strong> de {itineraryDays.length} dias programados
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allExp: Record<string, boolean> = {};
                    itineraryDays.forEach((d) => {
                      allExp[d.id] = true;
                    });
                    setExpandedAllDayIds(allExp);
                  }}
                  className="text-xs font-bold text-[#1A2B4C] hover:underline cursor-pointer transition-colors"
                >
                  Expandir Todos
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => {
                    const allCollapsed: Record<string, boolean> = {};
                    itineraryDays.forEach((d) => {
                      allCollapsed[d.id] = false;
                    });
                    setExpandedAllDayIds(allCollapsed);
                  }}
                  className="text-xs font-bold text-slate-500 hover:underline cursor-pointer transition-colors"
                >
                  Recolher Todos
                </button>
              </div>
            </div>

            {filteredDays.map((day) => {
              const schedule = getHourlySchedule(day);
              const isExpanded = expandedAllDayIds[day.id] ?? true; // default expanded

              return (
                <div
                  key={day.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden transition-all"
                >
                  {/* Day Header Bar */}
                  <div
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      setExpandedAllDayIds((prev) => {
                        const current = prev[day.id] ?? true;
                        return {
                          ...prev,
                          [day.id]: !current,
                        };
                      });
                    }}
                    className="bg-gradient-to-r from-[#1A2B4C] to-[#243B68] p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#D4AF37] text-[#1A2B4C] flex flex-col items-center justify-center font-serif font-bold shrink-0 shadow-md">
                        <span className="text-[9px] uppercase tracking-tighter leading-none">DIA</span>
                        <span className="text-base leading-none font-bold">{day.dayNumber}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 text-xs text-[#D4AF37] font-semibold">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDisplayDate(day.date)}</span>
                          <span>•</span>
                          <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                            {day.park}
                          </span>
                          {isDayEffectivelyCompleted(day, settings.isFlexibleDates) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                              <CheckCircle2 className="w-3 h-3" />
                              Concluído {isDateInPast(day.date, settings.isFlexibleDates) ? '(Auto)' : ''}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base sm:text-lg font-bold font-serif text-white">
                          {day.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDayId(day.id);
                          setViewMode('single');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Ver no modo detalhado"
                      >
                        <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Focar neste Dia</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenHourlyModal(day.id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:brightness-110 text-[#1A2B4C] font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Horário</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedAllDayIds((prev) => {
                            const current = prev[day.id] ?? true;
                            return {
                              ...prev,
                              [day.id]: !current,
                            };
                          });
                        }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        aria-label={isExpanded ? 'Recolher dia' : 'Expandir dia'}
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Master Day Timeline Content */}
                  {isExpanded && (
                    <div className="p-4 sm:p-6 space-y-5 bg-slate-50/50">
                      {/* Photo Package Banner */}
                      {(() => {
                        const photoPkg = getDayPhotoPackage(day);
                        if (!photoPkg) return null;
                        return (
                          <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Camera className="w-4 h-4 text-purple-600 shrink-0" />
                              <div>
                                <span className="font-bold">📸 Pacote de Fotos Ativo: </span>
                                <span>{photoPkg.name}</span>
                                {photoPkg.code && (
                                  <span className="font-mono text-purple-800 ml-1 font-bold">
                                    (#{photoPkg.code})
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 shrink-0">
                              Fotos Ilimitadas
                            </span>
                          </div>
                        );
                      })()}

                      {/* Chronological Timeline */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-[#D4AF37]" />
                          <span>Cronograma Completo (Hora a Hora)</span>
                        </h4>

                        {schedule.length === 0 ? (
                          <div className="bg-white rounded-xl p-4 border border-dashed border-slate-300 text-center space-y-2">
                            <p className="text-xs text-slate-500 font-medium">Nenhum horário agendado para este dia.</p>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenHourlyModal(day.id)}
                                className="px-2.5 py-1 rounded-lg bg-[#1A2B4C] text-white font-bold text-xs hover:bg-[#243B68] transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3 text-[#D4AF37]" />
                                <span>+ Adicionar Horário</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative pl-4 sm:pl-6 border-l-2 border-[#1A2B4C]/20 space-y-3">
                            {schedule.map((item, sIdx) => {
                            const badge = getCategoryBadge(item.category, item);
                            const Icon = badge.icon;
                            const isItemDone = isScheduleItemEffectivelyCompleted(day.date, item, settings.isFlexibleDates);
                            const isTimePast = isDateTimeInPast(day.date, item.time, settings.isFlexibleDates);

                            return (
                              <div
                                key={`${item.id}-${sIdx}`}
                                className={`relative bg-white rounded-xl p-3 border transition-all ${
                                  isItemDone
                                    ? 'bg-slate-50 border-slate-200 opacity-75'
                                    : 'border-slate-200 shadow-2xs'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 truncate">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleScheduleItem(day.id, item.id)}
                                      className="p-0.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer shrink-0"
                                      title={
                                        isItemDone
                                          ? isTimePast
                                            ? 'Concluído automaticamente pelo horário. Clique para alternar'
                                            : 'Marcar como não feito'
                                          : 'Marcar como concluído'
                                      }
                                    >
                                      {isItemDone ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      ) : (
                                        <Circle className="w-4 h-4 text-slate-300" />
                                      )}
                                    </button>

                                    <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border shrink-0 ${
                                      isItemDone ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'text-[#1A2B4C] bg-slate-100 border-slate-200'
                                    }`}>
                                      {item.time}
                                    </span>

                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 shrink-0 ${badge.bg}`}>
                                      <Icon className="w-2.5 h-2.5" />
                                      {badge.label}
                                    </span>

                                    <span className={`text-xs font-bold truncate ${isItemDone ? 'line-through text-slate-400' : 'text-[#1A2B4C]'}`}>
                                      {item.title}
                                    </span>

                                    {isTimePast && (
                                      <span className="text-[9px] text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded font-semibold shrink-0">
                                        Auto
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenHourlyModal(day.id, item)}
                                      className="p-1 text-slate-400 hover:text-[#1A2B4C] cursor-pointer"
                                      title="Editar"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDelete({
                                        dayId: day.id,
                                        itemId: item.id,
                                        title: item.title,
                                      })}
                                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                      title="Excluir"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {item.notes && (
                                  <p className="text-[11px] text-slate-600 mt-1 pl-7">
                                    <strong>Obs:</strong> {item.notes}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT HOURLY SCHEDULE ITEM                                    */}
      {/* ========================================================================= */}
      {isHourlyModalOpen && (
        <div
          id="modal-add-hourly"
          onClick={handleHourlyBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-6xl w-full overflow-hidden shadow-2xl border border-slate-200 h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    {editingHourlyItemId ? 'Edição de Atividade' : 'Novo Item'} • Cronograma do Dia {activeDay.dayNumber}
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    {editingHourlyItemId ? 'Editar Atividade do Cronograma' : 'Adicionar Atividade ao Cronograma'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsHourlyModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHourlyItem} className="flex flex-col flex-1 min-h-0 overflow-hidden text-slate-700">
              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                {/* 1. Detalhes do Horário */}
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    1. Detalhes da Atividade & Horário
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">Horário (HH:MM) *</label>
                        <input
                          type="time"
                          required
                          value={hourlyForm.time}
                          onChange={(e) => setHourlyForm({ ...hourlyForm, time: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer shadow-2xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">Categoria</label>
                        <select
                          value={hourlyForm.category}
                          onChange={(e) => setHourlyForm({ ...hourlyForm, category: e.target.value as any })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer shadow-2xs"
                        >
                          <option value="park">Parque & Atração</option>
                          <option value="dining">Refeição / Reserva</option>
                          <option value="transport">Transporte / Deslocamento</option>
                          <option value="hotel">Hotel & Resort</option>
                          <option value="airbnb">Airbnb</option>
                          <option value="shopping">Compras & Outlets</option>
                          <option value="flight">Voo & Aeroporto</option>
                          <option value="other">Outro</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">Título da Atividade *</label>
                      <input
                        type="text"
                        required
                        value={hourlyForm.title}
                        onChange={(e) => setHourlyForm({ ...hourlyForm, title: e.target.value })}
                        placeholder="Ex: Abertura oficial Rope Drop, Almoço Be Our Guest..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Localização e Notas */}
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    2. Localização & Observações
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block text-slate-700">Local / Destino</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={hourlyForm.location}
                          onChange={(e) => setHourlyForm({ ...hourlyForm, location: e.target.value })}
                          placeholder="Ex: Magic Kingdom, CityWalk, Walmart Vineland..."
                          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">Dica / Observações</label>
                      <textarea
                        rows={3}
                        value={hourlyForm.notes}
                        onChange={(e) => setHourlyForm({ ...hourlyForm, notes: e.target.value })}
                        placeholder="Ex: Chegar com 30min de antecedência, levar voucher no celular..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                {editingHourlyItemId ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteScheduleItem(hourlyTargetDayId, editingHourlyItemId);
                      setIsHourlyModalOpen(false);
                      setEditingHourlyItemId(null);
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
                    onClick={() => setIsHourlyModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>Salvar</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: QUICK PARK & TITLE EDIT                                            */}
      {/* ========================================================================= */}
      {parkModalOpen && (
        <div
          id="modal-edit-park"
          onClick={handleParkModalBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-6xl w-full overflow-hidden shadow-2xl border border-slate-200 h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 text-slate-700">
            {/* Modal Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Configuração do Dia {(itineraryDays.find((d) => d.id === parkModalTargetDayId) || activeDay).dayNumber} • Destino & Título
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Parque & Título do Dia
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setParkModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                {/* 1. Título & Localização */}
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    1. Nomeação & Destino Principal
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4 text-xs">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">Título do Dia *</label>
                      <input
                        type="text"
                        value={tempDayTitle}
                        onChange={(e) => setTempDayTitle(e.target.value)}
                        placeholder="Ex: Magic Kingdom - Dia 1"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">Parque Principal / Local</label>
                      <input
                        type="text"
                        value={tempDayPark}
                        onChange={(e) => setTempDayPark(e.target.value)}
                        placeholder="Ex: Magic Kingdom, Universal Studios, Compras..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1A2B4C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Observações Gerais / Notas do Dia</span>
                      </label>
                      <textarea
                        rows={3}
                        value={tempDayGeneralNotes}
                        onChange={(e) => setTempDayGeneralNotes(e.target.value)}
                        placeholder="Escreva observações gerais para este dia (ex: ritmo do grupo, levar protetor, roupas leves, vouchers)..."
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Seleção Rápida */}
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    2. Sugestões de Parques & Experiências
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-2 gap-2">
                      {PARKS_GUIDE_DATA.map((park) => (
                        <button
                          key={park.id}
                          type="button"
                          onClick={() => {
                            setTempDayPark(park.name);
                            setTempDayTitle(`${park.name} - Dia Completo`);
                          }}
                          className={`p-2.5 rounded-xl text-left border text-[10px] font-bold transition-all cursor-pointer truncate ${
                            tempDayPark.toLowerCase() === park.name.toLowerCase()
                              ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-sm'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          {park.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setTempDayPark('Sem Parque');
                          setTempDayTitle('Chegada');
                        }}
                        className="p-2.5 rounded-xl text-left border text-[10px] font-bold bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900 cursor-pointer truncate"
                      >
                        ✈️ Chegada
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempDayPark('Sem Parque');
                          setTempDayTitle('Partida');
                        }}
                        className="p-2.5 rounded-xl text-left border text-[10px] font-bold bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-900 cursor-pointer truncate"
                      >
                        🛫 Partida
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempDayPark('Sem Parque');
                          setTempDayTitle('Sem Parque');
                        }}
                        className="p-2.5 rounded-xl text-left border text-[10px] font-bold bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 cursor-pointer truncate"
                      >
                        🎡 Sem Parque
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempDayPark('Dia Livre / Compras nos Outlets');
                          setTempDayTitle('Compras nos Outlets de Orlando');
                        }}
                        className="p-2.5 rounded-xl text-left border text-[10px] font-bold bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 cursor-pointer truncate"
                      >
                        🛍️ Compras / Outlets
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempDayPark('Descanso / Disney Springs');
                          setTempDayTitle('Dia Livre & Disney Springs');
                        }}
                        className="p-2.5 rounded-xl text-left border text-[10px] font-bold bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 cursor-pointer truncate"
                      >
                        🌴 Descanso / Springs
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setParkModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveParkModal}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md text-center disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ATTACHMENT UPLOAD                                                  */}
      {/* ========================================================================= */}
      {attModalOpen && (
        <div
          id="modal-attachment-upload"
          onClick={handleAttModalBackdrop}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Paperclip className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Documentos do Dia {activeDay.dayNumber}
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Anexar Documento / Voucher
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAttModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimulatedFileUpload} className="p-5 sm:p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Documento / Voucher *</label>
                <input
                  type="text"
                  required
                  value={newAttName}
                  onChange={(e) => setNewAttName(e.target.value)}
                  placeholder="Ex: Ingresso Magic Kingdom, Reserva Be Our Guest..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Arquivo</label>
                <select
                  value={newAttType}
                  onChange={(e) => setNewAttType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-medium text-slate-800"
                >
                  <option value="pdf">Documento PDF / Voucher</option>
                  <option value="ticket">Ingresso / Ticket Digital</option>
                  <option value="image">Foto / Comprovante</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAttModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PDF PRINT / EXPORT PREFERENCES                                     */}
      {/* ========================================================================= */}
      {pdfModalOpen && (
        <div
          id="modal-pdf-export"
          onClick={handlePdfModalBackdrop}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Printer className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Exportação & Impressão PDF
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Gerar PDF do Roteiro
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-blue-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-xs text-blue-950">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Visão Geral Master Oficial
                </p>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  O documento em PDF incluirá a visão geral completa da viagem: dados mestres, passagens aéreas com localizadores, hospedagens, aluguel de veículo, tabela calendário consolidada e o roteiro detalhado dia a dia com toda a programação hora a hora.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-2">Selecione o Escopo do PDF:</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPdfScope('all')}
                    className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      pdfScope === 'all'
                        ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Layers className={`w-4 h-4 ${pdfScope === 'all' ? 'text-[#D4AF37]' : 'text-slate-500'}`} />
                    <span className="font-bold text-xs">Roteiro Master Completo</span>
                    <span className={`text-[10px] ${pdfScope === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                      Todos os {itineraryDays.length} Dias + Logística Master
                    </span>
                  </button>

                  <div
                    id="btn-scope-selected-day-card"
                    onClick={() => setPdfScope('selected')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-center gap-1.5 ${
                      pdfScope === 'selected'
                        ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <button
                        id="btn-pdf-prev-day"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasPrevDay) {
                            const prevDay = itineraryDays[currentDayIndex - 1];
                            setSelectedDayId(prevDay.id);
                            setSelectedDayNumber(prevDay.dayNumber);
                            setPdfScope('selected');
                          }
                        }}
                        disabled={!hasPrevDay}
                        className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${
                          !hasPrevDay
                            ? 'opacity-25 cursor-not-allowed'
                            : pdfScope === 'selected'
                            ? 'bg-white/20 hover:bg-white/30 text-white cursor-pointer active:scale-95'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer active:scale-95 shadow-xs'
                        }`}
                        title={hasPrevDay ? `Ir para o Dia ${itineraryDays[currentDayIndex - 1]?.dayNumber}` : 'Primeiro dia'}
                        aria-label="Dia anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="flex flex-col items-center justify-center flex-1 px-1 min-w-0 text-center">
                        <Calendar className={`w-4 h-4 mb-0.5 shrink-0 ${pdfScope === 'selected' ? 'text-[#D4AF37]' : 'text-slate-500'}`} />
                        <span className="font-bold text-xs truncate max-w-full">Apenas Dia {activeDay.dayNumber}</span>
                        <span className={`text-[10px] truncate max-w-full font-medium ${pdfScope === 'selected' ? 'text-slate-300' : 'text-slate-500'}`}>
                          {activeDay.park || activeDay.title}
                        </span>
                      </div>

                      <button
                        id="btn-pdf-next-day"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasNextDay) {
                            const nextDay = itineraryDays[currentDayIndex + 1];
                            setSelectedDayId(nextDay.id);
                            setSelectedDayNumber(nextDay.dayNumber);
                            setPdfScope('selected');
                          }
                        }}
                        disabled={!hasNextDay}
                        className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${
                          !hasNextDay
                            ? 'opacity-25 cursor-not-allowed'
                            : pdfScope === 'selected'
                            ? 'bg-white/20 hover:bg-white/30 text-white cursor-pointer active:scale-95'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer active:scale-95 shadow-xs'
                        }`}
                        title={hasNextDay ? `Ir para o Dia ${itineraryDays[currentDayIndex + 1]?.dayNumber}` : 'Último dia'}
                        aria-label="Próximo dia"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-print-pdf"
                  type="button"
                  onClick={() => {
                    setPdfModalOpen(false);
                    executePrintPdf(pdfScope);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2c] text-[#1A2B4C] font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
                >
                  <Printer className="w-4 h-4 text-[#1A2B4C]" />
                  <span>Imprimir / Salvar PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL PARK BOOKING / FAST PASS MODAL */}
      <ParkBookingModal
        isOpen={fullParkBookingOpen}
        onClose={() => setFullParkBookingOpen(false)}
        day={activeDay}
        allDays={itineraryDays}
        initialTab={fullParkBookingInitialTab}
        onSave={(updates, targetDayId) => {
          const idToUpdate = targetDayId || activeDay?.id;
          if (idToUpdate) {
            return updateItineraryDay(idToUpdate, updates);
          }
        }}
        onRemovePark={(targetDayId, cleanedDay) => {
          const idToUpdate = targetDayId || activeDay?.id;
          if (!idToUpdate) return;
          const targetDay = itineraryDays.find((d) => d.id === idToUpdate) || activeDay;
          const cleaned = cleanedDay || (targetDay ? clearParkReferencesFromDay(targetDay, itineraryDays.length) : {
            park: 'Sem Parque',
            parkBooking: undefined,
          });
          return updateItineraryDay(idToUpdate, cleaned);
        }}
      />

      {/* MASTER OVERVIEW SUMMARY MODAL (Substituído pelo MasterOverviewModal global) */}
      {false && (() => {
        const handleMasterOverviewBackdrop = undefined;
        const setMasterOverviewModalOpen = (_v?: boolean) => {};
        const tripEndDate = itineraryDays[itineraryDays.length - 1]?.date || getTripEndDate(settings.startDate, settings.durationDays);
        const fullPeriodText = settings.isFlexibleDates
          ? `Data Não Definida (${settings.durationDays} dias)`
          : `${formatDisplayDate(settings.startDate, false)} até ${formatDisplayDate(tripEndDate, false)}`;

        const totalScheduleItems = itineraryDays.reduce((acc, d) => acc + (d.hourlySchedule?.length || 0), 0);
        const completedDaysCount = itineraryDays.filter(d => isDayEffectivelyCompleted(d, settings.isFlexibleDates)).length;

        const filteredDays = itineraryDays.filter((d) => {
          if (!overviewSearchQuery.trim()) return true;
          const q = overviewSearchQuery.toLowerCase();
          const matchTitle = (d.title || '').toLowerCase().includes(q);
          const matchPark = (d.park || '').toLowerCase().includes(q);
          const matchPeriods =
            (d.morning.where || '').toLowerCase().includes(q) ||
            (d.morning.dining || '').toLowerCase().includes(q) ||
            (d.afternoon.where || '').toLowerCase().includes(q) ||
            (d.afternoon.dining || '').toLowerCase().includes(q) ||
            (d.night.where || '').toLowerCase().includes(q) ||
            (d.night.dining || '').toLowerCase().includes(q) ||
            (d.generalNotes || '').toLowerCase().includes(q);
          const matchHourly = (d.hourlySchedule || []).some(
            (item) =>
              (item.title || '').toLowerCase().includes(q) ||
              (item.time || '').toLowerCase().includes(q) ||
              (item.location || '').toLowerCase().includes(q) ||
              (item.notes || '').toLowerCase().includes(q)
          );
          return matchTitle || matchPark || matchPeriods || matchHourly;
        });

        return (
          <div
            id="modal-master-overview-backdrop"
            onClick={handleMasterOverviewBackdrop}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
          >
            <div
              id="modal-master-overview-content"
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            >
              {/* Modal Header */}
              <div className="p-5 sm:p-6 bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden shrink-0 border-b border-[#D4AF37]/30">
                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-56 h-56 bg-[#D4AF37]/15 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-start sm:items-center gap-3.5 relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-md shrink-0">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                        Visão Geral
                      </span>
                      <span className="text-[10px] bg-white/20 px-2.5 py-0.5 rounded-full text-white font-semibold">
                        {settings.durationDays} Dias de Viagem
                      </span>
                      <span className="text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full text-slate-200">
                        {settings.travelersCount} {settings.travelersCount === 1 ? 'Viajante' : 'Viajantes'}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold font-serif text-white tracking-tight">
                      Resumo Executivo da Viagem
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-200 font-medium">
                      📍 <strong>{settings.destination || 'Orlando, Flórida'}</strong> • 📅 {fullPeriodText}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body with Scroll */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-800 flex-1 custom-scrollbar">
                {/* Quick Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Duração Total</span>
                    <div className="text-lg font-bold font-serif text-[#1A2B4C] mt-0.5">
                      {settings.durationDays} Dias
                    </div>
                    <span className="text-[10px] text-slate-500 truncate block">
                      Início: {formatDisplayDate(settings.startDate, false)}
                    </span>
                  </div>

                  <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">Progresso do Roteiro</span>
                    <div className="text-lg font-bold font-serif text-emerald-800 mt-0.5">
                      {completedDaysCount} / {itineraryDays.length} Dias
                    </div>
                    <span className="text-[10px] text-emerald-600 font-medium">
                      {Math.round((completedDaysCount / (itineraryDays.length || 1)) * 100)}% concluído
                    </span>
                  </div>

                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                    <span className="text-[10px] font-bold uppercase text-amber-800 block">Parques e Atrações</span>
                    <div className="text-lg font-bold font-serif text-amber-900 mt-0.5">
                      {itineraryDays.filter(d => isDayWithPark(d)).length} Parques
                    </div>
                    <span className="text-[10px] text-amber-700">
                      {itineraryDays.filter(d => !isDayWithPark(d)).length} Dias Livres/Compras
                    </span>
                  </div>

                  <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                    <span className="text-[10px] font-bold uppercase text-blue-800 block">Tabela Hora a Hora</span>
                    <div className="text-lg font-bold font-serif text-blue-900 mt-0.5">
                      {totalScheduleItems} {totalScheduleItems === 1 ? 'Atividade' : 'Atividades'}
                    </div>
                    <span className="text-[10px] text-blue-700">
                      Dólar Base: R$ {(settings.dollarRate || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Quick Logistics Dossier (Flights, Hotel, Car) */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                    <Plane className="w-4 h-4 text-[#D4AF37]" />
                    <span>Dossiê Rápido de Logística & Transportes</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Flight Box */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Plane className="w-3.5 h-3.5 text-blue-600" />
                          Passagens Aéreas
                        </span>
                        {groupedFlightSegments && groupedFlightSegments.length > 0 && (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {groupedFlightSegments.length} {groupedFlightSegments.length === 1 ? 'voo' : 'voos'}
                          </span>
                        )}
                      </div>

                      {groupedFlightSegments && groupedFlightSegments.length > 0 ? (
                        <div className="space-y-2 text-[11px]">
                          {groupedFlightSegments.map(({ flight, pnrs }, idx) => {
                            const info = getFlightDisplayInfo(flight, pnrs);
                            const isOutbound = flight.type === 'outbound';
                            const isInbound = flight.type === 'inbound';
                            const isConn = flight.type === 'connection';
                            const icon = isOutbound ? '🛫' : isInbound ? '🛬' : isConn ? '🔄' : '✈️';
                            const label = isOutbound ? 'Ida' : isInbound ? 'Volta' : isConn ? 'Conexão' : `Voo ${idx + 1}`;

                            return (
                              <div
                                key={flight.id || idx}
                                className="p-2.5 bg-white rounded-lg border border-slate-200/90 space-y-1.5 shadow-2xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 font-bold text-[#1A2B4C] leading-snug">
                                    <span>{icon}</span>
                                    <span className="text-slate-900">{label}:</span>
                                    <span className="text-blue-900 font-bold">{info.origin} ➔ {info.destination}</span>
                                  </div>
                                  {info.pnrs.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {info.pnrs.map((pnr) => (
                                        <span
                                          key={pnr}
                                          className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[9px] font-mono font-bold border border-slate-200 tracking-wider shadow-2xs"
                                          title="Localizador de Reserva (PNR)"
                                        >
                                          PNR: {pnr}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                                  <span className="font-semibold text-blue-800 bg-blue-50/80 px-1.5 py-0.2 rounded border border-blue-100">
                                    {info.airlineAndFlight}
                                  </span>
                                  <span>Partida: <strong className="text-slate-800">{info.departureFormatted}</strong></span>
                                  {info.arrivalFormatted && (
                                    <span>• Chegada: <strong className="text-slate-800">{info.arrivalFormatted}</strong></span>
                                  )}
                                  {info.duration && (
                                    <span className="text-slate-500">• {info.duration}</span>
                                  )}
                                </div>

                                {info.hasStopovers ? (
                                  <div className="flex items-center gap-1 text-[10px] text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                                    <span className="font-bold text-amber-700 shrink-0">⚠️ Escala / Conexão:</span>
                                    <span className="truncate">{info.stopoversText}</span>
                                  </div>
                                ) : flight.stopovers && flight.stopovers.toLowerCase().includes('direto') ? (
                                  <div className="text-[9px] text-emerald-700 font-medium flex items-center gap-1">
                                    <span>✓</span> <span>Voo Direto</span>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic text-[11px]">Nenhum voo cadastrado.</p>
                      )}
                    </div>

                    {/* Accommodation Box */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1">
                        <span className="flex items-center gap-1.5">
                          <Hotel className="w-3.5 h-3.5 text-amber-600" />
                          Hospedagem Principal
                        </span>
                        {accommodations && accommodations[0]?.confirmationCode && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[9px] font-mono font-bold">
                            Res: {accommodations[0].confirmationCode}
                          </span>
                        )}
                      </div>
                      {accommodations && accommodations.length > 0 ? (
                        <div className="space-y-1 text-[11px]">
                          <p className="font-bold text-slate-800">{accommodations[0].name}</p>
                          <p className="text-slate-600 text-[10px]">
                            Check-in: {formatDisplayDate(accommodations[0].checkInDate, false)} {accommodations[0].checkInTime ? `às ${accommodations[0].checkInTime}` : ''}
                          </p>
                          <p className="text-slate-600 text-[10px]">
                            Check-out: {formatDisplayDate(accommodations[0].checkOutDate, false)} {accommodations[0].checkOutTime ? `às ${accommodations[0].checkOutTime}` : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-500 italic text-[11px]">Nenhuma hospedagem cadastrada.</p>
                      )}
                    </div>

                    {/* Car Rental Box */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1">
                        <span className="flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-emerald-600" />
                          Locação de Veículo
                        </span>
                        {carRentalInfo?.confirmationCode && (
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-mono font-bold">
                            Cod: {carRentalInfo.confirmationCode}
                          </span>
                        )}
                      </div>
                      {carRentalInfo ? (
                        <div className="space-y-1 text-[11px]">
                          <p className="font-bold text-slate-800">{carRentalInfo.company || 'Locadora'} ({carRentalInfo.category || 'Veículo'})</p>
                          <p className="text-slate-600 text-[10px]">
                            Retirada: {formatDisplayDate(carRentalInfo.pickupDate, false)} {carRentalInfo.pickupTime ? `às ${carRentalInfo.pickupTime}` : ''}
                          </p>
                          <p className="text-slate-600 text-[10px]">
                            Devolução: {formatDisplayDate(carRentalInfo.dropoffDate, false)} {carRentalInfo.dropoffTime ? `às ${carRentalInfo.dropoffTime}` : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-500 italic text-[11px]">Nenhum carro alugado cadastrado.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Day-by-day Overview Section */}
                <div className="space-y-3.5">
                  {/* View Controls & Filter Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                      <Calendar className="w-4 h-4 text-[#D4AF37]" />
                      <span>Panorama da Viagem ({itineraryDays.length} Dias)</span>
                    </div>

                    {/* Search Input */}
                    <div className="relative max-w-sm w-full">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={overviewSearchQuery}
                        onChange={(e) => setOverviewSearchQuery(e.target.value)}
                        placeholder="Buscar por horário, parque, voo ou atividade..."
                        className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1A2B4C] text-slate-800"
                      />
                      {overviewSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setOverviewSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Days List */}
                  <div className="space-y-3.5">
                    {filteredDays.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs">
                        Nenhum dia encontrado para o termo <strong>"{overviewSearchQuery}"</strong>.
                      </div>
                    ) : (
                      filteredDays.map((day) => {
                        const isCompleted = isDayEffectivelyCompleted(day, settings.isFlexibleDates);
                        const hasPark = isDayWithPark(day);
                        const sortedSchedule = [...(day.hourlySchedule || [])].sort(compareScheduleItemOrder);
                        const itemsCount = sortedSchedule.length;

                        return (
                          <div
                            key={day.id}
                            className={`rounded-xl border transition-all overflow-hidden ${
                              day.id === activeDay.id
                                ? 'bg-amber-50/30 border-[#D4AF37] shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {/* Day Header Bar */}
                            <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="px-2.5 py-1 bg-[#1A2B4C] text-[#D4AF37] rounded-lg font-bold font-serif text-xs shrink-0 shadow-2xs">
                                  DIA {String(day.dayNumber).padStart(2, '0')}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-sm text-[#1A2B4C]">
                                      {day.title || 'Dia da Viagem'}
                                    </h4>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        hasPark
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {day.park || 'Sem Parque'}
                                    </span>
                                    {isCompleted ? (
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                        <Check className="w-2.5 h-2.5" /> Concluído
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">
                                        Planejado
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {formatDisplayDate(day.date, false)} •{' '}
                                    <strong className="text-slate-700">
                                      {itemsCount} {itemsCount === 1 ? 'atividade' : 'atividades'}
                                    </strong>{' '}
                                    na linha do tempo
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* HOURLY SCHEDULE TABLE (DETAILED TIMELINE) */}
                            <div className="p-4 border-b border-slate-100 space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-[#1A2B4C]">
                                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Cronograma & Tabela Hora a Hora</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                                </span>
                              </div>

                              {itemsCount > 0 ? (
                                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-slate-100/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                        <th className="py-2 px-3 w-20">Horário</th>
                                        <th className="py-2 px-3 w-36">Categoria</th>
                                        <th className="py-2 px-3">Atividade / Descrição</th>
                                        <th className="py-2 px-3">Local / Notas</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/60 bg-white">
                                      {sortedSchedule.map((item) => {
                                        const badge = getCategoryBadge(item.category, item);
                                        const Icon = badge.icon;
                                        const isDone = isScheduleItemEffectivelyCompleted(day, item, settings.isFlexibleDates);

                                        return (
                                          <tr
                                            key={item.id}
                                            className={`hover:bg-slate-50/80 transition-colors ${
                                              isDone ? 'bg-slate-50/40 opacity-80' : ''
                                            }`}
                                          >
                                            <td className="py-2.5 px-3 font-mono font-bold text-[#1A2B4C] whitespace-nowrap align-top">
                                              <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                <span>{item.time || '--:--'}</span>
                                              </div>
                                            </td>

                                            <td className="py-2.5 px-3 whitespace-nowrap align-top">
                                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${badge.bg}`}>
                                                <Icon className="w-3 h-3 shrink-0" />
                                                <span>{badge.label}</span>
                                              </span>
                                            </td>

                                            <td className="py-2.5 px-3 align-top">
                                              <div className="space-y-0.5">
                                                <span className={`font-bold text-xs ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                                  {item.title}
                                                </span>
                                                {item.notes && (
                                                  <p className="text-[11px] text-slate-500 italic">
                                                    {item.notes}
                                                  </p>
                                                )}
                                              </div>
                                            </td>

                                            <td className="py-2.5 px-3 text-slate-600 text-[11px] align-top">
                                              {item.location ? (
                                                <div className="flex items-center gap-1 text-slate-700">
                                                  <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                                  <span>{item.location}</span>
                                                </div>
                                              ) : (
                                                <span className="text-slate-400 text-[10px]">—</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                                  Nenhuma atividade hora a hora cadastrada para este dia.
                                </div>
                              )}
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    executePrintPdf('summary');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2c] text-[#1A2B4C] font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5 text-[#1A2B4C]" />
                  <span>Gerar PDF Deste Resumo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMasterOverviewModalOpen(false)}
                  className="px-6 py-2.5 rounded-2xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-sm transition-all cursor-pointer shadow-md active:scale-95"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#1A2B4C] mb-2 font-serif">Confirmar Exclusão</h3>
              <p className="text-sm text-slate-600 mb-6">
                Deseja realmente excluir o item <strong>"{confirmDelete.title}"</strong> do roteiro? Esta ação não poderá ser desfeita.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    handleDeleteScheduleItem(confirmDelete.dayId, confirmDelete.itemId);
                    setConfirmDelete(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all text-sm cursor-pointer shadow-md shadow-red-100"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AutoFill Confirmation Modal */}
      {confirmAutoFill && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#1A2B4C] mb-2 font-serif">Preenchimento Automático</h3>
              <p className="text-sm text-slate-600 mb-6">
                Deseja sincronizar e preencher automaticamente todos os dias com os parques principais e voos cadastrados? <strong>Isso substituirá as descrições atuais.</strong>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAutoFill(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    handleAutoFillAllDays();
                    setConfirmAutoFill(false);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all text-sm cursor-pointer shadow-md shadow-indigo-100"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINT-ONLY DEDICATED PDF EXPORT LAYOUT (VISÃO GERAL MASTER COMPLETA)       */}
      {/* ========================================================================= */}
      <div className="print-only print-full space-y-6 text-[#1A2B4C]">
        {/* Cover Header Banner */}
        <div className="p-6 rounded-2xl bg-[#1A2B4C] text-white border-2 border-[#D4AF37] shadow-sm relative overflow-hidden print-avoid-break">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-[#D4AF37]">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span>KINGDOM COMPASS • ROTEIRO OFICIAL MASTER</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
                {settings.tripName || 'Roteiro Mágico Orlando'}
              </h1>
              <p className="text-xs text-slate-200 font-medium">
                Destino: <strong className="text-white">{settings.destination || 'Orlando, Flórida, EUA'}</strong>
              </p>
              {settings.travelers && settings.travelers.length > 0 && (
                <p className="text-[11px] text-slate-300">
                  <strong>Viajantes:</strong> {settings.travelers.map((t) => t.name).join(', ')}
                </p>
              )}
            </div>

            <div className="text-right space-y-1 bg-white/10 p-3.5 rounded-xl border border-white/20 text-xs shrink-0 min-w-[180px]">
              <p className="text-[10px] font-bold uppercase text-[#D4AF37]">Período da Viagem</p>
              <p className="font-bold text-sm text-white">
                {settings.isFlexibleDates ? 'Data Não Definida' : formatDisplayDate(settings.startDate, false)}
              </p>
              <p className="text-[11px] text-slate-200 font-medium">
                {settings.durationDays} Dias • {settings.travelersCount} {settings.travelersCount === 1 ? 'Viajante' : 'Viajantes'}
              </p>
              <p className="text-[10px] text-slate-300">
                Dólar de Referência: R$ {(settings.dollarRate || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* MASTER LOGISTICS SUMMARY BOX (Voos, Hospedagens, Veículo) */}
        {pdfScope === 'all' && (
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3 print-avoid-break">
            <h3 className="text-xs font-bold font-serif uppercase tracking-wider text-[#1A2B4C] flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <Compass className="w-4 h-4 text-[#D4AF37]" />
              <span>Logística Master da Viagem</span>
            </h3>

            <div className="grid grid-cols-3 gap-3 text-xs">
              {/* Flights summary */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#1A2B4C] text-[11px]">
                  <Plane className="w-3.5 h-3.5 text-blue-600" />
                  <span>Passagens Aéreas</span>
                </div>
                {groupedFlightSegments && groupedFlightSegments.length > 0 ? (
                  <div className="space-y-1.5">
                    {groupedFlightSegments.map(({ flight, pnrs }, idx) => {
                      const info = getFlightDisplayInfo(flight, pnrs);
                      const isOutbound = flight.type === 'outbound';
                      const isInbound = flight.type === 'inbound';
                      const isConn = flight.type === 'connection';
                      const label = isOutbound ? 'Ida' : isInbound ? 'Volta' : isConn ? 'Conexão' : `Voo ${idx + 1}`;

                      return (
                        <div
                          key={flight.id || idx}
                          className={`text-[10px] text-slate-700 leading-tight ${idx > 0 ? 'pt-1 border-t border-slate-100' : ''}`}
                        >
                          <div>
                            <strong>{label}:</strong> {info.airlineAndFlight} ({info.origin} ➔ {info.destination})
                          </div>
                          <div className="text-slate-600">
                            Partida: <strong>{info.departureFormatted}</strong>
                            {info.arrivalFormatted ? ` | Chegada: <strong>${info.arrivalFormatted}</strong>` : ''}
                          </div>
                          {info.hasStopovers && (
                            <div className="text-[9px] text-amber-700 font-semibold">
                              ⚠️ Escala: {info.stopoversText}
                            </div>
                          )}
                          {info.pnrs.length > 0 && (
                            <div className="text-slate-600 font-mono text-[9px]">
                              PNR{info.pnrs.length > 1 ? 's' : ''}: <strong>{info.pnrs.join(' • ')}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">Nenhum voo cadastrado</div>
                )}
              </div>

              {/* Accommodations summary */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#1A2B4C] text-[11px]">
                  <Hotel className="w-3.5 h-3.5 text-amber-600" />
                  <span>Hospedagem Principal</span>
                </div>
                {accommodations && accommodations.length > 0 ? (
                  <div className="text-[10px] text-slate-700 leading-tight space-y-0.5">
                    <strong className="block text-[#1A2B4C] truncate">{accommodations[0].name}</strong>
                    {accommodations[0].address && (
                      <p className="text-slate-500 truncate">{accommodations[0].address}</p>
                    )}
                    <p className="text-slate-600">
                      Check-in: {accommodations[0].checkInTime || '15:00'} | Check-out: {accommodations[0].checkOutTime || '11:00'}
                    </p>
                    {accommodations[0].confirmationCode && (
                      <p className="font-mono text-slate-500">Reserva: {accommodations[0].confirmationCode}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">Hospedagem não cadastrada</div>
                )}
              </div>

              {/* Car rental summary */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#1A2B4C] text-[11px]">
                  <Car className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Transporte & Veículo</span>
                </div>
                {carRentalInfo ? (
                  <div className="text-[10px] text-slate-700 leading-tight space-y-0.5">
                    <strong className="block text-[#1A2B4C] truncate">{carRentalInfo.company || 'Locadora'} — {carRentalInfo.category || 'Veículo'}</strong>
                    <p className="text-slate-600">
                      Retirada: {carRentalInfo.pickupLocation || 'Aeroporto'} às {carRentalInfo.pickupTime || '10:00'}
                    </p>
                    <p className="text-slate-600">
                      Devolução: {carRentalInfo.dropoffLocation || 'Aeroporto'} às {carRentalInfo.dropoffTime || '16:00'}
                    </p>
                    {carRentalInfo.confirmationCode && (
                      <p className="font-mono text-slate-500">Confirmação: {carRentalInfo.confirmationCode}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">Locação de veículo não cadastrada</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PANORAMA CALENDAR TABLE (All Days Overview) */}
        {pdfScope === 'all' && (
          <div className="p-4 bg-white border border-slate-300 rounded-xl space-y-3 print-avoid-break">
            <h3 className="text-xs font-bold font-serif uppercase tracking-wider text-[#1A2B4C] flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <span>Visão Geral Master de Todos os Dias (Panorama Geral)</span>
            </h3>

            <div className="overflow-hidden border border-slate-200 rounded-lg">
              <table className="w-full text-left text-[10px] border-collapse">
                <thead>
                  <tr className="bg-[#1A2B4C] text-white">
                    <th className="p-2 font-bold w-12 text-center">Dia</th>
                    <th className="p-2 font-bold w-24">Data</th>
                    <th className="p-2 font-bold">Parque / Destaque</th>
                    <th className="p-2 font-bold">Manhã</th>
                    <th className="p-2 font-bold">Tarde</th>
                    <th className="p-2 font-bold">Noite</th>
                    <th className="p-2 font-bold w-16 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {itineraryDays.map((d, idx) => (
                    <tr key={`master-row-${d.id}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 text-center font-bold text-[#1A2B4C]">D{d.dayNumber}</td>
                      <td className="p-2 font-medium text-slate-700 whitespace-nowrap">
                        {settings.isFlexibleDates ? `Dia ${d.dayNumber}` : formatDisplayDate(d.date, false)}
                      </td>
                      <td className="p-2 font-bold text-[#1A2B4C]">
                        {d.park || d.title}
                      </td>
                      <td className="p-2 text-slate-700 truncate max-w-[140px]">{d.morning.where || '-'}</td>
                      <td className="p-2 text-slate-700 truncate max-w-[140px]">{d.afternoon.where || '-'}</td>
                      <td className="p-2 text-slate-700 truncate max-w-[140px]">{d.night.where || '-'}</td>
                      <td className="p-2 text-center font-semibold">
                        {d.completed ? (
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Feito</span>
                        ) : (
                          <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Planejado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* COMPLETE DAY BY DAY MASTER DETAILED SECTIONS */}
        <div className="space-y-6 pt-2">
          {daysToPrint.map((day) => {
            const schedule = getHourlySchedule(day);
            const hotelForDay = getAccommodationForDay(day.date, day.dayNumber);

            return (
              <div key={`print-day-${day.id}`} className="p-5 bg-white border-2 border-slate-300 rounded-xl space-y-4 print-avoid-break">
                {/* Day Header */}
                <div className="flex items-center justify-between border-b-2 border-[#1A2B4C]/20 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold font-serif text-sm bg-[#1A2B4C] text-[#D4AF37] px-3 py-1 rounded-md shadow-xs">
                      DIA {day.dayNumber}
                    </span>
                    <div>
                      <h3 className="font-bold text-base text-[#1A2B4C] font-serif">{day.title}</h3>
                      <p className="text-[11px] text-slate-600 font-semibold">
                        {!settings.isFlexibleDates && `${formatDisplayDate(day.date, true)} • `}
                        Parque / Destino: <strong className="text-[#1A2B4C]">{day.park}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-600 space-y-0.5">
                    {hotelForDay && (
                      <p><strong>Hospedagem:</strong> {hotelForDay.name}</p>
                    )}
                    {day.parkBooking?.parkHours && (
                      <p className="text-amber-800 font-bold">
                        Horário do Parque: {day.parkBooking.parkHours.openingTime} - {day.parkBooking.parkHours.closingTime}
                        {day.parkBooking.parkHours.earlyEntryTime && ` (Early: ${day.parkBooking.parkHours.earlyEntryTime})`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Chronological Hourly Schedule */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Cronograma Detalhado Passo a Passo (Hora a Hora)</span>
                  </h4>

                  {schedule.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic p-2 bg-slate-50 rounded border border-slate-200">
                      Nenhum horário específico agendado. Siga a programação dos períodos matutino, vespertino e noturno.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {schedule.map((item) => {
                        const badge = getCategoryBadge(item.category, item);
                        return (
                          <div key={item.id} className="p-2 bg-slate-50/70 border border-slate-200 rounded-lg flex flex-col justify-between">
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="font-mono font-bold text-[#1A2B4C] text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                {item.time}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 text-slate-700 bg-white">
                                {badge.label}
                              </span>
                            </div>
                            <div className="mt-1">
                              <p className="font-bold text-[#1A2B4C] text-[11px] leading-tight">{item.title}</p>
                              {item.location && (
                                <p className="text-[10px] text-slate-500 truncate">Local: {item.location}</p>
                              )}
                              {item.notes && (
                                <p className="text-[10px] text-slate-600 mt-0.5 italic">Obs: {item.notes}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Attachments / Vouchers if present */}
                {day.attachments && day.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-600">
                    <strong className="text-[#1A2B4C]">Documentos / Vouchers Anexados:</strong>
                    <span>{day.attachments.map((a) => a.name).join(' • ')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
