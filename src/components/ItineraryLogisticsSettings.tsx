import React, { useEffect, useMemo, useState } from 'react';
import { usePlanner } from '../context/PlannerContext';
import { supabase } from '../services/supabaseClient';
import { routeKey } from '../services/itineraryRulesAdapter';
import type { Clock, Route } from '../utils/itineraryRules';
import type { LogisticsConfig } from '../services/itineraryRulesAdapter';
import { useTripRulesModal } from '../hooks/useTripRulesModal';

export function ItineraryLogisticsSettings() {
  const {activeTripId,accommodations,carRentals,flights,itineraryDays,rulesIssues}=usePlanner();
  const [cfg,setCfg]=useState<LogisticsConfig>({});
  const [message,setMessage]=useState('');
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [mode,setMode]=useState('car'),[minutes,setMinutes]=useState('');
  const [source,setSource]=useState('');
  const rules=useTripRulesModal(true,false);
  const airports=useMemo(()=>[...new Set(flights.flatMap(f=>[f.originCode,f.destinationCode]).filter(Boolean))],[flights]);
  const bookings=itineraryDays.flatMap(d=>d.parkBooking?[d.parkBooking]:[]);
  const nodes=[
    {id:'home',name:'Casa'},
    ...accommodations.map(a=>({id:a.id,name:a.name})),
    ...airports.map(a=>({id:'airport:'+a,name:'Aeroporto '+a})),
    ...carRentals.flatMap(c=>[
      {id:'rental:'+c.id+':pickup',name:'Retirada — '+c.company+' ('+c.pickupLocation+')'},
      {id:'rental:'+c.id+':return',name:'Devolução — '+c.company+' ('+c.dropoffLocation+')'},
    ]),
    ...bookings.map(p=>({id:'park:'+p.id,name:p.parkName+' — '+p.date})),
  ];
  useEffect(()=>{
    let active=true;
    if(!activeTripId)return;
    void supabase.from('trips').select('itinerary_rules_config').eq('id',activeTripId).single()
      .then(({data,error})=>{
        if(!active)return;
        if(error)setMessage(error.message);
        else setCfg(data?.itinerary_rules_config || {});
      });
    return()=>{active=false};
  },[activeTripId]);
  const number=(text:string):number|undefined=>{
    if(text==='')return undefined;
    const n=Number(text);
    return Number.isInteger(n)&&n>=0?n:undefined;
  };
  const addRoute=()=>{
    try{
      if(!from||!to||minutes===''||!source.trim())throw new Error('Preencha origem, destino, minutos e fonte da estimativa.');
      const value=number(minutes);
      if(value===undefined)throw new Error('Informe minutos inteiros, a partir de zero.');
      setCfg(c=>({...c,routes:{...c.routes,[routeKey(mode,from,to)]:{
        minutes:value,description:source.trim(),estimated:true,
      }}}));setMessage('Trecho incluído nos ajustes. Salve para gravar.');
    }catch(e){setMessage(String(e))}
  };
  const save=async()=>{
    if(!activeTripId)return;
    try{
      for(const end of Object.values<Clock>(cfg.activityEnds || {})){
        if(!end.date||!end.time||!cfg.destinationTimeZone)throw new Error('Preencha data, término e fuso do destino ou remova esse ajuste.');
      }
      const {plan}=await rules.save(async()=>{
        const {data,error}=await supabase.from('trips')
          .update({itinerary_rules_config:cfg}).eq('id',activeTripId).select('id');
        if(error||data?.length!==1)throw new Error(error?.message || 'Ajustes não gravados.');
        return {success:true};
      });
      setMessage(plan.complete?'Ajustes salvos e roteiro conferido.':'Ajustes salvos. Confira as pendências abaixo.');
    }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  };
  const input=(label:string,value:number|undefined,onChange:(v:number|undefined)=>void)=>(
    <label className="grid gap-1 text-sm">{label}
      <input type="number" min="0" step="1" value={value ?? ''}
        className="rounded border p-2" onChange={e=>onChange(number(e.target.value))}/>
    </label>
  );
  return <section className="space-y-4 rounded border p-4">
    <h3 className="font-semibold">Ajustes de logística do roteiro</h3>
    <p className="text-sm">Campos vazios continuam pendentes. Zero significa que a etapa não exige tempo.</p>
    <label className="grid gap-1 text-sm">Endereço de saída de casa
      <input className="rounded border p-2" value={cfg.home?.address || ''} onChange={e=>setCfg(c=>({
        ...c,home:e.target.value?{id:'home',name:'Casa',address:e.target.value}:undefined,
      }))}/>
    </label>
    <label className="grid gap-1 text-sm">Fuso do destino
      <input className="rounded border p-2" placeholder="America/New_York"
        value={cfg.destinationTimeZone || ''} onChange={e=>setCfg(c=>({...c,destinationTimeZone:e.target.value}))}/>
    </label>
    {input('Unir checkout e partida quando o intervalo for de até (min)',cfg.policy?.nearCheckoutMinutes,
      v=>setCfg(c=>({...c,policy:{...c.policy,nearCheckoutMinutes:v}})))}
    {airports.map(a=><div key={a} className="space-y-2 rounded border p-2">
      {input('Desembarque, imigração e bagagens em '+a+' (min)',cfg.airportProcessingMinutes?.[a],
        v=>setCfg(c=>({...c,airportProcessingMinutes:{...c.airportProcessingMinutes,[a]:v}})))}
      <label className="grid gap-1 text-sm">Fuso do aeroporto {a}
        <input className="rounded border p-2" value={cfg.airportTimeZones?.[a] || ''}
          onChange={e=>setCfg(c=>({...c,airportTimeZones:{...c.airportTimeZones,[a]:e.target.value}}))}/>
      </label>
    </div>)}
    {carRentals.map(r=><div key={r.id} className="space-y-2 rounded border p-2">
      {input('Procedimentos de retirada — '+r.company,cfg.rentals?.[r.id]?.pickupMinutes,
        v=>setCfg(c=>({...c,rentals:{...c.rentals,[r.id]:{...c.rentals?.[r.id],pickupMinutes:v}}})))}
      {input('Procedimentos de devolução — '+r.company,cfg.rentals?.[r.id]?.returnMinutes,
        v=>setCfg(c=>({...c,rentals:{...c.rentals,[r.id]:{...c.rentals?.[r.id],returnMinutes:v}}})))}
    </div>)}
    {accommodations.map(a=><label key={a.id} className="grid gap-1 text-sm">
      Partida da hospedagem anterior para chegar a {a.name}, quando houver troca
      <input type="time" className="rounded border p-2" value={cfg.transfers?.[a.id]?.departureTime || ''}
        onChange={e=>setCfg(c=>({...c,transfers:{...c.transfers,[a.id]:{departureTime:e.target.value}}}))}/>
    </label>)}
    <div className="grid gap-2 rounded border p-3">
      <h4 className="font-semibold">Tempos de deslocamento</h4>
      <select value={from} onChange={e=>setFrom(e.target.value)} className="rounded border p-2">
        <option value="">Origem</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
      <select value={to} onChange={e=>setTo(e.target.value)} className="rounded border p-2">
        <option value="">Destino</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
      <select value={mode} onChange={e=>setMode(e.target.value)} className="rounded border p-2">
        <option value="car">Carro</option><option value="transfer">Transfer até a locadora/terminal</option>
        <option value="walk">Caminhada</option><option value="boat">Barco</option><option value="bus">Ônibus</option>
      </select>
      <input type="number" min="0" step="1" placeholder="Minutos" value={minutes}
        onChange={e=>setMinutes(e.target.value)} className="rounded border p-2"/>
      <input placeholder="Fonte da estimativa" value={source} onChange={e=>setSource(e.target.value)}
        className="rounded border p-2"/>
      <button type="button" onClick={addRoute} className="rounded border p-2">Adicionar ou atualizar trecho</button>
      {Object.entries<Route>(cfg.routes || {}).map(([key,r])=><div key={key} className="text-sm">
        {key.split('|').slice(1).map(id=>nodes.find(n=>n.id===id)?.name || id).join(' → ')}:
        {' '}{r.minutes ?? 'pendente'} min — {r.description}
        <button type="button" className="ml-2 underline" onClick={()=>setCfg(c=>{
          const routes={...c.routes};delete routes[key];return {...c,routes};
        })}>Remover ajuste</button>
      </div>)}
    </div>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!cfg.luggagePlanConfirmed}
      onChange={e=>setCfg(c=>({...c,luggagePlanConfirmed:e.target.checked}))}/>
      Bagagens e espera após o checkout da volta já combinadas</label>
    <p className="text-sm">Padrões: acordar 30 min antes da primeira saída; catracas 30 min antes da entrada válida; pré-check-in 30 min; descanso às 22:30 ou após a chegada, se mais tarde. Durações de rotas são estimativas e podem ser ajustadas abaixo.</p>
    {bookings.map(p=><div key={p.id} className="space-y-2 rounded border p-2">
      <p className="font-semibold">{p.parkName} — {p.date}</p>
      <label className="grid gap-1 text-sm">Transporte usado para este parque
        <select className="rounded border p-2" value={cfg.parks?.[p.id]?.mode || ''}
          onChange={e=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],mode:(e.target.value || undefined) as 'car'|'walk'|'boat'|'bus'|undefined}}}))}>
          <option value="">Usar a locação cadastrada</option><option value="car">Carro</option>
          <option value="walk">Caminhada</option><option value="boat">Barco</option><option value="bus">Ônibus</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Hotel para retirar chaves antes do parque, quando necessário
        <select className="rounded border p-2" value={cfg.parks?.[p.id]?.detourStayId || ''}
          onChange={e=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],detourStayId:e.target.value || undefined}}}))}>
          <option value="">Usar a hospedagem de chegada quando houver troca</option>
          {accommodations.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Direito à entrada antecipada nesta data
        <select className="rounded border p-2" value={cfg.parks?.[p.id]?.eligibleEarly===undefined?'':String(cfg.parks[p.id].eligibleEarly)}
          onChange={e=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],eligibleEarly:e.target.value===''?undefined:e.target.value==='true'}}}))}>
          <option value="">Usar os benefícios cadastrados</option><option value="true">Confirmado</option><option value="false">Sem direito</option>
        </select>
      </label>
      {input('Estacionamento até as catracas (min)',cfg.parks?.[p.id]?.parkingToGateMinutes,
        v=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],parkingToGateMinutes:v}}})))}
      {input('Catracas até o estacionamento na volta (min)',cfg.parks?.[p.id]?.gateToParkingMinutes,
        v=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],gateToParkingMinutes:v}}})))}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!cfg.parks?.[p.id]?.luggageConfirmed}
        onChange={e=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],luggageConfirmed:e.target.checked}}}))}/>
        Guarda-volumes combinado para o checkout antes do parque</label>
      <label className="grid gap-1 text-sm">Horário de checkout antecipado, se necessário
        <input type="time" className="rounded border p-2" value={cfg.parks?.[p.id]?.checkoutTime || ''}
          onChange={e=>setCfg(c=>({...c,parks:{...c.parks,[p.id]:{...c.parks?.[p.id],checkoutTime:e.target.value || undefined}}}))}/>
      </label>
      {(p.showsAndParades || []).map(s=><div key={s.id} className="grid gap-1 text-sm">
        Término confirmado de {s.showName}
        <input type="date" className="rounded border p-2" value={cfg.activityEnds?.[s.id]?.date || ''}
          onChange={e=>setCfg(c=>({...c,activityEnds:{...c.activityEnds,[s.id]:{
            date:e.target.value,time:c.activityEnds?.[s.id]?.time || '',timeZone:cfg.destinationTimeZone || '',
          }}}))}/>
        <input type="time" className="rounded border p-2" value={cfg.activityEnds?.[s.id]?.time || ''}
          onChange={e=>setCfg(c=>({...c,activityEnds:{...c.activityEnds,[s.id]:{
            date:c.activityEnds?.[s.id]?.date || '',time:e.target.value,timeZone:cfg.destinationTimeZone || '',
          }}}))}/>
        <button type="button" className="text-left underline" onClick={()=>setCfg(c=>{
          const activityEnds={...c.activityEnds};delete activityEnds[s.id];return {...c,activityEnds};
        })}>Término ainda não confirmado</button>
      </div>)}
    </div>)}
    <button type="button" onClick={()=>void save()} disabled={rules.saving || rules.sourceSaved}
      className="rounded bg-slate-800 p-2 text-white">Salvar ajustes e conferir roteiro</button>
    {rules.sourceSaved&&<button type="button" onClick={()=>void rules.retry().catch(e=>setMessage(String(e)))}
      className="ml-2 rounded border p-2">Repetir só a conferência</button>}
    {(message||rules.error)&&<p role="status" className="text-sm">{message||rules.error}</p>}
    {!!rulesIssues.length&&<ul className="list-disc space-y-1 pl-5 text-sm">
      {rulesIssues.map((i,n)=><li key={i.jobId+'-'+n}>{i.message}</li>)}
    </ul>}
  </section>;
}

