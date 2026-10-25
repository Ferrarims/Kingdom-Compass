import { readdir,readFile } from 'node:fs/promises';
import path from 'node:path';

const banned=[
  'syncAllEventsToHourlySchedule','generateParkHourlySchedule','generateParkScheduleResult',
  'applyAccommodationMorningRule','adjustScheduleForCheckoutAndDeparture',
  'syncFlightsWithItineraryDays','syncAccommodationsWithItineraryDays','auditAndCorrectTrip',
  'reconcileItineraryDay',
];
const failures=[];
async function visit(dir){
  for(const e of await readdir(dir,{withFileTypes:true})){
    const name=path.join(dir,e.name);
    if(e.isDirectory())await visit(name);
    else if(/\.[jt]sx?$/.test(e.name)){
      const text=await readFile(name,'utf8');
      text.split(/\r?\n/).forEach((line,index)=>{
        const call=banned.find(n=>new RegExp('\\b'+n+'\\s*\\(').test(line));
        if(call)failures.push(name+':'+(index+1)+' ainda chama '+call);
      });
    }
  }
}
await visit('src/context');
await visit('src/components');
await visit('src/services');
for(const file of ['AccommodationsView','FlightsView','TransportationView','ItineraryPlanner',
 'ParkBookingModal','ParkTicketModal','GlobalSettingsModal','SwapParkDayModal']){
 const source=await readFile('src/components/'+file+'.tsx','utf8');
 if(!source.includes('useTripRulesModal'))failures.push(file+' ainda não integra o hook dos modais.');
}
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('OK: contexto/componentes sem chamadas aos geradores antigos.');
