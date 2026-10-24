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
  resolveAccommodationForNight,
  getParkTransitInfo,
  getDriveAndParkingMetrics,
  estimateAccommodationCoordinates,
  calculateDriveTimeMinutes,
} from '../src/utils/parkScheduleUtils.js';
import { generateDeterministicUUID } from '../src/utils/uuid.js';

const SUPABASE_URL = 'https://fmwikutwogsvobbyzjpk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd2lrdXR3b2dzdm9iYnl6anBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTEzNDUsImV4cCI6MjEwMzI2NzM0NX0.sap72mGbzeypWPfLX0HI-GG43eOixK3Ek3XimHDGKVk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING COMPREHENSIVE PARK SCHEDULE AUDIT & RECONCILIATION ===');

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

  // Reconcile Park names and discrepancies (01/01 Animal Kingdom, 03/01 Magic Kingdom, 07/01 Epic Universe)
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

  const parkReportData: Array<{
    date: string;
    parkName: string;
    closingTime: string;
    exitTime: string;
    walkTimeMins: number;
    transitMins: number;
    accommodationName: string;
    arrivalTime: string;
  }> = [];

  for (const day of days) {
    let syncedItems = syncAllEventsToHourlySchedule(day, tripContext);

    const isParkDay = day.park && day.park !== 'Sem Parque' && day.park !== 'Parque a Definir';
    let closingTime = '21:00';
    if (day.parkBooking?.parkHours?.closingTime) {
      closingTime = day.parkBooking.parkHours.closingTime;
    } else if (day.date && officialParkMapping[day.date]) {
      closingTime = officialParkMapping[day.date].closing;
    }

    syncedItems.forEach((item) => {
      if (item.time && item.time > closingTime && (item.category === 'park' || item.category === 'show' || item.category === 'dining')) {
        closingTime = item.time;
      }
    });

    if (day.date === '2026-12-31') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('fim do dia') && i.time >= '21:00') return false;
        return true;
      });

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
      closingTime = '00:00';
    }

    if (isParkDay) {
      const nightAcc = resolveAccommodationForNight(accommodations, day.date!, trip.selectedAccommodationsPerNight) || accommodations[0];
      const accName = nightAcc ? nightAcc.name : 'Acomodação';
      const transitInfo = getDriveAndParkingMetrics(day.park!, nightAcc?.name, nightAcc?.address);
      const walkTimeMins = transitInfo.maxParkingMins;
      const transitMins = transitInfo.driveMins;

      const [cH, cM] = closingTime.split(':').map((v) => parseInt(v, 10));
      const closeTotalMins = cH * 60 + cM;

      const exitMins = closeTotalMins;
      const exitH = Math.floor(exitMins / 60) % 24;
      const exitM = exitMins % 60;
      const exitTimeStr = `${String(exitH).padStart(2, '0')}:${String(exitM).padStart(2, '0')}`;

      const carMins = closeTotalMins + walkTimeMins;
      const carH = Math.floor(carMins / 60) % 24;
      const carM = carMins % 60;
      const carTimeStr = `${String(carH).padStart(2, '0')}:${String(carM).padStart(2, '0')}`;

      const arrivalMins = carMins + transitMins;
      const arrivalH = Math.floor(arrivalMins / 60) % 24;
      const arrivalM = arrivalMins % 60;
      const arrivalTimeStr = `${String(arrivalH).padStart(2, '0')}:${String(arrivalM).padStart(2, '0')}`;

      parkReportData.push({
        date: day.date || '',
        parkName: day.park!,
        closingTime,
        exitTime: exitTimeStr,
        walkTimeMins,
        transitMins,
        accommodationName: accName,
        arrivalTime: arrivalTimeStr,
      });

      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('término das atividades') && !t.includes('chegada ao carro') && !t.includes('fim do dia na acomodação');
      });

      syncedItems.push({
        id: `auto-exit-${day.date}`,
        time: exitTimeStr,
        title: `🌙 Término das atividades em ${day.park} e Saída`,
        location: day.park,
        category: 'park',
        notes: `Encerramento das atividades e saída do parque às ${closingTime}.`,
        sourceType: 'park',
        completed: false,
      });

      syncedItems.push({
        id: `auto-car-${day.date}`,
        time: carTimeStr,
        title: '🚗 Chegada ao Carro no Estacionamento',
        location: day.park,
        category: 'transport',
        notes: `Caminhada até o estacionamento (~${walkTimeMins} min).`,
        sourceType: 'transport',
        completed: false,
      });

      syncedItems.push({
        id: `auto-arrival-${day.date}`,
        time: arrivalTimeStr,
        title: `🌙 Fim do dia na acomodação (${accName})`,
        location: accName,
        category: 'hotel',
        notes: `Deslocamento de retorno (${transitMins} min) e chegada à acomodação noturna.`,
        sourceType: 'accommodation',
        completed: false,
      });
    }

    syncedItems.forEach((item) => {
      if (item.category === 'airbnb') item.category = 'hotel';
    });

    day.hourlySchedule = deduplicateHourlySchedule(syncedItems);
  }

  console.log('Persisting updated schedules securely to Supabase...');

  for (const day of days) {
    const dayDbRow = mapItineraryDayToDb(day, tripId);

    const dayHourlyRows = (day.hourlySchedule || []).map((item, index) => {
      const dbRow = mapHourlyScheduleToDb(item, dayDbRow.id, tripId, index);
      dbRow.id = generateDeterministicUUID('hourly-stable', `${dayDbRow.id}-${index}-${item.time}-${item.title}`);
      return dbRow;
    });

    // Upsert day first
    const { error: dErr } = await supabase
      .from('itinerary_days')
      .upsert(dayDbRow, { onConflict: 'id' });

    if (dErr) {
      console.error(`Error upserting day ${day.dayNumber} (${day.date}):`, dErr.message);
      process.exit(1);
    }

    // Clear old hourly schedules ONLY after day is successfully upserted
    const { error: delErr } = await supabase
      .from('hourly_schedules')
      .delete()
      .eq('itinerary_day_id', dayDbRow.id);

    if (delErr) {
      console.error(`Error clearing old hourly schedules for day ${day.dayNumber}:`, delErr.message);
      process.exit(1);
    }

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

  console.log(`\n=== PARK REPORT SUMMARY ===`);
  parkReportData.forEach((r) => {
    console.log(`Park: ${r.parkName} (${r.date}) | Closing: ${r.closingTime} | Exit: ${r.exitTime} | Walk to Car: ${r.walkTimeMins} min | Transit: ${r.transitMins} min | Acc: ${r.accommodationName} | Arrival: ${r.arrivalTime}`);
  });

  console.log(`\n=== FINAL AUDIT RESULT: ${allChecksPassed ? 'ALL CHECKS PASSED SUCCESSFULLY (100% FIELD PARITY)' : 'SOME DISCREPANCIES FOUND'} ===`);
}

main().catch(console.error);
