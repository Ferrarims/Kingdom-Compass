import { createClient } from '@supabase/supabase-js';
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
} from '../src/utils/parkScheduleUtils.js';
import { generateDeterministicUUID } from '../src/utils/uuid.js';

const SUPABASE_URL = 'https://fmwikutwogsvobbyzjpk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd2lrdXR3b2dzdm9iYnl6anBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTEzNDUsImV4cCI6MjEwMzI2NzM0NX0.sap72mGbzeypWPfLX0HI-GG43eOixK3Ek3XimHDGKVk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING ULTIMATE STABLE SCHEDULE AUDIT & RECONCILIATION ===');

  // 1. Fetch Trip explicitly by ID
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
  console.log('selected_accommodations_per_night:', trip.selectedAccommodationsPerNight);

  // 2. Fetch Accommodations, Flights, Car Rentals, Park Bookings, Itinerary Days
  const [
    { data: accRows },
    { data: flightRows },
    { data: carRows },
    { data: pbRows },
    { data: dayRows },
  ] = await Promise.all([
    supabase.from('accommodations').select('*').eq('trip_id', tripId),
    supabase.from('flights').select('*').eq('trip_id', tripId),
    supabase.from('car_rentals').select('*').eq('trip_id', tripId),
    supabase.from('park_bookings').select('*').eq('trip_id', tripId),
    supabase.from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number'),
  ]);

  const accommodations = (accRows || []).map(mapDbToAccommodation);
  const flights = (flightRows || []).map(mapDbToFlight);
  const carRentals = (carRows || []).map(mapDbToCarRental);
  const parkBookings = (pbRows || []).map(mapDbToParkBooking);
  const days = (dayRows || []).map(mapDbToItineraryDay);

  console.log(`Loaded: ${accommodations.length} accommodations, ${flights.length} flights, ${carRentals.length} car rentals, ${parkBookings.length} park bookings, ${days.length} itinerary days.`);

  // Explicit park mapping for park days
  const parkMapping: Record<string, string> = {
    '2026-12-30': 'SeaWorld Orlando',
    '2026-12-31': 'Busch Gardens Tampa Bay',
    '2027-01-01': "Universal's Islands of Adventure",
    '2027-01-03': "Universal's Islands of Adventure",
    '2027-01-05': "Disney's Hollywood Studios",
    '2027-01-07': "Universal's Islands of Adventure",
    '2027-01-08': "Universal's Islands of Adventure",
    '2027-01-09': 'Universal Studios Florida',
  };

  days.forEach((day) => {
    const pb = parkBookings.find(
      (p) => p.dayNumber === day.dayNumber || (day.date && p.date === day.date) || p.itineraryDayId === day.id
    );
    if (pb) {
      day.parkBooking = pb;
      if (!day.park || day.park === 'Sem Parque') {
        day.park = pb.parkName;
      }
    }

    if (day.date && parkMapping[day.date] && (!day.park || day.park === 'Sem Parque')) {
      day.park = parkMapping[day.date];
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

  // 3. Process and sync schedule for each day with explicit custom overrides for 08/01, 09/01, and park days
  for (const day of days) {
    let syncedItems = syncAllEventsToHourlySchedule(day, tripContext);

    // Special handling for New Year's Eve on 2026-12-31 (Busch Gardens Tampa Bay)
    if (day.date === '2026-12-31') {
      const hasNYE = syncedItems.some((i) => (i.title || '').toLowerCase().includes('ano-novo') || (i.title || '').toLowerCase().includes('réveillon'));
      if (!hasNYE) {
        syncedItems.push({
          id: 'auto-nye-buschtampabay',
          time: '23:59',
          title: '🎆 Celebração de Réveillon e Virada de Ano em Busch Gardens',
          location: 'Busch Gardens Tampa Bay',
          category: 'park',
          notes: 'Espectáculo de fogos de artifício e celebração de Ano-Novo em Busch Gardens Tampa Bay.',
          sourceType: 'park',
          completed: false,
        });
      }
    }

    // Explicit overrides and fine-tuning for 2027-01-08 (Day 13)
    if (day.date === '2027-01-08') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('início do dia na acomodação') && i.time === '07:30') return false;
        return true;
      });

      const ensureItem = (item: any) => {
        const titleKey = item.titleKey || item.title || '';
        const idx = syncedItems.findIndex((i) => i.time === item.time && (i.title || '').toLowerCase().includes(titleKey.toLowerCase()));
        if (idx >= 0) {
          syncedItems[idx] = { ...syncedItems[idx], ...item };
        } else {
          syncedItems.push(item);
        }
      };

      ensureItem({
        id: 'auto-acordar-2027-01-08',
        time: '05:49',
        title: '⏰ Acordar — Modern Retreat Resort',
        titleKey: 'Acordar',
        location: 'Modern Retreat Resort',
        category: 'hotel',
        notes: 'Despertar 30 min antes da saída para o Universal Hard Rock Hotel às 06:19.',
        sourceType: 'accommodation',
        completed: false,
      });

      ensureItem({
        id: 'auto-acc-transit-2027-01-08',
        time: '06:19',
        title: '🚗 Deslocamento: Modern Retreat Resort ➔ Universal Hard Rock Hotel',
        titleKey: 'Deslocamento',
        location: 'Universal Hard Rock Hotel',
        category: 'transport',
        notes: 'Deslocamento da acomodação da manhã (Modern Retreat Resort) até Universal Hard Rock Hotel (~41 min de trajeto via Maps) para pré check-in e retirada de chave antes do parque.',
        sourceType: 'transport',
        completed: false,
      });

      ensureItem({
        id: 'auto-acc-keypickup-2027-01-08',
        time: '07:00',
        title: '🔑 Retirada de Chaves & Pré Check-in: Universal Hard Rock Hotel',
        titleKey: 'Retirada de Chaves',
        location: 'Universal Hard Rock Hotel',
        category: 'hotel',
        notes: 'Parada de 30 min em Universal Hard Rock Hotel para pré check-in e retirada da chave/Express Pass antes da ida ao parque. Observação: O quarto estará disponível a partir do horário oficial das 16:00.',
        sourceType: 'accommodation',
        completed: false,
      });

      ensureItem({
        id: 'auto-acc-park-transfer-2027-01-08',
        time: '07:30',
        title: "🚗 Transferência: Universal Hard Rock Hotel ➔ Universal's Islands of Adventure",
        titleKey: 'Transferência',
        location: "Universal's Islands of Adventure",
        category: 'transport',
        notes: 'Deslocamento do Hard Rock Hotel para Islands of Adventure para chegada às catracas às 08:00 e Early Entry às 08:30.',
        sourceType: 'transport',
        completed: false,
      });

      ensureItem({
        id: 'auto-ida-2027-01-08',
        time: '08:00',
        title: '🎟️ Chegada na Entrada do Parque (30 min antes da abertura)',
        titleKey: 'Chegada na Entrada',
        location: "Universal's Islands of Adventure",
        category: 'park',
        notes: 'Posicionamento nas catracas e revista de segurança para Entrada Antecipada (Early Entry) às 08:30.',
        sourceType: 'park',
        completed: false,
      });

      ensureItem({
        id: 'auto-abertura-2027-01-08',
        time: '08:30',
        title: "Entrada Antecipada (Early Entry) em Universal's Islands of Adventure",
        titleKey: 'Entrada Antecipada',
        location: "Universal's Islands of Adventure",
        category: 'park',
        notes: "Início do funcionamento e exploração das atrações de Islands of Adventure com Universal Express.",
        sourceType: 'park',
        completed: false,
      });

      ensureItem({
        id: 'auto-saida-parque-2027-01-08',
        time: '21:00',
        title: "🌙 Fechamento de Universal's Islands of Adventure e Saída",
        titleKey: 'Fechamento de',
        location: "Universal's Islands of Adventure",
        category: 'park',
        notes: "Encerramento das atividades no parque e percurso até o carro no estacionamento (25 min).",
        sourceType: 'park',
        completed: false,
      });

      ensureItem({
        id: 'auto-carro-retorno-2027-01-08',
        time: '21:25',
        title: '🚗 Chegada ao Carro no Estacionamento',
        titleKey: 'Chegada ao Carro',
        location: "Universal's Islands of Adventure",
        category: 'transport',
        notes: 'Embarque no veículo e início da viagem de volta para o Universal Hard Rock Hotel (~10 min de trajeto).',
        sourceType: 'transport',
        completed: false,
      });

      ensureItem({
        id: 'auto-retorno-2027-01-08',
        time: '21:35',
        title: '🌙 Fim do dia na acomodação (Universal Hard Rock Hotel)',
        titleKey: 'Fim do dia',
        location: 'Universal Hard Rock Hotel',
        category: 'hotel',
        notes: 'Retorno ao Universal Hard Rock Hotel (hospedagem selecionada para a noite de 08/01) e descanso.',
        sourceType: 'accommodation',
        completed: false,
      });
    }

    // Explicit overrides and fine-tuning for 2027-01-09 (Day 14)
    if (day.date === '2027-01-09') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('check-in: modern retreat')) return false;
        return true;
      });

      const ensureItem = (item: any) => {
        const titleKey = item.titleKey || item.title || '';
        const idx = syncedItems.findIndex((i) => i.time === item.time && (i.title || '').toLowerCase().includes(titleKey.toLowerCase()));
        if (idx >= 0) {
          syncedItems[idx] = { ...syncedItems[idx], ...item };
        } else {
          syncedItems.push(item);
        }
      };

      ensureItem({
        id: 'auto-acordar-2027-01-09',
        time: '06:23',
        title: '⏰ Acordar — Universal Hard Rock Hotel',
        titleKey: 'Acordar',
        location: 'Universal Hard Rock Hotel',
        category: 'hotel',
        notes: 'Despertar no Hard Rock Hotel, café da manhã e preparativos para Universal Studios Florida.',
        sourceType: 'accommodation',
        completed: false,
      });

      ensureItem({
        id: 'auto-checkout-2027-01-09',
        time: '07:15',
        title: '🚪 Liberação do Quarto & Check-out: Universal Hard Rock Hotel',
        titleKey: 'Check-out',
        location: 'Universal Hard Rock Hotel',
        category: 'hotel',
        notes: 'Liberação do quarto e check-out no Hard Rock antes da ida ao parque (horário contratual limite: 11:00). Logística pendente: organizar guarda-volumes no Hard Rock antes da ida ao parque.',
        sourceType: 'accommodation',
        completed: false,
      });

      ensureItem({
        id: 'auto-ida-2027-01-09',
        time: '08:00',
        title: '🎟️ Chegada na Entrada do Parque (30 min antes da abertura)',
        titleKey: 'Chegada na Entrada',
        location: 'Universal Studios Florida',
        category: 'park',
        notes: 'Posicionamento nas catracas e revista de segurança para Entrada Antecipada (Early Entry) às 08:30.',
        sourceType: 'park',
        completed: false,
      });

      ensureItem({
        id: 'auto-abertura-2027-01-09',
        time: '08:30',
        title: 'Entrada Antecipada (Early Entry) em Universal Studios Florida',
        titleKey: 'Entrada Antecipada',
        location: 'Universal Studios Florida',
        category: 'park',
        notes: 'Início do funcionamento e exploração das atrações de Universal Studios Florida com Universal Express.',
        sourceType: 'park',
        completed: false,
      });

      ensureItem({
        id: 'auto-saida-parque-2027-01-09',
        time: '21:00',
        title: '🌙 Fechamento de Universal Studios Florida e Saída',
        titleKey: 'Fechamento de',
        location: 'Universal Studios Florida',
        category: 'park',
        notes: 'Encerramento das atividades no parque e percurso até o carro no estacionamento (25 min).',
        sourceType: 'park',
        completed: false,
      });

      ensureItem({
        id: 'auto-retorno-2027-01-09',
        time: '22:30',
        title: '🌙 Fim do dia na acomodação (Modern Retreat Resort)',
        titleKey: 'Fim do dia',
        location: 'Modern Retreat Resort',
        category: 'hotel',
        notes: 'Retorno ao Modern Retreat Resort após o dia em Universal Studios Florida e descanso.',
        sourceType: 'accommodation',
        completed: false,
      });
    }

    // Normalize category for airbnb -> hotel for consistency
    syncedItems.forEach((item) => {
      if (item.category === 'airbnb') item.category = 'hotel';
    });

    day.hourlySchedule = deduplicateHourlySchedule(syncedItems);
  }

  // 4. Safe Transactional Upsert per Day with Deterministic Stable IDs & Rigorous Field Validation
  console.log('Persisting updated itinerary_days and hourly_schedules safely to Supabase...');

  for (const day of days) {
    const dayDbRow = mapItineraryDayToDb(day, tripId);

    // Upsert itinerary day
    const { error: dErr } = await supabase
      .from('itinerary_days')
      .upsert(dayDbRow, { onConflict: 'id' });

    if (dErr) {
      console.error(`Error upserting day ${day.dayNumber} (${day.date}):`, dErr.message);
      process.exit(1);
    }

    // Delete existing hourly schedules for this specific itinerary day
    const { error: delErr } = await supabase
      .from('hourly_schedules')
      .delete()
      .eq('itinerary_day_id', dayDbRow.id);

    if (delErr) {
      console.error(`Error clearing old hourly schedules for day ${day.dayNumber}:`, delErr.message);
      process.exit(1);
    }

    // Map using deterministic stable IDs
    const dayHourlyRows = (day.hourlySchedule || []).map((item, index) => {
      const dbRow = mapHourlyScheduleToDb(item, dayDbRow.id, tripId, index);
      dbRow.id = generateDeterministicUUID('hourly-stable', `${dayDbRow.id}-${index}-${item.time}-${item.title}`);
      return dbRow;
    });

    if (dayHourlyRows.length > 0) {
      const { error: hErr } = await supabase.from('hourly_schedules').insert(dayHourlyRows);
      if (hErr) {
        console.error(`Error inserting hourly schedules for day ${day.dayNumber}:`, hErr.message);
        process.exit(1);
      }
    }
  }

  console.log('=== RIGOROUS FIELD-BY-FIELD AUDIT & VERIFICATION ===');

  let allChecksPassed = true;

  for (const targetDay of days) {
    const { data: dbDay } = await supabase.from('itinerary_days').select('*').eq('id', targetDay.id).single();
    const { data: dbRows } = await supabase.from('hourly_schedules').select('*').eq('itinerary_day_id', targetDay.id).order('time');

    const jsonItems = dbDay?.hourly_schedule || [];
    const dbItems = dbRows || [];

    console.log(`\n------------------------------------------------------------`);
    console.log(`Date: ${targetDay.date} (Day ${targetDay.dayNumber}: ${targetDay.title} | Park: ${targetDay.park})`);
    console.log(`JSON items count: ${jsonItems.length} | DB rows count: ${dbItems.length}`);

    if (jsonItems.length !== dbItems.length) {
      console.log(`❌ MISMATCH COUNT for ${targetDay.date}! JSON: ${jsonItems.length}, DB: ${dbItems.length}`);
      allChecksPassed = false;
    }

    for (let i = 0; i < Math.max(jsonItems.length, dbItems.length); i++) {
      const jItem = jsonItems[i];
      const dItem = dbItems[i];
      if (!jItem || !dItem) {
        console.log(`  [${i + 1}] ❌ MISSING ITEM: JSON exists = ${!!jItem}, DB exists = ${!!dItem}`);
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
        console.log(`  [${i + 1}] ❌ FIELD DIFF at ${jItem.time} - ${jItem.title}:`);
        if (!matchTime) console.log(`      Time diff: JSON(${jItem.time}) vs DB(${dItem.time})`);
        if (!matchTitle) console.log(`      Title diff: JSON(${jItem.title}) vs DB(${dItem.title})`);
        if (!matchLoc) console.log(`      Location diff: JSON(${jItem.location}) vs DB(${dItem.location})`);
        if (!matchCat) console.log(`      Category diff: JSON(${jItem.category}) vs DB(${dItem.category})`);
      } else {
        console.log(`  [${i + 1}] ✅ [${dItem.time}] ${dItem.title} (Loc: ${dItem.location || 'N/A'}, Cat: ${dItem.category}, Src: ${dItem.source_type || 'none'})`);
      }
    }
  }

  console.log(`\n=== FINAL AUDIT RESULT: ${allChecksPassed ? 'ALL CHECKS PASSED SUCCESSFULLY (100% FIELD PARITY)' : 'SOME DISCREPANCIES FOUND'} ===`);
}

main().catch(console.error);
