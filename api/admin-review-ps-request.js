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

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
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

    const body = parseBody(req)

    const requestId = body.requestId
    const action = body.action
    const note = body.note || ''
    const rejectionReason = body.rejectionReason || note || ''

    if (!requestId) {
      return json(res, 400, {
        ok: false,
        error: 'requestId wajib diisi',
      })
    }

    if (!['approve', 'reject'].includes(action)) {
      return json(res, 400, {
        ok: false,
        error: 'action harus approve atau reject',
      })
    }

    if (action === 'reject' && !rejectionReason.trim()) {
      return json(res, 400, {
        ok: false,
        error: 'Alasan reject wajib diisi',
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
        error:
          'Admin TS only. Approve/Reject PS Request masih dikunci untuk Admin TS.',
      })
    }

    let permission = null

    if (partnerProfile?.id) {
      const { data: permissionData, error: permissionError } =
        await adminClient
          .from('ts_partner_permissions')
          .select('can_approve_ps_change, can_reject_ps_change')
          .eq('partner_id', partnerProfile.id)
          .maybeSingle()

      if (permissionError) {
        return json(res, 500, {
          ok: false,
          error: permissionError.message,
        })
      }

      permission = permissionData
    }

    if (
      action === 'approve' &&
      partnerProfile &&
      permission &&
      permission.can_approve_ps_change === false
    ) {
      return json(res, 403, {
        ok: false,
        error: 'Permission approve PS change belum aktif untuk user ini.',
      })
    }

    if (
      action === 'reject' &&
      partnerProfile &&
      permission &&
      permission.can_reject_ps_change === false
    ) {
      return json(res, 403, {
        ok: false,
        error: 'Permission reject PS change belum aktif untuk user ini.',
      })
    }

    const { data: request, error: requestError } =
      await adminClient
        .from('ts_setting_change_requests')
        .select('*')
        .eq('id', requestId)
        .eq('setting_scope', 'CLIENT_PS_SETTING')
        .maybeSingle()

    if (requestError) {
      return json(res, 500, {
        ok: false,
        error: requestError.message,
      })
    }

    if (!request) {
      return json(res, 404, {
        ok: false,
        error: 'PS request tidak ditemukan',
      })
    }

    const currentStatus = request.approval_status

    const lockedStatuses = [
      'approved',
      'rejected',
      'active',
      'cancelled',
      'superseded',
    ]

    if (lockedStatuses.includes(currentStatus)) {
      return json(res, 400, {
        ok: false,
        error: `Request sudah berstatus ${currentStatus}, tidak bisa diproses ulang.`,
      })
    }

    const nowIso = new Date().toISOString()

    let updatedRequest = null
    let brokerWindowWarning = null

    if (action === 'approve') {
      const { data, error } =
        await adminClient
          .from('ts_setting_change_requests')
          .update({
            approval_status: 'approved',

            approved_by_user_id: user.id,
            approved_by_partner_id: partnerProfile?.id || null,
            approved_at: nowIso,
            approval_note: note || 'Approved by Admin TS.',

            rejected_by_user_id: null,
            rejected_by_partner_id: null,
            rejected_at: null,
            rejection_reason: null,

            updated_by: user.id,
          })
          .eq('id', request.id)
          .select('*')
          .single()

      if (error) {
        return json(res, 500, {
          ok: false,
          error: error.message,
        })
      }

      updatedRequest = data

      const { error: windowError } =
        await adminClient
          .from('ts_setting_change_broker_windows')
          .update({
            status: 'approved',
          })
          .eq('setting_change_id', request.id)
          .in('status', [
            'draft',
            'pending_review',
            'waiting_approval',
            'scheduled',
          ])

      if (windowError) {
        brokerWindowWarning = windowError.message
      }
    }

    if (action === 'reject') {
      const { data, error } =
        await adminClient
          .from('ts_setting_change_requests')
          .update({
            approval_status: 'rejected',

            rejected_by_user_id: user.id,
            rejected_by_partner_id: partnerProfile?.id || null,
            rejected_at: nowIso,
            rejection_reason: rejectionReason.trim(),

            approved_by_user_id: null,
            approved_by_partner_id: null,
            approved_at: null,
            approval_note: null,

            updated_by: user.id,
          })
          .eq('id', request.id)
          .select('*')
          .single()

      if (error) {
        return json(res, 500, {
          ok: false,
          error: error.message,
        })
      }

      updatedRequest = data

      const { error: windowError } =
        await adminClient
          .from('ts_setting_change_broker_windows')
          .update({
            status: 'cancelled',
          })
          .eq('setting_change_id', request.id)
          .in('status', [
            'draft',
            'pending_review',
            'waiting_approval',
            'scheduled',
            'approved',
          ])

      if (windowError) {
        brokerWindowWarning = windowError.message
      }
    }

    const activityAction =
      action === 'approve'
        ? 'PS_SETTING_CHANGE_APPROVED'
        : 'PS_SETTING_CHANGE_REJECTED'

    const activityTitle =
      action === 'approve'
        ? 'PS Request disetujui'
        : 'PS Request ditolak'

    const activitySeverity =
      action === 'approve'
        ? 'success'
        : 'warning'

    const reviewNote =
      action === 'approve'
        ? note || 'Approved by Admin TS.'
        : rejectionReason.trim()

    const activityMessage =
      action === 'approve'
        ? `Request perubahan PS ${request.request_code} disetujui oleh Admin TS.`
        : `Request perubahan PS ${request.request_code} ditolak oleh Admin TS.`

    const { error: activityError } =
      await adminClient
        .from('ts_activity_logs')
        .insert({
          activity_key: `PS_REQUEST_REVIEW:${request.id}:${action}:${Date.now()}`,
          activity_type: 'PS_REQUEST',
          severity: activitySeverity,

          actor_user_id: user.id,
          actor_partner_id: partnerProfile?.id || null,
          actor_display_name:
            partnerProfile?.display_name || userEmail || 'Admin',
          actor_role: partnerProfile?.role || 'admin',

          target_entity_type: 'setting_change_request',
          target_entity_id: request.id,
          target_partner_id: request.target_partner_id || null,
          target_display_name: request.target_display_name || null,

          action: activityAction,
          title: activityTitle,
          message: activityMessage,

          old_value_summary: request.old_value_summary,
          new_value_summary: request.new_value_summary,
          old_data: request.old_data,
          new_data: {
            ...(request.new_data || {}),
            review_action: action,
            review_note: reviewNote,
            reviewed_at: nowIso,
            reviewed_by_user_id: user.id,
            reviewed_by_partner_id: partnerProfile?.id || null,
            broker_window_warning: brokerWindowWarning,
          },

          approval_status: updatedRequest.approval_status,
          gmt7_time: nowIso,

          metadata: {
            source: 'admin-review-ps-request',
            request_id: request.id,
            request_code: request.request_code,
            review_action: action,
            broker_window_warning: brokerWindowWarning,
          },
        })

    if (activityError) {
      return json(res, 500, {
        ok: false,
        error: activityError.message,
      })
    }

    return json(res, 200, {
      ok: true,
      action,
      request: updatedRequest,
      broker_window_warning: brokerWindowWarning,
      message:
        action === 'approve'
          ? 'PS Request berhasil di-approve.'
          : 'PS Request berhasil di-reject.',
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
