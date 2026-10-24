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

const SUPABASE_URL = 'https://fmwikutwogsvobbyzjpk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd2lrdXR3b2dzdm9iYnl6anBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTEzNDUsImV4cCI6MjEwMzI2NzM0NX0.sap72mGbzeypWPfLX0HI-GG43eOixK3Ek3XimHDGKVk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING SAFE SCHEDULE AUDIT & RECONCILIATION ===');

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

  // Attach park bookings to days and ensure park names are set for known park days
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

    // Explicit fallback for known park days if park booking was separate
    if (day.date === '2026-12-30' && (!day.park || day.park === 'Sem Parque')) {
      day.park = 'SeaWorld Orlando';
    }
    if (day.date === '2026-12-31' && (!day.park || day.park === 'Sem Parque')) {
      day.park = 'Busch Gardens Tampa Bay';
    }
    if (day.date === '2027-01-03' && (!day.park || day.park === 'Sem Parque')) {
      day.park = "Universal's Islands of Adventure";
    }
    if (day.date === '2027-01-05' && (!day.park || day.park === 'Sem Parque')) {
      day.park = 'Universal Studios Florida';
    }
    if (day.date === '2027-01-07' && (!day.park || day.park === 'Sem Parque')) {
      day.park = "Universal's Islands of Adventure";
    }
    if (day.date === '2027-01-08' && (!day.park || day.park === 'Sem Parque')) {
      day.park = "Universal's Islands of Adventure";
    }
    if (day.date === '2027-01-09' && (!day.park || day.park === 'Sem Parque')) {
      day.park = 'Universal Studios Florida';
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

  // 3. Process and sync schedule for each day with explicit custom overrides for 08/01 and 09/01
  for (const day of days) {
    let syncedItems = syncAllEventsToHourlySchedule(day, tripContext);

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
        category: 'airbnb',
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
        id: 'auto-retorno-2027-01-08',
        time: '22:30',
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
        id: 'auto-retorno-2027-01-09',
        time: '22:30',
        title: '🌙 Fim do dia na acomodação (Modern Retreat Resort)',
        titleKey: 'Fim do dia',
        location: 'Modern Retreat Resort',
        category: 'airbnb',
        notes: 'Retorno ao Modern Retreat Resort após o dia em Universal Studios Florida e descanso.',
        sourceType: 'accommodation',
        completed: false,
      });
    }

    day.hourlySchedule = deduplicateHourlySchedule(syncedItems);
  }

  // 4. Safe Transactional Upsert per Day (Delete only rows for that day, then insert)
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

    // Map and insert new hourly schedule rows for this day
    const dayHourlyRows = (day.hourlySchedule || []).map((item, index) =>
      mapHourlyScheduleToDb(item, dayDbRow.id, tripId, index)
    );

    if (dayHourlyRows.length > 0) {
      const { error: hErr } = await supabase.from('hourly_schedules').insert(dayHourlyRows);
      if (hErr) {
        console.error(`Error inserting hourly schedules for day ${day.dayNumber}:`, hErr.message);
        process.exit(1);
      }
    }
  }

  console.log('=== RIGOROUS LINE-BY-LINE AUDIT & VERIFICATION ===');

  const checkDates = ['2026-12-27', '2026-12-30', '2026-12-31', '2027-01-03', '2027-01-05', '2027-01-07', '2027-01-08', '2027-01-09'];

  for (const targetDate of checkDates) {
    const targetDay = days.find((d) => d.date === targetDate);
    if (!targetDay) {
      console.log(`Target date ${targetDate} not found!`);
      continue;
    }

    const { data: dbDay } = await supabase.from('itinerary_days').select('*').eq('id', targetDay.id).single();
    const { data: dbRows } = await supabase.from('hourly_schedules').select('*').eq('itinerary_day_id', targetDay.id).order('time');

    const jsonItems = dbDay?.hourly_schedule || [];
    const dbItems = dbRows || [];

    console.log(`\n------------------------------------------------------------`);
    console.log(`Date: ${targetDate} (Day ${targetDay.dayNumber}: ${targetDay.title} | Park: ${targetDay.park})`);
    console.log(`JSON items count: ${jsonItems.length} | DB rows count: ${dbItems.length}`);
    console.log(`1-to-1 Parity Match: ${jsonItems.length === dbItems.length ? 'YES' : 'NO'}`);

    for (let i = 0; i < Math.max(jsonItems.length, dbItems.length); i++) {
      const jItem = jsonItems[i];
      const dItem = dbItems[i];
      if (!jItem || !dItem) {
        console.log(`  [${i + 1}] MISMATCH: JSON exists = ${!!jItem}, DB exists = ${!!dItem}`);
        continue;
      }
      const match = jItem.time === dItem.time && jItem.title === dItem.title;
      console.log(`  [${i + 1}] ${dItem.time} - ${dItem.title} | Loc: ${dItem.location || 'N/A'} | Source: ${dItem.source_type || 'none'} | Match: ${match ? 'OK' : 'DIFF'}`);
    }
  }

  console.log('\n=== SAFE AUDIT & RECONCILIATION COMPLETE ===');
}

main().catch(console.error);
