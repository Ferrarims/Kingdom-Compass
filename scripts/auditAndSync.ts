import { supabase } from '../src/services/supabaseClient.js';
import {
  mapDbToTrip,
  mapDbToAccommodation,
  mapDbToFlight,
  mapDbToCarRental,
  mapDbToItineraryDay,
  mapDbToParkBooking,
  mapHourlyScheduleToDb,
  mapItineraryDayToDb,
} from '../src/services/supabaseService.js';
import {
  syncAllEventsToHourlySchedule,
  deduplicateHourlySchedule,
  resolveAccommodationForNight,
  getDriveAndParkingMetrics,
  compareScheduleItemOrder,
} from '../src/utils/parkScheduleUtils.js';
import { generateDeterministicUUID } from '../src/utils/uuid.js';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING COMPREHENSIVE AUDIT & RECONCILIATION FOR TRIP 78bbd4b1-2857-43d0-9520-2318a3b157a3 ===');

  const { data: tripRows, error: tripErr } = await supabase
    .from('trips')
    .select('*')
    .eq('id', TARGET_TRIP_ID);

  if (tripErr || !tripRows || tripRows.length === 0) {
    console.error('Failed to load target trip:', tripErr);
    process.exit(1);
  }
  const rawTrip = tripRows[0];
  const trip = mapDbToTrip(rawTrip);
  const tripId = trip.id!;
  console.log(`Loaded Trip ID: ${tripId}, Name: ${trip.tripName}, Start: ${trip.startDate}`);

  const [
    { data: accRows },
    { data: flightRows },
    { data: carRows },
    { data: pbRows },
    { data: dayRows },
    { data: hourlyRows },
  ] = await Promise.all([
    supabase.from('accommodations').select('*').eq('trip_id', tripId),
    supabase.from('flights').select('*').eq('trip_id', tripId),
    supabase.from('car_rentals').select('*').eq('trip_id', tripId),
    supabase.from('park_bookings').select('*').eq('trip_id', tripId),
    supabase.from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number'),
    supabase.from('hourly_schedules').select('*').eq('trip_id', tripId),
  ]);

  const accommodations = (accRows || []).map(mapDbToAccommodation);
  const flights = (flightRows || []).map(mapDbToFlight);
  const carRentals = (carRows || []).map(mapDbToCarRental);
  const parkBookings = (pbRows || []).map(mapDbToParkBooking);
  const days = (dayRows || []).map(mapDbToItineraryDay);

  const officialParkMapping: Record<string, { name: string; opening: string; closing: string; early: string }> = {
    '2026-12-30': { name: 'SeaWorld Orlando', opening: '09:00', closing: '21:00', early: '08:30' },
    '2026-12-31': { name: 'Busch Gardens Tampa Bay', opening: '10:00', closing: '22:00', early: '09:30' },
    '2027-01-01': { name: "Disney's Animal Kingdom", opening: '09:00', closing: '19:00', early: '08:30' },
    '2027-01-03': { name: 'Magic Kingdom', opening: '09:00', closing: '22:00', early: '08:30' },
    '2027-01-05': { name: "Disney's Hollywood Studios", opening: '09:00', closing: '21:00', early: '08:30' },
    '2027-01-07': { name: "Universal's Epic Universe", opening: '09:00', closing: '21:00', early: '08:30' },
    '2027-01-08': { name: "Universal's Islands of Adventure", opening: '09:00', closing: '21:00', early: '08:30' },
    '2027-01-09': { name: 'Universal Studios Florida', opening: '09:00', closing: '21:00', early: '08:30' },
  };

  days.forEach((day) => {
    if (day.date && officialParkMapping[day.date]) {
      const info = officialParkMapping[day.date];
      day.park = info.name as any;
    }
  });

  const tripContext = {
    trip,
    accommodations,
    flights,
    carRentals,
    startDate: trip.startDate || '2026-12-27',
    totalDays: days.length,
    selectedAccommodationsPerNight: trip.selectedAccommodationsPerNight || {},
  };

  const pendingItemsReport: string[] = [];
  const calculatedTimesReport: string[] = [];
  const estimatedTimesReport: string[] = [];

  for (const day of days) {
    let syncedItems = syncAllEventsToHourlySchedule(day, tripContext);
    const isParkDay = day.park && day.park !== 'Sem Parque' && day.park !== 'Parque a Definir';

    // 1. Specific Day Adjustments based on user prompt instructions

    // Day 1: 27/12/2026 (Arrival Miami & Car Rental)
    if (day.date === '2026-12-27') {
      const hasCarPickup = syncedItems.some((i) => i.time === '14:30');
      const hasTransit = syncedItems.some((i) => i.time === '16:35');
      if (hasCarPickup && hasTransit) {
        syncedItems = syncedItems.map((i) => {
          if (i.time === '16:35' || (i.title || '').toLowerCase().includes('deslocamento') || (i.title || '').toLowerCase().includes('rumo ao hotel')) {
            return {
              ...i,
              notes: 'Intervalo de 2h15min entre a retirada do carro às 14:30 e o início do trajeto às 16:35 preservado como parada planejada (conferência do veículo, trâmites de locação e lanche de chegada). [Estimativa mantida conforme dados existentes].',
            };
          }
          return i;
        });
      }
    }

    // Free Days: 28/12, 02/01, 04/01, 06/01
    if (['2026-12-28', '2027-01-02', '2027-01-04', '2027-01-06'].includes(day.date!)) {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('atividade') && !t.includes('passeio inventado') && !t.includes('tour');
      });
      pendingItemsReport.push(`${day.date} (Dia Livre): Sem atividades detalhadas programadas; horários restritos à hospedagem/descanso.`);
    }

    // Day 3: 29/12/2026 (Checkout Miami & Drive to Kissimmee)
    if (day.date === '2026-12-29') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('partida para kissimmee às 10:00');
      });
      const hasCheckout = syncedItems.some((i) => (i.title || '').toLowerCase().includes('check-out'));
      const hasDeparture = syncedItems.some((i) => (i.title || '').toLowerCase().includes('kissimmee') || (i.title || '').toLowerCase().includes('deslocamento'));
      if (!hasCheckout) {
        syncedItems.push({
          id: 'auto-checkout-2026-12-29',
          time: '10:00',
          title: '🚪 Check-out da Acomodação em Miami',
          location: 'Brickell, Miami, FL',
          category: 'hotel',
          notes: 'Horário contratual de check-out em Miami.',
          sourceType: 'accommodation',
          completed: false,
        });
      }
      if (!hasDeparture) {
        syncedItems.push({
          id: 'auto-departure-2026-12-29',
          time: '10:30',
          title: '🚗 Saída de Miami rumo a Modern Retreat Resort (Kissimmee)',
          location: 'Kissimmee - FL',
          category: 'transport',
          notes: 'Saída realizada às 10:30 após check-out, entrega de chaves e carregamento de bagagem. Estimativa de viagem: 287 minutos (~4h47m). Chegada prevista estimada para as 15:17, com check-in oficial às 16:00 [Margem estimada, não garantia absoluta].',
          sourceType: 'transport',
          completed: false,
        });
      }
      estimatedTimesReport.push('29/12/2026: Deslocamento Miami ➔ Kissimmee estimado em 287 minutos (chegada prevista ~15:17, check-in às 16:00).');
    }

    // Day 4: 30/12/2026 — SeaWorld Orlando (Supabase vs Screen divergence resolution)
    if (day.date === '2026-12-30') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('abertura oficial às 08:00') && !t.includes('abertura oficial de 08:00');
      });

      const hasTurnstile = syncedItems.some((i) => (i.title || '').toLowerCase().includes('catracas'));
      const hasEarly = syncedItems.some((i) => (i.title || '').toLowerCase().includes('early entry') || (i.title || '').toLowerCase().includes('antecipada'));
      const hasOpening = syncedItems.some((i) => (i.title || '').toLowerCase().includes('abertura oficial'));

      if (!hasTurnstile) {
        syncedItems.push({
          id: 'auto-turnstile-2026-12-30',
          time: '08:00',
          title: '🎟️ Chegada na Entrada de SeaWorld Orlando (Catracas)',
          location: 'SeaWorld Orlando',
          category: 'park',
          notes: 'Chegada às catracas 30 min antes da Early Entry.',
          sourceType: 'park',
          completed: false,
        });
      }
      if (!hasEarly) {
        syncedItems.push({
          id: 'auto-early-2026-12-30',
          time: '08:30',
          title: '⚡ Entrada Antecipada (Early Entry) em SeaWorld Orlando',
          location: 'SeaWorld Orlando',
          category: 'park',
          notes: 'Início da Entrada Antecipada (abertura oficial confirmada às 09:00).',
          sourceType: 'park',
          completed: false,
        });
      }
      if (!hasOpening) {
        syncedItems.push({
          id: 'auto-opening-2026-12-30',
          time: '09:00',
          title: '🌟 Abertura Oficial de SeaWorld Orlando',
          location: 'SeaWorld Orlando',
          category: 'park',
          notes: 'Abertura oficial confirmada para as 09:00.',
          sourceType: 'park',
          completed: false,
        });
      }
    }

    // Day 5: 31/12/2026 — Busch Gardens Tampa Bay (NYE)
    if (day.date === '2026-12-31') {
      const hasTransitToBG = syncedItems.some((i) => (i.title || '').toLowerCase().includes('modern retreat') && (i.title || '').toLowerCase().includes('busch gardens'));
      if (!hasTransitToBG) {
        syncedItems.push({
          id: 'auto-transit-bg-3112',
          time: '08:45',
          title: '🚗 Deslocamento: Modern Retreat Resort ➔ Busch Gardens Tampa Bay',
          location: 'Busch Gardens Tampa Bay',
          category: 'transport',
          notes: 'Saída estimada de Kissimmee rumo a Tampa Bay (~70-80 min de trajeto estimado via I-4). Horário de abertura oficial do parque: 10:00 [Estimativa interna de deslocamento; horário de abertura confirmado].',
          sourceType: 'transport',
          completed: false,
        });
      }
    }

    // Day 6: 01/01/2027 — Disney's Animal Kingdom
    if (day.date === '2027-01-01') {
      syncedItems = syncedItems.map((i) => {
        if (i.time === '06:30' || (i.title || '').toLowerCase().includes('início do dia') || (i.title || '').toLowerCase().includes('saída')) {
          return {
            ...i,
            notes: `${i.notes || ''} [PROVISÓRIO / SUJEITO A AJUSTE: Horário planejado para cumprir a Early Entry às 08:30, sujeito a revisão dependendo do descanso após a celebração de Réveillon].`,
          };
        }
        return i;
      });
      pendingItemsReport.push('01/01/2027: Eventos matinais marcados como provisórios dependendo do descanso pós-Réveillon.');
    }

    // Day 13: 08/01/2027 — Universal's Islands of Adventure & Hard Rock Check-in
    if (day.date === '2027-01-08') {
      syncedItems = syncedItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('16:00') || t.includes('check-in') || t.includes('quarto')) {
          return {
            ...i,
            title: '🏨 Quarto disponível / Horário oficial de check-in (Universal Hard Rock Hotel)',
            notes: 'Quarto liberado oficialmente às 16:00 [Informativo: sem necessidade de retornar ao hotel durante o dia de parque; as chaves/Express Passes já foram retiradas às 07:00].',
          };
        }
        return i;
      });
    }

    // Day 14: 09/01/2027 — Universal Studios Florida
    if (day.date === '2027-01-09') {
      syncedItems = syncedItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('check-out') || t.includes('liberação')) {
          return {
            ...i,
            notes: 'Liberação do quarto e check-out no Hard Rock. [⚠️ PENDENTE DE CONFIRMAÇÃO: Logística de guarda-volumes para as malas após o check-out antes da entrada no parque ainda não foi confirmada].',
          };
        }
        return i;
      });
      pendingItemsReport.push('09/01/2027: Guarda-volumes pós-checkout no Hard Rock pendente de confirmação.');
    }

    // Day 15: 10/01/2027 — Departure / Airport / Car Return
    if (day.date === '2027-01-10') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('devolução do carro às 10:00');
      });

      const hasCheckout10 = syncedItems.some((i) => i.time === '10:00' && (i.title || '').toLowerCase().includes('check-out'));
      if (hasCheckout10) {
        syncedItems = syncedItems.map((i) => {
          if (i.time === '10:00' && (i.title || '').toLowerCase().includes('check-out')) {
            return {
              ...i,
              notes: 'Horário contratual de check-out da acomodação.',
            };
          }
          return i;
        });
      }

      const hasCarDropoff = syncedItems.some((i) => (i.title || '').toLowerCase().includes('devolução'));
      if (!hasCarDropoff) {
        syncedItems.push({
          id: 'auto-cardrop-2027-01-10',
          time: '11:03',
          title: '🚗 Devolução do Carro Alugado (Previsão Estimada)',
          location: 'Orlando International Airport (MCO)',
          category: 'transport',
          notes: 'Chegada prevista estimada para as 11:03 para devolução do veículo. [Prazo máximo contratual limite: 12:00, não horário obrigatório rígido].',
          sourceType: 'car_rental',
          completed: false,
        });
        estimatedTimesReport.push('10/01/2027: Devolução do carro estimada às 11:03 (prazo máximo limite às 12:00).');
      }
    }

    syncedItems.forEach((item) => {
      if (item.category === 'airbnb') item.category = 'hotel';
    });

    day.hourlySchedule = deduplicateHourlySchedule(syncedItems).sort(compareScheduleItemOrder);
  }

  // Safe Upsert with Stable IDs and Cleanup of Obsolete Rows
  console.log('Persisting updated schedules securely using safe upsert strategy...');

  for (const day of days) {
    day.hourlySchedule = deduplicateHourlySchedule(day.hourlySchedule || []).sort(compareScheduleItemOrder);
    
    const dayDbRow = mapItineraryDayToDb(day, tripId);
    const dayHourlyRows = (day.hourlySchedule || []).map((item, index) => {
      const dbRow = mapHourlyScheduleToDb(item, dayDbRow.id, tripId, index);
      dbRow.id = generateDeterministicUUID('hourly-stable', `${dayDbRow.id}-${index}-${item.time}-${item.title}`);
      return dbRow;
    });

    const { error: dErr } = await supabase
      .from('itinerary_days')
      .upsert(dayDbRow, { onConflict: 'id' });

    if (dErr) {
      console.error(`Error upserting day ${day.dayNumber} (${day.date}):`, dErr.message);
      process.exit(1);
    }

    if (dayHourlyRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('hourly_schedules')
        .upsert(dayHourlyRows, { onConflict: 'id' });

      if (upsertErr) {
        console.error(`Error upserting hourly schedules for day ${day.dayNumber}:`, upsertErr.message);
        process.exit(1);
      }
    }

    const newIds = new Set(dayHourlyRows.map((r) => r.id));
    const existingDayRows = (hourlyRows || []).filter((r) => r.itinerary_day_id === dayDbRow.id);
    const obsoleteIds = existingDayRows.filter((r) => !newIds.has(r.id)).map((r) => r.id);

    if (obsoleteIds.length > 0) {
      const { error: delErr } = await supabase
        .from('hourly_schedules')
        .delete()
        .in('id', obsoleteIds);

      if (delErr) {
        console.error(`Error deleting obsolete hourly schedules for day ${day.dayNumber}:`, delErr.message);
        process.exit(1);
      }
    }
  }

  console.log('=== RIGOROUS FIELD-BY-FIELD AUDIT & VERIFICATION (ALL 16 DAYS) ===');
  let allChecksPassed = true;

  for (const targetDay of days) {
    const { data: dbDay } = await supabase.from('itinerary_days').select('*').eq('id', targetDay.id).single();
    const { data: dbRows } = await supabase.from('hourly_schedules').select('*').eq('itinerary_day_id', targetDay.id).order('time');

    const jsonItems = dbDay?.hourly_schedule || [];
    const dbItems = (dbRows || []).sort(compareScheduleItemOrder as any);

    if (jsonItems.length !== dbItems.length) {
      console.log(`❌ MISMATCH COUNT for Day ${targetDay.dayNumber} (${targetDay.date})! JSON: ${jsonItems.length}, DB: ${dbItems.length}`);
      allChecksPassed = false;
    }

    for (let i = 0; i < Math.max(jsonItems.length, dbItems.length); i++) {
      const jItem = jsonItems[i];
      const dItem = dbItems[i];
      if (!jItem || !dItem) {
        allChecksPassed = false;
        continue;
      }

      const matchTime = jItem.time === dItem.time;
      const matchTitle = jItem.title === dItem.title;
      const matchLoc = (jItem.location || null) === (dItem.location || null);
      const matchCat = (jItem.category || 'other') === (dItem.category || 'other');
      const matchNotes = (jItem.notes || null) === (dItem.notes || null);
      const matchSourceType = (jItem.sourceType || null) === (dItem.source_type || null);
      const matchSourceId = (jItem.sourceId || null) === (dItem.source_id || null);
      const matchCompleted = Boolean(jItem.completed) === Boolean(dItem.completed);

      const allMatch = matchTime && matchTitle && matchLoc && matchCat && matchNotes && matchSourceType && matchSourceId && matchCompleted;

      if (!allMatch) {
        allChecksPassed = false;
        console.log(`  [Day ${targetDay.dayNumber} - ${targetDay.date} item ${i + 1}] ❌ FIELD DIFF at ${jItem.time} - ${jItem.title}`);
        console.log(`    JSON: time=${jItem.time}, title=${jItem.title}, cat=${jItem.category}, srcType=${jItem.sourceType}`);
        console.log(`    DB:   time=${dItem.time}, title=${dItem.title}, cat=${dItem.category}, srcType=${dItem.source_type}`);
      }
    }
  }

  console.log(`\n=== DATA PARITY STATUS ===`);
  console.log(`Parity between itinerary_days.hourly_schedule and hourly_schedules across all 16 days: ${allChecksPassed ? '100% MATCH' : 'DISCREPANCIES FOUND'}`);

  console.log(`\n=== FINAL AUDIT RESULT: ${allChecksPassed ? 'ALL CHECKS PASSED SUCCESSFULLY (100% FIELD PARITY)' : 'SOME DISCREPANCIES FOUND'} ===`);
}

main().catch(console.error);
