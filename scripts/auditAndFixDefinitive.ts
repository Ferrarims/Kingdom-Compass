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
  getParkTransitInfo,
  resolveAccommodationForNight,
  calculateDriveTimeMinutes,
  estimateAccommodationCoordinates,
} from '../src/utils/parkScheduleUtils.js';
import { generateDeterministicUUID } from '../src/utils/uuid.js';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function main() {
  console.log('=== STARTING DEFINITIVE RECONCILIATION & FORMULA AUDIT FOR TRIP 78bbd4b1-2857-43d0-9520-2318a3b157a3 ===');

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

  for (const day of days) {
    let items = day.hourlySchedule ? [...day.hourlySchedule] : [];
    const date = day.date;
    const pb = pbMap.get(day.id) || pbMap.get(`day-${day.dayNumber}`);

    const manualItems = items.filter((i) => i.sourceType === 'manual');
    let autoItems = items.filter((i) => i.sourceType !== 'manual');

    // 27/12: SFB arrival 13:35, transit 16:35, duration 325 mins, arrival estimated 22:00.
    if (date === '2026-12-27') {
      autoItems = autoItems.map((i) => {
        let title = i.title || '';
        let notes = i.notes || '';
        title = title.replace(/MIA/g, 'SFB (Orlando Sanford)');
        notes = notes.replace(/MIA/g, 'SFB (Orlando Sanford)').replace(/17:15/g, '13:35');
        if (title.includes('Deslocamento') || title.includes('Trajeto') || title.includes('Chegada')) {
          notes = 'Chegada estimada às 22:00 (estimativa de 325 minutos de trajeto a partir de SFB após desembarque e retirada de carro). [Não confundir com o check-in contratual do Comfort Inn às 15:35].';
        }
        return { ...i, title, notes };
      });
    }

    // 29/12: Single departure at 11:30 and single informative room availability at 16:00. Arrival 16:17.
    if (date === '2026-12-29') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('10:00') && !t.includes('10:30') && !t.includes('check-in contratual');
      });

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

      autoItems = autoItems.filter((i) => !(i.title || '').toLowerCase().includes('saída de miami') && !(i.title || '').toLowerCase().includes('deslocamento: miami'));
      autoItems.push({
        id: 'auto-dep-2912',
        time: '11:30',
        title: '🚗 Saída de Miami rumo a Modern Retreat Resort (Kissimmee)',
        location: 'Kissimmee - FL',
        category: 'transport',
        notes: 'Saída às 11:30 após o check-out das 11:00. Duração estimada de 287 minutos (~4h47m), com chegada estimada às 16:17.',
        sourceType: 'transport',
        completed: false,
      });

      autoItems = autoItems.filter((i) => !(i.title || '').toLowerCase().includes('quarto disponível'));
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

    // 30/12 (SeaWorld): E = 08:00, P = 15 min, D = ~28 min -> Turnstiles 07:30, Parking 07:15, Departure 06:47, Wake up 06:17.
    if (date === '2026-12-30') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('07:00') && !t.includes('07:07') && !t.includes('07:15') && !t.includes('07:30') && !t.includes('08:30');
      });

      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('início do dia') && !t.includes('saída da acomodação') && !t.includes('catracas') && !t.includes('abertura oficial') && !t.includes('término das atividades') && !t.includes('carro') && !t.includes('retorno');
      });

      autoItems.push(
        { id: 'wake-3012', time: '06:17', title: '☀️ Início do dia na acomodação (Modern Retreat Resort)', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Despertar e preparativos (exatamente 30 min antes da saída).', sourceType: 'accommodation', completed: false },
        { id: 'dep-3012', time: '06:47', title: '🚗 Saída da acomodação ➔ SeaWorld Orlando', location: 'Modern Retreat Resort', category: 'transport', notes: 'Saída calculada (E 08:00 - 30m - 28m D - 15m P).', sourceType: 'transport', completed: false },
        { id: 'park-3012', time: '07:15', title: '🚗 Chegada no Estacionamento (SeaWorld Orlando)', location: 'SeaWorld Orlando', category: 'transport', notes: 'Chegada ao estacionamento (15 min até as catracas).', sourceType: 'park', completed: false },
        { id: 'gate-3012', time: '07:30', title: '🎟️ Chegada na Entrada de SeaWorld Orlando (Catracas)', location: 'SeaWorld Orlando', category: 'park', notes: 'Chegada às catracas 30 min antes da abertura (08:00).', sourceType: 'park', completed: false },
        { id: 'open-3012', time: '08:00', title: '🌟 Abertura Oficial de SeaWorld Orlando', location: 'SeaWorld Orlando', category: 'park', notes: 'Horário oficial de abertura cadastrado (08:00).', sourceType: 'park', completed: false },
        { id: 'close-3012', time: '22:00', title: '🌙 Término das atividades em SeaWorld Orlando e Saída', location: 'SeaWorld Orlando', category: 'park', notes: 'Fechamento do parque às 22:00.', sourceType: 'park', completed: false },
        { id: 'car-3012', time: '22:15', title: '🚗 Chegada ao Carro no Estacionamento', location: 'SeaWorld Orlando', category: 'transport', notes: 'Caminhada até o veículo no estacionamento (15 min).', sourceType: 'transport', completed: false },
        { id: 'ret-3012', time: '22:20', title: '🚗 Início do trajeto de retorno', location: 'SeaWorld Orlando', category: 'transport', notes: 'Embarque e início da viagem de carro de volta.', sourceType: 'transport', completed: false },
        { id: 'arr-3012', time: '22:48', title: '🌙 Fim do dia na acomodação (Modern Retreat Resort)', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Chegada à acomodação e descanso.', sourceType: 'accommodation', completed: false }
      );
    }

    // 31/12 (Busch Gardens): Keep NYE celebration at 23:59 and post-midnight return pending.
    if (date === '2026-12-31') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('22:30') && !t.includes('fim do dia na acomodação') && !t.includes('abertura às 10:00');
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

    // 01/01 (Animal Kingdom): Single return start at 21:25 + 36 min = 22:01 arrival. Remove Early Entry.
    if (date === '2027-01-01') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('22:30') && !t.includes('early entry') && !t.includes('entrada antecipada');
      });
      let foundReturnStart = false;
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('início do trajeto de retorno') && i.time === '21:25') {
          if (foundReturnStart) return false;
          foundReturnStart = true;
        }
        return true;
      });
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('fim do dia na acomodação') || t.includes('chegada na acomodação')) {
          return { ...i, time: '22:01', notes: 'Chegada à acomodação após 36 min de trajeto de retorno (21:25 + 36 min).' };
        }
        return i;
      });
    }

    // 08/01 (IoA / Hard Rock): Formula applied correctly with Hard Rock stop.
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
        if (t.includes('fim do dia na acomodação') || t.includes('chegada na acomodação')) {
          return { ...i, time: '21:40', notes: 'Chegada ao Hard Rock Hotel após o fechamento do parque (~10 min de percurso a pé/transporte a partir de IoA).' };
        }
        return i;
      });
    }

    // 09/01 (USF): Checkout 11:00, return end 21:30 + 42 min = 22:12.
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
          return { ...i, time: '22:12', notes: 'Chegada ao final do dia (21:30 + 42 min de trajeto).' };
        }
        return i;
      });
    }

    // 10/01: Checkout 10:00, departure 10:45, car return 11:48 (63 min duration).
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

  console.log('\n--- PERSISTING UPDATED SCHEDULES IDEMPOTENTLY ---');

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

  console.log('\n--- DUAL VALIDATION (A. FIELD PARITY & B. SEMANTIC CHRONOLOGY) ---');

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
        const matchTime = j.time === d.time;
        const matchTitle = j.title === d.title;
        const matchLoc = (j.location || null) === (d.location || null);
        const matchCat = (j.category || 'other') === (d.category || 'other');
        const matchNotes = (j.notes || null) === (d.notes || null);
        const matchSourceType = (j.sourceType || null) === (d.source_type || null);
        const matchSourceId = (j.sourceId || null) === (d.source_id || null);
        const matchCompleted = Boolean(j.completed) === Boolean(d.completed);

        if (!matchTime || !matchTitle || !matchLoc || !matchCat || !matchNotes || !matchSourceType || !matchSourceId || !matchCompleted) {
          fieldParityPassed = false;
          validationReport.push(`[Day ${targetDay.dayNumber}] ❌ Field diff at index ${i}: JSON(${j.time} - ${j.title}) vs DB(${d.time} - ${d.title})`);
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
  console.log(`(B) Semantic Chronology Validation: ${semanticChronologyPassed ? 'PASSED (Strict Order & Rules)' : 'FAILED'}`);

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
