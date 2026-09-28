import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { Coins, Lightning, ArrowRight, X, Sparkle } from '@phosphor-icons/react'

const CreditsContext=createContext(null);
export function CreditsProvider({children}){const{user,dataUser}=useAuth();const[credits,setCredits]=useState(0),[settings,setSettings]=useState({}),[plans,setPlans]=useState([]),[loading,setLoading]=useState(true),[creditAlert,setCreditAlert]=useState(null);
 async function load(){if(!user||!dataUser){setCredits(0);setSettings({});setPlans([]);setLoading(false);return}setLoading(true);const[{data:p},{data:s},{data:pl}]=await Promise.all([supabase.from('profiles').select('credits') .eq('id',dataUser.id).maybeSingle(),supabase.from('credit_settings').select('key,label,credits'),supabase.from('credit_plans').select('*').eq('active',true).order('position')]);setCredits(Number(p?.credits||0));setSettings(Object.fromEntries((s||[]).map(x=>[x.key,x])));setPlans(pl||[]);setLoading(false)}
 useEffect(()=>{load()},[user?.id,dataUser?.id]);
 async function charge(actionKey,description,metadata){const{data,error}=await supabase.rpc('charge_credits',{p_action_key:actionKey,p_description:description||null,p_metadata:metadata||{}});if(!error&&data?.ok)setCredits(Number(data.balance||0));if((!error&&!data?.ok)||error){const required=Number(data?.required||settings[actionKey]?.credits||0);const balance=Number(data?.balance??credits);setCreditAlert({required,balance,action:settings[actionKey]?.label||actionKey,error:error?.message||data?.error||'You do not have enough Credits for this task.'})}return{data,error}}
 function cost(key){return Number(settings[key]?.credits||0)}
 return <CreditsContext.Provider value={{credits,settings,plans,loading,cost,charge,refresh:load}}>{children}{creditAlert&&<div className="credits-alert-backdrop" role="dialog" aria-modal="true" aria-labelledby="credits-alert-title" onClick={()=>setCreditAlert(null)}><div className="credits-alert" onClick={e=>e.stopPropagation()}>
  <button className="credits-alert-close" aria-label="Close" onClick={()=>setCreditAlert(null)}><X size={18}/></button>
  <div className="credits-alert-glow glow-one"/><div className="credits-alert-glow glow-two"/>
  <div className="credits-alert-icon"><Coins size={30} weight="duotone"/><Sparkle className="credits-alert-spark" size={15} weight="fill"/></div>
  <span className="credits-alert-kicker">CREDITS NEEDED</span>
  <h2 id="credits-alert-title">You’ve run out of Credits</h2>
  <p>This task needs <strong>{requiredLabel(creditAlert.required)} Credits</strong>, but your wallet has <strong>{creditAlert.balance} Credits</strong>.</p>
  <div className="credits-alert-meter"><span style={{width:(creditAlert.required>0?Math.min(100,Math.round(creditAlert.balance/creditAlert.required*100)):0)+'%'}}/></div>
  <div className="credits-alert-meta"><span><Lightning size={14} weight="fill"/> {creditAlert.action}</span><b>{creditAlert.balance} / {creditAlert.required}</b></div>
  <div className="credits-alert-actions"><button className="credits-alert-primary" onClick={()=>{setCreditAlert(null);window.dispatchEvent(new CustomEvent('credits:open'))}}><Coins size={17} weight="fill"/> Buy Credits <ArrowRight size={17}/></button><button className="credits-alert-secondary" onClick={()=>setCreditAlert(null)}>Maybe later</button></div>
  <small className="credits-alert-note">Your task was not started and no Credits were charged.</small>
 </div></div>}</CreditsContext.Provider>}
function requiredLabel(v){return Number(v||0).toLocaleString()}
export const useCredits=()=>useContext(CreditsContext);