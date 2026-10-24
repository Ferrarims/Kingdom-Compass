import { supabase } from '../src/services/supabaseClient.js';
import {
  mapDbToAccommodation,
  mapDbToItineraryDay,
  mapDbToParkBooking,
} from '../src/services/supabaseService.js';
import {
  resolveAccommodationForNight,
  generateParkScheduleResult,
  isDayWithPark,
} from '../src/utils/parkScheduleUtils.js';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function auditParkDays() {
  console.log('=== INICIANDO AUDITORIA DE DIAS DE PARQUE NO SUPABASE (VALIDAÇÃO DE FÓRMULAS) ===');
  console.log(`Trip ID: ${TARGET_TRIP_ID}\n`);

  const [
    { data: tripRows, error: tripErr },
    { data: accRows, error: accErr },
    { data: pbRows, error: pbErr },
    { data: dayRows, error: dayErr },
    { data: hourlyRows, error: hourlyErr },
  ] = await Promise.all([
    supabase.from('trips').select('*').eq('id', TARGET_TRIP_ID),
    supabase.from('accommodations').select('*').eq('trip_id', TARGET_TRIP_ID),
    supabase.from('park_day_bookings').select('*').eq('trip_id', TARGET_TRIP_ID),
    supabase.from('itinerary_days').select('*').eq('trip_id', TARGET_TRIP_ID).order('day_number'),
    supabase.from('hourly_schedules').select('*').eq('trip_id', TARGET_TRIP_ID),
  ]);

  if (tripErr) throw new Error(`Error reading trips: ${tripErr.message}`);
  if (accErr) throw new Error(`Error reading accommodations: ${accErr.message}`);
  if (pbErr) throw new Error(`Error reading park_day_bookings: ${pbErr.message}`);
  if (dayErr) throw new Error(`Error reading itinerary_days: ${dayErr.message}`);
  if (hourlyErr) throw new Error(`Error reading hourly_schedules: ${hourlyErr.message}`);

  const trip = tripRows?.[0] || {};
  const accommodations = (accRows || []).map(mapDbToAccommodation);
  const parkBookings = (pbRows || []).map(mapDbToParkBooking);
  const days = (dayRows || []).map(mapDbToItineraryDay);
  const hourlySchedules = hourlyRows || [];

  // Group hourly schedules by itinerary_day_id or day_number
  const hourlyByDayId = new Map<string, any[]>();
  hourlySchedules.forEach((item) => {
    const dayId = item.itinerary_day_id;
    if (dayId) {
      if (!hourlyByDayId.has(dayId)) hourlyByDayId.set(dayId, []);
      hourlyByDayId.get(dayId)!.push(item);
    }
  });

  const pbMap = new Map<string, any>();
  parkBookings.forEach((pb) => {
    if (pb.itineraryDayId) pbMap.set(pb.itineraryDayId, pb);
    if (pb.dayNumber) pbMap.set(`day-${pb.dayNumber}`, pb);
  });

  let totalConflictsCount = 0;
  const conflictReport: Array<{ dayNumber: number; date: string; park: string; conflicts: string[] }> = [];

  for (const day of days) {
    const isPark = isDayWithPark(day);
    if (!isPark) continue;

    const parkName = day.park || day.title || 'Parque';
    const date = day.date || 'Data não definida';
    const dayNum = day.dayNumber;

    // Get persisted items for this day
    const persistedItems = hourlyByDayId.get(day.id) || day.hourlySchedule || [];

    // Get park booking / events
    const pb = pbMap.get(day.id) || pbMap.get(`day-${dayNum}`);
    const openingTime = pb?.openingTime || '09:00';
    const closingTime = pb?.closingTime || '21:00';
    const earlyEntryTime = pb?.earlyEntryTime;

    // Resolve accommodation for night
    const acc = resolveAccommodationForNight(accommodations, date, trip.selected_accommodations_per_night || trip.selectedAccommodationsPerNight);
    const accName = acc ? acc.name : (trip.accommodationName || 'Hospedagem');
    const accAddress = acc ? acc.address : '';

    // Generate theoretical schedule using official engine function
    const theoreticalResult = generateParkScheduleResult(
      parkName,
      openingTime,
      closingTime,
      earlyEntryTime,
      accName,
      [],
      pb?.id,
      dayNum,
      accAddress,
      day,
      days,
      trip.destination || trip.destinationSetting,
      pb
    );

    const theoreticalItems = theoreticalResult.currentDaySchedule;

    const conflicts: string[] = [];

    const findItemByTypeOrTitle = (itemsList: any[], keywords: string[]) => {
      return itemsList.find((i) => {
        const text = `${i.title || ''} ${i.notes || ''} ${i.id || ''}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      });
    };

    const checkMilestone = (label: string, theoKeywords: string[], persKeywords: string[]) => {
      const theoItem = findItemByTypeOrTitle(theoreticalItems, theoKeywords);
      const persItem = findItemByTypeOrTitle(persistedItems, persKeywords);

      if (!theoItem) return;
      if (!persItem) {
        conflicts.push(`[AUSENTE] Evento "${label}" (Teórico: ${theoItem.time} - ${theoItem.title}) não encontrado nos dados persistidos.`);
        return;
      }

      if (theoItem.time !== persItem.time) {
        conflicts.push(`[DIVERGÊNCIA DE HORÁRIO] ${label}: Teórico = ${theoItem.time} (${theoItem.title}) vs Persistido = ${persItem.time} (${persItem.title})`);
      }
    };

    checkMilestone('Acordar', ['acordar'], ['acordar']);
    checkMilestone('Saída da Acomodação', ['saída de', 'saida de', 'saída do hotel'], ['saída de', 'saida de', 'saída do hotel', 'saída da']);
    checkMilestone('Chegada no Estacionamento', ['estacionamento'], ['estacionamento']);
    checkMilestone('Chegada na Entrada (Catracas)', ['chegada na entrada', 'catracas'], ['chegada na entrada', 'catracas']);
    checkMilestone('Saída do Parque / Término', ['término das atividades', 'termino das atividades', 'saída do parque'], ['término', 'termino', 'saída do parque', 'saida do parque']);
    checkMilestone('Chegada ao Carro', ['chegada ao carro', 'chegada no carro'], ['chegada ao carro', 'chegada no carro']);
    checkMilestone('Chegada à Acomodação (Retorno)', ['chegada a ', 'chegada ao hotel', 'descanso'], ['chegada a ', 'chegada ao hotel', 'descanso']);

    if (conflicts.length > 0) {
      totalConflictsCount += conflicts.length;
      conflictReport.push({ dayNumber: dayNum, date, park: parkName, conflicts });
    }
  }

  console.log(`\n========================================`);
  console.log(`RELATÓRIO DE AUDITORIA DE DIAS DE PARQUE`);
  console.log(`========================================`);
  console.log(`Total de dias de parque auditados: ${days.filter(isDayWithPark).length}`);
  console.log(`Total de conflitos/desvios encontrados: ${totalConflictsCount}\n`);

  if (conflictReport.length === 0) {
    console.log('✅ Nenhum conflito encontrado! Todos os dados persistidos estão em perfeita conformidade com as fórmulas teóricas do KingdomCompass.');
  } else {
    conflictReport.forEach((rep) => {
      console.log(`--- Dia ${rep.dayNumber} (${rep.date}) - Parque: ${rep.park} ---`);
      rep.conflicts.forEach((c) => console.log(`  • ${c}`));
      console.log('');
    });
  }
}

auditParkDays().catch((err) => {
  console.error('Erro na execução da auditoria:', err);
  process.exit(1);
});
