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

    const { data: partnerProfile, error: partnerError } =
      await adminClient
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

    const limitRaw = Number(req.query.limit || 100)
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 300)
      : 100

    const status = req.query.status || 'ALL'
    const search = req.query.search || ''

    let requestQuery = adminClient
      .from('ts_setting_change_requests')
      .select('*')
      .eq('setting_scope', 'CLIENT_PS_SETTING')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status && status !== 'ALL') {
      requestQuery = requestQuery.eq('approval_status', status)
    }

    if (search) {
      requestQuery = requestQuery.or(
        [
          `request_code.ilike.%${search}%`,
          `target_display_name.ilike.%${search}%`,
          `old_value_summary.ilike.%${search}%`,
          `new_value_summary.ilike.%${search}%`,
          `note.ilike.%${search}%`,
        ].join(',')
      )
    }

    const { data: requests, error: requestsError } = await requestQuery

    if (requestsError) {
      return json(res, 500, {
        ok: false,
        error: requestsError.message,
      })
    }

    const requestIds = (requests || []).map((item) => item.id)

    let windows = []
    let boundaries = []

    if (requestIds.length > 0) {
      const { data: windowRows, error: windowError } =
        await adminClient
          .from('ts_setting_change_broker_windows')
          .select('*')
          .in('setting_change_id', requestIds)
          .order('created_at', { ascending: true })

      if (windowError) {
        return json(res, 500, {
          ok: false,
          error: windowError.message,
        })
      }

      windows = windowRows || []

      const { data: boundaryRows, error: boundaryError } =
        await adminClient
          .from('ts_ps_change_boundary_timeline_view')
          .select('*')
          .in('setting_change_id', requestIds)
          .order('created_at', { ascending: true })

      if (boundaryError) {
        return json(res, 500, {
          ok: false,
          error: boundaryError.message,
        })
      }

      boundaries = boundaryRows || []
    }

    const windowMap = {}
    const boundaryMap = {}

    for (const windowRow of windows) {
      const key = windowRow.setting_change_id
      if (!windowMap[key]) windowMap[key] = []
      windowMap[key].push(windowRow)
    }

    for (const boundary of boundaries) {
      const key = boundary.setting_change_id
      if (!boundaryMap[key]) boundaryMap[key] = []
      boundaryMap[key].push(boundary)
    }

    const enrichedRequests = (requests || []).map((request) => {
      const requestWindows = windowMap[request.id] || []
      const requestBoundaries = boundaryMap[request.id] || []

      const brokerSummary = requestWindows
        .map((item) => {
          return [
            item.broker_server || item.broker_name || 'Broker',
            item.account_number || '-',
            item.effective_from_broker || '-',
            item.applies_to_ticket_rule || '-',
          ].join(' | ')
        })
        .join('\n')

      const boundarySummary = requestBoundaries
        .map((item) => {
          return [
            item.old_boundary_summary || '-',
            item.new_boundary_summary || '-',
          ].join('\n')
        })
        .join('\n\n')

      return {
        ...request,
        broker_windows: requestWindows,
        boundary_snapshots: requestBoundaries,
        broker_summary: brokerSummary || '-',
        boundary_summary: boundarySummary || '-',
        broker_window_count_actual: requestWindows.length,
        boundary_count_actual: requestBoundaries.length,
      }
    })

    const { data: allCounts, error: countError } =
      await adminClient
        .from('ts_setting_change_requests')
        .select('approval_status')
        .eq('setting_scope', 'CLIENT_PS_SETTING')

    if (countError) {
      return json(res, 500, {
        ok: false,
        error: countError.message,
      })
    }

    const summary = {
      total: allCounts?.length || 0,
      by_status: {},
    }

    for (const item of allCounts || []) {
      const key = item.approval_status || 'unknown'
      summary.by_status[key] = (summary.by_status[key] || 0) + 1
    }

    const { data: applyLogRows, error: applyLogError } =
      await adminClient
        .from('ts_activity_timeline_view')
        .select(
          `
          activity_id,
          created_at,
          created_at_gmt7,
          gmt7_time,
          activity_type,
          severity,
          action,
          title,
          message,
          target_display_name,
          old_value_summary,
          new_value_summary,
          metadata
        `
        )
        .eq('activity_type', 'PS_REQUEST')
        .in('action', [
          'PS_DUE_REQUESTS_CRON_RUN',
          'PS_SETTING_CHANGE_APPLIED',
        ])
        .order('created_at', { ascending: false })
        .limit(20)

    if (applyLogError) {
      return json(res, 500, {
        ok: false,
        error: applyLogError.message,
      })
    }

    const applyLogs = applyLogRows || []

    const latestCronRun =
      applyLogs.find((log) => log.action === 'PS_DUE_REQUESTS_CRON_RUN') ||
      null

    const latestApplied =
      applyLogs.find((log) => log.action === 'PS_SETTING_CHANGE_APPLIED') ||
      null

    const applyStatus = {
      latest_cron_run: latestCronRun,
      latest_applied: latestApplied,
      recent_logs: applyLogs,
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
        status,
        search,
      },
      summary,
      apply_status: applyStatus,
      requests: enrichedRequests,
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
