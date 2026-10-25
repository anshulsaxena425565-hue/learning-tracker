import { useEffect, useState } from 'react'
import { Lifebuoy, X, PaperPlaneTilt, EnvelopeSimple } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import './helpdesk.css'

export default function HelpDesk() {
  const { user, dataUser } = useAuth()
  const { team } = useTeam()
  const [enabled, setEnabled] = useState(true)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(user?.email || '')
  const [name, setName] = useState(user?.user_metadata?.full_name || '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  useEffect(() => { if (user?.email) setEmail(user.email); if (user?.user_metadata?.full_name) setName(user.user_metadata.full_name) }, [user?.email, user?.user_metadata?.full_name])
  useEffect(() => { let alive=true; supabase.rpc('get_helpdesk_settings').then(({data,error})=>{if(alive&&!error)setEnabled(data?.floating_enabled!==false)}); return()=>{alive=false} }, [])
  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !message.trim()) { setResult('Please enter your email and message.'); return }
    setBusy(true); setResult('')
    try {
      const { data, error } = await supabase.functions.invoke('helpdesk-submit', { body: { sender_email: email.trim(), sender_name: name.trim(), subject: subject.trim() || 'LearningBeyond Help Desk', message: message.trim(), team_name: team?.name || null } })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'Message could not be sent. Please try again.')
      setResult('Message sent! Our team will get back to you.')
      setSubject(''); setMessage('')
    } catch (err) { setResult(err?.message || 'Unable to send. Please try again later.') }
    finally { setBusy(false) }
  }
  if (!user || !enabled) return null
  return <>
    <button className="lb-help-fab" aria-label="Open Help Desk" title="Help Desk" onClick={()=>{setOpen(v=>!v);setResult('')}}><Lifebuoy size={24} weight="fill"/><span>Help desk</span></button>
    {open && <section className="lb-help-panel" role="dialog" aria-modal="false" aria-label="Contact LearningBeyond support">
      <header><div className="lb-help-heading"><span className="lb-help-mark"><Lifebuoy size={21}/></span><div><strong>Contact us</strong><small>Send a message to the LearningBeyond team</small></div></div><button type="button" className="lb-help-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={19}/></button></header>
      <form onSubmit={submit}><label>Your name<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder="Your name"/></label><label>Your email <em>Required</em><input type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required placeholder="you@example.com"/></label><label>Subject<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={160} placeholder="How can we help?"/></label><label>Message <em>Required</em><textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={6000} required rows={5} placeholder="Describe your question or issue in detail…"/></label><p className="lb-help-privacy">Your email and full message will be sent to our support team.</p>{result&&<div className={'lb-help-result '+(result.startsWith('Message sent')?'success':'error')} role="status">{result}</div>}<button className="lb-help-submit" type="submit" disabled={busy}><PaperPlaneTilt size={17}/>{busy?'Sending…':'Send message'}</button></form>
      <a className="lb-help-email" href="mailto:anshulsaxena425565@gmail.com"><EnvelopeSimple size={15}/> Or email us directly</a>
    </section>}
  </>
}
