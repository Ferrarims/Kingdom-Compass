import { SupabaseItineraryRulesStore } from './src/services/itineraryRulesAdapter.ts';

const store = new SupabaseItineraryRulesStore();
try {
  await store.load('00000000-0000-0000-0000-000000000000'); // Need a valid trip ID or at least call it
  console.log('Loaded successfully');
} catch (e) {
  console.error('Error:', e);
}
