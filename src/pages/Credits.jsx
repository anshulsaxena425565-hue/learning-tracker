import{Coins,Lightning,ShoppingCart,ShieldCheck}from'@phosphor-icons/react';
import{useCredits}from'../context/CreditsContext';

export default function Credits(){
 const{credits,plans}=useCredits();
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
     <button type="button"><ShoppingCart size={17}/> Buy {p.credits} Credits</button>
    </article>)}
   </div>
  </section>
 </div>
}