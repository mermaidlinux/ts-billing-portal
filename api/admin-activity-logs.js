import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const billingAdminEmail = process.env.BILLING_ADMIN_EMAIL

function json(res, status, data) {
  res.status(status).json(data)
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return json(res, 405, {
        ok: false,
        error: 'Method not allowed',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json(res, 500, {
        ok: false,
        error: 'Missing Supabase environment variables',
      })
    }

    const token = getBearerToken(req)

    if (!token) {
      return json(res, 401, {
        ok: false,
        error: 'Missing authorization token',
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: userData, error: userError } =
      await userClient.auth.getUser(token)

    if (userError || !userData?.user) {
      return json(res, 401, {
        ok: false,
        error: 'Invalid session',
      })
    }

    const user = userData.user
    const userEmail = user.email || ''

    const { data: partnerProfile, error: partnerError } = await adminClient
      .from('ts_partner_profiles')
      .select('id, role, display_name, auth_user_id, status')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (partnerError) {
      return json(res, 500, {
        ok: false,
        error: partnerError.message,
      })
    }

    const isAdminEmail =
      billingAdminEmail &&
      userEmail.toLowerCase() === billingAdminEmail.toLowerCase()

    const isAdminPartner =
      partnerProfile &&
      partnerProfile.role === 'admin' &&
      partnerProfile.status === 'active'

    if (!isAdminEmail && !isAdminPartner) {
      return json(res, 403, {
        ok: false,
        error: 'Admin access required',
      })
    }

    const limitRaw = Number(req.query.limit || 50)
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50

    const activityType = req.query.activity_type || null
    const severity = req.query.severity || null
    const search = req.query.search || null

    let query = adminClient
      .from('ts_activity_timeline_view')
      .select(`
        activity_id,
        activity_key,
        created_at,
        created_at_gmt7,
        gmt7_time,
        activity_type,
        severity,
        action,
        title,
        message,
        actor_partner_id,
        actor_display_name,
        actor_role,
        target_entity_type,
        target_entity_id,
        target_partner_id,
        target_display_name,
        old_value_summary,
        new_value_summary,
        approval_status,
        broker_account_id,
        broker_name,
        broker_server,
        broker_time,
        broker_time_label,
        metadata
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (activityType && activityType !== 'ALL') {
      query = query.eq('activity_type', activityType)
    }

    if (severity && severity !== 'ALL') {
      query = query.eq('severity', severity)
    }

    if (search) {
      query = query.or(
        [
          `title.ilike.%${search}%`,
          `message.ilike.%${search}%`,
          `target_display_name.ilike.%${search}%`,
          `actor_display_name.ilike.%${search}%`,
          `action.ilike.%${search}%`,
        ].join(',')
      )
    }

    const { data: logs, error: logsError } = await query

    if (logsError) {
      return json(res, 500, {
        ok: false,
        error: logsError.message,
      })
    }

    const { data: counts, error: countsError } = await adminClient
      .from('ts_activity_logs')
      .select('activity_type, severity')

    if (countsError) {
      return json(res, 500, {
        ok: false,
        error: countsError.message,
      })
    }

    const summary = {
      total: counts?.length || 0,
      by_type: {},
      by_severity: {},
    }

    for (const row of counts || []) {
      const type = row.activity_type || 'UNKNOWN'
      const sev = row.severity || 'unknown'

      summary.by_type[type] = (summary.by_type[type] || 0) + 1
      summary.by_severity[sev] = (summary.by_severity[sev] || 0) + 1
    }

    return json(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: userEmail,
      },
      admin: {
        partner_id: partnerProfile?.id || null,
        display_name: partnerProfile?.display_name || null,
        role: partnerProfile?.role || null,
      },
      filters: {
        limit,
        activity_type: activityType || 'ALL',
        severity: severity || 'ALL',
        search: search || '',
      },
      summary,
      logs: logs || [],
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
