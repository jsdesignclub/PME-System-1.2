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

/**
 * List every auth account that does NOT yet have a public.profiles row.
 *
 * These are logins created by the "Create login" step (or, where sign-up is
 * open, self-registered accounts) that an administrator still has to turn into
 * a person: name, NIC, role, department. `auth.users` is not readable through
 * PostgREST by the browser, so this has to run with the service-role key.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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
      return json({ error: 'Only an administrator may view pending accounts' }, 403)
    }

    // Every id that already has a profile, so the pending list is the complement.
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id')
    if (profilesError) return json({ error: profilesError.message }, 400)
    const profiled = new Set((profiles ?? []).map((p) => p.id))

    // listUsers is paginated; walk every page rather than trusting the default.
    const perPage = 1000
    const pending: Array<{ id: string; email: string | null; created_at: string }> = []
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) return json({ error: error.message }, 400)

      const users = data?.users ?? []
      for (const user of users) {
        if (!profiled.has(user.id)) {
          pending.push({
            id: user.id,
            email: user.email ?? null,
            created_at: user.created_at,
          })
        }
      }

      if (users.length < perPage) break
    }

    // Newest first, matching the main directory's ordering.
    pending.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    return json({ rows: pending })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
