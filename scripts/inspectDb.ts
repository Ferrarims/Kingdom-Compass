import { supabase } from '../src/services/supabaseClient';

const TARGET_TRIP_ID = '78bbd4b1-2857-43d0-9520-2318a3b157a3';

async function inspect() {
  console.log('Deleting item: 2de82a59-4616-48e6-abeb-0ab703e09329');

  const { data, error } = await supabase.from('hourly_schedules').delete().eq('id', '2de82a59-4616-48e6-abeb-0ab703e09329');
  if (error) {
    console.error('Error deleting:', error.message);
  } else {
    console.log('Deleted successfully');
  }
}

inspect().catch(console.error);
