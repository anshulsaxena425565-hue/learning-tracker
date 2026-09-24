import{useEffect,useState}from'react';
export default function ToastHost(){
 const[items,setItems]=useState([]);
 useEffect(()=>{const on=e=>{const d=e.detail||{};const id=Date.now()+Math.random();setItems(x=>[...x,{id,message:String(d.message||''),type:d.type||'success',title:d.title||''}].slice(-4));window.setTimeout(()=>setItems(x=>x.filter(t=>t.id!==id)),4200)};window.addEventListener('learning:toast',on);return()=>window.removeEventListener('learning:toast',on)},[]);
 return <div className="toast-stack" aria-live="polite">{items.map(t=><div className={'toast toast-'+t.type} key={t.id}><div className="toast-icon">{t.type==='success'?'✓':t.type==='error'?'!':t.type==='warning'?'!':'i'}</div><div className="toast-copy">{t.title&&<b>{t.title}</b>}<span>{t.message}</span></div><button aria-label="Dismiss" onClick={()=>setItems(x=>x.filter(i=>i.id!==t.id))}>×</button></div>)}</div>
}
