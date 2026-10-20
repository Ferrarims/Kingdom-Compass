import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import {
  GlobalSettings,
  ExpenseItem,
  ItineraryDay,
  HourlyScheduleItem,
  PreparationDocument,
  ChecklistSubItem,
  BookingMilestone,
  BaggageItem,
  Traveler,
  SyncNotification,
  ExpenseCategory,
  FlightSegment,
  FlightAttachment,
  CarRentalBooking,
  CarRentalAttachment,
  AccommodationBooking,
  AccommodationAttachment,
  ParkTicketPurchase,
  Trip,
  AiParsedData,
  AuthSession,
  ExchangeRateData,
  ModuleReadiness,
  ModuleReadinessStatus,
} from '../types';
import { fetchLiveExchangeRate } from '../services/exchangeRateService';
import { supabase, checkSupabaseConnection } from '../services/supabaseClient';
import { SupabaseService } from '../services/supabaseService';
import { detectGenderByName, Gender } from '../utils/genderDetector';
import { clearParkReferencesFromDay, generateParkHourlySchedule, generateParkScheduleResult, deduplicateHourlySchedule, cleanInvalidAutoItems, isDayWithPark, isNonParkEvent, syncAllEventsToHourlySchedule, adjustScheduleForCheckoutAndDeparture, compareScheduleItemOrder, calculateDay1AccommodationTimeline, Day1AirportAccommodationTimeline, addMinutesToTimeString, maxTimeString, syncFlightsWithItineraryDays, isDefaultItineraryDayTitle, syncAccommodationsWithItineraryDays, auditAndCorrectTrip, ensureHourlyScheduleItems } from '../utils/parkScheduleUtils';
import { generateEssentialBaggageItems, BaggageTemplateOptions, WeatherCondition, detectOrlandoWeatherFromTrip } from '../utils/baggageGenerator';
import { normalizeAttractionName } from '../utils/attractionUtils';
import {
  INITIAL_SETTINGS,
  INITIAL_EXPENSES,
  INITIAL_ITINERARY_DAYS,
  INITIAL_PREPARATION_DOCS,
  INITIAL_BOOKING_MILESTONES,
  INITIAL_BAGGAGE_ITEMS,
  INITIAL_TRAVELERS,
  INITIAL_FLIGHTS,
  INITIAL_CAR_RENTALS,
  INITIAL_ACCOMMODATIONS,
  INITIAL_PARK_TICKETS,
  INITIAL_TRIPS,
  PARKS_GUIDE_DATA,
} from '../data/initialData';
import { generateUUID, generateDeterministicUUID } from '../utils/uuid';
import { ensurePreparationDocsForTravelers } from '../utils/prepDocs';

// Helper to deduplicate items by id to prevent duplicate key React errors
export function deduplicateById<T extends { id?: string }>(items: T[]): T[] {
  if (!items || !Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item) continue;
    if (item.id) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

// Helper to autofill daily itineraries based on flight segments and park guides
export function getAutofillForDay(
  dayNumber: number,
  parkName: string,
  flights: any[] = [],
  totalDays: number = 10,
  parksGuide: any[] = []
) {
  const pNameLower = (parkName || '').toLowerCase();

  // 1. Flights logic
  // Outbound flight on day 1
  if (dayNumber === 1) {
    const outboundFlight = flights.find((f) => f.type === 'outbound');
    if (outboundFlight) {
      return {
        title: 'Chegada',
        park: parkName || 'Sem Parque',
        morning: {
          where: `Voo de Ida - ${outboundFlight.airline} ${outboundFlight.flightNumber}`,
          dining: `Refeição a bordo / Aeroporto`,
          notes: `Embarque em ${outboundFlight.originAirport} às ${outboundFlight.departureTime}. Localizador: ${outboundFlight.pnrLocator}`,
        },
        afternoon: {
          where: `Desembarque em Orlando às ${outboundFlight.arrivalTime} (MCO)`,
          dining: `Lanche no aeroporto / Fast food`,
          notes: `Passar pela imigração, retirar malas e seguir para a retirada do carro alugado.`,
        },
        night: {
          where: `Check-in na Acomodação e Compras Rápidas`,
          dining: `Jantar próximo à acomodação ou Disney Springs`,
          notes: `Passar no Walmart ou Target para comprar água, snacks e protetor solar para os dias de parque.`,
        },
        generalNotes: `Dia de chegada em Orlando. Localizador do Voo: ${outboundFlight.pnrLocator || 'N/A'}.`,
      };
    }
  }

  // Inbound flight logic for last days
  if (dayNumber === totalDays && totalDays > 1) {
    const inboundFlight = flights.find((f) => f.type === 'inbound');
    if (inboundFlight) {
      // Check if the flight is an overnight flight where arrival is on the last day and departure was on previous day
      const depDate = inboundFlight.departureDate;
      const arrDate = inboundFlight.arrivalDate || depDate;
      const isOvernightArrivalDay = depDate && arrDate && depDate !== arrDate;

      if (isOvernightArrivalDay) {
        return {
          title: 'Fim da Viagem',
          park: parkName || 'Sem Parque',
          morning: { where: '', dining: '', notes: '' },
          afternoon: { where: '', dining: '', notes: '' },
          night: { where: '', dining: '', notes: '' },
          generalNotes: `Chegada e desembarque no Brasil. Fim da viagem!`,
        };
      }

      return {
        title: 'Partida',
        park: parkName || 'Sem Parque',
        morning: {
          where: `Arrumação das malas e check-out da acomodação`,
          dining: `Último café da manhã em Orlando`,
          notes: `Pesar as malas e fechar os cadeados TSA. Limite geral de 23kg por mala despachada.`,
        },
        afternoon: {
          where: `Últimas compras de conveniência ou passeio em Disney Springs`,
          dining: `Almoço de despedida em Orlando`,
          notes: `Dirigir-se ao aeroporto MCO para devolução do carro e check-in com 3 horas de antecedência.`,
        },
        night: {
          where: `Embarque e Voo de Volta - ${inboundFlight.airline} ${inboundFlight.flightNumber}`,
          dining: `Serviço de bordo na aeronave`,
          notes: `Voo decolando de MCO às ${inboundFlight.departureTime}. Desembarque programado para o dia seguinte.`,
        },
        generalNotes: `Dia de partida e encerramento da viagem em Orlando. Tenha um excelente retorno!`,
      };
    }
  }

  // 2. Parks logic (using PARKS_GUIDE_DATA)
  const matchedPark = parksGuide.find((p) => {
    const pLower = p.name.toLowerCase();
    return pNameLower.includes(pLower) || pLower.includes(pNameLower);
  });

  if (matchedPark) {
    const morningAtts = matchedPark.mustDoAttractions.slice(0, 3).join(', ');
    const afternoonAtts = matchedPark.mustDoAttractions.slice(3, 6).join(', ') || matchedPark.mustDoAttractions.slice(0, 2).join(', ');
    const morningDining = matchedPark.bestDining[0] || 'Café da manhã no hotel ou parque';
    const afternoonDining = matchedPark.bestDining[1] || matchedPark.bestDining[0] || 'Almoço rápido no parque';
    const nightDining = matchedPark.bestDining[2] || matchedPark.bestDining[0] || 'Jantar especial';
    const nightShow = matchedPark.nightShow || `Encerramento e fotos noturnas em ${matchedPark.name}`;

    return {
      title: `${matchedPark.name} - Dia Completo`,
      park: matchedPark.name,
      morning: {
        where: `Rope Drop: ${morningAtts}`,
        dining: morningDining,
        notes: matchedPark.proTips[0] || 'Chegar 30 a 45 minutos antes da abertura oficial.',
      },
      afternoon: {
        where: `Atrações da tarde: ${afternoonAtts}`,
        dining: afternoonDining,
        notes: matchedPark.proTips[1] || 'Fazer pausas em atrações fechadas e climatizadas.',
      },
      night: {
        where: nightShow,
        dining: nightDining,
        notes: matchedPark.proTips[2] || 'Posicionar-se com antecedência para o show noturno.',
      },
      generalNotes: `${matchedPark.description} Não esquecer de levar protetor solar e calçados confortáveis.`,
    };
  }

  // 3. Non-park patterns (Sem Parque focus)
  const isSprings = pNameLower.includes('springs');
  const isNASA = pNameLower.includes('kennedy') || pNameLower.includes('space') || pNameLower.includes('nasa');

  if (isSprings) {
    return {
      title: `Dia Inteiro de Lazer em Disney Springs`,
      park: parkName || 'Sem Parque',
      morning: {
        where: `Tempo livre / A definir`,
        dining: ``,
        notes: ``,
      },
      afternoon: {
        where: `Passeio pelas lojas de Disney Springs`,
        dining: ``,
        notes: ``,
      },
      night: {
        where: `Passeio por Disney Springs`,
        dining: ``,
        notes: ``,
      },
      generalNotes: `Disney Springs é o centro de entretenimento, gastronomia e compras ao ar livre da Disney. Não requer ingresso para entrar.`,
    };
  }

  if (isNASA) {
    return {
      title: `Kennedy Space Center - NASA (Cabo Canaveral)`,
      park: parkName || 'Kennedy Space Center (NASA)',
      morning: {
        where: `Exploração do Kennedy Space Center & Ônibus Espacial Atlantis`,
        dining: ``,
        notes: `Cabo Canaveral fica a cerca de 1 hora de viagem de Orlando pela rodovia SR-528.`,
      },
      afternoon: {
        where: `Tour de ônibus da NASA até o Centro Apollo/Saturn V`,
        dining: ``,
        notes: ``,
      },
      night: {
        where: `Retorno para Orlando e descanso`,
        dining: ``,
        notes: ``,
      },
      generalNotes: `Conheça o centro espacial ativo de onde partiram as missões Apollo para a Lua.`,
    };
  }

  // Generic fallback
  const isNoPark = !parkName || parkName === 'Sem Parque';
  const defaultFallbackTitle = isNoPark
    ? (dayNumber === 1 ? 'Chegada' : (dayNumber === totalDays && totalDays > 1 ? 'Partida' : 'Sem Parque'))
    : `${parkName} - Dia Completo`;

  return {
    title: defaultFallbackTitle,
    park: parkName || 'Sem Parque',
    morning: {
      where: '',
      dining: '',
      notes: '',
    },
    afternoon: {
      where: '',
      dining: '',
      notes: '',
    },
    night: {
      where: '',
      dining: '',
      notes: '',
    },
    generalNotes: isNoPark
      ? (dayNumber === 1 ? 'Dia de chegada da viagem.' : (dayNumber === totalDays && totalDays > 1 ? 'Dia de partida e retorno da viagem.' : 'Dia livre sem parque programado.'))
      : `Dia dedicado a aproveitar as atrações de ${parkName}.`,
  };
}

// Robust date parser for YYYY-MM-DD, DD/MM/YYYY or ISO strings
export function parseToYMD(dateStr?: string | null): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parts = trimmed.substring(0, 10).split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return { year, month, day };
    }
  }

  // Match DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
    const parts = trimmed.substring(0, 10).split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return { year, month, day };
    }
  }

  // Fallback ISO parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth(),
      day: parsed.getUTCDate(),
    };
  }
  return null;
}

export function normalizeDateToYMD(dateStr?: string | null): string {
  if (!dateStr) return '2026-12-30';
  const parsed = parseToYMD(dateStr);
  if (!parsed) return dateStr;
  const y = parsed.year;
  const m = String(parsed.month + 1).padStart(2, '0');
  const d = String(parsed.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper to format dates (e.g. 2026-12-30 + offset days)
export function calculateDateOffset(startDateStr: string, daysOffset: number): string {
  try {
    const parsed = parseToYMD(startDateStr);
    if (!parsed) return startDateStr;
    const d = new Date(parsed.year, parsed.month, parsed.day);
    d.setDate(d.getDate() + daysOffset);
    
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  } catch (e) {
    return startDateStr;
  }
}

// Calculate total duration in days INCLUSIVE of both start date and end date
// Example: 30/12/2026 to 10/01/2027 = 12 days (Dec 30, 31, Jan 1..10)
export function calculateDurationFromDates(startDateStr: string, endDateStr: string): number {
  try {
    const start = parseToYMD(startDateStr);
    const end = parseToYMD(endDateStr);
    if (!start || !end) return 1;
    const dStart = new Date(start.year, start.month, start.day);
    const dEnd = new Date(end.year, end.month, end.day);
    const diffTime = dEnd.getTime() - dStart.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays + 1);
  } catch (e) {
    return 1;
  }
}

// Get the actual inclusive final end date of a trip starting on startDate with durationDays
// Example: startDate = '2026-12-30', durationDays = 12 -> returns '2027-01-10'
export function getTripEndDate(startDateStr: string, durationDays: number): string {
  if (!startDateStr) return '2027-01-10';
  const numDays = Math.max(1, durationDays || 1);
  return calculateDateOffset(startDateStr, numDays - 1);
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function isDateInPast(dateStr: string, isFlexibleDates?: boolean): boolean {
  if (!dateStr || isFlexibleDates) return false;
  const todayStr = getTodayDateString();
  return dateStr < todayStr;
}

export function isDateToday(dateStr: string, isFlexibleDates?: boolean): boolean {
  if (!dateStr || isFlexibleDates) return false;
  const todayStr = getTodayDateString();
  return dateStr === todayStr;
}

export function isDateTimeInPast(dateStr: string, timeStr: string, isFlexibleDates?: boolean): boolean {
  if (!dateStr || isFlexibleDates) return false;
  if (isDateInPast(dateStr, isFlexibleDates)) return true;
  if (!isDateToday(dateStr, isFlexibleDates)) return false;
  
  const currentHM = getCurrentTimeString();
  const normalizedTime = (timeStr || '00:00').trim().slice(0, 5);
  return normalizedTime <= currentHM;
}

export function isDayEffectivelyCompleted(day: { completed?: boolean; date?: string }, isFlexibleDates?: boolean): boolean {
  if (day.completed) return true;
  if (day.date && isDateInPast(day.date, isFlexibleDates)) return true;
  return false;
}

export function isScheduleItemEffectivelyCompleted(
  dayDate: string,
  item: { completed?: boolean; time: string },
  isFlexibleDates?: boolean
): boolean {
  if (item.completed) return true;
  return isDateTimeInPast(dayDate, item.time, isFlexibleDates);
}

export function formatDisplayDate(dateStr: string, includeDayOfWeek: boolean = true): string {
  try {
    if (!dateStr) return '';
    const parsed = parseToYMD(dateStr);
    if (!parsed) return dateStr;
    const { year, month, day } = parsed;
    const d = new Date(year, month, day);
    
    const months = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const weekdays = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ];

    const formatted = `${day} de ${months[month]} de ${year}`;
    if (includeDayOfWeek) {
      return `${weekdays[d.getDay()]}, ${formatted}`;
    }
    return formatted;
  } catch (e) {
    return dateStr;
  }
}

export function generateDaysForNewTrip(durationDays: number, startDate?: string): ItineraryDay[] {
  const total = Math.max(1, durationDays);
  const baseStart = startDate || '2026-12-30';
  return Array.from({ length: total }, (_, i) => {
    const dayNum = i + 1;
    let title = 'Sem Parque';
    if (dayNum === 1) {
      title = 'Chegada';
    } else if (dayNum === total && total > 1) {
      title = 'Partida';
    }

    return {
      id: generateUUID(),
      dayNumber: dayNum,
      date: calculateDateOffset(baseStart, i),
      title: title,
      park: 'Sem Parque' as any,
      completed: false,
      morning: { where: '', dining: '', notes: '' },
      afternoon: { where: '', dining: '', notes: '' },
      night: { where: '', dining: '', notes: '' },
      generalNotes: '',
      hourlySchedule: [],
      attachments: [],
    };
  });
}

export function normalizeTripDays(days: ItineraryDay[] | Omit<ItineraryDay, 'date'>[] | undefined, totalDays: number, startDate?: string): ItineraryDay[] {
  const baseStart = startDate || '2026-12-30';
  if (!days || days.length === 0) {
    return generateDaysForNewTrip(totalDays, baseStart);
  }
  const count = days.length;
  return days.map((d, index) => {
    const dayNum = d.dayNumber || index + 1;
    let title = d.title;
    const park = d.park || 'Sem Parque';

    const isOldGenericTitle =
      !title ||
      title.includes('Chegada em Orlando & Check-in') ||
      title.includes('Check-out & Retorno ao Brasil') ||
      title.includes('Programação Livre') ||
      title.includes('Planejamento Livre') ||
      title === `Dia ${dayNum} - Sem Parque`;

    if (isOldGenericTitle) {
      if (dayNum === 1) {
        title = 'Chegada';
      } else if (dayNum === count && count > 1) {
        title = 'Partida';
      } else {
        title = park === 'Sem Parque' ? 'Sem Parque' : `${park} - Dia Completo`;
      }
    }

    return {
      ...d,
      dayNumber: dayNum,
      date: (d as ItineraryDay).date || calculateDateOffset(baseStart, index),
      title: title || (dayNum === 1 ? 'Chegada' : (dayNum === count && count > 1 ? 'Partida' : 'Sem Parque')),
      park: park,
      hourlySchedule: d.hourlySchedule || [],
    };
  });
}

interface PlannerContextType {
  // Trips Management
  trips: Trip[];
  activeTripId: string;
  selectTrip: (id: string) => void;
  addTrip: (tripData: {
    tripName: string;
    destination: string;
    startDate: string;
    durationDays: number;
    isFlexibleDates: boolean;
    flexibleOutboundStart?: string;
    flexibleOutboundEnd?: string;
    flexibleInboundStart?: string;
    flexibleInboundEnd?: string;
    flexibleMinDays?: number;
    flexibleMaxDays?: number;
    outboundFlexibility: string;
    inboundFlexibility: string;
    flexibilityNotes?: string;
    totalBudgetGoalBRL?: number;
    dollarRate?: number;
    travelers: Traveler[];
  }) => Promise<{ success: boolean; error?: string; tripId?: string; tripCode?: string; trip?: Trip }>;
  updateTrip: (id: string, updates: Partial<Trip>) => Promise<{ success: boolean; error?: string }>;
  deleteTrip: (id: string) => void;
  removeAllTrips: () => Promise<void>;
  duplicateTrip: (id: string) => void;

  settings: GlobalSettings;
  updateSettings: (newSettings: Partial<GlobalSettings>) => Promise<{ success: boolean; error?: string }>;
  updateModuleReadiness: (moduleKey: keyof ModuleReadiness, status: ModuleReadinessStatus) => void;
  updateTravelers: (travelers: Traveler[]) => void;
  setCurrentUser: (userId: string) => void;
  currentUser: Traveler;
  
  // Financial
  expenses: ExpenseItem[];
  addExpense: (expense: Omit<ExpenseItem, 'id'>) => Promise<{ success: boolean; error?: string; id?: string }>;
  updateExpense: (id: string, updates: Partial<ExpenseItem>) => Promise<{ success: boolean; error?: string }>;
  deleteExpense: (id: string) => void;
  toggleExpenseExclusion: (id: string) => void;
  syncExpensesToSupabase: () => Promise<boolean>;
  reloadExpensesFromSupabase: () => Promise<boolean>;
  currencyView: 'BRL' | 'USD';
  setCurrencyView: (currency: 'BRL' | 'USD') => void;
  liveExchangeRate: ExchangeRateData | null;
  isFetchingExchangeRate: boolean;
  refreshLiveExchangeRate: (autoApplyToTrip?: boolean) => Promise<{ success: boolean; isEstimate: boolean; data: ExchangeRateData | null }>;
  applyLiveRateToTrip: (forceEstimateConfirmation?: boolean) => void;
  financialSummary: {
    totalEstimatedBRL: number;
    totalEstimatedUSD: number;
    totalPaidBRL: number;
    totalPendingBRL: number;
    costPerPersonBRL: number;
    costPerPersonUSD: number;
    paidPercentage: number;
    categoryTotals: { category: ExpenseCategory; estimatedBRL: number; paidBRL: number; percentage: number; color: string }[];
  };

  // Itinerary
  itineraryDays: ItineraryDay[];
  updateItineraryDay: (id: string, updates: Partial<ItineraryDay>) => Promise<{ success: boolean; error?: string }>;
  saveHourlyScheduleItem: (dayId: string, item: HourlyScheduleItem) => Promise<boolean>;
  deleteHourlyScheduleItem: (dayId: string, itemId: string) => Promise<boolean>;
  swapOrMoveParkDay: (sourceDayNumber: number, targetDayNumber: number) => void;
  toggleDayCompleted: (id: string) => void;
  addItineraryDay: () => void;
  deleteItineraryDay: (id: string) => void;
  addAttachmentToDay: (dayId: string, attachment: { name: string; type: 'pdf' | 'image' | 'ticket'; url: string; size?: string }) => Promise<{ success: boolean; error?: string }>;
  removeAttachmentFromDay: (dayId: string, attachmentId: string) => void;

  // Flights
  flights: FlightSegment[];
  addFlight: (flight: Omit<FlightSegment, 'id'>) => void;
  updateFlight: (id: string, updates: Partial<FlightSegment>) => void;
  deleteFlight: (id: string) => void;
  addFlightAttachment: (flightId: string, attachment: Omit<FlightAttachment, 'id'>) => void;
  removeFlightAttachment: (flightId: string, attachmentId: string) => void;

  // Car Rentals & Transportation
  carRentals: CarRentalBooking[];
  addCarRental: (rental: Omit<CarRentalBooking, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateCarRental: (id: string, updates: Partial<CarRentalBooking>) => Promise<{ success: boolean; error?: string }>;
  deleteCarRental: (id: string) => void;
  addCarRentalAttachment: (rentalId: string, attachment: Omit<CarRentalAttachment, 'id'>) => Promise<{ success: boolean; error?: string }>;
  removeCarRentalAttachment: (rentalId: string, attachmentId: string) => void;

  // Accommodations & Hotels / Airbnb
  accommodations: AccommodationBooking[];
  addAccommodation: (acc: Omit<AccommodationBooking, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateAccommodation: (id: string, updates: Partial<AccommodationBooking>) => Promise<{ success: boolean; error?: string }>;
  deleteAccommodation: (id: string) => Promise<{ success: boolean; error?: string }>;
  addAccommodationAttachment: (accId: string, attachment: Omit<AccommodationAttachment, 'id'>) => void;
  removeAccommodationAttachment: (accId: string, attachmentId: string) => void;
  syncAccommodationToDays: (acc: AccommodationBooking, removeOnly?: boolean, previousAcc?: AccommodationBooking) => Promise<{ success: boolean; error?: string }>;
  syncAccommodationsToSupabase: () => Promise<boolean>;
  reloadAccommodationsFromSupabase: () => Promise<boolean>;
  applySmartAccommodationRules: () => void;
  getDay1AccommodationTimeline: () => Day1AirportAccommodationTimeline | null;

  // Park Tickets & Passes (Individual & Combos)
  parkTickets: ParkTicketPurchase[];
  addParkTicket: (ticket: Omit<ParkTicketPurchase, 'id'>) => void;
  updateParkTicket: (id: string, updates: Partial<ParkTicketPurchase>) => void;
  deleteParkTicket: (id: string) => void;

  // Attraction Selections per Traveler
  attractionSelections: Record<string, boolean>;
  toggleAttractionSelection: (travelerId: string, parkId: string, attractionName: string) => void;

  // Preparations & Checklists
  prepDocuments: PreparationDocument[];
  toggleDocSubItem: (docId: string, subItemId: string, travelerId?: string) => void;
  toggleDocCompleted: (docId: string, travelerId?: string) => void;
  toggleAllPrepForTraveler: (travelerId: string, completedState?: boolean) => void;
  deletePrepDocument: (docId: string) => void;
  updatePrepDocument: (docId: string, updates: Partial<PreparationDocument>) => void;
  deletePrepTip: (docId: string, tipIndex: number) => void;
  addPrepDocument: (doc: Omit<PreparationDocument, 'id'>) => void;
  addPrepSubItem: (docId: string, subItemTitle: string) => void;
  deletePrepSubItem: (docId: string, subItemId: string) => void;
  updatePrepSubItem: (docId: string, subItemId: string, newTitle: string) => void;
  bookingMilestones: BookingMilestone[];
  toggleMilestoneCompleted: (milestoneId: string) => void;
  baggageItems: BaggageItem[];
  toggleBaggageItem: (id: string) => void;
  addBaggageItem: (item: Omit<BaggageItem, 'id'>) => void;
  updateBaggageItem: (item: BaggageItem) => void;
  deleteBaggageItem: (id: string) => void;
  toggleAllBaggageForTraveler: (travelerId: string, packedState?: boolean) => void;
  resetBaggageTemplateForTraveler: (travelerId: string, options?: Gender | BaggageTemplateOptions) => void;

  // Progress & Journey
  daysCountdown: number;
  overallProgress: {
    totalProgressPercent: number;
    checklistProgressPercent: number;
    financialProgressPercent: number;
  };

  // Live Collaboration & Sync
  syncNotifications: SyncNotification[];
  addNotification: (action: string) => void;
  importAiParsedData: (data: AiParsedData) => void;
  resetToDefaults: () => void;
  exportDataJSON: () => void;
  importDataJSON: (jsonString: string) => boolean;

  // UI state & Auth
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isOverviewModalOpen: boolean;
  setIsOverviewModalOpen: (open: boolean) => void;
  overviewCategory: 'all' | 'flights' | 'accommodations' | 'parks' | 'transport' | 'itinerary';
  setOverviewCategory: (category: 'all' | 'flights' | 'accommodations' | 'parks' | 'transport' | 'itinerary') => void;
  openOverviewModal: (category?: 'all' | 'flights' | 'accommodations' | 'parks' | 'transport' | 'itinerary') => void;
  closeOverviewModal: () => void;

  // Code & Email Auth Session Management
  authSession: AuthSession | null;
  isAccessModalOpen: boolean;
  setIsAccessModalOpen: (open: boolean) => void;
  loginWithCode: (email: string, code: string) => { success: boolean; message: string; tripId?: string; travelerName?: string };
  logoutCode: () => void;
  visibleTrips: Trip[];

  // Supabase Cloud Database Sync
  supabaseStatus: {
    connected: boolean;
    syncing: boolean;
    tablesExist: boolean;
    lastSynced: string | null;
    error: string | null;
  };
  syncAllToSupabase: () => Promise<boolean>;
  reloadFromSupabase: (silent?: boolean) => Promise<boolean>;
}

const PlannerContext = createContext<PlannerContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kingdom_compass_planner_data_v2';
const BACKUP_STORAGE_KEY = 'kingdom_compass_trip_emergency_backup_v1';

// Emergency LocalStorage backup helpers to guarantee 100% data preservation
export function saveTripEmergencyBackup(tripsToBackup: Trip[]) {
  if (tripsToBackup && tripsToBackup.length > 0) {
    try {
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(tripsToBackup));
    } catch (e) {}
  }
}

export function getTripEmergencyBackup(): Trip[] {
  try {
    const saved = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return [];
}

// Non-destructive merge of local and remote trips
// Non-destructive merge of local and remote trips with strict remote authority for persisted items
export function mergeLocalAndRemoteTrips(localList: Trip[], remoteList: Trip[]): Trip[] {
  if (!remoteList || remoteList.length === 0) return localList || [];
  if (!localList || localList.length === 0) return remoteList || [];

  const mergedMap = new Map<string, Trip>();

  // Inserir viagens puramente locais primeiro (ex: criadas offline e ainda não salvas no Supabase)
  const remoteTripIds = new Set(remoteList.map((r) => r && r.id).filter(Boolean));
  (localList || []).forEach((t) => {
    if (t && t.id && !remoteTripIds.has(t.id)) {
      mergedMap.set(t.id, t);
    }
  });

  // Para viagens existentes no Supabase, os dados remotos são a fonte de autoridade.
  // Cache local antigo NÃO pode ser fundido cegamente para não ressuscitar registros deletados.
  remoteList.forEach((rTrip) => {
    if (!rTrip || !rTrip.id) return;
    const localTrip = (localList || []).find((l) => l && l.id === rTrip.id);
    if (!localTrip) {
      mergedMap.set(rTrip.id, rTrip);
    } else {
      // Regra consistente para dados locais não salvos:
      // Apenas itens com marcador explícito de pendência (_isPendingSave) são mantidos para sincronização.
      const unsavedExpenses = (localTrip.expenses || []).filter((e: any) => e._isPendingSave);
      const unsavedFlights = (localTrip.flights || []).filter((f: any) => f._isPendingSave);
      const unsavedAccommodations = (localTrip.accommodations || []).filter((a: any) => a._isPendingSave);
      const unsavedCarRentals = (localTrip.carRentals || []).filter((c: any) => c._isPendingSave);
      const unsavedTickets = (localTrip.parkTickets || []).filter((t: any) => t._isPendingSave);

      const mergedRawDays = (rTrip.rawDays || []).map((rDay) => {
        const lDay = (localTrip.rawDays || []).find((ld) => ld.id === rDay.id || ld.dayNumber === rDay.dayNumber);
        const unsavedHourly = (lDay?.hourlySchedule || []).filter((h: any) => h._isPendingSave);
        return {
          ...rDay,
          hourlySchedule: unsavedHourly.length > 0
            ? deduplicateHourlySchedule([...(rDay.hourlySchedule || []), ...unsavedHourly])
            : (rDay.hourlySchedule || []),
        };
      });

      const merged: Trip = {
        ...localTrip,
        ...rTrip,
        expenses: unsavedExpenses.length > 0 ? [...(rTrip.expenses || []), ...unsavedExpenses] : (rTrip.expenses || []),
        flights: unsavedFlights.length > 0 ? [...(rTrip.flights || []), ...unsavedFlights] : (rTrip.flights || []),
        accommodations: unsavedAccommodations.length > 0 ? [...(rTrip.accommodations || []), ...unsavedAccommodations] : (rTrip.accommodations || []),
        carRentals: unsavedCarRentals.length > 0 ? [...(rTrip.carRentals || []), ...unsavedCarRentals] : (rTrip.carRentals || []),
        parkTickets: unsavedTickets.length > 0 ? [...(rTrip.parkTickets || []), ...unsavedTickets] : (rTrip.parkTickets || []),
        prepDocuments: rTrip.prepDocuments || [],
        rawDays: mergedRawDays.length > 0 ? mergedRawDays : (rTrip.rawDays || []),
      };
      mergedMap.set(rTrip.id, merged);
    }
  });

  return Array.from(mergedMap.values());
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Passagens: '#3B82F6',
  Hospedagem: '#EAB308',
  Ingressos: '#10B981',
  'Pacotes de Fotos': '#8B5CF6',
  Alimentação: '#EC4899',
  Transporte: '#06B6D4',
  Compras: '#F97316',
  Seguro: '#6366F1',
  Documentos: '#64748B',
};

export const PlannerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Trips state
  const [trips, setTrips] = useState<Trip[]>(() => {
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_trips_list_v3`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const loaded = parsed.map((t: Trip) => auditAndCorrectTrip({
            ...t,
            tripCode: t.tripCode || t.id.replace('trip-', '').toUpperCase(),
            travelers: t.travelers && t.travelers.length > 0 ? t.travelers : (t.settings?.travelers || []),
          }));
          saveTripEmergencyBackup(loaded);
          return loaded;
        }
      }
      const backup = getTripEmergencyBackup();
      if (backup.length > 0) return backup.map(auditAndCorrectTrip);
      return INITIAL_TRIPS.map(auditAndCorrectTrip);
    } catch {
      const backup = getTripEmergencyBackup();
      return (backup.length > 0 ? backup : INITIAL_TRIPS).map(auditAndCorrectTrip);
    }
  });

  const [activeTripId, setActiveTripId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_active_trip_id_v3`);
      if (saved) return saved;
      return '';
    } catch {
      return '';
    }
  });

  const activeTrip = useMemo(() => {
    return trips.find((t) => t.id === activeTripId) || trips[0] || null;
  }, [trips, activeTripId]);

  // Load active trip sub-states
  const [settings, setSettings] = useState<GlobalSettings>(activeTrip?.settings || INITIAL_SETTINGS);
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => deduplicateById(activeTrip?.expenses || []));
  const [rawDays, setRawDays] = useState<Omit<ItineraryDay, 'date'>[]>(() => {
    if (activeTrip?.rawDays && activeTrip.rawDays.length > 0) {
      return normalizeTripDays(activeTrip.rawDays, activeTrip.durationDays || activeTrip.rawDays.length);
    }
    return generateDaysForNewTrip(activeTrip?.durationDays || INITIAL_SETTINGS.durationDays);
  });
  const [prepDocuments, setPrepDocuments] = useState<PreparationDocument[]>(() => deduplicateById(activeTrip?.prepDocuments || INITIAL_PREPARATION_DOCS));
  const [bookingMilestones, setBookingMilestones] = useState<Omit<BookingMilestone, 'targetDate'>[]>(() => deduplicateById(activeTrip?.bookingMilestones || INITIAL_BOOKING_MILESTONES));
  const [baggageItems, setBaggageItems] = useState<BaggageItem[]>(() => deduplicateById(activeTrip?.baggageItems || INITIAL_BAGGAGE_ITEMS));
  const [flights, setFlights] = useState<FlightSegment[]>(() => deduplicateById(activeTrip?.flights || []));
  const [carRentals, setCarRentals] = useState<CarRentalBooking[]>(() => deduplicateById(activeTrip?.carRentals || []));
  const [accommodations, setAccommodations] = useState<AccommodationBooking[]>(() => deduplicateById(activeTrip?.accommodations || []));
  const [parkTickets, setParkTickets] = useState<ParkTicketPurchase[]>(() => deduplicateById(activeTrip?.parkTickets || []));

  const [attractionSelections, setAttractionSelections] = useState<Record<string, boolean>>(() => {
    if (activeTrip?.attractionSelections && Object.keys(activeTrip.attractionSelections).length > 0) {
      return activeTrip.attractionSelections;
    }
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_attraction_selections_v1`);
      if (saved) return JSON.parse(saved);
      return {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_attraction_selections_v1`, JSON.stringify(attractionSelections));
    } catch {}
  }, [attractionSelections]);

  const toggleAttractionSelection = useCallback((travelerId: string, parkId: string, attractionName: string) => {
    const key = `${travelerId}::${parkId}::${attractionName}`;
    const norm = normalizeAttractionName(attractionName);
    const normKey = `${travelerId}::${parkId}::${norm}`;

    setAttractionSelections((prev) => {
      const next = { ...prev };
      const currentlySelected = !!(next[key] || next[normKey]);
      const newSelected = !currentlySelected;
      if (newSelected) {
        next[key] = true;
        next[normKey] = true;
      } else {
        delete next[key];
        delete next[normKey];
      }
      if (activeTripId) {
        SupabaseService.saveAttractionSelection(activeTripId, travelerId, parkId, norm || attractionName, newSelected);
      }
      return next;
    });
  }, [activeTripId]);

  const [currencyView, setCurrencyView] = useState<'BRL' | 'USD'>('BRL');
  const [activeTab, setActiveTabState] = useState<string>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState<boolean>(false);
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState<boolean>(false);
  const [overviewCategory, setOverviewCategory] = useState<'all' | 'flights' | 'accommodations' | 'parks' | 'transport' | 'itinerary'>('all');

  const openOverviewModal = useCallback((category?: 'all' | 'flights' | 'accommodations' | 'parks' | 'transport' | 'itinerary') => {
    if (category) {
      setOverviewCategory(category);
    }
    setIsOverviewModalOpen(true);
  }, []);
  const closeOverviewModal = useCallback(() => setIsOverviewModalOpen(false), []);

  const [syncNotifications, setSyncNotifications] = useState<SyncNotification[]>([]);

  // Current logged in user object
  const currentUser: Traveler = useMemo(() => {
    const found = settings.travelers?.find((t) => t && t.id === settings.currentUserId);
    if (found) return found;
    if (settings.travelers && settings.travelers.length > 0 && settings.travelers[0]) {
      return settings.travelers[0];
    }
    return {
      id: 'default-user',
      name: 'Viajante',
      email: '',
      avatarColor: '#1A2B4C',
      role: 'traveler',
    };
  }, [settings.travelers, settings.currentUserId]);

  // Live Exchange Rate of the day (AwesomeAPI Dólar Comercial Oficial)
  const [liveExchangeRate, setLiveExchangeRate] = useState<ExchangeRateData | null>(null);
  const [isFetchingExchangeRate, setIsFetchingExchangeRate] = useState<boolean>(false);

  const refreshLiveExchangeRate = useCallback(async (autoApplyToTrip: boolean = true): Promise<{ success: boolean; isEstimate: boolean; data: ExchangeRateData | null }> => {
    setIsFetchingExchangeRate(true);
    try {
      const data = await fetchLiveExchangeRate();
      setLiveExchangeRate(data);
      if (data && data.isEstimate) {
        return { success: false, isEstimate: true, data };
      }
      if (autoApplyToTrip && data && data.rate > 0 && !data.isEstimate) {
        setSettings((prev) => ({
          ...prev,
          dollarRate: data.rate,
        }));
        return { success: true, isEstimate: false, data };
      }
      return { success: true, isEstimate: false, data };
    } catch (e) {
      console.warn('Erro ao consultar cotação do dia:', e);
      setLiveExchangeRate(null);
      return { success: false, isEstimate: false, data: null };
    } finally {
      setIsFetchingExchangeRate(false);
    }
  }, []);

  // Fetch exchange rate on initial load and periodically every 5 minutes
  useEffect(() => {
    refreshLiveExchangeRate(true);
    const interval = setInterval(() => {
      refreshLiveExchangeRate(true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshLiveExchangeRate]);

  const applyLiveRateToTrip = useCallback((forceEstimateConfirmation: boolean = false) => {
    if (liveExchangeRate && liveExchangeRate.rate > 0) {
      if (liveExchangeRate.isEstimate && !forceEstimateConfirmation) {
        console.warn('Tentativa de aplicar cotação estimada sem confirmação explícita.');
        return;
      }
      const newRate = liveExchangeRate.rate;
      const isEst = !!liveExchangeRate.isEstimate;
      setSettings((prev) => ({
        ...prev,
        dollarRate: newRate,
      }));
      setSyncNotifications((prev) => [
        {
          id: `rate-${Date.now()}`,
          travelerName: currentUser.name || 'Viajante',
          action: isEst
            ? `⚠️ Aplicou taxa estimada de R$ ${newRate.toFixed(2).replace('.', ',')} após confirmação explícita`
            : `💵 Atualizou o câmbio oficial da viagem para R$ ${newRate.toFixed(2).replace('.', ',')}`,
          timestamp: 'Agora',
        },
        ...prev,
      ]);
    }
  }, [liveExchangeRate, currentUser]);
  
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem('planner_auth_session_v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Supabase Cloud Database Status
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    syncing: boolean;
    tablesExist: boolean;
    lastSynced: string | null;
    error: string | null;
  }>({
    connected: false,
    syncing: false,
    tablesExist: false,
    lastSynced: null,
    error: null,
  });

  // Manual Sync All to Supabase
  const syncAllToSupabase = useCallback(async (): Promise<boolean> => {
    setSupabaseStatus((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      let success = true;
      for (const trip of trips) {
        const res = await SupabaseService.syncTripToSupabase(trip);
        if (!res.success) {
          success = false;
          setSupabaseStatus((prev) => ({ ...prev, error: res.error || 'Falha ao sincronizar viagem' }));
        }
      }
      if (success) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setSupabaseStatus((prev) => ({
          ...prev,
          connected: true,
          syncing: false,
          tablesExist: true,
          lastSynced: `Hoje às ${timeStr}`,
          error: null,
        }));
        setSyncNotifications((prev) => [
          {
            id: `sb-sync-${Date.now()}`,
            travelerName: currentUser.name || 'Sistema',
            action: '☁️ Sincronizou todos os dados com o Supabase com sucesso',
            timestamp: 'Agora',
          },
          ...prev,
        ]);
      } else {
        setSupabaseStatus((prev) => ({ ...prev, syncing: false }));
      }
      return success;
    } catch (err: any) {
      setSupabaseStatus((prev) => ({ ...prev, syncing: false, error: err?.message || 'Erro de conexão' }));
      return false;
    }
  }, [trips, currentUser]);

  // Reload data from Supabase
  const reloadFromSupabase = useCallback(async (silent: boolean = false): Promise<boolean> => {
    if (!silent) {
      setSupabaseStatus((prev) => ({ ...prev, syncing: true, error: null }));
    }
    try {
      const check = await checkSupabaseConnection();
      if (!check.ok || !check.tablesExist) {
        setSupabaseStatus((prev) => ({ ...prev, syncing: false, error: 'Conexão ou tabelas do Supabase não encontradas' }));
        return false;
      }

      const result = await SupabaseService.fetchAllTrips();
      if (!result || result.errors.length > 0) {
        const errorMsg = result?.errors?.length
          ? `Falha na leitura do Supabase: ${result.errors.map(e => `Tabela '${e.table}' (Viagem: ${e.tripId}): ${e.message}`).join('; ')}`
          : 'Falha ao carregar dados do Supabase. Dados locais preservados.';
        
        console.error('[Supabase Read Failure]:', result?.errors);
        setSupabaseStatus((prev) => ({
          ...prev,
          syncing: false,
          error: errorMsg,
        }));
        return false;
      }

      const remoteTrips = result.trips;
      if (remoteTrips && remoteTrips.length > 0) {
        setTrips((prevTrips) => {
          const merged = mergeLocalAndRemoteTrips(prevTrips, remoteTrips);
          saveTripEmergencyBackup(merged);
          return merged;
        });
        const currentActive = remoteTrips.find((t) => t.id === activeTripId) || remoteTrips[0];
        if (currentActive) {
          selectTrip(currentActive.id, currentActive);
        }
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setSupabaseStatus((prev) => ({
          ...prev,
          connected: true,
          syncing: false,
          tablesExist: true,
          lastSynced: `Hoje às ${timeStr}`,
          error: null,
        }));
        return true;
      } else if (remoteTrips.length === 0) {
        // Só trate o banco como realmente vazio quando a consulta de trips tiver sido concluída sem erro e retornar zero registros.
        // Nunca inicie sincronização de dados locais para o Supabase como consequência de uma falha de leitura.
        if (trips.length > 0) {
          for (const localT of trips) {
            await SupabaseService.syncTripToSupabase(localT);
          }
        }
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setSupabaseStatus((prev) => ({
          ...prev,
          connected: true,
          syncing: false,
          tablesExist: true,
          lastSynced: `Hoje às ${timeStr}`,
          error: null,
        }));
        return true;
      }
      setSupabaseStatus((prev) => ({ ...prev, syncing: false, error: 'Nenhum dado retornado do Supabase' }));
      return false;
    } catch (err: any) {
      setSupabaseStatus((prev) => ({ ...prev, syncing: false, error: err?.message || 'Erro ao carregar do Supabase' }));
      return false;
    }
  }, [activeTripId, trips]);

  // Initial Supabase connection check & load
  useEffect(() => {
    let isMounted = true;
    async function initSupabase() {
      const check = await checkSupabaseConnection();
      if (!isMounted) return;
      if (check.ok) {
        setSupabaseStatus((prev) => ({
          ...prev,
          connected: true,
          tablesExist: !!check.tablesExist,
          error: null,
        }));

        if (check.tablesExist) {
          const result = await SupabaseService.fetchAllTrips();
          if (!isMounted) return;
          if (!result || result.errors.length > 0) {
            const errorMsg = result?.errors?.length
              ? `Falha ao carregar tabelas do Supabase: ${result.errors.map(e => `${e.table} (${e.tripId}): ${e.message}`).join(', ')}`
              : 'Erro ao carregar dados do Supabase';
            setSupabaseStatus((prev) => ({ ...prev, error: errorMsg }));
            return;
          }

          const remoteTrips = result.trips;
          if (remoteTrips && remoteTrips.length > 0) {
            setTrips((prevTrips) => {
              const merged = mergeLocalAndRemoteTrips(prevTrips, remoteTrips);
              saveTripEmergencyBackup(merged);
              return merged;
            });
            const found = remoteTrips.find((t) => t.id === activeTripId) || remoteTrips[0];
            if (found) {
              selectTrip(found.id, found);

              setAuthSession((prevSession) => {
                if (prevSession && remoteTrips.some((t) => t.id === prevSession.tripId)) {
                  return prevSession;
                }
                const primaryTraveler = (found.travelers && found.travelers.length > 0 && found.travelers[0])
                  ? found.travelers[0]
                  : { id: 'primary-user', name: 'Organizador', email: 'organizador@viagem.com' };
                const newSession: AuthSession = {
                  email: primaryTraveler.email || 'organizador@viagem.com',
                  tripCode: found.tripCode || found.id,
                  tripId: found.id,
                  travelerName: primaryTraveler.name || 'Viajante',
                  authenticatedAt: new Date().toISOString(),
                };
                try {
                  localStorage.setItem('planner_auth_session_v1', JSON.stringify(newSession));
                } catch (e) {}
                return newSession;
              });
            }
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            setSupabaseStatus((prev) => ({
              ...prev,
              lastSynced: `Hoje às ${timeStr}`,
              error: null,
            }));
          } else if (remoteTrips.length === 0) {
            // If remote DB is empty, auto-push local trips if any exist
            if (trips.length > 0) {
              for (const localT of trips) {
                await SupabaseService.syncTripToSupabase(localT);
              }
            }
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            setSupabaseStatus((prev) => ({
              ...prev,
              lastSynced: `Hoje às ${timeStr}`,
              error: null,
            }));
          }
        }
      } else {
        setSupabaseStatus((prev) => ({
          ...prev,
          connected: false,
          error: check.message,
        }));
      }
    }

    initSupabase();

    return () => {
      isMounted = false;
    };
  }, []);

  // Note: Tab focus listener disabled to guarantee user editing is never interrupted

  const setActiveTab = useCallback((tab: string) => {
    if (tab === 'home') {
      setActiveTabState('home');
      return;
    }
    const isUnlocked = Boolean(
      trips.length > 0 &&
      activeTripId &&
      authSession &&
      trips.some((t) => t.id === activeTripId)
    );
    if (!isUnlocked) {
      setActiveTabState('home');
      return;
    }
    setActiveTabState(tab);
  }, [trips, activeTripId, authSession]);

  const visibleTrips = useMemo(() => {
    if (authSession && authSession.tripId) {
      const match = trips.filter((t) => t.id === authSession.tripId);
      if (match.length > 0) return match;
    }
    return trips;
  }, [trips, authSession]);

  const loginWithCode = (email: string, code: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim().toLowerCase();
    const normCode = cleanCode.replace(/[^a-z0-9]/g, '');

    // Combine current state trips and initial data trips to guarantee default trips exist
    const allKnownTrips = [...trips, ...INITIAL_TRIPS];

    const matchingTrip = allKnownTrips.find((t) => {
      const tCode = (t.tripCode || '').toLowerCase();
      const tId = (t.id || '').toLowerCase();
      const tCodeNorm = tCode.replace(/[^a-z0-9]/g, '');
      const tIdNorm = tId.replace(/[^a-z0-9]/g, '');

      return (
        tCode === cleanCode ||
        tId === cleanCode ||
        (normCode.length > 0 && (tCodeNorm === normCode || tIdNorm === normCode))
      );
    });

    if (!matchingTrip) {
      return {
        success: false,
        message: `Código de viagem "${code}" não foi encontrado. Verifique com o organizador se digitou o código correto.`,
      };
    }

    // Ensure matchingTrip is present in trips list
    setTrips((prevTrips) => {
      if (!prevTrips.some((p) => p.id === matchingTrip.id)) {
        return [...prevTrips, matchingTrip];
      }
      return prevTrips;
    });

    const travelersList = matchingTrip.travelers || matchingTrip.settings?.travelers || INITIAL_TRAVELERS;
    let matchingTraveler = travelersList.find(
      (t) => t.email && t.email.trim().toLowerCase() === cleanEmail
    );

    if (!matchingTraveler) {
      // Auto-register email as a traveler if they possess the valid trip code
      const namePart = cleanEmail.split('@')[0];
      const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      matchingTraveler = {
        id: generateUUID(),
        name: formattedName,
        email: cleanEmail,
        avatarColor: '#3B82F6',
        role: 'traveler',
      };

      const updatedTravelers = [...travelersList, matchingTraveler];
      matchingTrip.travelers = updatedTravelers;
      if (matchingTrip.settings) {
        matchingTrip.settings.travelers = updatedTravelers;
      }

      // Update travelers list in matchingTrip settings as well
      matchingTrip.travelersCount = updatedTravelers.length;
      if (matchingTrip.settings) {
        matchingTrip.settings.travelersCount = updatedTravelers.length;
      }

      // Sync and initialize basic preparation documents for the new user in this trip
      // We now use a per-traveler model: each traveler has their own set of preparation documents
      const currentTravelerIds = updatedTravelers.map((t) => t.id);
      
      // Separate existing documents into "per-traveler" and "shared" (if any)
      // For now, we'll assume all basic docs should exist for every traveler
      let nextDocs = [...(matchingTrip.prepDocuments || [])];

      // Ensure each traveler has the full set of INITIAL_PREPARATION_DOCS
      updatedTravelers.forEach(traveler => {
        INITIAL_PREPARATION_DOCS.forEach(baseDoc => {
          const exists = nextDocs.some(d => d.travelerId === traveler.id && d.title === baseDoc.title);
          if (!exists) {
            nextDocs.push({
              ...baseDoc,
              id: `${baseDoc.id}-${traveler.id}`,
              travelerId: traveler.id,
              // Reset status for new traveler
              status: 'Pendente',
              completed: false,
              completedByTravelers: { [traveler.id]: false },
              subItems: (baseDoc.subItems || []).map(s => ({
                ...s,
                completed: false,
                completedByTravelers: { [traveler.id]: false }
              }))
            });
          }
        });
      });

      // Cleanup documents for travelers who are no longer in the trip
      nextDocs = nextDocs.filter(d => !d.travelerId || currentTravelerIds.includes(d.travelerId));

      matchingTrip.prepDocuments = nextDocs;

      setTrips((prevTrips) =>
        prevTrips.map((p) =>
          p.id === matchingTrip.id
            ? {
                ...p,
                travelers: updatedTravelers,
                travelersCount: updatedTravelers.length,
                prepDocuments: nextDocs,
                settings: p.settings
                  ? { ...p.settings, travelers: updatedTravelers, travelersCount: updatedTravelers.length }
                  : undefined,
              }
            : p
        )
      );

      // Instantly persist the new traveler and updated preparation documents to Supabase
      SupabaseService.syncTripToSupabase(matchingTrip);
    }

    const newSession: AuthSession = {
      email: matchingTraveler.email,
      tripCode: matchingTrip.tripCode || matchingTrip.id,
      tripId: matchingTrip.id,
      travelerName: matchingTraveler.name,
      authenticatedAt: new Date().toISOString(),
    };

    setAuthSession(newSession);
    try {
      localStorage.setItem('planner_auth_session_v1', JSON.stringify(newSession));
    } catch (e) {}

    selectTrip(matchingTrip.id, matchingTrip);
    setSettings((prev) => ({
      ...prev,
      currentUserId: matchingTraveler.id,
    }));
    setActiveTabState('journey');

    setSyncNotifications((prev) => [
      {
        id: `auth-${Date.now()}`,
        travelerName: matchingTraveler.name,
        action: `🔑 Conectou-se à viagem via Código ${matchingTrip.tripCode || matchingTrip.id}`,
        timestamp: 'Agora',
      },
      ...prev,
    ]);

    return {
      success: true,
      message: `Acesso liberado! Bem-vindo(a), ${matchingTraveler.name}!`,
      tripId: matchingTrip.id,
      travelerName: matchingTraveler.name,
    };
  };

  const logoutCode = () => {
    setAuthSession(null);
    try {
      localStorage.removeItem('planner_auth_session_v1');
    } catch (e) {}
  };

  // Sync active trip sub-states back into trips array
  useEffect(() => {
    if (!activeTripId) return;
    setTrips((prevTrips) => {
      if (!prevTrips || prevTrips.length === 0) return prevTrips;
      return prevTrips.map((t) => {
        if (t.id === activeTripId) {
          return {
            ...t,
            tripName: settings.tripName,
            destination: settings.destination,
            startDate: settings.startDate,
            durationDays: settings.durationDays,
            isFlexibleDates: settings.isFlexibleDates ?? true,
            flexibleOutboundStart: settings.flexibleOutboundStart,
            flexibleOutboundEnd: settings.flexibleOutboundEnd,
            flexibleInboundStart: settings.flexibleInboundStart,
            flexibleInboundEnd: settings.flexibleInboundEnd,
            flexibleMinDays: settings.flexibleMinDays,
            flexibleMaxDays: settings.flexibleMaxDays,
            outboundFlexibility: settings.outboundFlexibility || '+/- 3 dias',
            inboundFlexibility: settings.inboundFlexibility || '+/- 3 dias',
            flexibilityNotes: settings.flexibilityNotes || '',
            travelers: settings.travelers,
            travelersCount: settings.travelers.length,
            dollarRate: settings.dollarRate,
            totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
            settings,
            expenses,
            rawDays,
            prepDocuments,
            bookingMilestones,
            baggageItems,
            flights,
            carRentals,
            accommodations,
            parkTickets,
            attractionSelections,
          };
        }
        return t;
      });
    });
  }, [settings, expenses, rawDays, prepDocuments, bookingMilestones, baggageItems, flights, carRentals, accommodations, parkTickets, attractionSelections, activeTripId]);

  // Save trips and active trip ID to localStorage
  useEffect(() => {
    try {
      if (trips.length === 0) {
        localStorage.removeItem(`${LOCAL_STORAGE_KEY}_trips_list_v3`);
        localStorage.removeItem(`${LOCAL_STORAGE_KEY}_active_trip_id_v3`);
      } else {
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_trips_list_v3`, JSON.stringify(trips));
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_active_trip_id_v3`, activeTripId);
      }
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }, [trips, activeTripId]);

  // Automatically synchronize rawDays length to match settings.durationDays
  // Auto-normalize accommodation locations in rawDays to strictly use the registered accommodation address
  useEffect(() => {
    if (!accommodations || accommodations.length === 0) return;
    
    setRawDays((prevDays) => {
      let hasChanges = false;
      const updatedDays = prevDays.map((d, index) => {
        if (!d.hourlySchedule || d.hourlySchedule.length === 0) return d;
        const calculatedDate = calculateDateOffset(settings.startDate, index);
        
        // Find accommodation for this day or primary
        const dayAcc = accommodations.find(
          (a) =>
            a.checkInDate &&
            a.checkOutDate &&
            calculatedDate >= a.checkInDate &&
            calculatedDate <= a.checkOutDate
        ) || accommodations[0];

        if (!dayAcc || !dayAcc.address || !dayAcc.address.trim()) return d;
        const targetAddress = dayAcc.address.trim();

        const newSchedule = d.hourlySchedule.map((item) => {
          const tLower = (item.title || '').toLowerCase();
          const lLower = (item.location || '').toLowerCase();
          const idLower = (item.id || '').toLowerCase();

          const isParkEvent =
            item.sourceType === 'park' ||
            item.sourceType === 'fastpass' ||
            item.sourceType === 'show' ||
            item.category === 'park' ||
            idLower.includes('auto-saida-parque') ||
            idLower.includes('auto-abertura') ||
            idLower.includes('auto-ida') ||
            idLower.includes('auto-estacionamento') ||
            idLower.includes('auto-carro') ||
            tLower.includes('fechamento de') ||
            tLower.includes('abertura oficial') ||
            tLower.includes('entrada antecipada');

          if (isParkEvent) return item;

          const isAccScheduleItem =
            item.sourceType === 'accommodation' ||
            idLower.startsWith('auto-inicio') ||
            (idLower.startsWith('auto-saida') && !idLower.includes('auto-saida-parque')) ||
            idLower.startsWith('auto-retorno') ||
            idLower.startsWith('auto-hotel') ||
            idLower.includes('hourly-acc-') ||
            tLower.includes('início do dia na acomodação') ||
            tLower.includes('inicio do dia na acomodação') ||
            tLower.includes('saída da acomodação') ||
            tLower.includes('saida da acomodacao') ||
            tLower.includes('fim do dia na acomodação') ||
            tLower.includes('retorno à acomodação') ||
            tLower.includes('retorno a acomodacao') ||
            tLower.includes('chegada e fim do dia na acomodação') ||
            tLower.includes('check-in') ||
            tLower.includes('check-out') ||
            lLower.includes(dayAcc.name.toLowerCase()) ||
            lLower.includes('modern retreat') ||
            lLower === 'hotel' ||
            lLower === 'acomodação' ||
            lLower === 'acomodacao' ||
            lLower === 'hospedagem';

          if (isAccScheduleItem && item.location !== targetAddress) {
            hasChanges = true;
            return {
              ...item,
              location: targetAddress,
            };
          }
          return item;
        });

        if (hasChanges) {
          return { ...d, hourlySchedule: newSchedule };
        }
        return d;
      });

      return hasChanges ? updatedDays : prevDays;
    });
  }, [accommodations, settings.startDate]);
  useEffect(() => {
    const requiredLength = Math.max(1, settings.durationDays);
    if (rawDays.length !== requiredLength) {
      setRawDays((currentDays) => {
        if (currentDays.length < requiredLength) {
          const addedDays = Array.from({ length: requiredLength - currentDays.length }, (_, i) => {
            const dayNum = currentDays.length + i + 1;
            let title = 'Sem Parque';
            if (dayNum === 1) {
              title = 'Chegada';
            } else if (dayNum === requiredLength && requiredLength > 1) {
              title = 'Partida';
            }
            return {
              id: generateUUID(),
              dayNumber: dayNum,
              title: title,
              park: 'Sem Parque' as any,
              completed: false,
              morning: { where: '', dining: '', notes: '' },
              afternoon: { where: '', dining: '', notes: '' },
              night: { where: '', dining: '', notes: '' },
              generalNotes: '',
              attachments: [],
            };
          });
          return normalizeTripDays([...currentDays, ...addedDays], requiredLength);
        } else if (currentDays.length > requiredLength) {
          return normalizeTripDays(currentDays.slice(0, requiredLength), requiredLength);
        }
        return currentDays;
      });
    }
  }, [settings.durationDays, rawDays.length, flights]);

  // Automatically normalize accommodation schedule items across rawDays to strictly use each registered accommodation's address
  useEffect(() => {
    if (!accommodations || accommodations.length === 0) return;

    setRawDays((prevDays) => {
      let hasChanges = false;
      const nextDays = prevDays.map((d) => {
        if (!d.hourlySchedule || d.hourlySchedule.length === 0) return d;
        let dayChanged = false;
        const nextSchedule = d.hourlySchedule.map((item) => {
          const tLower = (item.title || '').toLowerCase();
          const idLower = (item.id || '').toLowerCase();
          const sourceIdLower = (item.sourceId || '').toLowerCase();

          const isAccItem =
            item.sourceType === 'accommodation' ||
            idLower.startsWith('auto-inicio') ||
            idLower.startsWith('auto-saida') ||
            idLower.startsWith('auto-retorno') ||
            idLower.includes('hourly-acc-') ||
            tLower.includes('na acomodação') ||
            tLower.includes('na acomodacao') ||
            tLower.includes('da acomodação') ||
            tLower.includes('da acomodacao') ||
            tLower.includes('à acomodação') ||
            tLower.includes('a acomodacao') ||
            tLower.includes('check-in') ||
            tLower.includes('check-out');

          if (!isAccItem) return item;

          // Find specific accommodation matching item sourceId or name
          let matchingAcc = accommodations.find((a) => {
            if (!a) return false;
            if (a.id && (sourceIdLower.includes(a.id) || idLower.includes(a.id))) return true;
            if (a.name && tLower.includes(a.name.toLowerCase())) return true;
            return false;
          });

          // Fallback to active accommodation on day d.date
          if (!matchingAcc && d.date) {
            matchingAcc = accommodations.find((a) => a.checkInDate && a.checkOutDate && d.date! >= a.checkInDate && d.date! <= a.checkOutDate) || accommodations[0];
          }

          if (matchingAcc && matchingAcc.address && matchingAcc.address.trim()) {
            const expectedAddr = matchingAcc.address.trim();
            if (item.location !== expectedAddr) {
              dayChanged = true;
              hasChanges = true;
              return {
                ...item,
                location: expectedAddr,
              };
            }
          }
          return item;
        });

        if (dayChanged) {
          return { ...d, hourlySchedule: nextSchedule };
        }
        return d;
      });

      return hasChanges ? nextDays : prevDays;
    });
  }, [accommodations]);

  // Helper para verificar se uma hospedagem é considerada paga/confirmada
  const isAccommodationPaid = (status?: string): boolean => {
    if (!status) return true;
    const s = status.trim().toLowerCase();
    if (s.includes('pendente') || s.includes('falta pagar') || s.includes('previsão') || s.includes('não iniciado')) {
      return false;
    }
    return true; // 'Reservado / Confirmado', 'Pago', 'Confirmado', 'Concluído' etc. são considerados pagos
  };

  // Helper para verificar se uma locação de carro é considerada paga
  const isCarRentalPaid = (status?: string): boolean => {
    if (!status) return false;
    const s = status.trim().toLowerCase();
    if (s.includes('pendente') || s.includes('falta pagar') || s.includes('planejado') || s.includes('previsão')) {
      return false;
    }
    return s.includes('pago') || s.includes('confirmado') || s.includes('concluído') || s.includes('reservado');
  };

  // Função utilitária para reconciliar e garantir que todos os itens comprados (voos, hotéis, carros, ingressos)
  // estejam presentes na Tabela de Gastos central (expenses)
  const reconcileExpensesWithBookings = (
    currentExpenses: ExpenseItem[],
    flightsList: FlightSegment[],
    accommodationsList: AccommodationBooking[],
    carRentalsList: CarRentalBooking[],
    parkTicketsList: ParkTicketPurchase[],
    rate: number,
    cUser: Traveler,
    travelersList: Traveler[]
  ): ExpenseItem[] => {
    const updatedExpenses = [...currentExpenses];

    // 1. Ingressos de Parques
    parkTicketsList.forEach((ticket) => {
      const expId = generateDeterministicUUID('ticket-expense', ticket.id);
      const exists = updatedExpenses.some((e) => e.id === expId || e.id === `exp-ticket-${ticket.id}`);
      const usd = ticket.costUSD || 0;
      const brl = ticket.costBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
      const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

      if (brl > 0 || finalUsd > 0) {
        const isPaid = ticket.paymentStatus === 'Pago';
        const ticketTitle = `Ingresso: ${ticket.title || 'Ingresso de Parques'}`.trim();
        const parksStr = ticket.parksIncluded && ticket.parksIncluded.length > 0 ? ticket.parksIncluded.join(', ') : ticket.complex;
        const ticketTravelerIds = ticket.travelerIds || [];
        const isAll = ticketTravelerIds.includes('all') || ticketTravelerIds.length === 0 || (travelersList.length > 0 && ticketTravelerIds.length === travelersList.length);
        const selectedTravelerNames = isAll 
          ? 'Todos os Viajantes' 
          : travelersList.filter((t) => ticketTravelerIds.includes(t.id)).map((t) => t.name).join(', ');
        const qty = ticket.quantity || 1;
        const qtyText = `${qty} ${qty === 1 ? 'pacote/ingresso' : 'pacotes/ingressos'}`;
        const ticketNotes = `${ticket.type === 'combo' ? 'Combo Multi-Parques / Multi-Dias' : 'Ingresso Individual'} (${ticket.daysCount} ${ticket.daysCount === 1 ? 'dia' : 'dias'}${ticket.ticketOption ? ' - ' + ticket.ticketOption : ''}) | Parques: ${parksStr}${ticket.confirmationCode ? ' | Voucher: ' + ticket.confirmationCode : ''} | Qtd: ${qtyText} | Para: ${selectedTravelerNames}`;

        const expData: ExpenseItem = {
          id: expId,
          title: ticketTitle,
          category: 'Ingressos',
          estimatedValueUSD: finalUsd,
          estimatedValueBRL: brl,
          paidValueBRL: isPaid ? brl : 0,
          paidValueUSD: isPaid ? finalUsd : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: ticket.payerId || 'all',
          responsibleTravelerId: ticket.payerId || 'all',
          travelerIds: ticket.travelerIds || ['all'],
          sourceType: 'park_ticket',
          sourceId: ticket.id,
          excluded: false,
          notes: ticketNotes,
          updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          updatedBy: cUser.name || 'Sistema',
        };

        const existingIdx = updatedExpenses.findIndex((e) => e.id === expId || e.id === `exp-ticket-${ticket.id}`);
        if (existingIdx >= 0) {
          updatedExpenses[existingIdx] = {
            ...updatedExpenses[existingIdx],
            ...expData,
            id: updatedExpenses[existingIdx].id,
            excluded: updatedExpenses[existingIdx].excluded,
          };
        } else {
          updatedExpenses.push(expData);
        }
      }
    });

    // 2. Passagens Aéreas
    flightsList.forEach((flight) => {
      const expId = generateDeterministicUUID('flight-expense', flight.id);
      const usd = flight.ticketCostUSD || 0;
      const brl = flight.ticketCostBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
      const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

      if (brl > 0 || finalUsd > 0) {
        const isPaid = flight.status === 'Emitido / Confirmado' || flight.status === 'Check-in Realizado' || flight.status === 'Embarcado' || flight.status === 'Concluído';
        const flightTitle = `Passagem: ${flight.airline || 'Voo'} (${flight.typeLabel || 'Voo'}${flight.flightNumber ? ' ' + flight.flightNumber : ''})`.trim();
        const flightNotes = `Trecho: ${flight.originCity || flight.originAirport || 'Origem'} ➔ ${flight.destinationCity || flight.destinationAirport || 'Destino'}${flight.departureDate ? ' (' + flight.departureDate + ')' : ''}`;

        const expData: ExpenseItem = {
          id: expId,
          title: flightTitle,
          category: 'Passagens',
          estimatedValueUSD: finalUsd,
          estimatedValueBRL: brl,
          paidValueBRL: isPaid ? brl : 0,
          paidValueUSD: isPaid ? finalUsd : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: flight.payerId || 'all',
          responsibleTravelerId: flight.payerId || 'all',
          travelerIds: flight.travelerIds || ['all'],
          sourceType: 'flight',
          sourceId: flight.id,
          excluded: false,
          notes: flightNotes,
          updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          updatedBy: cUser.name || 'Sistema',
        };

        const existingIdx = updatedExpenses.findIndex((e) => e.id === expId || e.id === `exp-flight-${flight.id}`);
        if (existingIdx >= 0) {
          updatedExpenses[existingIdx] = {
            ...updatedExpenses[existingIdx],
            ...expData,
            id: updatedExpenses[existingIdx].id,
            excluded: updatedExpenses[existingIdx].excluded,
          };
        } else {
          updatedExpenses.push(expData);
        }
      }
    });

    // 3. Hospedagens
    accommodationsList.forEach((acc) => {
      const expId = generateDeterministicUUID('acc-expense', acc.id);
      const usd = acc.costUSD || 0;
      const brl = acc.costBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
      const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

      if (brl > 0 || finalUsd > 0) {
        const isPaid = isAccommodationPaid(acc.status);
        const accTitle = `Hospedagem: ${acc.name || 'Reserva de Hotel / Airbnb'}`.trim();
        const accNotes = `Check-in: ${acc.checkInDate || '---'} | Check-out: ${acc.checkOutDate || '---'}${acc.address ? ' (' + acc.address + ')' : ''}`;

        const expData: ExpenseItem = {
          id: expId,
          title: accTitle,
          category: 'Hospedagem',
          estimatedValueUSD: finalUsd,
          estimatedValueBRL: brl,
          paidValueBRL: isPaid ? brl : 0,
          paidValueUSD: isPaid ? finalUsd : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: acc.payerId || 'all',
          responsibleTravelerId: acc.payerId || 'all',
          travelerIds: acc.travelerIds || ['all'],
          sourceType: 'accommodation',
          sourceId: acc.id,
          excluded: false,
          notes: accNotes,
          updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          updatedBy: cUser.name || 'Sistema',
        };

        const existingIdx = updatedExpenses.findIndex((e) => e.id === expId || e.id === `exp-acc-${acc.id}` || e.sourceId === acc.id);
        if (existingIdx >= 0) {
          const prevExp = updatedExpenses[existingIdx];
          const finalPaid = isPaid || prevExp.status === 'Pago' || (prevExp.paidValueBRL || 0) > 0;
          updatedExpenses[existingIdx] = {
            ...prevExp,
            ...expData,
            id: prevExp.id,
            status: finalPaid ? 'Pago' : (prevExp.status === 'Parcial' ? 'Parcial' : 'Pendente'),
            paidValueBRL: finalPaid ? (prevExp.paidValueBRL && prevExp.paidValueBRL > 0 ? prevExp.paidValueBRL : brl) : 0,
            paidValueUSD: finalPaid ? (prevExp.paidValueUSD && prevExp.paidValueUSD > 0 ? prevExp.paidValueUSD : finalUsd) : 0,
            payerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevExp.payerId || expData.payerId),
            responsibleTravelerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevExp.responsibleTravelerId || expData.payerId),
            excluded: prevExp.excluded,
          };
        } else {
          updatedExpenses.push(expData);
        }
      }
    });

    // 4. Locações de Carro
    carRentalsList.forEach((rental) => {
      const expId = generateDeterministicUUID('car-expense', rental.id);
      const usd = rental.costUSD || 0;
      const brl = rental.costBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
      const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

      if (brl > 0 || finalUsd > 0) {
        const isPaid = isCarRentalPaid(rental.status);
        const rentalTitle = `Transporte: Aluguel de Carro (${rental.company || 'Locadora'})`.trim();
        const rentalNotes = `Período: ${rental.pickupDate || '---'} a ${rental.dropoffDate || '---'}${rental.category ? ' (' + rental.category + ')' : ''}`;

        const expData: ExpenseItem = {
          id: expId,
          title: rentalTitle,
          category: 'Transporte',
          estimatedValueUSD: finalUsd,
          estimatedValueBRL: brl,
          paidValueBRL: isPaid ? brl : 0,
          paidValueUSD: isPaid ? finalUsd : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: rental.payerId || 'all',
          responsibleTravelerId: rental.payerId || 'all',
          travelerIds: rental.travelerIds || ['all'],
          sourceType: 'car_rental',
          sourceId: rental.id,
          excluded: false,
          notes: rentalNotes,
          updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          updatedBy: cUser.name || 'Sistema',
        };

        const existingIdx = updatedExpenses.findIndex((e) => e.id === expId || e.id === `exp-car-${rental.id}` || e.sourceId === rental.id);
        if (existingIdx >= 0) {
          const prevExp = updatedExpenses[existingIdx];
          const finalPaid = isPaid || prevExp.status === 'Pago' || (prevExp.paidValueBRL || 0) > 0;
          updatedExpenses[existingIdx] = {
            ...prevExp,
            ...expData,
            id: prevExp.id,
            status: finalPaid ? 'Pago' : (prevExp.status === 'Parcial' ? 'Parcial' : 'Pendente'),
            paidValueBRL: finalPaid ? (prevExp.paidValueBRL && prevExp.paidValueBRL > 0 ? prevExp.paidValueBRL : brl) : 0,
            paidValueUSD: finalPaid ? (prevExp.paidValueUSD && prevExp.paidValueUSD > 0 ? prevExp.paidValueUSD : finalUsd) : 0,
            payerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevExp.payerId || expData.payerId),
            responsibleTravelerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevExp.responsibleTravelerId || expData.payerId),
            excluded: prevExp.excluded,
          };
        } else {
          updatedExpenses.push(expData);
        }
      }
    });

    return updatedExpenses;
  };

  const selectTrip = (tripId: string, overrideTrip?: Trip) => {
    const rawFound = overrideTrip || trips.find((t) => t.id === tripId);
    if (rawFound) {
      const found = auditAndCorrectTrip(rawFound);
      setActiveTripId(tripId);
      const tripStart = normalizeDateToYMD(found.startDate) || '2026-12-30';
      const tripSettings: GlobalSettings = {
        id: found.id,
        tripCode: found.tripCode || found.id,
        tripName: found.tripName,
        destination: found.destination,
        startDate: tripStart,
        durationDays: found.durationDays,
        isFlexibleDates: found.isFlexibleDates ?? false,
        flexibleOutboundStart: normalizeDateToYMD(found.flexibleOutboundStart || tripStart),
        flexibleOutboundEnd: normalizeDateToYMD(found.flexibleOutboundEnd || calculateDateOffset(tripStart, 7)),
        flexibleInboundStart: normalizeDateToYMD(found.flexibleInboundStart || calculateDateOffset(tripStart, found.durationDays)),
        flexibleInboundEnd: normalizeDateToYMD(found.flexibleInboundEnd || calculateDateOffset(tripStart, found.durationDays + 7)),
        flexibleMinDays: found.flexibleMinDays,
        flexibleMaxDays: found.flexibleMaxDays,
        outboundFlexibility: found.outboundFlexibility || 'Datas Fixas',
        inboundFlexibility: found.inboundFlexibility || 'Datas Fixas',
        flexibilityNotes: found.flexibilityNotes || '',
        travelers: found.travelers || [],
        travelersCount: found.travelers?.length || found.travelersCount || 1,
        dollarRate: found.dollarRate || 5.75,
        totalBudgetGoalBRL: found.totalBudgetGoalBRL || 75000,
        currentUserId: found.travelers?.[0]?.id || '1',
        ...found.settings,
      };
      setSettings(tripSettings);
      
      const currentTravelers = (found.travelers && found.travelers.length > 0) ? found.travelers : (tripSettings.travelers || []);
      const reconciledExpenses = reconcileExpensesWithBookings(
        found.expenses || [],
        found.flights || [],
        found.accommodations || [],
        found.carRentals || [],
        found.parkTickets || [],
        tripSettings.dollarRate || 5.75,
        currentUser,
        currentTravelers
      );
      setExpenses(reconciledExpenses);

      // Sincronizar com o Supabase se faltavam gastos derivados de voos/hotéis/ingressos
      if (reconciledExpenses.length !== (found.expenses || []).length && found.id) {
        SupabaseService.syncExpenses(found.id, reconciledExpenses, {
          ...found,
          travelers: currentTravelers,
        }).catch((e) => console.warn('Auto-sync docs in selectTrip:', e));
      }

      setRawDays(normalizeTripDays(found.rawDays, found.durationDays));
      const guaranteedDocs = ensurePreparationDocsForTravelers(
        currentTravelers,
        found.prepDocuments || INITIAL_PREPARATION_DOCS,
        found.id
      );
      setPrepDocuments(guaranteedDocs);

      // If missing docs were populated, sync to Supabase in background
      if (guaranteedDocs.length !== (found.prepDocuments || []).length) {
        SupabaseService.syncPrepDocuments(found.id, guaranteedDocs, {
          ...found,
          travelers: currentTravelers,
        }).catch((e) => console.warn('Auto-sync docs in selectTrip:', e));
      }
      setBookingMilestones(found.bookingMilestones || INITIAL_BOOKING_MILESTONES);
      setBaggageItems(found.baggageItems || INITIAL_BAGGAGE_ITEMS);
      setFlights(found.flights || []);
      setCarRentals(found.carRentals || []);
      setAccommodations(found.accommodations || []);
      setParkTickets(found.parkTickets || []);
      setAttractionSelections(found.attractionSelections || {});
    }
  };

  const addTrip = async (tripData: {
    tripName: string;
    destination: string;
    startDate: string;
    durationDays: number;
    isFlexibleDates: boolean;
    flexibleOutboundStart?: string;
    flexibleOutboundEnd?: string;
    flexibleInboundStart?: string;
    flexibleInboundEnd?: string;
    flexibleMinDays?: number;
    flexibleMaxDays?: number;
    outboundFlexibility: string;
    inboundFlexibility: string;
    flexibilityNotes?: string;
    totalBudgetGoalBRL?: number;
    dollarRate?: number;
    travelers: Traveler[];
  }): Promise<{ success: boolean; error?: string; tripId?: string; tripCode?: string; trip?: Trip }> => {
    const newId = generateUUID();
    const tripCode = `ORL-${Math.floor(1000 + Math.random() * 9000)}`;
    const normalizedStart = normalizeDateToYMD(tripData.startDate) || '2026-12-30';
    const flexOutStart = normalizeDateToYMD(tripData.flexibleOutboundStart || normalizedStart);
    const flexOutEnd = normalizeDateToYMD(tripData.flexibleOutboundEnd || calculateDateOffset(flexOutStart, 7));
    const flexInStart = normalizeDateToYMD(tripData.flexibleInboundStart || calculateDateOffset(flexOutStart, tripData.durationDays));
    const flexInEnd = normalizeDateToYMD(tripData.flexibleInboundEnd || calculateDateOffset(flexOutEnd, tripData.durationDays));

    const generatedDays = generateDaysForNewTrip(tripData.durationDays);
    const newSettings: GlobalSettings = {
      id: newId,
      tripCode: tripCode,
      tripName: tripData.tripName,
      destination: tripData.destination,
      startDate: normalizedStart,
      durationDays: tripData.durationDays,
      isFlexibleDates: tripData.isFlexibleDates,
      flexibleOutboundStart: flexOutStart,
      flexibleOutboundEnd: flexOutEnd,
      flexibleInboundStart: flexInStart,
      flexibleInboundEnd: flexInEnd,
      flexibleMinDays: tripData.flexibleMinDays,
      flexibleMaxDays: tripData.flexibleMaxDays,
      outboundFlexibility: tripData.outboundFlexibility,
      inboundFlexibility: tripData.inboundFlexibility,
      flexibilityNotes: tripData.flexibilityNotes,
      travelersCount: tripData.travelers.length,
      dollarRate: tripData.dollarRate || 5.75,
      totalBudgetGoalBRL: tripData.totalBudgetGoalBRL || 75000,
      travelers: tripData.travelers,
      currentUserId: tripData.travelers[0]?.id || '1',
    };

    const newTrip: Trip = {
      id: newId,
      tripCode: tripCode,
      tripName: tripData.tripName,
      destination: tripData.destination,
      startDate: normalizedStart,
      durationDays: tripData.durationDays,
      isFlexibleDates: tripData.isFlexibleDates,
      flexibleOutboundStart: flexOutStart,
      flexibleOutboundEnd: flexOutEnd,
      flexibleInboundStart: flexInStart,
      flexibleInboundEnd: flexInEnd,
      flexibleMinDays: tripData.flexibleMinDays,
      flexibleMaxDays: tripData.flexibleMaxDays,
      outboundFlexibility: tripData.outboundFlexibility,
      inboundFlexibility: tripData.inboundFlexibility,
      flexibilityNotes: tripData.flexibilityNotes,
      travelers: tripData.travelers,
      travelersCount: tripData.travelers.length,
      dollarRate: tripData.dollarRate || 5.75,
      totalBudgetGoalBRL: tripData.totalBudgetGoalBRL || 75000,
      createdAt: new Date().toISOString().split('T')[0],
      status: 'Planejando',
      coverTheme: 'from-[#1A2B4C] to-[#2A437E]',
      settings: newSettings,
      expenses: [],
      rawDays: generatedDays,
      prepDocuments: ensurePreparationDocsForTravelers(tripData.travelers, [], newId),
      bookingMilestones: INITIAL_BOOKING_MILESTONES.map((m) => ({
        ...m,
        completed: false,
      })),
      baggageItems: [],
      flights: [],
      carRentals: [],
      accommodations: [],
      parkTickets: [],
    };

    // Persist immediately to Supabase Cloud Database and await actual response
    setSupabaseStatus((prev) => ({ ...prev, syncing: true }));
    try {
      const res = await SupabaseService.syncTripToSupabase(newTrip);
      if (res.success) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setSupabaseStatus((prev) => ({
          ...prev,
          connected: true,
          tablesExist: true,
          syncing: false,
          lastSynced: `Hoje às ${timeStr}`,
          error: null,
        }));
        addNotification(`Viagem "${newTrip.tripName}" salva no Supabase com sucesso!`);

        setTrips((prev) => [newTrip, ...(prev || [])]);
        const mainTraveler = tripData.travelers?.[0] || { id: '1', name: 'Organizador', email: 'organizador@exemplo.com' };
        const newSession: AuthSession = {
          email: mainTraveler.email,
          tripCode: tripCode,
          tripId: newId,
          travelerName: mainTraveler.name,
          authenticatedAt: new Date().toISOString(),
        };

        setAuthSession(newSession);
        try {
          localStorage.setItem('planner_auth_session_v1', JSON.stringify(newSession));
        } catch (e) {}

        setActiveTripId(newId);
        setSettings(newSettings);
        setExpenses([]);
        setRawDays(generatedDays);
        setPrepDocuments(newTrip.prepDocuments);
        setBookingMilestones(INITIAL_BOOKING_MILESTONES);
        setBaggageItems(INITIAL_BAGGAGE_ITEMS);
        setFlights([]);
        setCarRentals([]);
        setAccommodations([]);
        setParkTickets([]);
        setActiveTabState('journey');

        return {
          success: true,
          tripId: newId,
          tripCode: newTrip.tripCode,
          trip: newTrip,
        };
      } else {
        setSupabaseStatus((prev) => ({
          ...prev,
          syncing: false,
          error: res.error || 'Erro ao salvar viagem no banco de dados Supabase',
        }));
        return {
          success: false,
          error: res.error || 'Falha ao sincronizar viagem no Supabase',
        };
      }
    } catch (err: any) {
      setSupabaseStatus((prev) => ({
        ...prev,
        syncing: false,
        error: err.message,
      }));
      return {
        success: false,
        error: err?.message || 'Erro inesperado na gravação da viagem',
      };
    }
  };

  const updateTrip = async (id: string, updates: Partial<Trip>): Promise<{ success: boolean; error?: string }> => {
    if (updates.startDate) {
      updates.startDate = normalizeDateToYMD(updates.startDate);
    }
    if (updates.returnDate) {
      updates.returnDate = normalizeDateToYMD(updates.returnDate);
    }
    if (updates.flexibleOutboundStart) {
      updates.flexibleOutboundStart = normalizeDateToYMD(updates.flexibleOutboundStart);
    }
    if (updates.flexibleOutboundEnd) {
      updates.flexibleOutboundEnd = normalizeDateToYMD(updates.flexibleOutboundEnd);
    }
    if (updates.flexibleInboundStart) {
      updates.flexibleInboundStart = normalizeDateToYMD(updates.flexibleInboundStart);
    }
    if (updates.flexibleInboundEnd) {
      updates.flexibleInboundEnd = normalizeDateToYMD(updates.flexibleInboundEnd);
    }

    const previousTrips = trips;
    const previousRawDays = rawDays;
    const previousSettings = settings;

    let tripToSync: Trip | null = null;

    setTrips((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const updatedTrip = { ...t, ...updates };
          if (updates.settings) {
            updatedTrip.settings = { ...t.settings, ...updates.settings };
          }

          const targetDuration = updatedTrip.durationDays || updatedTrip.settings?.durationDays || updatedTrip.rawDays?.length || 10;
          const tripStart = updatedTrip.startDate || updatedTrip.settings?.startDate || '2026-12-30';

          if (!updates.rawDays && updatedTrip.rawDays && updatedTrip.rawDays.length !== targetDuration) {
            let currentDays = updatedTrip.rawDays;
            if (currentDays.length < targetDuration) {
              const addedDays = Array.from({ length: targetDuration - currentDays.length }, (_, i) => {
                const dayNum = currentDays.length + i + 1;
                let title = 'Sem Parque';
                if (dayNum === 1) {
                  title = 'Chegada';
                } else if (dayNum === targetDuration && targetDuration > 1) {
                  title = 'Partida';
                }
                return {
                  id: generateUUID(),
                  dayNumber: dayNum,
                  date: calculateDateOffset(tripStart, dayNum - 1),
                  title: title,
                  park: 'Sem Parque' as any,
                  completed: false,
                  morning: { where: '', dining: '', notes: '' },
                  afternoon: { where: '', dining: '', notes: '' },
                  night: { where: '', dining: '', notes: '' },
                  generalNotes: '',
                  hourlySchedule: [],
                  attachments: [],
                };
              });
              currentDays = [...currentDays, ...addedDays];
            } else if (currentDays.length > targetDuration) {
              currentDays = currentDays.slice(0, targetDuration);
            }
            updatedTrip.rawDays = normalizeTripDays(currentDays, targetDuration, tripStart);
          } else if (!updatedTrip.rawDays || updatedTrip.rawDays.length === 0) {
            updatedTrip.rawDays = generateDaysForNewTrip(targetDuration, tripStart);
          }

          if (id === activeTripId) {
            setRawDays(updatedTrip.rawDays);
            setSettings((s) => ({
              ...s,
              ...(updates.tripName ? { tripName: updates.tripName } : {}),
              ...(updates.destination ? { destination: updates.destination } : {}),
              ...(updates.startDate ? { startDate: updates.startDate } : {}),
              ...(updates.returnDate ? { returnDate: updates.returnDate } : {}),
              ...(updates.durationDays ? { durationDays: updates.durationDays } : {}),
              ...(updates.isFlexibleDates !== undefined ? { isFlexibleDates: updates.isFlexibleDates } : {}),
              ...(updates.flexibleOutboundStart ? { flexibleOutboundStart: updates.flexibleOutboundStart } : {}),
              ...(updates.flexibleOutboundEnd ? { flexibleOutboundEnd: updates.flexibleOutboundEnd } : {}),
              ...(updates.flexibleInboundStart ? { flexibleInboundStart: updates.flexibleInboundStart } : {}),
              ...(updates.flexibleInboundEnd ? { flexibleInboundEnd: updates.flexibleInboundEnd } : {}),
              ...(updates.outboundFlexibility ? { outboundFlexibility: updates.outboundFlexibility } : {}),
              ...(updates.inboundFlexibility ? { inboundFlexibility: updates.inboundFlexibility } : {}),
              ...(updates.flexibilityNotes !== undefined ? { flexibilityNotes: updates.flexibilityNotes } : {}),
              ...(updates.travelers ? { travelers: updates.travelers, travelersCount: updates.travelers.length } : {}),
              ...(updates.dollarRate ? { dollarRate: updates.dollarRate } : {}),
              ...(updates.totalBudgetGoalBRL ? { totalBudgetGoalBRL: updates.totalBudgetGoalBRL } : {}),
            }));
          }

          tripToSync = updatedTrip;
          return updatedTrip;
        }
        return t;
      })
    );

    if (tripToSync) {
      const res = await SupabaseService.syncTripToSupabase(tripToSync);
      if (!res.success) {
        setTrips(previousTrips);
        if (id === activeTripId) {
          setRawDays(previousRawDays);
          setSettings(previousSettings);
        }
        return { success: false, error: res.error || 'Falha ao salvar alterações da viagem no Supabase' };
      }
      return { success: true };
    }
    return { success: true };
  };

  const deleteTrip = (id: string) => {
    const remaining = trips.filter((t) => t.id !== id);
    setTrips(remaining);

    // Delete directly from Supabase Cloud Database
    SupabaseService.deleteTrip(id).then((ok) => {
      if (ok) {
        addNotification('Viagem removida do Supabase');
      }
    });

    // End active session so user returns to the portal of entering or registering a trip
    setAuthSession(null);
    try {
      localStorage.removeItem('planner_auth_session_v1');
    } catch (e) {}

    // Navigate to home portal
    setActiveTab('home');

    if (remaining.length === 0) {
      setActiveTripId('');
      setSettings(INITIAL_SETTINGS);
      setExpenses([]);
      setRawDays([]);
      setPrepDocuments([]);
      setBookingMilestones([]);
      setBaggageItems([]);
      setFlights([]);
      setCarRentals([]);
      setAccommodations([]);
      setParkTickets([]);
    } else {
      const nextTrip = remaining[0];
      setActiveTripId(nextTrip.id);
      setSettings(nextTrip.settings || INITIAL_SETTINGS);
      setExpenses(nextTrip.expenses || []);
      setRawDays(nextTrip.rawDays || INITIAL_ITINERARY_DAYS);
      setPrepDocuments(nextTrip.prepDocuments || INITIAL_PREPARATION_DOCS);
      setBookingMilestones(nextTrip.bookingMilestones || INITIAL_BOOKING_MILESTONES);
      setBaggageItems(nextTrip.baggageItems || INITIAL_BAGGAGE_ITEMS);
      setFlights(nextTrip.flights || []);
      setCarRentals(nextTrip.carRentals || []);
      setAccommodations(nextTrip.accommodations || []);
      setParkTickets(nextTrip.parkTickets || []);
    }
  };

  const removeAllTrips = async () => {
    for (const t of trips) {
      await SupabaseService.deleteTrip(t.id);
    }
    setTrips([]);
    setActiveTripId('');
    setSettings(INITIAL_SETTINGS);
    setExpenses([]);
    setRawDays([]);
    setPrepDocuments([]);
    setBookingMilestones([]);
    setBaggageItems([]);
    setFlights([]);
    setCarRentals([]);
    setAccommodations([]);
    setParkTickets([]);
    setAuthSession(null);
    try {
      localStorage.removeItem(`${LOCAL_STORAGE_KEY}_trips_list_v3`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY}_active_trip_id_v3`);
      localStorage.removeItem('planner_auth_session_v1');
    } catch (e) {}
    setActiveTab('home');
    addNotification('Todas as viagens foram removidas com sucesso.');
  };

  const duplicateTrip = (id: string) => {
    const source = trips.find((t) => t.id === id);
    if (!source) return;
    const clonedId = `trip-${Date.now()}`;
    const clonedSettings: GlobalSettings = {
      ...source.settings,
      id: clonedId,
      tripName: `${source.tripName} (Cópia)`,
    };
    const clonedTrip: Trip = {
      ...source,
      id: clonedId,
      tripCode: `ORL-${Math.floor(1000 + Math.random() * 9000)}`,
      tripName: `${source.tripName} (Cópia)`,
      createdAt: new Date().toISOString().split('T')[0],
      settings: clonedSettings,
    };
    setTrips((prev) => [clonedTrip, ...prev]);

    // Save cloned trip directly to Supabase if tables exist
    if (supabaseStatus.tablesExist) {
      SupabaseService.syncTripToSupabase(clonedTrip).then((res) => {
        if (res.success) {
          addNotification(`Cópia da viagem salva no Supabase!`);
        }
      });
    }
  };

  // Broadcast channel for multi-tab notification sync
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('kingdom_compass_planner_sync');
      channel.onmessage = (event) => {
        if (event.data?.type === 'NOTIFICATION' && event.data?.action && event.data?.sender) {
          setSyncNotifications((prev) => [
            {
              id: String(Date.now()),
              travelerName: event.data.sender,
              action: event.data.action,
              timestamp: 'Agora mesmo',
            },
            ...prev.slice(0, 7),
          ]);
        }
      };
      return () => {
        channel.close();
      };
    }
  }, []);

  const broadcastChange = (actionText: string) => {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('kingdom_compass_planner_sync');
        channel.postMessage({
          type: 'NOTIFICATION',
          action: actionText,
          sender: currentUser.name,
        });
        channel.close();
      } catch (e) {
        // ignore
      }
    }
  };

  const addNotification = (action: string) => {
    const newNotif: SyncNotification = {
      id: String(Date.now()),
      travelerName: currentUser.name,
      action,
      timestamp: 'Agora mesmo',
    };
    setSyncNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
    broadcastChange(action);
  };

  // Dynamic calculation: Calculate Day Dates from Start Date & Auto-completion
  // Dynamic calculation: Calculate Day Dates from Start Date & Auto-completion
  // Exibe o estado persistido diretamente de rawDays sem gerar ou modificar horários durante a renderização
  const itineraryDays: ItineraryDay[] = useMemo(() => {
    return rawDays.map((day, index) => {
      const calculatedDate = calculateDateOffset(settings.startDate, index);
      const isPast = isDateInPast(calculatedDate, settings.isFlexibleDates);
      const isThemePark = isDayWithPark(day);

      return {
        ...day,
        date: calculatedDate,
        parkBooking: isThemePark ? day.parkBooking : undefined,
        completed: Boolean(day.completed || isPast),
        hourlySchedule: (day.hourlySchedule || []).slice().sort(compareScheduleItemOrder),
      };
    });
  }, [rawDays, settings.startDate, settings.isFlexibleDates]);

  // Dynamic calculation: Calculate Milestones Target Dates
  const fullMilestones: BookingMilestone[] = useMemo(() => {
    return bookingMilestones.map((m) => {
      // daysBeforeTrip means negative offset
      const targetDate = calculateDateOffset(settings.startDate, -m.daysBeforeTrip);
      return {
        ...m,
        targetDate,
      };
    });
  }, [bookingMilestones, settings.startDate]);

  // Dynamic calculation: Days Countdown
  const daysCountdown = useMemo(() => {
    try {
      const parsed = parseToYMD(settings.startDate);
      if (!parsed) return 0;
      const targetTime = new Date(parsed.year, parsed.month, parsed.day).getTime();
      const now = new Date();
      const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const diffTime = targetTime - todayTime;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch {
      return 0;
    }
  }, [settings.startDate]);

  // Dynamic calculation: Financial Summary & Rates
  const financialSummary = useMemo(() => {
    const rate = settings.dollarRate || 5.75;
    const numTravelers = Math.max(1, settings.travelersCount || 1);

    let totalEstimatedBRL = 0;
    let totalEstimatedUSD = 0;
    let totalPaidBRL = 0;

    const categoryMap: Record<ExpenseCategory, { estimatedBRL: number; paidBRL: number }> = {
      Passagens: { estimatedBRL: 0, paidBRL: 0 },
      Hospedagem: { estimatedBRL: 0, paidBRL: 0 },
      Ingressos: { estimatedBRL: 0, paidBRL: 0 },
      'Pacotes de Fotos': { estimatedBRL: 0, paidBRL: 0 },
      Alimentação: { estimatedBRL: 0, paidBRL: 0 },
      Compras: { estimatedBRL: 0, paidBRL: 0 },
      Transporte: { estimatedBRL: 0, paidBRL: 0 },
      Seguro: { estimatedBRL: 0, paidBRL: 0 },
      Documentos: { estimatedBRL: 0, paidBRL: 0 },
    };

    expenses.forEach((item) => {
      if (item.excluded) return;

      // Ensure consistent BRL and USD based on active dollar rate
      const itemEstBRL = item.estimatedValueUSD && item.estimatedValueUSD > 0
        ? item.estimatedValueUSD * rate
        : (item.estimatedValueBRL || 0);

      const itemEstUSD = item.estimatedValueUSD && item.estimatedValueUSD > 0
        ? item.estimatedValueUSD
        : (itemEstBRL > 0 ? itemEstBRL / rate : 0);

      const itemPaidBRL = item.paidValueBRL || 0;

      totalEstimatedBRL += itemEstBRL;
      totalEstimatedUSD += itemEstUSD;
      totalPaidBRL += itemPaidBRL;

      if (categoryMap[item.category]) {
        categoryMap[item.category].estimatedBRL += itemEstBRL;
        categoryMap[item.category].paidBRL += itemPaidBRL;
      }
    });

    const totalPendingBRL = Math.max(0, totalEstimatedBRL - totalPaidBRL);
    const costPerPersonBRL = totalEstimatedBRL / numTravelers;
    const costPerPersonUSD = totalEstimatedUSD / numTravelers;
    const paidPercentage = totalEstimatedBRL > 0 ? Math.round((totalPaidBRL / totalEstimatedBRL) * 100) : 0;

    const categoryTotals = (Object.keys(categoryMap) as ExpenseCategory[]).map((cat) => {
      const data = categoryMap[cat];
      const percentage = totalEstimatedBRL > 0 ? Math.round((data.estimatedBRL / totalEstimatedBRL) * 100) : 0;
      return {
        category: cat,
        estimatedBRL: data.estimatedBRL,
        paidBRL: data.paidBRL,
        percentage,
        color: CATEGORY_COLORS[cat] || '#64748B',
      };
    });

    return {
      totalEstimatedBRL,
      totalEstimatedUSD,
      totalPaidBRL,
      totalPendingBRL,
      costPerPersonBRL,
      costPerPersonUSD,
      paidPercentage,
      categoryTotals,
    };
  }, [expenses, settings.dollarRate, settings.travelersCount]);

  // Dynamic calculation: Overall Progress
  const overallProgress = useMemo(() => {
    // 1. Checklist progress: subitems in docs + bag items + milestones
    let totalChecklistItems = 0;
    let completedChecklistItems = 0;

    prepDocuments.forEach((doc) => {
      doc.subItems.forEach((sub) => {
        totalChecklistItems++;
        if (sub.completed) completedChecklistItems++;
      });
    });

    fullMilestones.forEach((m) => {
      totalChecklistItems++;
      if (m.completed) completedChecklistItems++;
    });

    baggageItems.forEach((b) => {
      totalChecklistItems++;
      if (b.packed) completedChecklistItems++;
    });

    const checklistProgressPercent =
      totalChecklistItems > 0 ? Math.round((completedChecklistItems / totalChecklistItems) * 100) : 0;

    // 2. Financial progress:
    const financialProgressPercent = financialSummary.paidPercentage;

    // Combined overall journey progress
    const totalProgressPercent = Math.round((checklistProgressPercent * 0.4) + (financialProgressPercent * 0.6));

    return {
      totalProgressPercent,
      checklistProgressPercent,
      financialProgressPercent,
    };
  }, [prepDocuments, fullMilestones, baggageItems, financialSummary.paidPercentage]);

  // Action handlers
  const updateModuleReadiness = useCallback((moduleKey: keyof ModuleReadiness, status: ModuleReadinessStatus) => {
    setSettings((prev) => {
      const currentReadiness = prev.moduleReadiness || {
        flights: 'pending',
        accommodations: 'pending',
        parks: 'pending',
        transport: 'pending',
        docs: 'pending',
      };
      const newReadiness: ModuleReadiness = {
        ...currentReadiness,
        [moduleKey]: status,
      };

      const updatedSettings = {
        ...prev,
        moduleReadiness: newReadiness,
      };

      if (activeTripId) {
        setTrips((prevTrips) =>
          prevTrips.map((t) =>
            t.id === activeTripId
              ? { ...t, moduleReadiness: newReadiness, settings: updatedSettings }
              : t
          )
        );
        SupabaseService.syncTripToSupabase({
          id: activeTripId,
          settings: updatedSettings,
          moduleReadiness: newReadiness,
        } as any);
      }

      return updatedSettings;
    });

    const statusLabels: Record<ModuleReadinessStatus, string> = {
      ready: '🟢 Tudo Pronto & Confirmado',
      pending: '🟡 Ainda Falta Algo / Em Andamento',
      not_needed: '⚪ Não se Aplica',
    };
    const moduleNames: Record<string, string> = {
      flights: 'Passagens Aéreas',
      accommodations: 'Hospedagem',
      parks: 'Ingressos & Parques',
      transport: 'Transporte / Carro',
      docs: 'Preparativos & Vistos',
    };

    addNotification(`Atualizou status de ${moduleNames[moduleKey] || moduleKey}: ${statusLabels[status]}`);
  }, [activeTripId]);

  const updateSettings = async (newSettings: Partial<GlobalSettings>): Promise<{ success: boolean; error?: string }> => {
    let nextDocs = prepDocuments;

    // 1. Travelers update: ensure each traveler has their own set of preparation documents
    if (newSettings.travelers) {
      const travelers = newSettings.travelers;
      nextDocs = ensurePreparationDocsForTravelers(travelers, prepDocuments, activeTripId || 'active-trip');
      setPrepDocuments(nextDocs);

      if (activeTripId) {
        SupabaseService.syncPrepDocuments(activeTripId, nextDocs, {
          id: activeTripId,
          travelers: travelers,
          ...settings,
          ...newSettings,
        } as Partial<Trip>).then((res) => {
          if (res.success) {
            console.log('Preparation documents successfully synced to Supabase for travelers:', travelers.map(t => t.name));
          } else {
            console.warn('Sync prep docs warning:', res.error);
          }
        });
      }
    }

    // 2. Duration change
    if (newSettings.durationDays && newSettings.durationDays !== settings.durationDays) {
      const newDur = Math.max(1, newSettings.durationDays);
      setRawDays((currentDays) => {
        let updatedDays = currentDays;
        if (currentDays.length < newDur) {
          const addedDays = Array.from({ length: newDur - currentDays.length }, (_, i) => {
            const dayNum = currentDays.length + i + 1;
            return {
              id: `day-${dayNum}-${Date.now()}`,
              dayNumber: dayNum,
              title: `Dia ${dayNum} - Roteiro Personalizado`,
              park: 'Parque / Atividade Livre' as any,
              completed: false,
              morning: { where: '', dining: '', notes: '' },
              afternoon: { where: '', dining: '', notes: '' },
              night: { where: '', dining: '', notes: '' },
              generalNotes: '',
              attachments: [],
            };
          });
          updatedDays = [...currentDays, ...addedDays];
        } else if (currentDays.length > newDur) {
          updatedDays = currentDays.slice(0, newDur);
        }
        
        if (activeTripId) {
          updateTrip(activeTripId, { rawDays: updatedDays });
        }
        return updatedDays;
      });
    }

    // 3. Dollar rate change
    if (newSettings.dollarRate && newSettings.dollarRate > 0 && newSettings.dollarRate !== settings.dollarRate) {
      const newRate = newSettings.dollarRate;
      setExpenses((prevExpenses) => {
        const updatedExpenses = prevExpenses.map((exp) => {
          if (exp.estimatedValueUSD && exp.estimatedValueUSD > 0) {
            return {
              ...exp,
              estimatedValueBRL: Math.round(exp.estimatedValueUSD * newRate * 100) / 100,
            };
          }
          return exp;
        });

        if (activeTripId) {
          updateTrip(activeTripId, { expenses: updatedExpenses });
        }
        return updatedExpenses;
      });
    }

    // 4. Update settings in local state
    setSettings((prev) => ({ ...prev, ...newSettings }));

    // 5. Update and sync active trip inside trips and trigger Supabase syncing
    if (activeTripId) {
      const syncRes = await updateTrip(activeTripId, {
        tripName: newSettings.tripName !== undefined ? newSettings.tripName : settings.tripName,
        destination: newSettings.destination !== undefined ? newSettings.destination : settings.destination,
        startDate: newSettings.startDate !== undefined ? newSettings.startDate : settings.startDate,
        returnDate: newSettings.returnDate !== undefined ? newSettings.returnDate : settings.returnDate,
        durationDays: newSettings.durationDays !== undefined ? newSettings.durationDays : settings.durationDays,
        isFlexibleDates: newSettings.isFlexibleDates !== undefined ? newSettings.isFlexibleDates : settings.isFlexibleDates,
        flexibleOutboundStart: newSettings.flexibleOutboundStart !== undefined ? newSettings.flexibleOutboundStart : settings.flexibleOutboundStart,
        flexibleOutboundEnd: newSettings.flexibleOutboundEnd !== undefined ? newSettings.flexibleOutboundEnd : settings.flexibleOutboundEnd,
        flexibleInboundStart: newSettings.flexibleInboundStart !== undefined ? newSettings.flexibleInboundStart : settings.flexibleInboundStart,
        flexibleInboundEnd: newSettings.flexibleInboundEnd !== undefined ? newSettings.flexibleInboundEnd : settings.flexibleInboundEnd,
        outboundFlexibility: newSettings.outboundFlexibility !== undefined ? newSettings.outboundFlexibility : settings.outboundFlexibility,
        inboundFlexibility: newSettings.inboundFlexibility !== undefined ? newSettings.inboundFlexibility : settings.inboundFlexibility,
        flexibilityNotes: newSettings.flexibilityNotes !== undefined ? newSettings.flexibilityNotes : settings.flexibilityNotes,
        travelers: newSettings.travelers !== undefined ? newSettings.travelers : settings.travelers,
        travelersCount: newSettings.travelersCount !== undefined ? newSettings.travelersCount : settings.travelersCount,
        dollarRate: newSettings.dollarRate !== undefined ? newSettings.dollarRate : settings.dollarRate,
        prepDocuments: nextDocs,
        settings: { ...settings, ...newSettings },
      });
      if (syncRes && syncRes.success === false) {
        return syncRes;
      }
    }

    addNotification('Alterou as configurações globais da viagem');
    return { success: true };
  };

  const updateTravelers = (travelers: Traveler[]) => {
    updateSettings({ travelers, travelersCount: travelers.length });
  };

  const setCurrentUser = (userId: string) => {
    setSettings((prev) => ({
      ...prev,
      currentUserId: userId,
    }));
    const traveler = settings.travelers.find((t) => t.id === userId);
    if (traveler) {
      addNotification(`Entrou como ${traveler.name}`);
    }
  };

  const addExpense = async (expense: Omit<ExpenseItem, 'id'>): Promise<{ success: boolean; error?: string; id?: string }> => {
    const id = `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newExp: ExpenseItem = {
      ...expense,
      id,
      updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      updatedBy: currentUser.name,
    };
    setExpenses((prev) => [newExp, ...prev]);
    setTrips((prevTrips) =>
      prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: [newExp, ...(t.expenses || [])] } : t))
    );
    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      try {
        const res = await SupabaseService.saveExpense(activeTripId, newExp, fallbackTrip);
        if (res && !res.success) {
          // Rollback optimistic state
          setExpenses((prev) => prev.filter((e) => e.id !== id));
          setTrips((prevTrips) =>
            prevTrips.map((t) =>
              t.id === activeTripId ? { ...t, expenses: (t.expenses || []).filter((e) => e.id !== id) } : t
            )
          );
          return { success: false, error: res.error || 'Falha ao salvar despesa no Supabase' };
        }
      } catch (err: any) {
        // Rollback optimistic state
        setExpenses((prev) => prev.filter((e) => e.id !== id));
        setTrips((prevTrips) =>
          prevTrips.map((t) =>
            t.id === activeTripId ? { ...t, expenses: (t.expenses || []).filter((e) => e.id !== id) } : t
          )
        );
        return { success: false, error: err?.message || 'Erro inesperado ao salvar despesa' };
      }
    }
    addNotification(`Adicionou gasto "${expense.title}"`);
    return { success: true, id };
  };

  const updateExpense = async (id: string, updates: Partial<ExpenseItem>): Promise<{ success: boolean; error?: string }> => {
    const prevItem = expenses.find((e) => e.id === id);
    if (!prevItem) {
      return { success: false, error: 'Despesa não encontrada' };
    }
    const updatedItem: ExpenseItem = {
      ...prevItem,
      ...updates,
      updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      updatedBy: currentUser.name,
    };

    setExpenses((prev) => prev.map((item) => (item.id === id ? updatedItem : item)));
    setTrips((prevTrips) =>
      prevTrips.map((t) =>
        t.id === activeTripId
          ? {
              ...t,
              expenses: (t.expenses || []).map((e) => (e.id === id ? updatedItem : e)),
            }
          : t
      )
    );

    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      try {
        const res = await SupabaseService.saveExpense(activeTripId, updatedItem, fallbackTrip);
        if (res && !res.success) {
          // Rollback optimistic update
          setExpenses((prev) => prev.map((item) => (item.id === id ? prevItem : item)));
          setTrips((prevTrips) =>
            prevTrips.map((t) =>
              t.id === activeTripId
                ? {
                    ...t,
                    expenses: (t.expenses || []).map((e) => (e.id === id ? prevItem : e)),
                  }
                : t
            )
          );
          return { success: false, error: res.error || 'Falha ao atualizar despesa no Supabase' };
        }
      } catch (err: any) {
        // Rollback optimistic update
        setExpenses((prev) => prev.map((item) => (item.id === id ? prevItem : item)));
        setTrips((prevTrips) =>
          prevTrips.map((t) =>
            t.id === activeTripId
              ? {
                  ...t,
                  expenses: (t.expenses || []).map((e) => (e.id === id ? prevItem : e)),
                }
              : t
          )
        );
        return { success: false, error: err?.message || 'Erro inesperado ao atualizar despesa' };
      }

      // Sincronizar de volta para a acomodação se o gasto for derivado de hospedagem
      const isAcc = (updatedItem as ExpenseItem).sourceType === 'accommodation' || id.startsWith('exp-acc-');
      const accSourceId = (updatedItem as ExpenseItem).sourceId || (id.startsWith('exp-acc-') ? id.replace('exp-acc-', '') : undefined);
      if (isAcc) {
        setAccommodations((prevAccs) => {
          let updatedAccList: AccommodationBooking[] = [];
          const next = prevAccs.map((acc) => {
            const matches = (accSourceId && acc.id === accSourceId) || generateDeterministicUUID('acc-expense', acc.id) === id;
            if (matches) {
              const newStatus = (updatedItem as ExpenseItem).status === 'Pago' ? 'Reservado / Confirmado' : ((updatedItem as ExpenseItem).status === 'Pendente' ? 'Pendente' : acc.status);
              const upAcc: AccommodationBooking = {
                ...acc,
                costBRL: (updatedItem as ExpenseItem).estimatedValueBRL ?? acc.costBRL,
                costUSD: (updatedItem as ExpenseItem).estimatedValueUSD ?? acc.costUSD,
                status: newStatus as any,
                payerId: (updatedItem as ExpenseItem).payerId,
                travelerIds: (updatedItem as ExpenseItem).travelerIds,
              };
              updatedAccList.push(upAcc);
              return upAcc;
            }
            return acc;
          });
          if (activeTripId && updatedAccList.length > 0) {
            updatedAccList.forEach((a) => SupabaseService.saveAccommodation(activeTripId, a, fallbackTrip));
          }
          return next;
        });
      }
    }
    addNotification(`Editou o item financeiro`);
    return { success: true };
  };

  const deleteExpense = (id: string) => {
    const item = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setTrips((prevTrips) =>
      prevTrips.map((t) =>
        t.id === activeTripId
          ? {
              ...t,
              expenses: (t.expenses || []).filter((e) => e.id !== id),
            }
          : t
      )
    );
    SupabaseService.deleteExpense(id);

    if (item) {
      const sourceType = item.sourceType;
      let sourceId = item.sourceId;

      if (!sourceId) {
        if (id.startsWith('exp-ticket-')) sourceId = id.replace('exp-ticket-', '');
        else if (id.startsWith('exp-flight-')) sourceId = id.replace('exp-flight-', '');
        else if (id.startsWith('exp-acc-')) sourceId = id.replace('exp-acc-', '');
        else if (id.startsWith('exp-car-')) sourceId = id.replace('exp-car-', '');
      }

      if (sourceId) {
        if (sourceType === 'park_ticket' || sourceType === 'ticket' || id.startsWith('exp-ticket-')) {
          deleteParkTicket(sourceId);
        } else if (sourceType === 'flight' || id.startsWith('exp-flight-')) {
          deleteFlight(sourceId);
        } else if (sourceType === 'accommodation' || id.startsWith('exp-acc-')) {
          deleteAccommodation(sourceId);
        } else if (sourceType === 'car_rental' || id.startsWith('exp-car-')) {
          deleteCarRental(sourceId);
        }
      }

      if (sourceType === 'photo_package' || item.title.toLowerCase().includes('pacote de fotos') || item.title.toLowerCase().includes('fotos')) {
        setRawDays((prevDays) =>
          prevDays.map((d) => {
            if (d.parkBooking) {
              const pkg = d.parkBooking.photoPackage;
              const hasPkg = d.parkBooking.hasPhotoPackage;
              if (
                hasPkg ||
                (pkg && (pkg.id === sourceId || pkg.id === id || item.title.toLowerCase().includes(pkg.name.toLowerCase())))
              ) {
                if (pkg?.id) {
                  SupabaseService.deleteParkPhotoPackage(pkg.id);
                }
                return {
                  ...d,
                  parkBooking: {
                    ...d.parkBooking,
                    hasPhotoPackage: false,
                    photoPackage: undefined,
                  },
                };
              }
            }
            return d;
          })
        );
        if (sourceId) {
          SupabaseService.deleteParkPhotoPackage(sourceId);
        }
        SupabaseService.deleteParkPhotoPackage(id);
        SupabaseService.deleteParkPhotoPackage(item.title);
        addNotification(`Removeu o pacote de fotos e limpou dos parques vinculados`);
      } else {
        addNotification(`Removeu o item "${item.title}"`);
      }
    }
  };

  const toggleExpenseExclusion = (id: string) => {
    let toggledItem: ExpenseItem | null = null;
    setExpenses((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          toggledItem = { ...e, excluded: !e.excluded };
          return toggledItem;
        }
        return e;
      })
    );
    setTrips((prevTrips) =>
      prevTrips.map((t) =>
        t.id === activeTripId
          ? {
              ...t,
              expenses: (t.expenses || []).map((e) => (e.id === id ? { ...e, excluded: !e.excluded } : e)),
            }
          : t
      )
    );
    if (activeTripId && toggledItem) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      SupabaseService.saveExpense(activeTripId, toggledItem, fallbackTrip);
    }
    addNotification(`Atualizou inclusão de custo no orçamento`);
  };

  const updateItineraryDay = async (id: string, updates: Partial<ItineraryDay>): Promise<{ success: boolean; error?: string }> => {
    // 1. Locate existing day in current rawDays synchronously
    let currentDay = rawDays.find((d) => d.id === id);
    if (!currentDay && updates.dayNumber) {
      currentDay = rawDays.find((d) => d.dayNumber === updates.dayNumber);
    }
    if (!currentDay) {
      console.warn(`[DIAGNÓSTICO] updateItineraryDay: Nenhuma correspondência válida com itinerary_days ID=${id}`);
      return { success: false, error: 'Dia do roteiro não encontrado' };
    }

    // Check if park is being removed, set to 'Sem Parque', or unlinked
    const isRemovingPark =
      updates.park === 'Sem Parque' ||
      updates.park === '' ||
      (updates.parkBooking === undefined && 'parkBooking' in updates);

    const isParkChanged = Boolean(
      currentDay &&
      updates.park &&
      updates.park !== 'Sem Parque' &&
      updates.park.trim().toLowerCase() !== (currentDay.park || '').trim().toLowerCase()
    );

    let finalUpdates = { ...updates };

    if (isRemovingPark && currentDay) {
      const dayDate = calculateDateOffset(settings.startDate, currentDay.dayNumber - 1);
      const activeAcc = accommodations.find((acc) => {
        if (!acc.checkInDate || !acc.checkOutDate) return false;
        return dayDate >= acc.checkInDate && dayDate <= acc.checkOutDate;
      });
      const accName = activeAcc ? activeAcc.name : '';
      const cleaned = clearParkReferencesFromDay(
        currentDay,
        rawDays.length,
        accName
      );

      // If a title was explicitly provided in updates (including 'Sem Parque'), ALWAYS respect it.
      // Only if no title was provided at all (updates.title === undefined or ''), fall back to cleaned.title
      const finalTitle = (updates.title !== undefined && updates.title.trim() !== '')
        ? updates.title.trim()
        : (cleaned.title || 'Sem Parque');

      finalUpdates = {
        ...cleaned,
        ...updates,
        park: updates.park !== undefined ? updates.park : 'Sem Parque',
        parkBooking: undefined,
        title: finalTitle,
        morning: updates.morning ? updates.morning : cleaned.morning,
        afternoon: updates.afternoon ? updates.afternoon : cleaned.afternoon,
        night: updates.night ? updates.night : cleaned.night,
        generalNotes: updates.generalNotes !== undefined ? updates.generalNotes : cleaned.generalNotes,
        hourlySchedule: updates.hourlySchedule !== undefined ? updates.hourlySchedule : cleaned.hourlySchedule,
      };
    } else if (updates.park && updates.park !== 'Sem Parque' && currentDay) {
      const isNonPark = isNonParkEvent(updates.park);

      if (isNonPark) {
        finalUpdates.parkBooking = undefined;
      } else if (!updates.parkBooking) {
        if (currentDay.parkBooking && currentDay.parkBooking.parkName === updates.park) {
          finalUpdates.parkBooking = currentDay.parkBooking;
        } else {
          finalUpdates.parkBooking = {
            id: currentDay.parkBooking?.id || `pb-${id}`,
            dayNumber: currentDay.dayNumber,
            date: currentDay.date,
            parkName: updates.park,
            parkHours: {
              openingTime: '09:00',
              closingTime: '21:00',
            },
            parkPassStatus: 'Previsão (Planejamento)',
            fastPasses: currentDay.parkBooking?.fastPasses || [],
            diningReservations: currentDay.parkBooking?.diningReservations || [],
            showsAndParades: currentDay.parkBooking?.showsAndParades || [],
          };
        }
      }

      // Only re-generate hourly schedule if the park actually changed and it's a theme park
      if (isParkChanged && !updates.hourlySchedule && !isNonPark) {
        const dayDate = calculateDateOffset(settings.startDate, currentDay.dayNumber - 1);
        const activeAcc = accommodations.find((acc) => {
          if (!acc.checkInDate || !acc.checkOutDate) return false;
          return dayDate >= acc.checkInDate && dayDate <= acc.checkOutDate;
        });
        const accName = activeAcc ? activeAcc.name : '';
        const pb = finalUpdates.parkBooking;
        finalUpdates.hourlySchedule = generateParkHourlySchedule(
          updates.park,
          pb?.parkHours?.openingTime || '09:00',
          pb?.parkHours?.closingTime || '21:00',
          pb?.parkHours?.earlyEntryTime,
          accName,
          currentDay.hourlySchedule || [],
          pb?.id,
          currentDay.dayNumber,
          activeAcc?.address || accName,
          currentDay,
          rawDays,
          settings?.destination,
          pb
        );
      }
    }

    // Always clean invalid accommodation/park items if no accommodation is booked or not a theme park
    const checkDate = currentDay ? calculateDateOffset(settings.startDate, currentDay.dayNumber - 1) : '';
    const dayAcc = accommodations.find((acc) => {
      if (!acc.checkInDate || !acc.checkOutDate) return false;
      return checkDate >= acc.checkInDate && checkDate <= acc.checkOutDate;
    });
    const hasAcc = Boolean(
      dayAcc &&
      dayAcc.name &&
      dayAcc.name.trim() &&
      dayAcc.name.trim().toLowerCase() !== 'hospedagem' &&
      dayAcc.name.trim().toLowerCase() !== 'nenhuma cadastrada'
    );
    const effectivePark = finalUpdates.park !== undefined ? finalUpdates.park : currentDay?.park || '';
    const isThemePark = isDayWithPark({ park: effectivePark, title: finalUpdates.title || currentDay?.title });
    if (!isThemePark) {
      finalUpdates.parkBooking = undefined;
    }

    const currentScheduleToClean = finalUpdates.hourlySchedule || currentDay?.hourlySchedule || [];
    finalUpdates.hourlySchedule = deduplicateHourlySchedule(
      cleanInvalidAutoItems(currentScheduleToClean, hasAcc, isThemePark, effectivePark)
    );

    const dayToSave: Omit<ItineraryDay, 'date'> = { ...currentDay, ...finalUpdates };

    // Se hourlySchedule foi fornecido explicitamente, respeitar exatamente os itens fornecidos
    if (updates.hourlySchedule !== undefined) {
      dayToSave.hourlySchedule = finalUpdates.hourlySchedule || [];
    } else if (isParkChanged) {
      const tripContext = { flights, accommodations, carRentals };
      const fullySyncedHourly = syncAllEventsToHourlySchedule(dayToSave, tripContext);
      dayToSave.hourlySchedule = fullySyncedHourly;
      finalUpdates.hourlySchedule = fullySyncedHourly;
    }

    // Snapshot prévio para reversão em caso de erro na gravação
    const prevRawDays = rawDays;
    const prevTrips = trips;

    // 2. Update rawDays state immediately
    setRawDays((prev) => {
      const exactIndex = prev.findIndex((d) => d.id === id);
      if (exactIndex !== -1) {
        const newArr = [...prev];
        newArr[exactIndex] = { ...prev[exactIndex], ...finalUpdates };
        return newArr;
      }
      if (finalUpdates.dayNumber) {
        const numIndex = prev.findIndex((d) => d.dayNumber === finalUpdates.dayNumber);
        if (numIndex !== -1) {
          const newArr = [...prev];
          newArr[numIndex] = { ...prev[numIndex], ...finalUpdates };
          return newArr;
        }
      }
      return prev.map((d) => (d.id === id ? { ...d, ...finalUpdates } : d));
    });

    // 3. Update trips list immediately
    setTrips((prevTrips) =>
      prevTrips.map((t) => {
        if (t.id === activeTripId) {
          const currentDays = t.rawDays || [];
          const updatedDays = currentDays.map((d) => {
            if (d.id === id || (updates.dayNumber && d.dayNumber === updates.dayNumber)) {
              return { ...d, ...finalUpdates };
            }
            return d;
          });
          return {
            ...t,
            rawDays: updatedDays,
          };
        }
        return t;
      })
    );

    // 4. Sincronização Supabase
    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      const saveRes = await SupabaseService.saveItineraryDay(activeTripId, dayToSave, fallbackTrip);
      if (!saveRes.success) {
        // Reverter alterações locais em caso de falha de gravação
        setRawDays(prevRawDays);
        setTrips(prevTrips);
        const errMsg = saveRes.error || 'Erro ao persistir no Supabase';
        addNotification(`❌ Falha ao salvar no banco: ${errMsg}. Alterações revertidas.`);
        return { success: false, error: errMsg };
      }
    }

    addNotification(`Atualizou o roteiro`);
    return { success: true };
  };

  const saveHourlyScheduleItem = useCallback(
    async (dayId: string, item: HourlyScheduleItem): Promise<boolean> => {
      const rowId = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
        ? item.id
        : generateUUID();
      const itemToSave: HourlyScheduleItem = { ...item, id: rowId };

      // Snapshot prévio para reversão em caso de erro no Supabase
      const previousRawDays = rawDays;
      const previousTrips = trips;

      // Atualização otimista
      setRawDays((prevDays) => {
        return prevDays.map((d) => {
          if (d.id === dayId) {
            const currentSched = d.hourlySchedule || [];
            const idx = currentSched.findIndex((i) => i.id === item.id || i.id === rowId);
            let nextSched: HourlyScheduleItem[];
            if (idx >= 0) {
              nextSched = [...currentSched];
              nextSched[idx] = itemToSave;
            } else {
              nextSched = [...currentSched, itemToSave];
            }
            nextSched.sort(compareScheduleItemOrder);
            return { ...d, hourlySchedule: nextSched };
          }
          return d;
        });
      });

      setTrips((prevTrips) =>
        prevTrips.map((t) => {
          if (t.id === activeTripId) {
            const currentDays = t.rawDays || [];
            const updatedDays = currentDays.map((d) => {
              if (d.id === dayId) {
                const currentSched = d.hourlySchedule || [];
                const idx = currentSched.findIndex((i) => i.id === item.id || i.id === rowId);
                let nextSched: HourlyScheduleItem[];
                if (idx >= 0) {
                  nextSched = [...currentSched];
                  nextSched[idx] = itemToSave;
                } else {
                  nextSched = [...currentSched, itemToSave];
                }
                nextSched.sort(compareScheduleItemOrder);
                return { ...d, hourlySchedule: nextSched };
              }
              return d;
            });
            return { ...t, rawDays: updatedDays };
          }
          return t;
        })
      );

      if (activeTripId) {
        const res = await SupabaseService.saveHourlyScheduleItem(activeTripId, dayId, itemToSave);
        if (!res.success) {
          // Reverter estado otimista imediatamente
          setRawDays(previousRawDays);
          setTrips(previousTrips);
          addNotification(`❌ Falha ao salvar horário: ${res.error || 'Erro no banco de dados'}. Alteração revertida.`);
          return false;
        }
        addNotification(`Horário "${itemToSave.title}" salvo com sucesso.`);
        return true;
      }
      return true;
    },
    [activeTripId, rawDays, trips]
  );

  const deleteHourlyScheduleItem = useCallback(
    async (dayId: string, itemId: string): Promise<boolean> => {
      // Snapshot prévio para reversão em caso de erro no Supabase
      const previousRawDays = rawDays;
      const previousTrips = trips;

      // Atualização otimista
      setRawDays((prevDays) => {
        return prevDays.map((d) => {
          if (d.id === dayId) {
            const nextSched = (d.hourlySchedule || []).filter((i) => i.id !== itemId);
            return { ...d, hourlySchedule: nextSched };
          }
          return d;
        });
      });

      setTrips((prevTrips) =>
        prevTrips.map((t) => {
          if (t.id === activeTripId) {
            const currentDays = t.rawDays || [];
            const updatedDays = currentDays.map((d) => {
              if (d.id === dayId) {
                const nextSched = (d.hourlySchedule || []).filter((i) => i.id !== itemId);
                return { ...d, hourlySchedule: nextSched };
              }
              return d;
            });
            return { ...t, rawDays: updatedDays };
          }
          return t;
        })
      );

      if (activeTripId) {
        const res = await SupabaseService.deleteHourlySchedule(itemId);
        if (!res.success) {
          // Reverter estado otimista imediatamente
          setRawDays(previousRawDays);
          setTrips(previousTrips);
          addNotification(`❌ Falha ao excluir horário: ${res.error || 'Erro no banco de dados'}. O item foi restaurado.`);
          return false;
        }
        addNotification(`Horário excluído com sucesso.`);
        return true;
      }
      return true;
    },
    [activeTripId, rawDays, trips]
  );

  const swapOrMoveParkDay = async (sourceDayNumber: number, targetDayNumber: number) => {
    if (sourceDayNumber === targetDayNumber) return;

    let sourceDayObj: ItineraryDay | null = null;
    let targetDayObj: ItineraryDay | null = null;
    let wasMutualSwap = false;
    let oldSourceParkName = '';
    let oldTargetParkName = '';

    setRawDays((prevDays) => {
      const sourceDay = prevDays.find((d) => d.dayNumber === sourceDayNumber);
      const targetDay = prevDays.find((d) => d.dayNumber === targetDayNumber);

      if (!sourceDay || !targetDay) return prevDays;

      oldSourceParkName = sourceDay.park || '';
      oldTargetParkName = targetDay.park || '';

      const sourceDate = calculateDateOffset(settings.startDate, sourceDayNumber - 1);
      const targetDate = calculateDateOffset(settings.startDate, targetDayNumber - 1);

      const targetHasPark = isDayWithPark(targetDay);
      wasMutualSwap = targetHasPark;

      // Separar itens com datas fixas de calendário (voos, check-in/out, aluguel de veículos)
      // dos itens e compromissos atrelados ao parque e roteiro
      const isFixedCalendarItem = (item: HourlyScheduleItem) => {
        const sType = item.sourceType;
        if (sType === 'flight' || sType === 'car_rental' || sType === 'accommodation') return true;
        const idLower = (item.id || '').toLowerCase();
        const tLower = (item.title || '').toLowerCase();
        if (
          idLower.includes('flight') ||
          idLower.includes('car-') ||
          idLower.includes('acc-') ||
          idLower.includes('checkout') ||
          idLower.includes('checkin') ||
          idLower.includes('auto-flight') ||
          idLower.includes('auto-car') ||
          idLower.includes('auto-acc')
        ) {
          return true;
        }
        if (
          tLower.includes('check-in') ||
          tLower.includes('check-out') ||
          tLower.includes('voo') ||
          tLower.includes('embarque') ||
          tLower.includes('desembarque') ||
          tLower.includes('retirada de carro') ||
          tLower.includes('devolução de carro') ||
          tLower.includes('devolucao de carro')
        ) {
          return true;
        }
        return false;
      };

      const sourceFixedItems = (sourceDay.hourlySchedule || []).filter(isFixedCalendarItem);
      const sourceMovableItems = (sourceDay.hourlySchedule || []).filter((item) => !isFixedCalendarItem(item));

      const targetFixedItems = (targetDay.hourlySchedule || []).filter(isFixedCalendarItem);
      const targetMovableItems = (targetDay.hourlySchedule || []).filter((item) => !isFixedCalendarItem(item));

      let updatedTargetDay: Omit<ItineraryDay, 'date'>;
      let updatedSourceDay: Omit<ItineraryDay, 'date'>;

      if (!targetHasPark) {
        // CENÁRIO 1: Destino livre (Sem Parque) -> TRANSFERÊNCIA DIRETA
        updatedTargetDay = {
          ...targetDay,
          park: sourceDay.park,
          title: sourceDay.title,
          morning: { ...sourceDay.morning },
          afternoon: { ...sourceDay.afternoon },
          night: { ...sourceDay.night },
          generalNotes: sourceDay.generalNotes || '',
          attachments: [...(sourceDay.attachments || [])],
          parkBooking: sourceDay.parkBooking
            ? {
                ...sourceDay.parkBooking,
                dayNumber: targetDayNumber,
                date: targetDate,
              }
            : undefined,
          hourlySchedule: [...targetFixedItems, ...sourceMovableItems],
        };

        const defaultSourceTitle =
          sourceDayNumber === 1
            ? 'Chegada'
            : sourceDayNumber === settings.durationDays && settings.durationDays > 1
            ? 'Partida'
            : 'Dia Livre / Sem Parque';

        updatedSourceDay = {
          ...sourceDay,
          park: 'Sem Parque',
          title: defaultSourceTitle,
          morning: { where: '', dining: '', notes: '' },
          afternoon: { where: '', dining: '', notes: '' },
          night: { where: '', dining: '', notes: '' },
          generalNotes: '',
          attachments: [],
          parkBooking: undefined,
          hourlySchedule: sourceFixedItems,
        };
      } else {
        // CENÁRIO 2: Destino já ocupado -> TROCA MÚTUA / PERMUTA
        updatedTargetDay = {
          ...targetDay,
          park: sourceDay.park,
          title: sourceDay.title,
          morning: { ...sourceDay.morning },
          afternoon: { ...sourceDay.afternoon },
          night: { ...sourceDay.night },
          generalNotes: sourceDay.generalNotes || '',
          attachments: [...(sourceDay.attachments || [])],
          parkBooking: sourceDay.parkBooking
            ? {
                ...sourceDay.parkBooking,
                dayNumber: targetDayNumber,
                date: targetDate,
              }
            : undefined,
          hourlySchedule: [...targetFixedItems, ...sourceMovableItems],
        };

        updatedSourceDay = {
          ...sourceDay,
          park: targetDay.park,
          title: targetDay.title,
          morning: { ...targetDay.morning },
          afternoon: { ...targetDay.afternoon },
          night: { ...targetDay.night },
          generalNotes: targetDay.generalNotes || '',
          attachments: [...(targetDay.attachments || [])],
          parkBooking: targetDay.parkBooking
            ? {
                ...targetDay.parkBooking,
                dayNumber: sourceDayNumber,
                date: sourceDate,
              }
            : undefined,
          hourlySchedule: [...sourceFixedItems, ...targetMovableItems],
        };
      }

      // Re-sincronizar eventos com a tabela de horários e regras de parque para ambos os dias
      const tripContext = { flights, accommodations, carRentals };
      updatedTargetDay.hourlySchedule = syncAllEventsToHourlySchedule(
        { ...updatedTargetDay, date: targetDate },
        tripContext
      );
      updatedSourceDay.hourlySchedule = syncAllEventsToHourlySchedule(
        { ...updatedSourceDay, date: sourceDate },
        tripContext
      );

      sourceDayObj = { ...updatedSourceDay, date: sourceDate };
      targetDayObj = { ...updatedTargetDay, date: targetDate };

      return prevDays.map((d) => {
        if (d.dayNumber === sourceDayNumber) return updatedSourceDay;
        if (d.dayNumber === targetDayNumber) return updatedTargetDay;
        return d;
      });
    });

    // Atualizar viagens no state
    setTrips((prevTrips) =>
      prevTrips.map((t) => {
        if (t.id === activeTripId) {
          const currentDays = t.rawDays || [];
          const updatedDays = currentDays.map((d) => {
            if (d.dayNumber === sourceDayNumber && sourceDayObj) {
              return { ...d, ...sourceDayObj };
            }
            if (d.dayNumber === targetDayNumber && targetDayObj) {
              return { ...d, ...targetDayObj };
            }
            return d;
          });
          return {
            ...t,
            rawDays: updatedDays,
          };
        }
        return t;
      })
    );

    // Salvar ambos os dias no Supabase
    if (activeTripId && sourceDayObj && targetDayObj) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      const [r1, r2] = await Promise.all([
        SupabaseService.saveItineraryDay(activeTripId, sourceDayObj, fallbackTrip),
        SupabaseService.saveItineraryDay(activeTripId, targetDayObj, fallbackTrip),
      ]);
      if (!r1.success || !r2.success) {
        const err = r1.error || r2.error || 'Erro de conexão no banco';
        addNotification(`❌ Falha ao salvar alteração de parque no banco: ${err}`);
      }
    }

    if (wasMutualSwap) {
      addNotification(`Trocou parques: Dia ${sourceDayNumber} (${oldTargetParkName}) ⇄ Dia ${targetDayNumber} (${oldSourceParkName})`);
    } else {
      addNotification(`Moveu o parque ${oldSourceParkName} do Dia ${sourceDayNumber} para o Dia ${targetDayNumber}`);
    }
  };

  const toggleDayCompleted = (id: string) => {
    setRawDays((prev) =>
      prev.map((day) => (day.id === id ? { ...day, completed: !day.completed } : day))
    );
    const day = rawDays.find((d) => d.id === id);
    addNotification(`Marcou o ${day ? `Dia ${day.dayNumber}` : 'Dia'} como ${!day?.completed ? 'concluído' : 'pendente'}`);
  };

  const addItineraryDay = () => {
    const newDayNum = rawDays.length + 1;
    const newDay: Omit<ItineraryDay, 'date'> = {
      id: generateUUID(),
      dayNumber: newDayNum,
      title: `Dia ${newDayNum} - Novo Dia Mágico`,
      park: 'Parque a Definir',
      completed: false,
      morning: { where: '', dining: '', notes: '' },
      afternoon: { where: '', dining: '', notes: '' },
      night: { where: '', dining: '', notes: '' },
      generalNotes: '',
      attachments: [],
    };
    setRawDays((prev) => [...prev, newDay]);
    setSettings((prev) => ({ ...prev, durationDays: newDayNum }));
    addNotification(`Adicionou o Dia ${newDayNum} ao roteiro`);
  };

  const deleteItineraryDay = (id: string) => {
    setRawDays((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      // re-number days
      return filtered.map((d, i) => ({ ...d, dayNumber: i + 1 }));
    });
    setSettings((prev) => ({ ...prev, durationDays: Math.max(1, prev.durationDays - 1) }));
    addNotification(`Removeu um dia do roteiro`);
  };

  const addAttachmentToDay = async (
    dayId: string,
    attachment: { name: string; type: 'pdf' | 'image' | 'ticket'; url: string; size?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const newAtt = {
      ...attachment,
      id: `att-${Date.now()}`,
      uploadedBy: currentUser.name,
      uploadedAt: new Date().toLocaleDateString('pt-BR'),
    };
    
    if (activeTripId) {
      try {
        const res = await SupabaseService.saveItineraryAttachment(activeTripId, dayId, newAtt);
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Não é possível salvar anexo: suporte de armazenamento indisponível no Supabase.' };
        }
        setRawDays((prev) =>
          prev.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  attachments: [...day.attachments, newAtt],
                }
              : day
          )
        );
        addNotification(`Anexou voucher "${attachment.name}"`);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message || 'Erro inesperado ao salvar anexo de roteiro' };
      }
    }

    setRawDays((prev) =>
      prev.map((day) =>
        day.id === dayId
          ? {
              ...day,
              attachments: [...day.attachments, newAtt],
            }
          : day
      )
    );
    addNotification(`Anexou voucher "${attachment.name}" (local)`);
    return { success: true };
  };

  const removeAttachmentFromDay = (dayId: string, attachmentId: string) => {
    setRawDays((prev) =>
      prev.map((day) =>
        day.id === dayId
          ? {
              ...day,
              attachments: day.attachments.filter((a) => a.id !== attachmentId),
            }
          : day
      )
    );
    addNotification('Removeu anexo do dia');
  };

  const toggleDocSubItem = (docId: string, subItemId: string, targetTravelerId?: string) => {
    const tId = targetTravelerId || currentUser?.id || '1';
    const updated = prepDocuments.map((doc) => {
      if (doc.id !== docId) return doc;
      
      const updatedSubs = doc.subItems.map((sub) => {
        if (sub.id !== subItemId) return sub;
        const currentCompletedForTraveler = Boolean(sub.completedByTravelers?.[tId]);
        const nextVal = !currentCompletedForTraveler;
        const updatedByTravelers = {
          ...(sub.completedByTravelers || {}),
          [tId]: nextVal,
        };
        return {
          ...sub,
          completedByTravelers: updatedByTravelers,
          completed: nextVal, // No per-traveler model, this is the traveler's status
        };
      });

      const allCompletedForTraveler = updatedSubs.every((s) => Boolean(s.completedByTravelers?.[tId]));
      const anyCompletedForTraveler = updatedSubs.some((s) => Boolean(s.completedByTravelers?.[tId]));

      const updatedDocByTravelers = {
        ...(doc.completedByTravelers || {}),
        [tId]: allCompletedForTraveler,
      };

      return {
        ...doc,
        subItems: updatedSubs,
        completedByTravelers: updatedDocByTravelers,
        completed: allCompletedForTraveler, // No per-traveler model, this is the traveler's status
        status: allCompletedForTraveler
          ? 'Concluído'
          : anyCompletedForTraveler
          ? 'Em andamento'
          : 'Pendente',
      };
    });

    setPrepDocuments(updated);
    addNotification('Atualizou checklist');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const toggleDocCompleted = (docId: string, targetTravelerId?: string) => {
    const tId = targetTravelerId || currentUser?.id || '1';
    const updated = prepDocuments.map((doc) => {
      if (doc.id !== docId) return doc;

      const currentVal = doc.subItems && doc.subItems.length > 0
        ? doc.subItems.every((s) => Boolean(s.completedByTravelers?.[tId]))
        : Boolean(doc.completedByTravelers?.[tId]);

      const nextState = !currentVal;

      const updatedSubs = (doc.subItems || []).map((s) => {
        const updatedByTravelers = {
          ...(s.completedByTravelers || {}),
          [tId]: nextState,
        };
        return {
          ...s,
          completedByTravelers: updatedByTravelers,
          completed: nextState,
        };
      });

      const updatedDocByTravelers = {
        ...(doc.completedByTravelers || {}),
        [tId]: nextState,
      };

      return {
        ...doc,
        subItems: updatedSubs,
        completedByTravelers: updatedDocByTravelers,
        completed: nextState,
        status: nextState ? 'Concluído' : 'Pendente',
      };
    });

    setPrepDocuments(updated);
    addNotification('Atualizou status');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const toggleAllPrepForTraveler = (travelerId: string, completedState?: boolean) => {
    const tId = travelerId || currentUser?.id || '1';

    const travelerDocs = prepDocuments.filter((d) => !d.travelerId || d.travelerId === tId);
    const isAllDone = travelerDocs.length > 0 && travelerDocs.every((doc) => {
      if (doc.subItems && doc.subItems.length > 0) {
        return doc.subItems.every((s) => Boolean(s.completedByTravelers?.[tId]));
      }
      return Boolean(doc.completedByTravelers?.[tId]);
    });

    const targetState = completedState !== undefined ? completedState : !isAllDone;

    const updated = prepDocuments.map((doc) => {
      if (doc.travelerId && doc.travelerId !== tId) return doc;

      const updatedSubs = (doc.subItems || []).map((s) => ({
        ...s,
        completedByTravelers: {
          ...(s.completedByTravelers || {}),
          [tId]: targetState,
        },
        completed: targetState,
      }));

      const updatedDocByTravelers = {
        ...(doc.completedByTravelers || {}),
        [tId]: targetState,
      };

      return {
        ...doc,
        subItems: updatedSubs,
        completedByTravelers: updatedDocByTravelers,
        completed: targetState,
        status: targetState ? ('Concluído' as const) : ('Pendente' as const),
      };
    });

    setPrepDocuments(updated);
    addNotification(targetState ? 'Todos os requisitos marcados como prontos' : 'Requisitos desmarcados');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const deletePrepDocument = (docId: string) => {
    const updated = prepDocuments.filter((doc) => doc.id !== docId);
    setPrepDocuments(updated);
    addNotification('Documento excluído com sucesso');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const updatePrepDocument = (docId: string, updates: Partial<PreparationDocument>) => {
    const updated = prepDocuments.map((doc) =>
      doc.id === docId ? { ...doc, ...updates } : doc
    );
    setPrepDocuments(updated);
    addNotification('Documento atualizado com sucesso');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const addPrepDocument = (doc: Omit<PreparationDocument, 'id'>) => {
    const newDoc: PreparationDocument = {
      ...doc,
      id: generateUUID(),
      createdByTravelerId: currentUser.id,
      subItems: doc.subItems || [],
      tips: doc.tips || [],
      links: doc.links || [],
    };
    const updated = [...prepDocuments, newDoc];
    setPrepDocuments(updated);
    addNotification('Novo documento de preparação adicionado');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const addPrepSubItem = (docId: string, subItemTitle: string) => {
    const updated = prepDocuments.map((doc) => {
      if (doc.id === docId) {
        const newSub: ChecklistSubItem = {
          id: generateUUID(),
          title: subItemTitle,
          completed: false,
          completedByTravelers: {},
        };
        return {
          ...doc,
          subItems: [...(doc.subItems || []), newSub],
        };
      }
      return doc;
    });
    setPrepDocuments(updated);
    addNotification('Novo subitem adicionado');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const deletePrepSubItem = (docId: string, subItemId: string) => {
    const updated = prepDocuments.map((doc) => {
      if (doc.id === docId) {
        return {
          ...doc,
          subItems: (doc.subItems || []).filter((s) => s.id !== subItemId),
        };
      }
      return doc;
    });
    setPrepDocuments(updated);
    addNotification('Subitem removido');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const updatePrepSubItem = (docId: string, subItemId: string, newTitle: string) => {
    const updated = prepDocuments.map((doc) => {
      if (doc.id === docId) {
        return {
          ...doc,
          subItems: (doc.subItems || []).map((s) => 
            s.id === subItemId ? { ...s, title: newTitle } : s
          ),
        };
      }
      return doc;
    });
    setPrepDocuments(updated);
    addNotification('Item do checklist atualizado');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };
  
  const deletePrepTip = (docId: string, tipIndex: number) => {
    const updated = prepDocuments.map((doc) => {
      if (doc.id === docId) {
        const newTips = [...(doc.tips || [])];
        newTips.splice(tipIndex, 1);
        return {
          ...doc,
          tips: newTips,
        };
      }
      return doc;
    });
    setPrepDocuments(updated);
    addNotification('Dica removida');

    if (activeTripId) {
      const activeTrip = trips.find((t) => t.id === activeTripId);
      SupabaseService.syncPrepDocuments(activeTripId, updated, activeTrip || undefined);
    }
  };

  const toggleMilestoneCompleted = (milestoneId: string) => {
    setBookingMilestones((prev) =>
      prev.map((m) => (m.id === milestoneId ? { ...m, completed: !m.completed } : m))
    );
    addNotification('Atualizou marco de reserva na timeline');
  };

  const toggleBaggageItem = (id: string) => {
    setBaggageItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, packed: !item.packed } : item));
      const toggledItem = updated.find((item) => item.id === id);
      if (toggledItem && activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripCode: settings.tripCode,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelersCount: settings.travelersCount,
          dollarRate: settings.dollarRate,
          totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
          status: settings.status,
          coverTheme: settings.coverTheme,
          travelers: settings.travelers || [],
        };
        SupabaseService.saveBaggageItem(activeTripId, toggledItem, fallbackTrip);
      }
      return updated;
    });
    addNotification('Atualizou item da mala');
  };

  const toggleAllBaggageForTraveler = (travelerId: string, packedState?: boolean) => {
    setBaggageItems((prev) => {
      const travelerItems = prev.filter((i) => i.travelerId === travelerId);
      const shouldPackAll = packedState !== undefined ? packedState : !travelerItems.every((i) => i.packed);
      const updated = prev.map((item) =>
        item.travelerId === travelerId ? { ...item, packed: shouldPackAll } : item
      );

      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripCode: settings.tripCode,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelersCount: settings.travelersCount,
          dollarRate: settings.dollarRate,
          totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
          status: settings.status,
          coverTheme: settings.coverTheme,
          travelers: settings.travelers || [],
        };
        SupabaseService.syncBaggageItems(activeTripId, updated, fallbackTrip);
      }
      return updated;
    });
    addNotification('Atualizou itens da mala');
  };

  const resetBaggageTemplateForTraveler = (
    travelerId: string,
    overrideOptionsOrGender?: Gender | BaggageTemplateOptions
  ) => {
    const traveler = (settings.travelers || []).find((t) => t.id === travelerId);
    const travelerName = traveler?.name || '';

    const detectedTrip = detectOrlandoWeatherFromTrip(settings.startDate, settings.durationDays || rawDays.length || 7);
    let gender: Gender = detectGenderByName(travelerName);
    let weather: WeatherCondition[] = detectedTrip.recommendedWeather;
    let days = detectedTrip.durationDays;
    let hasWashingMachine = false;

    // Detect if accommodations include washer/dryer, house or airbnb
    const accHasLaundry = (accommodations || []).some((acc) => {
      const isHouseOrAirbnb = acc.type === 'house' || acc.type === 'airbnb';
      const hasAmenity = (acc.amenities || []).some((amenity) =>
        /lavadora|secadora|máquina|maquina|laundry|lavanderia/i.test(amenity)
      );
      const hasInNotes = /lavadora|secadora|máquina|maquina|laundry|lavanderia/i.test(acc.notes || '');
      return isHouseOrAirbnb || hasAmenity || hasInNotes;
    });
    if (accHasLaundry) {
      hasWashingMachine = true;
    }

    if (typeof overrideOptionsOrGender === 'string') {
      gender = overrideOptionsOrGender;
    } else if (overrideOptionsOrGender && typeof overrideOptionsOrGender === 'object') {
      if (overrideOptionsOrGender.gender) gender = overrideOptionsOrGender.gender;
      if (overrideOptionsOrGender.weather && overrideOptionsOrGender.weather.length > 0) {
        weather = overrideOptionsOrGender.weather;
      }
      if (overrideOptionsOrGender.days && overrideOptionsOrGender.days > 0) {
        days = overrideOptionsOrGender.days;
      }
      if (typeof overrideOptionsOrGender.hasWashingMachine === 'boolean') {
        hasWashingMachine = overrideOptionsOrGender.hasWashingMachine;
      }
    }

    const starterTemplate = generateEssentialBaggageItems({
      gender,
      weather,
      days,
      hasWashingMachine,
    });

    setBaggageItems((prev) => {
      const otherTravelersItems = prev.filter((i) => i.travelerId !== travelerId);
      const newItems: BaggageItem[] = starterTemplate.map((item) => ({
        ...item,
        id: generateUUID(),
        travelerId,
      }));
      const updated = [...otherTravelersItems, ...newItems];

      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripCode: settings.tripCode,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelersCount: settings.travelersCount,
          dollarRate: settings.dollarRate,
          totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
          status: settings.status,
          coverTheme: settings.coverTheme,
          travelers: settings.travelers || [],
        };
        SupabaseService.syncBaggageItems(activeTripId, updated, fallbackTrip);
      }
      return updated;
    });

    const genderLabel = gender === 'female' ? 'Feminino' : 'Masculino';
    const weatherLabels = weather
      .map((w) => (w === 'hot' ? 'Quente ☀️' : w === 'cold' ? 'Frio ❄️' : 'Chuvoso 🌧️'))
      .join(', ');
    addNotification(`Carregou itens essenciais (${genderLabel}, ${weatherLabels}, ${days} dias) para ${travelerName || 'viajante'}`);
  };

  const addBaggageItem = (item: Omit<BaggageItem, 'id'>) => {
    const newItem: BaggageItem = {
      ...item,
      id: generateUUID(),
    };
    setBaggageItems((prev) => {
      const updated = [...prev, newItem];
      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripCode: settings.tripCode,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelersCount: settings.travelersCount,
          dollarRate: settings.dollarRate,
          totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
          status: settings.status,
          coverTheme: settings.coverTheme,
          travelers: settings.travelers || [],
        };
        SupabaseService.saveBaggageItem(activeTripId, newItem, fallbackTrip);
      }
      return updated;
    });
    addNotification(`Adicionou "${item.name}" na mala`);
  };

  const updateBaggageItem = (updatedItem: BaggageItem) => {
    setBaggageItems((prev) => {
      const updated = prev.map((item) => (item.id === updatedItem.id ? updatedItem : item));
      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripCode: settings.tripCode,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelersCount: settings.travelersCount,
          dollarRate: settings.dollarRate,
          totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
          status: settings.status,
          coverTheme: settings.coverTheme,
          travelers: settings.travelers || [],
        };
        SupabaseService.saveBaggageItem(activeTripId, updatedItem, fallbackTrip);
      }
      return updated;
    });
    addNotification(`Atualizou "${updatedItem.name}" na mala`);
  };

  const deleteBaggageItem = (id: string) => {
    setBaggageItems((prev) => prev.filter((i) => i.id !== id));
    SupabaseService.deleteBaggageItem(id);
  };

  // Helpers to synchronize flight, accommodation, and transportation expenses
  const syncFlightExpense = (flight: FlightSegment, rate: number) => {
    const expId = generateDeterministicUUID('flight-expense', flight.id);
    const usd = Number(flight.ticketCostUSD) || 0;
    const brl = Number(flight.ticketCostBRL) || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
    const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

    const statusLower = (flight.status || '').toLowerCase();
    const isPaid =
      statusLower.includes('emitido') ||
      statusLower.includes('confirmado') ||
      statusLower.includes('check-in') ||
      statusLower.includes('checkin') ||
      statusLower.includes('embarcado') ||
      statusLower.includes('concluído') ||
      statusLower.includes('concluido') ||
      statusLower === 'pago';

    const flightTitle = `Passagem: ${flight.airline || 'Voo'} (${flight.typeLabel || 'Voo'}${flight.flightNumber ? ' ' + flight.flightNumber : ''})`.trim();
    const flightNotes = `Trecho: ${flight.originCity || flight.originAirport || 'Origem'} ➔ ${flight.destinationCity || flight.destinationAirport || 'Destino'}${flight.departureDate ? ' (' + flight.departureDate + ')' : ''}`;

    const expData: ExpenseItem = {
      id: expId,
      title: flightTitle,
      category: 'Passagens',
      estimatedValueUSD: finalUsd,
      estimatedValueBRL: brl,
      paidValueBRL: isPaid ? brl : 0,
      paidValueUSD: isPaid ? finalUsd : 0,
      status: isPaid ? 'Pago' : 'Pendente',
      payerId: flight.payerId || 'all',
      responsibleTravelerId: flight.payerId || 'all',
      travelerIds: flight.travelerIds || ['all'],
      sourceType: 'flight',
      sourceId: flight.id,
      excluded: false,
      notes: flightNotes,
      updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      updatedBy: currentUser.name,
    };

    setExpenses((prev) => {
      let nextExpenses: ExpenseItem[];
      const existingIndex = prev.findIndex((e) => e.id === expId || e.sourceId === flight.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          title: flightTitle,
          estimatedValueUSD: finalUsd,
          estimatedValueBRL: brl,
          paidValueBRL: isPaid ? brl : 0,
          paidValueUSD: isPaid ? finalUsd : 0,
          status: isPaid ? 'Pago' : 'Pendente',
          payerId: expData.payerId,
          responsibleTravelerId: expData.responsibleTravelerId,
          travelerIds: expData.travelerIds,
          sourceType: 'flight',
          sourceId: flight.id,
          notes: flightNotes,
          updatedAt: expData.updatedAt,
          updatedBy: expData.updatedBy,
        };
        nextExpenses = updated;
      } else {
        nextExpenses = [expData, ...prev];
      }
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
      );
      return nextExpenses;
    });

    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      SupabaseService.saveExpense(activeTripId, expData, fallbackTrip);
    }
  };

  const syncAccommodationExpense = (acc: AccommodationBooking, rate: number) => {
    const expId = generateDeterministicUUID('acc-expense', acc.id);
    const usd = acc.costUSD || 0;
    const brl = acc.costBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
    const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

    const isPaid = isAccommodationPaid(acc.status);
    const accTitle = `Hospedagem: ${acc.name || 'Reserva de Hotel / Airbnb'}`.trim();
    const accNotes = `Check-in: ${acc.checkInDate || '---'} | Check-out: ${acc.checkOutDate || '---'}${acc.address ? ' (' + acc.address + ')' : ''}`;

    if (brl > 0 || finalUsd > 0) {
      const expData: ExpenseItem = {
      id: expId,
      title: accTitle,
      category: 'Hospedagem',
      estimatedValueUSD: finalUsd,
      estimatedValueBRL: brl,
      paidValueBRL: isPaid ? brl : 0,
      paidValueUSD: isPaid ? finalUsd : 0,
      status: isPaid ? 'Pago' : 'Pendente',
      payerId: acc.payerId || 'all',
      responsibleTravelerId: acc.payerId || 'all',
      travelerIds: acc.travelerIds || ['all'],
      sourceType: 'accommodation',
      sourceId: acc.id,
      excluded: false,
      notes: accNotes,
      updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      updatedBy: currentUser.name,
    };

    setExpenses((prev) => {
      let nextExpenses: ExpenseItem[];
      const existingIndex = prev.findIndex((e) => e.id === expId || e.id === `exp-acc-${acc.id}` || e.sourceId === acc.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const prevItem = updated[existingIndex];
        const finalPaid = isPaid || prevItem.status === 'Pago' || (prevItem.paidValueBRL || 0) > 0;
        updated[existingIndex] = {
          ...prevItem,
          title: accTitle,
          estimatedValueUSD: finalUsd > 0 ? finalUsd : (prevItem.estimatedValueUSD || 0),
          estimatedValueBRL: brl > 0 ? brl : (prevItem.estimatedValueBRL || 0),
          paidValueBRL: finalPaid ? (prevItem.paidValueBRL && prevItem.paidValueBRL > 0 ? prevItem.paidValueBRL : brl) : 0,
          paidValueUSD: finalPaid ? (prevItem.paidValueUSD && prevItem.paidValueUSD > 0 ? prevItem.paidValueUSD : finalUsd) : 0,
          status: finalPaid ? 'Pago' : (prevItem.status === 'Parcial' ? 'Parcial' : (isPaid ? 'Pago' : 'Pendente')),
          payerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevItem.payerId || expData.payerId),
          responsibleTravelerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevItem.responsibleTravelerId || expData.payerId),
          travelerIds: expData.travelerIds,
          sourceType: 'accommodation',
          sourceId: acc.id,
          notes: accNotes,
          updatedAt: expData.updatedAt,
          updatedBy: expData.updatedBy,
        };
        nextExpenses = updated;
      } else {
        nextExpenses = [expData, ...prev];
      }
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
      );
      return nextExpenses;
    });

      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelers: settings.travelers,
        };
        SupabaseService.saveExpense(activeTripId, expData, fallbackTrip);
      }
    } else {
      setExpenses((prev) => {
        const nextExpenses = prev.filter((e) => e.id !== expId && e.id !== `exp-acc-${acc.id}` && e.sourceId !== acc.id);
        setTrips((prevTrips) =>
          prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
        );
        return nextExpenses;
      });
      SupabaseService.deleteExpense(expId);
    }
  };

  const syncCarRentalExpense = async (rental: CarRentalBooking, rate: number): Promise<{ success: boolean; error?: string }> => {
    const expId = generateDeterministicUUID('car-expense', rental.id);
    const usd = rental.costUSD || 0;
    const brl = rental.costBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
    const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

    if (brl > 0 || finalUsd > 0) {
      const isPaid = isCarRentalPaid(rental.status);
      const rentalTitle = `Transporte: Aluguel de Carro (${rental.company || 'Locadora'})`.trim();
      const rentalNotes = `Período: ${rental.pickupDate || '---'} a ${rental.dropoffDate || '---'}${rental.category ? ' (' + rental.category + ')' : ''}`;

      const expData: ExpenseItem = {
        id: expId,
        title: rentalTitle,
        category: 'Transporte',
        estimatedValueUSD: finalUsd,
        estimatedValueBRL: brl,
        paidValueBRL: isPaid ? brl : 0,
        paidValueUSD: isPaid ? finalUsd : 0,
        status: isPaid ? 'Pago' : 'Pendente',
        payerId: rental.payerId || 'all',
        responsibleTravelerId: rental.payerId || 'all',
        travelerIds: rental.travelerIds || ['all'],
        sourceType: 'car_rental',
        sourceId: rental.id,
        excluded: false,
        notes: rentalNotes,
        updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        updatedBy: currentUser.name,
      };

      setExpenses((prev) => {
        let nextExpenses: ExpenseItem[];
        const existingIndex = prev.findIndex((e) => e.id === expId || e.id === `exp-car-${rental.id}` || e.sourceId === rental.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          const prevItem = updated[existingIndex];
          const finalPaid = isPaid || prevItem.status === 'Pago' || (prevItem.paidValueBRL || 0) > 0;
          updated[existingIndex] = {
            ...prevItem,
            title: rentalTitle,
            estimatedValueUSD: finalUsd,
            estimatedValueBRL: brl,
            paidValueBRL: finalPaid ? (prevItem.paidValueBRL && prevItem.paidValueBRL > 0 ? prevItem.paidValueBRL : brl) : 0,
            paidValueUSD: finalPaid ? (prevItem.paidValueUSD && prevItem.paidValueUSD > 0 ? prevItem.paidValueUSD : finalUsd) : 0,
            status: finalPaid ? 'Pago' : (prevItem.status === 'Parcial' ? 'Parcial' : 'Pendente'),
            payerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevItem.payerId || expData.payerId),
            responsibleTravelerId: expData.payerId && expData.payerId !== 'all' ? expData.payerId : (prevItem.responsibleTravelerId || expData.payerId),
            travelerIds: expData.travelerIds,
            sourceType: 'car_rental',
            sourceId: rental.id,
            notes: rentalNotes,
            updatedAt: expData.updatedAt,
            updatedBy: expData.updatedBy,
          };
          nextExpenses = updated;
        } else {
          nextExpenses = [expData, ...prev];
        }
        setTrips((prevTrips) =>
          prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
        );
        return nextExpenses;
      });

      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelers: settings.travelers,
        };
        const expRes = await SupabaseService.saveExpense(activeTripId, expData, fallbackTrip);
        if (expRes && !expRes.success) {
          return { success: false, error: expRes.error || 'Erro ao sincronizar despesa de locação de veículo' };
        }
      }
    } else {
      setExpenses((prev) => prev.filter((e) => e.id !== expId));
      if (activeTripId) {
        await SupabaseService.deleteExpense(expId);
      }
    }
    return { success: true };
  };

  // Flight Handlers
  const syncFlightToItineraryDays = (targetFlight?: FlightSegment) => {
    setRawDays((prevDays) => {
      const result = syncFlightsWithItineraryDays({
        days: prevDays,
        flights,
        accommodations,
        carRentals,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
      });

      if (result.newStartDate && result.newStartDate !== settings.startDate) {
        setSettings((s) => ({
          ...s,
          startDate: result.newStartDate!,
          durationDays: result.newDurationDays || s.durationDays,
        }));
      } else if (result.newDurationDays && result.newDurationDays !== settings.durationDays) {
        setSettings((s) => ({ ...s, durationDays: result.newDurationDays! }));
      }

      if (activeTripId) {
        result.updatedDays.forEach((dayToSave) => {
          SupabaseService.saveItineraryDay(activeTripId, dayToSave, activeTrip || undefined);
        });
      }

      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, rawDays: result.updatedDays } : t))
      );

      return result.updatedDays;
    });
  };

  const addFlight = (flight: Omit<FlightSegment, 'id'>) => {
    const newFlight: FlightSegment = {
      ...flight,
      id: generateUUID(),
      attachments: flight.attachments || [],
    };
    const nextFlights = [...flights, newFlight];
    setFlights(nextFlights);
    setTrips((prevTrips) =>
      prevTrips.map((t) => (t.id === activeTripId ? { ...t, flights: nextFlights } : t))
    );

    syncFlightExpense(newFlight, settings.dollarRate || 5.75);

    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripCode: settings.tripCode,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelersCount: settings.travelersCount,
        dollarRate: settings.dollarRate,
        totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
        status: settings.status,
        coverTheme: settings.coverTheme,
        travelers: settings.travelers || [],
      };
      SupabaseService.saveFlight(activeTripId, newFlight, fallbackTrip);
    }

    // Sincronizar todos os voos no roteiro diário
    setRawDays((prevDays) => {
      const result = syncFlightsWithItineraryDays({
        days: prevDays,
        flights: nextFlights,
        accommodations,
        carRentals,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
      });

      if (result.newStartDate && result.newStartDate !== settings.startDate) {
        setSettings((s) => ({
          ...s,
          startDate: result.newStartDate!,
          durationDays: result.newDurationDays || s.durationDays,
        }));
      } else if (result.newDurationDays && result.newDurationDays !== settings.durationDays) {
        setSettings((s) => ({ ...s, durationDays: result.newDurationDays! }));
      }

      if (activeTripId) {
        const promises = result.updatedDays.map((dayToSave, idx) => {
          const prevDay = prevDays[idx];
          const prevSched = prevDay?.hourlySchedule || [];
          const nextSched = dayToSave.hourlySchedule || [];
          const isAffected =
            JSON.stringify(prevSched) !== JSON.stringify(nextSched) ||
            prevDay?.title !== dayToSave.title;
          if (isAffected) {
            return SupabaseService.saveItineraryDay(activeTripId, dayToSave, activeTrip || undefined);
          }
          return Promise.resolve<{ success: boolean; error?: string }>({ success: true });
        });

        Promise.all(promises).then((results) => {
          const failed = results.find((r) => r && !r.success);
          if (failed) {
            addNotification(`❌ Falha ao salvar alterações da agenda no banco: ${failed.error}`);
          }
        });
      }

      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, rawDays: result.updatedDays } : t))
      );

      return result.updatedDays;
    });

    addNotification(`Adicionou ${flight.typeLabel || 'voo'} (${flight.flightNumber}) e sincronizou no roteiro`);
  };

  const updateFlight = (id: string, updates: Partial<FlightSegment>) => {
    let savedUpdated: FlightSegment | null = null;
    const nextFlights = flights.map((f) => {
      if (f.id === id) {
        const updated = { ...f, ...updates };
        savedUpdated = updated;
        return updated;
      }
      return f;
    });
    setFlights(nextFlights);
    setTrips((prevTrips) =>
      prevTrips.map((t) => (t.id === activeTripId ? { ...t, flights: nextFlights } : t))
    );

    if (savedUpdated) {
      syncFlightExpense(savedUpdated, settings.dollarRate || 5.75);
      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripCode: settings.tripCode,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelersCount: settings.travelersCount,
          dollarRate: settings.dollarRate,
          totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
          status: settings.status,
          coverTheme: settings.coverTheme,
          travelers: settings.travelers || [],
        };
        SupabaseService.saveFlight(activeTripId, savedUpdated, fallbackTrip);
      }
    }

    // Sincronizar no cronograma diário apenas os dias afetados
    setRawDays((prevDays) => {
      const result = syncFlightsWithItineraryDays({
        days: prevDays,
        flights: nextFlights,
        accommodations,
        carRentals,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
      });

      if (result.newStartDate && result.newStartDate !== settings.startDate) {
        setSettings((s) => ({
          ...s,
          startDate: result.newStartDate!,
          durationDays: result.newDurationDays || s.durationDays,
        }));
      } else if (result.newDurationDays && result.newDurationDays !== settings.durationDays) {
        setSettings((s) => ({ ...s, durationDays: result.newDurationDays! }));
      }

      if (activeTripId) {
        const promises = result.updatedDays.map((dayToSave, idx) => {
          const prevDay = prevDays[idx];
          const prevSched = prevDay?.hourlySchedule || [];
          const nextSched = dayToSave.hourlySchedule || [];
          const isAffected =
            JSON.stringify(prevSched) !== JSON.stringify(nextSched) ||
            prevDay?.title !== dayToSave.title;
          if (isAffected) {
            return SupabaseService.saveItineraryDay(activeTripId, dayToSave, activeTrip || undefined);
          }
          return Promise.resolve<{ success: boolean; error?: string }>({ success: true });
        });

        Promise.all(promises).then((results) => {
          const failed = results.find((r) => r && !r.success);
          if (failed) {
            addNotification(`❌ Falha ao salvar atualização do voo na agenda: ${failed.error}`);
          }
        });
      }

      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, rawDays: result.updatedDays } : t))
      );

      return result.updatedDays;
    });

    addNotification(`Atualizou informações do voo e sincronizou no roteiro`);
  };

  const deleteFlight = (id: string) => {
    const flight = flights.find((f) => f.id === id);
    const nextFlights = flights.filter((f) => f.id !== id);
    setFlights(nextFlights);
    setTrips((prevTrips) =>
      prevTrips.map((t) => (t.id === activeTripId ? { ...t, flights: nextFlights } : t))
    );

    const expId = generateDeterministicUUID('flight-expense', id);
    setExpenses((prev) => prev.filter((e) => e.id !== expId && e.sourceId !== id));

    SupabaseService.deleteFlight(id);
    SupabaseService.deleteExpense(expId);
    if (activeTripId) {
      SupabaseService.deleteHourlySchedulesBySource(activeTripId, id, 'flight');
    }

    // Re-sincronizar apenas os dias afetados
    setRawDays((prevDays) => {
      const result = syncFlightsWithItineraryDays({
        days: prevDays,
        flights: nextFlights,
        accommodations,
        carRentals,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
      });

      if (activeTripId) {
        const promises = result.updatedDays.map((dayToSave, idx) => {
          const prevDay = prevDays[idx];
          const prevSched = prevDay?.hourlySchedule || [];
          const nextSched = dayToSave.hourlySchedule || [];
          const isAffected =
            JSON.stringify(prevSched) !== JSON.stringify(nextSched) ||
            prevDay?.title !== dayToSave.title;
          if (isAffected) {
            return SupabaseService.saveItineraryDay(activeTripId, dayToSave, activeTrip || undefined);
          }
          return Promise.resolve<{ success: boolean; error?: string }>({ success: true });
        });

        Promise.all(promises).then((results) => {
          const failed = results.find((r) => r && !r.success);
          if (failed) {
            addNotification(`❌ Falha ao salvar remoção do voo na agenda: ${failed.error}`);
          }
        });
      }

      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, rawDays: result.updatedDays } : t))
      );

      return result.updatedDays;
    });

    if (flight) {
      addNotification(`Removeu o voo ${flight.flightNumber} e atualizou o roteiro`);
    }
  };

  const addFlightAttachment = (
    flightId: string,
    attachment: Omit<FlightAttachment, 'id'>
  ) => {
    const newAtt: FlightAttachment = {
      ...attachment,
      id: `att-flt-${Date.now()}`,
      uploadedAt: new Date().toLocaleDateString('pt-BR'),
    };
    let updatedFlight: FlightSegment | null = null;
    setFlights((prev) => {
      const nextFlights = prev.map((f) => {
        if (f.id === flightId) {
          const updated = {
            ...f,
            attachments: [...(f.attachments || []), newAtt],
          };
          updatedFlight = updated;
          return updated;
        }
        return f;
      });
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, flights: nextFlights } : t))
      );
      return nextFlights;
    });

    if (activeTripId && updatedFlight) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripCode: settings.tripCode,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelersCount: settings.travelersCount,
        dollarRate: settings.dollarRate,
        totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
        status: settings.status,
        coverTheme: settings.coverTheme,
        travelers: settings.travelers || [],
      };
      SupabaseService.saveFlight(activeTripId, updatedFlight, fallbackTrip);
    }

    addNotification(`Anexou comprovante no voo`);
  };

  const removeFlightAttachment = (flightId: string, attachmentId: string) => {
    let updatedFlight: FlightSegment | null = null;
    setFlights((prev) => {
      const nextFlights = prev.map((f) => {
        if (f.id === flightId) {
          const updated = {
            ...f,
            attachments: (f.attachments || []).filter((a) => a.id !== attachmentId),
          };
          updatedFlight = updated;
          return updated;
        }
        return f;
      });
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, flights: nextFlights } : t))
      );
      return nextFlights;
    });

    if (activeTripId && updatedFlight) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripCode: settings.tripCode,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelersCount: settings.travelersCount,
        dollarRate: settings.dollarRate,
        totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
        status: settings.status,
        coverTheme: settings.coverTheme,
        travelers: settings.travelers || [],
      };
      SupabaseService.saveFlight(activeTripId, updatedFlight, fallbackTrip);
    }

    addNotification(`Removeu anexo do voo`);
  };

  // Car Rental Handlers
  const syncCarRentalToItineraryDays = async (rental: CarRentalBooking): Promise<{ success: boolean; error?: string }> => {
    const pickupDate = rental.pickupDate || settings.startDate;
    const dropoffDate = rental.dropoffDate || rental.pickupDate || settings.startDate;

    const pickupDayNum = rental.pickupDate ? Math.max(1, calculateDurationFromDates(settings.startDate, rental.pickupDate)) : 1;
    const dropoffDayNum = rental.dropoffDate ? Math.max(1, calculateDurationFromDates(settings.startDate, rental.dropoffDate)) : rawDays.length;

    let updatedDaysSnapshot: Omit<ItineraryDay, 'date'>[] = [];
    let pickupIndex = -1;
    let dropoffIndex = -1;

    setRawDays((prevDays) => {
      let updatedDays = [...prevDays];

      // 1. Limpar itens antigos criados por este aluguel de carro para evitar duplicidades
      updatedDays = updatedDays.map((day) => {
        if (day.hourlySchedule) {
          return {
            ...day,
            hourlySchedule: day.hourlySchedule.filter(
              (item) => !(item.sourceType === 'car_rental' && item.sourceId === rental.id)
            ),
          };
        }
        return day;
      });

      // 2. Preparar os novos itens de cronograma
      const pickupTime = rental.pickupTime || '10:00';
      const dropoffTime = rental.dropoffTime || '16:00';

      const pickupItem: HourlyScheduleItem = {
        id: generateDeterministicUUID('car-pickup', rental.id),
        time: pickupTime,
        title: `🚗 Retirada de Carro: ${rental.company || 'Locadora'} (${rental.category || 'Veículo'})`,
        location: rental.pickupLocation || 'Local de Retirada',
        category: 'transport',
        sourceType: 'car_rental',
        sourceId: rental.id,
        notes: `Retirada do veículo ${rental.category || ''} na ${rental.pickupLocation || 'locadora'}. Confirmação: ${rental.confirmationCode || 'N/A'}.`,
      };

      const dropoffItem: HourlyScheduleItem = {
        id: generateDeterministicUUID('car-dropoff', rental.id),
        time: dropoffTime,
        title: `🚗 Devolução de Carro: ${rental.company || 'Locadora'} (${rental.category || 'Veículo'})`,
        location: rental.dropoffLocation || 'Local de Devolução',
        category: 'transport',
        sourceType: 'car_rental',
        sourceId: rental.id,
        notes: `Devolução do veículo ${rental.category || ''} na ${rental.dropoffLocation || 'locadora'}.`,
      };

      // 3. Inserir retirada no dia correspondente
      pickupIndex = updatedDays.findIndex((d) => d.dayNumber === pickupDayNum);
      if (pickupIndex !== -1) {
        const dDay = updatedDays[pickupIndex];
        const nextSched = [...(dDay.hourlySchedule || []), pickupItem];
        nextSched.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
        updatedDays[pickupIndex] = { ...dDay, hourlySchedule: nextSched };
      }

      // 4. Inserir devolução no dia correspondente
      dropoffIndex = updatedDays.findIndex((d) => d.dayNumber === dropoffDayNum);
      if (dropoffIndex !== -1) {
        const dDay = updatedDays[dropoffIndex];
        const nextSched = [...(dDay.hourlySchedule || []), dropoffItem];
        nextSched.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
        updatedDays[dropoffIndex] = { ...dDay, hourlySchedule: nextSched };
      }

      updatedDaysSnapshot = updatedDays;
      return updatedDays;
    });

    // 5. Salvar dias modificados no Supabase e aguardar persistência
    if (activeTripId && updatedDaysSnapshot.length > 0) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelersCount: settings.travelersCount,
        dollarRate: settings.dollarRate,
        totalBudgetGoalBRL: settings.totalBudgetGoalBRL,
        status: settings.status,
        coverTheme: settings.coverTheme,
        travelers: settings.travelers || [],
        rawDays: updatedDaysSnapshot,
      };

      const daysToSaveIndices = Array.from(new Set([pickupIndex, dropoffIndex])).filter((idx) => idx !== -1);
      for (const idx of daysToSaveIndices) {
        const dayToSave = updatedDaysSnapshot[idx];
        if (dayToSave) {
          const saveRes = await SupabaseService.saveItineraryDay(activeTripId, dayToSave, fallbackTrip);
          if (!saveRes.success) {
            return {
              success: false,
              error: `Erro ao persistir horário de aluguel no Dia ${dayToSave.dayNumber}: ${saveRes.error || 'Falha no banco de dados'}`,
            };
          }
        }
      }
    }

    return { success: true };
  };

  const addCarRental = async (rental: Omit<CarRentalBooking, 'id'>): Promise<{ success: boolean; error?: string }> => {
    const newRental: CarRentalBooking = {
      ...rental,
      id: generateUUID(),
      attachments: rental.attachments || [],
    };

    const previousRentals = carRentals;
    const previousDays = rawDays;
    const previousExpensesList = expenses;

    // Optimistic state
    setCarRentals((prev) => [...prev, newRental]);

    if (activeTripId) {
      try {
        // 1. Primária: car_rentals
        const res = await SupabaseService.saveCarRental(activeTripId, newRental, activeTrip || undefined);
        if (!res || !res.success) {
          setCarRentals(previousRentals);
          return { success: false, error: res?.error || 'Falha ao salvar aluguel de veículo no Supabase' };
        }

        // 2. Secundária 1: despesa
        const expRes = await syncCarRentalExpense(newRental, settings.dollarRate || 5.75);
        if (!expRes.success) {
          setCarRentals(previousRentals);
          setExpenses(previousExpensesList);
          await SupabaseService.deleteCarRental(newRental.id);
          const expId = generateDeterministicUUID('car-expense', newRental.id);
          await SupabaseService.deleteExpense(expId);
          return { success: false, error: `Aluguel salvo, mas falhou ao registrar despesa: ${expRes.error}` };
        }

        // 3. Secundária 2: cronograma do roteiro
        const itinRes = await syncCarRentalToItineraryDays(newRental);
        if (!itinRes.success) {
          setCarRentals(previousRentals);
          setExpenses(previousExpensesList);
          setRawDays(previousDays);
          await SupabaseService.deleteCarRental(newRental.id);
          const expId = generateDeterministicUUID('car-expense', newRental.id);
          await SupabaseService.deleteExpense(expId);
          return { success: false, error: `Aluguel salvo, mas falhou ao sincronizar no cronograma: ${itinRes.error}` };
        }

        addNotification(`Cadastrou aluguel de veículo (${rental.company}) e sincronizou no orçamento e cronograma`);
        return { success: true };
      } catch (e: any) {
        setCarRentals(previousRentals);
        setExpenses(previousExpensesList);
        setRawDays(previousDays);
        return { success: false, error: e?.message || 'Erro inesperado ao cadastrar aluguel' };
      }
    }

    await syncCarRentalExpense(newRental, settings.dollarRate || 5.75);
    await syncCarRentalToItineraryDays(newRental);
    addNotification(`Cadastrou aluguel de veículo (${rental.company}) e sincronizou no orçamento e cronograma`);
    return { success: true };
  };

  const updateCarRental = async (id: string, updates: Partial<CarRentalBooking>): Promise<{ success: boolean; error?: string }> => {
    const previous = carRentals.find((c) => c.id === id);
    if (!previous) {
      return { success: false, error: 'Aluguel de veículo não encontrado' };
    }
    const updated: CarRentalBooking = { ...previous, ...updates };

    const previousRentals = carRentals;
    const previousDays = rawDays;
    const previousExpensesList = expenses;

    setCarRentals((prev) => prev.map((c) => (c.id === id ? updated : c)));

    if (activeTripId) {
      try {
        // 1. Primária: car_rentals
        const res = await SupabaseService.saveCarRental(activeTripId, updated, activeTrip || undefined);
        if (!res || !res.success) {
          setCarRentals(previousRentals);
          return { success: false, error: res?.error || 'Falha ao atualizar aluguel no Supabase' };
        }

        // 2. Secundária 1: despesa
        const expRes = await syncCarRentalExpense(updated, settings.dollarRate || 5.75);
        if (!expRes.success) {
          setCarRentals(previousRentals);
          setExpenses(previousExpensesList);
          await SupabaseService.saveCarRental(activeTripId, previous, activeTrip || undefined);
          await syncCarRentalExpense(previous, settings.dollarRate || 5.75);
          return { success: false, error: `Falha ao sincronizar despesa de locação: ${expRes.error}` };
        }

        // 3. Secundária 2: cronograma do roteiro
        const itinRes = await syncCarRentalToItineraryDays(updated);
        if (!itinRes.success) {
          setCarRentals(previousRentals);
          setExpenses(previousExpensesList);
          setRawDays(previousDays);
          await SupabaseService.saveCarRental(activeTripId, previous, activeTrip || undefined);
          await syncCarRentalExpense(previous, settings.dollarRate || 5.75);
          await syncCarRentalToItineraryDays(previous);
          return { success: false, error: `Falha ao sincronizar cronograma de locação: ${itinRes.error}` };
        }

        addNotification(`Atualizou informações de aluguel de carro, orçamento e cronograma`);
        return { success: true };
      } catch (e: any) {
        setCarRentals(previousRentals);
        setExpenses(previousExpensesList);
        setRawDays(previousDays);
        return { success: false, error: e?.message || 'Erro inesperado ao atualizar aluguel' };
      }
    }

    await syncCarRentalExpense(updated, settings.dollarRate || 5.75);
    await syncCarRentalToItineraryDays(updated);
    addNotification(`Atualizou informações de aluguel de carro, orçamento e cronograma`);
    return { success: true };
  };

  const deleteCarRental = (id: string) => {
    const rental = carRentals.find((c) => c.id === id);
    setCarRentals((prev) => prev.filter((c) => c.id !== id));
    
    const expId = generateDeterministicUUID('car-expense', id);
    setExpenses((prev) => prev.filter((e) => e.id !== expId && e.id !== `exp-car-${id}`));
    
    setRawDays((prevDays) =>
      prevDays.map((d) => ({
        ...d,
        hourlySchedule: (d.hourlySchedule || []).filter(
          (item) => !(item.sourceType === 'car_rental' && (item.sourceId === id || item.id.includes(id)))
        ),
      }))
    );
    SupabaseService.deleteCarRental(id);
    SupabaseService.deleteExpense(expId);
    SupabaseService.deleteExpense(`exp-car-${id}`);
    if (activeTripId) {
      SupabaseService.deleteHourlySchedulesBySource(activeTripId, id, 'car_rental');
    }
    if (rental) {
      addNotification(`Removeu aluguel do veículo ${rental.company} e seus horários do roteiro`);
    }
  };

  const addCarRentalAttachment = async (
    rentalId: string,
    attachment: Omit<CarRentalAttachment, 'id'>
  ): Promise<{ success: boolean; error?: string }> => {
    const newAtt: CarRentalAttachment = {
      ...attachment,
      id: `att-car-${Date.now()}`,
      uploadedAt: new Date().toLocaleDateString('pt-BR'),
    };
    
    if (activeTripId) {
      try {
        const res = await SupabaseService.saveCarRentalAttachment(activeTripId, rentalId, newAtt);
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Não é possível salvar anexo: suporte de armazenamento indisponível no Supabase.' };
        }
        setCarRentals((prev) =>
          prev.map((c) =>
            c.id === rentalId
              ? {
                  ...c,
                  attachments: [...(c.attachments || []), newAtt],
                }
              : c
          )
        );
        addNotification(`Anexou comprovante no veículo`);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message || 'Erro inesperado ao salvar anexo de locação' };
      }
    }

    setCarRentals((prev) =>
      prev.map((c) =>
        c.id === rentalId
          ? {
              ...c,
              attachments: [...(c.attachments || []), newAtt],
            }
          : c
      )
    );
    addNotification(`Anexou comprovante no veículo (local)`);
    return { success: true };
  };

  const removeCarRentalAttachment = (rentalId: string, attachmentId: string) => {
    setCarRentals((prev) =>
      prev.map((c) =>
        c.id === rentalId
          ? {
              ...c,
              attachments: (c.attachments || []).filter((a) => a.id !== attachmentId),
            }
          : c
      )
    );
    addNotification(`Removeu anexo do veículo`);
  };

  // Accommodation Schedule Synchronizer to Daily Itinerary
  const syncAccommodationToDays = async (
    acc: AccommodationBooking,
    removeOnly = false,
    previousAcc?: AccommodationBooking
  ): Promise<{ success: boolean; error?: string }> => {
    const currentAccs = removeOnly
      ? accommodations.filter((a) => a.id !== acc.id)
      : accommodations.map((a) => (a.id === acc.id ? acc : a));
    if (!removeOnly && !accommodations.some((a) => a.id === acc.id)) {
      currentAccs.push(acc);
    }

    const tripContext = {
      flights,
      carRentals,
      accommodations: currentAccs,
      startDate: settings.startDate,
      totalDays: rawDays.length,
    };

    const affectedDayIndexes = new Set<number>();
    rawDays.forEach((d, index) => {
      const calculatedDate = calculateDateOffset(settings.startDate, index);
      const isAffectedByAcc =
        index === 0 ||
        (acc.checkInDate && calculatedDate === acc.checkInDate) ||
        (acc.checkOutDate && calculatedDate === acc.checkOutDate) ||
        (acc.checkInDate && acc.checkOutDate && calculatedDate >= acc.checkInDate && calculatedDate <= acc.checkOutDate);

      const isAffectedByPrev =
        previousAcc &&
        ((previousAcc.checkInDate && calculatedDate === previousAcc.checkInDate) ||
         (previousAcc.checkOutDate && calculatedDate === previousAcc.checkOutDate) ||
         (previousAcc.checkInDate && previousAcc.checkOutDate && calculatedDate >= previousAcc.checkInDate && calculatedDate <= previousAcc.checkOutDate));

      if (isAffectedByAcc || isAffectedByPrev) {
        affectedDayIndexes.add(index);
      }
    });

    const updatedDays = rawDays.map((d, index) => {
      if (!affectedDayIndexes.has(index)) {
        return d;
      }
      const calculatedDate = calculateDateOffset(settings.startDate, index);
      const dayWithDate = { ...d, date: calculatedDate };
      const newSchedule = syncAllEventsToHourlySchedule(dayWithDate, tripContext);
      return {
        ...d,
        date: calculatedDate,
        hourlySchedule: newSchedule,
      };
    });

    setRawDays(updatedDays);

    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
        rawDays: updatedDays,
      };

      const saveResults = await Promise.all(
        Array.from(affectedDayIndexes).map((idx) => {
          if (updatedDays[idx]) {
            return SupabaseService.saveItineraryDay(activeTripId, updatedDays[idx], fallbackTrip);
          }
          return Promise.resolve<{ success: boolean; error?: string }>({ success: true });
        })
      );

      const failed = saveResults.find((r) => r && !r.success);
      if (failed) {
        const errMsg = failed.error || 'Erro ao sincronizar hospedagem nos dias do roteiro';
        addNotification(`❌ Falha ao salvar agenda de hospedagem no banco: ${errMsg}`);
        return { success: false, error: errMsg };
      }

      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, accommodations: currentAccs, rawDays: updatedDays } : t))
      );
    }

    return { success: true };
  };

  // Accommodation & Hotel / Airbnb Handlers
  const addAccommodation = async (acc: Omit<AccommodationBooking, 'id'>): Promise<{ success: boolean; error?: string }> => {
    const newAcc: AccommodationBooking = {
      ...acc,
      id: generateUUID(),
      attachments: acc.attachments || [],
    };

    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      const saveRes = await SupabaseService.saveAccommodation(activeTripId, newAcc, fallbackTrip);
      if (!saveRes.success) {
        const errMsg = saveRes.error || 'Erro ao salvar hospedagem no Supabase';
        addNotification(`❌ Falha ao salvar hospedagem: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    }

    setAccommodations((prev) => {
      const nextAccs = [...prev, newAcc];
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, accommodations: nextAccs } : t))
      );
      return nextAccs;
    });
    syncAccommodationExpense(newAcc, settings.dollarRate || 5.75);

    const syncRes = await syncAccommodationToDays(newAcc);
    if (!syncRes.success) {
      return syncRes;
    }

    addNotification(`Cadastrou hospedagem (${acc.name}), sincronizou no roteiro diário e no banco de dados`);
    return { success: true };
  };

  const updateAccommodation = async (
    id: string,
    updates: Partial<AccommodationBooking>
  ): Promise<{ success: boolean; error?: string }> => {
    const oldAcc = accommodations.find((a) => a.id === id);
    if (!oldAcc) return { success: false, error: 'Hospedagem não encontrada' };

    const updatedAcc = { ...oldAcc, ...updates };

    if (activeTripId) {
      const fallbackTrip = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
      };
      const saveRes = await SupabaseService.saveAccommodation(activeTripId, updatedAcc, fallbackTrip);
      if (!saveRes.success) {
        const errMsg = saveRes.error || 'Erro ao atualizar hospedagem no Supabase';
        addNotification(`❌ Falha ao atualizar hospedagem: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    }

    setAccommodations((prev) => {
      const nextAccs = prev.map((a) => (a.id === id ? updatedAcc : a));
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, accommodations: nextAccs } : t))
      );
      return nextAccs;
    });
    syncAccommodationExpense(updatedAcc, settings.dollarRate || 5.75);

    const syncRes = await syncAccommodationToDays(updatedAcc, false, oldAcc);
    if (!syncRes.success) {
      return syncRes;
    }

    addNotification(`Atualizou informações da hospedagem e sincronizou no roteiro`);
    return { success: true };
  };

  const deleteAccommodation = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const acc = accommodations.find((a) => a.id === id);
    if (!acc) return { success: false, error: 'Hospedagem não encontrada' };

    if (activeTripId) {
      const delAccRes = await SupabaseService.deleteAccommodation(id);
      if (!delAccRes) {
        const errMsg = 'Falha ao excluir hospedagem no banco de dados';
        addNotification(`❌ ${errMsg}`);
        return { success: false, error: errMsg };
      }
    }

    setAccommodations((prev) => {
      const nextAccs = prev.filter((a) => a.id !== id);
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, accommodations: nextAccs } : t))
      );
      return nextAccs;
    });

    const expId = generateDeterministicUUID('acc-expense', id);
    setExpenses((prev) => prev.filter((e) => e.id !== expId && e.id !== `exp-acc-${id}`));

    if (activeTripId) {
      await SupabaseService.deleteExpense(expId);
      await SupabaseService.deleteExpense(`exp-acc-${id}`);
      await SupabaseService.deleteHourlySchedulesBySource(activeTripId, id, 'accommodation');
    }

    const syncRes = await syncAccommodationToDays(acc, true);
    if (!syncRes.success) {
      return syncRes;
    }

    addNotification(`Removeu hospedagem ${acc.name} do roteiro e do banco de dados`);
    return { success: true };
  };

  const addAccommodationAttachment = (
    accId: string,
    attachment: Omit<AccommodationAttachment, 'id'>
  ) => {
    const newAtt: AccommodationAttachment = {
      ...attachment,
      id: `att-acc-${Date.now()}`,
      uploadedAt: new Date().toLocaleDateString('pt-BR'),
    };
    setAccommodations((prev) =>
      prev.map((a) =>
        a.id === accId
          ? {
              ...a,
              attachments: [...(a.attachments || []), newAtt],
            }
          : a
      )
    );
    addNotification(`Anexou comprovante na hospedagem`);
  };

  const removeAccommodationAttachment = (accId: string, attachmentId: string) => {
    setAccommodations((prev) =>
      prev.map((a) =>
        a.id === accId
          ? {
              ...a,
              attachments: (a.attachments || []).filter((att) => att.id !== attachmentId),
            }
          : a
      )
    );
    addNotification(`Removeu anexo da hospedagem`);
  };

  const syncAccommodationsToSupabase = async (): Promise<boolean> => {
    if (!activeTripId) return false;
    setSupabaseStatus((prev) => ({ ...prev, syncing: true, error: null }));
    const fallbackTrip = activeTrip || {
      id: activeTripId,
      tripName: settings.tripName,
      destination: settings.destination,
      startDate: settings.startDate,
      durationDays: settings.durationDays,
      travelers: settings.travelers,
    };
    const res = await SupabaseService.syncAccommodations(activeTripId, accommodations, fallbackTrip);
    if (res.success) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setSupabaseStatus((prev) => ({
        ...prev,
        connected: true,
        tablesExist: true,
        syncing: false,
        lastSynced: `Hoje às ${timeStr}`,
        error: null,
      }));
      addNotification(`Todas as hospedagens foram salvas no Supabase com sucesso!`);
      return true;
    } else {
      setSupabaseStatus((prev) => ({ ...prev, syncing: false, error: res.error || 'Erro ao sincronizar hospedagens' }));
      return false;
    }
  };

  const reloadAccommodationsFromSupabase = async (): Promise<boolean> => {
    if (!activeTripId) return false;
    setSupabaseStatus((prev) => ({ ...prev, syncing: true, error: null }));
    const remoteAccs = await SupabaseService.fetchAccommodationsByTripId(activeTripId);
    if (remoteAccs !== null) {
      setAccommodations(remoteAccs);
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, accommodations: remoteAccs } : t))
      );
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setSupabaseStatus((prev) => ({
        ...prev,
        connected: true,
        tablesExist: true,
        syncing: false,
        lastSynced: `Hoje às ${timeStr}`,
        error: null,
      }));
      addNotification(`Hospedagens recarregadas diretamente do banco de dados (${remoteAccs.length} encontradas)`);
      return true;
    } else {
      setSupabaseStatus((prev) => ({ ...prev, syncing: false }));
      return false;
    }
  };

  const getDay1AccommodationTimeline = useCallback((): Day1AirportAccommodationTimeline | null => {
    return calculateDay1AccommodationTimeline({
      flights,
      carRentals,
      accommodations,
      startDate: settings.startDate,
      day1Date: settings.startDate,
    });
  }, [flights, carRentals, accommodations, settings.startDate]);

  const applySmartAccommodationRules = useCallback(() => {
    if (accommodations.length === 0) return;

    // Sincronizar apenas os dias cobertos por acomodações
    setRawDays((prevDays) => {
      const tripContext = {
        flights,
        carRentals,
        accommodations,
        startDate: settings.startDate,
        totalDays: prevDays.length,
      };

      const affectedDayIndexes = new Set<number>();
      prevDays.forEach((d, index) => {
        const calculatedDate = calculateDateOffset(settings.startDate, index);
        const hasMatchingAcc = accommodations.some(
          (a) =>
            a.checkInDate === calculatedDate ||
            a.checkOutDate === calculatedDate ||
            (a.checkInDate && a.checkOutDate && calculatedDate >= a.checkInDate && calculatedDate <= a.checkOutDate)
        );
        if (hasMatchingAcc || index === 0) {
          affectedDayIndexes.add(index);
        }
      });

      const synchronized = prevDays.map((d, index) => {
        if (!affectedDayIndexes.has(index)) return d;
        const calculatedDate = calculateDateOffset(settings.startDate, index);
        const dayWithDate = { ...d, date: calculatedDate };
        const newSchedule = syncAllEventsToHourlySchedule(dayWithDate, tripContext);
        return {
          ...d,
          hourlySchedule: newSchedule,
        };
      });

      if (activeTripId) {
        setTrips((prevTrips) =>
          prevTrips.map((t) => (t.id === activeTripId ? { ...t, accommodations, rawDays: synchronized } : t))
        );
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelers: settings.travelers,
          rawDays: synchronized,
        };
        // Gravar no banco apenas os dias afetados
        const promises = Array.from(affectedDayIndexes).map((idx) => {
          if (synchronized[idx]) {
            return SupabaseService.saveItineraryDay(activeTripId, synchronized[idx], fallbackTrip);
          }
          return Promise.resolve<{ success: boolean; error?: string }>({ success: true });
        });
        Promise.all(promises).then((results) => {
          const failed = results.find((r) => r && !r.success);
          if (failed) {
            addNotification(`❌ Falha ao salvar sincronização de ingressos na agenda: ${failed.error}`);
          }
        });
      }

      return synchronized;
    });
  }, [accommodations, flights, carRentals, settings.startDate, activeTripId, activeTrip]);

  const syncExpensesToSupabase = async (): Promise<boolean> => {
    if (!activeTripId) return false;
    setSupabaseStatus((prev) => ({ ...prev, syncing: true, error: null }));
    const fallbackTrip = activeTrip || {
      id: activeTripId,
      tripName: settings.tripName,
      destination: settings.destination,
      startDate: settings.startDate,
      durationDays: settings.durationDays,
      travelers: settings.travelers,
    };
    const res = await SupabaseService.syncExpenses(activeTripId, expenses, fallbackTrip);
    if (res.success) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setSupabaseStatus((prev) => ({
        ...prev,
        connected: true,
        tablesExist: true,
        syncing: false,
        lastSynced: `Hoje às ${timeStr}`,
        error: null,
      }));
      addNotification(`Todas as despesas foram salvas no Supabase com sucesso!`);
      return true;
    } else {
      setSupabaseStatus((prev) => ({ ...prev, syncing: false, error: res.error || 'Erro ao sincronizar despesas' }));
      return false;
    }
  };

  const reloadExpensesFromSupabase = async (): Promise<boolean> => {
    if (!activeTripId) return false;
    setSupabaseStatus((prev) => ({ ...prev, syncing: true, error: null }));
    const rawRemoteExps = await SupabaseService.fetchExpensesByTripId(activeTripId);
    if (rawRemoteExps !== null) {
      const remoteExps = deduplicateById(rawRemoteExps);
      setExpenses(remoteExps);
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: remoteExps } : t))
      );
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setSupabaseStatus((prev) => ({
        ...prev,
        connected: true,
        tablesExist: true,
        syncing: false,
        lastSynced: `Hoje às ${timeStr}`,
        error: null,
      }));
      addNotification(`Despesas recarregadas diretamente do banco de dados (${remoteExps.length} encontradas)`);
      return true;
    } else {
      setSupabaseStatus((prev) => ({ ...prev, syncing: false }));
      return false;
    }
  };

  const syncParkTicketExpense = (ticket: ParkTicketPurchase, rate: number) => {
    const expId = generateDeterministicUUID('ticket-expense', ticket.id);
    const usd = ticket.costUSD || 0;
    const brl = ticket.costBRL || (usd > 0 ? Math.round(usd * rate * 100) / 100 : 0);
    const finalUsd = usd || (brl > 0 ? Math.round((brl / rate) * 100) / 100 : 0);

    if (brl > 0 || finalUsd > 0) {
      const isPaid = ticket.paymentStatus === 'Pago';
      const ticketTitle = `Ingresso: ${ticket.title || 'Ingresso de Parques'}`.trim();
      const parksStr = ticket.parksIncluded && ticket.parksIncluded.length > 0 ? ticket.parksIncluded.join(', ') : ticket.complex;
      
      // Obter nomes dos viajantes para quem foi comprado
      const ticketTravelerIds = ticket.travelerIds || [];
      const travelersList = settings.travelers || [];
      const isAll = ticketTravelerIds.includes('all') || ticketTravelerIds.length === 0 || (travelersList.length > 0 && ticketTravelerIds.length === travelersList.length);
      const selectedTravelerNames = isAll 
        ? 'Todos os Viajantes' 
        : travelersList
            .filter((t) => ticketTravelerIds.includes(t.id))
            .map((t) => t.name)
            .join(', ');

      const qty = ticket.quantity || 1;
      const qtyText = `${qty} ${qty === 1 ? 'pacote/ingresso' : 'pacotes/ingressos'}`;

      const ticketNotes = `${ticket.type === 'combo' ? 'Combo Multi-Parques / Multi-Dias' : 'Ingresso Individual'} (${ticket.daysCount} ${ticket.daysCount === 1 ? 'dia' : 'dias'}${ticket.ticketOption ? ' - ' + ticket.ticketOption : ''}) | Parques: ${parksStr}${ticket.confirmationCode ? ' | Voucher: ' + ticket.confirmationCode : ''} | Qtd: ${qtyText} | Para: ${selectedTravelerNames}`;
      const responsible = ticket.travelerIds && ticket.travelerIds.length === 1 ? ticket.travelerIds[0] : 'all';

      const expData: ExpenseItem = {
        id: expId,
        title: ticketTitle,
        category: 'Ingressos',
        estimatedValueUSD: finalUsd,
        estimatedValueBRL: brl,
        paidValueBRL: isPaid ? brl : 0,
        paidValueUSD: isPaid ? finalUsd : 0,
        status: isPaid ? 'Pago' : 'Pendente',
        payerId: ticket.payerId || 'all',
        responsibleTravelerId: ticket.payerId || 'all',
        travelerIds: ticket.travelerIds || ['all'],
        sourceType: 'park_ticket',
        sourceId: ticket.id,
        excluded: false,
        notes: ticketNotes,
        updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        updatedBy: currentUser.name,
      };

      setExpenses((prev) => {
        let nextExpenses: ExpenseItem[];
        const existingIndex = prev.findIndex((e) => e.id === expId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            title: ticketTitle,
            estimatedValueUSD: finalUsd,
            estimatedValueBRL: brl,
            paidValueBRL: isPaid ? brl : updated[existingIndex].paidValueBRL,
            paidValueUSD: isPaid ? finalUsd : updated[existingIndex].paidValueUSD,
            status: isPaid ? 'Pago' : updated[existingIndex].status,
            payerId: expData.payerId,
            responsibleTravelerId: expData.responsibleTravelerId,
            travelerIds: expData.travelerIds,
            sourceType: 'park_ticket',
            sourceId: ticket.id,
            notes: ticketNotes,
            updatedAt: expData.updatedAt,
            updatedBy: expData.updatedBy,
          };
          nextExpenses = updated;
        } else {
          nextExpenses = [expData, ...prev];
        }
        setTrips((prevTrips) =>
          prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
        );
        return nextExpenses;
      });

      if (activeTripId) {
        const fallbackTrip = activeTrip || {
          id: activeTripId,
          tripName: settings.tripName,
          destination: settings.destination,
          startDate: settings.startDate,
          durationDays: settings.durationDays,
          travelers: settings.travelers,
        };
        SupabaseService.saveExpense(activeTripId, expData, fallbackTrip);
      }
    } else {
      setExpenses((prev) => {
        const nextExpenses = prev.filter((e) => e.id !== expId);
        setTrips((prevTrips) =>
          prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
        );
        return nextExpenses;
      });
      SupabaseService.deleteExpense(expId);
    }
  };

  // Park Tickets Handlers
  const addParkTicket = (ticket: Omit<ParkTicketPurchase, 'id'>) => {
    const newTicket: ParkTicketPurchase = {
      ...ticket,
      id: generateUUID(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setParkTickets((prev) => {
      const nextTickets = [...prev, newTicket];
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, parkTickets: nextTickets } : t))
      );
      return nextTickets;
    });
    syncParkTicketExpense(newTicket, settings.dollarRate || 5.75);
    
    if (activeTripId) {
      const fallbackTrip: Partial<Trip> = activeTrip || {
        id: activeTripId,
        tripName: settings.tripName,
        destination: settings.destination,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        travelers: settings.travelers,
        dollarRate: settings.dollarRate,
      };
      SupabaseService.saveParkTicket(activeTripId, newTicket, fallbackTrip);
    }
    
    addNotification(`Cadastrou compra de ingresso (${ticket.title}) e sincronizou no financeiro`);
  };

  const updateParkTicket = (id: string, updates: Partial<ParkTicketPurchase>) => {
    setParkTickets((prev) => {
      const updatedList = prev.map((t) => {
        if (t.id === id) {
          const updated = { ...t, ...updates };
          syncParkTicketExpense(updated, settings.dollarRate || 5.75);
          
          if (activeTripId) {
            const fallbackTrip: Partial<Trip> = activeTrip || {
              id: activeTripId,
              tripName: settings.tripName,
              destination: settings.destination,
              startDate: settings.startDate,
              durationDays: settings.durationDays,
              travelers: settings.travelers,
              dollarRate: settings.dollarRate,
            };
            SupabaseService.saveParkTicket(activeTripId, updated, fallbackTrip);
          }
          
          return updated;
        }
        return t;
      });
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, parkTickets: updatedList } : t))
      );
      return updatedList;
    });
    addNotification(`Atualizou informações de ingresso e orçamento`);
  };

  const deleteParkTicket = (id: string) => {
    const ticket = parkTickets.find((t) => t.id === id);
    setParkTickets((prev) => {
      const nextTickets = prev.filter((t) => t.id !== id);
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, parkTickets: nextTickets } : t))
      );
      return nextTickets;
    });
    
    const expId = generateDeterministicUUID('ticket-expense', id);
    setExpenses((prev) => {
      const nextExpenses = prev.filter((e) => e.id !== expId && e.id !== `exp-ticket-${id}`);
      setTrips((prevTrips) =>
        prevTrips.map((t) => (t.id === activeTripId ? { ...t, expenses: nextExpenses } : t))
      );
      return nextExpenses;
    });
    
    SupabaseService.deleteParkTicket(id);
    SupabaseService.deleteExpense(expId);
    SupabaseService.deleteExpense(`exp-ticket-${id}`);
    if (activeTripId) {
      SupabaseService.deleteHourlySchedulesBySource(activeTripId, id, 'ticket');
    }
    if (ticket) {
      addNotification(`Removeu o ingresso ${ticket.title} e seu gasto do orçamento`);
    }
  };

  const importAiParsedData = (data: AiParsedData) => {
    // 1. Update trip meta if requested
    if (data.tripUpdates) {
      const maxDayFromAi = data.itineraryDays?.reduce((max, d) => Math.max(max, d.dayNumber || 0), 0) || 0;
      const newDuration = Math.max(settings.durationDays, data.tripUpdates.durationDays || maxDayFromAi || settings.durationDays);
      updateSettings({
        tripName: data.tripUpdates.tripName || settings.tripName,
        destination: data.tripUpdates.destination || settings.destination,
        startDate: data.tripUpdates.startDate || settings.startDate,
        durationDays: newDuration,
      });
    }

    // 2. Import flights
    if (data.flights && data.flights.length > 0) {
      data.flights.forEach((fl, idx) => {
        const flightType: 'outbound' | 'inbound' | 'connection' | 'extra' =
          fl.type === 'return' ? 'inbound' : fl.type === 'internal' ? 'connection' : 'outbound';

        const typeLabel =
          flightType === 'outbound' ? 'Voo de Ida' : flightType === 'inbound' ? 'Voo de Volta' : 'Conexão';

        const allTravelerNames = (settings.travelers || []).map((t) => t?.name || 'Viajante');
        const allTravelerIds = (settings.travelers || []).map((t) => t?.id || '1');

        const rawDepApt = fl.departureAirport || (fl as any).originAirport || (fl as any).origin || 'Origem';
        const rawArrApt = fl.arrivalAirport || (fl as any).destinationAirport || (fl as any).destination || 'Destino';
        const rawAirline = fl.airline || (fl as any).carrier || 'Cia Aérea';
        const rawFlightNum = fl.flightNumber || (fl as any).flight_number || 'AD1234';
        const rawPnr = fl.confirmationCode || (fl as any).pnr || (fl as any).bookingReference || '';
        const rawDepDate = fl.departureDate || (fl as any).date || settings.startDate;
        const rawDepTime = fl.departureTime || (fl as any).time || '09:00';
        const rawArrDate = fl.arrivalDate || rawDepDate;
        const rawArrTime = fl.arrivalTime || '18:00';

        const newFlight: FlightSegment = {
          id: `fl-ai-${Date.now()}-${idx}`,
          type: flightType,
          typeLabel,
          airline: rawAirline,
          flightNumber: rawFlightNum,
          pnrLocator: rawPnr,
          originAirport: rawDepApt,
          originCity: rawDepApt.split('-')[0]?.trim() || 'Origem',
          originCode: rawDepApt.split('-')[1]?.trim() || 'ORG',
          destinationAirport: rawArrApt,
          destinationCity: rawArrApt.split('-')[0]?.trim() || 'Destino',
          destinationCode: rawArrApt.split('-')[1]?.trim() || 'DST',
          departureDate: rawDepDate,
          departureTime: rawDepTime,
          arrivalDate: rawArrDate,
          arrivalTime: rawArrTime,
          duration: '9h 30m',
          stopovers: 'Voo Direto',
          cabinClass: 'Econômica',
          seats: fl.seatNumber || 'Assentos não especificados',
          baggageAllowance: {
            personalItem: true,
            carryOnQty: 1,
            checkedQty: 1,
            notes: fl.baggageAllowance || '1 mala 23kg por passageiro',
          },
          status: 'Emitido / Confirmado',
          notes: fl.notes || 'Importado via IA Gemini',
          passengers: allTravelerNames,
          travelerIds: allTravelerIds,
          payerId: allTravelerIds[0] || '1',
        };
        addFlight(newFlight);
      });
    }

    // 3. Import expenses
    if (data.expenses && data.expenses.length > 0) {
      data.expenses.forEach((exp) => {
        const validCategory: ExpenseCategory = [
          'Passagens',
          'Hospedagem',
          'Ingressos',
          'Alimentação',
          'Compras',
          'Transporte',
          'Seguro',
          'Documentos',
        ].includes(exp.category as any)
          ? (exp.category as ExpenseCategory)
          : 'Passagens';

        const estBrl = exp.estimatedValueBRL || (exp.estimatedValueUSD ? exp.estimatedValueUSD * settings.dollarRate : 0);
        const estUsd = exp.estimatedValueUSD || (exp.estimatedValueBRL ? exp.estimatedValueBRL / settings.dollarRate : 0);
        const allTravelerIds = (settings.travelers || []).map((t) => t?.id || '1');

        addExpense({
          title: exp.title || 'Passagens Aéreas e Reservas (IA)',
          category: validCategory,
          estimatedValueBRL: estBrl,
          estimatedValueUSD: estUsd,
          paidValueBRL: exp.paidValueBRL || (exp.status === 'Pago' ? estBrl : 0),
          responsibleTravelerId: allTravelerIds[0] || '1',
          payerId: allTravelerIds[0] || '1',
          travelerIds: allTravelerIds,
          status: exp.status === 'Pago' ? 'Pago' : 'Pendente',
          excluded: false,
          notes: exp.notes || 'Extraído via IA Gemini - Inclui todos os passageiros da viagem',
          sourceType: validCategory === 'Passagens' ? 'flight' : 'general',
        });
      });
    }

    // 4. Import itinerary day plans & hourly schedule items ("por hora")
    if (data.itineraryDays && data.itineraryDays.length > 0) {
      data.itineraryDays.forEach((dayData) => {
        if (!dayData.dayNumber) return;

        const dayNum = dayData.dayNumber;
        const existingDay = rawDays.find((d) => d.dayNumber === dayNum);

        // Build hourly schedule items from morning, afternoon, and night plans
        const newHourlyItems: HourlyScheduleItem[] = [];
        const dayKey = `ai-day-${dayNum}-${Date.now()}`;
        if (dayData.morningPlan && dayData.morningPlan.trim()) {
          newHourlyItems.push({
            id: `h-m-${dayKey}`,
            time: '09:00',
            title: dayData.morningPlan,
            category: 'park',
            notes: 'Planejamento Matutino (IA)',
            sourceType: 'manual',
          });
        }
        if (dayData.afternoonPlan && dayData.afternoonPlan.trim()) {
          newHourlyItems.push({
            id: `h-a-${dayKey}`,
            time: '13:00',
            title: dayData.afternoonPlan,
            category: 'park',
            notes: 'Planejamento Vespertino (IA)',
            sourceType: 'manual',
          });
        }
        if (dayData.nightPlan && dayData.nightPlan.trim()) {
          newHourlyItems.push({
            id: `h-n-${dayKey}`,
            time: '19:00',
            title: dayData.nightPlan,
            category: 'dining',
            notes: 'Planejamento Noturno / Show (IA)',
            sourceType: 'manual',
          });
        }

        if (existingDay) {
          const mergedHourly = [...(existingDay.hourlySchedule || []), ...newHourlyItems];
          updateItineraryDay(existingDay.id, {
            title: dayData.title || existingDay.title,
            park: dayData.park || existingDay.park,
            morning: {
              ...existingDay.morning,
              where: dayData.morningPlan || existingDay.morning.where,
            },
            afternoon: {
              ...existingDay.afternoon,
              where: dayData.afternoonPlan || existingDay.afternoon.where,
            },
            night: {
              ...existingDay.night,
              where: dayData.nightPlan || existingDay.night.where,
            },
            generalNotes: dayData.generalNotes ? `${existingDay.generalNotes}\n${dayData.generalNotes}`.trim() : existingDay.generalNotes,
            hourlySchedule: mergedHourly,
          });
        } else {
          // Create new day if it doesn't exist yet
          const newDayId = `day-${dayNum}-${Date.now()}`;
          const dayDate = calculateDateOffset(settings.startDate, dayNum - 1);
          const newDayObj = {
            id: newDayId,
            dayNumber: dayNum,
            date: dayDate,
            title: dayData.title || `Dia ${dayNum}`,
            park: dayData.park || 'Sem Parque',
            completed: false,
            morning: { where: dayData.morningPlan || '', dining: '', notes: '' },
            afternoon: { where: dayData.afternoonPlan || '', dining: '', notes: '' },
            night: { where: dayData.nightPlan || '', dining: '', notes: '' },
            generalNotes: dayData.generalNotes || '',
            hourlySchedule: newHourlyItems,
            attachments: [],
          };

          setRawDays((prev) => {
            if (prev.some((d) => d.dayNumber === dayNum)) return prev;
            return [...prev, newDayObj].sort((a, b) => a.dayNumber - b.dayNumber);
          });

          // Sync to Supabase
          if (activeTripId) {
            const fallbackTrip = activeTrip || {
              id: activeTripId,
              tripName: settings.tripName,
              destination: settings.destination,
              startDate: settings.startDate,
              durationDays: settings.durationDays,
              travelers: settings.travelers,
            };
            SupabaseService.saveItineraryDay(activeTripId, newDayObj, fallbackTrip);
          }
        }
      });
    }

    // 5. Import car rentals
    if (data.carRentals && data.carRentals.length > 0) {
      data.carRentals.forEach((car) => {
        addCarRental({
          company: car.company || 'Locadora de Veículos',
          confirmationCode: car.confirmationCode || '',
          category: car.category || 'Veículo SUV',
          pickupLocation: car.pickupLocation || 'Aeroporto de Orlando (MCO)',
          pickupDate: car.pickupDate || settings.startDate,
          pickupTime: car.pickupTime || '10:00',
          dropoffLocation: car.dropoffLocation || car.pickupLocation || 'Aeroporto de Orlando (MCO)',
          dropoffDate: car.dropoffDate || car.pickupDate || settings.startDate,
          dropoffTime: car.dropoffTime || '16:00',
          costBRL: car.costBRL || (car.costUSD ? car.costUSD * (settings.dollarRate || 5.75) : 0),
          costUSD: car.costUSD || (car.costBRL ? car.costBRL / (settings.dollarRate || 5.75) : 0),
          status: (car.status === 'Pago' ? 'Pago' : 'Pendente') as any,
          payerId: (settings.travelers?.[0]?.id) || '1',
          travelerIds: (settings.travelers || []).map((t) => t.id),
          notes: car.notes || 'Importado via IA Gemini',
          attachments: [],
        });
      });
    }

    addNotification('Importou e organizou todas as informações do voucher com IA!');
  };

  const resetToDefaults = () => {
    if (window.confirm('Deseja restaurar todos os dados para o planejamento inicial padrão?')) {
      setSettings(INITIAL_SETTINGS);
      setExpenses(INITIAL_EXPENSES);
      setRawDays(INITIAL_ITINERARY_DAYS);
      setPrepDocuments(INITIAL_PREPARATION_DOCS);
      setBookingMilestones(INITIAL_BOOKING_MILESTONES);
      setBaggageItems(INITIAL_BAGGAGE_ITEMS);
      setFlights(INITIAL_FLIGHTS);
      localStorage.clear();
      addNotification('Restaurou dados padrões do KingdomCompass');
    }
  };

  const exportDataJSON = () => {
    const data = {
      settings,
      expenses,
      rawDays,
      prepDocuments,
      bookingMilestones,
      baggageItems,
      flights,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KingdomCompass_Planejamento_${settings.startDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importDataJSON = (jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);
      if (data.settings) setSettings(data.settings);
      if (data.expenses) setExpenses(data.expenses);
      if (data.rawDays) setRawDays(data.rawDays);
      if (data.prepDocuments) setPrepDocuments(data.prepDocuments);
      if (data.bookingMilestones) setBookingMilestones(data.bookingMilestones);
      if (data.baggageItems) setBaggageItems(data.baggageItems);
      if (data.flights) setFlights(data.flights);
      addNotification('Importou novo arquivo de dados de viagem');
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  };

  return (
    <PlannerContext.Provider
      value={{
        trips,
        activeTripId,
        selectTrip,
        addTrip,
        updateTrip,
        deleteTrip,
        duplicateTrip,
        settings,
        updateSettings,
        updateModuleReadiness,
        updateTravelers,
        setCurrentUser,
        currentUser,
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
        toggleExpenseExclusion,
        syncExpensesToSupabase,
        reloadExpensesFromSupabase,
        currencyView,
        setCurrencyView,
        liveExchangeRate,
        isFetchingExchangeRate,
        refreshLiveExchangeRate,
        applyLiveRateToTrip,
        financialSummary,
        itineraryDays,
        updateItineraryDay,
        saveHourlyScheduleItem,
        deleteHourlyScheduleItem,
        swapOrMoveParkDay,
        toggleDayCompleted,
        addItineraryDay,
        deleteItineraryDay,
        addAttachmentToDay,
        removeAttachmentFromDay,
        flights,
        addFlight,
        updateFlight,
        deleteFlight,
        addFlightAttachment,
        removeFlightAttachment,
        carRentals,
        addCarRental,
        updateCarRental,
        deleteCarRental,
        addCarRentalAttachment,
        removeCarRentalAttachment,
        accommodations,
        addAccommodation,
        updateAccommodation,
        deleteAccommodation,
        addAccommodationAttachment,
        removeAccommodationAttachment,
        syncAccommodationToDays,
        syncAccommodationsToSupabase,
        reloadAccommodationsFromSupabase,
        applySmartAccommodationRules,
        getDay1AccommodationTimeline,
        parkTickets,
        addParkTicket,
        updateParkTicket,
        deleteParkTicket,
        attractionSelections,
        toggleAttractionSelection,
        prepDocuments,
        toggleDocSubItem,
        toggleDocCompleted,
        toggleAllPrepForTraveler,
        deletePrepDocument,
        updatePrepDocument,
        deletePrepTip,
        addPrepDocument,
        addPrepSubItem,
        deletePrepSubItem,
        updatePrepSubItem,
        bookingMilestones: fullMilestones,
        toggleMilestoneCompleted,
        baggageItems,
        toggleBaggageItem,
        addBaggageItem,
        updateBaggageItem,
        deleteBaggageItem,
        toggleAllBaggageForTraveler,
        resetBaggageTemplateForTraveler,
        daysCountdown,
        overallProgress,
        syncNotifications,
        addNotification,
        importAiParsedData,
        resetToDefaults,
        exportDataJSON,
        importDataJSON,
        activeTab,
        setActiveTab,
        isSettingsOpen,
        setIsSettingsOpen,
        isOverviewModalOpen,
        setIsOverviewModalOpen,
        overviewCategory,
        setOverviewCategory,
        openOverviewModal,
        closeOverviewModal,
        authSession,
        isAccessModalOpen,
        setIsAccessModalOpen,
        loginWithCode,
        logoutCode,
        visibleTrips,
        removeAllTrips,
        supabaseStatus,
        syncAllToSupabase,
        reloadFromSupabase,
      }}
    >
      {children}
    </PlannerContext.Provider>
  );
};

export const usePlanner = () => {
  const context = useContext(PlannerContext);
  if (!context) {
    throw new Error('usePlanner must be used within a PlannerProvider');
  }
  return context;
};
