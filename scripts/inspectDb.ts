import { supabase } from '../src/services/supabaseClient.js';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function inspect() {
  console.log('Inspecting Supabase tables for trip:', TARGET_TRIP_ID);

  const tables = ['trips', 'accommodations', 'flight_segments', 'car_rentals', 'park_day_bookings', 'itinerary_days', 'hourly_schedules'];
  
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').eq('trip_id', TARGET_TRIP_ID);
    if (error) {
      console.error(`Error querying table ${t}:`, error.message);
    } else {
      console.log(`Table ${t}: found ${data?.length || 0} rows`);
      if (data && data.length > 0 && t === 'flight_segments') {
        console.log('Flight segments sample:', JSON.stringify(data[0], null, 2));
      }
      if (data && data.length > 0 && t === 'park_day_bookings') {
        console.log('Park day bookings sample:', JSON.stringify(data[0], null, 2));
      }
    }
  }
}

inspect().catch(console.error);
