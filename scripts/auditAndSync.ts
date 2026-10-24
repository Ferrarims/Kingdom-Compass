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
} from '../src/utils/parkScheduleUtils.js';
import { generateDeterministicUUID } from '../src/utils/uuid.js';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING STRICT AUDIT & PRECISE RECONCILIATION ===');

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

  for (const day of days) {
    let syncedItems = syncAllEventsToHourlySchedule(day, tripContext);
    const isParkDay = day.park && day.park !== 'Sem Parque' && day.park !== 'Parque a Definir';
    let closingTime = '21:00';

    if (day.parkBooking?.parkHours?.closingTime) {
      closingTime = day.parkBooking.parkHours.closingTime;
    } else if (day.date && officialParkMapping[day.date]) {
      closingTime = officialParkMapping[day.date].closing;
    }

    // 1. 31/12/2026 — Busch Gardens Tampa Bay (NYE)
    if (day.date === '2026-12-31') {
      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('fim do dia') && !t.includes('retorno') && !t.includes('chegada ao carro') && !t.includes('término das atividades');
      });

      const hasNYE = syncedItems.some((i) => (i.title || '').toLowerCase().includes('ano-novo') || (i.title || '').toLowerCase().includes('réveillon'));
      if (!hasNYE) {
        syncedItems.push({
          id: 'auto-nye-buschtampabay',
          time: '23:59',
          title: '🎆 Celebração de Réveillon e Virada de Ano em Busch Gardens',
          location: 'Busch Gardens Tampa Bay',
          category: 'park',
          notes: 'Espetáculo de fogos de artifício e celebração de Ano-Novo em Busch Gardens Tampa Bay. [Duração do evento e horário de término pendentes de confirmação oficial; saída, caminhada até o carro e trajeto de retorno serão calculados após a confirmação do término real].',
          sourceType: 'park',
          completed: false,
        });
        pendingItemsReport.push('31/12/2026: Duração e horário de término da Celebração de Réveillon pendentes de confirmação oficial.');
      }
    }

    // 2. Post-midnight return on 01/01/2027
    if (day.date === '2027-01-01') {
      const nightAcc = resolveAccommodationForNight(accommodations, '2026-12-31', trip.selectedAccommodationsPerNight) || accommodations[0];
      const accName = nightAcc ? nightAcc.name : 'Modern Retreat Resort';

      const hasNyeReturn = syncedItems.some((i) => (i.title || '').toLowerCase().includes('pós-virada') || (i.notes || '').toLowerCase().includes('réveillon'));
      if (!hasNyeReturn) {
        syncedItems.unshift({
          id: 'auto-nye-return-2026-12-31',
          time: '02:01',
          title: `🌙 Retorno ao ${accName} (Pós-Virada)`,
          location: accName,
          category: 'hotel',
          notes: 'Chegada à acomodação após a celebração de Réveillon em Busch Gardens Tampa Bay. [Horário sujeito a recalculo exato após confirmação do término do evento].',
          sourceType: 'accommodation',
          completed: false,
        });
      }
    }

    // 3. General Park Days Routing & Morning Precision
    if (isParkDay && day.date !== '2026-12-31') {
      const nightAcc = resolveAccommodationForNight(accommodations, day.date!, trip.selectedAccommodationsPerNight) || accommodations[0];
      const accName = nightAcc ? nightAcc.name : 'Acomodação';
      const transitInfo = getDriveAndParkingMetrics(day.park!, nightAcc?.name, nightAcc?.address);
      const walkTimeMins = transitInfo.maxParkingMins;
      const transitMins = transitInfo.driveMins;

      const info = officialParkMapping[day.date!] || { opening: '09:00', closing: '21:00', early: '08:30' };
      const openingTime = info.opening;
      const earlyTime = info.early;

      const baseParkTime = earlyTime ? earlyTime : openingTime;
      const [bpH, bpM] = baseParkTime.split(':').map((v) => parseInt(v, 10));
      const parkTotalMins = bpH * 60 + bpM;

      const turnstileMins = parkTotalMins - 30;
      const tH = Math.floor(turnstileMins / 60);
      const tM = turnstileMins % 60;
      const turnstileStr = `${String(tH).padStart(2, '0')}:${String(tM).padStart(2, '0')}`;

      const depMins = turnstileMins - walkTimeMins - transitMins - 10;
      const dH = Math.max(5, Math.floor(depMins / 60));
      const dM = depMins % 60;
      const depStr = `${String(dH).padStart(2, '0')}:${String(dM).padStart(2, '0')}`;

      const wakeMins = depMins - 30;
      const wH = Math.max(5, Math.floor(wakeMins / 60));
      const wM = wakeMins % 60;
      const wakeStr = `${String(wH).padStart(2, '0')}:${String(wM).padStart(2, '0')}`;

      let finalWake = wakeStr;
      let finalDep = depStr;
      let finalTurnstile = turnstileStr;

      if (day.date === '2027-01-01') {
        finalTurnstile = '08:00';
        finalDep = '07:00';
        finalWake = '06:30';
      } else if (day.date === '2027-01-03') {
        finalTurnstile = '08:00';
        finalDep = '06:55';
        finalWake = '06:25';
      } else if (day.date === '2027-01-05') {
        finalTurnstile = '08:00';
        finalDep = '07:20';
        finalWake = '06:50';
      } else if (day.date === '2027-01-07') {
        finalTurnstile = '08:00';
        finalDep = '07:25';
        finalWake = '06:55';
      } else if (day.date === '2027-01-08') {
        finalWake = '05:49';
        finalDep = '06:19';
        finalTurnstile = '08:00';
      } else if (day.date === '2027-01-09') {
        finalWake = '06:23';
        finalDep = '07:30';
        finalTurnstile = '08:00';
      }

      let [cH, cM] = closingTime.split(':').map((v) => parseInt(v, 10));
      const closeTotalMins = cH * 60 + cM;

      const exitMins = closeTotalMins;
      const exitH = Math.floor(exitMins / 60) % 24;
      const exitM = exitMins % 60;
      const exitTimeStr = `${String(exitH).padStart(2, '0')}:${String(exitM).padStart(2, '0')}`;

      const carMins = closeTotalMins + walkTimeMins;
      const carH = Math.floor(carMins / 60) % 24;
      const carM = carMins % 60;
      const carTimeStr = `${String(carH).padStart(2, '0')}:${String(carM).padStart(2, '0')}`;

      const carStartDriveMins = carMins + 5;
      const csdH = Math.floor(carStartDriveMins / 60) % 24;
      const csdM = carStartDriveMins % 60;
      const carStartDriveStr = `${String(csdH).padStart(2, '0')}:${String(csdM).padStart(2, '0')}`;

      const arrivalMins = carStartDriveMins + transitMins;
      const arrivalH = Math.floor(arrivalMins / 60) % 24;
      const arrivalM = arrivalMins % 60;
      const arrivalTimeStr = `${String(arrivalH).padStart(2, '0')}:${String(arrivalM).padStart(2, '0')}`;

      syncedItems = syncedItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('término das atividades') && !t.includes('chegada ao carro') && !t.includes('início do trajeto de retorno') && !t.includes('transporte de retorno') && !t.includes('fim do dia na acomodação') && !t.includes('chegada na entrada') && !t.includes('entrada antecipada') && !t.includes('deslocamento:') && !t.includes('início do dia');
      });

      if (day.date === '2027-01-08') {
        syncedItems.push(
          { id: 'auto-acordar-2027-01-08', time: '05:49', title: '⏰ Acordar — Modern Retreat Resort', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Despertar 30 min antes da saída para o Universal Hard Rock Hotel às 06:19.', sourceType: 'accommodation', completed: false },
          { id: 'auto-acc-transit-2027-01-08', time: '06:19', title: '🚗 Deslocamento: Modern Retreat Resort ➔ Universal Hard Rock Hotel', location: 'Universal Hard Rock Hotel', category: 'transport', notes: 'Deslocamento da acomodação da manhã até Universal Hard Rock Hotel para pré check-in e retirada de chave.', sourceType: 'transport', completed: false },
          { id: 'auto-acc-keypickup-2027-01-08', time: '07:00', title: '🔑 Retirada de Chaves & Pré Check-in: Universal Hard Rock Hotel', location: 'Universal Hard Rock Hotel', category: 'hotel', notes: 'Parada de 30 min em Universal Hard Rock Hotel para pré check-in e retirada de chave/Express Pass. Quarto disponível a partir das 16:00.', sourceType: 'accommodation', completed: false },
          { id: 'auto-acc-park-transfer-2027-01-08', time: '07:30', title: "🚗 Transferência: Universal Hard Rock Hotel ➔ Universal's Islands of Adventure", location: "Universal's Islands of Adventure", category: 'transport', notes: 'Deslocamento do Hard Rock Hotel para Islands of Adventure.', sourceType: 'transport', completed: false },
          { id: 'auto-ida-2027-01-08', time: '08:00', title: '🎟️ Chegada na Entrada do Parque (30 min antes da Early Entry)', location: "Universal's Islands of Adventure", category: 'park', notes: 'Posicionamento nas catracas para Early Entry às 08:30.', sourceType: 'park', completed: false },
          { id: 'auto-abertura-2027-01-08', time: '08:30', title: "⚡ Entrada Antecipada (Early Entry) em Universal's Islands of Adventure", location: "Universal's Islands of Adventure", category: 'park', notes: 'Início do funcionamento com Universal Express.', sourceType: 'park', completed: false }
        );
      } else if (day.date === '2027-01-09') {
        syncedItems.push(
          { id: 'auto-acordar-2027-01-09', time: '06:23', title: '⏰ Acordar — Universal Hard Rock Hotel', location: 'Universal Hard Rock Hotel', category: 'hotel', notes: 'Despertar no Hard Rock Hotel.', sourceType: 'accommodation', completed: false },
          { id: 'auto-checkout-2027-01-09', time: '07:15', title: '🚪 Liberação do Quarto & Check-out: Universal Hard Rock Hotel', location: 'Universal Hard Rock Hotel', category: 'hotel', notes: 'Liberação do quarto e check-out no Hard Rock. [Aviso de guarda-volumes pendente de confirmação].', sourceType: 'accommodation', completed: false },
          { id: 'auto-park-transit-2027-01-09', time: '07:30', title: '🚗 Deslocamento: Universal Hard Rock Hotel ➔ Universal Studios Florida', location: 'Universal Studios Florida', category: 'transport', notes: 'Deslocamento do Hard Rock Hotel para Universal Studios Florida.', sourceType: 'transport', completed: false },
          { id: 'auto-ida-2027-01-09', time: '08:00', title: '🎟️ Chegada na Entrada do Parque (30 min antes da Early Entry)', location: 'Universal Studios Florida', category: 'park', notes: 'Chegada às catracas para Early Entry às 08:30.', sourceType: 'park', completed: false },
          { id: 'auto-abertura-2027-01-09', time: '08:30', title: '⚡ Entrada Antecipada (Early Entry) em Universal Studios Florida', location: 'Universal Studios Florida', category: 'park', notes: 'Início do funcionamento em Universal Studios Florida.', sourceType: 'park', completed: false }
        );
      } else {
        syncedItems.push(
          { id: `auto-morning-${day.date}`, time: finalWake, title: `☀️ Início do dia na acomodação (${accName})`, location: accName, category: 'hotel', notes: 'Despertar, café da manhã e preparativos para o dia de parque.', sourceType: 'accommodation', completed: false },
          { id: `auto-dep-${day.date}`, time: finalDep, title: `🚗 Saída da acomodação (${accName}) ➔ ${day.park}`, location: accName, category: 'transport', notes: `Início do deslocamento de carro (~${transitMins} min) rumo ao estacionamento de ${day.park}.`, sourceType: 'transport', completed: false },
          { id: `auto-arrival-turnstile-${day.date}`, time: finalTurnstile, title: `🎟️ Chegada na Entrada de ${day.park} (Catracas)`, location: day.park, category: 'park', notes: `Chegada às catracas 30 min antes da ${earlyTime ? 'Early Entry (' + earlyTime + ')' : 'Abertura Oficial (' + openingTime + ')'}.`, sourceType: 'park', completed: false }
        );
        if (earlyTime) {
          syncedItems.push({
            id: `auto-early-${day.date}`,
            time: earlyTime,
            title: `⚡ Entrada Antecipada (Early Entry) em ${day.park}`,
            location: day.park,
            category: 'park',
            notes: `Início da Entrada Antecipada (abertura oficial às ${openingTime}).`,
            sourceType: 'park',
            completed: false,
          });
        }
      }

      syncedItems.push(
        { id: `auto-exit-${day.date}`, time: exitTimeStr, title: `🌙 Término das atividades em ${day.park} e Saída`, location: day.park, category: 'park', notes: `Encerramento das atividades e saída do parque às ${closingTime}.`, sourceType: 'park', completed: false },
        { id: `auto-car-${day.date}`, time: carTimeStr, title: '🚗 Chegada ao Carro no Estacionamento', location: day.park, category: 'transport', notes: `Caminhada até o veículo no estacionamento (~${walkTimeMins} min).`, sourceType: 'transport', completed: false },
        { id: `auto-return-start-${day.date}`, time: carStartDriveStr, title: `🚗 Início do trajeto de retorno: ${day.park} ➔ ${accName}`, location: day.park, category: 'transport', notes: `Embarque e início da viagem de carro de volta para a acomodação (~${transitMins} min).`, sourceType: 'transport', completed: false },
        { id: `auto-arrival-night-${day.date}`, time: arrivalTimeStr, title: `🌙 Fim do dia na acomodação (${accName})`, location: accName, category: 'hotel', notes: `Chegada à acomodação noturna e descanso.`, sourceType: 'accommodation', completed: false }
      );
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

    const { error: dErr } = await supabase
      .from('itinerary_days')
      .upsert(dayDbRow, { onConflict: 'id' });

    if (dErr) {
      console.error(`Error upserting day ${day.dayNumber} (${day.date}):`, dErr.message);
      process.exit(1);
    }

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

  console.log(`\n=== PENDING ITEMS REPORT ===`);
  pendingItemsReport.forEach((p) => console.log(`- ${p}`));

  console.log(`\n=== FINAL AUDIT RESULT: ${allChecksPassed ? 'ALL CHECKS PASSED SUCCESSFULLY (100% FIELD PARITY)' : 'SOME DISCREPANCIES FOUND'} ===`);
}

main().catch(console.error);
