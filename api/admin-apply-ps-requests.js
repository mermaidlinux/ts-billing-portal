import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const billingAdminEmail = process.env.BILLING_ADMIN_EMAIL
const cronSecret = process.env.CRON_SECRET

function json(res, status, data) {
  res.status(status).json(data)
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

function parseBody(req) {
  if (!req.body) return {}

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }

  return req.body
}

async function runApply(adminClient, {
  actorUserId = null,
  requestId = null,
  force = false,
  limit = 50,
  source = 'manual',
}) {
  const { data: result, error: rpcError } =
    await adminClient.rpc('ts_apply_due_ps_setting_changes', {
      p_actor_user_id: actorUserId,
      p_request_id: requestId,
      p_force: force,
      p_limit: limit,
    })

  if (rpcError) {
    throw rpcError
  }

  const appliedCount = result?.applied_count || 0
  const skippedCount = result?.skipped_count || 0

  if (source === 'cron') {
    await adminClient
      .from('ts_activity_logs')
      .insert({
        activity_key: `PS_CRON_APPLY_RUN:${new Date().toISOString()}`,
        activity_type: 'PS_REQUEST',
        severity: appliedCount > 0 ? 'success' : 'info',

        actor_display_name: 'System Cron',
        actor_role: 'system',

        target_entity_type: 'ps_request_activation_cron',
        target_display_name: 'PS Request Auto Apply',

        action: 'PS_DUE_REQUESTS_CRON_RUN',
        title: 'Cron Apply Due PS Requests',
        message:
          appliedCount > 0
            ? `${appliedCount} PS request due berhasil diterapkan otomatis.`
            : 'Cron berjalan. Tidak ada PS request due yang perlu diterapkan.',

        old_value_summary: '-',
        new_value_summary: `applied_count: ${appliedCount} | skipped_count: ${skippedCount}`,

        approval_status: 'active',
        gmt7_time: new Date().toISOString(),
        metadata: {
          source: 'admin-apply-ps-requests-cron',
          result,
        },
      })
  }

  return result
}

export default async function handler(req, res) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return json(res, 500, {
        ok: false,
        error: 'Missing Supabase environment variables',
      })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // ============================================================
    // GET = Vercel Cron
    // Cron memakai Authorization: Bearer CRON_SECRET
    // ============================================================
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization || ''

      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return json(res, 401, {
          ok: false,
          error: 'Unauthorized cron request',
        })
      }

      const result = await runApply(adminClient, {
        actorUserId: null,
        requestId: null,
        force: false,
        limit: 100,
        source: 'cron',
      })

      const appliedCount = result?.applied_count || 0

      return json(res, 200, {
        ok: true,
        result,
        message:
          appliedCount > 0
            ? `${appliedCount} PS request berhasil diterapkan otomatis.`
            : 'Cron jalan. Tidak ada PS request due.',
      })
    }

    // ============================================================
    // POST = Manual Admin Button
    // Dipakai tombol Apply Due Requests / Force Apply di UI
    // ============================================================
    if (req.method !== 'POST') {
      return json(res, 405, {
        ok: false,
        error: 'Method not allowed',
      })
    }

    if (!supabaseAnonKey) {
      return json(res, 500, {
        ok: false,
        error: 'Missing Supabase anon key',
      })
    }

    const token = getBearerToken(req)

    if (!token) {
      return json(res, 401, {
        ok: false,
        error: 'Missing authorization token',
      })
    }

    const body = parseBody(req)

    const requestId = body.requestId || null
    const force = body.force === true
    const limitRaw = Number(body.limit || 50)
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 50

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

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
        error:
          'Admin TS only. Apply PS Request masih dikunci untuk Admin TS.',
      })
    }

    if (partnerProfile?.id) {
      const { data: permission, error: permissionError } =
        await adminClient
          .from('ts_partner_permissions')
          .select('can_apply_ps_change')
          .eq('partner_id', partnerProfile.id)
          .maybeSingle()

      if (permissionError) {
        return json(res, 500, {
          ok: false,
          error: permissionError.message,
        })
      }

      if (permission && permission.can_apply_ps_change === false) {
        return json(res, 403, {
          ok: false,
          error: 'Permission apply PS change belum aktif untuk user ini.',
        })
      }
    }

    const result = await runApply(adminClient, {
      actorUserId: user.id,
      requestId,
      force,
      limit,
      source: 'manual',
    })

    return json(res, 200, {
      ok: true,
      result,
      message:
        result?.applied_count > 0
          ? `${result.applied_count} PS request berhasil diterapkan.`
          : 'Tidak ada PS request yang perlu diterapkan.',
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
