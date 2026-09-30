import { useEffect, useState } from 'react'
import { Coins,Lightning,ShoppingCart,ShieldCheck } from '@phosphor-icons/react'
import{useCredits}from'../context/CreditsContext';import{supabase}from'../lib/supabase';import{toast}from'../lib/toast';

export default function Credits(){
 const{credits,plans,refresh}=useCredits();
 const[paying,setPaying]=useState(null);

 const loadCashfree=()=>new Promise((resolve,reject)=>{
  if(window.Cashfree)return resolve(window.Cashfree);
  const s=document.createElement('script');
  s.src='https://sdk.cashfree.com/js/v3/cashfree.js';
  s.onload=()=>resolve(window.Cashfree);
  s.onerror=()=>reject(new Error('Unable to load Cashfree checkout.'));
  document.body.appendChild(s);
 });

 const verifyPayment=async(orderId)=>{
  const{data,error}=await supabase.functions.invoke('verify-credit-payment',{body:{cashfree_order_id:orderId}});
  if(error||!data?.ok)throw new Error(error?.message||data?.error||'Payment verification failed.');
  await refresh();
  return data;
 };

 useEffect(()=>{
  const orderId=new URLSearchParams(window.location.search).get('cashfree_order_id');
  if(!orderId)return;
  (async()=>{
   try{
    const result=await verifyPayment(orderId);
    toast('Credits added to your wallet.','success','Payment successful');
   }catch(e){
    if(!String(e?.message||'').includes('Payment was not successful'))toast(e.message||'Payment verification failed.','error','Payment issue');
   }finally{
    const url=new URL(window.location.href);
    url.searchParams.delete('cashfree_order_id');
    window.history.replaceState({},'',url.pathname+url.search+url.hash);
   }
  })();
 },[]);

 async function buy(plan){
  if(paying)return;
  const customerPhone=window.prompt('Enter your 10-digit mobile number for Cashfree checkout:');
  if(!/^\d{10}$/.test(String(customerPhone||''))){
   toast('Please enter a valid 10-digit mobile number.','error','Mobile number required');
   return;
  }
  setPaying(plan.id);
  try{
   const Cashfree=await loadCashfree();
   const{data,error}=await supabase.functions.invoke('create-credit-payment-order',{body:{plan_id:plan.id,customer_phone:String(customerPhone)}});
   if(error||!data?.ok)throw new Error(error?.message||data?.error||'Unable to start payment.');

   const cashfree=Cashfree({mode:data.environment==='production'?'production':'sandbox'});
   const result=await cashfree.checkout({paymentSessionId:data.payment_session_id});
   if(result?.error)throw new Error(result.error.message||'Cashfree checkout could not be opened.');
   if(result?.paymentDetails){
    try{
     await verifyPayment(data.order_id);
     toast('Credits added to your wallet.','success','Payment successful');
    }catch(e){
     toast(e.message||'Payment is still being confirmed.','error','Payment status');
    }
   }
  }catch(e){
   toast(e.message||'Payment could not be completed.','error','Payment issue');
  }finally{setPaying(null)}
 }

 return <div className="page credits-page">
  <header className="credits-hero">
   <div><p className="eyebrow">LEARNINGBEYOND WALLET</p><h1>Your Credits</h1><p className="muted">Use Credits across LearningBeyond. Every action shows its cost before you commit.</p></div>
   <div className="credits-balance-card"><Coins size={25} weight="fill"/><small>AVAILABLE CREDITS</small><strong>{Number(credits||0).toLocaleString()}</strong><span>credits</span></div>
  </header>
  <section className="credits-how">
   <div><Lightning size={22} weight="fill"/><b>One wallet. Every action.</b><span>Credits power creation, AI and community actions.</span></div>
   <div><ShieldCheck size={22} weight="duotone"/><b>Transparent pricing</b><span>Super Admin controls the exact action cost.</span></div>
   <div><ShoppingCart size={22} weight="duotone"/><b>Buy more anytime</b><span>Secure payments powered by Cashfree.</span></div>
  </section>
  <section>
   <div className="credits-section-head"><div><p className="eyebrow">CREDIT PACKS</p><h2>Choose your pack</h2></div><span>₹1 ≈ 1 Credit</span></div>
   <div className="credit-plan-grid">
    {plans.map((p,i)=><article className={'credit-plan '+(i===1?'featured':'')} key={p.id}>
     {i===1&&<span className="credit-plan-badge">POPULAR</span>}
     <p>{p.name}</p>
     <div className="credit-plan-amount"><strong>{Number(p.credits).toLocaleString()}</strong><span>credits</span></div>
     {Number(p.bonus_credits)>0&&<div className="credit-bonus">+{p.bonus_credits} bonus</div>}
     <div className="credit-price">₹{Number(p.price_inr).toLocaleString('en-IN')}</div>
     <button type="button" onClick={()=>buy(p)} disabled={paying===p.id||!!paying}>{paying===p.id?<><Lightning size={17} weight="fill"/> Opening checkout…</>:<><ShoppingCart size={17}/> Buy {p.credits} Credits</>}</button>
    </article>)}
   </div>
  </section>
 </div>
}