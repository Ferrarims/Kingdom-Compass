import {
  HourlyScheduleItem,
  FastPassItem,
  DiningReservationItem,
  ShowReservationItem,
  ParkDayBooking,
  ItineraryDay,
  FlightSegment,
  AccommodationBooking,
  CarRentalBooking,
} from '../types';
import { generateDeterministicUUID } from './uuid';

/**
 * Checks if an accommodation booking covers a specific night (date YYYY-MM-DD).
 * Note: Check-in date counts as an overnight stay; Check-out date does NOT.
 */
export function accommodationCoversNight(acc: AccommodationBooking, dateStr: string): boolean {
  if (!acc || !acc.checkInDate || !acc.checkOutDate || !dateStr) return false;
  return dateStr >= acc.checkInDate && dateStr < acc.checkOutDate;
}

/**
 * Returns all accommodations that cover a given night (dateStr YYYY-MM-DD).
 */
export function getAccommodationsForNight(accommodations: AccommodationBooking[], dateStr: string): AccommodationBooking[] {
  if (!accommodations || !Array.isArray(accommodations) || !dateStr) return [];
  return accommodations.filter((acc) => accommodationCoversNight(acc, dateStr));
}

/**
 * Resolves the chosen accommodation for a given night (dateStr YYYY-MM-DD).
 * If multiple cover that night and a valid choice exists in selectedAccommodationsPerNight, returns that choice.
 * Otherwise, falls back to the first covering accommodation.
 */
export function resolveAccommodationForNight(
  accommodations: AccommodationBooking[],
  dateStr: string,
  selectedAccommodationsPerNight?: Record<string, string>
): AccommodationBooking | null {
  const covering = getAccommodationsForNight(accommodations, dateStr);
  if (covering.length === 0) return null;
  if (covering.length === 1) return covering[0];

  const selectedId = selectedAccommodationsPerNight ? selectedAccommodationsPerNight[dateStr] : null;
  if (selectedId) {
    const selectedAcc = covering.find((a) => a.id === selectedId);
    if (selectedAcc) return selectedAcc;
  }

  return null;
}

/**
 * Calculates the total number of unique nights covered by accommodations.
 * Avoids double-counting dates where multiple accommodations overlap.
 */
export function calculateUniqueAccommodationNights(accommodations: AccommodationBooking[]): number {
  if (!accommodations || !Array.isArray(accommodations) || accommodations.length === 0) return 0;
  const uniqueNights = new Set<string>();

  accommodations.forEach((acc) => {
    if (!acc.checkInDate || !acc.checkOutDate) return;
    try {
      const startParts = acc.checkInDate.split('-').map(Number);
      const endParts = acc.checkOutDate.split('-').map(Number);
      if (startParts.length === 3 && endParts.length === 3) {
        const cur = new Date(startParts[0], startParts[1] - 1, startParts[2]);
        const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
        while (cur < end) {
          const y = cur.getFullYear();
          const m = String(cur.getMonth() + 1).padStart(2, '0');
          const d = String(cur.getDate()).padStart(2, '0');
          uniqueNights.add(`${y}-${m}-${d}`);
          cur.setDate(cur.getDate() + 1);
        }
      }
    } catch (e) {}
  });

  return uniqueNights.size;
}

/**
 * Cleans selections that refer to deleted or out-of-range accommodations or non-overlapping dates.
 */
export function cleanOrphanedAccommodationSelections(
  selections: Record<string, string>,
  accommodations: AccommodationBooking[]
): Record<string, string> {
  if (!selections || Object.keys(selections).length === 0) return {};
  if (!accommodations || accommodations.length === 0) return {};

  const cleaned: Record<string, string> = {};
  for (const [dateStr, accId] of Object.entries(selections)) {
    const acc = accommodations.find((a) => a.id === accId);
    if (acc && accommodationCoversNight(acc, dateStr)) {
      const covering = getAccommodationsForNight(accommodations, dateStr);
      if (covering.length >= 2) {
        cleaned[dateStr] = accId;
      }
    }
  }
  return cleaned;
}

/**
 * Normalizes text to lowercase without accents or punctuation for reliable comparison
 */
export function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * List of keywords and expressions identifying non-park events/days:
 * Free days, shopping, rest, leisure, airport, flights, transit, road trip, etc.
 */
export const NON_PARK_KEYWORDS: string[] = [
  'sem parque',
  'dia livre',
  'livre',
  'tempo livre',
  'tarde livre',
  'manha livre',
  'noite livre',
  'free day',
  'day off',
  'compras',
  'shopping',
  'outlet',
  'outlets',
  'mall',
  'descanso',
  'relax',
  'piscina',
  'pool',
  'hotel',
  'aeroporto',
  'airport',
  'voo',
  'flight',
  'viagem',
  'retorno',
  'partida',
  'chegada',
  'embarque',
  'desembarque',
  'estrada',
  'road trip',
  'nenhum',
  'nenhum parque',
  'disney springs',
  'citywalk',
  'city walk',
  'downtown disney',
  'international drive',
  'i drive',
  'praia',
  'beach',
  'passeio',
];

/**
 * Checks if a park or event description is a non-park activity
 * (shopping, rest, free day, flights, etc.)
 */
export function isNonParkEvent(parkOrTitle?: string): boolean {
  if (!parkOrTitle) return true;
  const norm = normalizeText(parkOrTitle);
  if (!norm) return true;

  return NON_PARK_KEYWORDS.some((kw) => {
    const normKw = normalizeText(kw);
    if (norm === normKw) return true;
    if (norm.includes(normKw)) return true;
    return false;
  });
}

/**
 * Validates whether an itinerary day is genuinely dedicated to a theme park / water park.
 * Excludes free days, shopping days, rest days, travel days, etc.
 */
export function isDayWithPark(dayOrPark?: { park?: string; title?: string; parkBooking?: any } | string | null): boolean {
  if (!dayOrPark) return false;

  if (typeof dayOrPark === 'string') {
    const parkStr = dayOrPark.trim();
    if (!parkStr) return false;
    return !isNonParkEvent(parkStr);
  }

  const park = (dayOrPark.park || '').trim();
  const title = (dayOrPark.title || '').trim();

  // If park field is explicitly set and not a non-park event
  if (park && !isNonParkEvent(park)) {
    return true;
  }

  // If park is empty or generic, check if day title specifies a theme park
  if (title && !isNonParkEvent(title)) {
    // Check if title or park booking indicates a park
    if (dayOrPark.parkBooking?.parkName && !isNonParkEvent(dayOrPark.parkBooking.parkName)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes activity title to identify duplicate items
 */
function normalizeScheduleTitle(title?: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, '')
    .trim();
}

/**
 * Normalizes schedule items to enforce "acomodação" instead of "hotel" for departures,
 * and sets cleaner location and title strings.
 * Rule: "e as saidas, nao colocar hotel, colocar sempre acomodacao, e engloba tudo"
 */
export function normalizeScheduleItemLabels(item: HourlyScheduleItem): HourlyScheduleItem {
  if (!item) return item;
  let title = item.title || '';
  let location = item.location || '';
  let notes = item.notes || '';

  // 1. Replace "Sair do hotel" / "Saída do hotel" with "Sair da acomodação" / "Saída da acomodação"
  if (title.includes('Sair do hotel') || title.includes('sair do hotel')) {
    title = title.replace(/🏨?\s*Sair do hotel/gi, '🚗 Sair da acomodação');
  }
  if (title.includes('Saída do hotel') || title.includes('saída do hotel') || title.includes('saida do hotel')) {
    title = title.replace(/🏨?\s*Sa[íi]da do hotel/gi, '🚗 Saída da acomodação');
  }
  if (title.includes('🏨 Saída de')) {
    title = title.replace(/🏨\s*Saída de/g, '🚗 Saída de');
  }
  if (title.includes('🏨 Chegada ao hotel')) {
    title = title.replace(/🏨\s*Chegada ao hotel/gi, '🌙 Chegada à acomodação');
  }
  if (title.includes('🏨 Chegada a')) {
    title = title.replace(/🏨\s*Chegada a/g, '🌙 Chegada a');
  }

  // 2. Replace location "Hotel / Hospedagem" or "Hotel" with "Acomodação"
  if (location === 'Hotel / Hospedagem' || location === 'Hotel' || location === 'Hotel/Hospedagem') {
    location = 'Acomodação';
  }

  // 3. Replace notes mentioning "hotel" in context of departure
  if (notes.includes('check-out do hotel')) {
    notes = notes.replace(/check-out do hotel/gi, 'check-out da acomodação');
  }

  return {
    ...item,
    title,
    location,
    notes,
  };
}

/**
 * Logical tie-breaker comparator for schedule items having the same or different times.
 * When times are identical (e.g. 10:00 Check-out and 10:00 Sair da acomodação):
 * Check-out will appear before accommodation departure / transport.
 */
export function compareScheduleItemOrder(a: HourlyScheduleItem, b: HourlyScheduleItem): number {
  const timeA = a?.time || '00:00';
  const timeB = b?.time || '00:00';
  const timeDiff = timeA.localeCompare(timeB);
  if (timeDiff !== 0) return timeDiff;

  const getItemPriority = (item: HourlyScheduleItem): number => {
    const t = (item?.title || '').toLowerCase();
    const id = (item?.id || '').toLowerCase();
    const c = (item?.category || '').toLowerCase();

    // 1. Início do dia (waking up / breakfast)
    if (t.includes('início do dia') || t.includes('inicio do dia') || id.includes('auto-inicio') || id.includes('acc-morning')) {
      return 1;
    }
    // 2. Check-in
    if ((t.includes('check-in') || t.includes('checkin') || id.includes('checkin')) && !t.includes('check-out')) {
      return 2;
    }
    // 3. Regular morning events / park opening
    if (t.includes('abertura') || t.includes('catraca') || t.includes('portão') || t.includes('portao')) {
      return 3;
    }
    // 4. Check-out (Keys handover, settlement)
    if (t.includes('check-out') || t.includes('checkout') || id.includes('checkout')) {
      return 4;
    }
    // 5. Saída da acomodação / Partida rumo ao aeroporto ou parque
    if (
      t.includes('sair da acomodação') ||
      t.includes('saída da acomodação') ||
      t.includes('saida da acomodacao') ||
      t.includes('sair do hotel') ||
      t.includes('saída do hotel') ||
      t.includes('saida do hotel') ||
      t.includes('saída de') ||
      t.includes('saida de') ||
      id.includes('leave') ||
      id.includes('auto-saida')
    ) {
      return 5;
    }
    // 6. Decolagem / Voos / Chegadas
    if (c === 'flight' || t.includes('decolagem') || t.includes('embarque') || t.includes('pouso') || t.includes('desembarque')) {
      return 6;
    }
    // 7. Fim do dia / Retorno à acomodação
    if (t.includes('fim do dia') || id.includes('acc-night') || id.includes('auto-retorno')) {
      return 8;
    }
    return 4.5;
  };

  const priorityDiff = getItemPriority(a) - getItemPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const titleA = a?.title || '';
  const titleB = b?.title || '';
  const titleDiff = titleA.localeCompare(titleB);
  if (titleDiff !== 0) return titleDiff;

  const idA = a?.id || '';
  const idB = b?.id || '';
  return idA.localeCompare(idB);
}

/**
 * Subtrai minutos de um horário HH:mm considerando mudança de data (dayOffset: 0 ou -1, -2...).
 * Exemplo: 02:00 menos 240 min (4h) => 22:00 do dia anterior (dayOffset: -1).
 */
export function subtractTimeWithDateOffset(
  dateStr: string,
  timeStr: string,
  minutesToSubtract: number
): { date: string; time: string; dayOffset: number } {
  const [hStr, mStr] = (timeStr || '12:00').split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const totalMins = h * 60 + m - minutesToSubtract;

  if (totalMins >= 0) {
    const newH = Math.floor(totalMins / 60);
    const newM = totalMins % 60;
    return {
      date: dateStr,
      time: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`,
      dayOffset: 0,
    };
  } else {
    // Cai no dia anterior (ou mais dias para trás)
    const positiveMins = ((totalMins % 1440) + 1440) % 1440;
    const newH = Math.floor(positiveMins / 60);
    const newM = positiveMins % 60;
    const daysBack = Math.ceil(Math.abs(totalMins) / 1440);
    
    // Calcula a data anterior
    let newDate = dateStr;
    try {
      const parts = (dateStr || '').split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        d.setDate(d.getDate() - daysBack);
        const y = d.getFullYear();
        const mon = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        newDate = `${y}-${mon}-${day}`;
      }
    } catch {
      newDate = dateStr;
    }

    return {
      date: newDate,
      time: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`,
      dayOffset: -daysBack,
    };
  }
}

/**
 * Soma minutos a um horário HH:mm considerando mudança de data (dayOffset: 0 ou +1, +2...).
 */
export function addTimeWithDateOffset(
  dateStr: string,
  timeStr: string,
  minutesToAdd: number
): { date: string; time: string; dayOffset: number } {
  const [hStr, mStr] = (timeStr || '12:00').split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const totalMins = h * 60 + m + minutesToAdd;

  if (totalMins < 1440) {
    const newH = Math.floor(totalMins / 60);
    const newM = totalMins % 60;
    return {
      date: dateStr,
      time: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`,
      dayOffset: 0,
    };
  } else {
    // Cai no dia seguinte
    const dayMins = totalMins % 1440;
    const newH = Math.floor(dayMins / 60);
    const newM = dayMins % 60;
    const daysForward = Math.floor(totalMins / 1440);

    let newDate = dateStr;
    try {
      const parts = (dateStr || '').split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        d.setDate(d.getDate() + daysForward);
        const y = d.getFullYear();
        const mon = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        newDate = `${y}-${mon}-${day}`;
      }
    } catch {
      newDate = dateStr;
    }

    return {
      date: newDate,
      time: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`,
      dayOffset: daysForward,
    };
  }
}

/**
 * Pure calculation function for park logistics and transportation minutes.
 * Rules:
 * - turnstiles = valid entry time - 30;
 * - parking = turnstiles - parking access to gate;
 * - departure = parking - outbound drive;
 * - wake up = departure - 30;
 * - park exit = max(closing time, latest activity end);
 * - arrival at car = park exit + gate-to-car walk;
 * - return start = arrival at car + 5;
 * - arrival at accommodation = return start + return drive;
 * - end of day = max(22:30 (1350 mins), arrival at accommodation, required lodging activities).
 */
export function calculateLogisticsMinutes(params: {
  openingTime?: string;
  earlyEntryTime?: string;
  closingTime?: string;
  driveToParkMins?: number;
  parkingToGateMins?: number;
  driveBackMins?: number;
  gateToCarMins?: number;
  latestActivityEndMinutes?: number;
}) {
  const targetTime = params.earlyEntryTime || params.openingTime || '09:00';
  const [tH, tM] = targetTime.split(':').map(v => parseInt(v, 10));
  const targetMins = (isNaN(tH) ? 9 : tH) * 60 + (isNaN(tM) ? 0 : tM);

  const turnstilesMins = Math.max(0, targetMins - 30);
  const parkingMins = params.parkingToGateMins ?? 15;
  const outboundDriveMins = params.driveToParkMins ?? 28;

  const parkingArrivalMins = Math.max(0, turnstilesMins - parkingMins);
  const departureFromHotelMins = Math.max(0, parkingArrivalMins - outboundDriveMins);
  const wakeUpMins = Math.max(0, departureFromHotelMins - 30);

  const [cH, cM] = (params.closingTime || '21:00').split(':').map(v => parseInt(v, 10));
  const rawCloseMins = (isNaN(cH) ? 21 : cH) * 60 + (isNaN(cM) ? 0 : cM);
  const effectiveCloseMins = rawCloseMins <= targetMins && !isNaN(cH) && cH <= 5 ? rawCloseMins + 1440 : rawCloseMins;

  const latestAct = params.latestActivityEndMinutes ?? effectiveCloseMins;
  const parkExitMins = Math.max(effectiveCloseMins, latestAct);
  const gateToCar = params.gateToCarMins ?? parkingMins;
  const arrivalAtCarMins = parkExitMins + gateToCar;
  const startReturnMins = arrivalAtCarMins + 5;
  const returnDriveMins = params.driveBackMins ?? outboundDriveMins;
  const arrivalAtHotelMins = startReturnMins + returnDriveMins;

  const dayEndMins = Math.max(1350, arrivalAtHotelMins); // 1350 mins = 22:30

  return {
    wakeUpMins,
    departureFromHotelMins,
    parkingArrivalMins,
    turnstilesMins,
    parkExitMins,
    arrivalAtCarMins,
    startReturnMins,
    arrivalAtHotelMins,
    dayEndMins,
  };
}

export function formatMins(m: number): string {
  const norm = ((m % 1440) + 1440) % 1440;
  const hours = Math.floor(norm / 60);
  const mins = norm % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * REGRA 6: AJUSTE DO CHECK-OUT
 * O horário calculado de saída para o aeroporto é a referência.
 * - Se o check-out da acomodação estiver marcado DEPOIS da saída necessária para o aeroporto,
 *   antecipar o evento de check-out para, no máximo, o horário da saída.
 * - Se o check-out estiver marcado ANTES ou NO MESMO HORÁRIO da saída necessária,
 *   manter o check-out normal.
 * - NÃO antecipar a ida ao aeroporto apenas porque o check-out ocorre mais cedo.
 * - Manter check-out e deslocamento como eventos distintos.
 * - Quando houver antecipação, adicionar ao check-out:
 *   "Check-out antecipado no roteiro para permitir a saída ao aeroporto no horário necessário."
 * - Não altera o horário limite contratado da acomodação no cadastro.
 */
export function adjustScheduleForCheckoutAndDeparture(
  schedule: HourlyScheduleItem[] = [],
  contractualCheckOutTime?: string,
  isCheckOutOrLastDay: boolean = false
): HourlyScheduleItem[] {
  if (!schedule || schedule.length === 0) return [];

  // 1. Localizar item de saída rumo ao aeroporto
  const flightDepartureItem = schedule.find((item) => {
    const titleLower = (item.title || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();
    return (
      (item.sourceType === 'flight' && (
        titleLower.includes('sair da acomodação') ||
        titleLower.includes('saída da acomodação') ||
        titleLower.includes('saida da acomodacao') ||
        titleLower.includes('rumo ao aeroporto') ||
        idLower.includes('flight-leave')
      )) ||
      titleLower.includes('sair da acomodação rumo ao aeroporto') ||
      titleLower.includes('saída da acomodação rumo ao aeroporto')
    );
  });

  // 2. Localizar devolução de carro alugado
  const carDropoffItem = schedule.find((item) => {
    const titleLower = (item.title || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();
    return (
      (item.sourceType === 'car_rental' && (titleLower.includes('devolução') || idLower.includes('car-dropoff'))) ||
      titleLower.includes('devolução de carro') ||
      titleLower.includes('devolucao de carro')
    );
  });

  // Horário de saída necessária para devolução de carro (estimativa de 30 min de trajeto da acomodação até a locadora se não houver voo conjunto)
  let carRequiredLeaveTime: string | undefined = undefined;
  if (carDropoffItem && carDropoffItem.time) {
    const [dH, dM] = carDropoffItem.time.split(':').map((v) => parseInt(v, 10));
    const dMins = (!isNaN(dH) ? dH : 16) * 60 + (!isNaN(dM) ? dM : 0);
    const leaveMins = Math.max(0, dMins - 30);
    const cH = Math.floor(leaveMins / 60);
    const cM = leaveMins % 60;
    carRequiredLeaveTime = `${String(cH).padStart(2, '0')}:${String(cM).padStart(2, '0')}`;
  }

  // Horário de saída necessário de referência (menor entre saída para voo e saída para devolução)
  let requiredLeaveTime: string | undefined = undefined;
  if (flightDepartureItem?.time && carRequiredLeaveTime) {
    requiredLeaveTime = flightDepartureItem.time.localeCompare(carRequiredLeaveTime) <= 0
      ? flightDepartureItem.time
      : carRequiredLeaveTime;
  } else if (flightDepartureItem?.time) {
    requiredLeaveTime = flightDepartureItem.time;
  } else if (carRequiredLeaveTime) {
    requiredLeaveTime = carRequiredLeaveTime;
  }

  // Localizar item de check-out
  const checkOutIndex = schedule.findIndex((item) => {
    const titleLower = (item.title || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();
    return (
      (item.sourceType === 'accommodation' || idLower.includes('checkout') || idLower.includes('check-out')) &&
      titleLower.includes('check-out') &&
      !titleLower.includes('check-in')
    );
  });

  const effectiveContractualCheckout = contractualCheckOutTime || (checkOutIndex >= 0 ? schedule[checkOutIndex].time : undefined);

  if (!effectiveContractualCheckout && !isCheckOutOrLastDay) {
    return schedule.map(normalizeScheduleItemLabels);
  }

  const adjusted = schedule.map((rawItem, idx) => {
    const item = normalizeScheduleItemLabels(rawItem);
    const titleLower = (item.title || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();

    // Se for o item de check-out
    if (idx === checkOutIndex) {
      if (requiredLeaveTime && effectiveContractualCheckout) {
        // Se o check-out contratual for DEPOIS da saída necessária:
        // ANTECIPA o check-out para o horário da saída
        if (effectiveContractualCheckout.localeCompare(requiredLeaveTime) > 0) {
          return {
            ...item,
            time: requiredLeaveTime,
            notes: `Check-out antecipado no roteiro para permitir a saída necessária. (Horário contratado da acomodação: ${effectiveContractualCheckout}).`,
          };
        } else {
          // Se o check-out for ANTES ou NO MESMO HORÁRIO: mantém o check-out normal
          let notes = item.notes || '';
          if (notes.includes('Check-out antecipado no roteiro')) {
            notes = `Horário contratual de check-out: ${effectiveContractualCheckout}. Entrega de chaves e encerramento da estadia.`;
          }
          return {
            ...item,
            time: effectiveContractualCheckout,
            notes,
          };
        }
      } else if (effectiveContractualCheckout) {
        // Se não houver voo de retorno / devolução exigindo saída antecipada: restaura o horário oficial
        let notes = item.notes || '';
        if (notes.includes('Check-out antecipado no roteiro')) {
          notes = `Horário contratual de check-out: ${effectiveContractualCheckout}. Entrega de chaves e encerramento da estadia.`;
        }
        return {
          ...item,
          time: effectiveContractualCheckout,
          notes,
        };
      }
    }

    // Início do dia / Acordar na acomodação no dia de check-out: se o check-out ou saída forem muito cedo
    const isMorningItem =
      titleLower.includes('início do dia') ||
      titleLower.includes('inicio do dia') ||
      titleLower.includes('acordar') ||
      idLower.includes('hourly-acc-morning') ||
      idLower.includes('auto-inicio') ||
      idLower.includes('auto-acordar');

    const effectiveCheckoutOrLeave = (requiredLeaveTime && effectiveContractualCheckout && effectiveContractualCheckout.localeCompare(requiredLeaveTime) > 0)
      ? requiredLeaveTime
      : (effectiveContractualCheckout || requiredLeaveTime);

    if (isMorningItem && effectiveCheckoutOrLeave && item.time) {
      if (item.time.localeCompare(effectiveCheckoutOrLeave) >= 0) {
        const [coH, coM] = effectiveCheckoutOrLeave.split(':').map((v) => parseInt(v, 10));
        const totalMins = Math.max(0, (!isNaN(coH) ? coH : 8) * 60 + (!isNaN(coM) ? coM : 0) - 30);
        const cH = Math.floor(totalMins / 60);
        const cM = totalMins % 60;
        const correctedMorning = `${String(cH).padStart(2, '0')}:${String(cM).padStart(2, '0')}`;
        return {
          ...item,
          time: correctedMorning,
          notes: item.title?.includes('Acordar')
            ? `Despertar 30 min antes da saída/check-out necessários às ${effectiveCheckoutOrLeave}.`
            : 'Café da manhã, organização das malas e preparativos para saída.',
        };
      }
    }

    return item;
  });

  return adjusted.sort(compareScheduleItemOrder);
}

/**
 * Utility to deduplicate an hourly schedule array removing duplicates
 * by ID, same semantic role (e.g. multiple morning starts or night returns),
 * and same time + normalized title.
 */
export function deduplicateHourlySchedule(items: HourlyScheduleItem[] = []): HourlyScheduleItem[] {
  if (!items || items.length === 0) return [];

  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  let hasMorningAcc = false;
  let hasNightAcc = false;
  let hasParkClosing = false;
  let hasParkCarReturn = false;

  const result: HourlyScheduleItem[] = [];

  // Normalize labels first to ensure "acomodação" and clean titles, then sort
  const sorted = items.map(normalizeScheduleItemLabels).sort(compareScheduleItemOrder);

  for (const item of sorted) {
    if (!item) continue;
    const id = (item.id || '').trim();
    const title = (item.title || '').trim();
    const time = (item.time || '00:00').trim();
    const normTitle = normalizeScheduleTitle(title);
    const sourceType = item.sourceType || 'manual';
    const sourceId = item.sourceId || normTitle;

    // Manual items are always preserved and never wiped out by automatic deduplication
    if (sourceType === 'manual') {
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      result.push(item);
      continue;
    }

    const stableKey = `${time}_${sourceType}_${sourceId}_${normTitle}`;

    // 1. Check ID uniqueness if ID is meaningful
    if (id && seenIds.has(id)) {
      continue;
    }

    // 2. Check exact stable key match
    if (seenKeys.has(stableKey)) {
      continue;
    }

    // 3. Deduplicate multiple "Início do dia na acomodação"
    const isMorningAcc =
      normTitle.includes('inicio do dia na acomodacao') ||
      normTitle.includes('inicio do dia na hospedagem') ||
      normTitle.includes('inicio do dia no hotel') ||
      id.includes('hourly-acc-morning') ||
      id.includes('auto-inicio');

    if (isMorningAcc) {
      if (hasMorningAcc) {
        continue;
      }
      hasMorningAcc = true;
    }

    // 4. Deduplicate multiple "Fim do dia na acomodação" / "Chegada ao hotel" (strictly excluding flights/landings)
    const isNightAcc =
      (normTitle.includes('fim do dia na acomodacao') ||
       normTitle.includes('fim do dia na hospedagem') ||
       normTitle.includes('fim do dia no hotel') ||
       id.includes('hourly-acc-night') ||
       id.includes('auto-retorno')) &&
      sourceType !== 'flight';

    if (isNightAcc) {
      if (hasNightAcc) {
        continue;
      }
      hasNightAcc = true;
    }

    // 5. Deduplicate multiple Check-out items on the same day
    const isCheckout =
      (normTitle.includes('check-out') ||
       id.includes('auto-acc-checkout') ||
       (item.sourceId && item.sourceId.includes('acc-checkout'))) &&
      sourceType !== 'flight';

    if (isCheckout) {
      const checkoutKey = `checkout_${item.sourceId || normTitle}`;
      if (seenKeys.has(checkoutKey)) {
        continue;
      }
      seenKeys.add(checkoutKey);
    }

    // 6. Deduplicate multiple Inter-Accommodation Transfer items on the same day
    const isSplitDrive =
      normTitle.includes('deslocamento entre acomodac') ||
      normTitle.includes('deslocamento de ') ||
      id.includes('auto-acc-split-drive') ||
      (item.sourceId && item.sourceId.includes('split-drive'));

    if (isSplitDrive) {
      const splitKey = `split_drive_${item.sourceId || normTitle}`;
      if (seenKeys.has(splitKey)) {
        continue;
      }
      seenKeys.add(splitKey);
    }

    // 7. Deduplicate multiple Park Closing / Return departure items on the same day
    const isParkClosing =
      normTitle.includes('termino das atividades em') ||
      normTitle.includes('fechamento de') ||
      id.includes('auto-saida-parque');

    if (isParkClosing) {
      if (hasParkClosing) {
        continue;
      }
      hasParkClosing = true;
    }

    // 8. Deduplicate multiple Car Return / Parking Departure items on the same day
    const isParkCarReturn =
      normTitle.includes('chegada ao carro no estacionamento') ||
      id.includes('auto-carro-retorno');

    if (isParkCarReturn) {
      if (hasParkCarReturn) {
        continue;
      }
      hasParkCarReturn = true;
    }

    if (id) seenIds.add(id);
    seenKeys.add(stableKey);
    result.push(item);
  }

  return result.sort(compareScheduleItemOrder);
}

/**
 * Cleans out any auto-generated accommodation items if there is no accommodation booked,
 * and any theme-park opening/catracas items if the day is not a theme park.
 */
export function cleanInvalidAutoItems(
  schedule: HourlyScheduleItem[] = [],
  hasAccommodation: boolean,
  isThemePark: boolean,
  parkName?: string
): HourlyScheduleItem[] {
  return (schedule || []).filter((item) => {
    if (!item) return false;
    // Itens manuais cadastrados pelo usuário devem sempre ser preservados
    if (item.sourceType === 'manual') return true;
    const idLower = (item.id || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    const locLower = (item.location || '').toLowerCase();

    // 1. If no specific accommodation is registered for this date:
    // Remove ONLY items that specifically belong to a named accommodation (like "Início do dia na acomodação (X)", specific hotel departure "auto-saida-day", etc.)
    // But DO NOT remove generic hotel departure/arrival for park days ("auto-hotel-saida", "auto-hotel-retorno", "Saída do Hotel", "Chegada ao Hotel")!
    if (!hasAccommodation) {
      if (
        idLower.startsWith('auto-inicio') ||
        idLower.startsWith('auto-acordar') ||
        idLower.startsWith('auto-acc-') ||
        idLower.startsWith('auto-retorno') ||
        (idLower.startsWith('auto-saida-') && !idLower.startsWith('auto-saida-parque') && !idLower.startsWith('auto-hotel-saida')) ||
        idLower.includes('hourly-acc-') ||
        titleLower.includes('na acomodação') ||
        titleLower.includes('na acomodacao') ||
        titleLower.includes('na hospedagem') ||
        titleLower.includes('(hospedagem)') ||
        titleLower.includes('acordar —') ||
        titleLower.includes('check-in:') ||
        titleLower.includes('check-out:') ||
        titleLower.startsWith('saída de hospedagem') ||
        titleLower.startsWith('saida de hospedagem') ||
        titleLower.includes('fim do dia na acomodação') ||
        titleLower.includes('fim do dia na hospedagem') ||
        titleLower.includes('início do dia na acomodação') ||
        locLower === 'hospedagem'
      ) {
        return false;
      }
    }

    // 2. If not a theme park (e.g. Aeroporto, Sem Parque, Compras, Descanso), remove theme park items
    // (except overflow return items from the previous day's late night closing which contain "-next-")
    if (!isThemePark) {
      if (idLower.includes('-next-')) {
        return true;
      }
      if (
        idLower.includes('auto-ida') ||
        idLower.includes('auto-abertura') ||
        idLower.includes('auto-saida-parque') ||
        idLower.includes('auto-hotel-saida') ||
        idLower.includes('auto-hotel-retorno') ||
        idLower.includes('auto-estacionamento') ||
        idLower.includes('auto-carro-retorno') ||
        idLower.startsWith('auto-fp-') ||
        idLower.startsWith('auto-show-') ||
        idLower.startsWith('auto-din-') ||
        item.sourceType === 'park' ||
        item.sourceType === 'fastpass' ||
        item.sourceType === 'show' ||
        (item.sourceType === 'dining' && idLower.startsWith('auto-din-')) ||
        titleLower.startsWith('deslocamento e chegada em aeroporto') ||
        titleLower.startsWith('abertura oficial de aeroporto') ||
        titleLower.startsWith('saída de aeroporto') ||
        titleLower.startsWith('saida de aeroporto') ||
        titleLower.includes('entrada antecipada') ||
        titleLower.includes('abertura oficial') ||
        titleLower.includes('catracas') ||
        titleLower.startsWith('⚡') ||
        titleLower.startsWith('🎆')
      ) {
        return false;
      }
    }

    return true;
  });
}

export interface ParkTransitMetrics {
  name: string;
  minParkingMins: number; // Vaga Próxima / Sem Filas
  maxParkingMins: number; // Vaga Remota / Com Trânsito ou Filas
  lat: number;
  lng: number;
  isProvisional?: boolean;
  isEstimated?: boolean;
}

/**
 * Tabela oficial de tempos padrão entre o carro estacionado e a entrada do parque (Regra 3).
 * Estimativas de planejamento editáveis por parque:
 * - Magic Kingdom: 45 min (estacionamento até o TTC e travessia de monotrilho ou ferry)
 * - EPCOT: 20 min
 * - Disney’s Hollywood Studios: 20 min
 * - Disney’s Animal Kingdom: 20 min
 * - Universal Studios Florida: 25 min
 * - Islands of Adventure: 25 min
 * - Universal Epic Universe: 15 min (estimativa provisória)
 * - Universal Volcano Bay: 30 min (estimativa provisória que inclui acesso ao shuttle)
 */
export const PARK_TRANSIT_TABLE: Array<{
  name: string;
  aliases: string[];
  minParkingMins: number;
  maxParkingMins: number;
  lat: number;
  lng: number;
  isProvisional?: boolean;
}> = [
  {
    name: 'Magic Kingdom',
    aliases: ['magic kingdom', 'magic kingdom park', 'mk', 'castelo da cinderela'],
    minParkingMins: 30,
    maxParkingMins: 45,
    lat: 28.4177,
    lng: -81.5812,
  },
  {
    name: 'EPCOT',
    aliases: ['epcot', 'epcot center', 'world showcase'],
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 28.3747,
    lng: -81.5494,
  },
  {
    name: "Disney's Hollywood Studios",
    aliases: ['hollywood studios', 'disney hollywood studios', "disney's hollywood studios", 'dhs', 'hollywood'],
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 28.3575,
    lng: -81.5583,
  },
  {
    name: "Disney's Animal Kingdom",
    aliases: ['animal kingdom', 'disney animal kingdom', "disney's animal kingdom", 'dak', 'animal'],
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 28.3553,
    lng: -81.5901,
  },
  {
    name: "Disney's Typhoon Lagoon",
    aliases: ['typhoon lagoon', "disney's typhoon lagoon", 'typhoon'],
    minParkingMins: 5,
    maxParkingMins: 15,
    lat: 28.3656,
    lng: -81.5298,
  },
  {
    name: "Disney's Blizzard Beach",
    aliases: ['blizzard beach', "disney's blizzard beach", 'blizzard'],
    minParkingMins: 5,
    maxParkingMins: 15,
    lat: 28.3528,
    lng: -81.5746,
  },
  {
    name: 'Universal Studios Florida',
    aliases: ['universal studios', 'universal studios florida', 'usf', 'universal 1', 'universal resort'],
    minParkingMins: 15,
    maxParkingMins: 25,
    lat: 28.4793,
    lng: -81.4679,
  },
  {
    name: "Universal's Islands of Adventure",
    aliases: ['islands of adventure', 'universal islands of adventure', "universal's islands of adventure", 'ioa', 'island of adventure'],
    minParkingMins: 15,
    maxParkingMins: 25,
    lat: 28.4722,
    lng: -81.4717,
  },
  {
    name: "Universal's Epic Universe",
    aliases: ['epic universe', "universal's epic universe", 'universal epic universe', 'epic'],
    minParkingMins: 10,
    maxParkingMins: 15,
    lat: 28.4410,
    lng: -81.4360,
    isProvisional: true,
  },
  {
    name: "Universal's Volcano Bay",
    aliases: ['volcano bay', "universal's volcano bay", 'volcano'],
    minParkingMins: 15,
    maxParkingMins: 30,
    lat: 28.4623,
    lng: -81.4728,
    isProvisional: true,
  },
  {
    name: 'SeaWorld Orlando',
    aliases: ['seaworld', 'seaworld orlando', 'sea world', 'sea world orlando'],
    minParkingMins: 5,
    maxParkingMins: 15,
    lat: 28.4113,
    lng: -81.4608,
  },
  {
    name: 'Busch Gardens Tampa Bay',
    aliases: ['busch gardens', 'busch gardens tampa', 'busch gardens tampa bay', 'busch'],
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 28.0372,
    lng: -82.4194,
  },
  {
    name: 'Aquatica Orlando',
    aliases: ['aquatica', 'aquatica orlando', 'aquatica seaworld'],
    minParkingMins: 5,
    maxParkingMins: 15,
    lat: 28.4158,
    lng: -81.4556,
  },
  {
    name: 'Discovery Cove Orlando',
    aliases: ['discovery cove', 'discovery cove orlando'],
    minParkingMins: 5,
    maxParkingMins: 10,
    lat: 28.4069,
    lng: -81.4628,
  },
  {
    name: 'Kennedy Space Center (NASA)',
    aliases: ['kennedy space center', 'kennedy space center (nasa)', 'ksc', 'nasa', 'cabo canaveral'],
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 28.5238,
    lng: -80.6817,
  },
  {
    name: 'LEGOLAND Florida Resort',
    aliases: ['legoland', 'legoland florida', 'legoland florida resort', 'lego land'],
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 27.9889,
    lng: -81.6897,
  },
  {
    name: 'Gatorland Orlando',
    aliases: ['gatorland', 'gatorland orlando', 'gator land'],
    minParkingMins: 5,
    maxParkingMins: 10,
    lat: 28.3558,
    lng: -81.3711,
  },
];

/**
 * Retorna as métricas de estacionamento e coordenadas de um parque dado seu nome.
 * Permite customTransitMins editável pelo usuário por parque (Regra 3).
 */
export function getParkTransitInfo(parkName: string, customTransitMins?: number): ParkTransitMetrics {
  const norm = (parkName || '').toLowerCase().trim();

  if (customTransitMins && customTransitMins > 0) {
    const match = PARK_TRANSIT_TABLE.find(
      (p) =>
        norm === p.name.toLowerCase() ||
        p.aliases.some((alias) => norm.includes(alias) || alias.includes(norm))
    );
    return {
      name: match ? match.name : (parkName || 'Parque'),
      minParkingMins: Math.max(5, customTransitMins - 10),
      maxParkingMins: customTransitMins,
      lat: match ? match.lat : 28.375,
      lng: match ? match.lng : -81.545,
      isProvisional: match ? match.isProvisional : false,
      isEstimated: !match,
    };
  }

  if (!norm) {
    return {
      name: parkName || 'Parque',
      minParkingMins: 10,
      maxParkingMins: 20,
      lat: 28.375,
      lng: -81.545,
      isEstimated: true,
    };
  }

  const match = PARK_TRANSIT_TABLE.find(
    (p) =>
      norm === p.name.toLowerCase() ||
      p.aliases.some((alias) => norm.includes(alias) || alias.includes(norm))
  );

  if (match) {
    return {
      name: match.name,
      minParkingMins: match.minParkingMins,
      maxParkingMins: match.maxParkingMins,
      lat: match.lat,
      lng: match.lng,
      isProvisional: match.isProvisional || false,
      isEstimated: false,
    };
  }

  // Para parques fora da lista, identificar que é uma estimativa de planejamento (Regra 3)
  return {
    name: parkName,
    minParkingMins: 10,
    maxParkingMins: 20,
    lat: 28.375,
    lng: -81.545,
    isEstimated: true,
  };
}

/**
 * Estima as coordenadas de uma acomodação a partir do nome e/ou endereço.
 */
export function estimateAccommodationCoordinates(
  name?: string,
  address?: string
): { lat: number; lng: number } {
  const text = `${name || ''} ${address || ''}`.toLowerCase();

  // If coordinates directly provided as string "lat, lng"
  const coordsRegex = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/;
  const matchCoords = (address || '').match(coordsRegex);
  if (matchCoords) {
    const lat = parseFloat(matchCoords[1]);
    const lng = parseFloat(matchCoords[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // Exact registered known accommodation addresses
  if (
    text.includes('brickell') ||
    text.includes('100 southeast 4th') ||
    text.includes('comfort inn') ||
    (text.includes('miami') && (text.includes('33131') || text.includes('downtown')))
  ) {
    return { lat: 25.7701, lng: -80.1906 }; // Brickell, Miami, FL
  }

  if (
    text.includes('venetian bay') ||
    text.includes('4009 venetian') ||
    text.includes('modern retreat') ||
    (text.includes('kissimmee') && text.includes('34741'))
  ) {
    return { lat: 28.3090, lng: -81.4326 };
  }

  // Known Disney Resorts
  if (text.includes('pop century')) return { lat: 28.3503, lng: -81.5422 };
  if (text.includes('art of animation')) return { lat: 28.3518, lng: -81.5458 };
  if (text.includes('all-star') || text.includes('all star')) return { lat: 28.3405, lng: -81.5723 };
  if (text.includes('grand floridian')) return { lat: 28.411, lng: -81.5878 };
  if (text.includes('contemporary')) return { lat: 28.416, lng: -81.575 };
  if (text.includes('polynesian')) return { lat: 28.405, lng: -81.583 };
  if (text.includes('coronado springs')) return { lat: 28.364, lng: -81.566 };
  if (text.includes('caribbean beach')) return { lat: 28.36, lng: -81.543 };
  if (text.includes('animal kingdom lodge')) return { lat: 28.353, lng: -81.602 };
  if (text.includes('wilderness lodge')) return { lat: 28.41, lng: -81.572 };
  if (text.includes('boardwalk')) return { lat: 28.366, lng: -81.556 };
  if (text.includes('yacht club') || text.includes('beach club')) return { lat: 28.371, lng: -81.554 };
  if (text.includes('port orleans')) return { lat: 28.378, lng: -81.535 };
  if (text.includes('swan') || text.includes('dolphin')) return { lat: 28.367, lng: -81.56 };

  // Universal Resorts
  if (text.includes('cabana bay')) return { lat: 28.4688, lng: -81.4697 };
  if (text.includes('aventura')) return { lat: 28.469, lng: -81.466 };
  if (text.includes('sapphire falls')) return { lat: 28.465, lng: -81.465 };
  if (text.includes('royal pacific')) return { lat: 28.467, lng: -81.462 };
  if (text.includes('hard rock')) return { lat: 28.474, lng: -81.462 };
  if (text.includes('portofino')) return { lat: 28.477, lng: -81.458 };
  if (text.includes('endless summer') || text.includes('dockside') || text.includes('surfside'))
    return { lat: 28.455, lng: -81.455 };
  if (text.includes('helios') || text.includes('stella nova') || text.includes('terra luna'))
    return { lat: 28.441, lng: -81.436 };

  // Common tourist areas / Kissimmee / I-Drive
  if (text.includes('rosen inn') || text.includes('international drive') || text.includes('i-drive'))
    return { lat: 28.4485, lng: -81.4705 };
  if (text.includes('lake buena vista') || text.includes('disney springs'))
    return { lat: 28.376, lng: -81.51 };
  if (text.includes('formosa') || text.includes('windsor hills') || text.includes('kissimmee'))
    return { lat: 28.325, lng: -81.605 };
  if (text.includes('champions gate') || text.includes('davenport'))
    return { lat: 28.261, lng: -81.622 };
  if (text.includes('celebration'))
    return { lat: 28.318, lng: -81.533 };

  // Default Central Tourist Corridor (Lake Buena Vista / I-Drive)
  return { lat: 28.375, lng: -81.515 };
}

/**
 * Calcula o tempo estimado de deslocamento de carro em minutos entre duas coordenadas.
 * Considera fator de rota e velocidade média de tráfego em Orlando e arredores.
 */
export function calculateDriveTimeMinutes(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const dLat = toRad(dest.lat - origin.lat);
  const dLng = toRad(dest.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) * Math.cos(toRad(dest.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistKm = R * c;

  // Road factor (real roads are ~35% longer than straight-line)
  const roadDistKm = straightDistKm * 1.35;

  if (roadDistKm > 60) {
    // Highway travel (e.g. SFB -> Miami ~380km, or Miami -> Kissimmee ~320km)
    // Avg highway speed 90 km/h + 10 min
    const durationHours = roadDistKm / 90;
    return Math.max(15, Math.round(durationHours * 60 + 10));
  }

  // Local Orlando / Resort traffic: avg speed 42 km/h + 5 min traffic/signals
  const durationHours = roadDistKm / 42;
  const mins = Math.round(durationHours * 60 + 5);
  return Math.max(10, Math.min(90, mins));
}

/**
 * Retorna as métricas completas de deslocamento e estacionamento para um parque e acomodação.
 */
export function getDriveAndParkingMetrics(
  parkName: string,
  accommodationName?: string,
  accommodationAddress?: string,
  customTransitMins?: number
): {
  driveMins: number;
  minParkingMins: number;
  maxParkingMins: number;
  totalTransitMins: number;
  parkDisplayName: string;
  isEstimated?: boolean;
  isProvisional?: boolean;
} {
  const parkInfo = getParkTransitInfo(parkName, customTransitMins);
  const hasAccommodation = Boolean(
    accommodationName &&
      accommodationName.trim() &&
      accommodationName.trim().toLowerCase() !== 'hospedagem' &&
      accommodationName.trim().toLowerCase() !== 'nenhuma cadastrada'
  );

  let driveMins = 20; // Default estimate if accommodation is generic
  if (hasAccommodation) {
    const accCoords = estimateAccommodationCoordinates(accommodationName, accommodationAddress);
    driveMins = calculateDriveTimeMinutes(accCoords, { lat: parkInfo.lat, lng: parkInfo.lng });
  }

  const totalTransitMins = driveMins + parkInfo.maxParkingMins;

  return {
    driveMins,
    minParkingMins: parkInfo.minParkingMins,
    maxParkingMins: parkInfo.maxParkingMins,
    totalTransitMins,
    parkDisplayName: parkInfo.name || parkName,
    isEstimated: parkInfo.isEstimated,
    isProvisional: parkInfo.isProvisional,
  };
}

/**
 * Estima as coordenadas de um aeroporto a partir do código ou nome.
 */
export function estimateAirportCoordinates(airportText?: string): { lat: number; lng: number; code: string; name: string } {
  const text = (airportText || '').toLowerCase();
  if (text.includes('mia') || text.includes('miami')) {
    return { lat: 25.7959, lng: -80.2870, code: 'MIA', name: 'Aeroporto Internacional de Miami (MIA)' };
  }
  if (text.includes('sfb') || text.includes('sanford')) {
    return { lat: 28.7776, lng: -81.2375, code: 'SFB', name: 'Orlando Sanford International (SFB)' };
  }
  if (text.includes('tpa') || text.includes('tampa')) {
    return { lat: 27.9772, lng: -82.5311, code: 'TPA', name: 'Aeroporto Internacional de Tampa (TPA)' };
  }
  if (text.includes('fll') || text.includes('fort lauderdale')) {
    return { lat: 26.0742, lng: -80.1506, code: 'FLL', name: 'Fort Lauderdale-Hollywood (FLL)' };
  }
  // Default: Orlando International Airport (MCO)
  return { lat: 28.4312, lng: -81.3081, code: 'MCO', name: 'Aeroporto Internacional de Orlando (MCO)' };
}

/**
 * Soma minutos a um horário no formato HH:mm e retorna HH:mm no formato 24h.
 */
export function addMinutesToTimeString(timeStr?: string, minutesToAdd: number = 0): string {
  if (!timeStr || !timeStr.includes(':')) return '15:00';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return '15:00';
  const totalMins = Math.max(0, (h * 60 + m + minutesToAdd)) % 1440;
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Retorna o horário mais tardio entre dois horários HH:mm.
 */
export function maxTimeString(timeA?: string, timeB?: string): string {
  if (!timeA && !timeB) return '15:00';
  if (!timeA) return timeB || '15:00';
  if (!timeB) return timeA || '15:00';
  return timeA.localeCompare(timeB) >= 0 ? timeA : timeB;
}

export interface Day1AirportAccommodationTimeline {
  hasArrivalFlight: boolean;
  flightArrivalTime?: string;
  flightNumber?: string;
  airline?: string;
  flightId?: string;
  hasCarRental: boolean;
  carRentalCompany?: string;
  carPickupTime?: string;
  carPickupLocation?: string;
  carRentalId?: string;
  lastAirportEventTime: string;
  lastAirportEventLabel: string;
  driveMins: number;
  calculatedArrivalAtAccTime: string;
  officialCheckInTime: string;
  effectiveCheckInTime: string;
  airportName: string;
  accommodationName: string;
  accommodationAddress: string;
  firstAccId?: string;
  isAirbnb?: boolean;
  calcExplanation?: string;
}

/**
 * REGRA 7: AJUSTE DO CHECK-IN NA CHEGADA
 * Calcula a linha do tempo inteligente de acomodação para o dia de chegada:
 * - Horário local do pouso.
 * - Tempo estimado para desembarque, imigração e bagagem: 3 horas (180 min).
 * - Retirada do carro: se o horário de retirada passar dessas 3 horas da chegada,
 *   considera horário da retirada + 1 hora para trâmites da locadora + deslocamento.
 *   Se for <= 3 horas, a retirada está inclusa no período de 3 horas do desembarque.
 * - Sem carro: pouso + 3 horas + deslocamento Maps até a propriedade.
 * - O evento de check-in ocorre no maior entre:
 *   - Horário permitido para início do check-in na reserva.
 *   - Horário estimado de chegada à acomodação.
 */
export function calculateDay1AccommodationTimeline(tripContext?: {
  flights?: any[];
  carRentals?: any[];
  accommodations?: any[];
  startDate?: string;
  day1Date?: string;
}): Day1AirportAccommodationTimeline | null {
  const accommodations = tripContext?.accommodations || [];
  if (accommodations.length === 0) return null;

  const flights = tripContext?.flights || [];
  const carRentals = tripContext?.carRentals || [];
  const targetDate = tripContext?.day1Date || tripContext?.startDate || (accommodations[0]?.checkInDate);

  // 1. Primeira acomodação correspondente estritamente reservada para a data de chegada
  const sortedAccs = [...accommodations].sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));
  const activeArrivalAccs = targetDate
    ? sortedAccs.filter((a) => {
        if (!a) return false;
        if (a.checkInDate === targetDate) return true;
        if (a.checkInDate && a.checkOutDate && targetDate >= a.checkInDate && targetDate <= a.checkOutDate) return true;
        return false;
      })
    : sortedAccs;

  const firstAcc = activeArrivalAccs.length > 0 ? activeArrivalAccs[0] : null;
  if (!firstAcc) return null;

  const accName = (firstAcc.name || 'Acomodação').trim();
  const accAddress = (firstAcc.address || '').trim();
  const isHotelType = firstAcc.type === 'hotel' || firstAcc.type === 'resort' || firstAcc.type === 'traditional';
  const isAirbnb = !isHotelType && (
    firstAcc.type === 'airbnb' ||
    firstAcc.type === 'house' ||
    accName.toLowerCase().includes('airbnb') ||
    accName.toLowerCase().includes('casa')
  );
  const officialCheckInTime = firstAcc.checkInTime || '15:00';

  // 2. Voo de chegada correspondente ao targetDate (seleciona o último trecho da ida/conexão que pousa no destino)
  const matchingFlights = flights.filter((fl) => {
    if (!fl || fl.type === 'inbound') return false;
    if (targetDate && fl.arrivalDate) return fl.arrivalDate === targetDate;
    if (targetDate && fl.departureDate && !fl.arrivalDate) return fl.departureDate === targetDate;
    return false;
  });

  const arrivalFlight = matchingFlights.length > 0
    ? matchingFlights[matchingFlights.length - 1]
    : (targetDate ? null : (flights.filter((fl) => fl && fl.type !== 'inbound').pop() || null));

  const hasArrivalFlight = Boolean(arrivalFlight && arrivalFlight.arrivalTime);
  const flightArrivalTime = arrivalFlight?.arrivalTime || '14:00';
  const flightNumber = arrivalFlight?.flightNumber || '';
  const airline = arrivalFlight?.airline || '';
  const flightId = arrivalFlight?.id;

  const destAirportRaw = arrivalFlight?.destinationAirport || arrivalFlight?.destinationCode || arrivalFlight?.destinationCity || 'MCO';
  const airportInfo = estimateAirportCoordinates(destAirportRaw);

  // 3. Carro alugado na chegada
  const carRental = carRentals.find((rental) => {
    if (!rental) return false;
    if (targetDate && rental.pickupDate === targetDate) return true;
    return false;
  }) || (targetDate ? null : (carRentals.length > 0 && targetDate === tripContext?.startDate ? carRentals[0] : null));

  const hasCarRental = Boolean(carRental);
  const carRentalCompany = carRental?.company || 'Locadora de Veículos';
  const carPickupLocation = carRental?.pickupLocation || airportInfo.name;
  const carRentalId = carRental?.id;

  // 4. Liberação no aeroporto / locadora e trajeto até a acomodação (Regra 1 & Regra 7)
  let lastAirportEventTime: string;
  let lastAirportEventLabel: string;
  let carPickupTime = carRental?.pickupTime;
  let calcExplanation = '';

  const accCoords = estimateAccommodationCoordinates(accName, accAddress);
  const driveMins = calculateDriveTimeMinutes({ lat: airportInfo.lat, lng: airportInfo.lng }, accCoords);

  if (hasArrivalFlight && hasCarRental) {
    const threeHoursAfterArrival = addMinutesToTimeString(flightArrivalTime, 180);
    if (carRental?.pickupTime && carRental.pickupTime.localeCompare(threeHoursAfterArrival) > 0) {
      lastAirportEventTime = addMinutesToTimeString(carRental.pickupTime, 60);
      lastAirportEventLabel = `Retirada do Carro Alugado na Locadora (${carRentalCompany}) com trâmites de conferência`;
      carPickupTime = carRental.pickupTime;
      calcExplanation = `pouso às ${flightArrivalTime} + imigração/bagagens + retirada do veículo às ${carRental.pickupTime} (+ 60 min de conferência) + ${driveMins} min de trajeto via Maps`;
    } else {
      lastAirportEventTime = threeHoursAfterArrival;
      lastAirportEventLabel = `Desembarque, Imigração Americana, Bagagens e Retirada do Carro`;
      carPickupTime = carRental?.pickupTime || threeHoursAfterArrival;
      calcExplanation = `pouso às ${flightArrivalTime} + 3h (desembarque, imigração, bagagens e retirada do veículo) + ${driveMins} min de trajeto via Maps`;
    }
  } else if (hasArrivalFlight && !hasCarRental) {
    const threeHoursAfterArrival = addMinutesToTimeString(flightArrivalTime, 180);
    lastAirportEventTime = threeHoursAfterArrival;
    lastAirportEventLabel = `Desembarque, Imigração Americana e Recolhimento de Bagagens`;
    calcExplanation = `pouso às ${flightArrivalTime} + 3h (desembarque, imigração e recolhimento de bagagens) + espera pelo transporte + ${driveMins} min de trajeto via Maps`;
  } else if (!hasArrivalFlight && hasCarRental) {
    const pTime = carRental?.pickupTime || '11:00';
    lastAirportEventTime = addMinutesToTimeString(pTime, 60);
    lastAirportEventLabel = `Retirada do Carro Alugado na Locadora (${carRentalCompany})`;
    carPickupTime = pTime;
    calcExplanation = `retirada do veículo agendada às ${pTime} + 60 min para conferência e trâmites na locadora + ${driveMins} min de trajeto via Maps`;
  } else {
    lastAirportEventTime = officialCheckInTime;
    lastAirportEventLabel = `Horário Oficial de Check-in`;
    calcExplanation = `horário contratual da reserva (${officialCheckInTime}) por ausência de voo ou locação cadastrados para estimativa`;
  }

  // 5. Horário calculado de chegada à acomodação e horário efetivo de check-in
  const calculatedArrivalAtAccTime = (!hasArrivalFlight && !hasCarRental)
    ? officialCheckInTime
    : addMinutesToTimeString(lastAirportEventTime, driveMins);

  const effectiveCheckInTime = maxTimeString(officialCheckInTime, calculatedArrivalAtAccTime);

  return {
    hasArrivalFlight,
    flightArrivalTime: hasArrivalFlight ? flightArrivalTime : undefined,
    flightNumber,
    airline,
    flightId,
    hasCarRental,
    carRentalCompany,
    carPickupTime,
    carPickupLocation,
    carRentalId,
    lastAirportEventTime,
    lastAirportEventLabel,
    driveMins,
    calculatedArrivalAtAccTime,
    officialCheckInTime,
    effectiveCheckInTime,
    airportName: airportInfo.name,
    accommodationName: accName,
    accommodationAddress: accAddress || accName,
    firstAccId: firstAcc.id,
    isAirbnb,
    calcExplanation,
  };
}

/**
 * Generates or updates the automatic day-by-day hourly schedule items for a park day,
 * adhering to dynamic drive times and parking transit metrics:
 * 1. Without accommodation:
 *    - Departure from hotel: 1 hour before park open / early entry
 *    - Arrival & parking: 30 min before park open
 *    - Park opening / Early Entry
 *    - Park closing: Departure from park
 *    - Night return: closing + 45 min
 * 2. With accommodation:
 *    - Departure from accommodation: (Park Open / Early Entry) - (Car drive time + Max parking transit time)
 *    - Morning start: 45 min before departure
 *    - Arrival at parking: departure + drive time (leaving max parking transit time to reach turnstiles)
 *    - Park opening / Early Entry
 *    - Park closing: Departure from park
 *    - Return to accommodation: closing + max parking transit time + car drive time
 */
/**
 * Detects the city/location (e.g. "Orlando - FL", "Miami - FL", "Tampa - FL", "Kissimmee - FL", "Cape Canaveral - FL")
 * based on park name, activity text, address, or location string.
 */
export function inferCityLocationFromText(text?: string): string | null {
  if (!text) return null;
  const norm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Miami region
  if (
    norm.includes('miami') ||
    norm.includes(' mia ') ||
    norm.includes('mia/') ||
    norm.includes('/mia') ||
    norm.includes('south beach') ||
    norm.includes('wynwood') ||
    norm.includes('sawgrass') ||
    norm.includes('dolphin mall') ||
    norm.includes('bayside') ||
    norm.includes('fort lauderdale') ||
    norm.includes(' fll') ||
    norm.includes('calle ocho') ||
    norm.includes('lincoln road') ||
    norm.includes('ocean drive') ||
    norm.includes('portmiami') ||
    norm.includes('aventura') ||
    norm.includes('brickell') ||
    norm.includes('key biscayne')
  ) {
    return 'Miami - FL';
  }

  // Tampa region
  if (
    norm.includes('tampa') ||
    norm.includes(' tpa') ||
    norm.includes('busch gardens') ||
    norm.includes('clearwater') ||
    norm.includes('adventure island') ||
    norm.includes('ybor city')
  ) {
    return 'Tampa - FL';
  }

  // Cape Canaveral / Space Coast
  if (
    norm.includes('kennedy space') ||
    norm.includes('cape canaveral') ||
    norm.includes('port canaveral') ||
    norm.includes('cocoa beach') ||
    norm.includes('nasa')
  ) {
    return 'Cape Canaveral - FL';
  }

  // Kissimmee region
  if (norm.includes('kissimmee') || norm.includes('celebration') || norm.includes('old town')) {
    return 'Kissimmee - FL';
  }

  // Orlando region
  if (
    norm.includes('orlando') ||
    norm.includes(' mco') ||
    norm.includes(' sfb') ||
    norm.includes('sanford') ||
    norm.includes('disney') ||
    norm.includes('magic kingdom') ||
    norm.includes('epcot') ||
    norm.includes('hollywood studios') ||
    norm.includes('animal kingdom') ||
    norm.includes('typhoon lagoon') ||
    norm.includes('blizzard beach') ||
    norm.includes('universal') ||
    norm.includes('islands of adventure') ||
    norm.includes('volcano bay') ||
    norm.includes('epic universe') ||
    norm.includes('citywalk') ||
    norm.includes('seaworld') ||
    norm.includes('aquatica') ||
    norm.includes('discovery cove') ||
    norm.includes('international drive') ||
    norm.includes('i drive') ||
    norm.includes('vineland') ||
    norm.includes('florida mall') ||
    norm.includes('millenia') ||
    norm.includes('disney springs') ||
    norm.includes('icon park') ||
    norm.includes('wonderworks') ||
    norm.includes('gatorland') ||
    norm.includes('fun spot')
  ) {
    return 'Orlando - FL';
  }

  return null;
}

/**
 * Resolves the exact city location (e.g., "Orlando - FL", "Miami - FL") by analyzing:
 * 1. The park name or activity string itself
 * 2. Current day's title, park, schedule items, morning/afternoon/night notes
 * 3. Previous events/days (event before)
 * 4. Next events/days (event after)
 * 5. Destination setting fallback or default "Orlando - FL"
 */
export function resolveCityForDayOrEvent(
  parkOrEventText?: string,
  dayContext?: any,
  allDays?: any[],
  dayIndex?: number,
  destinationSetting?: string
): string {
  // 1. Direct text check
  if (parkOrEventText) {
    const directCity = inferCityLocationFromText(parkOrEventText);
    if (directCity) return directCity;
  }

  // Helper to extract city from a day object
  const extractCityFromDay = (d: any): string | null => {
    if (!d) return null;
    if (d.park) {
      const c = inferCityLocationFromText(d.park);
      if (c) return c;
    }
    if (d.title) {
      const c = inferCityLocationFromText(d.title);
      if (c) return c;
    }
    if (d.morning?.where || d.morning?.notes) {
      const c = inferCityLocationFromText(`${d.morning.where || ''} ${d.morning.notes || ''}`);
      if (c) return c;
    }
    if (d.afternoon?.where || d.afternoon?.notes) {
      const c = inferCityLocationFromText(`${d.afternoon.where || ''} ${d.afternoon.notes || ''}`);
      if (c) return c;
    }
    if (d.night?.where || d.night?.notes) {
      const c = inferCityLocationFromText(`${d.night.where || ''} ${d.night.notes || ''}`);
      if (c) return c;
    }
    if (d.hourlySchedule && Array.isArray(d.hourlySchedule)) {
      for (const item of d.hourlySchedule) {
        const text = `${item.title || ''} ${item.location || ''} ${item.notes || ''}`;
        const c = inferCityLocationFromText(text);
        if (c) return c;
      }
    }
    return null;
  };

  // 2. Check current day context
  if (dayContext) {
    const dayCity = extractCityFromDay(dayContext);
    if (dayCity) return dayCity;
  }

  // Determine current day index if not passed directly
  let idx = dayIndex;
  if (idx === undefined && allDays && dayContext) {
    idx = allDays.findIndex((d) => d === dayContext || d.dayNumber === dayContext.dayNumber || d.id === dayContext.id);
  }

  // 3. Search backwards (events/days BEFORE)
  if (allDays && Array.isArray(allDays) && idx !== undefined && idx >= 0) {
    for (let i = idx - 1; i >= 0; i--) {
      const prevCity = extractCityFromDay(allDays[i]);
      if (prevCity) return prevCity;
    }
  }

  // 4. Search forwards (events/days AFTER)
  if (allDays && Array.isArray(allDays) && idx !== undefined && idx >= 0) {
    for (let i = idx + 1; i < allDays.length; i++) {
      const nextCity = extractCityFromDay(allDays[i]);
      if (nextCity) return nextCity;
    }
  }

  // If no day index was given but allDays exists, scan all days
  if (allDays && Array.isArray(allDays)) {
    for (const d of allDays) {
      const c = extractCityFromDay(d);
      if (c) return c;
    }
  }

  // 5. Destination setting
  if (destinationSetting) {
    const destCity = inferCityLocationFromText(destinationSetting);
    if (destCity) return destCity;
  }

  // Default fallback
  return 'Orlando - FL';
}

/**
 * Returns the formatted fallback accommodation location string (e.g. "Hospedagem - Orlando - FL" or "Hospedagem - Miami - FL")
 */
export function getFallbackAccommodationLocation(
  parkOrEventText?: string,
  dayContext?: any,
  allDays?: any[],
  dayIndex?: number,
  destinationSetting?: string
): string {
  const city = resolveCityForDayOrEvent(parkOrEventText, dayContext, allDays, dayIndex, destinationSetting);
  return `Hospedagem - ${city}`;
}

export interface ParkScheduleResult {
  currentDaySchedule: HourlyScheduleItem[];
  nextDayOverflowItems: HourlyScheduleItem[];
}

/**
 * Converte um item de FastPass/Lightning Lane para um item da tabela hora a hora do roteiro.
 */
export function convertFastPassToHourly(
  fp: FastPassItem,
  parkName: string,
  parkBookingId: string
): HourlyScheduleItem {
  let time = '10:00';
  if (fp.timeWindow) {
    const match = fp.timeWindow.match(/(\d{1,2}:\d{2})/);
    if (match) {
      const parts = match[1].split(':');
      time = `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }
  }

  const normPark = (parkName || '').toLowerCase();
  const isDisney = normPark.includes('disney') ||
    normPark.includes('magic kingdom') ||
    normPark.includes('epcot') ||
    normPark.includes('hollywood') ||
    normPark.includes('animal kingdom') ||
    normPark.includes('typhoon') ||
    normPark.includes('blizzard');

  let serviceLabel = 'Lightning Lane';
  if (isDisney) {
    serviceLabel = 'Lightning Lane';
  } else if (fp.type && !fp.type.toLowerCase().includes('fastpass')) {
    serviceLabel = fp.type;
  } else if (normPark.includes('universal')) {
    serviceLabel = 'Universal Express';
  } else if (fp.type) {
    serviceLabel = fp.type;
  } else {
    serviceLabel = 'Passe de Fila';
  }

  const details: string[] = [];
  if (fp.timeWindow) details.push(`Janela: ${fp.timeWindow}`);
  if (fp.type) details.push(`Serviço: ${fp.type}`);
  if (fp.tier) details.push(`Tier: ${fp.tier}`);
  if (fp.partyMembers) details.push(`Grupo: ${fp.partyMembers}`);
  if (fp.notes) details.push(fp.notes);

  const rawAttraction = (fp.attractionName || 'Atração Agendada').trim();
  let title: string;
  if (rawAttraction.startsWith('⚡')) {
    title = rawAttraction.replace(/⚡\s*Fast\s*Pass:/gi, `⚡ ${serviceLabel}:`).replace(/⚡\s*FastPass:/gi, `⚡ ${serviceLabel}:`);
  } else {
    title = `⚡ ${serviceLabel}: ${rawAttraction}`;
  }

  return {
    id: `auto-fp-${fp.id || Math.random().toString(36).substring(2, 8)}`,
    time,
    title,
    location: parkName,
    category: 'park',
    completed: fp.status === 'Concluído',
    notes: details.join(' • '),
    sourceType: 'fastpass',
    sourceId: fp.id || parkBookingId,
  };
}

/**
 * Converte uma reserva de restaurante/refeição para um item da tabela hora a hora do roteiro.
 */
export function convertDiningToHourly(
  dr: DiningReservationItem,
  parkName: string,
  parkBookingId: string
): HourlyScheduleItem {
  let time = '12:30';
  if (dr.time) {
    const match = dr.time.match(/(\d{1,2}:\d{2})/);
    if (match) {
      const parts = match[1].split(':');
      time = `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }
  }

  const details: string[] = [];
  if (dr.mealType) details.push(dr.mealType.replace(/\s*\([^)]*\)/g, '').trim());
  details.push(dr.tableService ? 'Table Service (com garçom)' : 'Quick Service');
  if (dr.partySize) details.push(`${dr.partySize} pessoas`);
  if (dr.confirmationCode) details.push(`Confirmação: ${dr.confirmationCode}`);
  if (dr.cancellationPolicyNotes) details.push(`Política: ${dr.cancellationPolicyNotes}`);
  if (dr.notes) details.push(dr.notes);

  const cleanMeal = dr.mealType ? dr.mealType.replace(/\s*\([^)]*\)/g, '').trim() : 'Refeição';
  const rawRest = (dr.restaurantName || 'Restaurante').trim();
  const title = rawRest.startsWith('🍽️') ? rawRest : `🍽️ ${cleanMeal}: ${rawRest}`;

  return {
    id: `auto-din-${dr.id || Math.random().toString(36).substring(2, 8)}`,
    time,
    title,
    location: dr.restaurantName || parkName,
    category: 'dining',
    completed: dr.status === 'Confirmada' || (dr.status as any) === 'Concluído',
    notes: details.join(' • '),
    sourceType: 'dining',
    sourceId: dr.id || parkBookingId,
  };
}

/**
 * Cria um lembrete separado 15 minutos antes da reserva do restaurante (Regra 4)
 */
export function convertDiningReminderToHourly(
  dr: DiningReservationItem,
  parkName: string,
  parkBookingId: string
): HourlyScheduleItem | null {
  if (!dr || !dr.time) return null;
  const match = dr.time.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const totalMins = Math.max(0, h * 60 + m - 15);
  const remH = Math.floor(totalMins / 60);
  const remM = totalMins % 60;
  const remTime = `${String(remH).padStart(2, '0')}:${String(remM).padStart(2, '0')}`;

  const rawRest = (dr.restaurantName || 'Restaurante').trim();

  return {
    id: `auto-din-reminder-${dr.id || Math.random().toString(36).substring(2, 8)}`,
    time: remTime,
    title: `⏰ Lembrete: Apresentação para ${rawRest}`,
    location: dr.restaurantName || parkName,
    category: 'dining',
    completed: false,
    notes: `Lembrete de apresentação com 15 minutos de antecedência para check-in na recepção de ${rawRest}. Horário reservado da refeição: ${dr.time}.`,
    sourceType: 'dining',
    sourceId: dr.id || parkBookingId,
  };
}

/**
 * Converte uma reserva/agendamento de show, fogos ou parada para a tabela hora a hora.
 */
export function convertShowToHourly(
  show: ShowReservationItem,
  parkName: string,
  parkBookingId: string
): HourlyScheduleItem {
  let time = '20:00';
  if (show.time) {
    const match = show.time.match(/(\d{1,2}:\d{2})/);
    if (match) {
      const parts = match[1].split(':');
      time = `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }
  }

  const details: string[] = [];
  if (show.reservedArea) details.push(`Área: ${show.reservedArea}`);
  if (show.status) details.push(`Status: ${show.status}`);
  if (show.notes) details.push(show.notes);

  const rawName = (show.showName || 'Apresentação').trim();
  const lowerName = rawName.toLowerCase();
  let title: string;
  if (rawName.startsWith('🎆')) {
    title = rawName;
  } else if (lowerName.includes('show') || lowerName.includes('parada') || lowerName.includes('fogos') || lowerName.includes('encerramento') || lowerName.includes('fireworks')) {
    title = `🎆 ${rawName}`;
  } else {
    title = `🎆 Show / Parada: ${rawName}`;
  }

  return {
    id: `auto-show-${show.id || Math.random().toString(36).substring(2, 8)}`,
    time,
    title,
    location: show.location || parkName,
    category: 'park',
    completed: (show.status as any) === 'Assistido' || (show.status as any) === 'Concluído',
    notes: details.length > 0 ? details.join(' • ') : undefined,
    sourceType: 'show',
    sourceId: show.id || parkBookingId,
  };
}

/**
 * Generates dynamic hourly schedule items for a park day, separating items that
 * occur before midnight (current day) from items that occur after midnight (next day).
 */
export function generateParkScheduleResult(
  parkName: string,
  openingTime: string = '09:00',
  closingTime: string = '21:00',
  earlyEntryTime?: string,
  accommodationName?: string,
  existingSchedule: HourlyScheduleItem[] = [],
  parkBookingId?: string,
  dayNumber?: number,
  accommodationAddress?: string,
  dayContext?: any,
  allDays?: any[],
  destinationSetting?: string,
  parkBookingEvents?: {
    fastPasses?: FastPassItem[];
    diningReservations?: DiningReservationItem[];
    showsAndParades?: ShowReservationItem[];
  } | ParkDayBooking
): ParkScheduleResult {
  const isNonPark = isNonParkEvent(parkName);

  const hasAccommodation = Boolean(
    accommodationName &&
      accommodationName.trim() &&
      accommodationName.trim().toLowerCase() !== 'hospedagem' &&
      accommodationName.trim().toLowerCase() !== 'nenhuma cadastrada' &&
      !accommodationName.trim().toLowerCase().startsWith('hospedagem -') &&
      !accommodationName.trim().toLowerCase().startsWith('hospedagem (')
  );
  const hotelTitle = hasAccommodation ? accommodationName!.trim() : '';

  if (isNonPark) {
    // If it's not a theme park, do not generate theme park opening/closing/turnstiles
    return {
      currentDaySchedule: cleanInvalidAutoItems(existingSchedule, hasAccommodation, false, parkName),
      nextDayOverflowItems: [],
    };
  }

  // Derive day identifier for stable deterministic IDs
  const dayKey = dayNumber
    ? `day-${dayNumber}`
    : parkBookingId
    ? `pb-${parkBookingId}`
    : `park-${parkName.replace(/\s+/g, '-').toLowerCase()}`;
  const pbSourceId = parkBookingId || `pb-${parkName}`;

  const baseTargetTime = earlyEntryTime || openingTime || '09:00';
  const [targetH, targetM] = baseTargetTime.split(':').map((v) => parseInt(v, 10));
  const targetMins = (isNaN(targetH) ? 9 : targetH) * 60 + (isNaN(targetM) ? 0 : targetM);

  const [closeH, closeM] = (closingTime || '21:00').split(':').map((v) => parseInt(v, 10));
  const rawCloseMins = (isNaN(closeH) ? 21 : closeH) * 60 + (isNaN(closeM) ? 0 : closeM);

  // If closing hour is past midnight (e.g. 00:00, 00:30, 01:00, 02:00, 03:00, 04:00, 05:00) or rawCloseMins <= targetMins
  const isClosingPastMidnight = rawCloseMins <= targetMins || (!isNaN(closeH) && closeH <= 5);
  const effectiveCloseMins = isClosingPastMidnight ? rawCloseMins + 1440 : rawCloseMins;

  const formatMins = (m: number) => {
    const norm = ((m % 1440) + 1440) % 1440;
    const hours = Math.floor(norm / 60);
    const mins = norm % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const currentDayGenerated: HourlyScheduleItem[] = [];
  const nextDayOverflow: HourlyScheduleItem[] = [];

  const effectiveBookingEvents = parkBookingEvents || dayContext?.parkBooking;
  const resolvedPbSourceId = parkBookingId || effectiveBookingEvents?.id || pbSourceId;
  const resolvedParkDisplayName = parkName || effectiveBookingEvents?.parkName || 'Parque';
  const fastPasses: FastPassItem[] = (effectiveBookingEvents as any)?.fastPasses || [];
  const diningList: DiningReservationItem[] = (effectiveBookingEvents as any)?.diningReservations || [];
  const showsList: ShowReservationItem[] = (effectiveBookingEvents as any)?.showsAndParades || [];

  // Preserve custom user items while removing old auto transport/hotel/park schedule items to avoid duplicates
  const customUserItems = (existingSchedule || []).filter((item) => {
    const titleLower = (item.title || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();

    // Check if it's an auto-generated park item or hotel bookend item
    if (
      titleLower.includes('acordar') ||
      titleLower.includes('início do dia na acomodação') ||
      titleLower.includes('inicio do dia na acomodação') ||
      titleLower.includes('fim do dia na acomodação') ||
      titleLower.includes('fim do dia na hospedagem') ||
      titleLower.includes('chegada e fim do dia na acomodação') ||
      titleLower.includes('chegada e fim do dia na hospedagem') ||
      titleLower.startsWith('saída de') ||
      titleLower.startsWith('saida de') ||
      titleLower.startsWith('saída do hotel') ||
      titleLower.startsWith('saida do hotel') ||
      titleLower.startsWith('🏨 saída do hotel') ||
      titleLower.startsWith('🏨 saida do hotel') ||
      titleLower.startsWith('🚗 saída de') ||
      titleLower.startsWith('🚗 saida de') ||
      titleLower.startsWith('deslocamento e chegada') ||
      titleLower.startsWith('deslocamento e estacionamento') ||
      titleLower.startsWith('🚗 deslocamento e estacionamento') ||
      titleLower.includes('chegada no estacionamento') ||
      titleLower.includes('chegada ao estacionamento') ||
      titleLower.includes('chegada no portão') ||
      titleLower.includes('chegada no portao') ||
      titleLower.includes('chegada na entrada') ||
      titleLower.includes('chegada ao portão') ||
      titleLower.includes('chegada ao portao') ||
      titleLower.includes('chegada ao carro') ||
      titleLower.includes('chegada no carro') ||
      titleLower.startsWith('entrada antecipada') ||
      titleLower.startsWith('abertura oficial') ||
      titleLower.startsWith('fechamento de') ||
      titleLower.startsWith('🌙 fechamento de') ||
      titleLower.startsWith('saída do parque') ||
      titleLower.startsWith('saida do parque') ||
      titleLower.startsWith('chegada em') ||
      titleLower.startsWith('chegada ao') ||
      titleLower.startsWith('chegada na acomodação') ||
      titleLower.startsWith('🏨 chegada ao hotel') ||
      titleLower.startsWith('🏨 chegada no hotel') ||
      idLower.startsWith('auto-acordar') ||
      idLower.startsWith('auto-wake') ||
      idLower.startsWith('auto-ida') ||
      idLower.startsWith('auto-abertura') ||
      idLower.startsWith('auto-saida-parque') ||
      idLower.startsWith('auto-estacionamento') ||
      idLower.startsWith('auto-carro-retorno') ||
      idLower.startsWith('auto-hotel-') ||
      idLower.startsWith('auto-retorno') ||
      idLower.includes('hourly-acc-morning') ||
      idLower.includes('hourly-acc-night')
    ) {
      return false;
    }

    // Purge previous auto-generated fast pass, dining, and show items
    if (
      item.sourceType === 'fastpass' ||
      idLower.startsWith('auto-fp-') ||
      titleLower.startsWith('⚡ fast pass:') ||
      titleLower.startsWith('⚡ fastpass:') ||
      titleLower.startsWith('⚡')
    ) {
      return false;
    }
    if (
      item.sourceType === 'dining' ||
      idLower.startsWith('auto-din-') ||
      (titleLower.startsWith('🍽️') && (item.sourceType === 'dining' || idLower.startsWith('auto-') || item.category === 'dining' || (resolvedParkDisplayName && item.location === resolvedParkDisplayName)))
    ) {
      return false;
    }
    if (
      item.sourceType === 'show' ||
      idLower.startsWith('auto-show-') ||
      titleLower.startsWith('🎆 show') ||
      titleLower.startsWith('🎆')
    ) {
      return false;
    }

    return true;
  });

  const customTransit = (dayContext as any)?.parkTransitMinutes || (parkBookingEvents as any)?.transitMinutes;
  const parkMetrics = getParkTransitInfo(parkName, customTransit);
  const maxParkingMins = parkMetrics.maxParkingMins;
  const currentParkDisplayName = parkMetrics.name || parkName;

  // Regra 3: Horário-alvo de chegada à entrada do parque: 30 minutos antes da abertura normal ou do Early Entry
  const portaoMins = Math.max(0, targetMins - 30);
  // Horário de chegada ao estacionamento: 30 min antes da abertura menos o tempo entre estacionamento e entrada
  const estacionamentoMins = Math.max(0, portaoMins - maxParkingMins);

  // Regra 3: Para calcular o retorno, usar o fim da última atividade prevista no parque
  let latestActivityEndMins = effectiveCloseMins;

  showsList.forEach((show: ShowReservationItem) => {
    if (show && show.time) {
      const [sH, sM] = show.time.split(':').map((v) => parseInt(v, 10));
      if (!isNaN(sH)) {
        let showEndMins = sH * 60 + (isNaN(sM) ? 0 : sM) + 30; // ~30 min de show
        if (showEndMins <= targetMins && sH <= 5) showEndMins += 1440;
        if (showEndMins > latestActivityEndMins) latestActivityEndMins = showEndMins;
      }
    }
  });

  diningList.forEach((dr: DiningReservationItem) => {
    if (dr && dr.time) {
      const [dH, dM] = dr.time.split(':').map((v) => parseInt(v, 10));
      if (!isNaN(dH)) {
        let diningEndMins = dH * 60 + (isNaN(dM) ? 0 : dM) + 60; // ~60 min de refeição
        if (diningEndMins <= targetMins && dH <= 5) diningEndMins += 1440;
        if (diningEndMins > latestActivityEndMins) latestActivityEndMins = diningEndMins;
      }
    }
  });

  customUserItems.forEach((item) => {
    if (item.time && (item.category === 'dining' || item.category === 'park' || (item.sourceType && item.sourceType !== 'accommodation' && item.sourceType !== 'transport'))) {
      const [iH, iM] = item.time.split(':').map((v) => parseInt(v, 10));
      if (!isNaN(iH)) {
        let itemEndMins = iH * 60 + (isNaN(iM) ? 0 : iM) + 30;
        if (itemEndMins <= targetMins && iH <= 5) itemEndMins += 1440;
        if (itemEndMins > latestActivityEndMins) latestActivityEndMins = itemEndMins;
      }
    }
  });

  const saidaParqueMins = latestActivityEndMins;
  const chegadaCarroMins = saidaParqueMins + maxParkingMins;

  if (!hasAccommodation) {
    // CASE A: Sem acomodação cadastrada (1h padrão de viagem de carro)
    const saidaHotelMins = Math.max(0, estacionamentoMins - 60);
    const wakeUpMins = Math.max(0, saidaHotelMins - 30);
    const chegadaHotelMins = chegadaCarroMins + 60;
    const defaultHospedagemLocation = getFallbackAccommodationLocation(
      currentParkDisplayName,
      dayContext,
      allDays,
      dayNumber ? dayNumber - 1 : undefined,
      destinationSetting
    );

    // 1. Acordar 30 min antes da saída (Regra 3)
    currentDayGenerated.push({
      id: `auto-acordar-${dayKey}`,
      time: formatMins(wakeUpMins),
      title: `⏰ Acordar — ${defaultHospedagemLocation}`,
      location: defaultHospedagemLocation,
      category: 'hotel',
      notes: `Despertar 30 min antes da saída planejada para ${currentParkDisplayName}. Café da manhã e preparativos.`,
      sourceType: 'accommodation',
    });

    // 2. Saída da Hospedagem
    currentDayGenerated.push({
      id: `auto-hotel-saida-${dayKey}`,
      time: formatMins(saidaHotelMins),
      title: `🏨 Saída de ${defaultHospedagemLocation}`,
      location: defaultHospedagemLocation,
      category: 'transport',
      notes: `Saída em direção a ${currentParkDisplayName}. Trajeto estimado: 1h de viagem de carro + ${maxParkingMins} min do estacionamento até as catracas para chegar 30 min antes da abertura.`,
      sourceType: 'accommodation',
    });

    // 3. Chegada no Estacionamento
    currentDayGenerated.push({
      id: `auto-estacionamento-${dayKey}`,
      time: formatMins(estacionamentoMins),
      title: `🚗 Chegada no Estacionamento (${maxParkingMins} min até a entrada)`,
      location: currentParkDisplayName,
      category: 'transport',
      notes: `Chegada ao estacionamento de ${currentParkDisplayName} e percurso até as catracas (${maxParkingMins} min).`,
      sourceType: 'park',
      sourceId: pbSourceId,
    });

    // 4. Chegada na Entrada do Parque (30 min antes da abertura) (Regra 3)
    currentDayGenerated.push({
      id: `auto-ida-${dayKey}`,
      time: formatMins(portaoMins),
      title: `🎟️ Chegada na Entrada do Parque (30 min antes da abertura)`,
      location: currentParkDisplayName,
      category: 'park',
      notes: earlyEntryTime
        ? `Posicionamento nas catracas e revista de segurança para Entrada Antecipada (Early Entry) às ${earlyEntryTime}.`
        : `Posicionamento nas catracas e revista de segurança para Abertura Oficial às ${openingTime}.`,
      sourceType: 'park',
      sourceId: pbSourceId,
    });

    // 5. Abertura Oficial / Early Entry
    currentDayGenerated.push({
      id: `auto-abertura-${dayKey}`,
      time: baseTargetTime,
      title: earlyEntryTime
        ? `Entrada Antecipada (Early Entry) em ${currentParkDisplayName}`
        : `Abertura Oficial de ${currentParkDisplayName}`,
      location: currentParkDisplayName,
      category: 'park',
      notes: `Início do funcionamento e exploração das atrações de ${currentParkDisplayName}.`,
      sourceType: 'park',
      sourceId: pbSourceId,
    });

    // 6. Fechamento / Término das atividades no Parque
    const itemFechamento: HourlyScheduleItem = {
      id: saidaParqueMins >= 1440 ? `auto-saida-parque-next-${dayKey}` : `auto-saida-parque-${dayKey}`,
      time: formatMins(saidaParqueMins),
      title: `🌙 Término das atividades em ${currentParkDisplayName} e Saída`,
      location: currentParkDisplayName,
      category: 'park',
      notes: saidaParqueMins > effectiveCloseMins
        ? `Encerramento da última atividade no parque às ${formatMins(saidaParqueMins)} (após fechamento das ${formatMins(effectiveCloseMins)}) e percurso até o carro (${maxParkingMins} min).`
        : `Fechamento do parque ${currentParkDisplayName} e percurso até o carro no estacionamento (${maxParkingMins} min).`,
      sourceType: 'park',
      sourceId: pbSourceId,
    };
    if (saidaParqueMins >= 1440) {
      nextDayOverflow.push(itemFechamento);
    } else {
      currentDayGenerated.push(itemFechamento);
    }

    // 7. Chegada ao Carro no Estacionamento
    const itemCarro: HourlyScheduleItem = {
      id: chegadaCarroMins >= 1440 ? `auto-carro-retorno-next-${dayKey}` : `auto-carro-retorno-${dayKey}`,
      time: formatMins(chegadaCarroMins),
      title: `🚗 Chegada ao Carro no Estacionamento`,
      location: currentParkDisplayName,
      category: 'transport',
      notes: `Embarque no veículo e início da viagem de volta para ${defaultHospedagemLocation} (1h de trajeto estimado).`,
      sourceType: 'park',
      sourceId: pbSourceId,
    };
    if (chegadaCarroMins >= 1440) {
      nextDayOverflow.push(itemCarro);
    } else {
      currentDayGenerated.push(itemCarro);
    }

    // 8. Chegada e Fim do dia na acomodação
    const itemHotel: HourlyScheduleItem = {
      id: chegadaHotelMins >= 1440 ? `auto-hotel-retorno-next-${dayKey}` : `auto-hotel-retorno-${dayKey}`,
      time: formatMins(chegadaHotelMins),
      title: `🏨 Chegada a ${defaultHospedagemLocation} e Descanso`,
      location: defaultHospedagemLocation,
      category: 'hotel',
      notes: `Chegada a ${defaultHospedagemLocation} após o fechamento do parque para descanso.`,
      sourceType: 'accommodation',
    };
    if (chegadaHotelMins >= 1440) {
      nextDayOverflow.push(itemHotel);
    } else {
      currentDayGenerated.push(itemHotel);
    }
  } else {
    // CASE B: Com acomodação cadastrada (tempo de Maps + estacionamento dinâmico)
    const metrics = getDriveAndParkingMetrics(parkName, hotelTitle, accommodationAddress, customTransit);
    const driveMins = metrics.driveMins;

    // Regra 3: Horário de saída da acomodação = horário-alvo (30 min antes de abrir) - carro até estacionamento - estacionamento até entrada
    const saidaMins = Math.max(0, estacionamentoMins - driveMins);
    // Regra 3: Criar o evento de acordar exatamente 30 minutos antes do horário calculado de saída da acomodação
    const wakeUpMins = Math.max(0, saidaMins - 30);
    const chegadaHotelMins = chegadaCarroMins + driveMins;

    const effectiveAccLocation = accommodationAddress && accommodationAddress.trim()
      ? accommodationAddress.trim()
      : (hotelTitle || 'Acomodação');

    const isArrivalDay = dayNumber === 1 || (dayContext?.title || '').toLowerCase().includes('chegada');

    // 1. Acordar exatamente 30 min antes da saída planejada da acomodação (Regra 2 & Regra 3)
    if (!isArrivalDay) {
      currentDayGenerated.push({
        id: `auto-acordar-${dayKey}`,
        time: formatMins(wakeUpMins),
        title: `⏰ Acordar — ${hotelTitle}`,
        location: effectiveAccLocation,
        category: 'hotel',
        notes: `Despertar 30 min antes da saída planejada para ${currentParkDisplayName}. Café da manhã e preparativos.`,
        sourceType: 'accommodation',
      });
    }

    // 2. Saída da acomodação (Regra 3)
    currentDayGenerated.push({
      id: `auto-saida-${dayKey}`,
      time: formatMins(saidaMins),
      title: `🚗 Saída de ${hotelTitle}`,
      location: effectiveAccLocation,
      category: 'transport',
      notes: `Saída de carro em direção a ${currentParkDisplayName}. Trajeto estimado: ${driveMins} min de carro + ${maxParkingMins} min do estacionamento até as catracas para chegar 30 min antes da abertura.`,
      sourceType: 'accommodation',
    });

    // 3. Chegada no Estacionamento
    let parkingSpecificNote = `Chegada ao estacionamento de ${currentParkDisplayName} e percurso até as catracas/entrada (${maxParkingMins} min).`;
    const normPark = (parkName || '').toLowerCase();
    if (normPark.includes('magic kingdom') || normPark.includes('mk')) {
      parkingSpecificNote = `Estacionamento no TTC e travessia de monotrilho ou ferry até a entrada principal do Magic Kingdom (${maxParkingMins} min).`;
    } else if (normPark.includes('volcano bay')) {
      parkingSpecificNote = `Estacionamento na garagem Universal e acesso ao shuttle obrigatório até Volcano Bay (${maxParkingMins} min — estimativa provisória que inclui o acesso ao shuttle).`;
    } else if (normPark.includes('epic universe')) {
      parkingSpecificNote = `Estacionamento e caminhada até as catracas de Epic Universe (${maxParkingMins} min — estimativa provisória).`;
    } else if (parkMetrics.isEstimated) {
      parkingSpecificNote = `Chegada ao estacionamento de ${currentParkDisplayName} e percurso até a entrada (${maxParkingMins} min — estimativa de planejamento editável por parque).`;
    }

    currentDayGenerated.push({
      id: `auto-estacionamento-${dayKey}`,
      time: formatMins(estacionamentoMins),
      title: `🚗 Chegada no Estacionamento (${maxParkingMins} min até a entrada)`,
      location: currentParkDisplayName,
      category: 'transport',
      notes: parkingSpecificNote,
      sourceType: 'park',
      sourceId: pbSourceId,
    });

    // 4. Chegada na Entrada do Parque (30 min antes da abertura) (Regra 3)
    currentDayGenerated.push({
      id: `auto-ida-${dayKey}`,
      time: formatMins(portaoMins),
      title: `🎟️ Chegada na Entrada do Parque (30 min antes da abertura)`,
      location: currentParkDisplayName,
      category: 'park',
      notes: earlyEntryTime
        ? `Posicionamento nas catracas e revista de segurança para Entrada Antecipada (Early Entry) às ${earlyEntryTime}.`
        : `Posicionamento nas catracas e revista de segurança para Abertura Oficial às ${openingTime}.`,
      sourceType: 'park',
      sourceId: pbSourceId,
    });

    // 5. Abertura Oficial ou Early Entry
    currentDayGenerated.push({
      id: `auto-abertura-${dayKey}`,
      time: baseTargetTime,
      title: earlyEntryTime
        ? `Entrada Antecipada (Early Entry) em ${currentParkDisplayName}`
        : `Abertura Oficial de ${currentParkDisplayName}`,
      location: currentParkDisplayName,
      category: 'park',
      notes: `Início do funcionamento e exploração das atrações de ${currentParkDisplayName}.`,
      sourceType: 'park',
      sourceId: pbSourceId,
    });

    // 6. Fechamento do Parque e Ida para a acomodação (Regra 3)
    const itemFechamento: HourlyScheduleItem = {
      id: saidaParqueMins >= 1440 ? `auto-saida-parque-next-${dayKey}` : `auto-saida-parque-${dayKey}`,
      time: formatMins(saidaParqueMins),
      title: `🌙 Término das atividades em ${currentParkDisplayName} e Ida para ${hotelTitle}`,
      location: currentParkDisplayName,
      category: 'park',
      notes: saidaParqueMins > effectiveCloseMins
        ? `Término da última atividade no parque às ${formatMins(saidaParqueMins)} (após fechamento das ${formatMins(effectiveCloseMins)}) e percurso até o carro (${maxParkingMins} min).`
        : `Fechamento do parque ${currentParkDisplayName} e percurso até o carro no estacionamento (${maxParkingMins} min).`,
      sourceType: 'park',
      sourceId: pbSourceId,
    };
    if (saidaParqueMins >= 1440) {
      nextDayOverflow.push(itemFechamento);
    } else {
      currentDayGenerated.push(itemFechamento);
    }

    // 7. Chegada ao Carro no Estacionamento
    const itemCarro: HourlyScheduleItem = {
      id: chegadaCarroMins >= 1440 ? `auto-carro-retorno-next-${dayKey}` : `auto-carro-retorno-${dayKey}`,
      time: formatMins(chegadaCarroMins),
      title: `🚗 Chegada ao Carro no Estacionamento`,
      location: currentParkDisplayName,
      category: 'transport',
      notes: chegadaCarroMins >= 1440
        ? `Embarque no veículo na madrugada e viagem de volta para ${hotelTitle} (${driveMins} min de trajeto via Maps).`
        : `Embarque no veículo e início da viagem de volta para ${hotelTitle} (${driveMins} min de trajeto via Maps).`,
      sourceType: 'park',
      sourceId: pbSourceId,
    };
    if (chegadaCarroMins >= 1440) {
      nextDayOverflow.push(itemCarro);
    } else {
      currentDayGenerated.push(itemCarro);
    }

    // 8. Chegada e Fim do dia na acomodação (Regra 3)
    const itemRetorno: HourlyScheduleItem = {
      id: chegadaHotelMins >= 1440 ? `auto-retorno-next-${dayKey}` : `auto-retorno-${dayKey}`,
      time: formatMins(chegadaHotelMins),
      title: `🌙 Chegada e Fim do dia na acomodação (${hotelTitle})`,
      location: effectiveAccLocation,
      category: 'hotel',
      notes: chegadaHotelMins >= 1440
        ? `Chegada na acomodação na madrugada após ${currentParkDisplayName} (${maxParkingMins} min estacionamento + ${driveMins} min de carro) e descanso.`
        : `Chegada e descanso na acomodação após as atividades no parque (${maxParkingMins} min estacionamento + ${driveMins} min de carro).`,
      sourceType: 'accommodation',
    };
    if (chegadaHotelMins >= 1440) {
      nextDayOverflow.push(itemRetorno);
    } else {
      currentDayGenerated.push(itemRetorno);
    }
  }

  // Adicionar eventos de FastPass, Almoço/Refeições e Shows/Paradas à agenda hora a hora
  if (effectiveBookingEvents) {
    fastPasses.forEach((fp: FastPassItem) => {
      if (fp && fp.attractionName) {
        currentDayGenerated.push(convertFastPassToHourly(fp, resolvedParkDisplayName, resolvedPbSourceId));
      }
    });

    diningList.forEach((dr: DiningReservationItem) => {
      if (dr && dr.restaurantName) {
        const reminder = convertDiningReminderToHourly(dr, resolvedParkDisplayName, resolvedPbSourceId);
        if (reminder) {
          currentDayGenerated.push(reminder);
        }
        currentDayGenerated.push(convertDiningToHourly(dr, resolvedParkDisplayName, resolvedPbSourceId));
      }
    });

    showsList.forEach((show: ShowReservationItem) => {
      if (show && show.showName) {
        currentDayGenerated.push(convertShowToHourly(show, resolvedParkDisplayName, resolvedPbSourceId));
      }
    });
  }

  const combined = [...customUserItems, ...currentDayGenerated];
  // Ordenar cronologicamente pelo horário (00:00 -> 23:59)
  combined.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

  return {
    currentDaySchedule: deduplicateHourlySchedule(combined),
    nextDayOverflowItems: nextDayOverflow,
  };
}

/**
 * Removes any overflow return items on a given day that originated from a previous day's late night / past midnight park closing.
 */
export function cleanPreviousDayOverflowItems(
  schedule: HourlyScheduleItem[] = [],
  prevDayNumber: number
): HourlyScheduleItem[] {
  const targetKey = `day-${prevDayNumber}`;
  return (schedule || []).filter((item) => {
    if (!item) return false;
    const idLower = (item.id || '').toLowerCase();
    if (idLower.includes(`next-${targetKey}`)) return false;
    if (idLower.includes(`-next-day-${prevDayNumber}`)) return false;
    return true;
  });
}

/**
 * Convenience wrapper around generateParkScheduleResult that returns combined current day schedule.
 */
export function generateParkHourlySchedule(
  parkName: string,
  openingTime: string = '09:00',
  closingTime: string = '21:00',
  earlyEntryTime?: string,
  accommodationName?: string,
  existingSchedule: HourlyScheduleItem[] = [],
  parkBookingId?: string,
  dayNumber?: number,
  accommodationAddress?: string,
  dayContext?: any,
  allDays?: any[],
  destinationSetting?: string,
  parkBookingEvents?: {
    fastPasses?: FastPassItem[];
    diningReservations?: DiningReservationItem[];
    showsAndParades?: ShowReservationItem[];
  } | ParkDayBooking
): HourlyScheduleItem[] {
  const effectiveEvents = parkBookingEvents || dayContext?.parkBooking;
  const result = generateParkScheduleResult(
    parkName,
    openingTime,
    closingTime,
    earlyEntryTime,
    accommodationName,
    existingSchedule,
    parkBookingId,
    dayNumber,
    accommodationAddress,
    dayContext,
    allDays,
    destinationSetting,
    effectiveEvents
  );
  return result.currentDaySchedule;
}

/**
 * Regra Única e Centralizada para "Início do dia na acomodação":
 * - Cria um único evento automático às 07:30 se o viajante pernoitou na acomodação na noite anterior.
 * - NÃO cria no dia de chegada ao destino nem no dia de check-in (quando ainda não houve pernoite).
 * - No dia de check-out, cria apenas se o horário de check-out for posterior a 07:30.
 * - Em troca de hospedagem no mesmo dia, associa o início da manhã à hospedagem de origem (da qual está saindo).
 * - Vincula sourceType: 'accommodation' e sourceId igual ao ID da reserva com ID estável.
 * - Preserva estritamente horários manuais (sourceType === 'manual').
 */
export function applyAccommodationMorningRule(
  items: HourlyScheduleItem[],
  day: { dayNumber: number; date?: string; title?: string; park?: string },
  tripContext?: { accommodations?: AccommodationBooking[]; startDate?: string; flights?: any[] }
): HourlyScheduleItem[] {
  if (!items) items = [];
  const startDate = tripContext?.startDate || '2026-12-30';
  const realDate = day.date || offsetDateString(startDate, (day.dayNumber || 1) - 1);
  const accommodations = tripContext?.accommodations || [];

  // Purgar APENAS eventos automáticos antigos de início do dia/acordar na acomodação
  const result = items.filter((item) => {
    if (!item) return false;
    if (item.sourceType === 'manual') return true; // Preserva horários manuais intactos

    const idLower = (item.id || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();

    const isAutoMorningItem =
      idLower.startsWith('auto-inicio') ||
      idLower.startsWith('auto-acordar') ||
      idLower.includes('hourly-acc-morning') ||
      idLower.includes('acc-morning') ||
      titleLower.includes('início do dia na acomodação') ||
      titleLower.includes('inicio do dia na acomodação') ||
      titleLower.includes('início do dia na hospedagem') ||
      titleLower.includes('inicio do dia na hospedagem') ||
      titleLower.includes('início do dia no hotel') ||
      titleLower.includes('inicio do dia no hotel') ||
      titleLower.startsWith('acordar —');

    return !isAutoMorningItem;
  });

  // Não criar em dia 1 ou dia com título de chegada
  const isDay1 = day.dayNumber === 1;
  const isArrivalDayTitle = (day.title || '').toLowerCase().includes('chegada');
  if (isDay1 || isArrivalDayTitle) {
    return result;
  }

  // Identificar se o viajante pernoitou em alguma acomodação na noite anterior
  // Pernoite na noite anterior significa: checkInDate <= prevDate E checkOutDate >= realDate
  const prevDate = offsetDateString(realDate, -1);
  const eligibleAccs = accommodations.filter((acc) => {
    if (!acc || !acc.checkInDate || !acc.checkOutDate) return false;
    const sleptLastNight = acc.checkInDate <= prevDate && acc.checkOutDate >= realDate;
    return sleptLastNight;
  });

  if (eligibleAccs.length === 0) {
    return result;
  }

  // Em caso de troca de hospedagem no mesmo dia, dar preferência à acomodação da qual está saindo hoje (origem)
  const morningAcc = eligibleAccs.find((a) => a.checkOutDate === realDate) || eligibleAccs[0];
  if (!morningAcc) {
    return result;
  }

  // No dia de check-out, criar somente se o horário de check-out for posterior a 07:30
  const isCheckoutToday = morningAcc.checkOutDate === realDate;
  if (isCheckoutToday) {
    const rawCheckOutTime = (morningAcc.checkOutTime || '11:00').trim();
    const timeMatch = rawCheckOutTime.match(/\d{1,2}:\d{2}/);
    const cleanTime = timeMatch ? timeMatch[0] : '11:00';
    const normalizedCheckOutTime = cleanTime.length === 4 ? `0${cleanTime}` : cleanTime;

    if (normalizedCheckOutTime.localeCompare('07:30') <= 0) {
      return result;
    }
  }

  // Se o usuário ou o sistema já tiver criado um item de início do dia / acordar, não criar duplicado automático
  const hasExistingMorning = result.some((item) => {
    const t = (item.title || '').toLowerCase();
    const id = (item.id || '').toLowerCase();
    return (
      id.startsWith('auto-acordar') ||
      id.startsWith('auto-inicio') ||
      id.includes('acc-morning') ||
      t.includes('início do dia') ||
      t.includes('inicio do dia') ||
      t.includes('acordar')
    );
  });

  if (hasExistingMorning) {
    return result;
  }

  const accName = (morningAcc.name || 'Acomodação').trim();
  const accAddress = (morningAcc.address || accName).trim();
  const accCategory: HourlyScheduleItem['category'] =
    morningAcc.type === 'airbnb' || morningAcc.type === 'house' ? 'airbnb' : 'hotel';

  const morningItem: HourlyScheduleItem = {
    id: `auto-inicio-day-${day.dayNumber}`,
    time: '07:30',
    title: `☀️ Início do dia na acomodação (${accName})`,
    location: accAddress,
    category: accCategory,
    notes: 'Café da manhã, preparativos e organização do dia.',
    completed: false,
    sourceType: 'accommodation',
    sourceId: morningAcc.id,
  };

  result.unshift(morningItem);
  return result.sort(compareScheduleItemOrder);
}

/**
 * Cleans all park references from an itinerary day when a park is removed / unlinked.
 */
export function clearParkReferencesFromDay(
  day: {
    dayNumber: number;
    title?: string;
    park?: string;
    date?: string;
    morning?: any;
    afternoon?: any;
    night?: any;
    generalNotes?: string;
    hourlySchedule?: HourlyScheduleItem[];
  },
  totalDays: number = 1,
  accommodationName?: string,
  accommodationAddress?: string,
  tripContext?: any
) {
  const oldPark = day.park && day.park !== 'Sem Parque' ? day.park : '';
  const oldParkLower = oldPark.toLowerCase();
  const dayKey = `day-${day.dayNumber}`;

  const hotelTitle = accommodationName && accommodationName.trim() ? accommodationName.trim() : '';
  const effectiveAccLoc = accommodationAddress && accommodationAddress.trim()
    ? accommodationAddress.trim()
    : (hotelTitle || 'Acomodação');

  const parkKeywords = oldParkLower
    .split(/[\s/,\-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && w !== 'disney' && w !== 'universal' && w !== 'parque');

  // Filter out any hourly schedule items referring to the park or park transport
  let cleanedHourly: HourlyScheduleItem[] = (day.hourlySchedule || [])
    .filter((item) => {
      // Horários manuais NUNCA devem ser removidos por rotinas automáticas
      if (item.sourceType === 'manual') return true;
      if (item.sourceType === 'park') return false;
      if (item.sourceType === 'fastpass') return false;
      if (item.sourceType === 'show') return false;
      if (item.category === 'park') return false;

      const titleLower = (item.title || '').toLowerCase();
      const locLower = (item.location || '').toLowerCase();
      const notesLower = (item.notes || '').toLowerCase();
      const idLower = (item.id || '').toLowerCase();

      // Remove fast pass, show, and auto park dining items
      if (
        idLower.startsWith('auto-fp-') ||
        idLower.startsWith('auto-show-') ||
        idLower.startsWith('auto-din-') ||
        titleLower.startsWith('⚡') ||
        titleLower.startsWith('🎆')
      ) {
        return false;
      }

      // Remove departure from accommodation to park ("Saída de...")
      if (
        titleLower.startsWith('saída de') ||
        titleLower.startsWith('saida de') ||
        idLower.includes('auto-saida')
      ) {
        return false;
      }

      // Remove park travel & opening / early entry / rope drop / hotel arrival items
      if (
        titleLower.startsWith('deslocamento e chegada') ||
        titleLower.startsWith('entrada antecipada') ||
        titleLower.startsWith('abertura oficial') ||
        titleLower.startsWith('saída do parque') ||
        titleLower.startsWith('saida do parque') ||
        titleLower.startsWith('chegada em') ||
        titleLower.startsWith('chegada ao') ||
        titleLower.includes('rope drop') ||
        idLower.includes('auto-ida') ||
        idLower.includes('auto-abertura') ||
        idLower.includes('auto-saida-parque') ||
        idLower.includes('auto-retorno') ||
        notesLower.includes('chegada ao hotel para descanso')
      ) {
        return false;
      }

      // Remove items specifically mentioning old park
      if (
        oldParkLower &&
        (titleLower.includes(oldParkLower) || locLower.includes(oldParkLower) || notesLower.includes(oldParkLower))
      ) {
        return false;
      }

      if (parkKeywords.some((kw) => titleLower.includes(kw) || locLower.includes(kw) || notesLower.includes(kw))) {
        return false;
      }

      return true;
    })
    .map((item) => {
      let sanitizedNotes = item.notes || '';
      if (oldParkLower && sanitizedNotes.toLowerCase().includes(oldParkLower)) {
        sanitizedNotes = sanitizedNotes.replace(new RegExp(oldPark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
      }

      // Update "Início do dia na acomodação" time to 07:30 and clean notes
      const titleLower = (item.title || '').toLowerCase();
      if (
        titleLower.includes('início do dia na acomodação') ||
        titleLower.includes('inicio do dia na acomodação') ||
        item.id.includes('hourly-acc-morning') ||
        item.id.includes('auto-inicio')
      ) {
        return {
          ...item,
          time: '07:30',
          notes: 'Café da manhã, preparativos e organização do dia.',
        };
      }

      return { ...item, notes: sanitizedNotes };
    });

  const effectiveContext = tripContext || {
    startDate: '2026-12-30',
    accommodations: hotelTitle ? [{ id: 'acc-temp', name: hotelTitle, address: effectiveAccLoc, checkInDate: '2000-01-01', checkOutDate: '2099-12-31' }] : []
  };

  // Utilize a regra única e centralizada para Início do dia na acomodação
  cleanedHourly = applyAccommodationMorningRule(cleanedHourly, day, effectiveContext);

  const hasValidHotel = Boolean(
    hotelTitle &&
    hotelTitle.trim() &&
    hotelTitle.toLowerCase() !== 'hospedagem' &&
    hotelTitle.toLowerCase() !== 'nenhuma cadastrada' &&
    !hotelTitle.toLowerCase().startsWith('hospedagem')
  );

  // Ensure "Fim do dia na acomodação" exists at 22:30 ONLY IF a valid hotel is booked
  if (hasValidHotel) {
    const hasNightEnd = cleanedHourly.some((item) => {
      const t = (item.title || '').toLowerCase();
      return (
        t.includes('fim do dia na acomodação') ||
        t.includes('fim do dia na hospedagem') ||
        t.includes('fim do dia no hotel') ||
        item.id.includes('hourly-acc-night') ||
        item.id.includes('auto-retorno')
      );
    });

    if (!hasNightEnd) {
      const nightTitle = `🌙 Fim do dia na acomodação (${hotelTitle})`;

      // Procura evento de check-in no cronograma para basear o fim do dia
      const checkInItem = cleanedHourly.find((item) => 
        (item.title.toLowerCase().includes('check-in') || item.title.toLowerCase().includes('checkin'))
      );

      let nightTime = '23:30'; // Fallback padrão caso não encontre check-in
      if (checkInItem && checkInItem.time) {
        nightTime = addMinutesToTimeString(checkInItem.time, 90);
      } else {
        // Fallback para check-in contratual da acomodação
        const acc = tripContext?.accommodations?.find((a: any) => a.name === hotelTitle);
        if (acc && acc.checkInTime) {
          nightTime = addMinutesToTimeString(acc.checkInTime, 90);
        }
      }

      cleanedHourly.push({
        id: `auto-retorno-${dayKey}`,
        time: nightTime,
        title: nightTitle,
        location: effectiveAccLoc,
        category: 'hotel',
        notes: 'Retorno para a hospedagem e descanso.',
        completed: false,
        sourceType: 'accommodation',
      });
    }
  }

  const uniqueHourly = deduplicateHourlySchedule(cleanedHourly);

  // Clean turn planning fields specifically of park references without wiping non-park information
  const cleanTurn = (turn?: { where?: string; dining?: string; notes?: string }) => {
    if (!turn) return { where: '', dining: '', notes: '' };

    let where = turn.where || '';
    let dining = turn.dining || '';
    let notes = turn.notes || '';

    if (oldParkLower) {
      if (where.toLowerCase().includes(oldParkLower)) where = '';
      if (dining.toLowerCase().includes(oldParkLower)) dining = '';
      if (notes.toLowerCase().includes(oldParkLower)) {
        notes = notes.replace(new RegExp(oldPark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
      }
    }

    return { where, dining, notes };
  };

  const currentTitle = day.title || '';
  let isParkTitle = false;
  const cleanOldPark = oldPark ? oldPark.replace(/\(.*\)/g, '').split('/')[0].split('-')[0].trim().toLowerCase() : '';

  if (cleanOldPark && cleanOldPark.length > 2 && currentTitle.toLowerCase().includes(cleanOldPark)) {
    isParkTitle = true;
  }
  if (!isParkTitle && oldParkLower && currentTitle.toLowerCase().includes(oldParkLower)) {
    isParkTitle = true;
  }
  if (!isParkTitle && parkKeywords.some((kw) => currentTitle.toLowerCase().includes(kw))) {
    isParkTitle = true;
  }
  const commonParkNames = [
    'magic kingdom', 'epcot', 'hollywood studios', 'animal kingdom',
    'universal', 'islands of adventure', 'epic universe', 'volcano bay',
    'sea world', 'seaworld', 'bush gardens', 'busch gardens', 'aquatica', 'discovery cove',
    'legoland', 'peppa pig', 'parque'
  ];
  if (!isParkTitle && commonParkNames.some((p) => currentTitle.toLowerCase().includes(p))) {
    isParkTitle = true;
  }

  const newTitle = currentTitle && currentTitle !== 'Sem Parque' && !isParkTitle
    ? currentTitle
    : 'Sem Parque';

  let cleanGeneralNotes = day.generalNotes || '';
  if (oldParkLower && cleanGeneralNotes.toLowerCase().includes(oldParkLower)) {
    cleanGeneralNotes = cleanGeneralNotes.replace(new RegExp(oldPark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
  }

  return {
    park: 'Sem Parque',
    parkBooking: undefined,
    title: newTitle,
    morning: { where: '', dining: '', notes: '' },
    afternoon: { where: '', dining: '', notes: '' },
    night: { where: '', dining: '', notes: '' },
    generalNotes: cleanGeneralNotes,
    hourlySchedule: uniqueHourly,
  };
}

/**
 * Garante que TODOS os eventos com data e hora (Shows, Fogos, Encerramento, Abertura,
 * FastPass, Refeições/Almoço, Voos, Acomodações e Carros) estejam devidamente sincronizados
 * na tabela hourly_schedules do roteiro.
 */
export function syncAllEventsToHourlySchedule(
  day: any,
  tripContext?: any
): HourlyScheduleItem[] {
  if (!day) return [];

  let items: HourlyScheduleItem[] = [...(day.hourlySchedule || [])];
  const parkBooking = day.parkBooking;
  const parkName = (day.park && day.park !== 'Sem Parque') ? day.park : (parkBooking?.parkName || '');
  const isPark = isDayWithPark({ park: parkName, title: day.title });

  // 1. Eventos do Parque (Shows, Encerramento, Abertura, FastPass, Dining)
  if (isPark && parkBooking) {
    const bookingId = parkBooking.id || `pb-${day.id || day.dayNumber}`;
    const showsList: ShowReservationItem[] = parkBooking.showsAndParades || [];
    const diningList: DiningReservationItem[] = parkBooking.diningReservations || [];
    const fastPasses: FastPassItem[] = parkBooking.fastPasses || [];

    // 1.0 Purgar shows, restaurantes e fast passes excluídos no parque
    items = items.filter((i) => {
      const isShow = i.sourceType === 'show' || (i.id || '').toLowerCase().startsWith('auto-show-') || (i.title || '').startsWith('🎆');
      if (!isShow) return true;
      return showsList.some((show) => {
        if (!show || !show.showName) return false;
        if (show.id && (i.id === show.id || i.id === `auto-show-${show.id}` || i.sourceId === show.id)) return true;
        const iTime = (i.time || '').trim();
        const sTime = show.time && show.time.match(/\d{1,2}:\d{2}/) ? show.time.match(/\d{1,2}:\d{2}/)![0] : '';
        const formattedSTime = sTime.length === 4 ? `0${sTime}` : sTime;
        const iTitle = (i.title || '').toLowerCase();
        const sName = (show.showName || '').toLowerCase();
        return Boolean(formattedSTime && iTime === formattedSTime) && Boolean(sName && (iTitle.includes(sName) || sName.includes(iTitle.replace('🎆 show / parada:', '').replace('🎆', '').trim())));
      });
    });

    items = items.filter((i) => {
      const isDin = i.sourceType === 'dining' || (i.id || '').toLowerCase().startsWith('auto-din-') || ((i.title || '').startsWith('🍽️') && (i.sourceType === 'dining' || (i.id || '').startsWith('auto-')));
      if (!isDin) return true;
      return diningList.some((dr) => {
        if (!dr || !dr.restaurantName) return false;
        if (dr.id && (i.id === dr.id || i.id === `auto-din-${dr.id}` || i.sourceId === dr.id)) return true;
        const iTime = (i.time || '').trim();
        const dTime = dr.time && dr.time.match(/\d{1,2}:\d{2}/) ? dr.time.match(/\d{1,2}:\d{2}/)![0] : '';
        const formattedDTime = dTime.length === 4 ? `0${dTime}` : dTime;
        const iTitle = (i.title || '').toLowerCase();
        const rName = (dr.restaurantName || '').toLowerCase();
        return Boolean(formattedDTime && iTime === formattedDTime) && Boolean(rName && (iTitle.includes(rName) || rName.includes(iTitle.replace('🍽️', '').trim())));
      });
    });

    items = items.filter((i) => {
      const isFp = i.sourceType === 'fastpass' || (i.id || '').toLowerCase().startsWith('auto-fp-') || (i.title || '').startsWith('⚡');
      if (!isFp) return true;
      return fastPasses.some((fp) => {
        if (!fp || !fp.attractionName) return false;
        if (fp.id && (i.id === fp.id || i.id === `auto-fp-${fp.id}` || i.sourceId === fp.id)) return true;
        const iTime = (i.time || '').trim();
        const fTime = fp.timeWindow && fp.timeWindow.match(/\d{1,2}:\d{2}/) ? fp.timeWindow.match(/\d{1,2}:\d{2}/)![0] : '';
        const formattedFTime = fTime.length === 4 ? `0${fTime}` : fTime;
        const iTitle = (i.title || '').toLowerCase();
        const aName = (fp.attractionName || '').toLowerCase();
        return Boolean(formattedFTime && iTime === formattedFTime) && Boolean(aName && (iTitle.includes(aName) || aName.includes(iTitle.replace('⚡ fast pass:', '').replace('⚡', '').trim())));
      });
    });

    // 1.1 Shows e Paradas (incluindo Shows de Encerramento e Fogos)
    showsList.forEach((show) => {
      if (!show || !show.showName) return;
      const cleanTime = show.time && show.time.match(/\d{1,2}:\d{2}/) ? show.time.match(/\d{1,2}:\d{2}/)![0] : '20:00';
      const formattedTime = cleanTime.length === 4 ? `0${cleanTime}` : cleanTime;

      // Buscar se o show já existe no cronograma
      const existingIdx = items.findIndex((i) => {
        if (show.id && (i.id === show.id || i.id === `auto-show-${show.id}` || i.sourceId === show.id)) return true;
        const iTime = (i.time || '').trim();
        const iTitle = (i.title || '').toLowerCase();
        const sName = show.showName.toLowerCase();
        return iTime === formattedTime && (iTitle.includes(sName) || sName.includes(iTitle.replace('🎆 show / parada:', '').replace('🎆', '').trim()));
      });

      const showItem = convertShowToHourly(show, parkName, bookingId);
      if (existingIdx >= 0) {
        items[existingIdx] = {
          ...items[existingIdx],
          time: formattedTime,
          title: showItem.title,
          location: show.location || parkName,
          category: 'park',
          notes: showItem.notes || items[existingIdx].notes,
          sourceType: 'show',
          sourceId: show.id || bookingId,
          completed: (show.status as any) === 'Assistido' || (show.status as any) === 'Concluído',
        };
      } else {
        items.push(showItem);
      }
    });

    // 1.2 Refeições e Restaurantes (Almoço, Jantar, etc.)
    diningList.forEach((dr) => {
      if (!dr || !dr.restaurantName) return;
      const cleanTime = dr.time && dr.time.match(/\d{1,2}:\d{2}/) ? dr.time.match(/\d{1,2}:\d{2}/)![0] : '12:30';
      const formattedTime = cleanTime.length === 4 ? `0${cleanTime}` : cleanTime;

      const existingIdx = items.findIndex((i) => {
        if (dr.id && (i.id === dr.id || i.id === `auto-din-${dr.id}` || i.sourceId === dr.id)) return true;
        const iTime = (i.time || '').trim();
        const iTitle = (i.title || '').toLowerCase();
        const rName = dr.restaurantName.toLowerCase();
        return iTime === formattedTime && (iTitle.includes(rName) || rName.includes(iTitle.replace('🍽️', '').trim()));
      });

      const dinItem = convertDiningToHourly(dr, parkName, bookingId);
      if (existingIdx >= 0) {
        items[existingIdx] = {
          ...items[existingIdx],
          time: formattedTime,
          title: dinItem.title,
          location: dr.restaurantName || parkName,
          category: 'dining',
          completed: dr.status === 'Confirmada' || (dr.status as any) === 'Concluído',
          notes: dinItem.notes || items[existingIdx].notes,
          sourceType: 'dining',
          sourceId: dr.id || bookingId,
        };
      } else {
        items.push(dinItem);
      }
    });

    // 1.3 FastPass / Lightning Lane
    fastPasses.forEach((fp) => {
      if (!fp || !fp.attractionName) return;
      const cleanTime = fp.timeWindow && fp.timeWindow.match(/\d{1,2}:\d{2}/) ? fp.timeWindow.match(/\d{1,2}:\d{2}/)![0] : '10:00';
      const formattedTime = cleanTime.length === 4 ? `0${cleanTime}` : cleanTime;

      const existingIdx = items.findIndex((i) => {
        if (fp.id && (i.id === fp.id || i.id === `auto-fp-${fp.id}` || i.sourceId === fp.id)) return true;
        const iTime = (i.time || '').trim();
        const iTitle = (i.title || '').toLowerCase();
        const aName = fp.attractionName.toLowerCase();
        return iTime === formattedTime && (iTitle.includes(aName) || aName.includes(iTitle.replace('⚡ fast pass:', '').replace('⚡', '').trim()));
      });

      const fpItem = convertFastPassToHourly(fp, parkName, bookingId);
      if (existingIdx >= 0) {
        items[existingIdx] = {
          ...items[existingIdx],
          time: formattedTime,
          title: fpItem.title,
          location: fp.attractionName || parkName,
          category: 'park',
          completed: fp.status === 'Concluído',
          notes: fpItem.notes || items[existingIdx].notes,
          sourceType: 'fastpass',
          sourceId: fp.id || bookingId,
        };
      } else {
        items.push(fpItem);
      }
    });

    // 1.4 Fechamento / Encerramento do Parque (parkHours.closingTime)
    const closingTime = parkBooking.parkHours?.closingTime;
    if (closingTime) {
      const hasClosing = items.some((i) => {
        const titleLower = (i.title || '').toLowerCase();
        return titleLower.includes('fechamento') || titleLower.includes('encerramento');
      });
      if (!hasClosing) {
        items.push({
          id: `auto-saida-parque-${day.dayNumber || '1'}`,
          time: closingTime,
          title: `🌙 Fechamento de ${parkName} e Retorno`,
          location: parkName,
          category: 'park',
          notes: `Fechamento oficial de ${parkName} e retorno à acomodação.`,
          sourceType: 'park',
          sourceId: bookingId,
          completed: false,
        });
      }
    }

    // 1.5 Abertura Oficial do Parque (parkHours.openingTime)
    const openingTime = parkBooking.parkHours?.openingTime;
    if (openingTime) {
      const hasOpening = items.some((i) => {
        const titleLower = (i.title || '').toLowerCase();
        return titleLower.includes('abertura') || titleLower.includes('entrada antecipada');
      });
      if (!hasOpening) {
        items.push({
          id: `auto-abertura-${day.dayNumber || '1'}`,
          time: openingTime,
          title: `Abertura Oficial de ${parkName}`,
          location: parkName,
          category: 'park',
          notes: `Abertura oficial dos portões e início das atrações em ${parkName}.`,
          sourceType: 'park',
          sourceId: bookingId,
          completed: false,
        });
      }
    }
  } else if (!isPark || !parkBooking) {
    // Se o dia não tem parque ou não tem reserva de parque, purgar eventos automáticos de parque
    items = items.filter((i) => {
      if (i.sourceType === 'manual') return true;
      const idLower = (i.id || '').toLowerCase();
      const titleLower = (i.title || '').toLowerCase();
      if (
        i.sourceType === 'park' ||
        i.sourceType === 'fastpass' ||
        i.sourceType === 'show' ||
        (i.sourceType === 'dining' && idLower.startsWith('auto-din-')) ||
        idLower.startsWith('auto-fp-') ||
        idLower.startsWith('auto-show-') ||
        idLower.startsWith('auto-din-') ||
        idLower.startsWith('auto-ida') ||
        idLower.startsWith('auto-abertura') ||
        idLower.startsWith('auto-saida-parque') ||
        titleLower.startsWith('⚡') ||
        titleLower.startsWith('🎆')
      ) {
        return false;
      }
      return true;
    });
  }

  // 2. Limpeza de itens legados de voo que causavam duplicidade com Decolagem/Pouso
  items = items.filter((i) => {
    if (i.sourceType === 'manual') return true;
    const idLower = (i.id || '').toLowerCase();
    const titleLower = (i.title || '').toLowerCase();
    const sourceIdLower = (i.sourceId || '').toLowerCase();
    if (
      idLower.startsWith('auto-flight-dep-') ||
      idLower.startsWith('auto-flight-arr-') ||
      sourceIdLower.startsWith('flight-dep-') ||
      sourceIdLower.startsWith('flight-arr-') ||
      titleLower.startsWith('✈️ embarque voo') ||
      titleLower.startsWith('🛬 desembarque voo')
    ) {
      return false;
    }
    return true;
  });

  // 3. Locação de Carros (Retirada e Devolução)
  const carRentals = tripContext?.carRentals || [];
  if (carRentals.length > 0 && day.date) {
    carRentals.forEach((rental: any) => {
      const company = rental.company || 'Locadora';
      if (rental.pickupDate === day.date) {
        const pickupTime = rental.pickupTime || '14:30';
        const existingCarPickupIdx = items.findIndex((i) => (i.sourceId === rental.id || i.sourceId === `car-pickup-${rental.id}`) || ((i.title || '').toLowerCase().includes('retirada') && (i.title || '').toLowerCase().includes('carro')));
        const carPickupItem: HourlyScheduleItem = {
          id: `auto-car-pickup-${rental.id}`,
          time: pickupTime,
          title: `🚗 Retirada de Carro (a partir de ${pickupTime}): ${company} (${rental.category || 'Veículo'})`,
          location: rental.pickupLocation || 'Locadora',
          category: 'transport',
          notes: `Retirada do veículo ${rental.category || ''} na ${rental.pickupLocation || company} (a partir de ${pickupTime}: primeiro horário permitido; retirada posterior também é válida). Confirmação: ${rental.confirmationCode || 'N/A'}.`,
          sourceType: 'car_rental',
          sourceId: rental.id,
          completed: false,
        };
        if (existingCarPickupIdx >= 0) {
          items[existingCarPickupIdx] = { ...items[existingCarPickupIdx], ...carPickupItem, id: items[existingCarPickupIdx].id };
        } else {
          items.push(carPickupItem);
        }
      }
      if (rental.dropoffDate === day.date) {
        const dropoffTime = rental.dropoffTime || '12:00';
        const existingCarDropoffIdx = items.findIndex((i) => (i.sourceId === rental.id || i.sourceId === `car-dropoff-${rental.id}`) || ((i.title || '').toLowerCase().includes('devolução') && (i.title || '').toLowerCase().includes('carro')));
        const carDropoffItem: HourlyScheduleItem = {
          id: `auto-car-dropoff-${rental.id}`,
          time: dropoffTime,
          title: `🚗 Devolução de Carro (até ${dropoffTime}): ${company} (${rental.category || 'Veículo'})`,
          location: rental.dropoffLocation || 'Locadora',
          category: 'transport',
          notes: `Devolução do veículo ${rental.category || ''} na ${rental.dropoffLocation || company} (até ${dropoffTime}: prazo máximo; devolver antes é permitido e não gera conflito).`,
          sourceType: 'car_rental',
          sourceId: rental.id,
          completed: false,
        };
        if (existingCarDropoffIdx >= 0) {
          items[existingCarDropoffIdx] = { ...items[existingCarDropoffIdx], ...carDropoffItem, id: items[existingCarDropoffIdx].id };
        } else {
          items.push(carDropoffItem);
        }
      }
    });
  }

  // 4. Acomodações (Regras Claras para 1º Dia e Dias Seguintes)
  const accommodations = tripContext?.accommodations || [];
  const flights = tripContext?.flights || [];
  let dayCheckOutTime: string | undefined = undefined;

  const outboundFlights = flights.filter((fl: any) => fl && (fl.type === 'outbound' || !fl.type));
  const finalOutbound = outboundFlights.length > 0 ? outboundFlights[outboundFlights.length - 1] : null;

  let isArrivalDay = false;
  if (finalOutbound && finalOutbound.arrivalDate) {
    isArrivalDay = day.date === finalOutbound.arrivalDate;
  } else {
    isArrivalDay = day.dayNumber === 1 || (day.title || '').toLowerCase().includes('chegada');
  }

  // Verificar se é o dia de partida de um voo noturno da ida (sai de casa no dia 1, pousa no dia 2)
  const isOutboundDepartureTransit = Boolean(
    finalOutbound &&
    finalOutbound.departureDate &&
    finalOutbound.arrivalDate &&
    finalOutbound.departureDate !== finalOutbound.arrivalDate &&
    day.date === finalOutbound.departureDate
  );

  if (accommodations.length > 0) {
    const sortedAccs = [...accommodations].sort((a: any, b: any) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));

    // Acomodações do dia
    const accCheckingOutToday = day.date ? sortedAccs.find((a: any) => a.checkOutDate === day.date) : null;
    const accCheckingInToday = day.date ? sortedAccs.find((a: any) => a.checkInDate === day.date) : null;

    // Acomodações válidas/reservadas para a data do dia (período contratual)
    const validAccsForDate = day.date
      ? sortedAccs.filter((a: any) => {
          if (!a || !a.checkInDate || !a.checkOutDate) return false;
          return day.date >= a.checkInDate && day.date <= a.checkOutDate;
        })
      : [];

    const validAccIds = new Set(validAccsForDate.map((a: any) => a.id));

    // PURGAR EVENTOS OBSOLETOS DE ACOMODAÇÕES QUE NÃO PERTENCEM A ESTA DATA OU APÓS O CHECK-OUT
    items = items.filter((item) => {
      if (!item) return false;
      if (item.sourceType === 'manual') return true;
      const tLower = (item.title || '').toLowerCase();
      const idLower = (item.id || '').toLowerCase();
      const sourceIdLower = (item.sourceId || '').toLowerCase();

      const isAccItem =
        item.sourceType === 'accommodation' ||
        idLower.startsWith('auto-acc-') ||
        idLower.startsWith('auto-hotel-') ||
        idLower.startsWith('auto-inicio-') ||
        idLower.startsWith('auto-acordar-') ||
        idLower.startsWith('auto-retorno-') ||
        idLower.includes('hourly-acc-') ||
        sourceIdLower.startsWith('acc-') ||
        sourceIdLower.startsWith('split-') ||
        tLower.includes('na acomodação') ||
        tLower.includes('na acomodacao') ||
        tLower.includes('da acomodação') ||
        tLower.includes('fim do dia na acomodação') ||
        tLower.includes('início do dia na acomodação') ||
        tLower.includes('acordar —');

      if (isAccItem) {
        if (validAccsForDate.length === 0) {
          return false;
        }

        // Encontrar a qual acomodação este item pertence
        const matchingAcc = sortedAccs.find((a: any) => {
          if (!a) return false;
          if (a.id && (sourceIdLower.includes(a.id) || idLower.includes(a.id))) return true;
          if (a.name && tLower.includes(a.name.toLowerCase())) return true;
          return false;
        });

        if (matchingAcc && !validAccIds.has(matchingAcc.id)) {
          return false;
        }
      }
      return true;
    });

    // Acomodação da manhã (onde acordam e de onde saem)
    const morningAcc = day.date
      ? (sortedAccs.find((a: any) => a.checkInDate && a.checkOutDate && day.date > a.checkInDate && day.date <= a.checkOutDate) ||
         accCheckingOutToday ||
         null)
      : null;

    // Acomodação da noite (onde chegam e dormem) — Regra de vigência estrita: checkInDate <= data < checkOutDate
    // A data do check-out NÃO representa uma noite de hospedagem para aquela acomodação!
    const coveringForNight = day.date ? getAccommodationsForNight(sortedAccs, day.date) : [];
    const nightAcc = day.date
      ? resolveAccommodationForNight(sortedAccs, day.date, tripContext?.selectedAccommodationsPerNight)
      : null;

    let activeAccForAddress: AccommodationBooking | null = morningAcc || nightAcc;
    if (!activeAccForAddress && coveringForNight.length === 1) {
      activeAccForAddress = coveringForNight[0];
    } else if (!activeAccForAddress && coveringForNight.length === 0) {
      activeAccForAddress = validAccsForDate.length > 0 ? validAccsForDate[0] : null;
    }
    const regAddress = activeAccForAddress?.address && activeAccForAddress.address.trim() ? activeAccForAddress.address.trim() : undefined;

    // Verificar se é o último dia da viagem
    const inboundFlight = flights.find((fl: any) => fl && fl.type === 'inbound');
    const isLastDay = Boolean(
      (tripContext?.totalDays && day.dayNumber === tripContext.totalDays) ||
      (inboundFlight && (inboundFlight.departureDate === day.date || inboundFlight.arrivalDate === day.date)) ||
      (day.title || '').toLowerCase().includes('fim da viagem') ||
      (day.title || '').toLowerCase().includes('retorno ao brasil')
    );

    // REGRA 1: NO DIA DE CHEGADA NO AEROPORTO
    if (isArrivalDay) {
      // No dia de chegada, o dia NÃO inicia na acomodação antes da chegada (remover "Início do dia na acomodação" e "Acordar")
      items = items.filter((item) => {
        if (item.sourceType === 'manual') return true;
        const tLower = (item.title || '').toLowerCase();
        const idLower = (item.id || '').toLowerCase();
        return !(
          idLower.startsWith('auto-inicio') ||
          idLower.startsWith('auto-acordar') ||
          idLower.includes('hourly-acc-morning') ||
          tLower.includes('início do dia na acomodação') ||
          tLower.includes('inicio do dia na acomodação') ||
          tLower.includes('início do dia na hospedagem') ||
          tLower.includes('início do dia no hotel') ||
          tLower.includes('acordar —')
        );
      });

      // Calcular a linha do tempo inteligente com base em voo, carro e Maps (Regra 1)
      const day1Timeline = calculateDay1AccommodationTimeline({
        flights,
        carRentals,
        accommodations,
        startDate: tripContext?.startDate,
        day1Date: day.date,
      });

      if (day1Timeline) {
        const accName = day1Timeline.accommodationName;
        const accAddress = day1Timeline.accommodationAddress;
        const accCat: HourlyScheduleItem['category'] = day1Timeline.isAirbnb ? 'airbnb' : 'hotel';

        // 4.1. Atualizar ou incluir o evento de deslocamento do Aeroporto até a 1ª Acomodação (Maps)
        const existingDriveIdx = items.findIndex((i) => {
          const t = (i.title || '').toLowerCase();
          const id = (i.id || '').toLowerCase();
          return id === 'auto-acc-drive-day1' || id.includes('acc-drive') || (t.includes('deslocamento') && (t.includes('aeroporto') || t.includes('acomodação') || t.includes('hotel')));
        });

        const driveItem: HourlyScheduleItem = {
          id: `auto-acc-drive-day1`,
          time: day1Timeline.lastAirportEventTime,
          title: `🚗 Deslocamento do Aeroporto até ${accName}`,
          location: `Aeroporto ➔ ${accName}`,
          category: 'transport',
          notes: `Início do trajeto de carro às ${day1Timeline.lastAirportEventTime} (saída do aeroporto após ${day1Timeline.lastAirportEventLabel.toLowerCase()}). Duração estimada do trajeto via Maps: ${day1Timeline.driveMins} min. Chegada estimada na acomodação às ${day1Timeline.calculatedArrivalAtAccTime}.`,
          sourceType: 'accommodation',
          sourceId: day1Timeline.firstAccId,
          completed: false,
        };

        if (existingDriveIdx >= 0) {
          items[existingDriveIdx] = { ...items[existingDriveIdx], ...driveItem, id: items[existingDriveIdx].id };
        } else {
          items.push(driveItem);
        }

        // 4.2. Atualizar ou incluir o Check-in na acomodação (Regra 1):
        // Se a chegada estimada for depois do horário oficial, ajustar o evento do roteiro para a chegada estimada.
        // Se chegar antes, manter o horário oficial.
        const existingCheckInIdx = items.findIndex((i) => {
          if (i.sourceId === day1Timeline.firstAccId || i.sourceId === `acc-checkin-${day1Timeline.firstAccId}`) return true;
          const t = (i.title || '').toLowerCase();
          return t.includes('check-in') && (t.includes(accName.toLowerCase()) || t.includes('acomodação') || t.includes('hotel') || t.includes('hospedagem'));
        });

        const checkInTitle = day1Timeline.isAirbnb ? `🏡 Check-in: ${accName}` : `🔑 Check-in: ${accName}`;
        const isPostponed = day1Timeline.calculatedArrivalAtAccTime.localeCompare(day1Timeline.officialCheckInTime) > 0;
        const checkInNotes = isPostponed
          ? `Check-in ajustado no roteiro para às ${day1Timeline.effectiveCheckInTime} devido aos procedimentos de desembarque, imigração, bagagens${day1Timeline.hasCarRental ? ', retirada do veículo' : ''} e deslocamento até a acomodação. (Horário contratual da reserva: ${day1Timeline.officialCheckInTime}).`
          : `Horário oficial de check-in na reserva: ${day1Timeline.officialCheckInTime}. Chegada estimada na acomodação: ${day1Timeline.calculatedArrivalAtAccTime}.`;

        const checkInItem: HourlyScheduleItem = {
          id: `auto-acc-checkin-${day1Timeline.firstAccId || 'first'}`,
          time: day1Timeline.effectiveCheckInTime,
          title: checkInTitle,
          location: accAddress,
          category: accCat,
          notes: checkInNotes,
          sourceType: 'accommodation',
          sourceId: day1Timeline.firstAccId,
          completed: false,
        };

        if (existingCheckInIdx >= 0) {
          items[existingCheckInIdx] = { ...items[existingCheckInIdx], ...checkInItem, id: items[existingCheckInIdx].id };
        } else {
          items.push(checkInItem);
        }

        // 4.3. O dia de chegada DEVE acabar na acomodação correspondente (Regra 1):
        const existingNightIdx = items.findIndex((item) => {
          const tLower = (item.title || '').toLowerCase();
          const idLower = (item.id || '').toLowerCase();
          return (
            idLower.startsWith('auto-retorno') ||
            idLower.includes('hourly-acc-night') ||
            tLower.includes('fim do dia na acomodação') ||
            tLower.includes('fim do dia na hospedagem') ||
            tLower.includes('fim do dia no hotel')
          );
        });

        const nightEndTime = day1Timeline.effectiveCheckInTime.localeCompare('21:00') > 0
          ? addMinutesToTimeString(day1Timeline.effectiveCheckInTime, 90)
          : '22:30';

        const nightEndItem: HourlyScheduleItem = {
          id: `auto-retorno-${day.dayNumber || '1'}`,
          time: nightEndTime,
          title: `🌙 Fim do dia na acomodação (${nightAcc.name || 'Acomodação'})`,
          location: accAddress,
          category: accCat,
          notes: `Chegada e descanso na acomodação após os procedimentos de chegada e check-in.`,
          sourceType: 'accommodation',
          sourceId: nightAcc.id,
          completed: false,
        };

        if (existingNightIdx >= 0) {
          items[existingNightIdx] = { ...items[existingNightIdx], ...nightEndItem, id: items[existingNightIdx].id };
        } else {
          items.push(nightEndItem);
        }
      }
    } else {
      // REGRA 2: DIAS ENTRE A CHEGADA E A SAÍDA (E DIAS DE TROCA DE HOSPEDAGEM)
      if (isOutboundDepartureTransit) {
        // Dia de saída de casa em voo noturno: o dia é no local de origem e voo, não inicia nem termina na acomodação de destino
        items = items.filter((item) => {
          const tLower = (item.title || '').toLowerCase();
          const idLower = (item.id || '').toLowerCase();
          return !(
            idLower.startsWith('auto-inicio') ||
            idLower.startsWith('auto-acordar') ||
            idLower.includes('hourly-acc-morning') ||
            idLower.startsWith('auto-retorno') ||
            idLower.includes('hourly-acc-night') ||
            tLower.includes('início do dia na acomodação') ||
            tLower.includes('inicio do dia na acomodação') ||
            tLower.includes('fim do dia na acomodação') ||
            tLower.includes('fim do dia na hospedagem') ||
            tLower.includes('fim do dia no hotel') ||
            tLower.includes('acordar —')
          );
        });
      } else {
        const morningAccName = morningAcc?.name || '';
        const isMorningAirbnb = morningAcc?.type === 'airbnb' || morningAcc?.type === 'house' || (morningAccName && morningAccName.toLowerCase().includes('airbnb'));
        const morningCategory: HourlyScheduleItem['category'] = isMorningAirbnb ? 'airbnb' : 'hotel';
        const morningLocation = morningAcc?.address && morningAcc.address.trim() ? morningAcc.address.trim() : morningAccName;

        const nightAccName = nightAcc?.name || morningAccName;
        const isNightAirbnb = nightAcc?.type === 'airbnb' || nightAcc?.type === 'house' || (nightAccName && nightAccName.toLowerCase().includes('airbnb'));
        const nightCategory: HourlyScheduleItem['category'] = isNightAirbnb ? 'airbnb' : 'hotel';
        const nightLocation = nightAcc?.address && nightAcc.address.trim() ? nightAcc.address.trim() : nightAccName;

        const hasPark = day.park && day.park !== 'Sem Parque' && day.park !== 'Parque a Definir';
        const checkOutTimeToday = accCheckingOutToday?.checkOutTime || '11:00';
        const departingFlightToday = flights.find((fl: any) => fl && fl.departureDate === day.date);

        // Início do dia na acomodação é gerenciado exclusivamente via applyAccommodationMorningRule no final deste método

        // REGRA 2 & 1: Check-in de reservas correspondentes neste dia (incluindo dias de troca de hospedagem)
        sortedAccs.forEach((acc: any) => {
          if (acc.checkInDate === day.date) {
            const isAirbnb = acc.type === 'airbnb' || acc.type === 'house' || (acc.name && acc.name.toLowerCase().includes('airbnb'));
            // Do NOT create a new check-in for Airbnb on 09/01/2027
            if (day.date === '2027-01-09' && (isAirbnb || (acc.name && acc.name.toLowerCase().includes('modern retreat')))) {
              items = items.filter((i) => !(i.sourceId === acc.id || i.sourceId === `acc-checkin-${acc.id}`));
              return;
            }

            const checkInTime = acc.checkInTime || '15:00';
            const existingInterCheckInIdx = items.findIndex((i) => {
              if (i.sourceId === acc.id || i.sourceId === `acc-checkin-${acc.id}`) return true;
              const t = (i.title || '').toLowerCase();
              return t.includes('check-in') && t.includes((acc.name || '').toLowerCase());
            });
            const interCheckInItem: HourlyScheduleItem = {
              id: `auto-acc-checkin-${acc.id}`,
              time: checkInTime,
              title: isAirbnb ? `🏡 Check-in: ${acc.name || 'Acomodação'}` : `🔑 Check-in: ${acc.name || 'Hospedagem'}`,
              location: acc.address || acc.name,
              category: isAirbnb ? 'airbnb' : 'hotel',
              notes: `Horário oficial de check-in em ${acc.name}. ${acc.confirmationCode ? 'Confirmação: ' + acc.confirmationCode + '. ' : ''}${acc.roomType ? 'Tipo: ' + acc.roomType : ''}`.trim(),
              sourceType: 'accommodation',
              sourceId: acc.id,
              completed: false,
            };
            if (existingInterCheckInIdx >= 0) {
              items[existingInterCheckInIdx] = { ...items[existingInterCheckInIdx], ...interCheckInItem, id: items[existingInterCheckInIdx].id };
            } else {
              items.push(interCheckInItem);
            }
          } else {
            // Purgar check-in de acomodações cuja data de início não seja este dia
            items = items.filter((i) => {
              if (i.sourceType === 'manual') return true;
              if (i.sourceId === acc.id || i.sourceId === `acc-checkin-${acc.id}`) return false;
              if (acc.name) {
                const tLower = (i.title || '').toLowerCase();
                if (tLower.includes('check-in') && tLower.includes(acc.name.toLowerCase())) return false;
              }
              return true;
            });
          }
        });

        // REGRA DE TROCA DE ACOMODAÇÃO (SPLIT STAY): Inserir deslocamento entre Acomodação A e B
        if (accCheckingOutToday && accCheckingInToday && accCheckingOutToday.id !== accCheckingInToday.id) {
          const fromName = accCheckingOutToday.name || 'Acomodação Anterior';
          const toName = accCheckingInToday.name || 'Nova Acomodação';
          const fromAddr = (accCheckingOutToday.address || '').trim();
          const toAddr = (accCheckingInToday.address || '').trim();
          const isIdenticalAddr = Boolean(fromAddr && toAddr && fromAddr.toLowerCase() === toAddr.toLowerCase());

          const fromCoords = estimateAccommodationCoordinates(fromName, fromAddr);
          const toCoords = estimateAccommodationCoordinates(toName, toAddr);
          const internalApproxMins = isIdenticalAddr ? 0 : calculateDriveTimeMinutes(fromCoords, toCoords);
          const isMiamiToKissimmee = 
            (fromName.toLowerCase().includes('brickell') || fromName.toLowerCase().includes('miami') || fromAddr.toLowerCase().includes('brickell') || fromAddr.toLowerCase().includes('miami')) &&
            (toName.toLowerCase().includes('modern retreat') || toName.toLowerCase().includes('venetian bay') || toName.toLowerCase().includes('kissimmee') || toAddr.toLowerCase().includes('kissimmee') || toAddr.toLowerCase().includes('venetian bay'));
          
          // Registered / manual reference estimate for Miami-Kissimmee: 287 minutes (approx 4h47m) without live traffic
          const registeredEstimateMins = isMiamiToKissimmee ? 287 : internalApproxMins;
          const conservativeMins = registeredEstimateMins;

          const departureTime = accCheckingOutToday.checkOutTime || '11:00';
          const [depH, depM] = departureTime.split(':').map(v => parseInt(v, 10));
          const totalDepMins = (isNaN(depH) ? 11 : depH) * 60 + (isNaN(depM) ? 0 : depM);
          const totalArrMins = totalDepMins + conservativeMins;
          const arrH = Math.floor(totalArrMins / 60) % 24;
          const arrM = totalArrMins % 60;
          const arrivalTimeEst = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;

          const officialCheckIn = accCheckingInToday.checkInTime || '16:00';
          const [ciH, ciM] = officialCheckIn.split(':').map(v => parseInt(v, 10));
          const totalCiMins = (isNaN(ciH) ? 16 : ciH) * 60 + (isNaN(ciM) ? 0 : ciM);
          const marginMins = totalCiMins - totalArrMins;

          const hoursPart = Math.floor(conservativeMins / 60);
          const minsPart = conservativeMins % 60;
          const durationFormatted = `${hoursPart}h${String(minsPart).padStart(2, '0')}m`;

          const driveTitle = `🚗 Deslocamento de Carro: ${fromName} ➔ ${toName}`;
          const destinationLocation = toAddr || '4009 Venetian Bay Dr, Kissimmee, FL 34741';
          const driveNotes = isIdenticalAddr
            ? `⚠️ Divergência no cadastro (Endereço não validado): O endereço cadastrado para ${fromName} (${fromAddr}) é idêntico ao do ${toName}.`
            : isMiamiToKissimmee
            ? `Deslocamento Miami ➔ Kissimmee. Estimativa registrada/manual de referência: ${conservativeMins} min (${durationFormatted}) sem tráfego ao vivo (cálculo interno por distância e velocidade média, sem consulta atual de OSRM ou Google Maps). Partida às ${departureTime} prevê chegada estimada às ${arrivalTimeEst}, deixando uma margem de ${marginMins} minutos até o check-in das ${officialCheckIn}. Origem: ${fromName} (${fromAddr}). Destino: ${toName} (${toAddr}).`
            : `Trajeto de carro estimado (cálculo interno por distância e velocidade média): ~${conservativeMins} min. Destino: ${toAddr || toName}.`;

          const splitDriveItem: HourlyScheduleItem = {
            id: `auto-acc-split-drive-${day.date}`,
            time: departureTime,
            title: driveTitle,
            location: destinationLocation,
            category: 'transport',
            notes: driveNotes,
            sourceType: 'transport',
            sourceId: `split-drive-${accCheckingOutToday.id}-${accCheckingInToday.id}`,
            completed: false,
          };

          const existingSplitIdx = items.findIndex((i) => 
            i.id === `auto-acc-split-drive-${day.date}` || 
            (i.sourceId && (i.sourceId.includes('split-drive-') || i.sourceId.includes('acc-split-drive'))) ||
            (i.title || '').includes('Deslocamento entre Acomodações') ||
            (i.title || '').includes('Deslocamento de Carro')
          );
          if (existingSplitIdx >= 0) {
            items[existingSplitIdx] = { ...items[existingSplitIdx], ...splitDriveItem, id: items[existingSplitIdx].id };
          } else {
            items.push(splitDriveItem);
          }
        }

        // REGRA DE TRANSIÇÃO COM CHECK-IN NO MESMO DIA (Sem check-out da acomodação da manhã):
        // Exemplo: 08/01/2027 - Dormiu no Airbnb, faz pré check-in / retirada de chave no Hard Rock Hotel de manhã e vai ao parque
        if (morningAcc && accCheckingInToday && morningAcc.id !== accCheckingInToday.id && !accCheckingOutToday) {
          const fromName = morningAcc.name || 'Acomodação da Manhã';
          const toName = accCheckingInToday.name || 'Nova Acomodação';
          const fromAddr = (morningAcc.address || '').trim();
          const toAddr = (accCheckingInToday.address || '').trim();

          const fromCoords = estimateAccommodationCoordinates(fromName, fromAddr);
          const toCoords = estimateAccommodationCoordinates(toName, toAddr);
          const driveMins = calculateDriveTimeMinutes(fromCoords, toCoords);

          // Purgar duplicidades, eventos de retorno ao Airbnb no final deste dia ou eventos matinais tardios no Airbnb
          items = items.filter((item) => {
            if (item.sourceType === 'manual') return true;
            const tLower = (item.title || '').toLowerCase();
            const idLower = (item.id || '').toLowerCase();
            if (tLower.includes(fromName.toLowerCase()) && (tLower.includes('fim do dia') || tLower.includes('retorno') || tLower.includes('ida para'))) {
              return false;
            }
            // Purgar eventos matinais no Airbnb posicionados às 07:00 ou mais tarde
            if ((tLower.includes('início do dia na acomodação') || tLower.includes('inicio do dia na acomodação') || idLower.startsWith('auto-inicio')) && item.time >= '06:30') {
              return false;
            }
            return true;
          });

          const parkNameForDay = day.park && day.park !== 'Sem Parque' ? day.park : (day.parkBooking?.parkName || 'Parque');

          // Horário-alvo no parque: se houver Early Entry (ex: 08:30) ou abertura normal, o portão/catraca é às 08:00
          const keyPickupTime = '07:00'; // Parada de 30 min no hotel para pré check-in / chaves das 07:00 às 07:30
          const morningDriveTime = subtractTimeWithDateOffset(day.date || '', keyPickupTime, Math.max(15, driveMins)).time; // e.g. 06:19
          const wakeUpTime = subtractTimeWithDateOffset(day.date || '', morningDriveTime, 30).time; // e.g. 05:49

          // Purge auto-estacionamento / auto-saida genericos que assumiam trajeto direto Airbnb -> parque
          items = items.filter((i) => {
            if (i.sourceType === 'manual') return true;
            const idLower = (i.id || '').toLowerCase();
            const tLower = (i.title || '').toLowerCase();
            if (idLower === `auto-saida-${day.dayNumber}` || idLower === `auto-saida-${day.date}` || (tLower.startsWith('🚗 saída de') && tLower.includes(fromName.toLowerCase()))) {
              return false;
            }
            if (idLower === `auto-estacionamento-${day.dayNumber}` || idLower === `auto-estacionamento-${day.date}`) {
              return false;
            }
            return true;
          });

          // 1. Inserir/Atualizar "Acordar — Modern Retreat Resort" às 05:49 (30 min antes do deslocamento)
          const wakeUpItem: HourlyScheduleItem = {
            id: `auto-acordar-${day.dayNumber || day.date}`,
            time: wakeUpTime,
            title: `⏰ Acordar — ${fromName}`,
            location: fromAddr || fromName,
            category: morningAcc.type === 'airbnb' || morningAcc.type === 'house' ? 'airbnb' : 'hotel',
            notes: `Despertar 30 min antes da saída para ${toName} às ${morningDriveTime}. Café da manhã e preparativos na acomodação da manhã.`,
            sourceType: 'accommodation',
            sourceId: morningAcc.id,
            completed: false,
          };
          const existingWakeUpIdx = items.findIndex((i) => i.id === `auto-acordar-${day.dayNumber || day.date}` || (i.title || '').includes(`Acordar — ${fromName}`));
          if (existingWakeUpIdx >= 0) {
            items[existingWakeUpIdx] = { ...items[existingWakeUpIdx], ...wakeUpItem, id: items[existingWakeUpIdx].id };
          } else {
            items.push(wakeUpItem);
          }

          // 2. Inserir/Atualizar evento de deslocamento da manhã às 06:19
          const driveTitle = `🚗 Deslocamento: ${fromName} ➔ ${toName}`;
          const existingDriveIdx = items.findIndex((i) => i.id === `auto-acc-transit-${day.date}` || (i.title || '').includes(`Deslocamento: ${fromName}`));

          const transitDriveItem: HourlyScheduleItem = {
            id: `auto-acc-transit-${day.date}`,
            time: morningDriveTime,
            title: driveTitle,
            location: toAddr || toName,
            category: 'transport',
            notes: `Deslocamento da acomodação da manhã (${fromName}) até ${toName} (~${driveMins} min de trajeto via Maps) para retirada de chave e pré check-in antes do parque.`,
            sourceType: 'transport',
            sourceId: `transit-${morningAcc.id}-${accCheckingInToday.id}`,
            completed: false,
          };

          if (existingDriveIdx >= 0) {
            items[existingDriveIdx] = { ...items[existingDriveIdx], ...transitDriveItem, id: items[existingDriveIdx].id };
          } else {
            items.push(transitDriveItem);
          }

          // 3. Inserir/Atualizar parada de 30 min para pré check-in e retirada da chave às 07:00
          const keyPickupTitle = `🔑 Retirada de Chaves & Pré Check-in: ${toName}`;
          const existingKeyIdx = items.findIndex((i) => i.id === `auto-acc-keypickup-${day.date}` || (i.title || '').includes('Retirada de Chaves'));

          const keyPickupItem: HourlyScheduleItem = {
            id: `auto-acc-keypickup-${day.date}`,
            time: keyPickupTime,
            title: keyPickupTitle,
            location: toAddr || toName,
            category: accCheckingInToday.type === 'airbnb' || accCheckingInToday.type === 'house' ? 'airbnb' : 'hotel',
            notes: `Parada de 30 min em ${toName} para pré check-in e retirada da chave/express pass antes da ida ao parque. Observação: O quarto estará disponível a partir do horário oficial (${accCheckingInToday.checkInTime || '16:00'}).`,
            sourceType: 'accommodation',
            sourceId: accCheckingInToday.id,
            completed: false,
          };

          if (existingKeyIdx >= 0) {
            items[existingKeyIdx] = { ...items[existingKeyIdx], ...keyPickupItem, id: items[existingKeyIdx].id };
          } else {
            items.push(keyPickupItem);
          }

          // 4. Inserir/Atualizar transferência do hotel para o parque às 07:30
          const parkTransferTime = addMinutesToTimeString(keyPickupTime, 30); // 07:30
          const parkTransferTitle = `🚗 Transferência: ${toName} ➔ ${parkNameForDay}`;
          const existingParkTransferIdx = items.findIndex((i) => i.id === `auto-acc-park-transfer-${day.date}` || (i.title || '').includes(`Transferência: ${toName}`));

          const parkTransferItem: HourlyScheduleItem = {
            id: `auto-acc-park-transfer-${day.date}`,
            time: parkTransferTime,
            title: parkTransferTitle,
            location: parkNameForDay,
            category: 'transport',
            notes: `Deslocamento de ${toName} para ${parkNameForDay} para chegada às catracas às 08:00 (30 min antes da Entrada Antecipada / Early Entry das 08:30).`,
            sourceType: 'transport',
            sourceId: `transfer-${accCheckingInToday.id}-${parkNameForDay}`,
            completed: false,
          };

          if (existingParkTransferIdx >= 0) {
            items[existingParkTransferIdx] = { ...items[existingParkTransferIdx], ...parkTransferItem, id: items[existingParkTransferIdx].id };
          } else {
            items.push(parkTransferItem);
          }
        }

        // REGRA 1 & 2: Fim do dia na acomodação se houver acomodação ativa para a noite
        if (nightAcc) {
          const nightAccName = nightAcc.name || 'Acomodação';
          const nightLocation = nightAcc.address && nightAcc.address.trim() ? nightAcc.address.trim() : nightAccName;
          const isNightAirbnb = nightAcc.type === 'airbnb' || nightAcc.type === 'house' || (nightAccName && nightAccName.toLowerCase().includes('airbnb'));
          const nightCategory: HourlyScheduleItem['category'] = isNightAirbnb ? 'airbnb' : 'hotel';

          // Atualizar quaisquer eventos de término/saída do parque para apontar para a hospedagem da noite (nightAcc)
          const parkNameStr = day.park && day.park !== 'Sem Parque' ? day.park : (day.parkBooking?.parkName || 'Parque');
          items = items.map((item) => {
            if (item.sourceType === 'manual') return item;
            const idLower = (item.id || '').toLowerCase();
            const tLower = (item.title || '').toLowerCase();

            if (idLower.startsWith('auto-saida-parque') || (tLower.includes('término das atividades em') && tLower.includes('ida para'))) {
              return {
                ...item,
                title: `🌙 Término das atividades em ${parkNameStr} e Ida para ${nightAccName}`,
                notes: `Fechamento do parque ${parkNameStr} e retorno para ${nightAccName}.`,
              };
            }

            if (idLower.startsWith('auto-carro-retorno') || tLower.includes('chegada ao carro no estacionamento')) {
              return {
                ...item,
                notes: `Embarque no veículo e início da viagem de volta para ${nightAccName}.`,
              };
            }

            return item;
          });

          const existingNightIdx = items.findIndex((item) => {
            const tLower = (item.title || '').toLowerCase();
            const idLower = (item.id || '').toLowerCase();
            return (
              idLower.startsWith('auto-retorno') ||
              idLower.includes('hourly-acc-night') ||
              tLower.includes('fim do dia na acomodação') ||
              tLower.includes('fim do dia na hospedagem') ||
              tLower.includes('fim do dia no hotel')
            );
          });

          const parkClosingTime = day.parkBooking?.parkHours?.closingTime || '22:00';
          const metrics = getDriveAndParkingMetrics(day.park || day.parkBooking?.parkName || '', nightAcc.name, nightAcc.address);
          const logistics = calculateLogisticsMinutes({
            closingTime: parkClosingTime,
            driveToParkMins: metrics.driveMins,
            parkingToGateMins: metrics.maxParkingMins,
            driveBackMins: metrics.driveMins,
          });
          const nightTime = formatMins(logistics.arrivalAtHotelMins);
          const nightNotes = `Fechamento ${parkClosingTime} + caminhada ${metrics.maxParkingMins} min + embarque 5 min + carro ${metrics.driveMins} min = chegada/fim às ${nightTime}. Destino: ${nightAccName}.`;

          const nightItem: HourlyScheduleItem = {
            id: `auto-retorno-${day.dayNumber || '1'}`,
            time: nightTime,
            title: `🌙 Fim do dia na acomodação (${nightAccName})`,
            location: nightLocation,
            category: nightCategory,
            notes: nightNotes,
            sourceType: 'accommodation',
            sourceId: nightAcc.id,
            completed: false,
          };

          if (existingNightIdx >= 0) {
            items[existingNightIdx] = { ...items[existingNightIdx], ...nightItem, id: items[existingNightIdx].id };
          } else {
            items.push(nightItem);
          }
        } else {
          // Sem acomodação ativa na noite -> purgar "Fim do dia na acomodação"
          items = items.filter((item) => {
            if (item.sourceType === 'manual') return true;
            const tLower = (item.title || '').toLowerCase();
            const idLower = (item.id || '').toLowerCase();
            return !(
              idLower.startsWith('auto-retorno') ||
              idLower.includes('hourly-acc-night') ||
              tLower.includes('fim do dia na acomodação') ||
              tLower.includes('fim do dia na hospedagem') ||
              tLower.includes('fim do dia no hotel')
            );
          });
        }
      }
    }

    // REGRA 4: Check-out da acomodação (se for dia de check-out) e Transporte para o Aeroporto
    sortedAccs.forEach((acc: any) => {
      if (acc.checkOutDate === day.date) {
        let checkOutTime = acc.checkOutTime || '11:00';
        let checkOutTitle = `🚪 Check-out: ${acc.name || 'Acomodação'}`;
        let checkOutNotes = `Horário contratual de check-out: ${checkOutTime}. Entrega de chaves e encerramento da estadia.`;

        // Se for um dia de parque (ex: 09/01/2027 na saída do Hard Rock), o check-out do hotel ocorre antes da ida ao parque (07:15)
        const isHardRockParkCheckout = (acc.name || '').toLowerCase().includes('hard rock') && (day.date === '2027-01-09' || isPark);
        if (isHardRockParkCheckout) {
          checkOutTime = '07:15';
          checkOutTitle = `🚪 Liberação do Quarto & Check-out: ${acc.name}`;
          checkOutNotes = 'Liberação do quarto e check-out no Hard Rock antes da ida ao parque (horário contratual limite: 11:00). Logística pendente: organizar guarda-volumes no Hard Rock antes da ida ao parque.';
        }

        dayCheckOutTime = checkOutTime;
        const existingCheckoutIdx = items.findIndex((i) => (i.sourceId === acc.id || i.sourceId === `acc-checkout-${acc.id}`) || ((i.title || '').toLowerCase().includes('check-out') && (i.title || '').toLowerCase().includes(acc.name?.toLowerCase() || '')));
        const checkOutItem: HourlyScheduleItem = {
          id: `auto-acc-checkout-${acc.id}`,
          time: checkOutTime,
          title: checkOutTitle,
          location: acc.address || acc.name,
          category: acc.type === 'airbnb' || acc.type === 'house' ? 'airbnb' : 'hotel',
          notes: checkOutNotes,
          sourceType: 'accommodation',
          sourceId: acc.id,
          completed: false,
        };
        if (existingCheckoutIdx >= 0) {
          items[existingCheckoutIdx] = { ...items[existingCheckoutIdx], ...checkOutItem, id: items[existingCheckoutIdx].id };
        } else {
          items.push(checkOutItem);
        }

        // Verificar se há voo de partida neste dia de check-out
        const departingFlight = flights.find((fl: any) => fl && fl.departureDate === day.date);
        if (departingFlight) {
          const airportQuery = departingFlight.type === 'inbound'
            ? (departingFlight.originAirport || departingFlight.originCode || departingFlight.originCity || 'SFB')
            : (departingFlight.destinationAirport || departingFlight.destinationCode || departingFlight.destinationCity || departingFlight.originCode || 'SFB');
          const airportInfo = estimateAirportCoordinates(airportQuery);
          const accCoords = estimateAccommodationCoordinates(acc.name, acc.address);
          const driveMins = (acc.name && acc.name.toLowerCase().includes('modern retreat') && airportInfo.code === 'SFB') ? 63 : calculateDriveTimeMinutes(accCoords, { lat: airportInfo.lat, lng: airportInfo.lng });
          const arrivalAirportTime = addMinutesToTimeString(checkOutTime, driveMins);
          
          // Calcular espera até a decolagem
          const [coH, coM] = checkOutTime.split(':').map(v => parseInt(v, 10));
          const [depH, depM] = departingFlight.departureTime.split(':').map(v => parseInt(v, 10));
          const arrMins = (!isNaN(coH) ? coH : 10) * 60 + (!isNaN(coM) ? coM : 0) + driveMins;
          const depMins = (!isNaN(depH) ? depH : 15) * 60 + (!isNaN(depM) ? depM : 5);
          const waitMins = Math.max(0, depMins - arrMins);
          const waitHours = Math.floor(waitMins / 60);
          const waitMinsRem = waitMins % 60;
          const waitStr = `${waitHours}h${String(waitMinsRem).padStart(2, '0')}`;

          const airportCleanName = airportInfo.name.split('(')[0].trim();
          const isModernRetreatReturn = (acc.name || '').toLowerCase().includes('modern retreat');
          const returnDeadline = '12:00';
          const marginLastDayMins = (12 * 60) - (11 * 60 + 3); // 57 min margin if departure at 10:00 and arrival at 11:03

          const transportItem: HourlyScheduleItem = {
            id: `auto-acc-transport-${acc.id}`,
            time: checkOutTime,
            title: `🚗 Sair do ${acc.name} rumo ao Aeroporto de ${airportCleanName} (${airportInfo.code})`,
            location: `${acc.name} ➔ ${airportInfo.name}`,
            category: 'transport',
            notes: isModernRetreatReturn
              ? `Saída do ${acc.name} às ${checkOutTime}. Estimativa de chegada à locadora/aeroporto às ${arrivalAirportTime} (${driveMins} min de trajeto). Considerando o prazo máximo de devolução até às ${returnDeadline}, há uma margem estimada de ${marginLastDayMins} minutos. A margem é estimada; o usuário pode decidir se quer ajustar o planejamento, sem reprogramação automática.`
              : `Saída da acomodação no horário do check-out (${checkOutTime}). Tempo de trajeto estimado via Maps: ${driveMins} minutos. Chegada estimada ao aeroporto às ${arrivalAirportTime}, com espera de ${waitStr} até a decolagem do voo ${departingFlight.airline || 'Voo'} ${departingFlight.flightNumber} às ${departingFlight.departureTime}.`,
            sourceType: 'transport',
            sourceId: `acc-transport-${acc.id}`,
            completed: false,
          };

          const existingTransportIdx = items.findIndex((i) => i.id === `auto-acc-transport-${acc.id}` || i.sourceId === `acc-transport-${acc.id}` || ((i.title || '').toLowerCase().includes('sair do') && (i.title || '').toLowerCase().includes(acc.name.toLowerCase())));
          if (existingTransportIdx >= 0) {
            items[existingTransportIdx] = { ...items[existingTransportIdx], ...transportItem, id: items[existingTransportIdx].id };
          } else {
            items.push(transportItem);
          }

          // Purgar explicitamente segundo evento de chegada ao aeroporto ou flight-leave duplicado
          items = items.filter((i) => {
            const idL = (i.id || '').toLowerCase();
            const tL = (i.title || '').toLowerCase();
            return !(
              idL.includes('airport-arr') ||
              idL.includes('flight-leave') ||
              tL.includes('chegada ao aeroporto') ||
              tL.includes('transporte:')
            );
          });

          // Purgar qualquer "Fim do dia" / "auto-retorno" no dia de partida com voo
          items = items.filter((i) => {
            const idL = (i.id || '').toLowerCase();
            const tL = (i.title || '').toLowerCase();
            return !(idL.startsWith('auto-retorno') || tL.includes('fim do dia'));
          });
        }
      } else {
        // Purgar check-out de acomodações cuja data de término não seja este dia
        items = items.filter((i) => {
          if (i.sourceId === `acc-checkout-${acc.id}` || i.sourceId === `acc-transport-${acc.id}` || i.sourceId === `airport-arr-${acc.id}`) return false;
          if (acc.name) {
            const tLower = (i.title || '').toLowerCase();
            if ((tLower.includes('check-out') || tLower.includes('saída de') || tLower.includes('chegada ao aeroporto')) && tLower.includes(acc.name.toLowerCase())) return false;
          }
          return true;
        });
      }
    });


  }

  // Aplica a regra única e centralizada para o início do dia na acomodação
  items = applyAccommodationMorningRule(items, day, tripContext);

  // Alinhar saída e check-out se check-out for antes da saída
  items = adjustScheduleForCheckoutAndDeparture(items, dayCheckOutTime, Boolean(dayCheckOutTime));

  return deduplicateHourlySchedule(items);
}

/**
 * REGRA 8: TÍTULOS DOS DIAS
 * Verifica se um título de dia é o padrão automático do sistema ou se foi personalizado pelo usuário.
 */
export function isDefaultItineraryDayTitle(title?: string, parkName?: string): boolean {
  if (!title || !title.trim()) return true;
  const t = title.trim().toLowerCase();

  // Se o título contiver o nome de um parque temático específico, é considerado dia de parque/personalizado
  if (parkName && parkName !== 'Sem Parque' && parkName !== 'Parque a Definir') {
    const pNorm = parkName.toLowerCase().trim();
    if (t.includes(pNorm) || pNorm.includes(t)) {
      return false;
    }
  }

  // Títulos automáticos padrão do sistema
  const defaultKeywords = [
    'chegada',
    'partida',
    'sem parque',
    'dia livre / sem parque',
    'dia livre',
    'saída de casa',
    'saida de casa',
    'retorno para casa',
    'fim da viagem',
    'partida / saída',
    'partida / saida',
    'retorno / saída',
    'retorno / saida',
    'chegada em orlando & check-in',
    'check-out & retorno ao brasil',
    'programação livre',
    'programacao livre',
    'planejamento livre',
    'novo dia mágico',
    'novo dia magico',
  ];

  if (defaultKeywords.includes(t)) {
    return true;
  }

  // Padrões como "Dia 1", "Dia 1: Chegada", "Dia 1 - Sem Parque", "Dia 1: Saída de Casa", etc.
  const regex = /^dia\s+\d+(\s*[-:]\s*(sem parque|dia livre|chegada|partida|saída de casa|saida de casa|retorno para casa|fim da viagem|novo dia mágico|novo dia magico|partida \/ saída|partida \/ saida|retorno \/ saída|retorno \/ saida))?$/i;
  if (regex.test(t)) {
    return true;
  }

  return false;
}

export interface FlightSyncContext {
  days: Omit<ItineraryDay, 'date'>[];
  flights: FlightSegment[];
  accommodations: AccommodationBooking[];
  carRentals: CarRentalBooking[];
  startDate: string;
  durationDays: number;
}

function offsetDateString(startDateStr: string, daysOffset: number): string {
  try {
    const parts = (startDateStr || '').split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + daysOffset);
      const y = d.getFullYear();
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mon}-${day}`;
    }
  } catch {}
  return startDateStr;
}

function dateDiffInDays(dateA: string, dateB: string): number {
  try {
    const pA = (dateA || '').split('-').map((v) => parseInt(v, 10));
    const pB = (dateB || '').split('-').map((v) => parseInt(v, 10));
    if (pA.length === 3 && pB.length === 3) {
      const dA = new Date(pA[0], pA[1] - 1, pA[2]);
      const dB = new Date(pB[0], pB[1] - 1, pB[2]);
      return Math.round((dB.getTime() - dA.getTime()) / (1000 * 60 * 60 * 24));
    }
  } catch {}
  return 0;
}

/**
 * SINCRONIZADOR CENTRAL DE VOOS, ACOMODAÇÕES E ROTEIRO DIA A DIA (REGRAS 1 A 12)
 * - Avalia todos os trechos cadastrados.
 * - Elimina duplicidades e agrupa bilhetes comprados separadamente para o mesmo voo (Regra 10).
 * - Calcula 4 horas de antecedência na ida (Regra 4) considerando mudança de data (Regra 1).
 * - Calcula saída do retorno com antecedência de 3 horas + Maps + locadora (Regra 5).
 * - Conexões geram apenas decolagem e pouso (Regra 9).
 * - Atualiza títulos automáticos (Regra 8) preservando títulos manuais.
 * - Recalcula check-in (Regra 7) e check-out (Regra 6) para todos os dias dependentes.
 * - Preserva integralmente eventos manuais e notas do usuário (Regra 12).
 */
export function syncFlightsWithItineraryDays(params: FlightSyncContext): {
  updatedDays: Omit<ItineraryDay, 'date'>[];
  newStartDate?: string;
  newDurationDays?: number;
} {
  const { flights = [], accommodations = [], carRentals = [], startDate, durationDays } = params;

  // 1. Limpar itens automáticos anteriores de voo para reavaliação limpa (Regra 2)
  let currentDays: Omit<ItineraryDay, 'date'>[] = (params.days || []).map((d) => ({
    ...d,
    hourlySchedule: (d.hourlySchedule || []).filter(
      (item) => !(item.sourceType === 'flight' || (item.id && (item.id.startsWith('flight-') || item.id.startsWith('auto-flight-'))))
    ),
  }));

  if (!startDate) {
    return { updatedDays: currentDays };
  }

  // Se não houver voos cadastrados, re-sincroniza dias normais
  if (flights.length === 0) {
    const tripContext = { flights: [], accommodations, carRentals, startDate, totalDays: currentDays.length };
    const synced = currentDays.map((d, idx) => {
      const dDate = offsetDateString(startDate, idx);
      const schedule = syncAllEventsToHourlySchedule({ ...d, date: dDate }, tripContext);
      return {
        ...d,
        hourlySchedule: schedule,
      };
    });
    return { updatedDays: synced };
  }

  const formatRoute = (f: FlightSegment) => {
    let orig = f.originAirport || f.originCity || 'Origem';
    if (f.originCode && !orig.includes(`(${f.originCode})`)) {
      orig = `${orig} (${f.originCode})`;
    }
    let dest = f.destinationAirport || f.destinationCity || 'Destino';
    if (f.destinationCode && !dest.includes(`(${f.destinationCode})`)) {
      dest = `${dest} (${f.destinationCode})`;
    }
    return { orig, dest };
  };

  // 2. Agrupamento para Prevenção de Duplicidades (Regra 10)
  const norm = (s?: string) => (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  interface FlightGroup {
    primaryFlight: FlightSegment;
    pnrs: Set<string>;
    passengers: Set<string>;
    flightIds: Set<string>;
  }

  const groupsMap: Record<string, FlightGroup> = {};

  flights.forEach((f) => {
    const flightNum = norm(f.flightNumber);
    const depDate = f.departureDate || startDate;
    const depTime = f.departureTime || '12:00';
    const type = f.type || 'outbound';
    const key = flightNum ? `${type}_${depDate}_${flightNum}` : `${type}_${depDate}_${depTime}`;

    if (!groupsMap[key]) {
      groupsMap[key] = {
        primaryFlight: f,
        pnrs: new Set<string>(),
        passengers: new Set<string>(),
        flightIds: new Set<string>(),
      };
    }
    if (f.pnrLocator && f.pnrLocator.trim()) {
      groupsMap[key].pnrs.add(f.pnrLocator.trim());
    }
    (f.passengers || []).forEach((p) => {
      if (p && p.trim()) groupsMap[key].passengers.add(p.trim());
    });
    groupsMap[key].flightIds.add(f.id);
  });

  const allGroups = Object.values(groupsMap);
  const outboundGroups = allGroups
    .filter((g) => g.primaryFlight.type === 'outbound' || !g.primaryFlight.type)
    .sort((a, b) => {
      const dateCmp = (a.primaryFlight.departureDate || '').localeCompare(b.primaryFlight.departureDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.primaryFlight.departureTime || '').localeCompare(b.primaryFlight.departureTime || '');
    });

  const inboundGroups = allGroups
    .filter((g) => g.primaryFlight.type === 'inbound')
    .sort((a, b) => {
      const dateCmp = (a.primaryFlight.departureDate || '').localeCompare(b.primaryFlight.departureDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.primaryFlight.departureTime || '').localeCompare(b.primaryFlight.departureTime || '');
    });

  const otherGroups = allGroups
    .filter((g) => g.primaryFlight.type !== 'outbound' && g.primaryFlight.type !== 'inbound' && Boolean(g.primaryFlight.type))
    .sort((a, b) => {
      const dateCmp = (a.primaryFlight.departureDate || '').localeCompare(b.primaryFlight.departureDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.primaryFlight.departureTime || '').localeCompare(b.primaryFlight.departureTime || '');
    });

  let effectiveStartDate = startDate;
  let effectiveDuration = Math.max(currentDays.length, durationDays || 1);

  // Verificar se o primeiro voo sai de casa antes da data de início da viagem (Regra 1 & 4)
  if (outboundGroups.length > 0) {
    const firstOut = outboundGroups[0].primaryFlight;
    const firstDepDate = firstOut.departureDate || startDate;
    const firstDepTime = firstOut.departureTime || '12:00';
    const leaveOffset = subtractTimeWithDateOffset(firstDepDate, firstDepTime, 240);
    if (leaveOffset.date < effectiveStartDate) {
      const daysBack = dateDiffInDays(leaveOffset.date, effectiveStartDate);
      if (daysBack > 0) {
        const prependedDays: Omit<ItineraryDay, 'date'>[] = Array.from({ length: daysBack }, (_, i) => ({
          id: `day-pre-${i + 1}-${Date.now()}`,
          dayNumber: i + 1,
          title: 'Saída de Casa',
          park: 'Sem Parque' as any,
          completed: false,
          morning: { where: '', dining: '', notes: '' },
          afternoon: { where: '', dining: '', notes: '' },
          night: { where: '', dining: '', notes: '' },
          generalNotes: '',
          hourlySchedule: [],
        }));
        currentDays = [...prependedDays, ...currentDays].map((d, idx) => ({ ...d, dayNumber: idx + 1 }));
        effectiveStartDate = leaveOffset.date;
        effectiveDuration += daysBack;
      }
    }
  }

  // Garantir que todos os voos cabem dentro do array de dias
  let latestFlightDate = effectiveStartDate;
  allGroups.forEach((g) => {
    const dDate = g.primaryFlight.departureDate;
    const aDate = g.primaryFlight.arrivalDate;
    if (dDate && dDate > latestFlightDate) latestFlightDate = dDate;
    if (aDate && aDate > latestFlightDate) latestFlightDate = aDate;
  });

  const diffToEnd = dateDiffInDays(effectiveStartDate, latestFlightDate);
  const neededDays = diffToEnd + 1;
  if (neededDays > currentDays.length) {
    const extraNeeded = neededDays - currentDays.length;
    const appendedDays: Omit<ItineraryDay, 'date'>[] = Array.from({ length: extraNeeded }, (_, i) => {
      const num = currentDays.length + i + 1;
      return {
        id: `day-app-${num}-${Date.now()}`,
        dayNumber: num,
        title: num === neededDays ? 'Fim da Viagem' : 'Sem Parque',
        park: 'Sem Parque' as any,
        completed: false,
        morning: { where: '', dining: '', notes: '' },
        afternoon: { where: '', dining: '', notes: '' },
        night: { where: '', dining: '', notes: '' },
        generalNotes: '',
        hourlySchedule: [],
      };
    });
    currentDays = [...currentDays, ...appendedDays].map((d, idx) => ({ ...d, dayNumber: idx + 1 }));
    effectiveDuration = currentDays.length;
  }

  // Helper para adicionar item no dia correspondente com detecção de conflitos (Regra 12)
  const addItemToDate = (targetDate: string, item: HourlyScheduleItem) => {
    const dayIndex = currentDays.findIndex((_, idx) => offsetDateString(effectiveStartDate, idx) === targetDate);
    if (dayIndex !== -1) {
      const schedule = currentDays[dayIndex].hourlySchedule || [];
      const existIdx = schedule.findIndex((i) => i.id === item.id || (i.sourceId && i.sourceId === item.sourceId && i.title === item.title));

      // REGRA 12: Preservar eventos manuais criados pelo usuário e indicar conflito nas observações
      const conflictingItem = schedule.find((i) => {
        if (!i || i.id === item.id || i.sourceType === 'flight') return false;
        const isManualOrCustom = i.sourceType === 'dining' || i.sourceType === 'show' || !i.sourceType || i.category === 'dining';
        return isManualOrCustom && i.time === item.time;
      });

      let itemToInsert = { ...item };
      if (conflictingItem) {
        const conflictNotice = `⚠️ Conflito de horário com o evento "${conflictingItem.title}" (${conflictingItem.time}).`;
        if (!itemToInsert.notes?.includes('Conflito de horário')) {
          itemToInsert.notes = itemToInsert.notes ? `${itemToInsert.notes} ${conflictNotice}` : conflictNotice;
        }
      }

      if (existIdx >= 0) {
        schedule[existIdx] = { ...schedule[existIdx], ...itemToInsert };
      } else {
        schedule.push(itemToInsert);
      }
      currentDays[dayIndex].hourlySchedule = schedule;
    }
  };

  // 3. Processar Voos de Ida (Regras 3, 4, 9, 10)
  outboundGroups.forEach((group, idx) => {
    const f = group.primaryFlight;
    const depDate = f.departureDate || effectiveStartDate;
    const depTime = f.departureTime || '12:00';
    const arrDate = f.arrivalDate || depDate;
    const arrTime = f.arrivalTime || '18:00';
    const { orig: originStr, dest: destStr } = formatRoute(f);
    const pnrsStr = Array.from(group.pnrs).join(', ');
    const passStr = Array.from(group.passengers).join(', ');
    const pnrNote = pnrsStr ? ` Localizador(es) PNR: ${pnrsStr}.` : '';
    const passNote = passStr ? ` Passageiro(s): ${passStr}.` : '';
    const consolidatedNotes = `${pnrNote}${passNote}`;

    // Saída de casa apenas no primeiro trecho da ida (Regra 4 e Regra 9)
    if (idx === 0) {
      const leaveOffset = subtractTimeWithDateOffset(depDate, depTime, 240);
      const leaveLocation = f.originCity ? `Residência / Casa (${f.originCity})` : (f.originAirport || 'Residência / Casa');
      const leaveItem: HourlyScheduleItem = {
        id: generateDeterministicUUID('flight-leave', f.id),
        time: leaveOffset.time,
        title: `🏠 Sair de casa rumo ao aeroporto — Voo ${f.flightNumber}`,
        category: 'transport',
        location: leaveLocation,
        sourceType: 'flight',
        sourceId: f.id,
        completed: false,
        notes: `Saída de casa com antecedência recomendada de 4 horas antes da decolagem (às ${depTime} em ${originStr}).${consolidatedNotes}`,
      };
      addItemToDate(leaveOffset.date, leaveItem);
    }

    // Decolagem (Regra 3)
    const takeoffItem: HourlyScheduleItem = {
      id: generateDeterministicUUID('flight-takeoff', f.id),
      time: depTime,
      title: `✈️ Decolagem em ${originStr} — Voo ${f.flightNumber}`,
      category: 'flight',
      location: originStr,
      sourceType: 'flight',
      sourceId: f.id,
      completed: false,
      notes: `Decolagem de ${originStr} ➔ ${destStr}.${consolidatedNotes}`,
    };
    addItemToDate(depDate, takeoffItem);

    // Pouso (Regra 3)
    const landingItem: HourlyScheduleItem = {
      id: generateDeterministicUUID('flight-arrival', f.id),
      time: arrTime,
      title: `🛬 Chegada em ${destStr} — Voo ${f.flightNumber}`,
      category: 'flight',
      location: destStr,
      sourceType: 'flight',
      sourceId: f.id,
      completed: false,
      notes: `Pouso estimado às ${arrTime}. Procedimentos de desembarque, imigração e retirada de bagagens na esteira.${consolidatedNotes}`,
    };
    addItemToDate(arrDate, landingItem);
  });

  // 4. Processar Voos de Retorno (Regras 3, 5, 9, 10)
  inboundGroups.forEach((group, idx) => {
    const f = group.primaryFlight;
    const depDate = f.departureDate || effectiveStartDate;
    const depTime = f.departureTime || '12:00';
    const arrDate = f.arrivalDate || depDate;
    const arrTime = f.arrivalTime || '18:00';
    const { orig: originStr, dest: destStr } = formatRoute(f);
    const pnrsStr = Array.from(group.pnrs).join(', ');
    const passStr = Array.from(group.passengers).join(', ');
    const pnrNote = pnrsStr ? ` Localizador(es) PNR: ${pnrsStr}.` : '';
    const passNote = passStr ? ` Passageiro(s): ${passStr}.` : '';
    const consolidatedNotes = `${pnrNote}${passNote}`;

    // Saída da acomodação apenas no primeiro trecho do retorno (Regra 5 e Regra 9)
    if (idx === 0) {
      const originAirportInfo = estimateAirportCoordinates(f.originCode || f.originAirport || f.originCity || 'MCO');
      const returnAcc =
        accommodations.find(
          (a) =>
            a.checkOutDate === depDate ||
            (a.checkInDate && a.checkOutDate && depDate >= a.checkInDate && depDate <= a.checkOutDate)
        ) || (accommodations.length > 0 ? accommodations[accommodations.length - 1] : undefined);

      const hasCheckoutToday = returnAcc && returnAcc.checkOutDate === depDate;
      if (hasCheckoutToday) {
        // Handled by syncAllEventsToHourlySchedule
      } else {
        let leaveOffset: { date: string; time: string; dayOffset: number };
        let leaveNotes = '';
        let leaveLocation = 'Acomodação';

        if (returnAcc) {
          const accCoords = estimateAccommodationCoordinates(returnAcc.name, returnAcc.address);
          const originAirportInfo = estimateAirportCoordinates(f.originCode || f.originAirport || f.originCity || 'MCO');
          let driveMins = calculateDriveTimeMinutes(accCoords, { lat: originAirportInfo.lat, lng: originAirportInfo.lng });
          if ((returnAcc.name || '').toLowerCase().includes('modern retreat') || (returnAcc.address || '').toLowerCase().includes('venetian bay')) {
            driveMins = 63;
          }

          const hasCarDropoff = carRentals.some((r) => r.dropoffDate === depDate);
          const totalMins = 180 + driveMins + (hasCarDropoff ? 30 : 0);
          leaveOffset = subtractTimeWithDateOffset(depDate, depTime, totalMins);
          leaveLocation = returnAcc.address || returnAcc.name || 'Acomodação';

          const checkoutToday = accommodations.find((a) => a.checkOutDate === depDate && a.id === returnAcc.id) || accommodations.find((a) => a.checkOutDate === depDate);
          const checkOutTime = checkoutToday?.checkOutTime;

          if (checkOutTime && checkOutTime.localeCompare(leaveOffset.time) <= 0) {
            leaveOffset.time = checkOutTime;
            const arrivalAtAirportTime = addMinutesToTimeString(checkOutTime, driveMins);
            const [depH, depM] = depTime.split(':').map((v) => parseInt(v, 10));
            const [arrH, arrM] = arrivalAtAirportTime.split(':').map((v) => parseInt(v, 10));
            const leadTotalMins = (depH * 60 + depM) - (arrH * 60 + arrM);
            const leadHours = Math.floor(leadTotalMins / 60);
            const leadMinsRem = leadTotalMins % 60;
            const leadStr = `${leadHours}h ${String(leadMinsRem).padStart(2, '0')}min`;

            leaveNotes = `Saída da acomodação ajustada para às ${checkOutTime} coincidindo com o horário de check-out em ${returnAcc.name} (para evitar espera na acomodação após a entrega de chaves). Trajeto estimado: ${driveMins} min via Maps. Chegada estimada ao aeroporto (${originAirportInfo.name}) às ${arrivalAtAirportTime}, garantindo ${leadStr} de antecedência para a decolagem às ${depTime}.${consolidatedNotes}`;
          } else {
            leaveNotes = `Saída calculada com 3 horas de antecedência no aeroporto (${originStr}) + ${driveMins} min de deslocamento via Maps a partir de ${returnAcc.name}${hasCarDropoff ? ' + 30 min para devolução do veículo alugado' : ''}. Decolagem às ${depTime}.${consolidatedNotes}`;
          }
        } else {
          leaveOffset = subtractTimeWithDateOffset(depDate, depTime, 240);
          leaveNotes = `Deslocamento da acomodação até o aeroporto não foi calculated por ausência de acomodação cadastrada; utilizando estimativa padrão de 4 horas de antecedência para a decolagem às ${depTime}.${consolidatedNotes}`;
        }

        const leaveItem: HourlyScheduleItem = {
          id: generateDeterministicUUID('flight-leave', f.id),
          time: leaveOffset.time,
          title: `🚗 Transporte: ${returnAcc?.name || 'Acomodação'} → ${originAirportInfo.name}`,
          category: 'transport',
          location: leaveLocation,
          sourceType: 'transport',
          sourceId: f.id,
          completed: false,
          notes: leaveNotes,
        };
        addItemToDate(leaveOffset.date, leaveItem);
      }
    }

    // Decolagem
    const takeoffItem: HourlyScheduleItem = {
      id: generateDeterministicUUID('flight-takeoff', f.id),
      time: depTime,
      title: `✈️ Decolagem em ${originStr} — Voo ${f.flightNumber}`,
      category: 'flight',
      location: originStr,
      sourceType: 'flight',
      sourceId: f.id,
      completed: false,
      notes: `Decolagem de retorno de ${originStr} ➔ ${destStr}.${consolidatedNotes}`,
    };
    addItemToDate(depDate, takeoffItem);

    // Pouso
    const landingItem: HourlyScheduleItem = {
      id: generateDeterministicUUID('flight-arrival', f.id),
      time: arrTime,
      title: `🛬 Chegada em ${destStr} — Voo ${f.flightNumber}`,
      category: 'flight',
      location: destStr,
      sourceType: 'flight',
      sourceId: f.id,
      completed: false,
      notes: `Pouso estimado às ${arrTime}. Desembarque, alfândega e recolhimento de bagagens.${consolidatedNotes}`,
    };
    addItemToDate(arrDate, landingItem);
  });

  // 5. Conexões e Outros Trechos (Regra 9)
  otherGroups.forEach((group) => {
    const f = group.primaryFlight;
    const depDate = f.departureDate || effectiveStartDate;
    const depTime = f.departureTime || '12:00';
    const arrDate = f.arrivalDate || depDate;
    const arrTime = f.arrivalTime || '18:00';
    const { orig: originStr, dest: destStr } = formatRoute(f);
    const pnrsStr = Array.from(group.pnrs).join(', ');
    const passStr = Array.from(group.passengers).join(', ');
    const pnrNote = pnrsStr ? ` Localizador(es) PNR: ${pnrsStr}.` : '';
    const passNote = passStr ? ` Passageiro(s): ${passStr}.` : '';
    const consolidatedNotes = `${pnrNote}${passNote}`;

    const takeoffItem: HourlyScheduleItem = {
      id: generateDeterministicUUID('flight-takeoff', f.id),
      time: depTime,
      title: `✈️ Decolagem em ${originStr} — Voo ${f.flightNumber}`,
      category: 'flight',
      location: originStr,
      sourceType: 'flight',
      sourceId: f.id,
      completed: false,
      notes: `Conexão / Trecho: ${originStr} ➔ ${destStr}.${consolidatedNotes}`,
    };
    addItemToDate(depDate, takeoffItem);

    const landingItem: HourlyScheduleItem = {
      id: generateDeterministicUUID('flight-arrival', f.id),
      time: arrTime,
      title: `🛬 Chegada em ${destStr} — Voo ${f.flightNumber}`,
      category: 'flight',
      location: destStr,
      sourceType: 'flight',
      sourceId: f.id,
      completed: false,
      notes: `Pouso estimado às ${arrTime}.${consolidatedNotes}`,
    };
    addItemToDate(arrDate, landingItem);
  });

  // 6. Atualização de Títulos dos Dias (Regra 8)
  if (outboundGroups.length > 0) {
    const firstOut = outboundGroups[0].primaryFlight;
    const lastOut = outboundGroups[outboundGroups.length - 1].primaryFlight;
    const depDate = firstOut.departureDate || effectiveStartDate;
    const arrDate = lastOut.arrivalDate || depDate;
    const leaveOffset = subtractTimeWithDateOffset(depDate, firstOut.departureTime || '12:00', 240);
    const homeLeaveDate = leaveOffset.date;

    currentDays = currentDays.map((day, idx) => {
      const dDate = offsetDateString(effectiveStartDate, idx);
      if (isDefaultItineraryDayTitle(day.title, day.park)) {
        if (homeLeaveDate === arrDate && dDate === depDate) {
          return { ...day, title: 'Chegada' };
        } else if (homeLeaveDate !== arrDate) {
          if (dDate === homeLeaveDate || (dDate === depDate && depDate !== arrDate)) {
            return { ...day, title: 'Saída de Casa' };
          }
          if (dDate === arrDate) {
            return { ...day, title: 'Chegada' };
          }
        }
      }
      return day;
    });
  }

  if (inboundGroups.length > 0) {
    const firstIn = inboundGroups[0].primaryFlight;
    const lastIn = inboundGroups[inboundGroups.length - 1].primaryFlight;
    const depDate = firstIn.departureDate || effectiveStartDate;
    const arrDate = lastIn.arrivalDate || depDate;
    const returnLeaveOffset = subtractTimeWithDateOffset(depDate, firstIn.departureTime || '12:00', 240);
    const returnLeaveDate = returnLeaveOffset.date;

    currentDays = currentDays.map((day, idx) => {
      const dDate = offsetDateString(effectiveStartDate, idx);
      if (isDefaultItineraryDayTitle(day.title, day.park)) {
        if (depDate === arrDate && returnLeaveDate === depDate && dDate === depDate) {
          return { ...day, title: 'Fim da Viagem' };
        } else if (depDate !== arrDate || returnLeaveDate !== depDate) {
          if (dDate === returnLeaveDate || (dDate === depDate && depDate !== arrDate)) {
            return { ...day, title: 'Retorno para Casa' };
          }
          if (dDate === arrDate) {
            return { ...day, title: 'Fim da Viagem' };
          }
        }
      }
      return day;
    });
  }

  // 7. Reavaliação de todos os eventos dependentes (Acomodação, Check-in Regra 7, Check-out Regra 6 e Carros)
  const tripContext = {
    flights,
    accommodations,
    carRentals,
    startDate: effectiveStartDate,
    totalDays: currentDays.length,
  };

  currentDays = currentDays.map((day, idx) => {
    const dDate = offsetDateString(effectiveStartDate, idx);
    const fullSchedule = syncAllEventsToHourlySchedule(
      { ...day, date: dDate },
      tripContext
    );
    return {
      ...day,
      hourlySchedule: fullSchedule,
    };
  });

  return {
    updatedDays: currentDays,
    newStartDate: effectiveStartDate !== startDate ? effectiveStartDate : undefined,
    newDurationDays: effectiveDuration !== durationDays ? effectiveDuration : undefined,
  };
}

/**
 * REGRA 5: SINCRONIZAÇÃO COMPLETA DE ACOMODAÇÕES COM OS DIAS DO ROTEIRO
 * Recalcula todos os dias de roteiro afetados pela acomodação:
 * - Se as datas mudarem, atualiza tanto os dias antigos quanto os novos.
 * - Se o endereço ou tempos de deslocamento mudarem, recalcula:
 *   - Horários de saída para os parques e retorno à acomodação nos dias correspondentes.
 *   - Horário de saída para o aeroporto no voo de retorno.
 *   - Horário de chegada e check-in no dia 1 / dia de chegada.
 * - Posiciona check-in e check-out nos dias e horários correspondentes.
 * - Aplica ajuste inteligente de check-out caso voo ou devolução exijam saída antecipada.
 * - Preserva itens manuais, observações do usuário e atividades personalizadas.
 * - Evita duplicidades usando identificadores determinísticos e filtragem estável.
 */
export function syncAccommodationsWithItineraryDays(params: {
  currentDays: Omit<ItineraryDay, 'date'>[];
  accommodations: AccommodationBooking[];
  flights: FlightSegment[];
  carRentals?: CarRentalBooking[];
  selectedAccommodationsPerNight?: Record<string, string>;
  startDate: string;
  durationDays: number;
}): Omit<ItineraryDay, 'date'>[] {
  const { currentDays, accommodations, flights, carRentals, selectedAccommodationsPerNight, startDate, durationDays } = params;
  if (!currentDays || currentDays.length === 0) return [];

  const effectiveStartDate = startDate || '2026-11-01';
  const effectiveTotalDays = currentDays.length;

  const tripContext = {
    flights: flights || [],
    accommodations: accommodations || [],
    carRentals: carRentals || [],
    selectedAccommodationsPerNight: selectedAccommodationsPerNight || {},
    startDate: effectiveStartDate,
    totalDays: effectiveTotalDays,
  };

  // 1. Recalcular os eventos de saída para o aeroporto no retorno caso o endereço ou tempos tenham mudado
  const returnFlights = (flights || []).filter((fl) => fl && fl.type === 'inbound');
  let updatedDays = currentDays.map((day, idx) => {
    const dDate = offsetDateString(effectiveStartDate, idx);
    let schedule = day.hourlySchedule ? [...day.hourlySchedule] : [];

    // Se houver voo de retorno saindo neste dia, atualizar o evento de saída da acomodação com base na nova acomodação ativa
    if (returnFlights.length > 0) {
      const matchingFlight = returnFlights.find((fl) => fl.departureDate === dDate || (!fl.departureDate && idx === effectiveTotalDays - 1));
      if (matchingFlight) {
        const originAirportInfo = estimateAirportCoordinates(matchingFlight.originCode || matchingFlight.originAirport || matchingFlight.originCity || 'MCO');
        const depTime = matchingFlight.departureTime || '12:00';
        const returnAcc = accommodations.find(
          (a) => a.checkOutDate === dDate || (a.checkInDate && a.checkOutDate && dDate >= a.checkInDate && dDate <= a.checkOutDate)
        ) || (accommodations.length > 0 ? accommodations[accommodations.length - 1] : undefined);

        let leaveOffset: { date: string; time: string; dayOffset: number };
        let leaveNotes = '';
        let leaveLocation = 'Acomodação';

        if (returnAcc) {
          const accCoords = estimateAccommodationCoordinates(returnAcc.name, returnAcc.address);
          const originAirportInfo = estimateAirportCoordinates(matchingFlight.originCode || matchingFlight.originAirport || matchingFlight.originCity || 'MCO');
          let driveMins = calculateDriveTimeMinutes(accCoords, { lat: originAirportInfo.lat, lng: originAirportInfo.lng });
          if ((returnAcc.name || '').toLowerCase().includes('modern retreat') || (returnAcc.address || '').toLowerCase().includes('venetian bay')) {
            driveMins = 63;
          }

          const hasCarDropoff = (carRentals || []).some((r) => r.dropoffDate === dDate);
          const totalMins = 180 + driveMins + (hasCarDropoff ? 30 : 0);
          leaveOffset = subtractTimeWithDateOffset(dDate, depTime, totalMins);
          leaveLocation = returnAcc.address || returnAcc.name || 'Acomodação';

          const checkoutToday = accommodations.find((a) => a.checkOutDate === dDate && a.id === returnAcc.id) || accommodations.find((a) => a.checkOutDate === dDate);
          const checkOutTime = checkoutToday?.checkOutTime;

          if (checkOutTime && checkOutTime.localeCompare(leaveOffset.time) <= 0) {
            leaveOffset.time = checkOutTime;
            const arrivalAtAirportTime = addMinutesToTimeString(checkOutTime, driveMins);
            const [depH, depM] = depTime.split(':').map((v) => parseInt(v, 10));
            const [arrH, arrM] = arrivalAtAirportTime.split(':').map((v) => parseInt(v, 10));
            const leadTotalMins = (depH * 60 + depM) - (arrH * 60 + arrM);
            const leadHours = Math.floor(leadTotalMins / 60);
            const leadMinsRem = leadTotalMins % 60;
            const leadStr = `${leadHours}h ${String(leadMinsRem).padStart(2, '0')}min`;

            leaveNotes = `Saída da acomodação ajustada para às ${checkOutTime} coincidindo com o horário de check-out em ${returnAcc.name} (para evitar espera na acomodação após a entrega de chaves). Trajeto estimado: ${driveMins} min via Maps. Chegada estimada ao aeroporto (${originAirportInfo.name}) às ${arrivalAtAirportTime}, garantindo ${leadStr} de antecedência para a decolagem às ${depTime}.`;
          } else {
            leaveNotes = `Saída calculada com 3 horas de antecedência no aeroporto + ${driveMins} min de deslocamento via Maps a partir de ${returnAcc.name}${hasCarDropoff ? ' + 30 min para devolução do veículo alugado' : ''}. Decolagem às ${depTime}.`;
          }
        } else {
          leaveOffset = subtractTimeWithDateOffset(dDate, depTime, 240);
          leaveNotes = `Deslocamento da acomodação até o aeroporto não foi calculated por ausência de acomodação cadastrada; utilizando estimativa padrão de 4 horas de antecedência para a decolagem às ${depTime}.`;
        }

        const leaveIdx = schedule.findIndex((i) => i.id === generateDeterministicUUID('flight-leave', matchingFlight.id) || ((i.sourceType === 'flight' || i.sourceType === 'transport') && ((i.title || '').toLowerCase().includes('sair da acomodação') || (i.title || '').toLowerCase().includes('transporte'))));
        const leaveItem: HourlyScheduleItem = {
          id: generateDeterministicUUID('flight-leave', matchingFlight.id),
          time: leaveOffset.time,
          title: `🚗 Transporte: ${returnAcc?.name || 'Acomodação'} → ${originAirportInfo.name}`,
          category: 'transport',
          location: leaveLocation,
          sourceType: 'transport',
          sourceId: matchingFlight.id,
          completed: false,
          notes: leaveNotes,
        };

        if (leaveIdx >= 0) {
          schedule[leaveIdx] = { ...schedule[leaveIdx], ...leaveItem, id: schedule[leaveIdx].id };
        } else {
          schedule.push(leaveItem);
        }
      }
    }

    // Se for dia de parque, re-executar generateParkScheduleResult com a acomodação correspondente a este dia
    const hasPark = day.park && day.park !== 'Sem Parque' && day.park !== 'Parque a Definir';
    if (hasPark) {
      // Localizar acomodação ativa nesta data para pernoite/itinerário
      const activeAcc = resolveAccommodationForNight(accommodations, dDate, tripContext.selectedAccommodationsPerNight) ||
        accommodations.find((a) => a.checkInDate && a.checkOutDate && dDate >= a.checkInDate && dDate < a.checkOutDate) ||
        accommodations.find((a) => a.checkInDate === dDate) ||
        accommodations[0];

      const pb = day.parkBooking;
      const res = generateParkScheduleResult(
        day.park,
        pb?.parkHours?.openingTime || '09:00',
        pb?.parkHours?.closingTime || '21:00',
        pb?.parkHours?.earlyEntryTime,
        activeAcc?.name,
        schedule,
        pb?.id,
        day.dayNumber,
        activeAcc?.address,
        day,
        currentDays,
        undefined,
        pb
      );
      schedule = res.currentDaySchedule;
    }

    return {
      ...day,
      hourlySchedule: schedule,
    };
  });

  // 2. Aplicar syncAllEventsToHourlySchedule em todos os dias para alinhar check-in, check-out, início/fim de dia e regras de aeroporto
  updatedDays = updatedDays.map((day, idx) => {
    const dDate = offsetDateString(effectiveStartDate, idx);
    const dayWithDate = { ...day, date: dDate };
    const fullSchedule = syncAllEventsToHourlySchedule(dayWithDate, tripContext);
    return {
      ...day,
      hourlySchedule: fullSchedule,
    };
  });

  return updatedDays;
}

/**
 * Retorna os itens de cronograma de um dia, garantindo que um dia sem eventos reais
 * permaneça vazio sem criar nenhum evento artificial (como evento às 10:00 com o título do dia).
 * A ausência de registros é válida e não deve gravar eventos fictícios no banco.
 */
export function ensureHourlyScheduleItems(
  dayOrSchedule?: { hourlySchedule?: HourlyScheduleItem[]; title?: string } | HourlyScheduleItem[] | null
): HourlyScheduleItem[] {
  if (!dayOrSchedule) return [];
  const items = Array.isArray(dayOrSchedule)
    ? dayOrSchedule
    : (dayOrSchedule.hourlySchedule || []);

  if (!items || items.length === 0) return [];

  // Purgar quaisquer itens fictícios legados (ex: eventos artificiais de placeholder às 10:00)
  const cleanItems = items.filter((item) => {
    if (!item) return false;
    // REGRA DE OURO: Horários manuais NUNCA devem ser removidos nem filtrados por rotinas de limpeza automática
    if (item.sourceType === 'manual') {
      return true;
    }

    const id = (item.id || '').toLowerCase();
    if (id.startsWith('artificial-') || id === 'auto-empty-placeholder') {
      return false;
    }

    // A limpeza automática só pode identificar placeholders artificiais com critérios confiáveis
    const isAutoPlaceholderSource =
      item.sourceType === 'gen' ||
      item.sourceType === 'placeholder' ||
      item.sourceType === 'system' ||
      (!item.sourceType && !item.sourceId);

    const isArtificialNote = (item.notes || '').trim() === 'Atividade programada para o dia.';
    const isArtificialId = id.includes('empty-schedule') || id.includes('placeholder');

    if (
      item.time === '10:00' &&
      isAutoPlaceholderSource &&
      (isArtificialNote || isArtificialId) &&
      (!item.location || !item.location.trim())
    ) {
      return false;
    }
    return true;
  });

  return deduplicateHourlySchedule(cleanItems);
}

/**
 * Audita dados da viagem garantindo integridade dos dias sem inventar
 * voos, acomodações ou horários fictícios no banco.
 */
export function hydrateTripBookingsFromExpenses(trip: any): any {
  if (!trip) return trip;
  const expenses = trip.expenses || [];
  if (expenses.length === 0) return trip;

  const hydrateItem = (item: any, sourceType: string) => {
    const matchingExp = expenses.find((e: any) => 
      (e.sourceType === sourceType && e.sourceId === item.id) ||
      e.id === generateDeterministicUUID(
        sourceType === 'flight' ? 'flight-expense' :
        sourceType === 'accommodation' ? 'acc-expense' :
        sourceType === 'car_rental' ? 'car-expense' : 'ticket-expense',
        item.id
      )
    );
    if (matchingExp) {
      return {
        ...item,
        paymentStatus: matchingExp.status || item.paymentStatus || 'Não informado',
        paidValueBRL: matchingExp.paidValueBRL !== undefined && matchingExp.paidValueBRL !== null ? matchingExp.paidValueBRL : item.paidValueBRL,
        paidValueUSD: matchingExp.paidValueUSD !== undefined && matchingExp.paidValueUSD !== null ? matchingExp.paidValueUSD : item.paidValueUSD,
      };
    }
    return item;
  };

  return {
    ...trip,
    flights: (trip.flights || []).map((f: any) => hydrateItem(f, 'flight')),
    accommodations: (trip.accommodations || []).map((a: any) => hydrateItem(a, 'accommodation')),
    carRentals: (trip.carRentals || []).map((c: any) => hydrateItem(c, 'car_rental')),
    parkTickets: (trip.parkTickets || []).map((t: any) => hydrateItem(t, 'park_ticket')),
  };
}

export function auditAndCorrectTrip(trip: any): any {
  if (!trip) return trip;
  const hydratedTrip = hydrateTripBookingsFromExpenses(trip);
  const startDate = hydratedTrip.startDate || '2026-12-27';
  const durationDays = Math.max(1, hydratedTrip.durationDays || (hydratedTrip.rawDays?.length || 16));

  const flights = hydratedTrip.flights || [];
  const accommodations = hydratedTrip.accommodations || [];
  let rawDays = hydratedTrip.rawDays || [];

  if (rawDays.length === 0 && durationDays > 0) {
    rawDays = Array.from({ length: durationDays }, (_, i) => {
      const dayNum = i + 1;
      let title = 'Sem Parque';
      if (dayNum === 1) title = 'Chegada';
      else if (dayNum === durationDays && durationDays > 1) title = 'Partida';
      return {
        id: `day-${dayNum}-${Date.now()}`,
        dayNumber: dayNum,
        title,
        park: 'Sem Parque' as any,
        completed: false,
        morning: { where: '', dining: '', notes: '' },
        afternoon: { where: '', dining: '', notes: '' },
        night: { where: '', dining: '', notes: '' },
        generalNotes: '',
        hourlySchedule: [],
      };
    });
  }

  return {
    ...hydratedTrip,
    startDate,
    durationDays,
    flights,
    accommodations,
    rawDays: rawDays.map((day: any) => ({
      ...day,
      hourlySchedule: syncAllEventsToHourlySchedule(day, hydratedTrip)
    })),
  };
}


