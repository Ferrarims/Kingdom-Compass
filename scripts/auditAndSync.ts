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

async function main() {
  console.log('=== STARTING SCHEDULE AUDIT & RECONCILIATION ===');

  // 1. Fetch Trip
  const { data: tripRows, error: tripErr } = await supabase.from('trips').select('*');
  if (tripErr || !tripRows || tripRows.length === 0) {
    console.error('Failed to load trip:', tripErr);
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

  // Attach park bookings to days
  days.forEach((day) => {
    const pb = parkBookings.find((p) => p.dayNumber === day.dayNumber || (day.date && p.date === day.date));
    if (pb) {
      day.parkBooking = pb;
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

  // 3. Process and sync schedule for each day
  const updatedDays: any[] = [];
  const allHourlyDbRows: any[] = [];

  for (const day of days) {
    const syncedItems = syncAllEventsToHourlySchedule(day, tripContext);
    const dedupedItems = deduplicateHourlySchedule(syncedItems);

    day.hourlySchedule = dedupedItems;

    // Map to DB row
    const dayDbRow = mapItineraryDayToDb(day, tripId);
    updatedDays.push(dayDbRow);

    // Map hourly schedule items
    dedupedItems.forEach((item, index) => {
      const hourlyDbRow = mapHourlyScheduleToDb(item, dayDbRow.id, tripId, index);
      allHourlyDbRows.push(hourlyDbRow);
    });
  }

  // 4. Persist to Supabase
  console.log('Persisting updated itinerary_days to Supabase...');
  for (const dRow of updatedDays) {
    const { error: dErr } = await supabase.from('itinerary_days').upsert(dRow, { onConflict: 'id' });
    if (dErr) console.error(`Error upserting day ${dRow.day_number}:`, dErr.message);
  }

  console.log(`Persisting ${allHourlyDbRows.length} hourly_schedules rows to Supabase...`);
  // First clear existing hourly schedules for this trip to ensure clean 1-to-1 parity
  const { error: delErr } = await supabase.from('hourly_schedules').delete().eq('trip_id', tripId);
  if (delErr) {
    console.error('Error clearing old hourly_schedules:', delErr.message);
  }

  // Insert in batches of 50
  for (let i = 0; i < allHourlyDbRows.length; i += 50) {
    const batch = allHourlyDbRows.slice(i, i + 50);
    const { error: hErr } = await supabase.from('hourly_schedules').insert(batch);
    if (hErr) console.error(`Error inserting hourly_schedules batch ${i}:`, hErr.message);
  }

  console.log('=== AUDIT RESULTS FOR TARGET DAYS ===');

  const targetDates = ['2026-12-27', '2026-12-30', '2026-12-31', '2027-01-08', '2027-01-09'];
  for (const targetDate of targetDates) {
    const targetDay = days.find((d) => d.date === targetDate);
    if (!targetDay) {
      console.log(`Target date ${targetDate} not found!`);
      continue;
    }

    const { data: dbDay } = await supabase.from('itinerary_days').select('*').eq('id', targetDay.id).single();
    const { data: dbRows } = await supabase.from('hourly_schedules').select('*').eq('itinerary_day_id', targetDay.id).order('time');

    const jsonItems = dbDay?.hourly_schedule || [];
    console.log(`\n--- Date: ${targetDate} (Day ${targetDay.dayNumber}: ${targetDay.title}) ---`);
    console.log(`JSON items count: ${jsonItems.length}`);
    console.log(`DB rows count:   ${dbRows?.length}`);
    console.log('Matches 1-to-1:', jsonItems.length === dbRows?.length ? 'YES' : 'NO');

    console.log('Items schedule:');
    dbRows?.forEach((r, idx) => {
      console.log(`  [${idx + 1}] ${r.time} - ${r.title} | ${r.notes || ''}`);
    });
  }

  console.log('\n=== RECONCILIATION COMPLETE ===');
}

main().catch(console.error);
