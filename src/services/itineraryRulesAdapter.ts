import { supabase } from './supabaseClient';
import { generateDeterministicUUID } from '../utils/uuid';
import { resolveNight, shiftDate, toInstant } from '../utils/itineraryRules';
import { assertHourlyMetadata, stableJson } from '../utils/itineraryMetadata';
import type {
  Snapshot, Plan, Issue, RulesStore, Job, ExistingItem, Role, Place, Clock, Route, Policy,
} from '../utils/itineraryRules';

type Row = Record<string, any>;
type Binding = { jobId: string; role: Role };
export type LogisticsConfig = {
  destinationTimeZone?: string;
  airportTimeZones?: Record<string, string>;
  policy?: Partial<Policy>;
  home?: Place;
  routes?: Record<string, Route>;
  airportProcessingMinutes?: Record<string, number | undefined>;
  rentals?: Record<string, { pickupMinutes?: number; returnMinutes?: number }>;
  transfers?: Record<string, { departureTime?: string }>;
  parks?: Record<string, {
    mode?: 'car' | 'walk' | 'boat' | 'bus';
    eligibleEarly?: boolean; availableEarly?: boolean;
    detourStayId?: string;
    parkingToGateMinutes?: number; gateToParkingMinutes?: number;
    checkoutTime?: string; luggageConfirmed?: boolean;
    returnEndUnknown?: boolean; latestActivityEnd?: Clock; morningProvisional?: boolean;
  }>;
  activityEnds?: Record<string, Clock>;
  legacyBindings?: Record<string, Binding>;
  manualIds?: string[];
  luggagePlanConfirmed?: boolean;
};
export type RawRulesData = {
  trip: Row; accommodations: Row[]; flights: Row[]; cars: Row[];
  parks: Row[]; days: Row[]; hourly: Row[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HH = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const norm = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
const date = (v: unknown): string => {
  const s=String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Data sem formato YYYY-MM-DD: '+s);
  if (new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s) throw new Error('Data inválida: '+s);
  return s;
};
const time = (v: unknown): string => {
  const s=String(v ?? '').trim();
  if (!HH.test(s)) throw new Error('Horário ausente/inválido: '+s);
  return s;
};
const list = (v: unknown): Row[] => {
  if (!Array.isArray(v)) throw new Error('Esperada lista JSON válida.');
  return v;
};
const place = (r: Row): Place => ({id:r.id,name:r.name,address:r.address || undefined});
const tzForAirport = (code: string, config: LogisticsConfig): string => {
  const registry: Record<string,string> = {
    GRU:'America/Sao_Paulo',SFB:'America/New_York',MCO:'America/New_York',
    MIA:'America/New_York',PUJ:'America/Santo_Domingo',
  };
  const zone=config.airportTimeZones?.[code] || registry[code];
  if (!zone) throw new Error('Cadastrar fuso IANA do aeroporto '+code+'.');
  new Intl.DateTimeFormat('en',{timeZone:zone}).format();
  return zone;
};
export const routeKey = (mode: string, from: string, to: string) => [mode,from,to].join('|');
const getRoute = (config: LogisticsConfig, mode: string, from: string, to: string): Route => {
  const key=routeKey(mode,from,to);
  const r=config.routes?.[key];
  if (!r) return {description:'Trajeto pendente: '+key,estimated:true};
  if (r.minutes!==undefined && (!Number.isInteger(r.minutes)||r.minutes<0)) {
    throw new Error('Duração inválida para '+key);
  }
  if (!r.description?.trim()) throw new Error('Informar a origem da duração em '+key);
  return r;
};
function comparable(item: Row, relational=false): string {
  let cat = item.category || 'other';
  if (cat === 'airbnb') cat = 'hotel';
  // Use explicit field names for both relational (snake_case) and JSON (camelCase)
  const st = relational ? (item.source_type || item.sourceType) : (item.sourceType || item.source_type);
  const si = relational ? (item.source_id || item.sourceId) : (item.sourceId || item.source_id);
  
  return JSON.stringify([
    item.id,
    item.time,
    item.title,
    item.location || '',
    cat,
    !!item.completed,
    item.notes || '',
    st || '',
    si || '',
  ]);
}
function sameItems(a: Row[], b: Row[], rel=false): boolean {
  return JSON.stringify(a.map(i=>comparable(i)).sort()) ===
    JSON.stringify(b.map(i=>comparable(i,rel)).sort());
}

export function buildRulesSnapshot(raw: RawRulesData): Snapshot & { legacyOwnedIds: string[] } {
  const {trip,days,parks,cars,flights}=raw;
  if (!trip?.id) throw new Error('Viagem não encontrada.');
  const config: LogisticsConfig=trip.itinerary_rules_config || {};
  const stays: Array<Row & {id:string;name:string;checkInDate:string;checkOutDate:string}>=raw.accommodations.map(a=>({
    ...a,id:a.id,name:a.name,checkInDate:date(a.check_in_date),checkOutDate:date(a.check_out_date),
  }));
  const aliases=new Map<string,string>();
  const flightGroups=new Map<string,Row[]>();
  for (const f of flights) {
    const key=JSON.stringify([f.type,f.origin_code,f.destination_code,
      f.departure_date,f.departure_time,f.arrival_date,f.arrival_time,f.flight_number]);
    flightGroups.set(key,[...(flightGroups.get(key)||[]),f]);
  }
  // Preferir a reserva já usada no roteiro para manter a identidade.
  const referenced=new Set(days.flatMap(d=>list(d.hourly_schedule || []).map(i=>i.sourceId)));
  const groups=[...flightGroups.values()].map(group=>{
    const sorted=group.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const rep=sorted.find(f=>referenced.has(f.id)) || sorted[0];
    for (const f of group) aliases.set(f.id,'flight-'+rep.id);
    return rep;
  });
  const departureClock=(f:Row):Clock=>({
    date:date(f.departure_date),time:time(f.departure_time),
    timeZone:tzForAirport(f.origin_code,config),
  });
  const arrivalClock=(f:Row):Clock=>({
    date:date(f.arrival_date),time:time(f.arrival_time),
    timeZone:tzForAirport(f.destination_code,config),
  });
  groups.sort((a,b)=>toInstant(departureClock(a))-toInstant(departureClock(b)));
  const outbound=groups.filter(f=>f.type==='outbound');
  const inbound=groups.filter(f=>f.type==='inbound');
  const zone=config.destinationTimeZone ||
    (outbound.length ? tzForAirport(outbound[outbound.length-1].destination_code,config) : '');
  if (!zone && (stays.length || parks.length)) throw new Error('Cadastrar fuso do destino.');
  const night=(d:string)=>resolveNight(stays,d,trip.selected_accommodations_per_night || {});
  const airportPlace=(code:string,name?:string):Place=>({id:'airport:'+code,name:name || code});
  const rentalPlace=(r:Row,ret=false):Place=>({
    id:'rental:'+r.id+(ret?':return':':pickup'),
    name:String(ret?r.dropoff_location:r.pickup_location),
    address:String(ret?r.dropoff_location:r.pickup_location),
  });
  const jobs: Job[]=[];
  const owner=new Map<string,Job>();
  const addOwner=(d:string,j:Job)=>{if(owner.has(d))throw new Error('Duas jornadas principais em '+d);owner.set(d,j);jobs.push(j)};
  for (const f of groups) {
    const direction=f.id===outbound[0]?.id?'outbound':f.id===inbound[0]?.id?'inbound':'internal';
    const final=direction==='outbound'?outbound[outbound.length-1]:direction==='inbound'?inbound[inbound.length-1]:f;
    jobs.push({
      id:'flight-'+f.id,sourceId:f.id,kind:'flight',direction,
      departure:departureClock(f),arrival:arrivalClock(f),journeyArrival:arrivalClock(final),
      origin:airportPlace(f.origin_code,f.origin_airport),
      destination:airportPlace(f.destination_code,f.destination_airport),
      home:direction==='outbound'?config.home:undefined,
      homeToAirport:direction==='outbound'&&config.home
        ?getRoute(config,'car',config.home.id,'airport:'+f.origin_code):undefined,
    });
  }
  for (const c of cars) jobs.push({
    id:'rental-'+c.id,sourceId:c.id,kind:'rental',
    earliestPickup:{date:date(c.pickup_date),time:time(c.pickup_time),timeZone:zone},
    returnDeadline:{date:date(c.dropoff_date),time:time(c.dropoff_time),timeZone:zone},
    pickupPlace:rentalPlace(c),returnPlace:rentalPlace(c,true),
  });
  const carOn=(d:string):Row|undefined=>{
    const found=cars.filter(c=>date(c.pickup_date)<=d && d<=date(c.dropoff_date));
    if(found.length>1)throw new Error('Mais de uma locação ativa em '+d+'; definir a usada na jornada.');
    return found[0];
  };
  for(const day of days.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)))){
    const d=date(day.date), previous=night(shiftDate(d,-1)), current=night(d);
    const pbList=parks.filter(p=>p.itinerary_day_id===day.id);
    if(pbList.length>1)throw new Error('Mais de uma reserva de parque no mesmo dia.');
    const pb=pbList[0], car=carOn(d);
    const takeoff=inbound.find(f=>date(f.departure_date)===d);
    const landing=outbound.filter(f=>date(f.arrival_date)===d).slice(-1)[0];
    if(pb){
      if(!previous||!current)throw new Error('Hospedagem da manhã/noite não resolvida em '+d);
      const cfg=config.parks?.[pb.id] || {};
      const mode=cfg.mode || (car?'car':undefined);
      if(!mode)throw new Error('Definir modo de transporte para '+pb.park_name);
      const p={id:'park:'+pb.id,name:pb.park_name};
      const detourId=cfg.detourStayId ||
        (current.id!==previous.id && current.checkInDate===d ? current.id:undefined);
      const detour=detourId?stays.find(a=>a.id===detourId):undefined;
      if(detourId&&!detour)throw new Error('Hotel intermediário inexistente: '+detourId);
      if(detour && !(detour.checkInDate<=d&&d<detour.checkOutDate)){
        throw new Error('Hotel intermediário não cobre a data '+d);
      }
      const from=detour || previous;
      const shows=list(pb.shows_and_parades || []);
      const dining=list(pb.dining_reservations || []).filter(a=>a.status!=='Cancelada');
      const fast=list(pb.fast_passes || []);
      let latest=cfg.latestActivityEnd;
      let unknown=!!cfg.returnEndUnknown;
      const activities: Row[]=[
        ...shows.map(s=>({...s,label:s.showName,source:'show'})),
        ...dining.map(s=>({...s,label:s.restaurantName,source:'dining'})),
        ...fast.map(s=>({...s,label:s.attractionName,source:'fastpass',time:String(s.timeWindow||'').split(/\s*[-–]\s*/)[0]})),
      ];
      for(const a of activities){
        if(!a.time)continue; // Sem horário agendado: não criar um horário fictício.
        const at:Clock={date:d,time:time(a.time),timeZone:zone};
        const end=config.activityEnds?.[a.id] || (a.endTime?{...at,time:time(a.endTime)}:undefined);
        if(end){
          if(toInstant(end)<toInstant(at))throw new Error('Término anterior ao início de '+a.label);
          if(!latest || toInstant(end)>toInstant(latest))latest=end;
        }else if(a.source==='show'){unknown=true;}
        jobs.push({
          id:a.source+'-'+a.id,sourceId:a.id,kind:'activity',at,title:a.label,
          place:{id:p.id,name:a.location || p.name},sourceType:a.source as 'show'|'dining'|'fastpass',
          notes:a.notes,
        });
      }
      const benefitStay=stays.some(s=>s.checkInDate<=d&&d<=s.checkOutDate&&
        /universal/.test(norm(pb.park_name))&&
        (s.amenities || []).some((a:string)=>norm(a).includes('entrada antecipada')));
      const hours=pb.park_hours || {};
      const checkout=previous.checkOutDate===d;
      const parkJob:Job={
        id:'park-'+pb.id,sourceId:pb.id,kind:'park',date:d,timeZone:zone,name:pb.park_name,
        opening:time(hours.openingTime),closing:time(hours.closingTime),
        origin:place(previous),night:place(current),mode,
        outbound:getRoute(config,mode,from.id,p.id),
        inbound:getRoute(config,mode,p.id,current.id),
        parkingToGateMinutes:cfg.parkingToGateMinutes,gateToParkingMinutes:cfg.gateToParkingMinutes,
        early:hours.earlyEntryTime?{
          time:time(hours.earlyEntryTime),eligible:cfg.eligibleEarly ?? benefitStay,
          available:cfg.availableEarly ?? true,
        }:undefined,
        latestActivityEnd:latest,returnEndUnknown:unknown,morningProvisional:cfg.morningProvisional,
        detour:detour?{stay:place(detour),fromOrigin:getRoute(config,'car',previous.id,detour.id),
          roomAvailable:{date:d,time:time(detour.check_in_time),timeZone:zone}}:undefined,
        earlyCheckout:checkout?{
          at:cfg.checkoutTime?{date:d,time:time(cfg.checkoutTime),timeZone:zone}:undefined,
          contractualLimit:{date:d,time:time(previous.check_out_time),timeZone:zone},
          luggageConfirmed:!!cfg.luggageConfirmed,
        }:undefined,
      };
      addOwner(d,parkJob);continue;
    }
    if(takeoff){
      if(!previous)throw new Error('Hospedagem de origem do voo não resolvida em '+d);
      const ap=airportPlace(takeoff.origin_code,takeoff.origin_airport);
      addOwner(d,{
        id:'airport-return-'+takeoff.id,sourceId:takeoff.id,kind:'airport-return',
        stay:place(previous),airport:ap,takeoff:departureClock(takeoff),
        checkOut:{date:previous.checkOutDate,time:time(previous.check_out_time),timeZone:zone},
        luggagePlanConfirmed:config.luggagePlanConfirmed,
        directRoute:getRoute(config,'car',previous.id,ap.id),
        rental:car?{
          id:car.id,place:rentalPlace(car,true),
          deadline:{date:date(car.dropoff_date),time:time(car.dropoff_time),timeZone:zone},
          toRental:getRoute(config,'car',previous.id,rentalPlace(car,true).id),
          serviceMinutes:config.rentals?.[car.id]?.returnMinutes,
          toTerminal:getRoute(config,'transfer',rentalPlace(car,true).id,ap.id),
        }:undefined,
      });continue;
    }
    if(current && !previous && current.checkInDate===d){
      if(!landing)throw new Error('Definir o deslocamento de chegada à hospedagem em '+d);
      const ap=airportPlace(landing.destination_code,landing.destination_airport);
      const start=car?rentalPlace(car):ap;
      addOwner(d,{
        id:'arrival-'+current.id,sourceId:current.id,kind:'arrival',landing:arrivalClock(landing),
        airport:ap,stay:place(current),
        checkIn:{date:d,time:time(current.check_in_time),timeZone:zone},
        airportProcessingMinutes:config.airportProcessingMinutes?.[landing.destination_code],
        routeToStay:getRoute(config,'car',start.id,current.id),
        rental:car?{
          id:car.id,place:rentalPlace(car),
          earliest:{date:date(car.pickup_date),time:time(car.pickup_time),timeZone:zone},
          airportToRental:getRoute(config,'transfer',ap.id,rentalPlace(car).id),
          serviceMinutes:config.rentals?.[car.id]?.pickupMinutes,
        }:undefined,
      });continue;
    }
    if(previous&&current&&previous.id!==current.id){
      addOwner(d,{
        id:'transfer-'+previous.id+'-'+current.id,sourceId:current.id,kind:'transfer',
        from:place(previous),to:place(current),
        departure:{date:d,time:config.transfers?.[current.id]?.departureTime || '',timeZone:zone},
        checkOut:{date:previous.checkOutDate,time:time(previous.check_out_time),timeZone:zone},
        checkIn:{date:current.checkInDate,time:time(current.check_in_time),timeZone:zone},
        route:getRoute(config,'car',previous.id,current.id),
      });continue;
    }
    if(current)addOwner(d,{
      id:'free-'+d,sourceId:current.id,kind:'free',date:d,timeZone:zone,stay:place(current),
      sleptPreviousNight:!!previous,
    });
  }
  for(const pb of parks)if(!days.some(d=>d.id===pb.itinerary_day_id)){
    throw new Error('Reserva de parque sem dia válido: '+pb.id);
  }

  const sourceCandidates=(j:Job):string[]=>{
    const ids=[j.sourceId];
    if(j.kind==='park')ids.push(j.origin.id,j.night.id,j.detour?.stay.id || '');
    if(j.kind==='transfer')ids.push(j.from.id,j.to.id);
    if(j.kind==='airport-return')ids.push(j.stay.id,j.rental?.id || '');
    if(j.kind==='arrival')ids.push(j.stay.id,j.rental?.id || '');
    return ids.filter(Boolean);
  };
  const infer=(e:ExistingItem):Binding|undefined=>{
    const explicit=config.legacyBindings?.[e.item.id];
    if(explicit)return explicit;
    const source=e.item.sourceType, t=norm(e.item.title);
    if(source==='manual'||config.manualIds?.includes(e.item.id))return undefined;
    if(e.binding){
      if(e.item.sourceId && aliases.has(e.item.sourceId) &&
          (source==='flight' || e.binding.jobId.startsWith('flight-'))) {
        return {jobId:aliases.get(e.item.sourceId)!,role:e.binding.role};
      }
      const j=jobs.find(j=>j.id===e.binding!.jobId);
      if(!j)return e.binding; // Fonte antiga removida: o motor pode retirar seu automático.
      if(j.kind==='park'&&j.returnEndUnknown&&['car','return','arrival','end'].includes(e.binding.role)) {
        return {jobId:'obsolete-unconfirmed-return-'+j.id,role:e.binding.role};
      }
      if ((source==='accommodation'&&j.kind==='flight') ||
          (source==='park'&&j.kind!=='park') ||
          (e.item.sourceId&&!sourceCandidates(j).includes(e.item.sourceId)&&aliases.get(e.item.sourceId)!==j.id &&
           !/^split-drive-|^transit-|^transfer-|^acc-transport-/.test(e.item.sourceId))) {
        throw new Error(`Vínculo persistido incompatível com a fonte: ${e.item.id}. sourceId: ${e.item.sourceId}, jobId: ${j.id}, aliases.get: ${aliases.get(e.item.sourceId || '')}`);
      }
      return e.binding;
    }
    let j:Job|undefined, role:Role|undefined;
    if(source==='flight'){
      const id=aliases.get(e.item.sourceId || '');
      j=jobs.find(j=>j.id===id);
      if(t.includes('decolagem'))role='takeoff';
      else if(t.includes('pouso')||t.startsWith('chegada em'))role='land';
      else if(t.includes('sair de casa')||t.includes('saida de casa'))role='leave';
      else if(t.includes('chegada ao aeroporto'))role='airport';
      else if(t.includes('acordar'))role='wake';
    }else if(source==='car_rental'){
      const c=cars.find(c=>c.id===e.item.sourceId);
      if(c){
        if(t.includes('a partir')){j=jobs.find(j=>j.id==='rental-'+c.id);role='pickupAllowed';}
        else if(t.includes('ate')&&t.includes('devolucao')){j=jobs.find(j=>j.id==='rental-'+c.id);role='dropoffDeadline';}
        else{j=owner.get(e.date);role=t.includes('devolucao')?'dropoff':'pickup';}
      }
    }else if(['show','dining','fastpass'].includes(source || '')){
      j=jobs.find(j=>j.kind==='activity'&&j.sourceId===e.item.sourceId);role='activity';
    }else{
      // Prioridade para reserva de parque identificada e jornada da data.
      j=jobs.find(j=>j.id===aliases.get(e.item.sourceId || '')) ||
        jobs.find(j=>j.kind==='park'&&j.sourceId===e.item.sourceId) || owner.get(e.date);
      if(j){
        if(t.includes('retirada de chaves')||t.includes('pre check in'))role='precheck';
        else if(t.includes('check out'))role='checkout';
        else if(t.includes('quarto disponivel')||t.includes('check in'))role='roomReady';
        else if(t.includes('chegada ao carro'))role='car';
        else if(t.includes('inicio do trajeto de retorno')||t.startsWith('retorno '))role='return';
        else if(t.includes('chegada no estacionamento')||t.includes('chegada ao estacionamento'))role='parking';
        else if(t.includes('catraca')||t.includes('chegada na entrada'))role='gate';
        else if(t.includes('entrada antecipada')||t.includes('early entry'))role='early';
        else if(t.includes('abertura'))role='open';
        else if(t.includes('termino das atividades')||t.includes('fechamento'))role='close';
        else if(t.includes('inicio do dia')||t.includes('acordar'))role=j.kind==='park'||j.kind==='flight'?'wake':'morning';
        else if(t.includes('fim do dia'))role=j.kind==='park'?'arrival':'end';
        else if(t.startsWith('chegada a acomodacao')||t.startsWith('chegada na acomodacao'))role='arrival';
        else if(t.includes('transferencia')&&j.kind==='park'&&j.detour)role='hotelLeave';
        else if(t.startsWith('deslocamento')||t.startsWith('saida')||t.startsWith('sair do'))role='leave';
      }
    }
    if(!j||!role)throw new Error('Migração ambígua: conferir item '+e.item.id+' ('+e.item.title+').');
    if(e.item.sourceId && !sourceCandidates(j).includes(e.item.sourceId) && aliases.get(e.item.sourceId)!==j.id &&
       !/^split-drive-|^transit-|^transfer-|^acc-transport-/.test(e.item.sourceId)){
      throw new Error('Fonte incompatível na migração de '+e.item.id);
    }
    if (j.kind==='park' && j.returnEndUnknown && ['car','return','arrival','end'].includes(role)) {
      return {jobId:'obsolete-unconfirmed-return-'+j.id,role};
    }
    return {jobId:j.id,role};
  };

  const existing:ExistingItem[]=[];
  const mismatch=new Set<string>();
  for(const day of days){
    const d=date(day.date), json=list(day.hourly_schedule || []);
    const rel=raw.hourly.filter(h=>h.itinerary_day_id===day.id);
    if(!sameItems(json,rel,true))mismatch.add(d);
    const byId=new Map(json.map(i=>[i.id,i]));
    const candidates=json.map(i=>({...i}));
    for(const h of rel){
      const row={id:h.id,time:h.time,title:h.title,location:h.location || undefined,category:h.category,
        completed:h.completed,notes:h.notes || undefined,sourceType:h.source_type || undefined,
        sourceId:h.source_id || undefined};
      const jsonCopy=byId.get(row.id);
      if(jsonCopy){
        if(comparable(jsonCopy)!==comparable(row) && (row.sourceType==='manual'||!row.sourceType)){
          throw new Error('Conflito entre cópias do item manual '+row.id);
        }
        continue;
      }
      candidates.push(row);
    }
    const added=new Set<string>();
    const dayZone = zone || 'America/New_York';
    for(const item of candidates){
      if(!item.id || typeof item.title!=='string')throw new Error('Item sem ID/título no dia '+d);
      const e:ExistingItem={date:d,timeZone:item.timeZone || dayZone,binding:item.ruleBinding,
        item:{id:String(item.id),time:time(item.time),title:item.title,
          location:item.location || undefined,category:item.category || 'other',completed:!!item.completed,
          notes:item.notes || undefined,sourceType:item.sourceType || undefined,sourceId:item.sourceId || undefined}};
      if(config.manualIds?.includes(item.id))e.item.sourceType='manual';
      if(e.item.sourceType!=='manual')e.binding=infer(e);
      if(!UUID.test(e.item.id)){
        mismatch.add(d);
        e.item.id=generateDeterministicUUID('legacy-hourly',trip.id+'|'+e.item.id);
      }
      if(!item.timeZone || (!item.ruleBinding&&e.binding))mismatch.add(d);
      if(e.item.category===('airbnb' as string)){e.item.category='hotel';mismatch.add(d);}
      if(added.has(e.item.id))continue;
      added.add(e.item.id);existing.push(e);
    }
  }
  for(const h of raw.hourly)if(!days.some(d=>d.id===h.itinerary_day_id)){
    throw new Error('Linha hora a hora sem dia da mesma viagem: '+h.id);
  }
  const legacyOwnedIds=existing.filter(e=>e.binding&&e.item.sourceType!=='manual').map(e=>e.item.id);
  const collapsed:ExistingItem[]=[];
  const ownedGroups=new Map<string,ExistingItem>();
  for(const e of existing){
    if(!e.binding||e.item.sourceType==='manual'){collapsed.push(e);continue;}
    const key=e.binding.jobId+'|'+e.binding.role;
    const old=ownedGroups.get(key);
    if(old){old.item.completed=!!old.item.completed||!!e.item.completed;mismatch.add(e.date);}
    else{ownedGroups.set(key,e);collapsed.push(e);}
  }
  return {
    tripId:trip.id,sourcesComplete:true,jobs,existing:collapsed,legacyOwnedIds,
    storageMismatchDates:[...mismatch],dayTitles:Object.fromEntries(days.map(d=>[date(d.date),d.title || ''])),
    policy:config.policy || {},
  };
}

type Callbacks = {
  apply:(plan:Plan,days:Row[],trip:Row,parks:Row[])=>void;
  report:(issues:Issue[],tripId:string)=>void;
};
export class SupabaseItineraryRulesStore implements RulesStore {
  private loaded?: {raw:RawRulesData;snapshot:Snapshot & {legacyOwnedIds:string[]}};
  private verified?: RawRulesData;
  private readonly callbacks: Callbacks;
  constructor(callbacks: Callbacks) {
    if (!callbacks || typeof callbacks.apply !== 'function' ||
        typeof callbacks.report !== 'function') {
      throw new Error('O adaptador precisa de callbacks reais de aplicação e relatório.');
    }
    this.callbacks = callbacks;
  }
  private async all(table:string,tripId:string):Promise<Row[]>{
    const output:Row[]=[];
    for(let start=0;;start+=500){
      const {data,error}=await supabase.from(table).select('*').eq('trip_id',tripId)
        .order('id',{ascending:true}).range(start,start+499);
      if(error)throw new Error(table+': '+error.message);
      if(!Array.isArray(data))throw new Error('Leitura inválida de '+table);
      output.push(...data);if(data.length<500)return output;
    }
  }
  private async read(tripId:string):Promise<RawRulesData>{
    const [t,accommodations,flights,cars,parks,days,hourly]=await Promise.all([
      supabase.from('trips').select('*').eq('id',tripId).single(),
      this.all('accommodations',tripId),this.all('flight_segments',tripId),
      this.all('car_rentals',tripId),this.all('park_day_bookings',tripId),
      this.all('itinerary_days',tripId),this.all('hourly_schedules',tripId),
    ]);
    if(t.error||!t.data)throw new Error(t.error?.message || 'Viagem ausente.');
    return {trip:t.data,accommodations,flights,cars,parks,days,hourly};
  }
  async load(tripId:string):Promise<Snapshot>{
    const raw=await this.read(tripId), snapshot=buildRulesSnapshot(raw);
    this.loaded={raw,snapshot};return snapshot;
  }
  async persist(plan:Plan):Promise<void>{
    const saved=this.loaded;
    if(!saved||saved.raw.trip.id!==plan.tripId)throw new Error('Carregar antes de persistir.');
    // Verificar concorrência antes de iniciar as requisições de escrita.
    const current=await this.read(plan.tripId);
    if(stableJson(current)!==stableJson(saved.raw)) {
      throw new Error('A viagem mudou durante a reconciliação. Tente salvar novamente.');
    }
    const dayMap=new Map(current.days.map(d=>[date(d.date),d]));
    // Não criar um dia vazio no verificador, nem reutilizar day_number em várias inclusões.
    let nextNumber=Math.max(0,...current.days.map(d=>Number(d.day_number)))+1;
    for(const d of plan.changedDates.slice().sort()){
      if(dayMap.has(d))continue;
      if(d<date(current.trip.start_date)){
        throw new Error('Há evento em '+d+' antes do início da viagem; ampliar o período preservando as datas antes de reconciliar.');
      }
      const expectedNumber=Math.floor((Date.parse(d+'T12:00:00Z')-
        Date.parse(date(current.trip.start_date)+'T12:00:00Z'))/86400000)+1;
      if(current.days.some(day=>day.day_number===expectedNumber))throw new Error('Número de dia ocupado para '+d);
      const {data,error}=await supabase.from('itinerary_days').insert({
        trip_id:plan.tripId,date:d,day_number:Math.max(nextNumber,expectedNumber),
        title:plan.titles[d] || 'Continuação do roteiro',park:'Sem Parque',hourly_schedule:[],
      }).select('*').single();
      if(error||!data)throw new Error(error?.message || 'Não foi possível criar o dia '+d);
      nextNumber=Number(data.day_number)+1;dayMap.set(d,data);
    }
    const desiredIds=new Set(plan.events.map(e=>e.item.id));
    const owned=new Set(saved.snapshot.legacyOwnedIds);
    // IDs relacionais legados também precisam ser comprovadamente automáticos antes da limpeza.
    const legacyOwned=new Set(current.hourly.filter(h=>h.source_type&&h.source_type!=='manual')
      .filter(h=>saved.snapshot.legacyOwnedIds.includes(h.id)).map(h=>h.id));
    const rows=plan.events.filter(e=>plan.changedDates.includes(e.date)).map(e=>{
      if(!UUID.test(e.item.id)||!HH.test(e.item.time))throw new Error('ID/horário inválido: '+e.item.id);
      const day=dayMap.get(e.date);if(!day)throw new Error('Dia ausente: '+e.date);
      return {id:e.item.id,trip_id:plan.tripId,itinerary_day_id:day.id,time:e.item.time,
        title:e.item.title,location:e.item.location || null,category:e.item.category,
        completed:!!e.item.completed,notes:e.item.notes || null,
        source_type:e.item.sourceType || null,source_id:e.item.sourceId || null};
    });
    // Upsert ANTES de remover qualquer registro antigo.
    for(let i=0;i<rows.length;i+=200){
      const batch=rows.slice(i,i+200);
      const {data,error}=await supabase.from('hourly_schedules').upsert(batch,{onConflict:'id'}).select('id');
      if(error||data?.length!==batch.length)throw new Error(error?.message || 'Upsert incompleto.');
    }
    for(const d of plan.changedDates){
      const day=dayMap.get(d)!;
      const payload:Row={hourly_schedule:plan.events.filter(e=>e.date===d).map(e=>({
        ...e.item,timeZone:e.timeZone,ruleBinding:e.binding,
      }))};
      if(plan.titles[d]!==undefined)payload.title=plan.titles[d];
      const {data,error}=await supabase.from('itinerary_days').update(payload)
        .eq('trip_id',plan.tripId).eq('id',day.id).select('id');
      if(error||data?.length!==1)throw new Error(error?.message || 'JSON do dia não foi atualizado: '+d);
    }
    const stale=current.hourly.filter(h=>!desiredIds.has(h.id)&&(owned.has(h.id)||legacyOwned.has(h.id))).map(h=>h.id);
    for(let i=0;i<stale.length;i+=200){
      const batch=stale.slice(i,i+200);
      const {data,error}=await supabase.from('hourly_schedules').delete()
        .eq('trip_id',plan.tripId).in('id',batch).select('id');
      if(error) {
        console.error('Stale deletion error:', error);
        throw new Error(error.message);
      }
    }
    // Retirar somente um dia externo ao período que ficou sem eventos após
    // remover automáticos comprovados. Um dia com atividade/fonte/manual é preservado.
    for(const oldDay of current.days){
      const d=date(oldDay.date), oldItems=list(oldDay.hourly_schedule || []);
      const oldRows=current.hourly.filter(h=>h.itinerary_day_id===oldDay.id);
      if(d>=date(current.trip.start_date) || !plan.changedDates.includes(d) ||
         plan.events.some(e=>e.date===d) || !oldItems.length ||
         current.parks.some(p=>p.itinerary_day_id===oldDay.id) ||
         oldItems.some(i=>!i.sourceType||i.sourceType==='manual') ||
         oldRows.some(h=>!owned.has(h.id)))continue;
      for(const table of ['hourly_schedules','park_day_bookings','park_fast_passes',
          'park_dining_reservations','park_shows_reservations','park_photo_packages']){
        const {data,error}=await supabase.from(table).select('id')
          .eq('trip_id',plan.tripId).eq('itinerary_day_id',oldDay.id).limit(1);
        if(error)throw new Error('Falha ao conferir dependências do dia: '+error.message);
        if(data?.length)throw new Error('Preservado dia externo '+d+' porque possui dados vinculados em '+table);
      }
      const {data,error}=await supabase.from('itinerary_days').delete()
        .eq('trip_id',plan.tripId).eq('id',oldDay.id).select('id');
      if(error||data?.length!==1)throw new Error(error?.message || 'Dia obsoleto não retirado: '+d);
    }
    // Requisições separadas: uma falha é parcial e será exibida; isto NÃO é uma transação ACID.
  }
  async verify(plan:Plan):Promise<void>{
    const raw=await this.read(plan.tripId);
    const dates=new Set([...raw.days.map(d=>date(d.date)),...plan.events.map(e=>e.date)]);
    for(const d of dates){
      const day=raw.days.find(day=>date(day.date)===d);
      if(!day)throw new Error('Verificação: dia inexistente '+d);
      const expected=plan.events.filter(e=>e.date===d).map(e=>e.item);
      const json=list(day.hourly_schedule || []);
      const relational=raw.hourly.filter(h=>h.itinerary_day_id===day.id);
      if(!sameItems(expected,json)||!sameItems(expected,relational,true)){
        console.error('Verification failed for day:', d, {
          expected: expected.map(i=>comparable(i)),
          json: json.map(i=>comparable(i)),
          relational: relational.map(i=>comparable(i,true)),
          rawExpected: expected,
          rawJson: json,
          rawRelational: relational
        });
        throw new Error('Verificação campo a campo falhou em '+d);
      }
      for(const e of plan.events.filter(e=>e.date===d)){
        const stored=json.find(i=>i.id===e.item.id);
        if(!stored){
          throw new Error('Item não encontrado na schedule persistida: '+e.item.id);
        }
        const storedRuleBinding = stored.ruleBinding || stored.rule_binding;
        const bindingsMatch = (!storedRuleBinding && !e.binding) ||
          (storedRuleBinding && e.binding && 
           storedRuleBinding.jobId === e.binding.jobId && 
           storedRuleBinding.role === e.binding.role);
        
        if(stored?.timeZone!==e.timeZone|| !bindingsMatch){
          console.error('Metadata mismatch:', {
            itemId: e.item.id,
            storedTimeZone: stored?.timeZone,
            expectedTimeZone: e.timeZone,
            storedRuleBinding,
            expectedBinding: e.binding
          });
          throw new Error('Metadados não persistidos: '+e.item.id);
        }
      }
      if(plan.titles[d]!==undefined&&day.title!==plan.titles[d])throw new Error('Título não persistido: '+d);
    }
    this.verified=raw;
  }
  apply(plan:Plan):void{
    if(!this.verified||this.verified.trip.id!==plan.tripId)throw new Error('Aplicação sem verificação.');
    this.callbacks.apply(plan,this.verified.days,this.verified.trip,this.verified.parks);
  }
  report(issues:Issue[]):void{
    const labels=(j:Job):string=>{
      if(j.kind==='park')return j.date+' — '+j.name;
      if(j.kind==='flight')return j.departure.date+' — '+j.origin.name+' → '+j.destination.name;
      if(j.kind==='arrival')return j.checkIn.date+' — chegada a '+j.stay.name;
      if(j.kind==='transfer')return j.departure.date+' — troca para '+j.to.name;
      if(j.kind==='airport-return')return j.takeoff.date+' — ida ao aeroporto';
      if(j.kind==='free')return j.date+' — hospedagem';
      if(j.kind==='activity')return j.at.date+' — '+j.title;
      return j.earliestPickup.date+' — locadora';
    };
    const enriched=issues.map(i=>{
      const job=this.loaded?.snapshot.jobs.find(j=>j.id===i.jobId);
      return job?{...i,message:labels(job)+': '+i.message}:i;
    });
    this.callbacks.report(enriched,this.loaded?.raw.trip.id || '');
  }
}

