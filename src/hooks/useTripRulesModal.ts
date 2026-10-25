import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlanner } from '../context/PlannerContext';
import type { Plan } from '../utils/itineraryRules';

export function useTripRulesModal(isOpen: boolean, autoOpen = true) {
  const { activeTripId, onModalOpen, onModalSave, evaluateAndCorrectAllItems } = usePlanner();
  const api=useRef({activeTripId,onModalOpen,onModalSave,evaluateAndCorrectAllItems});
  api.current={activeTripId,onModalOpen,onModalSave,evaluateAndCorrectAllItems};
  const [checking,setChecking]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [sourceSaved,setSourceSaved]=useState(false);
  const savedRef=useRef(false);
  const lock=useRef(false);
  const opened=useRef<string|null>(null);
  const generation=useRef(0);
  useEffect(()=>{
    if(!isOpen){
      opened.current=null;savedRef.current=false;setSourceSaved(false);setError(null);
      return;
    }
    const id=activeTripId;
    if(!autoOpen||!id||opened.current===id)return;
    opened.current=id;
    const token=++generation.current;
    setChecking(true);setError(null);
    void api.current.onModalOpen(id).catch(e=>{
      if(token===generation.current)setError(e instanceof Error?e.message:String(e));
    }).finally(()=>{if(token===generation.current)setChecking(false)});
    return ()=>{generation.current++};
  },[isOpen,activeTripId,autoOpen]);

  const save=useCallback(async<T,>(source:()=>Promise<T>):Promise<{result:T;plan:Plan}>=>{
    if(lock.current)throw new Error('Já há um salvamento em andamento.');
    if(savedRef.current)throw new Error('O cadastro já foi salvo. Repita apenas a conferência do roteiro.');
    const {activeTripId:id,onModalSave}=api.current;
    if(!id)throw new Error('Selecione a viagem.');
    lock.current=true;setSaving(true);setError(null);
    let result:T;
    let committed=false;
    try{
      const plan=await onModalSave(id,async()=>{
        result=await source();
        if(!(result===true || (result && typeof result==='object' &&
            'success' in result && (result as {success?:boolean}).success===true))){
          throw new Error((result as {error?:string})?.error || 'Não foi possível salvar o cadastro.');
        }
        committed=true;
      });
      return {result:result!,plan};
    }catch(e){
      savedRef.current=committed;setSourceSaved(committed);
      setError(e instanceof Error?e.message:String(e));
      throw e;
    }finally{lock.current=false;setSaving(false)}
  },[]);
  const retry=useCallback(async()=>{
    const {activeTripId:id,evaluateAndCorrectAllItems}=api.current;
    if(!id)throw new Error('Selecione a viagem.');
    if(lock.current)throw new Error('Aguarde a operação atual.');
    lock.current=true;setChecking(true);setError(null);
    try{return await evaluateAndCorrectAllItems(id)}
    catch(e){setError(e instanceof Error?e.message:String(e));throw e}
    finally{lock.current=false;setChecking(false)}
  },[]);
  return {save,retry,checking,saving,error,sourceSaved};
}
