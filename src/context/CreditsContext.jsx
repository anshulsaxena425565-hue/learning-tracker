import{createContext,useContext,useEffect,useState}from'react';import{useAuth}from'./AuthContext';import{supabase}from'../lib/supabase';
const C=createContext(null);
export function CreditsProvider({children}){const{user}=useAuth();const[credits,setCredits]=useState(0),[settings,setSettings]=useState({}),[plans,setPlans]=useState([]),[loading,setLoading]=useState(true);
 async function load(){if(!user){setCredits(0);setSettings({});setPlans([]);setLoading(false);return}setLoading(true);const[{data:p},{data:s},{data:pl}]=await Promise.all([supabase.from('profiles').select('credits').eq('id',user.id).maybeSingle(),supabase.from('credit_settings').select('key,label,credits'),supabase.from('credit_plans').select('*').eq('active',true).order('position')]);setCredits(Number(p?.credits||0));setSettings(Object.fromEntries((s||[]).map(x=>[x.key,x])));setPlans(pl||[]);setLoading(false)}
 useEffect(()=>{load()},[user?.id]);
 async function charge(actionKey,description,metadata){const{data,error}=await supabase.rpc('charge_credits',{p_action_key:actionKey,p_description:description||null,p_metadata:metadata||{}});if(!error&&data?.ok)setCredits(Number(data.balance||0));return{data,error}}
 function cost(key){return Number(settings[key]?.credits||0)}
 return <C.Provider value={{credits,settings,plans,loading,cost,charge,refresh:load}}>{children}</C.Provider>}
export const useCredits=()=>useContext(C);