import { supabase } from './supabaseClient';
import { Snapshot, Plan, Issue, RulesStore, Job, ExistingItem, Policy, clockAt, toInstant, shiftDate } from '../utils/itineraryRules';
import { mapHourlyScheduleToDb } from './supabaseService';

export class SupabaseItineraryRulesStore implements RulesStore {
  async load(tripId: string): Promise<Snapshot> {
    try {
      const [
        tripRes,
        accRes,
        flightRes,
        carRes,
        parkRes,
        daysRes,
        hourlyRes,
      ] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
        supabase.from('accommodations').select('*').eq('trip_id', tripId),
        supabase.from('flight_segments').select('*').eq('trip_id', tripId),
        supabase.from('car_rentals').select('*').eq('trip_id', tripId),
        supabase.from('park_day_bookings').select('*').eq('trip_id', tripId),
        supabase.from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number', { ascending: true }),
        supabase.from('hourly_schedules').select('*').eq('trip_id', tripId),
      ]);

      if (tripRes.error) throw new Error(`Erro ao carregar viagem: ${tripRes.error.message}`);
      if (accRes.error) throw new Error(`Erro ao carregar acomodações: ${accRes.error.message}`);
      if (flightRes.error) throw new Error(`Erro ao carregar voos: ${flightRes.error.message}`);
      if (carRes.error) throw new Error(`Erro ao carregar carros: ${carRes.error.message}`);
      if (parkRes.error) throw new Error(`Erro ao carregar reservas de parques: ${parkRes.error.message}`);
      if (daysRes.error) throw new Error(`Erro ao carregar dias do roteiro: ${daysRes.error.message}`);
      if (hourlyRes.error) throw new Error(`Erro ao carregar cronograma hora a hora: ${hourlyRes.error.message}`);

      const trip = tripRes.data;
      if (!trip) throw new Error('Viagem não encontrada no banco de dados.');

      const accommodations = accRes.data || [];
      const flights = flightRes.data || [];
      const carRentals = carRes.data || [];
      const parkBookings = parkRes.data || [];
      const days = daysRes.data || [];
      const relationalHourly = hourlyRes.data || [];

      const timeZone = 'America/New_York';
      const dayTitles: Record<string, string> = {};
      const existing: ExistingItem[] = [];
      const storageMismatchDates: string[] = [];

      const relationalByDayId = new Map<string, any[]>();
      for (const row of relationalHourly) {
        const list = relationalByDayId.get(row.itinerary_day_id) || [];
        list.push(row);
        relationalByDayId.set(row.itinerary_day_id, list);
      }

      for (const day of days) {
        const date = day.date;
        if (!date) continue;
        dayTitles[date] = day.title || '';

        const jsonSchedule = Array.isArray(day.hourly_schedule) ? day.hourly_schedule : [];
        const relList = relationalByDayId.get(day.id) || [];

        if (jsonSchedule.length !== relList.length) {
          storageMismatchDates.push(date);
        }

        for (const item of jsonSchedule) {
          existing.push({
            date,
            timeZone: item.timeZone || timeZone,
            item: {
              id: item.id,
              time: item.time,
              title: item.title,
              location: item.location,
              category: item.category || 'other',
              completed: item.completed,
              notes: item.notes,
              sourceType: item.sourceType,
              sourceId: item.sourceId,
            },
            binding: item.ruleBinding,
          });
        }
      }

      // Build Jobs from raw data sources
      const jobs: Job[] = [];

      // 1. Flights
      for (let i = 0; i < flights.length; i++) {
        const f = flights[i];
        const isOutbound = i === 0 || f.type === 'outbound';
        const isInbound = i === flights.length - 1 || f.type === 'inbound';
        const direction = isOutbound ? 'outbound' : isInbound ? 'inbound' : 'internal';

        jobs.push({
          id: `flight-${f.id}`,
          sourceId: f.id,
          kind: 'flight',
          direction,
          departure: { date: f.departure_date, time: f.departure_time || '08:00', timeZone },
          arrival: { date: f.arrival_date, time: f.arrival_time || '11:00', timeZone },
          origin: { id: f.origin_airport || 'orig', name: f.origin_city || f.origin_airport || 'Origem' },
          destination: { id: f.destination_airport || 'dest', name: f.destination_city || f.destination_airport || 'Destino' },
          home: isOutbound ? { id: 'home', name: 'Casa' } : undefined,
          homeToAirport: isOutbound ? { minutes: 60, description: 'Trajeto padrão casa → aeroporto', estimated: true } : undefined,
        });
      }

      // 2. Car Rentals
      for (const c of carRentals) {
        jobs.push({
          id: `rental-${c.id}`,
          sourceId: c.id,
          kind: 'rental',
          earliestPickup: { date: c.pickup_date, time: c.pickup_time || '09:00', timeZone },
          returnDeadline: { date: c.dropoff_date, time: c.dropoff_time || '17:00', timeZone },
          pickupPlace: { id: c.pickup_location, name: c.pickup_location },
          returnPlace: { id: c.dropoff_location, name: c.dropoff_location },
        });
      }

      // 3. Park Bookings & Activities
      for (const pb of parkBookings) {
        const day = days.find(d => d.id === pb.itinerary_day_id);
        if (!day || !day.date) continue;
        const hours = pb.park_hours || { openingTime: '09:00', closingTime: '21:00' };

        const nightAcc = accommodations.find(a => a.checkInDate <= day.date && day.date < a.checkOutDate) || accommodations[0];
        const morningAcc = accommodations.find(a => a.checkInDate <= shiftDate(day.date, -1) && shiftDate(day.date, -1) < a.checkOutDate) || nightAcc;

        jobs.push({
          id: `park-${pb.id}`,
          sourceId: pb.id,
          kind: 'park',
          date: day.date,
          timeZone,
          name: pb.park_name,
          opening: hours.openingTime || '09:00',
          closing: hours.closingTime || '21:00',
          origin: morningAcc ? { id: morningAcc.id, name: morningAcc.name, address: morningAcc.address } : { id: 'def', name: 'Hotel' },
          night: nightAcc ? { id: nightAcc.id, name: nightAcc.name, address: nightAcc.address } : { id: 'def', name: 'Hotel' },
          mode: 'car',
          outbound: { minutes: 25, description: 'Trajeto padrão para o parque', estimated: true },
          inbound: { minutes: 25, description: 'Trajeto padrão de volta do parque', estimated: true },
          early: hours.earlyEntryTime ? { time: hours.earlyEntryTime, eligible: true, available: true } : undefined,
        });

        // Shows & Dining
        const shows = Array.isArray(pb.shows_and_parades) ? pb.shows_and_parades : [];
        for (const s of shows) {
          if (!s.time) continue;
          jobs.push({
            id: `show-${s.id}`,
            sourceId: s.id,
            kind: 'activity',
            at: { date: day.date, time: s.time, timeZone },
            title: s.showName,
            place: { id: pb.park_name, name: pb.park_name },
            sourceType: 'show',
            notes: s.notes,
          });
        }

        const dining = Array.isArray(pb.dining_reservations) ? pb.dining_reservations : [];
        for (const d of dining) {
          if (!d.reservationTime) continue;
          jobs.push({
            id: `dining-${d.id}`,
            sourceId: d.id,
            kind: 'activity',
            at: { date: day.date, time: d.reservationTime, timeZone },
            title: d.restaurantName,
            place: { id: pb.park_name, name: pb.park_name },
            sourceType: 'dining',
            notes: d.notes,
          });
        }
      }

      // 4. Accommodations / Arrivals
      for (const acc of accommodations) {
        const arrivalDay = days.find(d => d.date === acc.checkInDate);
        if (arrivalDay && flights.length > 0) {
          const matchingFlight = flights[flights.length - 1];
          jobs.push({
            id: `arrival-${acc.id}`,
            sourceId: acc.id,
            kind: 'arrival',
            landing: { date: matchingFlight.arrival_date, time: matchingFlight.arrival_time || '15:00', timeZone },
            airport: { id: matchingFlight.destination_airport || 'MCO', name: matchingFlight.destination_city || 'Aeroporto' },
            stay: { id: acc.id, name: acc.name, address: acc.address },
            checkIn: { date: acc.checkInDate, time: acc.checkInTime || '15:00', timeZone },
            airportProcessingMinutes: 45,
            routeToStay: { minutes: 30, description: 'Aeroporto → Acomodação', estimated: true },
          });
        }
      }

      return {
        tripId,
        sourcesComplete: true,
        jobs,
        existing,
        storageMismatchDates,
        dayTitles,
        policy: trip.itinerary_rules_config || {},
      };
    } catch (error: any) {
      console.error('Erro no load do adaptador de regras:', error);
      throw error;
    }
  }

  async persist(plan: Plan): Promise<void> {
    const { tripId, events, titles, changedDates } = plan;

    const { data: days, error: daysErr } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId);

    if (daysErr) throw new Error(`Falha ao ler dias para persistência: ${daysErr.message}`);

    const daysMap = new Map<string, any>();
    for (const d of days || []) {
      if (d.date) daysMap.set(d.date, d);
    }

    for (const date of changedDates) {
      let day = daysMap.get(date);
      if (!day) {
        const dayNumber = (days?.length || 0) + 1;
        const { data: newDay, error: createErr } = await supabase
          .from('itinerary_days')
          .insert({
            trip_id: tripId,
            day_number: dayNumber,
            date,
            title: titles[date] || 'Roteiro do Dia',
            park: 'Sem Parque',
            hourly_schedule: [],
          })
          .select()
          .single();

        if (createErr || !newDay) {
          throw new Error(`Falha ao criar dia de roteiro para ${date}: ${createErr?.message}`);
        }
        day = newDay;
        daysMap.set(date, day);
      }

      const dayEvents = events.filter(e => e.date === date).map(e => ({
        ...e.item,
        timeZone: e.timeZone,
        ruleBinding: e.binding,
      }));

      const updatePayload: any = {
        hourly_schedule: dayEvents,
        updated_at: new Date().toISOString(),
      };
      if (titles[date] && titles[date] !== day.title) {
        updatePayload.title = titles[date];
      }

      const { error: updateErr } = await supabase
        .from('itinerary_days')
        .update(updatePayload)
        .eq('id', day.id);

      if (updateErr) throw new Error(`Falha ao atualizar JSON do dia ${date}: ${updateErr.message}`);

      await supabase.from('hourly_schedules').delete().eq('itinerary_day_id', day.id);

      if (dayEvents.length > 0) {
        const rows = dayEvents.map((item, idx) => mapHourlyScheduleToDb(item, day.id, tripId, idx));
        const { error: relErr } = await supabase.from('hourly_schedules').upsert(rows, { onConflict: 'id' });
        if (relErr) throw new Error(`Falha ao persistir linhas em hourly_schedules para ${date}: ${relErr.message}`);
      }
    }
  }

  async verify(plan: Plan): Promise<void> {
    const { tripId, events } = plan;
    const { data: days, error } = await supabase
      .from('itinerary_days')
      .select('id, date, hourly_schedule')
      .eq('trip_id', tripId);

    if (error) throw new Error(`Falha na verificação pós-persistência: ${error.message}`);

    const daysMap = new Map<string, any>();
    for (const d of days || []) {
      if (d.date) daysMap.set(d.date, d);
    }

    for (const e of events) {
      const day = daysMap.get(e.date);
      if (!day) throw new Error(`Verificação falhou: dia ausente para data ${e.date}`);
      const jsonList = Array.isArray(day.hourly_schedule) ? day.hourly_schedule : [];
      const found = jsonList.find((item: any) => item.id === e.item.id);
      if (!found) throw new Error(`Verificação falhou: item ${e.item.id} (${e.item.title}) não encontrado no JSON da data ${e.date}`);
    }
  }

  apply(plan: Plan): void {}

  report(issues: Issue[]): void {
    if (issues.length > 0) {
      console.warn('Itinerary Rules Issues:', issues);
    }
  }
}
