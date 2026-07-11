import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const cronSecret = process.env.CRON_SECRET

function json(res, status, data) {
  res.status(status).json(data)
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return json(res, 405, {
        ok: false,
        error: 'Method not allowed',
      })
    }

    const authHeader = req.headers.authorization || ''

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return json(res, 401, {
        ok: false,
        error: 'Unauthorized cron request',
      })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return json(res, 500, {
        ok: false,
        error: 'Missing Supabase environment variables',
      })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: result, error: rpcError } =
      await adminClient.rpc('ts_apply_due_ps_setting_changes', {
        p_actor_user_id: null,
        p_request_id: null,
        p_force: false,
        p_limit: 100,
      })

    if (rpcError) {
      return json(res, 500, {
        ok: false,
        error: rpcError.message,
      })
    }

    const appliedCount = result?.applied_count || 0
    const skippedCount = result?.skipped_count || 0

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
          source: 'cron-apply-ps-requests',
          result,
        },
      })

    return json(res, 200, {
      ok: true,
      result,
      message:
        appliedCount > 0
          ? `${appliedCount} PS request berhasil diterapkan otomatis.`
          : 'Cron jalan. Tidak ada PS request due.',
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
