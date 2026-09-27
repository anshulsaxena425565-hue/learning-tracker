import{useState}from'react';import{Coins,Lightning,ShoppingCart,ShieldCheck}from'@phosphor-icons/react';
import{useCredits}from'../context/CreditsContext';import{supabase}from'../lib/supabase';import{toast}from'../lib/toast';

export default function Credits(){
 const{credits,plans,refresh}=useCredits();
 const[paying,setPaying]=useState(null);
 const loadRazorpay=()=>new Promise((resolve,reject)=>{if(window.Razorpay)return resolve(true);const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=()=>resolve(true);s.onerror=()=>reject(new Error('Unable to load payment checkout.'));document.body.appendChild(s)});
 async function buy(plan){if(paying)return;setPaying(plan.id);try{await loadRazorpay();const{data,error}=await supabase.functions.invoke('create-credit-payment-order',{body:{plan_id:plan.id}});if(error||!data?.ok)throw new Error(error?.message||data?.error||'Unable to start payment.');await new Promise((resolve,reject)=>{const rz=new window.Razorpay({key:data.key_id,amount:data.amount,currency:data.currency,name:'LearningBeyond',description:data.plan_name+' · '+(Number(data.credits)+Number(data.bonus_credits||0))+' Credits',order_id:data.order_id,theme:{color:'#6d55e8'},handler:async response=>{try{const vr=await supabase.functions.invoke('verify-credit-payment',{body:{razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature}});if(vr.error||!vr.data?.ok)throw new Error(vr.error?.message||vr.data?.error||'Payment verification failed.');await refresh();toast('Credits added to your wallet.','success','Payment successful');resolve()}catch(e){reject(e)}},modal:{ondismiss:()=>reject(new Error('Payment cancelled.'))}});rz.on('payment.failed',r=>reject(new Error(r?.error?.description||'Payment failed.')));rz.open()})}catch(e){toast(e.message||'Payment could not be completed.','error','Payment issue')}finally{setPaying(null)}}
 return <div className="page credits-page">
  <header className="credits-hero">
   <div><p className="eyebrow">LEARNINGBEYOND WALLET</p><h1>Your Credits</h1><p className="muted">Use Credits across LearningBeyond. Every action shows its cost before you commit.</p></div>
   <div className="credits-balance-card"><Coins size={25} weight="fill"/><small>AVAILABLE CREDITS</small><strong>{Number(credits||0).toLocaleString()}</strong><span>credits</span></div>
  </header>
  <section className="credits-how">
   <div><Lightning size={22} weight="fill"/><b>One wallet. Every action.</b><span>Credits power creation, AI and community actions.</span></div>
   <div><ShieldCheck size={22} weight="duotone"/><b>Transparent pricing</b><span>Super Admin controls the exact action cost.</span></div>
   <div><ShoppingCart size={22} weight="duotone"/><b>Buy more anytime</b><span>Payment gateway will be connected to these plans.</span></div>
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