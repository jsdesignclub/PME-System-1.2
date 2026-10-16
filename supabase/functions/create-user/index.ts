import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Only an administrator may mint a login. The caller's JWT is verified
    // against the auth server, then their profile role is read with the service
    // client (which bypasses RLS much as the SQL guardian does) — the check is
    // on the ROLE, not merely on "is signed in".
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Missing authorization' }, 401)

    const { data: caller, error: callerError } = await supabase.auth.getUser(token)
    if (callerError || !caller?.user) return json({ error: 'Invalid or expired session' }, 401)

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.user.id)
      .single()
    if (callerProfile?.role !== 'ADMIN' || callerProfile.is_active === false) {
      return json({ error: 'Only an administrator may create a login' }, 403)
    }

    const { email, password, nic_no } = await req.json()

    if (!email || !password) {
      return json({ error: 'Missing required fields: email, password' }, 400)
    }

    // Step 1 of the two-step onboarding: create ONLY the account. The
    // public.profiles row is written by the administrator later, once they have
    // selected this account and filled in the person's details. `nic_no`, when
    // supplied, is kept as metadata so it survives the auth user even before a
    // profile exists.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: nic_no ? { nic_no } : {},
    })
    if (authError) {
      return json({ error: authError.message }, 400)
    }

    return json({ id: authData.user.id, email: authData.user.email })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
