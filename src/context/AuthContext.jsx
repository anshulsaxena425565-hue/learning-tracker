import{createContext,useContext,useEffect,useState}from'react';import{supabase}from'../lib/supabase';
const C=createContext(null);
export function AuthProvider({children}){const[user,setUser]=useState(null),[loading,setLoading]=useState(true),[passwordRecovery,setPasswordRecovery]=useState(false);
useEffect(()=>{supabase.auth.getSession().then(({data})=>setUser(data.session?.user||null)).finally(()=>setLoading(false));const{data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true);if(event==='SIGNED_OUT')setPasswordRecovery(false);setUser(session?.user||null)});return()=>subscription.unsubscribe()},[]);
async function resetPassword(email){const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error}
async function updatePassword(password){const{error}=await supabase.auth.updateUser({password});if(error)throw error}
return <C.Provider value={{user,loading,passwordRecovery,resetPassword,updatePassword}}>{children}</C.Provider>}
export const useAuth=()=>useContext(C);