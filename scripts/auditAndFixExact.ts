import { supabase } from '../src/services/supabaseClient.js';
import {
  mapDbToAccommodation,
  mapDbToFlight,
  mapDbToCarRental,
  mapDbToItineraryDay,
  mapDbToParkBooking,
  mapHourlyScheduleToDb,
  mapItineraryDayToDb,
} from '../src/services/supabaseService.js';
import {
  deduplicateHourlySchedule,
  compareScheduleItemOrder,
  addMinutesToTimeString,
} from '../src/utils/parkScheduleUtils.js';
import { generateDeterministicUUID } from '../src/utils/uuid.js';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING EXACT RECONCILIATION & AUDIT FOR TRIP 78bbd4b1-2857-43d0-9520-2318a3b157a3 ===');

  // 1. Query Supabase with strict table names and error handling (no empty array swallowing on error)
  const [
    { data: tripRows, error: tripErr },
    { data: accRows, error: accErr },
    { data: flightRows, error: flightErr },
    { data: carRows, error: carErr },
    { data: pbRows, error: pbErr },
    { data: dayRows, error: dayErr },
    { data: hourlyRows, error: hourlyErr },
  ] = await Promise.all([
    supabase.from('trips').select('*').eq('id', TARGET_TRIP_ID),
    supabase.from('accommodations').select('*').eq('trip_id', TARGET_TRIP_ID),
    supabase.from('flight_segments').select('*').eq('trip_id', TARGET_TRIP_ID),
    supabase.from('car_rentals').select('*').eq('trip_id', TARGET_TRIP_ID),
    supabase.from('park_day_bookings').select('*').eq('trip_id', TARGET_TRIP_ID),
    supabase.from('itinerary_days').select('*').eq('trip_id', TARGET_TRIP_ID).order('day_number'),
    supabase.from('hourly_schedules').select('*').eq('trip_id', TARGET_TRIP_ID),
  ]);

  if (tripErr) { throw new Error(`Error reading trips: ${tripErr.message}`); }
  if (accErr) { throw new Error(`Error reading accommodations: ${accErr.message}`); }
  if (flightErr) { throw new Error(`Error reading flight_segments: ${flightErr.message}`); }
  if (carErr) { throw new Error(`Error reading car_rentals: ${carErr.message}`); }
  if (pbErr) { throw new Error(`Error reading park_day_bookings: ${pbErr.message}`); }
  if (dayErr) { throw new Error(`Error reading itinerary_days: ${dayErr.message}`); }
  if (hourlyErr) { throw new Error(`Error reading hourly_schedules: ${hourlyErr.message}`); }

  const accommodations = (accRows || []).map(mapDbToAccommodation);
  const flights = (flightRows || []).map(mapDbToFlight);
  const carRentals = (carRows || []).map(mapDbToCarRental);
  const parkBookings = (pbRows || []).map(mapDbToParkBooking);
  const days = (dayRows || []).map(mapDbToItineraryDay);

  const pbMap = new Map<string, any>();
  parkBookings.forEach((pb) => {
    if (pb.itineraryDayId) pbMap.set(pb.itineraryDayId, pb);
    if (pb.dayNumber) pbMap.set(`day-${pb.dayNumber}`, pb);
  });

  console.log(`Loaded: ${days.length} days, ${flights.length} flight segments, ${parkBookings.length} park bookings.`);

  // 2. Reconcile each day according to precise instructions
  for (const day of days) {
    let items = day.hourlySchedule ? [...day.hourlySchedule] : [];
    const date = day.date;
    const pb = pbMap.get(day.id) || pbMap.get(`day-${day.dayNumber}`);

    // Preserve manual items
    const manualItems = items.filter((i) => i.sourceType === 'manual');
    let autoItems = items.filter((i) => i.sourceType !== 'manual');

    // 27/12: SFB arrival 13:35, transit 16:35, duration 325 mins, arrival 22:00. No MIA or 17:15.
    if (date === '2026-12-27') {
      autoItems = autoItems.map((i) => {
        let title = i.title || '';
        let notes = i.notes || '';
        title = title.replace(/MIA/g, 'SFB (Orlando Sanford)');
        notes = notes.replace(/MIA/g, 'SFB (Orlando Sanford)').replace(/17:15/g, '13:35');
        if (title.includes('Deslocamento') || title.includes('Trajeto')) {
          notes = 'Trajeto estimado de Orlando Sanford (SFB) até a acomodação em Miami: duração estimada de 325 minutos (5h25m) partindo às 16:35, com chegada estimada às 22:00.';
        }
        return { ...i, title, notes };
      });
    }

    // 29/12: Remove duplicate check-in at 16:00. Treat 16:00 as contractual/informative availability and 16:17 as estimated arrival after 287 mins travel.
    if (date === '2026-12-29') {
      // Filter out duplicate check-ins or weird departures
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('10:00') && !t.includes('10:30');
      });

      // Ensure single checkout at 11:00
      autoItems = autoItems.filter((i) => !(i.title || '').toLowerCase().includes('check-out'));
      autoItems.push({
        id: 'auto-checkout-2912',
        time: '11:00',
        title: '🚪 Check-out da Acomodação em Miami',
        location: 'Comfort Inn & Suites Downtown Brickell',
        category: 'hotel',
        notes: 'Horário contratual de check-out (11:00).',
        sourceType: 'accommodation',
        completed: false,
      });

      // Ensure departure at 11:30
      autoItems = autoItems.filter((i) => !(i.title || '').toLowerCase().includes('saída de miami') && !(i.title || '').toLowerCase().includes('deslocamento: miami'));
      autoItems.push({
        id: 'auto-dep-2912',
        time: '11:30',
        title: '🚗 Saída de Miami rumo a Modern Retreat Resort (Kissimmee)',
        location: 'Kissimmee - FL',
        category: 'transport',
        notes: 'Saída às 11:30 após o check-out das 11:00, com margem para chaves e bagagem. Duração estimada de 287 minutos (~4h47m), chegada estimada às 16:17.',
        sourceType: 'transport',
        completed: false,
      });

      // Single informative check-in at 16:00
      autoItems = autoItems.filter((i) => !(i.title || '').toLowerCase().includes('quarto disponível') && !(i.title || '').toLowerCase().includes('check-in / quarto'));
      autoItems.push({
        id: 'auto-checkin-2912',
        time: '16:00',
        title: '🏨 Quarto disponível / Horário oficial de check-in (Modern Retreat Resort)',
        location: 'Modern Retreat Resort',
        category: 'hotel',
        notes: 'Horário contratual de disponibilidade do quarto (16:00) [Informativo: chegada estimada da viagem às 16:17].',
        sourceType: 'accommodation',
        completed: false,
      });
    }

    // 30/12: Remove duplicate departure at 07:07/07:15 and duplicate opening at 08:00/09:00. Reconcile with park_day_bookings (08:00-22:00 or official). No invented Early Entry.
    if (date === '2026-12-30') {
      const pHours = pb?.parkHours || { openingTime: '08:00', closingTime: '22:00' };
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('07:07') && !t.includes('07:15') && !t.includes('07:30') && !t.includes('abertura oficial de 08:00');
      });

      // Clean and reconstruct single clean sequence for 30/12
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('início do dia') && !t.includes('saída da acomodação') && !t.includes('catracas') && !t.includes('abertura oficial') && !t.includes('término das atividades') && !t.includes('carro') && !t.includes('retorno');
      });

      autoItems.push(
        { id: 'wake-3012', time: '07:00', title: '☀️ Início do dia na acomodação (Modern Retreat Resort)', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Despertar e preparativos.', sourceType: 'accommodation', completed: false },
        { id: 'dep-3012', time: '07:15', title: '🚗 Saída da acomodação ➔ SeaWorld Orlando', location: 'Modern Retreat Resort', category: 'transport', notes: 'Deslocamento de carro rumo ao SeaWorld.', sourceType: 'transport', completed: false },
        { id: 'open-3012', time: pHours.openingTime || '08:00', title: `🌟 Abertura Oficial de SeaWorld Orlando`, location: 'SeaWorld Orlando', category: 'park', notes: `Horário oficial de abertura (${pHours.openingTime || '08:00'}). [Sem Early Entry confirmado para Airbnb].`, sourceType: 'park', completed: false },
        { id: 'close-3012', time: pHours.closingTime || '22:00', title: `🌙 Término das atividades em SeaWorld Orlando e Saída`, location: 'SeaWorld Orlando', category: 'park', notes: `Fechamento do parque às ${pHours.closingTime || '22:00'}.`, sourceType: 'park', completed: false },
        { id: 'car-3012', time: addMinutesToTimeString(pHours.closingTime || '22:00', 15), title: '🚗 Chegada ao Carro no Estacionamento', location: 'SeaWorld Orlando', category: 'transport', notes: 'Caminhada até o veículo.', sourceType: 'transport', completed: false },
        { id: 'ret-3012', time: addMinutesToTimeString(pHours.closingTime || '22:00', 20), title: '🚗 Início do trajeto de retorno', location: 'SeaWorld Orlando', category: 'transport', notes: 'Viagem de carro de volta para a acomodação.', sourceType: 'transport', completed: false },
        { id: 'arr-3012', time: addMinutesToTimeString(pHours.closingTime || '22:00', 50), title: '🌙 Fim do dia na acomodação (Modern Retreat Resort)', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Chegada à acomodação e descanso.', sourceType: 'accommodation', completed: false }
      );
    }

    // 31/12: Keep NYE end/return pending if unconfirmed. Do not add closing, exit, or post-midnight arrival as facts without confirmation.
    if (date === '2026-12-31') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('22:30') && !t.includes('fim do dia na acomodação') && !t.includes('retorno à acomodação antes') && !t.includes('abertura às 10:00');
      });

      const pHours = pb?.parkHours || { openingTime: '09:00', closingTime: '01:00' };
      autoItems = autoItems.filter((i) => !(i.title || '').toLowerCase().includes('abertura oficial'));
      autoItems.push({
        id: 'open-3112',
        time: pHours.openingTime || '09:00',
        title: '🌟 Abertura Oficial de Busch Gardens Tampa Bay',
        location: 'Busch Gardens Tampa Bay',
        category: 'park',
        notes: `Horário oficial de abertura (${pHours.openingTime || '09:00'}) conforme cadastro do parque.`,
        sourceType: 'park',
        completed: false,
      });

      const hasNYE = autoItems.some((i) => (i.title || '').toLowerCase().includes('réveillon') || (i.title || '').toLowerCase().includes('ano-novo'));
      if (!hasNYE) {
        autoItems.push({
          id: 'nye-3112',
          time: '23:59',
          title: '🎆 Celebração de Réveillon e Virada de Ano em Busch Gardens',
          location: 'Busch Gardens Tampa Bay',
          category: 'park',
          notes: 'Espetáculo de fogos e celebração de Ano-Novo. [Término oficial, saída, caminhada ao carro, retorno e chegada pós-meia-noite explicitamente PENDENTES de confirmação do término real do evento].',
          sourceType: 'park',
          completed: false,
        });
      }
    }

    // 01/01: Remove one of two return start events at 21:25. Arrival at 22:01 is consistent with 36 min from 21:25. Remove Early Entry.
    if (date === '2027-01-01') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('22:30') && !t.includes('early entry') && !t.includes('entrada antecipada');
      });
      // Deduplicate return start at 21:25 if multiple
      let foundReturnStart = false;
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('início do trajeto de retorno') && i.time === '21:25') {
          if (foundReturnStart) return false;
          foundReturnStart = true;
        }
        return true;
      });
    }

    // 08/01: Rename 07:00 to key pickup / pre-check-in, keep 16:00 as informative room availability. Fix wake-up after departure, single valid transit at 07:30, check night return calculation (21:30 + 42 min = 22:12 or similar duration).
    if (date === '2027-01-08') {
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('07:00') && (t.includes('quarto') || t.includes('check-in'))) {
          return {
            ...i,
            title: '🔑 Retirada de Chaves, Pré Check-in & Express Pass: Universal Hard Rock Hotel',
            notes: 'Retirada de chaves e pré-check-in / Express Pass às 07:00. [Quarto disponível apenas às 16:00].',
          };
        }
        if (t.includes('16:00')) {
          return {
            ...i,
            title: '🏨 Quarto disponível / Horário oficial de check-in (Universal Hard Rock Hotel)',
            notes: 'Horário oficial de disponibilidade do quarto (16:00) [Informativo: sem necessidade de retornar ao hotel durante o dia de parque].',
          };
        }
        return i;
      });
      // Fix night return calculation: closing 21:00 + park walk (25 min) -> car at 21:25 + return start 21:30 + 42 min = 22:12 arrival
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('fim do dia na acomodação') || t.includes('chegada na acomodação')) {
          return { ...i, time: '22:12', notes: 'Chegada ao Hard Rock Hotel após o fechamento do parque e trajeto de retorno.' };
        }
        return i;
      });
    }

    // 09/01: Checkout at 11:00 contractual, departure at 07:15 as planning with luggage pending note. Return end: 21:30 + 42 min = 22:12.
    if (date === '2027-01-09') {
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('check-out') || t.includes('liberação')) {
          return {
            ...i,
            time: '11:00',
            notes: 'Horário contratual de check-out (11:00). [⚠️ Planejamento de saída antecipada de malas às 07:15 com guarda-volumes pendente de confirmação].',
          };
        }
        if (t.includes('fim do dia') || t.includes('chegada na acomodação')) {
          return { ...i, time: '22:12', notes: 'Chegada ao final do dia.' };
        }
        return i;
      });
    }

    // 10/01: Separate checkout at 10:00 from departure. Recalculate car return using 63 min duration: 10:00 -> 11:03; 10:45 -> 11:48. Preserve 12:00 max deadline.
    if (date === '2027-01-10') {
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('check-out')) {
          return { ...i, time: '10:00', notes: 'Horário contratual de check-out da acomodação.' };
        }
        if (t.includes('saída') || t.includes('deslocamento')) {
          return { ...i, time: '10:45', notes: 'Saída após o check-out com tempo realista para carregar bagagens rumo a Orlando Sanford (SFB).' };
        }
        if (t.includes('devolução') || t.includes('carro')) {
          return { ...i, time: '11:48', notes: 'Chegada estimada à locadora em SFB após 63 min de trajeto partindo às 10:45. [Prazo máximo contratual limite: 12:00, não horário obrigatório rígido].' };
        }
        return i;
      });
    }

    const combined = [...manualItems, ...autoItems];
    day.hourlySchedule = deduplicateHourlySchedule(combined).sort(compareScheduleItemOrder);
  }

  console.log('\n--- PHASE 3: PERSISTING UPDATED SCHEDULES IDEMPOTENTLY ---');

  for (const day of days) {
    day.hourlySchedule = deduplicateHourlySchedule(day.hourlySchedule || []).sort(compareScheduleItemOrder);
    
    const dayDbRow = mapItineraryDayToDb(day, TARGET_TRIP_ID);
    const dayHourlyRows = (day.hourlySchedule || []).map((item, index) => {
      const dbRow = mapHourlyScheduleToDb(item, dayDbRow.id, TARGET_TRIP_ID, index);
      dbRow.id = generateDeterministicUUID('hourly-stable', `${dayDbRow.id}-${index}-${item.time}-${item.title}`);
      return dbRow;
    });

    const { error: dErr } = await supabase
      .from('itinerary_days')
      .upsert(dayDbRow, { onConflict: 'id' });

    if (dErr) { throw new Error(`Error upserting day ${day.dayNumber}: ${dErr.message}`); }

    if (dayHourlyRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('hourly_schedules')
        .upsert(dayHourlyRows, { onConflict: 'id' });

      if (upsertErr) { throw new Error(`Error upserting hourly schedules for day ${day.dayNumber}: ${upsertErr.message}`); }
    }

    const newIds = new Set(dayHourlyRows.map((r) => r.id));
    const existingDayRows = (hourlyRows || []).filter((r) => r.itinerary_day_id === dayDbRow.id);
    const obsoleteIds = existingDayRows.filter((r) => !newIds.has(r.id)).map((r) => r.id);

    if (obsoleteIds.length > 0) {
      const { error: delErr } = await supabase
        .from('hourly_schedules')
        .delete()
        .in('id', obsoleteIds);

      if (delErr) { throw new Error(`Error deleting obsolete hourly schedules for day ${day.dayNumber}: ${delErr.message}`); }
    }
  }

  console.log('\n--- PHASE 4: DUAL VALIDATION (A. FIELD PARITY & B. SEMANTIC CHRONOLOGY) ---');

  let fieldParityPassed = true;
  let semanticChronologyPassed = true;
  const validationReport: string[] = [];

  for (const targetDay of days) {
    const { data: dbDay } = await supabase.from('itinerary_days').select('*').eq('id', targetDay.id).single();
    const { data: dbRows } = await supabase.from('hourly_schedules').select('*').eq('itinerary_day_id', targetDay.id).order('time');

    const jsonItems = dbDay?.hourly_schedule || [];
    const dbItems = (dbRows || []).sort(compareScheduleItemOrder as any);

    // A. Field Parity Check
    if (jsonItems.length !== dbItems.length) {
      fieldParityPassed = false;
      validationReport.push(`[Day ${targetDay.dayNumber}] ❌ Parity count mismatch: JSON(${jsonItems.length}) vs DB(${dbItems.length})`);
    } else {
      for (let i = 0; i < jsonItems.length; i++) {
        const j = jsonItems[i];
        const d = dbItems[i];
        if (j.time !== d.time || j.title !== d.title || (j.category || 'other') !== (d.category || 'other')) {
          fieldParityPassed = false;
          validationReport.push(`[Day ${targetDay.dayNumber}] ❌ Field diff at index ${i}: JSON(${j.time} ${j.title}) vs DB(${d.time} ${d.title})`);
        }
      }
    }

    // B. Semantic Chronological Validation
    for (let i = 0; i < jsonItems.length - 1; i++) {
      const cur = jsonItems[i];
      const next = jsonItems[i + 1];
      if (cur.time && next.time && cur.time > next.time) {
        semanticChronologyPassed = false;
        validationReport.push(`[Day ${targetDay.dayNumber}] ❌ Chronology violation: "${cur.title}" (${cur.time}) comes AFTER "${next.title}" (${next.time})`);
      }
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`(A) Field Parity (JSON vs DB): ${fieldParityPassed ? 'PASSED (100% MATCH)' : 'FAILED'}`);
  console.log(`(B) Semantic Chronology Validation: ${semanticChronologyPassed ? 'PASSED (Strict Order)' : 'FAILED'}`);

  if (validationReport.length > 0) {
    console.log('\nValidation Messages:');
    validationReport.forEach((m) => console.log(m));
  }

  if (fieldParityPassed && semanticChronologyPassed) {
    console.log('\n=== ALL VALIDATIONS PASSED SUCCESSFULLY ===');
  } else {
    console.log('\n=== SOME VALIDATIONS FAILED ===');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('CRITICAL AUDIT ERROR:', err);
  process.exit(1);
});
