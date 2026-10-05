import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6'

const PROJECT_ID = 'learningbeyond-aa6ea'
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'))
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function json(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

async function verifyFirebase(req) {
  const header = req.headers.get('Authorization') || ''
  if (!header.startsWith('Bearer ')) throw new Error('Missing Firebase authorization token.')
  const { payload } = await jwtVerify(header.slice(7), JWKS, { issuer: ISSUER, audience: PROJECT_ID })
  if (!payload.sub || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Invalid Firebase identity.')
  }
  return payload
}

function admin() {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  const key = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new Error('Supabase server credentials are not configured.')
  return createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function findUser(client, email) {
  for (let page=1; page<=20; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find(u => (u.email || '').toLowerCase() === email)
    if (found) return found
    if (data.users.length < 1000) return null
  }
  return null
}

async function ensureWorkspace(client, userId, displayName) {
  const name = (displayName || 'Learner').trim().slice(0,120) || 'Learner'
  const { error: profileError } = await client.from('profiles').upsert({
    id: userId, display_name: name, deleted_at: null
  }, { onConflict: 'id' })
  if (profileError) throw profileError

  const { data: membership, error: membershipError } = await client
    .from('team_members').select('team_id').eq('user_id', userId).limit(1).maybeSingle()
  if (membershipError) throw membershipError
  if (membership?.team_id) return membership.team_id

  const { data: team, error: teamError } = await client.from('teams').insert({
    name: `${name}'s Team`,
    code: `LB-${crypto.randomUUID().replaceAll('-', '').slice(0,10).toUpperCase()}`,
    created_by: userId,
    visibility: 'private',
    description: 'Personal Learning Beyond workspace',
    category: 'learning',
  }).select('id').single()
  if (teamError) throw teamError

  const { error: memberError } = await client.from('team_members').insert({
    team_id: team.id, user_id: userId, role: 'owner'
  })
  if (memberError) throw memberError
  return team.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const claims = await verifyFirebase(req)
    const body = await req.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const displayName = String(body?.displayName || claims.name || '').trim()
    if (email !== String(claims.email).trim().toLowerCase()) return json({ error: 'Firebase identity mismatch.' }, 403)

    const client = admin()
    let user = await findUser(client, email)
    if (!user) {
      const created = await client.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: displayName },
      })
      if (created.error) throw created.error
      user = created.data.user
    } else if (displayName) {
      const updated = await client.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        user_metadata: { ...(user.user_metadata || {}), full_name: displayName },
      })
      if (updated.error) throw updated.error
      user = updated.data.user
    }

    const teamId = await ensureWorkspace(client, user.id, displayName)
    const link = await client.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'https://learningbeyond.online/' },
    })
    if (link.error) throw link.error
    const tokenHash = link.data?.properties?.hashed_token
    if (!tokenHash) throw new Error('Could not create the Learning Beyond data session.')

    return json({ ok: true, userId: user.id, teamId, email, tokenHash })
  } catch (error) {
    console.error('provision-firebase-account failed', error)
    return json({ error: error?.message || 'Unable to open the Learning Beyond data account.' }, 400)
  }
})
