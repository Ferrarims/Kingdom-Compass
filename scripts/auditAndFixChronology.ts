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
  console.log('=== STARTING DEEP CHRONOLOGICAL AUDIT & RECONCILIATION FOR TRIP 78bbd4b1-2857-43d0-9520-2318a3b157a3 ===');

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

  if (tripErr) { console.error('Error reading trips:', tripErr.message); process.exit(1); }
  if (accErr) { console.error('Error reading accommodations:', accErr.message); process.exit(1); }
  if (flightErr) { console.error('Error reading flight_segments:', flightErr.message); process.exit(1); }
  if (carErr) { console.error('Error reading car_rentals:', carErr.message); process.exit(1); }
  if (pbErr) { console.error('Error reading park_day_bookings:', pbErr.message); process.exit(1); }
  if (dayErr) { console.error('Error reading itinerary_days:', dayErr.message); process.exit(1); }
  if (hourlyErr) { console.error('Error reading hourly_schedules:', hourlyErr.message); process.exit(1); }

  const trip = tripRows[0];
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

  console.log('\n--- PHASE 2: APPLYING JUSTIFIED CORRECTIONS ---');

  for (const day of days) {
    let items = day.hourlySchedule ? [...day.hourlySchedule] : [];
    const date = day.date;
    const pb = pbMap.get(day.id) || pbMap.get(`day-${day.dayNumber}`);

    const manualItems = items.filter((i) => i.sourceType === 'manual');
    let autoItems = items.filter((i) => i.sourceType !== 'manual');

    if (date === '2026-12-27') {
      autoItems = autoItems.map((i) => {
        let title = i.title || '';
        let notes = i.notes || '';
        if (title.includes('MIA') || notes.includes('MIA')) {
          title = title.replace(/MIA/g, 'SFB (Orlando Sanford)');
          notes = notes.replace(/MIA/g, 'SFB (Orlando Sanford)');
        }
        if (title.includes('17:15') || notes.includes('17:15')) {
          notes = notes.replace(/17:15/g, '13:35');
        }
        if (title.includes('Deslocamento') || title.includes('Trajeto')) {
          notes = 'Trajeto estimado de Orlando Sanford (SFB) até a acomodação em Miami: duração estimada de 325 minutos (5h25m) partindo às 16:35, com chegada estimada às 22:00.';
        }
        return { ...i, title, notes };
      });
    }

    if (date === '2026-12-29') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('10:00') && !t.includes('10:30');
      });
      const hasCheckout = autoItems.some((i) => (i.title || '').toLowerCase().includes('check-out'));
      if (!hasCheckout) {
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
      } else {
        autoItems = autoItems.map((i) => (i.title || '').toLowerCase().includes('check-out') ? { ...i, time: '11:00' } : i);
      }

      const hasDep = autoItems.some((i) => (i.title || '').toLowerCase().includes('saída') || (i.title || '').toLowerCase().includes('deslocamento'));
      if (!hasDep) {
        autoItems.push({
          id: 'auto-dep-2912',
          time: '11:30',
          title: '🚗 Saída de Miami rumo a Modern Retreat Resort (Kissimmee)',
          location: 'Kissimmee - FL',
          category: 'transport',
          notes: 'Saída às 11:30 após o check-out das 11:00, com margem para chaves e bagagem. Duração estimada de 287 minutos (~4h47m).',
          sourceType: 'transport',
          completed: false,
        });
      } else {
        autoItems = autoItems.map((i) => (i.title || '').toLowerCase().includes('saída') || (i.title || '').toLowerCase().includes('deslocamento') ? { ...i, time: '11:30', notes: 'Saída às 11:30 após o check-out das 11:00. Duração estimada de 287 minutos (~4h47m).' } : i);
      }

      const hasCheckin = autoItems.some((i) => (i.title || '').toLowerCase().includes('quarto disponível') || (i.title || '').toLowerCase().includes('check-in contratual'));
      if (!hasCheckin) {
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
    }

    if (date === '2026-12-30') {
      const pHours = pb?.parkHours || { openingTime: '09:00', closingTime: '21:00' };
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('07:07') && !t.includes('07:30') && !t.includes('08:00') && !t.includes('fechamento');
      });

      autoItems.push(
        { id: 'wake-3012', time: '07:00', title: '☀️ Início do dia na acomodação (Modern Retreat Resort)', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Despertar e preparativos.', sourceType: 'accommodation', completed: false },
        { id: 'dep-3012', time: '07:15', title: '🚗 Saída da acomodação ➔ SeaWorld Orlando', location: 'Modern Retreat Resort', category: 'transport', notes: 'Deslocamento de carro rumo ao SeaWorld.', sourceType: 'transport', completed: false },
        { id: 'gate-3012', time: '08:00', title: '🎟️ Chegada na Entrada de SeaWorld Orlando (Catracas)', location: 'SeaWorld Orlando', category: 'park', notes: 'Chegada às catracas.', sourceType: 'park', completed: false },
        { id: 'open-3012', time: pHours.openingTime || '09:00', title: `🌟 Abertura Oficial de SeaWorld Orlando`, location: 'SeaWorld Orlando', category: 'park', notes: `Horário oficial de abertura (${pHours.openingTime || '09:00'}).`, sourceType: 'park', completed: false },
        { id: 'close-3012', time: pHours.closingTime || '21:00', title: `🌙 Término das atividades em SeaWorld Orlando e Saída`, location: 'SeaWorld Orlando', category: 'park', notes: `Fechamento do parque às ${pHours.closingTime || '21:00'}.`, sourceType: 'park', completed: false },
        { id: 'car-3012', time: addMinutesToTimeString(pHours.closingTime || '21:00', 15), title: '🚗 Chegada ao Carro no Estacionamento', location: 'SeaWorld Orlando', category: 'transport', notes: 'Caminhada até o veículo.', sourceType: 'transport', completed: false },
        { id: 'ret-3012', time: addMinutesToTimeString(pHours.closingTime || '21:00', 20), title: '🚗 Início do trajeto de retorno', location: 'SeaWorld Orlando', category: 'transport', notes: 'Viagem de carro de volta para a acomodação.', sourceType: 'transport', completed: false },
        { id: 'arr-3012', time: addMinutesToTimeString(pHours.closingTime || '21:00', 50), title: '🌙 Fim do dia na acomodação (Modern Retreat Resort)', location: 'Modern Retreat Resort', category: 'hotel', notes: 'Chegada à acomodação e descanso.', sourceType: 'accommodation', completed: false }
      );
    }

    if (date === '2026-12-31') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('22:30') && !t.includes('fim do dia na acomodação') && !t.includes('retorno à acomodação antes');
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

    if (date === '2027-01-01') {
      autoItems = autoItems.filter((i) => {
        const t = (i.title || '').toLowerCase();
        return !t.includes('19:25') && !t.includes('22:30');
      });
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('término das atividades') || t.includes('fechamento')) {
          return { ...i, time: '21:00', notes: 'Encerramento das atividades às 21:00.' };
        }
        if (t.includes('chegada ao carro')) {
          return { ...i, time: '21:20' };
        }
        if (t.includes('início do trajeto de retorno')) {
          return { ...i, time: '21:25' };
        }
        if (t.includes('fim do dia na acomodação')) {
          return { ...i, time: '22:01', notes: 'Chegada à acomodação após 36 min de trajeto de retorno.' };
        }
        return i;
      });
    }

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
    }

    if (date === '2027-01-09') {
      autoItems = autoItems.map((i) => {
        const t = (i.title || '').toLowerCase();
        if (t.includes('check-out') || t.includes('liberação')) {
          return {
            ...i,
            time: '11:00',
            notes: 'Horário contratual de check-out (11:00). [⚠️ Necessário coordenar guarda-volumes para as malas antes da entrada no parque].',
          };
        }
        return i;
      });
    }

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
          return { ...i, time: '11:48', notes: 'Chegada estimada à locadora em SFB após 63 min de trajeto. [Prazo máximo contratual limite: 12:00, não horário obrigatório rígido].' };
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

    if (dErr) {
      console.error(`Error upserting day ${day.dayNumber}:`, dErr.message);
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

    // Delete obsolete rows from hourly_schedules for this day
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

  console.log('\n--- PHASE 4: DUAL VALIDATION (FIELD PARITY & SEMANTIC CHRONOLOGY) ---');

  let fieldParityPassed = true;
  let semanticChronologyPassed = true;
  const validationReport: string[] = [];

  for (const targetDay of days) {
    const { data: dbDay } = await supabase.from('itinerary_days').select('*').eq('id', targetDay.id).single();
    const { data: dbRows } = await supabase.from('hourly_schedules').select('*').eq('itinerary_day_id', targetDay.id).order('time');

    const jsonItems = dbDay?.hourly_schedule || [];
    const dbItems = (dbRows || []).sort(compareScheduleItemOrder as any);

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
  console.log(`(a) Field Parity (JSON vs DB): ${fieldParityPassed ? 'PASSED (100% MATCH)' : 'FAILED'}`);
  console.log(`(b) Semantic Chronology Validation: ${semanticChronologyPassed ? 'PASSED (Strict Order)' : 'FAILED'}`);

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

main().catch(console.error);
