import { generateDeterministicUUID } from './uuid';

export type Clock = { date: string; time: string; timeZone: string; offsetMinutes?: number };
export type Place = { id: string; name: string; address?: string };
export type Route = { minutes?: number; description: string; estimated: boolean };
export type Issue = {
  jobId: string;
  code: string;
  message: string;
  level: 'pending' | 'error';
};
export type Role =
  | 'morning' | 'wake' | 'leave' | 'parking' | 'gate' | 'early' | 'open'
  | 'close' | 'car' | 'return' | 'arrival' | 'end' | 'precheck'
  | 'hotelLeave' | 'roomReady' | 'checkout' | 'airport'
  | 'pickupAllowed' | 'pickup' | 'dropoff' | 'dropoffDeadline'
  | 'takeoff' | 'land' | 'activity';
export type ScheduleItem = {
  id: string;
  time: string;
  title: string;
  location?: string;
  category: 'transport' | 'park' | 'hotel' | 'flight' | 'other' | 'dining' | 'shopping';
  completed?: boolean;
  notes?: string;
  sourceType?: string;
  sourceId?: string;
};
export type ExistingItem = {
  date: string;
  timeZone: string;
  item: ScheduleItem;
  binding?: { jobId: string; role: Role };
};
export type RuleEvent = ExistingItem & {
  binding: { jobId: string; role: Role };
  at: number;
};
export type Policy = {
  airportLeadMinutes: number;
  gateLeadMinutes: number;
  wakeLeadMinutes: number;
  boardingMinutes: number;
  precheckMinutes: number;
  normalStart: string;
  normalEnd: string;
  nearCheckoutMinutes?: number;
};
export const DEFAULT_POLICY: Policy = {
  airportLeadMinutes: 180,
  gateLeadMinutes: 30,
  wakeLeadMinutes: 30,
  boardingMinutes: 5,
  precheckMinutes: 30,
  normalStart: '07:30',
  normalEnd: '22:30',
  // Imigração, locadora e intervalo curto NÃO recebem valores inventados.
};
type BaseJob = { id: string; sourceId: string };
export type Job =
  | (BaseJob & {
      kind: 'activity'; at: Clock; title: string; place: Place;
      sourceType: 'show' | 'dining' | 'fastpass'; notes?: string;
    })
  | (BaseJob & {
      kind: 'flight'; direction: 'outbound' | 'inbound' | 'internal';
      departure: Clock; arrival: Clock; origin: Place; destination: Place;
      journeyArrival?: Clock;
      home?: Place; homeToAirport?: Route;
    })
  | (BaseJob & {
      kind: 'rental'; earliestPickup: Clock; returnDeadline: Clock;
      pickupPlace: Place; returnPlace: Place;
    })
  | (BaseJob & {
      kind: 'arrival'; landing: Clock; airport: Place; stay: Place;
      checkIn: Clock; airportProcessingMinutes?: number; routeToStay: Route;
      rental?: {
        id: string; place: Place; earliest: Clock;
        airportToRental: Route; serviceMinutes?: number;
      };
    })
  | (BaseJob & {
      kind: 'airport-return'; stay: Place; airport: Place;
      checkOut: Clock; takeoff: Clock; directRoute?: Route;
      luggagePlanConfirmed?: boolean;
      rental?: {
        id: string; place: Place; deadline: Clock;
        toRental: Route; serviceMinutes?: number; toTerminal: Route;
      };
    })
  | (BaseJob & {
      kind: 'transfer'; from: Place; to: Place;
      departure: Clock; checkOut: Clock; checkIn: Clock; route: Route;
    })
  | (BaseJob & {
      kind: 'free'; date: string; timeZone: string; stay: Place;
      sleptPreviousNight: boolean;
    })
  | (BaseJob & {
      kind: 'park'; date: string; timeZone: string; name: string;
      opening: string; closing: string; origin: Place; night: Place;
      mode: 'car' | 'walk' | 'boat' | 'bus';
      outbound: Route; inbound: Route;
      parkingToGateMinutes?: number; gateToParkingMinutes?: number;
      early?: { time: string; eligible: boolean; available: boolean };
      latestActivityEnd?: Clock; returnEndUnknown?: boolean;
      morningProvisional?: boolean;
      detour?: { stay: Place; fromOrigin: Route; roomAvailable?: Clock };
      earlyCheckout?: { at?: Clock; contractualLimit: Clock; luggageConfirmed: boolean };
    });

export type Snapshot = {
  tripId: string;
  sourcesComplete: boolean;
  jobs: Job[];
  existing: ExistingItem[];
  storageMismatchDates: string[];
  dayTitles: Record<string, string>;
  policy?: Partial<Policy>;
};
export type Plan = {
  tripId: string;
  events: ExistingItem[];
  titles: Record<string, string>;
  issues: Issue[];
  changedDates: string[];
  complete: boolean;
};
export type StayNight = {
  id: string; name: string; checkInDate: string; checkOutDate: string;
};

const MIN = 60_000;
const ROLES: Role[] = [
  'morning','wake','leave','parking','gate','early','open','close','car',
  'return','arrival','end','precheck','hotelLeave','roomReady','checkout',
  'airport','pickupAllowed','pickup','dropoff','dropoffDeadline','takeoff','land','activity',
];
const AUTO_SOURCES = new Set(['park','flight','transport','accommodation','car_rental','show','dining','fastpass']);
const ACCESS: Record<string, number> = {
  'seaworld orlando': 15, 'seaworld': 15,
  'busch gardens tampa bay': 20, 'busch gardens': 20,
  'disneys animal kingdom': 20, 'animal kingdom': 20,
  'disneys hollywood studios': 20, 'hollywood studios': 20,
  'magic kingdom': 45,
  'universals epic universe': 15, 'epic universe': 15,
  'universals islands of adventure': 25, 'islands of adventure': 25,
  'universal studios florida': 25,
};
const normalize = (s: string) => s.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '')
  .replace(/\s+/g, ' ').trim();
const location = (p: Place) => p.address || p.name;

function minuteValue(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error('Defina ' + label + ' em minutos inteiros, inclusive zero se aplicável.');
  }
  return value;
}
function routeMinutes(r: Route | undefined, label: string): number {
  return minuteValue(r?.minutes, label);
}
function routeNote(r: Route): string {
  return (r.estimated ? 'Estimativa: ' : 'Duração informada: ') +
    r.minutes + ' min. Fonte: ' + r.description + '.';
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  if (!zone) throw new Error('Fuso IANA ausente.');
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatters.set(zone, f);
  }
  return f;
}
export function clockAt(at: number, timeZone: string): Clock {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(at))) parts[p.type] = p.value;
  return {
    date: parts.year + '-' + parts.month + '-' + parts.day,
    time: parts.hour + ':' + parts.minute,
    timeZone,
  };
}
export function toInstant(c: Clock): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !/^\d{2}:\d{2}$/.test(c.time)) {
    throw new Error('Data/horário inválido: ' + c.date + ' ' + c.time);
  }
  const [y,m,d] = c.date.split('-').map(Number);
  const [h,n] = c.time.split(':').map(Number);
  const local = Date.UTC(y,m-1,d,h,n);
  if (h > 23 || n > 59 || new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10) !== c.date) {
    throw new Error('Data/horário inválido.');
  }
  if (c.offsetMinutes !== undefined) {
    if (!Number.isInteger(c.offsetMinutes) || Math.abs(c.offsetMinutes) > 840) {
      throw new Error('Deslocamento UTC inválido.');
    }
    const instant = local - c.offsetMinutes * MIN;
    const back = clockAt(instant,c.timeZone);
    if (back.date !== c.date || back.time !== c.time) throw new Error('Offset não corresponde ao fuso/data.');
    return instant;
  }
  let guess = local;
  for (let i = 0; i < 6; i++) {
    const p = clockAt(guess, c.timeZone);
    const [py,pm,pd] = p.date.split('-').map(Number);
    const [ph,pn] = p.time.split(':').map(Number);
    const delta = local - Date.UTC(py,pm-1,pd,ph,pn);
    if (delta === 0) {
      for (const offset of [-120,-60,-30,30,60,120]) {
        const other = clockAt(guess + offset * MIN, c.timeZone);
        if (other.date === c.date && other.time === c.time) {
          throw new Error('Horário ambíguo por mudança de fuso; fornecer offsetMinutes no adaptador.');
        }
      }
      return guess;
    }
    guess += delta;
  }
  throw new Error('Horário inexistente na mudança de fuso.');
}
export function shiftDate(date: string, days: number): string {
  const [y,m,d] = date.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
export function resolveNight<T extends StayNight>(
  stays: T[], date: string, selections: Record<string,string>,
): T | undefined {
  const covering = stays.filter(s => s.checkInDate <= date && date < s.checkOutDate);
  if (covering.length === 0) return undefined;
  const selected = covering.find(s => s.id === selections[date]);
  if (selected) return selected;
  if (covering.length === 1) return covering[0];
  throw new Error('Escolha de pernoite pendente em ' + date + '.');
}
export function ruleId(tripId: string, jobId: string, role: Role): string {
  return generateDeterministicUUID('itinerary-rules-v1', tripId + '|' + jobId + '|' + role);
}
function signature(e: ExistingItem): string {
  const i = e.item;
  return JSON.stringify([
    e.date,e.timeZone,i.id,i.time,i.title,i.location || '',
    i.category === ('airbnb' as string) ? 'hotel' : i.category,
    !!i.completed,i.notes || '',i.sourceType || '',i.sourceId || '',
  ]);
}
const ROLE_ORDER: Partial<Record<Role,number>> = {
  wake:0,morning:0,checkout:10,pickupAllowed:15,pickup:20,precheck:20,
  leave:30,hotelLeave:30,parking:40,gate:50,early:60,open:70,activity:80,
  close:90,car:100,return:110,dropoff:120,dropoffDeadline:125,
  airport:130,takeoff:140,land:150,arrival:160,roomReady:170,end:180,
};
function byDate(a: ExistingItem, b: ExistingItem): number {
  return a.date.localeCompare(b.date) || a.item.time.localeCompare(b.item.time) ||
    (ROLE_ORDER[a.binding?.role as Role] ?? 85) - (ROLE_ORDER[b.binding?.role as Role] ?? 85) ||
    a.item.id.localeCompare(b.item.id);
}

/**
 * Jobs são adaptados de fontes completas. As durações nunca são extraídas
 * automaticamente de texto livre. Um binding vincula item legado a fonte/função.
 */
export function evaluateItineraryRules(
  snapshot: Snapshot, customPolicy: Partial<Policy> = {},
): Plan {
  if (!snapshot.sourcesComplete) throw new Error('Leitura incompleta: reconciliação bloqueada.');
  const policy = { ...DEFAULT_POLICY, ...customPolicy, ...snapshot.policy };
  for (const [key,value] of Object.entries({
    airportLeadMinutes: policy.airportLeadMinutes, gateLeadMinutes: policy.gateLeadMinutes,
    wakeLeadMinutes: policy.wakeLeadMinutes, boardingMinutes: policy.boardingMinutes,
    precheckMinutes: policy.precheckMinutes,
  })) minuteValue(value, key);
  const issues: Issue[] = [];
  const output: ExistingItem[] = [];
  const titles: Record<string,string> = {};
  const generated = new Set<string>();
  const blocked = new Set<string>();
  const jobIds = new Set(snapshot.jobs.map(j => j.id));
  if (jobIds.size !== snapshot.jobs.length) throw new Error('Jobs com IDs duplicados.');
  const owned = new Map<string, ExistingItem[]>();
  const canonical = new Map<string,{jobId:string;role:Role}>();
  for (const j of snapshot.jobs) for (const role of ROLES) {
    canonical.set(ruleId(snapshot.tripId,j.id,role), {jobId:j.id,role});
  }
  const identify = (e: ExistingItem) => e.binding || canonical.get(e.item.id);
  for (const e of snapshot.existing) {
    if (e.item.sourceType === 'manual') continue;
    const b = identify(e);
    if (b) {
      const key = b.jobId + '|' + b.role;
      owned.set(key, [...(owned.get(key) || []), e]);
    }
  }
  const issue = (jobId: string, code: string, message: string, level: Issue['level'] = 'pending') =>
    issues.push({jobId,code,message,level});
  const at = (date: string, time: string, timeZone: string) => toInstant({date,time,timeZone});
  const normalEnd = (date: string, zone: string) => at(date,policy.normalEnd,zone);
  const stage = (j: Job, roles: Role[], fn: () => void) => {
    const lengthBefore = output.length;
    const keysBefore = new Set(generated);
    try { fn(); }
    catch (error) {
      output.splice(lengthBefore);
      generated.clear();
      for (const k of keysBefore) generated.add(k);
      for (const r of roles) blocked.add(j.id + '|' + r);
      issue(j.id,'MISSING_OR_INVALID_INPUT',error instanceof Error ? error.message : String(error));
    }
  };
  const emit = (
    j: Job, role: Role, instant: number, zone: string, title: string,
    place: string, sourceType: string, notes = '', sourceId = j.sourceId,
  ) => {
    if (!Number.isFinite(instant)) throw new Error('Instante inválido em ' + role);
    const key = j.id + '|' + role;
    if (generated.has(key)) throw new Error('Função duplicada: ' + key);
    generated.add(key);
    const previous = (owned.get(key) || []).slice().sort((a,b)=>a.item.id.localeCompare(b.item.id));
    const c = clockAt(instant,zone);
    const previousUuid = previous.find(e=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.item.id));
    const id = previousUuid?.item.id || ruleId(snapshot.tripId,j.id,role);
    if (snapshot.existing.some(e=>e.item.id === id && e.item.sourceType === 'manual')) {
      throw new Error('ID de evento automático colide com atividade manual.');
    }
    const category: ScheduleItem['category'] =
      sourceType === 'flight' ? 'flight' :
      ['park','show','fastpass'].includes(sourceType) ? 'park' :
      sourceType === 'dining' ? 'dining' :
      sourceType === 'accommodation' ? 'hotel' : 'transport';
    output.push({
      date:c.date,timeZone:zone,at:instant,binding:{jobId:j.id,role},
      item:{id,time:c.time,title,location:place,category,
        completed:previous.some(e=>!!e.item.completed),notes,sourceType,sourceId},
    } as RuleEvent);
  };
  const lodgingEnd = (j: Job, date: string, zone: string, stay: Place, arrival: number, requiredEnd = arrival) => {
    const end = Math.max(normalEnd(date,zone),arrival,requiredEnd);
    const c = clockAt(arrival,zone);
    const suffix = c.date !== date ? ' — jornada de ' + date : '';
    emit(j,'arrival',arrival,zone,
      (end === arrival ? 'Chegada e fim do dia — ' : 'Chegada à acomodação — ') + stay.name + suffix,
      location(stay),'accommodation','Chegada estimada: '+c.date+' às '+c.time+'. O descanso considera o maior horário entre '+policy.normalEnd+', chegada e check-in.',stay.id);
    if (end !== arrival) emit(j,'end',end,zone,'Fim do dia / descanso — ' + stay.name,
      location(stay),'accommodation','Marcador de descanso posterior à chegada.',stay.id);
  };
  const parkDates = new Set(snapshot.jobs.filter(j=>j.kind === 'park').map(j=>(j as Extract<Job,{kind:'park'}>).date));

  for (const j of snapshot.jobs) {
    if (j.kind === 'activity') stage(j,['activity'],()=>{
      emit(j,'activity',toInstant(j.at),j.at.timeZone,j.title,
        location(j.place),j.sourceType,j.notes || 'Horário da atividade cadastrada.');
    });
    if (j.kind === 'flight') {
      stage(j,['takeoff','land'],()=>{
        const departure = toInstant(j.departure), arrival = toInstant(j.arrival);
        if (arrival <= departure) throw new Error('Chegada do voo não é posterior à decolagem.');
        emit(j,'takeoff',departure,j.departure.timeZone,'Decolagem — ' + j.origin.name,
          location(j.origin),'flight','Horário da reserva; fuso do aeroporto de origem.');
        emit(j,'land',arrival,j.arrival.timeZone,'Pouso — ' + j.destination.name,
          location(j.destination),'flight','Horário da reserva; fuso do destino.');
        const finalArrival = j.journeyArrival || j.arrival;
        if (toInstant(finalArrival) < arrival) throw new Error('Chegada final da viagem antecede o segmento.');
        if (j.direction === 'outbound') {
          titles[j.departure.date] = j.departure.date === finalArrival.date ? 'Chegada' : 'Saída de casa';
          titles[finalArrival.date] = 'Chegada';
        } else if (j.direction === 'inbound') {
          titles[j.departure.date] = j.departure.date === finalArrival.date ? 'Fim da Viagem' : 'Retorno para casa';
          titles[finalArrival.date] = 'Fim da Viagem';
        }
      });
      if (j.direction === 'outbound') stage(j,['leave','airport'],()=>{
        if (!j.home) throw new Error('Informar endereço/cidade de saída de casa.');
        const terminal = toInstant(j.departure) - policy.airportLeadMinutes * MIN;
        const leave = terminal - routeMinutes(j.homeToAirport,'trajeto casa → aeroporto') * MIN;
        emit(j,'leave',leave,j.departure.timeZone,'Saída de casa → ' + j.origin.name,
          location(j.home),'transport',routeNote(j.homeToAirport!));
        emit(j,'airport',terminal,j.departure.timeZone,'Chegada ao aeroporto — ' + j.origin.name,
          location(j.origin),'transport','Antecedência de ' + policy.airportLeadMinutes + ' min.');
        const leaveDate = clockAt(leave,j.departure.timeZone).date;
        if (leaveDate !== (j.journeyArrival || j.arrival).date) titles[leaveDate] = 'Saída de casa';
      });
    }

    if (j.kind === 'rental') stage(j,['pickupAllowed','dropoffDeadline'],()=>{
      emit(j,'pickupAllowed',toInstant(j.earliestPickup),j.earliestPickup.timeZone,
        'Retirada permitida a partir deste horário',location(j.pickupPlace),'car_rental',
        'Marco contratual. A retirada planejada depende da liberação do viajante.');
      emit(j,'dropoffDeadline',toInstant(j.returnDeadline),j.returnDeadline.timeZone,
        'Prazo máximo para concluir a devolução do carro',location(j.returnPlace),'car_rental',
        'Devolver antes é permitido. Este marco não representa a chegada planejada.');
    });

    if (j.kind === 'arrival') stage(j,['pickup','leave','arrival','roomReady','end'],()=>{
      const zone = j.checkIn.timeZone;
      const ready = toInstant(j.landing) +
        minuteValue(j.airportProcessingMinutes,'desembarque/imigração/bagagens, sem incluir a locadora')*MIN;
      let leave = ready, origin = j.airport;
      if (j.rental) {
        const rentalArrival = ready + routeMinutes(j.rental.airportToRental,'aeroporto → locadora')*MIN;
        const pickup = Math.max(rentalArrival,toInstant(j.rental.earliest));
        const service = minuteValue(j.rental.serviceMinutes,'procedimentos de retirada do carro');
        emit(j,'pickup',pickup,zone,'Retirada planejada do carro',location(j.rental.place),'car_rental',
          'Depois da liberação no aeroporto e do início contratual. Procedimentos: ' + service + ' min.',j.rental.id);
        leave = pickup + service*MIN;
        origin = j.rental.place;
      }
      const arrival = leave + routeMinutes(j.routeToStay,'origem de chegada → acomodação')*MIN;
      const checkIn = Math.max(arrival,toInstant(j.checkIn));
      emit(j,'leave',leave,zone,'Deslocamento: ' + origin.name + ' → ' + j.stay.name,
        location(origin),'transport',routeNote(j.routeToStay));
      emit(j,'roomReady',checkIn,zone,'Check-in previsto — ' + j.stay.name,
        location(j.stay),'accommodation','Contratual: ' + j.checkIn.time +
        '. Chegada estimada: ' + clockAt(arrival,zone).time + '.',j.stay.id);
      lodgingEnd(j,clockAt(toInstant(j.landing),zone).date,zone,j.stay,arrival,checkIn);
    });

    if (j.kind === 'transfer') stage(j,['morning','checkout','leave','roomReady','arrival','end'],()=>{
      const leave = toInstant(j.departure), zone = j.departure.timeZone;
      const arrival = leave + routeMinutes(j.route,'acomodação anterior → nova acomodação')*MIN;
      const checkOut = Math.min(toInstant(j.checkOut),leave);
      const checkIn = Math.max(toInstant(j.checkIn),arrival);
      const morning = Math.min(at(j.departure.date,policy.normalStart,zone),checkOut-policy.wakeLeadMinutes*MIN);
      emit(j,'morning',morning,zone,'Início do dia — ' + j.from.name,location(j.from),'accommodation','',j.from.id);
      emit(j,'checkout',checkOut,zone,'Check-out — ' + j.from.name,location(j.from),'accommodation',
        'Limite contratual: ' + j.checkOut.time + '.',j.from.id);
      emit(j,'leave',leave,zone,'Deslocamento: ' + j.from.name + ' → ' + j.to.name,
        location(j.from),'transport',routeNote(j.route));
      emit(j,'roomReady',checkIn,zone,'Check-in previsto — ' + j.to.name,location(j.to),'accommodation',
        'Contratual: ' + j.checkIn.time + '. Chegada estimada: ' + clockAt(arrival,zone).time + '.',j.to.id);
      lodgingEnd(j,j.departure.date,zone,j.to,arrival,checkIn);
    });

    if (j.kind === 'airport-return') stage(j,['morning','checkout','leave','dropoff','airport'],()=>{
      const target = toInstant(j.takeoff)-policy.airportLeadMinutes*MIN;
      const zone = j.checkOut.timeZone;
      let leave: number;
      let firstDrive: number;
      let returnService = 0, terminalDrive = 0;
      if (j.rental) {
        firstDrive = routeMinutes(j.rental.toRental,'acomodação → locadora');
        returnService = minuteValue(j.rental.serviceMinutes,'procedimentos de devolução');
        terminalDrive = routeMinutes(j.rental.toTerminal,'locadora → terminal');
        leave = Math.min(target-(returnService+terminalDrive)*MIN,
          toInstant(j.rental.deadline)-returnService*MIN)-firstDrive*MIN;
      } else {
        firstDrive = routeMinutes(j.directRoute,'acomodação → terminal');
        leave = target-firstDrive*MIN;
      }
      const contractual = toInstant(j.checkOut);
      const gap = (leave-contractual)/MIN;
      if (gap >= 0) {
        if (policy.nearCheckoutMinutes === undefined) {
          throw new Error('Definir o intervalo considerado curto entre checkout e partida.');
        } else if (gap <= minuteValue(policy.nearCheckoutMinutes,'intervalo curto de checkout')) {
          leave = contractual;
        } else if (!j.luggagePlanConfirmed) {
          issue(j.id,'LUGGAGE_PLAN','Há intervalo após checkout; definir bagagens/espera.');
        }
      }
      const checkout = Math.min(contractual,leave);
      const morning = Math.min(at(j.checkOut.date,policy.normalStart,zone),checkout-policy.wakeLeadMinutes*MIN);
      emit(j,'morning',morning,zone,'Acordar / organizar saída — ' + j.stay.name,
        location(j.stay),'accommodation','Antes do primeiro compromisso de saída.',j.stay.id);
      emit(j,'checkout',checkout,zone,'Check-out — ' + j.stay.name,location(j.stay),'accommodation',
        'Limite contratual: ' + j.checkOut.time + '.',j.stay.id);
      emit(j,'leave',leave,zone,'Saída para ' + j.airport.name,location(j.stay),'transport',
        'Planejado para chegar ao terminal pelo menos ' + policy.airportLeadMinutes + ' min antes da decolagem.');
      let terminal = leave+firstDrive*MIN;
      if (j.rental) {
        const end = terminal+returnService*MIN;
        if (end > toInstant(j.rental.deadline)) throw new Error('Devolução ultrapassa o prazo contratual.');
        emit(j,'dropoff',terminal,zone,'Devolução planejada do carro',location(j.rental.place),'car_rental',
          'Procedimentos: ' + returnService + ' min. Conclusão: ' + clockAt(end,zone).time + '.',j.rental.id);
        terminal = end+terminalDrive*MIN;
      }
      if (terminal > target) throw new Error('Chegada ao terminal não respeita as três horas.');
      emit(j,'airport',terminal,j.takeoff.timeZone,'Chegada ao terminal — ' + j.airport.name,
        location(j.airport),'transport','Antes do horário-alvo ' + clockAt(target,j.takeoff.timeZone).time + '.');
    });

    if (j.kind === 'free') {
      if (parkDates.has(j.date)) {
        issue(j.id,'FREE_PARK_CONFLICT','Dia livre e parque atribuídos à mesma data. Corrigir adaptação das fontes.','error');
        continue;
      }
      stage(j,['morning','end'],()=>{
        if (j.sleptPreviousNight) emit(j,'morning',at(j.date,policy.normalStart,j.timeZone),j.timeZone,
          'Início do dia — ' + j.stay.name,location(j.stay),'accommodation','Dia sem saída estruturada.',j.stay.id);
        emit(j,'end',normalEnd(j.date,j.timeZone),j.timeZone,'Fim do dia / descanso — ' + j.stay.name,
          location(j.stay),'accommodation','Dia livre; nenhum deslocamento de parque foi criado.',j.stay.id);
      });
    }

    if (j.kind === 'park') {
      const zone = j.timeZone;
      const opening = at(j.date,j.opening,zone);
      let entry = opening, early: number | undefined;
      if (j.early?.eligible && j.early.available) {
        const candidate = at(j.date,j.early.time,zone);
        if (candidate < opening) { entry = candidate; early = candidate; }
        else issue(j.id,'INVALID_EARLY','Early Entry não antecede a abertura; usar abertura normal.');
      }
      const gate = entry-policy.gateLeadMinutes*MIN;
      const knownAccess = ACCESS[normalize(j.name)];
      const pOut = j.mode === 'car' ? j.parkingToGateMinutes ?? knownAccess : 0;
      const pBack = j.mode === 'car' ? j.gateToParkingMinutes ?? pOut : 0;
      const provisional = j.morningProvisional ? ' Planejamento provisório após a jornada anterior.' : '';
      stage(j,['gate','early','open','roomReady'],()=>{
        emit(j,'gate',gate,zone,'Chegada às catracas — ' + j.name,j.name,'park',
          policy.gateLeadMinutes + ' min antes da entrada válida.' + provisional);
        if (early !== undefined) emit(j,'early',early,zone,'Early Entry — ' + j.name,j.name,'park',
          'Elegibilidade e disponibilidade informadas para esta data.');
        emit(j,'open',opening,zone,'Abertura normal — ' + j.name,j.name,'park','Horário cadastrado de planejamento.');
        if (j.detour?.roomAvailable) emit(j,'roomReady',toInstant(j.detour.roomAvailable),zone,
          'Quarto disponível — ' + j.detour.stay.name,location(j.detour.stay),'accommodation',
          'Informativo; não exige retorno durante o passeio.',j.detour.stay.id);
      });
      stage(j,['wake','leave','precheck','hotelLeave','parking','checkout'],()=>{
        const access = minuteValue(pOut,'acesso à entrada');
        const drive = routeMinutes(j.outbound,'ida até estacionamento/entrada');
        const parking = gate-access*MIN;
        const lastLeave = parking-drive*MIN;
        let firstLeave = lastLeave;
        if (j.detour) firstLeave -= (policy.precheckMinutes+
          routeMinutes(j.detour.fromOrigin,'origem → hotel de pré-check-in'))*MIN;
        emit(j,'wake',firstLeave-policy.wakeLeadMinutes*MIN,zone,'Acordar — ' + j.origin.name,
          location(j.origin),'accommodation','Exatamente 30 min antes da primeira saída.'+provisional,j.origin.id);
        emit(j,'leave',firstLeave,zone,'Saída de ' + j.origin.name,
          location(j.origin),'transport',j.detour ? routeNote(j.detour.fromOrigin) : routeNote(j.outbound));
        if (j.detour) {
          const service = lastLeave-policy.precheckMinutes*MIN;
          emit(j,'precheck',service,zone,'Pré-check-in / chaves — ' + j.detour.stay.name,
            location(j.detour.stay),'accommodation','Parada de ' + policy.precheckMinutes + ' min.',j.detour.stay.id);
          emit(j,'hotelLeave',lastLeave,zone,'Saída do hotel → ' + j.name,
            location(j.detour.stay),'transport',routeNote(j.outbound));
        }
        if (j.mode === 'car') emit(j,'parking',parking,zone,'Chegada ao estacionamento — ' + j.name,
          j.name,'transport','Acesso até as catracas: ' + access + ' min.');
        if (j.earlyCheckout) {
          const checkout = j.earlyCheckout.at ? toInstant(j.earlyCheckout.at) : firstLeave;
          if (checkout < firstLeave-policy.wakeLeadMinutes*MIN || checkout > firstLeave ||
              checkout > toInstant(j.earlyCheckout.contractualLimit)) {
            throw new Error('Checkout precisa ocorrer depois de acordar, antes da saída e até o limite contratual.');
          }
          emit(j,'checkout',checkout,zone,'Check-out planejado — ' + j.origin.name,location(j.origin),'accommodation',
            'Limite: '+j.earlyCheckout.contractualLimit.time+
            (j.earlyCheckout.luggageConfirmed ? '.' : '. Guarda-volumes pendente.'),j.origin.id);
          if (!j.earlyCheckout.luggageConfirmed) issue(j.id,'LUGGAGE_PLAN','Confirmar guarda-volumes antes do parque.');
        }
      });
      // Fechamento informativo, sem inventar saída ou retorno de show pendente.
      if (j.returnEndUnknown) stage(j,['close'],()=>{
        let closing = at(j.date,j.closing,zone);
        if (closing <= opening) closing = at(shiftDate(j.date,1),j.closing,zone);
        emit(j,'close',closing,zone,'Fechamento cadastrado — ' + j.name,j.name,'park',
          'Horário cadastrado de planejamento. Término do show e retorno ainda pendentes.');
      });
      stage(j,j.returnEndUnknown ? ['car','return','arrival','end'] : ['close','car','return','arrival','end'],()=>{
        let closing = at(j.date,j.closing,zone);
        if (closing <= opening) closing = at(shiftDate(j.date,1),j.closing,zone);
        if (j.returnEndUnknown) throw new Error('Término da última atividade pendente; retorno não confirmado.');
        const exit = Math.max(closing,j.latestActivityEnd ? toInstant(j.latestActivityEnd) : closing);
        const lastActivityStart = Math.max(-Infinity,...snapshot.jobs
          .filter((job): job is Extract<Job,{kind:'activity'}> =>
            job.kind==='activity' && job.place.id==='park:'+j.sourceId)
          .map(job=>toInstant(job.at)));
        if(lastActivityStart>=exit &&
            (!j.latestActivityEnd || toInstant(j.latestActivityEnd)<lastActivityStart)){
          throw new Error('Informar o término da atividade agendada no fechamento ou depois dele.');
        }
        const access = minuteValue(pBack,'acesso de volta ao transporte');
        const drive = routeMinutes(j.inbound,'volta à acomodação da noite');
        const car = exit+access*MIN;
        const board = j.mode === 'car' ? policy.boardingMinutes : 0;
        const startReturn = car+board*MIN;
        const arrival = startReturn+drive*MIN;
        emit(j,'close',exit,zone,'Término das atividades — ' + j.name,j.name,'park',
          'Depois do fechamento e das atividades com término conhecido.');
        if (j.mode === 'car') emit(j,'car',car,zone,'Chegada ao carro — ' + j.name,j.name,'transport',
          'Percurso de '+access+' min; embarque de '+board+' min antes da partida.');
        emit(j,'return',startReturn,zone,'Retorno → ' + j.night.name,j.name,'transport',
          routeNote(j.inbound)+' Destino: '+location(j.night)+'.');
        lodgingEnd(j,j.date,zone,j.night,arrival);
      });
    }
  }

  // Preservar manuais, fontes não gerenciadas e funções bloqueadas por falta de dados.
  for (const e of snapshot.existing) {
    const b = identify(e);
    if (e.item.sourceType === 'manual') { output.push(e); continue; }
    if (b) {
      if (blocked.has(b.jobId+'|'+b.role)) {
        const warning = '[PENDENTE: regra não recalculada por falta de dados] ';
        output.push({...e,item:{...e.item,notes:warning+(e.item.notes || '').replace(
          /^\[PENDENTE: regra não recalculada por falta de dados\] /,'')}});
      }
      // Outras funções gerenciadas são substituídas ou removidas se a fonte foi excluída.
      continue;
    }
    output.push(e);
    if (AUTO_SOURCES.has(e.item.sourceType || '')) {
      issue('legacy','UNBOUND_AUTOMATIC','Vincular o item automático legado '+e.item.id+
        ' à fonte e função antes de concluir a migração.','error');
    }
  }
  const ids = new Set<string>();
  for (const e of output) {
    if (ids.has(e.item.id)) issue('global','DUPLICATE_ID','ID duplicado: '+e.item.id,'error');
    ids.add(e.item.id);
  }
  output.sort(byDate);
  const dates = new Set([...snapshot.existing.map(e=>e.date),...output.map(e=>e.date),
    ...snapshot.storageMismatchDates,...Object.keys(titles)]);
  const changedDates = [...dates].filter(date=>{
    if (snapshot.storageMismatchDates.includes(date)) return true;
    if (titles[date] !== undefined && titles[date] !== snapshot.dayTitles[date]) return true;
    const old = snapshot.existing.filter(e=>e.date === date).map(signature).sort();
    const next = output.filter(e=>e.date === date).map(signature).sort();
    return JSON.stringify(old) !== JSON.stringify(next);
  }).sort();
  return {
    tripId:snapshot.tripId,events:output,titles,issues,changedDates,
    complete:issues.length === 0,
  };
}

export interface RulesStore {
  /** Ler todas as fontes e as duas representações; lançar erro em qualquer falha. */
  load(tripId: string): Promise<Snapshot>;
  /** Salvar todos os dias alterados, inclusive origem/destino da madrugada. */
  persist(plan: Plan): Promise<void>;
  /** Relê banco e exige igualdade dos campos/IDs/data no JSON e na tabela. */
  verify(plan: Plan): Promise<void>;
  /** Atualiza React com o resultado salvo, sem executar geradores antigos. */
  apply(plan: Plan): void;
  /** Exibe pendências; complete=false jamais vira mensagem de validação aprovada. */
  report(issues: Issue[]): void;
}

/**
 * Instanciar uma vez por PlannerProvider.
 * Todos os modais usam a MESMA fila; o loader não pode chamar este controlador.
 */
export function createRulesController(store: RulesStore, policy: Partial<Policy> = {}) {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(work);
    queue = task.then(()=>undefined,()=>undefined);
    return task;
  };
  const evaluateAndCorrectAllItems = async (tripId: string): Promise<Plan> => {
    const snapshot = await store.load(tripId);
    if (snapshot.tripId !== tripId) throw new Error('Loader retornou outra viagem.');
    const plan = evaluateItineraryRules(snapshot,policy);
    if (plan.issues.some(i=>i.level === 'error')) {
      store.report(plan.issues);
      throw new Error('Conflito estrutural: não foi possível salvar a reconciliação.');
    }
    if (plan.changedDates.length) await store.persist(plan);
    await store.verify(plan);
    store.apply(plan);
    store.report(plan.issues);
    return plan;
  };
  return {
    onTripLoaded: (tripId: string) => enqueue(()=>evaluateAndCorrectAllItems(tripId)),
    onModalOpen: (tripId: string) => enqueue(()=>evaluateAndCorrectAllItems(tripId)),
    onModalSave: (tripId: string, saveSource: () => Promise<void>) =>
      enqueue(async()=>{
        await saveSource(); // Deve lançar erro se o salvamento da fonte falhar.
        try { return await evaluateAndCorrectAllItems(tripId); }
        catch (error) {
          throw new Error('A fonte foi salva, mas o roteiro precisa de reconciliação: '+
            (error instanceof Error ? error.message : String(error)));
        }
      }),
    evaluateAndCorrectAllItems: (tripId: string) => enqueue(()=>evaluateAndCorrectAllItems(tripId)),
  };
}

