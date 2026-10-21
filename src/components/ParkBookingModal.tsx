import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Utensils,
  Zap,
  Ticket,
  Plus,
  Trash2,
  Edit3,
  Pencil,
  CheckCircle2,
  HelpCircle,
  X,
  AlertCircle,
  Layers,
  Users,
  Compass,
  Star,
  Info,
  ChevronDown,
  Building2,
  Hotel,
  Car,
  Camera,
  Check,
  Link2,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { TravelerSelector } from './TravelerSelector';
import { MoneyInput } from './MoneyInput';
import {
  ItineraryDay,
  ParkDayBooking,
  FastPassItem,
  DiningReservationItem,
  ShowReservationItem,
  PhotoPackageItem,
} from '../types';
import { PARKS_GUIDE_DATA } from '../data/initialData';
import { formatDisplayDate, usePlanner } from '../context/PlannerContext';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { fetchParkHours, ParkHoursResult } from '../services/parkHoursClient';
import {
  generateParkHourlySchedule,
  generateParkScheduleResult,
  getFallbackAccommodationLocation,
  cleanPreviousDayOverflowItems,
  clearParkReferencesFromDay,
  deduplicateHourlySchedule,
  isNonParkEvent,
  isDayWithPark,
  getDriveAndParkingMetrics,
} from '../utils/parkScheduleUtils';

interface ParkBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  day?: ItineraryDay;
  allDays?: ItineraryDay[];
  initialParkName?: string;
  initialTab?: 'general' | 'fastpass' | 'dining' | 'shows' | 'photos';
  onSave: (updatedDay: Partial<ItineraryDay>, targetDayId?: string) => Promise<{ success: boolean; error?: string }> | void;
  onRemovePark?: (targetDayId: string, cleanedDay?: Partial<ItineraryDay>) => Promise<{ success: boolean; error?: string }> | void;
}

export const isDayViable = (d: ItineraryDay, flights: any[]): boolean => {
  // 1. Check if there is an official flight segment on this date
  const hasFlightSegment = flights.some(
    (f) => f.departureDate === d.date || f.arrivalDate === d.date
  );
  if (hasFlightSegment) return false;

  // 2. Check if any hourly item contains flight-related terms or manual flight events
  const hasFlightInSchedule = d.hourlySchedule?.some(
    (item) =>
      item.category === 'flight' ||
      /\b(voo|flight|decolagem|embarque|aeroporto|pnr|locator|conexao|conexão)\b/i.test(item.title)
  );
  if (hasFlightInSchedule) return false;

  // 3. Check if morning, afternoon, or night descriptions refer to flights or departure/arrival
  const hasFlightInPeriods = [d.morning, d.afternoon, d.night].some(
    (period) =>
      period &&
      (/\b(voo|flight|decolagem|embarque|aeroporto|pnr|locator|conexao|conexão)\b/i.test(period.where) ||
       /\b(voo|flight|decolagem|embarque|aeroporto|pnr|locator|conexao|conexão)\b/i.test(period.notes))
  );
  if (hasFlightInPeriods) return false;

  // 4. Check if the day title indicates arrival/departure/flight
  const lowerTitle = (d.title || '').toLowerCase();
  if (
    lowerTitle.includes('chegada') ||
    lowerTitle.includes('partida') ||
    lowerTitle.includes('voo') ||
    lowerTitle.includes('retorno') ||
    lowerTitle.includes('mco') ||
    lowerTitle.includes('aeroporto')
  ) {
    return false;
  }

  return true;
};

// Helpers to extract saved hours from all possible data locations (parkBooking, notes, hourlySchedule)
const extractDayOpeningTime = (day: ItineraryDay | undefined | null): string | undefined => {
  if (!day) return undefined;
  if (day.parkBooking?.parkHours?.openingTime && day.parkBooking.parkHours.openingTime.trim()) {
    return day.parkBooking.parkHours.openingTime.trim();
  }
  if (day.morning?.notes) {
    const m = day.morning.notes.match(/Abertura às\s*(\d{1,2}:\d{2})/i);
    if (m) return m[1];
  }
  if (day.hourlySchedule && day.hourlySchedule.length > 0) {
    const item = day.hourlySchedule.find((i) => {
      const t = (i.title || '').toLowerCase();
      return t.includes('abertura') || t.includes('chegada ao parque');
    });
    if (item?.time) return item.time;
  }
  return undefined;
};

const extractDayClosingTime = (day: ItineraryDay | undefined | null): string | undefined => {
  if (!day) return undefined;
  if (day.parkBooking?.parkHours?.closingTime && day.parkBooking.parkHours.closingTime.trim()) {
    return day.parkBooking.parkHours.closingTime.trim();
  }
  if (day.night?.notes) {
    const m = day.night.notes.match(/Encerramento às\s*(\d{1,2}:\d{2})/i);
    if (m) return m[1];
  }
  if (day.hourlySchedule && day.hourlySchedule.length > 0) {
    const item = day.hourlySchedule.find((i) => {
      const t = (i.title || '').toLowerCase();
      return t.includes('encerramento') || t.includes('fechamento') || t.includes('saída do parque');
    });
    if (item?.time) return item.time;
  }
  return undefined;
};

const extractDayEarlyEntryTime = (day: ItineraryDay | undefined | null): string | undefined => {
  if (!day) return undefined;
  if (day.parkBooking?.parkHours?.earlyEntryTime && day.parkBooking.parkHours.earlyEntryTime.trim()) {
    return day.parkBooking.parkHours.earlyEntryTime.trim();
  }
  if (day.morning?.notes) {
    const m = day.morning.notes.match(/Early Entry:\s*(\d{1,2}:\d{2})/i);
    if (m) return m[1];
  }
  return undefined;
};

export const ParkBookingModal: React.FC<ParkBookingModalProps> = ({
  isOpen,
  onClose,
  day: propDay,
  allDays = [],
  initialParkName,
  initialTab = 'general',
  onSave,
  onRemovePark,
}) => {
  const {
    parkTickets = [],
    accommodations = [],
    updateItineraryDay,
    flights = [],
    settings,
    liveExchangeRate,
    expenses = [],
    addExpense,
    updateExpense,
    deleteExpense,
  } = usePlanner();

  // Determine the active day being edited
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const wasOpenRef = useRef<boolean>(false);
  const selectedDayIdRef = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Helper to determine if a day is viable for scheduling parks (verifying no flights or other bookings)
  const viableDays = React.useMemo(() => {
    return allDays.filter((d) => isDayViable(d, flights));
  }, [allDays, flights]);

  const activeDay = allDays.find((d) => d.id === selectedDayId) || propDay || allDays[0];

  // Active accommodation for this day
  const activeAccommodation = React.useMemo(() => {
    if (!activeDay || !activeDay.date) return undefined;
    return accommodations.find((a) => {
      if (a.checkInDate && a.checkOutDate) {
        return activeDay.date >= a.checkInDate && activeDay.date <= a.checkOutDate;
      }
      return false;
    });
  }, [accommodations, activeDay]);

  // Form State
  const [selectedParkName, setSelectedParkName] = useState<string>('');
  const [dayTitle, setDayTitle] = useState<string>('');
  const [parkPassStatus, setParkPassStatus] = useState<ParkDayBooking['parkPassStatus']>('Confirmado no App');
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  const [ticketType, setTicketType] = useState<string>('');
  const [openingTime, setOpeningTime] = useState<string>('09:00');
  const [closingTime, setClosingTime] = useState<string>('22:00');
  const [earlyEntryTime, setEarlyEntryTime] = useState<string>('08:30');
  const [hasEarlyEntry, setHasEarlyEntry] = useState<boolean>(true);
  const hasEarlyEntryRef = useRef<boolean>(true);
  const [ropeDropPlan, setRopeDropPlan] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Lists
  const [fastPasses, setFastPasses] = useState<FastPassItem[]>([]);
  const [diningList, setDiningList] = useState<DiningReservationItem[]>([]);
  const [showsList, setShowsList] = useState<ShowReservationItem[]>([]);

  // Sub-tab inside modal
  const [activeTab, setActiveTab] = useState<'general' | 'fastpass' | 'dining' | 'shows' | 'photos'>(initialTab || 'general');

  // FastPass Mini-Form
  const [editingFpId, setEditingFpId] = useState<string | null>(null);
  const [fpName, setFpName] = useState('');
  const [fpTime, setFpTime] = useState('10:00 - 11:00');
  const [fpType, setFpType] = useState<FastPassItem['type']>('Lightning Lane Multi Pass');
  const [fpTier, setFpTier] = useState<FastPassItem['tier']>('Tier 1');
  const [fpNotes, setFpNotes] = useState('');

  // Dining Mini-Form
  const [editingDinId, setEditingDinId] = useState<string | null>(null);
  const [dinRestaurant, setDinRestaurant] = useState('');
  const [dinMealType, setDinMealType] = useState<DiningReservationItem['mealType']>('Almoço (Lunch)');
  const [dinTime, setDinTime] = useState('12:30');
  const [dinCode, setDinCode] = useState('');
  const [dinPartySize, setDinPartySize] = useState(4);
  const [dinTableService, setDinTableService] = useState(true);
  const [dinNotes, setDinNotes] = useState('');

  // Shows Mini-Form
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [showName, setShowName] = useState('');
  const [showTime, setShowTime] = useState('21:00');
  const [showLocation, setShowLocation] = useState('');
  const [showNotes, setShowNotes] = useState('');

  // Photo Package State
  const [hasPhotoPackage, setHasPhotoPackage] = useState<boolean>(false);
  const [photoPkgId, setPhotoPkgId] = useState<string>('');
  const [photoPkgName, setPhotoPkgName] = useState<string>('');
  const [photoPkgType, setPhotoPkgType] = useState<PhotoPackageItem['type']>('trip_30days');
  const [photoPkgValidityDesc, setPhotoPkgValidityDesc] = useState<string>('');
  const [photoPkgComplex, setPhotoPkgComplex] = useState<PhotoPackageItem['complex']>('Disney');
  const [photoPkgIncludedParks, setPhotoPkgIncludedParks] = useState<string[]>([]);
  const [photoPkgCode, setPhotoPkgCode] = useState<string>('');
  const [photoPkgAccount, setPhotoPkgAccount] = useState<string>('');
  const [photoPkgCostUSD, setPhotoPkgCostUSD] = useState<number | null>(0);
  const [photoPkgCostBRL, setPhotoPkgCostBRL] = useState<number | null>(0);
  const [photoPkgStatus, setPhotoPkgStatus] = useState<PhotoPackageItem['status']>('Confirmado');
  const [photoPkgPaymentStatus, setPhotoPkgPaymentStatus] = useState<'Reservado / Confirmado' | 'Pago' | 'Pendente' | 'Falta Pagar'>('Reservado / Confirmado');
  const [photoPkgPayerId, setPhotoPkgPayerId] = useState<string>('all');
  const [photoPkgTravelerIds, setPhotoPkgTravelerIds] = useState<string[]>(['all']);
  const [photoPkgNotes, setPhotoPkgNotes] = useState<string>('');
  const [applyPhotoPkgToAllDays, setApplyPhotoPkgToAllDays] = useState<boolean>(true);

  // Exchange Rate of the day (AwesomeAPI Dólar Comercial ou fallback da viagem)
  const dollarRate = React.useMemo(() => {
    if (liveExchangeRate?.rate && liveExchangeRate.rate > 0) {
      return liveExchangeRate.rate;
    }
    return settings?.dollarRate || 5.75;
  }, [liveExchangeRate, settings?.dollarRate]);

  // Handle USD Change with auto-conversion to BRL
  const handlePhotoPkgCostUSDChange = (val: number | null) => {
    const usd = val || 0;
    setPhotoPkgCostUSD(usd);
    const brl = Math.round(usd * dollarRate * 100) / 100;
    setPhotoPkgCostBRL(brl);
  };

  // Handle BRL Change with auto-conversion to USD
  const handlePhotoPkgCostBRLChange = (val: number | null) => {
    const brl = val || 0;
    setPhotoPkgCostBRL(brl);
    const usd = dollarRate > 0 ? Math.round((brl / dollarRate) * 100) / 100 : 0;
    setPhotoPkgCostUSD(usd);
  };

  // Unlink Confirmation State
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Live Park Hours API State
  const [hoursLoading, setHoursLoading] = useState<boolean>(false);
  const [hoursStatus, setHoursStatus] = useState<{ isOfficial: boolean; message: string } | null>(null);

  const autoFetchHours = useCallback(async (parkName: string, dateStr: string, forceOverwrite = false) => {
    if (!parkName || !dateStr) return;
    setHoursLoading(true);
    try {
      const res = await fetchParkHours(parkName, dateStr);
      if (forceOverwrite) {
        setOpeningTime(res.openingTime);
        setClosingTime(res.closingTime);
        if (hasEarlyEntryRef.current) {
          setEarlyEntryTime(res.earlyEntryTime || '08:30');
        }
      }
      setHoursStatus({
        isOfficial: res.isOfficial,
        message: res.message,
      });
    } catch (err) {
      console.error('Erro ao buscar horários:', err);
    } finally {
      setHoursLoading(false);
    }
  }, []);

  // Helper to populate form data for a target day
  const populateFormForDay = useCallback(
    (dayToLoad: ItineraryDay | undefined | null, overrideParkName?: string) => {
      if (!dayToLoad) return;
      const existing = dayToLoad.parkBooking;
      const hasSpecificPark =
        dayToLoad.park &&
        dayToLoad.park !== 'Sem Parque' &&
        !dayToLoad.park.toLowerCase().includes('descanso') &&
        !dayToLoad.park.toLowerCase().includes('livre')
          ? dayToLoad.park
          : '';
      const defaultPark = overrideParkName || existing?.parkName || hasSpecificPark || '';

      const existingEarly = existing?.parkHours?.earlyEntryTime;
      // If booking already has parkHours, check if earlyEntry was enabled
      const isEarlyActive = existing?.parkHours
        ? Boolean(existingEarly && existingEarly.trim().length > 0)
        : true;
      setHasEarlyEntry(isEarlyActive);
      hasEarlyEntryRef.current = isEarlyActive;

      setSelectedParkName(defaultPark);
      setDayTitle(
        dayToLoad.title || (defaultPark ? `${defaultPark} - Dia ${dayToLoad.dayNumber}` : `Dia ${dayToLoad.dayNumber}`)
      );
      setParkPassStatus(existing?.parkPassStatus || 'Previsão (Planejamento)');
      
      const existingTicketType = existing?.ticketType || '';
      const existingCode = existing?.confirmationCode || '';

      // Match ticket either by existingTicketType or by finding a ticket in parkTickets that matches defaultPark
      let matchedTicket = parkTickets.find(
        (t) => t.id === existingTicketType || t.title === existingTicketType
      );

      if (!matchedTicket && defaultPark && parkTickets.length > 0) {
        matchedTicket = parkTickets.find((t) => {
          if (t.parksIncluded && t.parksIncluded.some((p) => p.toLowerCase().includes(defaultPark.toLowerCase()) || defaultPark.toLowerCase().includes(p.toLowerCase()))) {
            return true;
          }
          if (t.complex && defaultPark.toLowerCase().includes(t.complex.toLowerCase())) {
            return true;
          }
          return false;
        });
      }

      const activeTicketType = matchedTicket ? matchedTicket.id : existingTicketType;
      setTicketType(activeTicketType);

      // Automatically pull confirmation code from selected ticket if present
      const autoCode = matchedTicket?.confirmationCode || existingCode;
      setConfirmationCode(autoCode);
      
      const savedOpening = extractDayOpeningTime(dayToLoad);
      const savedClosing = extractDayClosingTime(dayToLoad);
      const savedEarly = extractDayEarlyEntryTime(dayToLoad);

      const hasSavedHours = Boolean(savedOpening || savedClosing);

      setOpeningTime(savedOpening || '09:00');
      setClosingTime(savedClosing || '21:00');
      setEarlyEntryTime(savedEarly || (isEarlyActive ? '08:30' : ''));
      setRopeDropPlan(existing?.ropeDropPlan || dayToLoad.morning?.notes || '');
      setNotes(existing?.notes || '');
      setFastPasses(existing?.fastPasses ? [...existing.fastPasses] : []);
      setDiningList(existing?.diningReservations ? [...existing.diningReservations] : []);
      setShowsList(existing?.showsAndParades ? [...existing.showsAndParades] : []);
      setEditingFpId(null);
      setFpName('');
      setFpNotes('');
      setEditingDinId(null);
      setDinRestaurant('');
      setDinCode('');
      setDinNotes('');
      setEditingShowId(null);
      setShowName('');
      setShowLocation('');
      setShowNotes('');
      setConfirmUnlink(false);

      // Photo package populate
      const existingPkg = existing?.photoPackage;
      const dayHasPkg = Boolean(existing?.hasPhotoPackage || existingPkg);
      setHasPhotoPackage(dayHasPkg);

      if (existingPkg) {
        setPhotoPkgId(existingPkg.id || `photo-${dayToLoad.id}`);
        setPhotoPkgName(existingPkg.name || '');
        setPhotoPkgType(existingPkg.type || 'trip_30days');
        setPhotoPkgValidityDesc(existingPkg.validityDescription || '');
        setPhotoPkgComplex(existingPkg.complex || 'Disney');
        setPhotoPkgIncludedParks(existingPkg.includedParks || []);
        setPhotoPkgCode(existingPkg.confirmationCode || '');
        setPhotoPkgAccount(existingPkg.accountEmailOrUser || '');
        let existUsd = existingPkg.costUSD !== undefined ? Number(existingPkg.costUSD) : 0;
        let existBrl = existingPkg.costBRL !== undefined ? Number(existingPkg.costBRL) : 0;
        if (!existBrl && existUsd && dollarRate > 0) {
          existBrl = Math.round(existUsd * dollarRate * 100) / 100;
        } else if (!existUsd && existBrl && dollarRate > 0) {
          existUsd = Math.round((existBrl / dollarRate) * 100) / 100;
        }
        setPhotoPkgCostUSD(existUsd);
        setPhotoPkgCostBRL(existBrl);
        setPhotoPkgStatus(existingPkg.status || 'Confirmado');
        setPhotoPkgPaymentStatus(existingPkg.paymentStatus || 'Reservado / Confirmado');
        setPhotoPkgPayerId(existingPkg.payerId || settings?.currentUserId || 'all');
        setPhotoPkgTravelerIds(existingPkg.travelerIds && existingPkg.travelerIds.length > 0 ? existingPkg.travelerIds : ['all']);
        setPhotoPkgNotes(existingPkg.notes || '');
      } else {
        // Look if another day has a 30-day package or package covering this park
        const detectedPkgDay = allDays.find(
          (d) => d.id !== dayToLoad.id && d.parkBooking?.photoPackage
        );
        const detectedPkg = detectedPkgDay?.parkBooking?.photoPackage;

        const isDisney = /magic|epcot|hollywood|animal|blizzard|typhoon|disney/i.test(defaultPark);
        const isUniversal = /universal|island|volcano|epic/i.test(defaultPark);
        const isSeaWorld = /seaworld|busch|aquatica|discovery/i.test(defaultPark);

        if (
          detectedPkg &&
          defaultPark &&
          detectedPkg.includedParks?.some(
            (p) =>
              p.toLowerCase().includes(defaultPark.toLowerCase()) ||
              defaultPark.toLowerCase().includes(p.toLowerCase())
          )
        ) {
          setPhotoPkgId(detectedPkg.id || `photo-${dayToLoad.id}`);
          setPhotoPkgName(detectedPkg.name);
          setPhotoPkgType(detectedPkg.type);
          setPhotoPkgValidityDesc(detectedPkg.validityDescription || '');
          setPhotoPkgComplex(detectedPkg.complex || 'Disney');
          setPhotoPkgIncludedParks(detectedPkg.includedParks || []);
          setPhotoPkgCode(detectedPkg.confirmationCode || '');
          setPhotoPkgAccount(detectedPkg.accountEmailOrUser || '');
          let detUsd = detectedPkg.costUSD !== undefined ? detectedPkg.costUSD : 0;
          let detBrl = detectedPkg.costBRL !== undefined ? detectedPkg.costBRL : 0;
          if (!detBrl && detUsd && dollarRate > 0) {
            detBrl = Math.round(detUsd * dollarRate * 100) / 100;
          } else if (!detUsd && detBrl && dollarRate > 0) {
            detUsd = Math.round((detBrl / dollarRate) * 100) / 100;
          }
          setPhotoPkgCostUSD(detUsd);
          setPhotoPkgCostBRL(detBrl);
          setPhotoPkgStatus(detectedPkg.status || 'Confirmado');
          setPhotoPkgPaymentStatus(detectedPkg.paymentStatus || 'Reservado / Confirmado');
          setPhotoPkgPayerId(detectedPkg.payerId || settings?.currentUserId || 'all');
          setPhotoPkgTravelerIds(detectedPkg.travelerIds && detectedPkg.travelerIds.length > 0 ? detectedPkg.travelerIds : ['all']);
          setPhotoPkgNotes(detectedPkg.notes || '');
        } else {
          setPhotoPkgId(`photo-${dayToLoad.id}`);
          if (isDisney) {
            setPhotoPkgName('Disney Memory Maker (30 Dias)');
            setPhotoPkgType('trip_30days');
            setPhotoPkgValidityDesc('Válido por 30 dias para todos os 4 parques temáticos e aquáticos Disney');
            setPhotoPkgComplex('Disney');
            setPhotoPkgIncludedParks([
              'Magic Kingdom',
              'EPCOT',
              "Disney's Hollywood Studios",
              "Disney's Animal Kingdom",
              "Disney's Typhoon Lagoon",
              "Disney's Blizzard Beach",
            ]);
            setPhotoPkgNotes(
              'Download ilimitado de todas as fotos e vídeos em alta resolução no app My Disney Experience por até 45 dias.'
            );
          } else if (isUniversal) {
            setPhotoPkgName('Universal My Universal Photos (3 Dias)');
            setPhotoPkgType('multi_day');
            setPhotoPkgValidityDesc('Válido por 3 dias em Universal Studios Florida e Islands of Adventure');
            setPhotoPkgComplex('Universal');
            setPhotoPkgIncludedParks([
              'Universal Studios Florida',
              "Universal's Islands of Adventure",
              "Universal's Volcano Bay",
            ]);
            setPhotoPkgNotes('Fotos ilimitadas em atrações e com personagens no app oficial da Universal.');
          } else if (isSeaWorld) {
            setPhotoPkgName('SeaWorld PhotoKey (All Season / Multi-Park)');
            setPhotoPkgType('multi_day');
            setPhotoPkgValidityDesc('Válido para SeaWorld, Busch Gardens e Aquatica');
            setPhotoPkgComplex('SeaWorld');
            setPhotoPkgIncludedParks(['SeaWorld Orlando', 'Busch Gardens Tampa Bay', 'Aquatica Orlando']);
            setPhotoPkgNotes('Válido nas montanhas-russas participantes e fotos na entrada do parque.');
          } else {
            setPhotoPkgName('Pacote de Fotos');
            setPhotoPkgType('daily');
            setPhotoPkgValidityDesc('Válido para o dia');
            setPhotoPkgComplex('Outro');
            setPhotoPkgIncludedParks(defaultPark ? [defaultPark] : []);
            setPhotoPkgNotes('');
          }
          setPhotoPkgCode('');
          setPhotoPkgAccount('');
          setPhotoPkgCostUSD(0);
          setPhotoPkgCostBRL(0);
          setPhotoPkgStatus('Confirmado');
          setPhotoPkgPaymentStatus('Reservado / Confirmado');
          setPhotoPkgPayerId(settings?.currentUserId || 'all');
          setPhotoPkgTravelerIds(['all']);
        }
      }

      // Auto fetch live park hours for official status indicator.
      // NEVER overwrite saved hours when loading a day that already has hours/park configured.
      if (defaultPark && dayToLoad.date) {
        // Only force overwrite if day has NO saved hours AND is a brand new unassigned park
        const isBrandNewDayPark = !hasSavedHours && !existing?.parkName && !hasSpecificPark;
        autoFetchHours(defaultPark, dayToLoad.date, isBrandNewDayPark);
      } else {
        setHoursStatus(null);
      }
    },
    [autoFetchHours, allDays]
  );

  // Sync state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        const targetDay = propDay || viableDays[0] || allDays[0] || null;
        const targetId = targetDay ? targetDay.id : '';
        setSelectedDayId(targetId);
        selectedDayIdRef.current = targetId;
        populateFormForDay(targetDay, initialParkName);
        if (initialTab === 'photos') {
          setHasPhotoPackage(true);
        }
        setActiveTab(initialTab || 'general');
      }
    } else {
      wasOpenRef.current = false;
      selectedDayIdRef.current = '';
    }
  }, [isOpen, propDay, initialParkName, initialTab, viableDays, allDays, populateFormForDay]);

  useEffect(() => {
    if (isOpen && initialTab) {
      if (initialTab === 'photos') {
        setHasPhotoPackage(true);
      }
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handler for explicit day changes in the dropdown
  const handleDaySelectChange = (newDayId: string) => {
    setSelectedDayId(newDayId);
    selectedDayIdRef.current = newDayId;
    const targetDay = allDays.find((d) => d.id === newDayId);
    if (targetDay) {
      populateFormForDay(targetDay);
    }
  };

  // Find matched ticket if ticketType corresponds to a purchased ticket
  const selectedTicket = parkTickets.find(
    (t) => t.id === ticketType || t.title === ticketType
  );

  // Filter PARKS_GUIDE_DATA based on selectedTicket
  const filteredParks = PARKS_GUIDE_DATA.filter((park) => {
    if (!selectedTicket) return true; // "Em Planejamento" or no specific ticket -> show all parks

    // 1. If ticket specifies parksIncluded
    if (selectedTicket.parksIncluded && selectedTicket.parksIncluded.length > 0) {
      const parkNameLower = park.name.toLowerCase();
      const isIncluded = selectedTicket.parksIncluded.some((pName) => {
        const pLower = pName.toLowerCase();
        return (
          parkNameLower.includes(pLower) ||
          pLower.includes(parkNameLower) ||
          (pLower.includes('magic') && parkNameLower.includes('magic')) ||
          (pLower.includes('epcot') && parkNameLower.includes('epcot')) ||
          (pLower.includes('hollywood') && parkNameLower.includes('hollywood')) ||
          (pLower.includes('animal') && parkNameLower.includes('animal')) ||
          (pLower.includes('universal studios') && parkNameLower.includes('universal studios')) ||
          (pLower.includes('islands') && parkNameLower.includes('islands')) ||
          (pLower.includes('volcano') && parkNameLower.includes('volcano')) ||
          (pLower.includes('epic') && parkNameLower.includes('epic')) ||
          (pLower.includes('seaworld') && parkNameLower.includes('seaworld')) ||
          (pLower.includes('aquatica') && parkNameLower.includes('aquatica')) ||
          (pLower.includes('busch') && parkNameLower.includes('busch')) ||
          (pLower.includes('discovery') && parkNameLower.includes('discovery')) ||
          (pLower.includes('legoland') && parkNameLower.includes('legoland')) ||
          (pLower.includes('kennedy') && parkNameLower.includes('kennedy'))
        );
      });
      if (isIncluded) return true;
    }

    // 2. Fallback to complex
    if (selectedTicket.complex) {
      const complexLower = selectedTicket.complex.toLowerCase();
      const resortLower = park.resort.toLowerCase();
      const parkLower = park.name.toLowerCase();

      if (complexLower.includes('disney')) {
        return resortLower.includes('disney') || parkLower.includes('disney');
      }
      if (complexLower.includes('universal')) {
        return resortLower.includes('universal') || parkLower.includes('universal');
      }
      if (complexLower.includes('seaworld') || complexLower.includes('discovery')) {
        return (
          resortLower.includes('seaworld') ||
          parkLower.includes('seaworld') ||
          parkLower.includes('discovery') ||
          parkLower.includes('busch') ||
          parkLower.includes('aquatica')
        );
      }
      if (complexLower.includes('legoland')) {
        return resortLower.includes('legoland') || parkLower.includes('legoland');
      }
      if (complexLower.includes('kennedy')) {
        return parkLower.includes('kennedy') || resortLower.includes('outro');
      }
    }

    return true;
  });

  const handleTicketTypeChange = (val: string) => {
    setTicketType(val);
    const matched = parkTickets.find((t) => t.id === val || t.title === val);
    if (matched) {
      if (matched.confirmationCode) {
        setConfirmationCode(matched.confirmationCode);
      }
    }
  };

  // Selected park guide info
  const selectedParkGuide = PARKS_GUIDE_DATA.find((p) => p.name.toLowerCase() === selectedParkName.toLowerCase()) || PARKS_GUIDE_DATA.find((p) => selectedParkName.toLowerCase().includes(p.name.toLowerCase()));

  // Helper for adjusting and formatting time inputs effortlessly
  const formatTimeInput = (val: string, defaultTime = '09:00'): string => {
    if (!val || !val.trim()) return defaultTime;
    const clean = val.trim().replace(/[^\d:]/g, '');
    if (clean.includes(':')) {
      const parts = clean.split(':');
      const numH = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
      const numM = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
      return `${String(numH).padStart(2, '0')}:${String(numM).padStart(2, '0')}`;
    }
    if (clean.length === 1 || clean.length === 2) {
      const numH = Math.min(23, Math.max(0, parseInt(clean, 10) || 0));
      return `${String(numH).padStart(2, '0')}:00`;
    }
    if (clean.length === 3) {
      const numH = Math.min(23, Math.max(0, parseInt(clean.slice(0, 1), 10) || 0));
      const numM = Math.min(59, Math.max(0, parseInt(clean.slice(1), 10) || 0));
      return `${String(numH).padStart(2, '0')}:${String(numM).padStart(2, '0')}`;
    }
    if (clean.length >= 4) {
      const numH = Math.min(23, Math.max(0, parseInt(clean.slice(0, 2), 10) || 0));
      const numM = Math.min(59, Math.max(0, parseInt(clean.slice(2, 4), 10) || 0));
      return `${String(numH).padStart(2, '0')}:${String(numM).padStart(2, '0')}`;
    }
    return defaultTime;
  };

  const adjustTimeMinutes = (currentTime: string, deltaMinutes: number, defaultTime = '09:00'): string => {
    const timeToUse = currentTime && currentTime.trim() ? currentTime.trim() : defaultTime;
    const [h, m] = timeToUse.split(':').map((v) => parseInt(v, 10));
    const total = ((isNaN(h) ? 9 : h) * 60 + (isNaN(m) ? 0 : m) + deltaMinutes + 1440) % 1440;
    const newH = Math.floor(total / 60);
    const newM = total % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  };

  const handleStartEditFastPass = (item: FastPassItem) => {
    setEditingFpId(item.id);
    setFpName(item.attractionName || '');
    setFpTime(item.timeWindow || '10:00 - 11:00');
    setFpType(item.type || 'Lightning Lane Multi Pass');
    setFpTier(item.tier || 'Tier 1');
    setFpNotes(item.notes || '');
  };

  const handleCancelEditFastPass = () => {
    setEditingFpId(null);
    setFpName('');
    setFpTime('10:00 - 11:00');
    setFpNotes('');
  };

  const handleAddFastPass = () => {
    if (!fpName.trim()) return;
    if (editingFpId) {
      setFastPasses(
        fastPasses.map((f) =>
          f.id === editingFpId
            ? {
                ...f,
                attractionName: fpName.trim(),
                timeWindow: fpTime.trim(),
                type: fpType,
                tier: fpTier,
                notes: fpNotes.trim() || undefined,
              }
            : f
        )
      );
      setEditingFpId(null);
    } else {
      const newItem: FastPassItem = {
        id: `fp-${Date.now()}`,
        attractionName: fpName.trim(),
        timeWindow: fpTime.trim(),
        type: fpType,
        tier: fpTier,
        status: 'Agendado',
        notes: fpNotes.trim() || undefined,
      };
      setFastPasses([...fastPasses, newItem]);
    }
    setFpName('');
    setFpTime('10:00 - 11:00');
    setFpNotes('');
  };

  const handleRemoveFastPass = (id: string) => {
    if (editingFpId === id) {
      handleCancelEditFastPass();
    }
    setFastPasses(fastPasses.filter((f) => f.id !== id));
  };

  const handleStartEditDining = (item: DiningReservationItem) => {
    setEditingDinId(item.id);
    setDinRestaurant(item.restaurantName || '');
    setDinMealType(item.mealType || 'Almoço (Lunch)');
    setDinTime(item.time || '12:30');
    setDinCode(item.confirmationCode || '');
    setDinPartySize(item.partySize || 4);
    setDinTableService(item.tableService !== false);
    setDinNotes(item.notes || '');
  };

  const handleCancelEditDining = () => {
    setEditingDinId(null);
    setDinRestaurant('');
    setDinCode('');
    setDinNotes('');
    setDinTime('12:30');
  };

  const handleAddDining = () => {
    if (!dinRestaurant.trim()) return;
    if (editingDinId) {
      setDiningList(
        diningList.map((d) =>
          d.id === editingDinId
            ? {
                ...d,
                restaurantName: dinRestaurant.trim(),
                mealType: dinMealType,
                time: dinTime.trim(),
                confirmationCode: dinCode.trim() || undefined,
                partySize: dinPartySize,
                tableService: dinTableService,
                notes: dinNotes.trim() || undefined,
              }
            : d
        )
      );
      setEditingDinId(null);
    } else {
      const newItem: DiningReservationItem = {
        id: `din-${Date.now()}`,
        restaurantName: dinRestaurant.trim(),
        mealType: dinMealType,
        time: dinTime.trim(),
        confirmationCode: dinCode.trim() || undefined,
        partySize: dinPartySize,
        tableService: dinTableService,
        status: 'Confirmada',
        notes: dinNotes.trim() || undefined,
      };
      setDiningList([...diningList, newItem]);
    }
    setDinRestaurant('');
    setDinCode('');
    setDinNotes('');
    setDinTime('12:30');
  };

  const handleRemoveDining = (id: string) => {
    if (editingDinId === id) {
      handleCancelEditDining();
    }
    setDiningList(diningList.filter((d) => d.id !== id));
  };

  const handleStartEditShow = (item: ShowReservationItem) => {
    setEditingShowId(item.id);
    setShowName(item.showName || '');
    setShowTime(item.time || '21:00');
    setShowLocation(item.location || '');
    setShowNotes(item.notes || '');
  };

  const handleCancelEditShow = () => {
    setEditingShowId(null);
    setShowName('');
    setShowLocation('');
    setShowNotes('');
    setShowTime('21:00');
  };

  const handleAddShow = () => {
    if (!showName.trim()) return;
    if (editingShowId) {
      setShowsList(
        showsList.map((s) =>
          s.id === editingShowId
            ? {
                ...s,
                showName: showName.trim(),
                time: showTime.trim(),
                location: showLocation.trim() || undefined,
                notes: showNotes.trim() || undefined,
              }
            : s
        )
      );
      setEditingShowId(null);
    } else {
      const newItem: ShowReservationItem = {
        id: `sh-${Date.now()}`,
        showName: showName.trim(),
        time: showTime.trim(),
        location: showLocation.trim() || undefined,
        status: 'Agendado',
        notes: showNotes.trim() || undefined,
      };
      setShowsList([...showsList, newItem]);
    }
    setShowName('');
    setShowLocation('');
    setShowNotes('');
    setShowTime('21:00');
  };

  const handleRemoveShow = (id: string) => {
    if (editingShowId === id) {
      handleCancelEditShow();
    }
    setShowsList(showsList.filter((s) => s.id !== id));
  };

  // Detected package from another day
  const detectedOtherDayPkg = React.useMemo(() => {
    const foundDay = allDays.find(
      (d) => d.id !== activeDay?.id && d.parkBooking?.hasPhotoPackage && d.parkBooking.photoPackage
    );
    return foundDay ? { ...foundDay.parkBooking!.photoPackage!, dayNumber: foundDay.dayNumber } : null;
  }, [allDays, activeDay]);

  const handleApplyPhotoPreset = (
    preset: 'disney_30days' | 'disney_1day' | 'universal_3days' | 'universal_1day' | 'seaworld_season' | 'seaworld_1day'
  ) => {
    if (preset === 'disney_30days') {
      setPhotoPkgName('Disney Memory Maker (30 Dias)');
      setPhotoPkgType('trip_30days');
      setPhotoPkgComplex('Disney');
      setPhotoPkgIncludedParks([
        'Magic Kingdom',
        'EPCOT',
        "Disney's Hollywood Studios",
        "Disney's Animal Kingdom",
        "Disney's Typhoon Lagoon",
        "Disney's Blizzard Beach",
      ]);
      setPhotoPkgValidityDesc('Válido por 30 dias em todos os parques Disney a partir do download da 1ª foto');
      const usdVal = 185;
      setPhotoPkgCostUSD(usdVal);
      setPhotoPkgCostBRL(Math.round(usdVal * dollarRate * 100) / 100);
      setPhotoPkgNotes(
        'Download digital ilimitado de todas as fotos e vídeos de atrações e fotógrafos PhotoPass no My Disney Experience. As fotos expiram em 45 dias.'
      );
    } else if (preset === 'disney_1day') {
      setPhotoPkgName('Disney Memory Maker One Day');
      setPhotoPkgType('daily');
      setPhotoPkgComplex('Disney');
      setPhotoPkgIncludedParks([selectedParkName || 'Magic Kingdom']);
      setPhotoPkgValidityDesc('Válido para todas as fotos tiradas em 1 único dia escolhido');
      const usdVal = 75;
      setPhotoPkgCostUSD(usdVal);
      setPhotoPkgCostBRL(Math.round(usdVal * dollarRate * 100) / 100);
      setPhotoPkgNotes('Válido para fotos tiradas exclusivamente neste dia em qualquer parque Disney visitado.');
    } else if (preset === 'universal_3days') {
      setPhotoPkgName('Universal My Universal Photos (3 Dias)');
      setPhotoPkgType('multi_day');
      setPhotoPkgComplex('Universal');
      setPhotoPkgIncludedParks([
        'Universal Studios Florida',
        "Universal's Islands of Adventure",
        "Universal's Volcano Bay",
      ]);
      setPhotoPkgValidityDesc('Válido por 3 dias consecutivos nos parques Universal');
      const usdVal = 129.99;
      setPhotoPkgCostUSD(usdVal);
      setPhotoPkgCostBRL(Math.round(usdVal * dollarRate * 100) / 100);
      setPhotoPkgNotes('Fotos ilimitadas em atrações e com personagens nos 3 parques da Universal.');
    } else if (preset === 'universal_1day') {
      setPhotoPkgName('Universal My Universal Photos (1 Dia)');
      setPhotoPkgType('daily');
      setPhotoPkgComplex('Universal');
      setPhotoPkgIncludedParks([selectedParkName || 'Universal Studios Florida']);
      setPhotoPkgValidityDesc('Válido por 1 dia inteiro nos parques da Universal');
      const usdVal = 89.99;
      setPhotoPkgCostUSD(usdVal);
      setPhotoPkgCostBRL(Math.round(usdVal * dollarRate * 100) / 100);
      setPhotoPkgNotes('Fotos ilimitadas nas atrações participantes durante o dia.');
    } else if (preset === 'seaworld_season') {
      setPhotoPkgName('SeaWorld PhotoKey (All Season / Multi-Park)');
      setPhotoPkgType('multi_day');
      setPhotoPkgComplex('SeaWorld');
      setPhotoPkgIncludedParks(['SeaWorld Orlando', 'Busch Gardens Tampa Bay', 'Aquatica Orlando']);
      setPhotoPkgValidityDesc('Válido para toda a temporada nos parques do grupo SeaWorld');
      const usdVal = 99.99;
      setPhotoPkgCostUSD(usdVal);
      setPhotoPkgCostBRL(Math.round(usdVal * dollarRate * 100) / 100);
      setPhotoPkgNotes('Fotos ilimitadas em montanhas-russas participantes e fotos de boas-vindas.');
    } else if (preset === 'seaworld_1day') {
      setPhotoPkgName('SeaWorld PhotoKey (1 Dia)');
      setPhotoPkgType('daily');
      setPhotoPkgComplex('SeaWorld');
      setPhotoPkgIncludedParks([selectedParkName || 'SeaWorld Orlando']);
      setPhotoPkgValidityDesc('Válido por 1 dia no parque');
      const usdVal = 49.99;
      setPhotoPkgCostUSD(usdVal);
      setPhotoPkgCostBRL(Math.round(usdVal * dollarRate * 100) / 100);
      setPhotoPkgNotes('Fotos ilimitadas nas atrações participantes do parque neste dia.');
    }
  };

  const handleApplyDetectedPackage = (pkg: PhotoPackageItem & { dayNumber: number }) => {
    setPhotoPkgName(pkg.name);
    setPhotoPkgType(pkg.type);
    setPhotoPkgComplex(pkg.complex || 'Disney');
    setPhotoPkgIncludedParks(pkg.includedParks || []);
    setPhotoPkgValidityDesc(pkg.validityDescription || '');
    setPhotoPkgCode(pkg.confirmationCode || '');
    setPhotoPkgAccount(pkg.accountEmailOrUser || '');
    let usd = pkg.costUSD !== undefined ? Number(pkg.costUSD) : 0;
    let brl = pkg.costBRL !== undefined ? Number(pkg.costBRL) : 0;
    if (!brl && usd && dollarRate > 0) {
      brl = Math.round(usd * dollarRate * 100) / 100;
    } else if (!usd && brl && dollarRate > 0) {
      usd = Math.round((brl / dollarRate) * 100) / 100;
    }
    setPhotoPkgCostUSD(usd);
    setPhotoPkgCostBRL(brl);
    setPhotoPkgStatus(pkg.status || 'Confirmado');
    setPhotoPkgPaymentStatus(pkg.paymentStatus || 'Reservado / Confirmado');
    setPhotoPkgPayerId(pkg.payerId || settings?.currentUserId || 'all');
    setPhotoPkgTravelerIds(pkg.travelerIds && pkg.travelerIds.length > 0 ? pkg.travelerIds : ['all']);
    setPhotoPkgNotes(pkg.notes || '');
  };

  const toggleParkIncludedInPhotoPkg = (parkName: string) => {
    if (photoPkgIncludedParks.includes(parkName)) {
      setPhotoPkgIncludedParks(photoPkgIncludedParks.filter((p) => p !== parkName));
    } else {
      setPhotoPkgIncludedParks([...photoPkgIncludedParks, parkName]);
    }
  };

  const handleSaveAll = async () => {
    if (isSavingRef.current || !activeDay) return;
    
    isSavingRef.current = true;
    setIsSaving(true);
    
    try {

    // Locate active accommodation for the day
    const activeAccommodation = accommodations.find((a) => {
      if (activeDay.date && a.checkInDate && a.checkOutDate) {
        return activeDay.date >= a.checkInDate && activeDay.date <= a.checkOutDate;
      }
      return false;
    });

    const hasAcc = Boolean(
      activeAccommodation &&
      (activeAccommodation.name || activeAccommodation.hotelName) &&
      (activeAccommodation.name || activeAccommodation.hotelName || '').trim() &&
      (activeAccommodation.name || activeAccommodation.hotelName || '').trim().toLowerCase() !== 'hospedagem' &&
      (activeAccommodation.name || activeAccommodation.hotelName || '').trim().toLowerCase() !== 'nenhuma cadastrada'
    );

    const accommodationName = hasAcc ? (activeAccommodation!.name || activeAccommodation!.hotelName || '').trim() : '';

    if (!selectedParkName || selectedParkName === 'Sem Parque' || isNonParkEvent(selectedParkName)) {
      const dayUpdates: Partial<ItineraryDay> = {
        park: selectedParkName || 'Sem Parque',
        title: dayTitle.trim() || `${selectedParkName || 'Sem Parque'} - Dia ${activeDay.dayNumber}`,
        parkBooking: undefined,
      };

      let saveRes: any;
      if (onSave) {
        saveRes = await onSave(dayUpdates, activeDay.id);
      } else {
        saveRes = await updateItineraryDay(activeDay.id, dayUpdates);
      }

      if (saveRes && typeof saveRes === 'object' && saveRes.success === false) {
        alert(`❌ Erro ao salvar dados no banco: ${saveRes.error || 'Falha de conexão'}. Mantendo dados para nova tentativa.`);
        return;
      }
      onClose();
      return;
    }

    const effectiveEarlyEntry = hasEarlyEntry && earlyEntryTime.trim() ? earlyEntryTime.trim() : undefined;

    const finalPhotoPackage: PhotoPackageItem | undefined = hasPhotoPackage
      ? {
          id: photoPkgId || `photo-${activeDay.id}`,
          name: photoPkgName.trim() || 'Pacote de Fotos',
          type: photoPkgType,
          validityDescription: photoPkgValidityDesc.trim() || undefined,
          complex: photoPkgComplex,
          includedParks: photoPkgIncludedParks,
          confirmationCode: photoPkgCode.trim() || undefined,
          accountEmailOrUser: photoPkgAccount.trim() || undefined,
          costUSD: photoPkgCostUSD !== null && photoPkgCostUSD !== undefined ? photoPkgCostUSD : undefined,
          costBRL: photoPkgCostBRL !== null && photoPkgCostBRL !== undefined ? photoPkgCostBRL : undefined,
          status: photoPkgStatus,
          paymentStatus: photoPkgPaymentStatus,
          payerId: photoPkgPayerId || 'all',
          travelerIds: photoPkgTravelerIds && photoPkgTravelerIds.length > 0 ? photoPkgTravelerIds : ['all'],
          notes: photoPkgNotes.trim() || undefined,
        }
      : undefined;

    // Sincroniza o pacote de fotos com o módulo Financeiro / Divisão de Despesas
    const parsedUsd = photoPkgCostUSD || 0;
    const parsedBrl = photoPkgCostBRL || (parsedUsd * dollarRate);

    if (hasPhotoPackage && finalPhotoPackage) {
      const isPaid = photoPkgPaymentStatus === 'Pago' || photoPkgPaymentStatus === 'Reservado / Confirmado';
      const expenseTitle = `Pacote de Fotos: ${finalPhotoPackage.name}`;
      const packageId = finalPhotoPackage.id || `photo-${activeDay.id}`;

      const existingExpense = expenses.find(
        (e) => (e.sourceType === 'photo_package' && (e.sourceId === packageId || e.id === `exp-${packageId}`)) ||
               (e.sourceType === 'photo_package' && e.title.toLowerCase().includes(finalPhotoPackage.name.toLowerCase()))
      );

      if (existingExpense) {
        updateExpense(existingExpense.id, {
          title: expenseTitle,
          category: 'Pacotes de Fotos',
          estimatedValueUSD: parsedUsd,
          estimatedValueBRL: parsedBrl,
          paidValueUSD: isPaid ? parsedUsd : 0,
          paidValueBRL: isPaid ? parsedBrl : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: photoPkgPayerId || 'all',
          responsibleTravelerId: photoPkgPayerId || 'all',
          travelerIds: photoPkgTravelerIds && photoPkgTravelerIds.length > 0 ? photoPkgTravelerIds : ['all'],
          sourceType: 'photo_package',
          sourceId: packageId,
          notes: finalPhotoPackage.confirmationCode ? `Voucher / Confirmação: #${finalPhotoPackage.confirmationCode}` : undefined,
        });
      } else {
        addExpense({
          title: expenseTitle,
          category: 'Pacotes de Fotos',
          estimatedValueUSD: parsedUsd,
          estimatedValueBRL: parsedBrl,
          paidValueUSD: isPaid ? parsedUsd : 0,
          paidValueBRL: isPaid ? parsedBrl : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: photoPkgPayerId || 'all',
          responsibleTravelerId: photoPkgPayerId || 'all',
          travelerIds: photoPkgTravelerIds && photoPkgTravelerIds.length > 0 ? photoPkgTravelerIds : ['all'],
          sourceType: 'photo_package',
          sourceId: packageId,
          excluded: false,
          notes: finalPhotoPackage.confirmationCode ? `Voucher / Confirmação: #${finalPhotoPackage.confirmationCode}` : undefined,
        });
      }
    } else if (!hasPhotoPackage) {
      // 1. Remove expense from financial module
      const packageId = photoPkgId || `photo-${activeDay.id}`;
      const existingExpense = expenses.find(
        (e) => e.sourceType === 'photo_package' && (e.sourceId === packageId || e.id === `exp-${packageId}`)
      );
      if (existingExpense) {
        deleteExpense(existingExpense.id);
      }
      // Also search by name if any other photo expense matches
      expenses.forEach((e) => {
        if (e.sourceType === 'photo_package' && photoPkgName && e.title.toLowerCase().includes(photoPkgName.toLowerCase())) {
          deleteExpense(e.id);
        }
      });

      // 2. Remove photo package from ALL other days in the itinerary as well
      allDays.forEach((d) => {
        if (d.parkBooking && d.parkBooking.photoPackage) {
          const pkg = d.parkBooking.photoPackage;
          if (
            (pkg.id === packageId) ||
            (photoPkgName && pkg.name.toLowerCase() === photoPkgName.toLowerCase()) ||
            (d.id !== activeDay.id)
          ) {
            updateItineraryDay(d.id, {
              parkBooking: {
                ...d.parkBooking,
                hasPhotoPackage: false,
                photoPackage: undefined,
              },
            });
          }
        }
      });
    }

    const updatedBooking: ParkDayBooking = {
      id: activeDay.parkBooking?.id || `pb-${activeDay.id}`,
      dayNumber: activeDay.dayNumber,
      date: activeDay.date,
      parkName: selectedParkName,
      parkId: selectedParkGuide?.id,
      parkHours: {
        openingTime,
        closingTime,
        earlyEntryTime: effectiveEarlyEntry,
      },
      parkPassStatus,
      confirmationCode: confirmationCode.trim() || selectedTicket?.confirmationCode || undefined,
      ticketType: ticketType.trim() || undefined,
      ropeDropPlan: ropeDropPlan.trim() || undefined,
      fastPasses,
      diningReservations: diningList,
      showsAndParades: showsList,
      hasPhotoPackage,
      photoPackage: finalPhotoPackage,
      notes: notes.trim() || undefined,
    };

    // Propagate multi-park / 30-day package to other days if checked
    if (applyPhotoPkgToAllDays && hasPhotoPackage && finalPhotoPackage && finalPhotoPackage.includedParks.length > 0) {
      allDays.forEach((d) => {
        if (d.id !== activeDay.id && d.park && d.park !== 'Sem Parque' && !isNonParkEvent(d.park)) {
          const isParkCovered = finalPhotoPackage.includedParks.some(
            (p) => p.toLowerCase().includes(d.park.toLowerCase()) || d.park.toLowerCase().includes(p.toLowerCase())
          );
          if (isParkCovered) {
            const currentPb = d.parkBooking || {
              id: `pb-${d.id}`,
              dayNumber: d.dayNumber,
              date: d.date,
              parkName: d.park,
              parkPassStatus: 'Confirmado no App',
              fastPasses: [],
              diningReservations: [],
              showsAndParades: [],
            };
            updateItineraryDay(d.id, {
              parkBooking: {
                ...currentPb,
                hasPhotoPackage: true,
                photoPackage: {
                  ...finalPhotoPackage,
                  id: `photo-${d.id}`,
                },
              },
            });
          }
        }
      });
    }

    const fallbackAccLocation = getFallbackAccommodationLocation(
      selectedParkName,
      activeDay,
      allDays,
      activeDay?.dayNumber ? activeDay.dayNumber - 1 : undefined,
      settings?.destination
    );

    // Auto-generate day-by-day itinerary schedule items (departure, transport, opening, closing, return, FastPass, Lunch/Dining, Shows)
    const scheduleResult = generateParkScheduleResult(
      selectedParkName,
      openingTime,
      closingTime,
      effectiveEarlyEntry,
      accommodationName,
      activeDay.hourlySchedule || [],
      updatedBooking.id,
      activeDay.dayNumber,
      activeAccommodation?.address || (hasAcc ? accommodationName : undefined),
      activeDay,
      allDays,
      settings?.destination,
      updatedBooking
    );

    const newHourlySchedule = scheduleResult.currentDaySchedule;

    // Detect meals from dining list to automatically enrich morning/afternoon/night dining fields if empty
    const breakfast = diningList.find(
      (d) => d.mealType?.includes('Café') || (d.time && d.time < '11:30')
    );
    const lunch = diningList.find(
      (d) => d.mealType?.includes('Almoço') || (d.time && d.time >= '11:30' && d.time < '16:30')
    );
    const dinner = diningList.find(
      (d) => d.mealType?.includes('Jantar') || (d.time && d.time >= '16:30')
    );
    const nightShow = showsList.find((s) => s.time && s.time >= '18:00');

    const morningDining = activeDay.morning?.dining || (breakfast ? `${breakfast.restaurantName} (${breakfast.time})` : '');
    const afternoonDining = activeDay.afternoon?.dining || (lunch ? `${lunch.restaurantName} (${lunch.time})` : '');
    const nightDining = activeDay.night?.dining || (dinner ? `${dinner.restaurantName} (${dinner.time})` : '');

    let nightNotes = hasAcc
      ? `Encerramento às ${closingTime} e retorno para ${accommodationName}.`
      : `Encerramento às ${closingTime} e retorno para ${fallbackAccLocation}.`;
    if (nightShow) {
      nightNotes = `🎆 Show: ${nightShow.showName} (${nightShow.time}) • ${nightNotes}`;
    }

    const dayUpdates: Partial<ItineraryDay> = {
      park: selectedParkName,
      title: dayTitle.trim() || `${selectedParkName} - Dia ${activeDay.dayNumber}`,
      parkBooking: updatedBooking,
      hourlySchedule: newHourlySchedule,
      morning: {
        where: selectedParkName,
        dining: morningDining,
        notes: `Abertura às ${openingTime}${effectiveEarlyEntry ? ` (Early Entry: ${effectiveEarlyEntry})` : ''}`,
      },
      afternoon: {
        where: selectedParkName,
        dining: afternoonDining,
        notes: activeDay.afternoon?.notes || `Aproveitando atrações em ${selectedParkName}`,
      },
      night: {
        where: hasAcc ? `${selectedParkName} / ${accommodationName}` : `${selectedParkName} / ${fallbackAccLocation}`,
        dining: nightDining,
        notes: nightNotes,
      },
    };

    let saveRes: any;
    if (onSave) {
      saveRes = await onSave(dayUpdates, activeDay.id);
    } else {
      saveRes = await updateItineraryDay(activeDay.id, dayUpdates);
    }

    if (saveRes && typeof saveRes === 'object' && saveRes.success === false) {
      alert(`❌ Erro ao salvar dados do parque no banco: ${saveRes.error || 'Falha de conexão'}. Mantendo dados para nova tentativa.`);
      return;
    }

    // Allocate any past-midnight closing / return items to next day schedule
    const nextDay = (allDays || []).find((d) => d.dayNumber === activeDay.dayNumber + 1);
    if (nextDay) {
      const cleanedNextSchedule = cleanPreviousDayOverflowItems(nextDay.hourlySchedule || [], activeDay.dayNumber);
      const combinedNextSchedule = deduplicateHourlySchedule([...cleanedNextSchedule, ...scheduleResult.nextDayOverflowItems]);
      await updateItineraryDay(nextDay.id, {
        hourlySchedule: combinedNextSchedule,
      });
    }

      onClose();
    } catch (error) {
      console.error('Error saving park booking:', error);
      alert('Ocorreu um erro ao salvar o agendamento. Por favor, tente novamente.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleUnlinkPark = async () => {
    if (!activeDay) return;
    const cleanedDay = clearParkReferencesFromDay(activeDay, allDays?.length || 1, activeAccommodation?.name);
    let saveRes: any;
    if (onRemovePark) {
      saveRes = await onRemovePark(activeDay.id, cleanedDay);
    } else if (onSave) {
      saveRes = await onSave(cleanedDay, activeDay.id);
    } else {
      saveRes = await updateItineraryDay(activeDay.id, cleanedDay);
    }

    if (saveRes && typeof saveRes === 'object' && saveRes.success === false) {
      alert(`❌ Erro ao desvincular parque no banco: ${saveRes.error || 'Falha de conexão'}. Mantendo dados para nova tentativa.`);
      return;
    }

    // Clean any overflow items in the next day
    const nextDay = (allDays || []).find((d) => d.dayNumber === activeDay.dayNumber + 1);
    if (nextDay) {
      const cleanedNextSchedule = cleanPreviousDayOverflowItems(nextDay.hourlySchedule || [], activeDay.dayNumber);
      await updateItineraryDay(nextDay.id, {
        hourlySchedule: cleanedNextSchedule,
      });
    }

    setConfirmUnlink(false);
    onClose();
  };

  useConfirmationKeyboard({
    isOpen: confirmUnlink,
    onConfirm: handleUnlinkPark,
    onCancel: () => setConfirmUnlink(false),
  });

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen,
    onCancel: onClose,
    onSave: handleSaveAll,
  });

  if (!isOpen || !activeDay) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[90vh] max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Agendamento de Parque • {selectedParkName ? selectedParkName : 'Roteiro da Viagem'}
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Cadastrar Parque no Dia da Viagem
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Day Selector Ribbon (when multiple days exist) */}
        {allDays.length > 1 && (
          <div className="px-6 py-3 bg-slate-100/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1A2B4C]" />
              <label className="text-xs font-bold text-slate-700">
                Selecione o Dia da Viagem para Agendar:
              </label>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md">
              <select
                value={selectedDayId || activeDay.id}
                onChange={(e) => handleDaySelectChange(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-[#1A2B4C] focus:ring-2 focus:ring-[#1A2B4C] cursor-pointer shadow-2xs"
              >
                {viableDays.map((d) => {
                  const hasPark = isDayWithPark(d);
                  return (
                    <option key={d.id} value={d.id}>
                      Dia {d.dayNumber} ({formatDisplayDate(d.date)}) — {hasPark ? `🎡 ${d.park}` : '☀️ Sem Parque'}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}

        {/* Sub Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-0 bg-slate-50 border-b border-slate-200 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'general'
                ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>1. Escolher Parque & Horários</span>
          </button>
          <button
            onClick={() => setActiveTab('fastpass')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'fastpass'
                ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>2. Fast Pass / Lightning Lane ({fastPasses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('dining')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'dining'
                ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Utensils className="w-3.5 h-3.5 text-rose-500" />
            <span>3. Almoço & Restaurantes ({diningList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('shows')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'shows'
                ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Star className="w-3.5 h-3.5 text-indigo-500" />
            <span>4. Shows & Fogos ({showsList.length})</span>
          </button>
          {hasPhotoPackage && (
            <button
              onClick={() => setActiveTab('photos')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer animate-in fade-in duration-200 ${
                activeTab === 'photos'
                  ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-lg shadow-2xs'
                  : 'border-transparent text-purple-700 hover:text-purple-900 bg-purple-50/60'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-purple-600" />
              <span>5. Pacote de Fotos</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-black">
                {photoPkgType === 'trip_30days' ? '30 Dias' : photoPkgType === 'daily' ? '1 Dia' : 'Ativo'}
              </span>
            </button>
          )}
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-6 space-y-6">
          {/* TAB 1: GENERAL & PARK SELECTION */}
          {activeTab === 'general' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* 1. STATUS & INGRESSO */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  1. Ingresso Vinculado & Status da Reserva
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Vincular Ingresso Adquirido</label>
                      <select
                        value={selectedTicket ? selectedTicket.id : ticketType}
                        onChange={(e) => handleTicketTypeChange(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer shadow-2xs"
                      >
                        <option value="">💡 Nenhum ingresso vinculado</option>
                        {parkTickets.map((t) => (
                          <option key={t.id} value={t.id}>
                            🎟️ {t.title} ({t.complex})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Status do Park Pass</label>
                      <select
                        value={parkPassStatus}
                        onChange={(e) => setParkPassStatus(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 cursor-pointer shadow-2xs"
                      >
                        <option value="Previsão (Planejamento)">💡 Planejamento</option>
                        <option value="Confirmado no App">✅ Confirmado no App</option>
                        <option value="Não Requer Reserva">✨ Não Requer Reserva</option>
                        <option value="Ingresso Hopper">🔄 Ingresso Park Hopper</option>
                        <option value="Pendente">⚠️ Pendente</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">Código de Confirmação / Voucher</label>
                    <input
                      type="text"
                      value={confirmationCode}
                      onChange={(e) => setConfirmationCode(e.target.value)}
                      placeholder="Ex: DIS-MK-984210"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                    />
                  </div>

                  {/* CAMPO DE PACOTE DE FOTOS NA TELA PRINCIPAL */}
                  <div className="pt-3 border-t border-slate-200">
                    <div className="p-3.5 rounded-xl border border-purple-200/90 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-purple-50/70 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
                            <Camera className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 block">
                              Pacote de Fotos (PhotoPass / Memory Maker / PhotoKey)
                            </span>
                            <p className="text-xs font-semibold text-slate-800">
                              Possui pacote de fotos vinculado para este dia / parque?
                            </p>
                          </div>
                        </div>

                        {/* Toggle Sim / Não */}
                        <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shrink-0 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => {
                              setHasPhotoPackage(false);
                              if (activeTab === 'photos') setActiveTab('general');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              !hasPhotoPackage
                                ? 'bg-slate-700 text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Não
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHasPhotoPackage(true);
                              setActiveTab('photos');
                            }}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              hasPhotoPackage
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Sim, Possui 📸</span>
                          </button>
                        </div>
                      </div>

                      {hasPhotoPackage && (
                        <div className="pt-2.5 border-t border-purple-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs animate-in fade-in duration-200">
                          <div className="text-purple-900 flex items-center gap-1.5 flex-wrap">
                            <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                            <span className="font-bold">{photoPkgName || 'Pacote de Fotos Selecionado'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200/80 text-purple-900 font-bold">
                              {photoPkgType === 'trip_30days'
                                ? 'Validade: 30 Dias (Múltiplos Parques)'
                                : photoPkgType === 'daily'
                                ? 'Validade: 1 Dia'
                                : 'Multi-Dias'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setActiveTab('photos')}
                            className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer self-start sm:self-auto active:scale-95"
                          >
                            <span>Configurar Pacote de Fotos</span>
                            <span>→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SELEÇÃO DO PARQUE */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    2. Seleção do Parque / Destino do Dia
                  </label>
                  {!selectedParkName && (
                    <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      💡 Selecione um parque abaixo
                    </span>
                  )}
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">
                      Dia {activeDay.dayNumber} ({formatDisplayDate(activeDay.date)})
                    </span>
                    {selectedTicket && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        🎯 Filtrado pelo ingresso
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-52 overflow-y-auto p-1 border border-slate-200/60 rounded-xl bg-white shadow-inner">
                    {/* Option: Sem Parque / Descanso */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedParkName('');
                        setDayTitle(activeDay ? `Dia ${activeDay.dayNumber} - Sem Parque` : 'Sem Parque');
                        setHoursStatus(null);
                      }}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        !selectedParkName
                          ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-sm ring-1 ring-[#D4AF37]/50'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span className="text-xl shrink-0">🏖️</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold truncate leading-tight">Sem Parque</p>
                        <p className={`text-[9px] truncate ${!selectedParkName ? 'text-[#D4AF37]' : 'text-slate-400'}`}>
                          Dia Livre / Descanso
                        </p>
                      </div>
                    </button>

                    {filteredParks.map((park) => {
                      const isSelected = selectedParkName === park.name;
                      return (
                        <button
                          key={park.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedParkName('');
                              setDayTitle(`Dia ${activeDay.dayNumber}`);
                              setHoursStatus(null);
                            } else {
                              setSelectedParkName(park.name);
                              setDayTitle(`${park.name} - Dia ${activeDay.dayNumber}`);
                              if (park.proTips && park.proTips.length > 0 && !ropeDropPlan) {
                                setRopeDropPlan(park.proTips[0]);
                              }
                              // Auto-link ticket and confirmation code if available
                              const matchedTkt = parkTickets.find((t) => {
                                if (t.parksIncluded && t.parksIncluded.some((p) => p.toLowerCase().includes(park.name.toLowerCase()) || park.name.toLowerCase().includes(p.toLowerCase()))) {
                                  return true;
                                }
                                if (t.complex && park.name.toLowerCase().includes(t.complex.toLowerCase())) {
                                  return true;
                                }
                                return false;
                              });
                              if (matchedTkt) {
                                setTicketType(matchedTkt.id);
                                if (matchedTkt.confirmationCode) {
                                  setConfirmationCode(matchedTkt.confirmationCode);
                                }
                              }
                              autoFetchHours(park.name, activeDay.date, true);
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-sm ring-1 ring-[#D4AF37]/50'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <span className="text-xl shrink-0">{park.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold truncate leading-tight">{park.name}</p>
                            <p className={`text-[9px] truncate ${isSelected ? 'text-[#D4AF37]' : 'text-slate-400'}`}>
                              {park.resort.split(' ')[0]}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {/* Common non-park destinations */}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedParkName === 'Disney Springs / Compras') {
                          setSelectedParkName('');
                          setDayTitle(`Dia ${activeDay.dayNumber}`);
                        } else {
                          setSelectedParkName('Disney Springs / Compras');
                          setDayTitle(`Disney Springs & Compras - Dia ${activeDay.dayNumber}`);
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        selectedParkName === 'Disney Springs / Compras'
                          ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-sm ring-1 ring-[#D4AF37]/50'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span className="text-xl">🛍️</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold truncate leading-tight">Disney Springs</p>
                        <p className={`text-[9px] truncate ${selectedParkName === 'Disney Springs / Compras' ? 'text-[#D4AF37]' : 'text-slate-400'}`}>Compras & Lazer</p>
                      </div>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Título Personalizado do Dia
                    </label>
                    <input
                      type="text"
                      value={dayTitle}
                      onChange={(e) => setDayTitle(e.target.value)}
                      placeholder="Ex: Magic Kingdom - Onde a Magia Começa"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* 3. HORÁRIOS DO PARQUE */}
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    3. Horários de Funcionamento (Ao Vivo)
                  </label>
                  <button
                    type="button"
                    onClick={() => autoFetchHours(selectedParkName, activeDay.date)}
                    disabled={hoursLoading}
                    className="text-[10px] font-bold text-[#1A2B4C] bg-white border border-slate-200 px-2 py-0.5 rounded-md hover:bg-slate-50 transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    <Sparkles className={`w-3 h-3 text-[#D4AF37] ${hoursLoading ? 'animate-spin' : ''}`} />
                    <span>{hoursLoading ? 'Consultando...' : 'Atualizar via API'}</span>
                  </button>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  {/* Botão de Hospedagem: Hotel do Complexo vs Hotel Externo */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        hasEarlyEntry ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {hasEarlyEntry ? 'Hospedado em Hotel do Complexo' : 'Hospedagem Externa (Fora do Complexo)'}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            hasEarlyEntry ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {hasEarlyEntry ? 'Early Entry Ativo' : 'Early Entry Oculto'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          {hasEarlyEntry
                            ? 'Exibindo benefício de Entrada Antecipada (Early Entry) para hóspedes.'
                            : 'Não ficarei em hotel deles (oculta o horário de Early Entry).'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const next = !hasEarlyEntry;
                        setHasEarlyEntry(next);
                        hasEarlyEntryRef.current = next;
                        if (!next) {
                          setEarlyEntryTime('');
                        } else if (!earlyEntryTime) {
                          setEarlyEntryTime('08:30');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border shadow-2xs shrink-0 ${
                        hasEarlyEntry
                          ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                          : 'bg-indigo-50 text-indigo-900 border-indigo-300 hover:bg-indigo-100'
                      }`}
                    >
                      {hasEarlyEntry ? (
                        <>
                          <Hotel className="w-3.5 h-3.5 text-amber-700" />
                          <span>Não ficarei em hotel deles</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
                          <span>Ficarei em hotel deles (Ativar Early Entry)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {hoursStatus && (
                    <div className={`p-2.5 rounded-xl border text-[10px] font-bold flex items-center gap-2 ${
                      hoursStatus.isOfficial ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      {hoursStatus.isOfficial ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                      <span>{hoursStatus.message}</span>
                    </div>
                  )}

                  <div className={`grid ${hasEarlyEntry ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'} gap-3`}>
                    {/* ABERTURA */}
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Abertura</label>
                        <span className="text-[9px] font-semibold text-slate-400">Oficial</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setOpeningTime(adjustTimeMinutes(openingTime, -30, '09:00'))}
                          className="w-7 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          title="-30 min"
                        >
                          -
                        </button>
                        <input
                          type="text"
                          value={openingTime}
                          onChange={(e) => setOpeningTime(e.target.value)}
                          onBlur={(e) => setOpeningTime(formatTimeInput(e.target.value, '09:00'))}
                          placeholder="09:00"
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 text-center focus:bg-white focus:ring-2 focus:ring-[#1A2B4C]/20 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setOpeningTime(adjustTimeMinutes(openingTime, 30, '09:00'))}
                          className="w-7 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          title="+30 min"
                        >
                          +
                        </button>
                      </div>

                      {/* Quick fixed presets */}
                      <div className="pt-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Horários comuns:</span>
                        <div className="flex flex-wrap gap-1">
                          {['08:00', '08:30', '09:00', '09:30', '10:00'].map((preset) => {
                            const isSelected = openingTime === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setOpeningTime(preset)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#1A2B4C] text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                {preset}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* EARLY ENTRY */}
                    {hasEarlyEntry && (
                      <div className="bg-white p-3 rounded-2xl border border-indigo-100 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">Early Entry</label>
                          <span className="text-[9px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">Hóspedes</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEarlyEntryTime(adjustTimeMinutes(earlyEntryTime || openingTime, -15, '08:30'))}
                            className="w-7 h-8 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
                            title="-15 min"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            value={earlyEntryTime}
                            onChange={(e) => setEarlyEntryTime(e.target.value)}
                            onBlur={(e) => {
                              if (e.target.value.trim()) {
                                setEarlyEntryTime(formatTimeInput(e.target.value, '08:30'));
                              }
                            }}
                            placeholder="08:30"
                            className="w-full px-2 py-1.5 bg-indigo-50/40 border border-indigo-200 rounded-lg text-sm font-bold text-indigo-950 text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setEarlyEntryTime(adjustTimeMinutes(earlyEntryTime || openingTime, 15, '08:30'))}
                            className="w-7 h-8 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
                            title="+15 min"
                          >
                            +
                          </button>
                        </div>

                        {/* Quick fixed presets */}
                        <div className="pt-1">
                          <span className="text-[9px] font-bold text-indigo-400 uppercase block mb-1">Horários comuns:</span>
                          <div className="flex flex-wrap gap-1">
                            {['07:30', '08:00', '08:30', '09:00'].map((preset) => {
                              const isSelected = earlyEntryTime === preset;
                              return (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setEarlyEntryTime(preset)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white shadow-2xs'
                                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                                  }`}
                                >
                                  {preset}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* FECHAMENTO */}
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Fechamento</label>
                        <span className="text-[9px] font-semibold text-slate-400">Encerramento</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setClosingTime(adjustTimeMinutes(closingTime, -30, '21:00'))}
                          className="w-7 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          title="-30 min"
                        >
                          -
                        </button>
                        <input
                          type="text"
                          value={closingTime}
                          onChange={(e) => setClosingTime(e.target.value)}
                          onBlur={(e) => setClosingTime(formatTimeInput(e.target.value, '21:00'))}
                          placeholder="21:00"
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 text-center focus:bg-white focus:ring-2 focus:ring-[#1A2B4C]/20 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setClosingTime(adjustTimeMinutes(closingTime, 30, '21:00'))}
                          className="w-7 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          title="+30 min"
                        >
                          +
                        </button>
                      </div>

                      {/* Quick fixed presets */}
                      <div className="pt-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Horários comuns:</span>
                        <div className="flex flex-wrap gap-1">
                          {['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'].map((preset) => {
                            const isSelected = closingTime === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setClosingTime(preset)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#1A2B4C] text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                {preset}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Travel & Parking Transit Estimation Badge */}
                  {selectedParkName && selectedParkName !== 'Sem Parque' && (
                    <div className="p-4 bg-blue-50/90 border border-blue-200 rounded-2xl space-y-3 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-blue-200/60">
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                          <Car className="w-4 h-4 text-blue-600" />
                          <span>Cálculo Automático de Deslocamento (Ida e Volta)</span>
                        </div>
                        {activeAccommodation ? (
                          <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                            🏨 {activeAccommodation.name || 'Acomodação'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                            Sem acomodação (1h padrão)
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-blue-900 leading-relaxed space-y-2.5">
                        {(() => {
                          const metrics = getDriveAndParkingMetrics(
                            selectedParkName,
                            activeAccommodation?.name || activeAccommodation?.hotelName,
                            activeAccommodation?.address
                          );
                          const parkNameDisplay = metrics.parkDisplayName || selectedParkName;
                          const targetTime = hasEarlyEntry && earlyEntryTime.trim() ? earlyEntryTime.trim() : (openingTime || '09:00');
                          const [tH, tM] = targetTime.split(':').map((v) => parseInt(v, 10));
                          const targetTotalMins = (isNaN(tH) ? 9 : tH) * 60 + (isNaN(tM) ? 0 : tM);
                          
                          const portaoMins = Math.max(0, targetTotalMins - 30);
                          const estacMins = Math.max(0, portaoMins - metrics.maxParkingMins);

                          const [closeH, closeM] = (closingTime || '21:00').split(':').map((v) => parseInt(v, 10));
                          const closeTotalMins = (isNaN(closeH) ? 21 : closeH) * 60 + (isNaN(closeM) ? 0 : closeM);
                          const chegadaCarroMins = closeTotalMins + metrics.maxParkingMins;

                          const formatTime = (totalMinutes: number) => {
                            const norm = ((totalMinutes % 1440) + 1440) % 1440;
                            const h = Math.floor(norm / 60);
                            const m = norm % 60;
                            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                          };

                          if (activeAccommodation) {
                            const saidaTotalMins = Math.max(0, estacMins - metrics.driveMins);
                            const chegadaHotelMins = chegadaCarroMins + metrics.driveMins;
                            const isNextDay = chegadaHotelMins >= 1440;

                            const saidaStr = formatTime(saidaTotalMins);
                            const estacStr = formatTime(estacMins);
                            const portaoStr = formatTime(portaoMins);
                            const fechamentoStr = closingTime || '21:00';
                            const chegadaCarroStr = formatTime(chegadaCarroMins);
                            const chegadaHotelStr = formatTime(chegadaHotelMins);

                            return (
                              <div className="space-y-3">
                                <p className="text-xs text-blue-900 font-medium">
                                  Trajeto estimado: <strong>~{metrics.driveMins} min</strong> de carro + Estacionamento até catracas: <strong>{metrics.maxParkingMins} min</strong> + Chegada <strong>30 min antes</strong> da abertura.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* IDA */}
                                  <div className="bg-white/90 p-3 rounded-xl border border-blue-100 space-y-1.5 shadow-2xs">
                                    <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                                      <span>☀️ Trajeto de Ida (Manhã)</span>
                                    </div>
                                    <ul className="text-[10px] text-slate-700 space-y-1">
                                      <li>• <strong>{saidaStr}</strong>: 🚗 Saída de {activeAccommodation.name}.</li>
                                      <li>• <strong>{estacStr}</strong>: 🚗 Chegada no estacionamento ({metrics.maxParkingMins} min até o portão).</li>
                                      <li>• <strong>{portaoStr}</strong>: 🎟️ Chegada no portão (30 min antes da abertura às {targetTime}).</li>
                                      <li>• <strong>{targetTime}</strong>: 🎡 {hasEarlyEntry ? 'Entrada Antecipada (Early Entry)' : 'Abertura Oficial'}.</li>
                                    </ul>
                                  </div>

                                  {/* VOLTA */}
                                  <div className="bg-white/90 p-3 rounded-xl border border-blue-100 space-y-1.5 shadow-2xs">
                                    <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                                      <span>🌙 Trajeto de Volta (Noite / Madrugada)</span>
                                    </div>
                                    <ul className="text-[10px] text-slate-700 space-y-1">
                                      <li>• <strong>{fechamentoStr}</strong>: 🌙 Fechamento de {parkNameDisplay} e Ida para {activeAccommodation.name}.</li>
                                      <li>• <strong>{chegadaCarroStr}</strong>: 🚗 Chegada ao Carro no estacionamento (+{metrics.maxParkingMins} min).</li>
                                      <li>
                                        • <strong>{chegadaHotelStr}</strong>: 🏨 Chegada na acomodação ({activeAccommodation.name}) e Descanso (+{metrics.driveMins} min de carro)
                                        {isNextDay && (
                                          <span className="ml-1 text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                                            Entra no Dia Seguinte
                                          </span>
                                        )}.
                                      </li>
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            const saidaTotalMins = Math.max(0, estacMins - 60);
                            const chegadaHotelMins = chegadaCarroMins + 60;
                            const isNextDay = chegadaHotelMins >= 1440;

                            const saidaStr = formatTime(saidaTotalMins);
                            const estacStr = formatTime(estacMins);
                            const portaoStr = formatTime(portaoMins);
                            const fechamentoStr = closingTime || '21:00';
                            const chegadaCarroStr = formatTime(chegadaCarroMins);
                            const chegadaHotelStr = formatTime(chegadaHotelMins);

                            const fallbackLocationPreview = getFallbackAccommodationLocation(
                              selectedParkName,
                              activeDay,
                              allDays,
                              activeDay?.dayNumber ? activeDay.dayNumber - 1 : undefined,
                              settings?.destination
                            );

                            return (
                              <div className="space-y-3">
                                <p className="text-xs text-blue-900 font-medium">
                                  Nenhuma acomodação cadastrada neste dia (considerando <strong>1h de carro</strong> + <strong>{metrics.maxParkingMins} min</strong> de deslocamento do estacionamento + chegada <strong>30 min antes</strong> no portão).
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* IDA */}
                                  <div className="bg-white/90 p-3 rounded-xl border border-blue-100 space-y-1.5 shadow-2xs">
                                    <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                                      <span>☀️ Trajeto de Ida (Manhã)</span>
                                    </div>
                                    <ul className="text-[10px] text-slate-700 space-y-1">
                                      <li>• <strong>{saidaStr}</strong>: 🏨 Saída de {fallbackLocationPreview}.</li>
                                      <li>• <strong>{estacStr}</strong>: 🚗 Chegada no estacionamento ({metrics.maxParkingMins} min até o portão).</li>
                                      <li>• <strong>{portaoStr}</strong>: 🎟️ Chegada no portão (30 min antes da abertura às {targetTime}).</li>
                                      <li>• <strong>{targetTime}</strong>: 🎡 {hasEarlyEntry ? 'Entrada Antecipada (Early Entry)' : 'Abertura Oficial'}.</li>
                                    </ul>
                                  </div>

                                  {/* VOLTA */}
                                  <div className="bg-white/90 p-3 rounded-xl border border-blue-100 space-y-1.5 shadow-2xs">
                                    <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                                      <span>🌙 Trajeto de Volta (Noite / Madrugada)</span>
                                    </div>
                                    <ul className="text-[10px] text-slate-700 space-y-1">
                                      <li>• <strong>{fechamentoStr}</strong>: 🌙 Fechamento de {parkNameDisplay} e Retorno a {fallbackLocationPreview}.</li>
                                      <li>• <strong>{chegadaCarroStr}</strong>: 🚗 Chegada ao Carro no estacionamento (+{metrics.maxParkingMins} min).</li>
                                      <li>
                                        • <strong>{chegadaHotelStr}</strong>: 🏨 Chegada a {fallbackLocationPreview} e Descanso (+1h de viagem de carro)
                                        {isNextDay && (
                                          <span className="ml-1 text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                                            Entra no Dia Seguinte
                                          </span>
                                        )}.
                                      </li>
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. ESTRATÉGIA & NOTAS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  4. Estratégia de Rope Drop & Notas
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">Estratégia de Entrada (Rope Drop)</label>
                    <textarea
                      rows={2}
                      value={ropeDropPlan}
                      onChange={(e) => setRopeDropPlan(e.target.value)}
                      placeholder="Ex: Chegar 45min antes para o Early Entry..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">Observações Gerais</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: Levar carregador portátil, reserva de carrinho..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FAST PASS / LIGHTNING LANE */}
          {activeTab === 'fastpass' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* 1. ADICIONAR FAST PASS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>{editingFpId ? '1. Editar Atração com Fila Rápida' : '1. Adicionar Atração com Fila Rápida'}</span>
                  {editingFpId && (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      Modo Edição
                    </span>
                  )}
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Nome da Atração</label>
                      <input
                        type="text"
                        value={fpName}
                        onChange={(e) => setFpName(e.target.value)}
                        placeholder="Ex: Space Mountain"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      />
                      {/* Suggestions */}
                      {selectedParkGuide?.mustDoAttractions && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedParkGuide.mustDoAttractions.slice(0, 3).map((att, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setFpName(att)}
                              className="text-[9px] px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-slate-400 font-bold transition-colors cursor-pointer"
                            >
                              + {att}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Janela de Horário</label>
                      <input
                        type="text"
                        value={fpTime}
                        onChange={(e) => setFpTime(e.target.value)}
                        placeholder="Ex: 10:30 - 11:30"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Tipo do Passe</label>
                      <select
                        value={fpType}
                        onChange={(e) => setFpType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      >
                        <option value="Lightning Lane Multi Pass">Lightning Lane Multi Pass</option>
                        <option value="Lightning Lane Single Pass">Lightning Lane Single Pass</option>
                        <option value="Universal Express Pass">Universal Express Pass</option>
                        <option value="Fila Virtual (Virtual Queue)">Fila Virtual (Boarding Group)</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Observações</label>
                      <input
                        type="text"
                        value={fpNotes}
                        onChange={(e) => setFpNotes(e.target.value)}
                        placeholder="Ex: Agendado para todos"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddFastPass}
                      disabled={!fpName.trim()}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-md text-white ${
                        editingFpId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#1A2B4C] hover:bg-[#2A437E]'
                      }`}
                    >
                      {editingFpId ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Salvar Alterações</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-[#D4AF37]" />
                          <span>Adicionar à Lista</span>
                        </>
                      )}
                    </button>
                    {editingFpId && (
                      <button
                        type="button"
                        onClick={handleCancelEditFastPass}
                        className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancelar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. LISTA DE FAST PASSES */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  2. Atrações Agendadas ({fastPasses.length})
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  {fastPasses.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Zap className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs font-medium">Nenhum agendamento cadastrado</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {fastPasses.map((fp) => (
                        <div
                          key={fp.id}
                          className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs transition-all ${
                            editingFpId === fp.id
                              ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-300/60'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                              <Zap className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{fp.attractionName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-500 font-bold">{fp.timeWindow}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 uppercase font-black">
                                  {fp.type.split(' ')[0]}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditFastPass(fp)}
                              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                editingFpId === fp.id
                                  ? 'text-amber-700 bg-amber-100'
                                  : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title="Editar agendamento"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFastPass(fp.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir agendamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DINING */}
          {activeTab === 'dining' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* 1. ADICIONAR RESERVA */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>{editingDinId ? '1. Editar Reserva de Restaurante' : '1. Adicionar Reserva de Restaurante'}</span>
                  {editingDinId && (
                    <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      Modo Edição
                    </span>
                  )}
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Nome do Restaurante</label>
                      <input
                        type="text"
                        value={dinRestaurant}
                        onChange={(e) => setDinRestaurant(e.target.value)}
                        placeholder="Ex: Be Our Guest"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Horário da Reserva</label>
                      <input
                        type="text"
                        value={dinTime}
                        onChange={(e) => setDinTime(e.target.value)}
                        placeholder="Ex: 12:45"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Tipo da Refeição</label>
                      <select
                        value={dinMealType}
                        onChange={(e) => setDinMealType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      >
                        <option value="Café da Manhã (Breakfast)">Café da Manhã</option>
                        <option value="Almoço (Lunch)">Almoço</option>
                        <option value="Jantar (Dinner)">Jantar</option>
                        <option value="Lanche / Evento">Lanche / Evento</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Código da Reserva</label>
                      <input
                        type="text"
                        value={dinCode}
                        onChange={(e) => setDinCode(e.target.value)}
                        placeholder="Ex: DIN-9842"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddDining}
                      disabled={!dinRestaurant.trim()}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-md text-white ${
                        editingDinId ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#1A2B4C] hover:bg-[#2A437E]'
                      }`}
                    >
                      {editingDinId ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Salvar Alterações</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-[#D4AF37]" />
                          <span>Adicionar à Lista</span>
                        </>
                      )}
                    </button>
                    {editingDinId && (
                      <button
                        type="button"
                        onClick={handleCancelEditDining}
                        className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancelar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. LISTA DE RESERVAS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  2. Reservas de Restaurante ({diningList.length})
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  {diningList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Utensils className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs font-medium">Nenhuma reserva cadastrada</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {diningList.map((din) => (
                        <div
                          key={din.id}
                          className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs transition-all ${
                            editingDinId === din.id
                              ? 'bg-rose-50/80 border-rose-400 ring-2 ring-rose-300/60'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100">
                              <Utensils className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{din.restaurantName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-500 font-bold">{din.time}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 uppercase font-black">
                                  {din.mealType.split(' ')[0]}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditDining(din)}
                              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                editingDinId === din.id
                                  ? 'text-rose-700 bg-rose-100'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title="Editar reserva"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDining(din.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir reserva"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SHOWS */}
          {activeTab === 'shows' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* 1. ADICIONAR SHOW */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>{editingShowId ? '1. Editar Show, Parada ou Fogos' : '1. Adicionar Show, Parada ou Fogos'}</span>
                  {editingShowId && (
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      Modo Edição
                    </span>
                  )}
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Nome do Show / Evento</label>
                      <input
                        type="text"
                        value={showName}
                        onChange={(e) => setShowName(e.target.value)}
                        placeholder="Ex: Happily Ever After"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 block">Horário do Evento</label>
                      <input
                        type="text"
                        value={showTime}
                        onChange={(e) => setShowTime(e.target.value)}
                        placeholder="Ex: 21:00"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">Localização / Melhor Ponto</label>
                    <input
                      type="text"
                      value={showLocation}
                      onChange={(e) => setShowLocation(e.target.value)}
                      placeholder="Ex: Em frente ao castelo"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddShow}
                      disabled={!showName.trim()}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-md text-white ${
                        editingShowId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-[#1A2B4C] hover:bg-[#2A437E]'
                      }`}
                    >
                      {editingShowId ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Salvar Alterações</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-[#D4AF37]" />
                          <span>Adicionar à Lista</span>
                        </>
                      )}
                    </button>
                    {editingShowId && (
                      <button
                        type="button"
                        onClick={handleCancelEditShow}
                        className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancelar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. LISTA DE SHOWS */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  2. Shows & Paradas Agendadas ({showsList.length})
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  {showsList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Star className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs font-medium">Nenhum evento cadastrado</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {showsList.map((sh) => (
                        <div
                          key={sh.id}
                          className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs transition-all ${
                            editingShowId === sh.id
                              ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-300/60'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                              <Star className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{sh.showName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-500 font-bold">{sh.time}</span>
                                {sh.location && <span className="text-[9px] text-slate-400 truncate max-w-[150px]">@ {sh.location}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditShow(sh)}
                              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                editingShowId === sh.id
                                  ? 'text-indigo-700 bg-indigo-100'
                                  : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                              }`}
                              title="Editar show ou evento"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveShow(sh.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir show ou evento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PHOTO PACKAGE */}
          {activeTab === 'photos' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Header Info & Deactivation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-purple-950 font-serif">
                      Cadastro do Pacote de Fotos (PhotoPass / Memory Maker)
                    </h3>
                    <p className="text-[11px] text-purple-800 mt-0.5">
                      Vincule fotos digitais em alta resolução nas atrações e com fotógrafos oficiais do parque.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setHasPhotoPackage(false);
                    setActiveTab('general');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-white text-purple-900 text-xs font-semibold cursor-pointer transition-colors shrink-0"
                >
                  ✕ Desativar Pacote
                </button>
              </div>

              {/* Detected Existing Package Alert if found in another day */}
              {detectedOtherDayPkg && (
                <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <span className="font-bold text-purple-950">
                        Pacote detectado no Dia {detectedOtherDayPkg.dayNumber}: {detectedOtherDayPkg.name}
                      </span>
                      <p className="text-[11px] text-purple-800 mt-0.5">
                        {detectedOtherDayPkg.validityDescription || 'Válido para múltiplos parques da viagem.'}
                        {detectedOtherDayPkg.confirmationCode && ` • Voucher: #${detectedOtherDayPkg.confirmationCode}`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyDetectedPackage(detectedOtherDayPkg)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer transition-all active:scale-95"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Reutilizar Este Pacote</span>
                  </button>
                </div>
              )}

              {/* Quick Presets based on Park / Complex */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                  Modelos Rápidos (Clique para autopreencher):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPhotoPreset('disney_30days')}
                    className="p-2.5 rounded-xl border border-purple-200 bg-white hover:bg-purple-50 text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900 group-hover:text-purple-950">
                      <span>🏰 Disney Memory Maker (30 Dias)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Válido 30 dias em todos os 4 parques Disney + Aquáticos
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPhotoPreset('disney_1day')}
                    className="p-2.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900 group-hover:text-blue-950">
                      <span>🏰 Memory Maker One Day (1 Dia)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Válido para todas as fotos em um único dia
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPhotoPreset('universal_3days')}
                    className="p-2.5 rounded-xl border border-amber-200 bg-white hover:bg-amber-50 text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 group-hover:text-amber-950">
                      <span>🌎 Universal Photos (3 Dias)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Cobre Universal Studios, Islands e Volcano Bay
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPhotoPreset('universal_1day')}
                    className="p-2.5 rounded-xl border border-amber-200 bg-white hover:bg-amber-50 text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 group-hover:text-amber-950">
                      <span>🌎 Universal Photos (1 Dia)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Fotos ilimitadas em 1 dia nos parques Universal
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPhotoPreset('seaworld_season')}
                    className="p-2.5 rounded-xl border border-teal-200 bg-white hover:bg-teal-50 text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-teal-900 group-hover:text-teal-950">
                      <span>🐬 SeaWorld PhotoKey (Multi-Parque)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Válido SeaWorld, Busch Gardens e Aquatica
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPhotoPreset('seaworld_1day')}
                    className="p-2.5 rounded-xl border border-teal-200 bg-white hover:bg-teal-50 text-left transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-teal-900 group-hover:text-teal-950">
                      <span>🐬 SeaWorld PhotoKey (1 Dia)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Fotos ilimitadas em 1 dia no parque
                    </p>
                  </button>
                </div>
              </div>

              {/* Main Form Box */}
              <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Nome do Pacote de Fotos
                    </label>
                    <input
                      type="text"
                      value={photoPkgName}
                      onChange={(e) => setPhotoPkgName(e.target.value)}
                      placeholder="Ex: Disney Memory Maker (30 Dias)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Complexo / Rede de Parques
                    </label>
                    <select
                      value={photoPkgComplex}
                      onChange={(e) => setPhotoPkgComplex(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs cursor-pointer"
                    >
                      <option value="Disney">🏰 Walt Disney World</option>
                      <option value="Universal">🌎 Universal Orlando Resort</option>
                      <option value="SeaWorld">🐬 SeaWorld Parks & Entertainment</option>
                      <option value="Outro">✨ Outro Complexo / Atração</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Tipo de Validade do Pacote
                    </label>
                    <select
                      value={photoPkgType}
                      onChange={(e) => setPhotoPkgType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs cursor-pointer"
                    >
                      <option value="trip_30days">📅 30 Dias (Toda a Viagem / Todos os Parques)</option>
                      <option value="daily">☀️ Diário (Válido para 1 Único Dia)</option>
                      <option value="multi_day">🗓️ Multi-Dias (Ex: 3 Dias Universal)</option>
                      <option value="annual">⭐ Passe Anual / Toda a Temporada</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Descrição da Validade / Regra
                    </label>
                    <input
                      type="text"
                      value={photoPkgValidityDesc}
                      onChange={(e) => setPhotoPkgValidityDesc(e.target.value)}
                      placeholder="Ex: Válido por 30 dias a partir da 1ª foto baixada"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                    />
                  </div>
                </div>

                {/* Parques Incluídos (Multi-Parque) */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Parques Incluídos nesta Mesma Compra ({photoPkgIncludedParks.length} selecionados):
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoPkgIncludedParks([
                            'Magic Kingdom',
                            'EPCOT',
                            "Disney's Hollywood Studios",
                            "Disney's Animal Kingdom",
                            "Disney's Typhoon Lagoon",
                            "Disney's Blizzard Beach",
                          ])
                        }
                        className="text-[10px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                      >
                        + Todos Disney
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoPkgIncludedParks([
                            'Universal Studios Florida',
                            "Universal's Islands of Adventure",
                            "Universal's Volcano Bay",
                          ])
                        }
                        className="text-[10px] text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                      >
                        + Todos Universal
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoPkgIncludedParks([
                            'SeaWorld Orlando',
                            'Busch Gardens Tampa Bay',
                            'Aquatica Orlando',
                          ])
                        }
                        className="text-[10px] text-teal-700 hover:text-teal-900 font-bold underline cursor-pointer"
                      >
                        + Todos SeaWorld
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setPhotoPkgIncludedParks([])}
                        className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 p-2 rounded-xl bg-white border border-slate-200 max-h-44 overflow-y-auto">
                    {[
                      'Magic Kingdom',
                      'EPCOT',
                      "Disney's Hollywood Studios",
                      "Disney's Animal Kingdom",
                      "Disney's Typhoon Lagoon",
                      "Disney's Blizzard Beach",
                      'Universal Studios Florida',
                      "Universal's Islands of Adventure",
                      "Universal's Volcano Bay",
                      'SeaWorld Orlando',
                      'Busch Gardens Tampa Bay',
                      'Aquatica Orlando',
                      'Discovery Cove',
                      'LEGOLAND Florida',
                      'Kennedy Space Center',
                    ].map((pName) => {
                      const isSel = photoPkgIncludedParks.includes(pName);
                      return (
                        <button
                          key={pName}
                          type="button"
                          onClick={() => toggleParkIncludedInPhotoPkg(pName)}
                          className={`p-2 rounded-lg text-left text-[11px] font-semibold border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                            isSel
                              ? 'bg-purple-50 text-purple-900 border-purple-300 shadow-2xs font-bold'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{pName}</span>
                          {isSel && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Voucher, Conta e Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Código de Confirmação / Voucher
                    </label>
                    <input
                      type="text"
                      value={photoPkgCode}
                      onChange={(e) => setPhotoPkgCode(e.target.value)}
                      placeholder="Ex: WDW-MM-948123"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Conta Vinculada / Titular
                    </label>
                    <input
                      type="text"
                      value={photoPkgAccount}
                      onChange={(e) => setPhotoPkgAccount(e.target.value)}
                      placeholder="Ex: My Disney Experience (email)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Status do Pacote
                    </label>
                    <select
                      value={photoPkgStatus}
                      onChange={(e) => setPhotoPkgStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs cursor-pointer"
                    >
                      <option value="Confirmado">✅ Confirmado no App</option>
                      <option value="Ativo">📸 Ativo / Utilizando</option>
                      <option value="Pendente">⏳ Voucher a Ativar / Pendente</option>
                    </select>
                  </div>
                </div>

                {/* 6. VIAJANTES DO PACOTE */}
                <TravelerSelector
                  label="6. Viajantes do Pacote"
                  travelers={settings.travelers || []}
                  selectedIds={photoPkgTravelerIds || ['all']}
                  onChange={(ids) => setPhotoPkgTravelerIds(ids)}
                />

                {/* 7. CUSTOS & STATUS DA RESERVA */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      7. Custos & Status da Reserva
                    </label>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-slate-400 font-sans text-[10px] uppercase font-bold">Câmbio Oficial:</span>
                      <strong className="text-purple-900 font-bold">
                        US$ 1,00 = R$ {dollarRate.toFixed(2).replace('.', ',')}
                      </strong>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4 shadow-2xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Valor USD */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 block flex items-center justify-between">
                          <span>Valor a Pagar (US$)</span>
                          <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">USD</span>
                        </label>
                        <MoneyInput
                          currency="USD"
                          value={photoPkgCostUSD}
                          onChange={handlePhotoPkgCostUSDChange}
                        />
                      </div>

                      {/* Valor BRL */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 block flex items-center justify-between">
                          <span>Valor a Pagar (R$)</span>
                          <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">BRL</span>
                        </label>
                        <MoneyInput
                          currency="BRL"
                          value={photoPkgCostBRL}
                          onChange={handlePhotoPkgCostBRLChange}
                        />
                      </div>

                      {/* Status do Pagamento */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 block flex items-center justify-between">
                          <span>Status do Pagamento</span>
                          <span className="opacity-0 text-[9px] font-mono">_</span>
                        </label>
                        <select
                          value={photoPkgPaymentStatus}
                          onChange={(e) => setPhotoPkgPaymentStatus(e.target.value as any)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] cursor-pointer h-[38px] shadow-2xs"
                        >
                          <option value="Reservado / Confirmado">✅ Reservado / Confirmado (Pago)</option>
                          <option value="Pago">💰 Pago / Quitado</option>
                          <option value="Pendente">⏳ Pagamento Pendente</option>
                          <option value="Falta Pagar">⚠️ Falta Pagar (No Check-in)</option>
                        </select>
                      </div>
                    </div>

                    {/* Responsável pelo Pagamento */}
                    <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                        <label className="text-xs font-bold text-slate-700">Responsável pelo Pagamento</label>
                      </div>
                      <select
                        value={photoPkgPayerId || 'all'}
                        onChange={(e) => setPhotoPkgPayerId(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/30 min-w-[200px] cursor-pointer shadow-2xs"
                      >
                        <option value="all">👥 Dividido pelo grupo</option>
                        {settings.travelers?.map((t) => (
                          <option key={t.id} value={t.id}>
                            👤 {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Atalhos Rápidos de Valores Comuns de Pacotes */}
                    <div className="pt-2 border-t border-slate-200/80 flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mr-1">
                        Valores Típicos:
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePhotoPkgCostUSDChange(185)}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 font-semibold text-[10px] cursor-pointer transition-colors shadow-2xs"
                      >
                        Disney 30d ($185)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePhotoPkgCostUSDChange(75)}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 font-semibold text-[10px] cursor-pointer transition-colors shadow-2xs"
                      >
                        Disney 1 Dia ($75)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePhotoPkgCostUSDChange(129.99)}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 font-semibold text-[10px] cursor-pointer transition-colors shadow-2xs"
                      >
                        Universal 3d ($129,99)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePhotoPkgCostUSDChange(89.99)}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100/70 border border-purple-200 text-purple-900 font-semibold text-[10px] cursor-pointer transition-colors shadow-2xs"
                      >
                        Universal 1d ($89,99)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Auto Propagate Checkbox */}
                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="chk-propagate-photo-pkg"
                    checked={applyPhotoPkgToAllDays}
                    onChange={(e) => setApplyPhotoPkgToAllDays(e.target.checked)}
                    className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="chk-propagate-photo-pkg" className="text-xs text-purple-950 font-medium cursor-pointer">
                    <strong>Vincular automaticamente este pacote aos outros dias da viagem</strong> que visitam os parques selecionados acima (ex: todos os 4 parques Disney da viagem).
                  </label>
                </div>

                {/* Notes and Pro Tips */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Observações & Lembretes
                  </label>
                  <textarea
                    rows={2}
                    value={photoPkgNotes}
                    onChange={(e) => setPhotoPkgNotes(e.target.value)}
                    placeholder="Ex: Baixar fotos até 45 dias após a viagem, pedir Magic Shots com personagens..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                  />
                </div>
              </div>

              {/* Informative Guidance Box */}
              <div className="p-4 rounded-xl bg-slate-100 border border-slate-200/90 text-xs text-slate-700 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Info className="w-4 h-4 text-purple-600" />
                  <span>Dicas Importantes sobre Pacotes de Fotos em Orlando</span>
                </div>
                <ul className="text-[11px] text-slate-600 space-y-1 pl-1">
                  <li>• <strong>Disney Memory Maker (30 Dias):</strong> Inclui fotos e vídeos de atrações (Space Mountain, Tron, Expedition Everest, etc.), fotógrafos na frente do castelo e pontos icônicos, além de Magic Shots onde personagens aparecem na foto.</li>
                  <li>• <strong>Prazo de Validade de Download:</strong> As fotos Disney expiram em <strong>45 dias</strong> a partir da data em que foram tiradas. Lembre-se de fazer o download de todas antes do prazo.</li>
                  <li>• <strong>Universal My Universal Photos:</strong> Inclui fotos ilimitadas nas principais montanhas-russas (Velocicoaster, Hagrid's, Hulk, Rip Ride Rockit) e pontos temáticos.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {isDayWithPark(activeDay) && (
              !confirmUnlink ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(true)}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 p-1.5 bg-rose-50 border border-rose-200 rounded-xl animate-in fade-in">
                  <span className="text-[11px] font-bold text-rose-700 pl-1.5">Desvincular parque?</span>
                  <button
                    type="button"
                    onClick={handleUnlinkPark}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmUnlink(false)}
                    className="px-2 py-1 text-slate-600 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className={`px-6 py-2.5 rounded-xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isSaving ? (
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
      </div>
    </div>
  );
};
