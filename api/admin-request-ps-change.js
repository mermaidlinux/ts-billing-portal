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

function formatTierLabel(tier) {
  if (!tier) return '-'
  return `${tier.tier_code || '-'} — ${tier.tier_name || '-'} (${tier.ps_fee_rate || 0}%)`
}

function cleanNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)

  if (!Number.isFinite(number)) return null

  return number
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

    const clientSettingId = body.clientSettingId
    const newPsTierId = body.newPsTierId
    const psFeeRateOverride = cleanNullableNumber(body.psFeeRateOverride)
    const fxMode = body.fxMode || 'MANUAL'
    const fixedFxRate = cleanNullableNumber(body.fixedFxRate)
    const note = body.note || ''
    const effectiveFromGmt7 = body.effectiveFromGmt7
    const effectiveFromBroker = body.effectiveFromBroker
    const ticketApplyRule =
      body.ticketApplyRule || 'CLOSE_TIME_BROKER_GTE_EFFECTIVE_FROM'

    if (!clientSettingId) {
      return json(res, 400, {
        ok: false,
        error: 'clientSettingId wajib diisi',
      })
    }

    if (!newPsTierId) {
      return json(res, 400, {
        ok: false,
        error: 'newPsTierId wajib diisi',
      })
    }

    if (!effectiveFromGmt7) {
      return json(res, 400, {
        ok: false,
        error: 'effectiveFromGmt7 wajib diisi',
      })
    }

    if (!effectiveFromBroker) {
      return json(res, 400, {
        ok: false,
        error: 'effectiveFromBroker wajib diisi',
      })
    }

    const allowedRules = [
      'CLOSE_TIME_BROKER_GTE_EFFECTIVE_FROM',
      'OPEN_TIME_BROKER_GTE_EFFECTIVE_FROM',
      'MANUAL_REVIEW_REQUIRED',
    ]

    if (!allowedRules.includes(ticketApplyRule)) {
      return json(res, 400, {
        ok: false,
        error: 'ticketApplyRule tidak valid',
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

    const { data: adminPartner, error: partnerError } =
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
      adminPartner &&
      adminPartner.role === 'admin' &&
      adminPartner.status === 'active'

    if (!isAdminEmail && !isAdminPartner) {
      return json(res, 403, {
        ok: false,
        error: 'Admin access required',
      })
    }

    const { data: currentSetting, error: settingError } =
      await adminClient
        .from('ts_ps_client_settings')
        .select('*')
        .eq('id', clientSettingId)
        .maybeSingle()

    if (settingError) {
      return json(res, 500, {
        ok: false,
        error: settingError.message,
      })
    }

    if (!currentSetting) {
      return json(res, 404, {
        ok: false,
        error: 'Client PS setting tidak ditemukan',
      })
    }

    const { data: clientPartner, error: clientError } =
      await adminClient
        .from('ts_partner_profiles')
        .select('id, role, display_name, parent_id, root_master_id, is_client, status')
        .eq('id', currentSetting.client_partner_id)
        .maybeSingle()

    if (clientError) {
      return json(res, 500, {
        ok: false,
        error: clientError.message,
      })
    }

    if (!clientPartner) {
      return json(res, 404, {
        ok: false,
        error: 'Client partner tidak ditemukan',
      })
    }

    const { data: oldTier } =
      await adminClient
        .from('ts_ps_tiers')
        .select('*')
        .eq('id', currentSetting.ps_tier_id)
        .maybeSingle()

    const { data: newTier, error: newTierError } =
      await adminClient
        .from('ts_ps_tiers')
        .select('*')
        .eq('id', newPsTierId)
        .maybeSingle()

    if (newTierError) {
      return json(res, 500, {
        ok: false,
        error: newTierError.message,
      })
    }

    if (!newTier) {
      return json(res, 404, {
        ok: false,
        error: 'PS tier baru tidak ditemukan',
      })
    }

    const { data: accounts, error: accountsError } =
      await adminClient
        .from('ts_ps_accounts')
        .select('*')
        .eq('client_partner_id', currentSetting.client_partner_id)
        .eq('status', 'active')

    if (accountsError) {
      return json(res, 500, {
        ok: false,
        error: accountsError.message,
      })
    }

    const oldSummaryParts = [
      `Tier: ${formatTierLabel(oldTier)}`,
      `Override: ${
        currentSetting.ps_fee_rate_override === null ||
        currentSetting.ps_fee_rate_override === undefined
          ? '-'
          : `${currentSetting.ps_fee_rate_override}%`
      }`,
      `FX: ${currentSetting.fx_mode || '-'}`,
      `Fixed FX: ${currentSetting.fixed_fx_rate || '-'}`,
    ]

    const newSummaryParts = [
      `Tier: ${formatTierLabel(newTier)}`,
      `Override: ${
        psFeeRateOverride === null || psFeeRateOverride === undefined
          ? '-'
          : `${psFeeRateOverride}%`
      }`,
      `FX: ${fxMode}`,
      `Fixed FX: ${fixedFxRate || '-'}`,
    ]

    const requestCode =
      `PS-CHANGE-${new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 14)}`

    const oldData = {
      client_setting_id: currentSetting.id,
      client_partner_id: currentSetting.client_partner_id,
      ps_tier_id: currentSetting.ps_tier_id,
      ps_tier: oldTier || null,
      ps_fee_rate_override: currentSetting.ps_fee_rate_override,
      fx_mode: currentSetting.fx_mode,
      fixed_fx_rate: currentSetting.fixed_fx_rate,
      effective_from: currentSetting.effective_from,
    }

    const newData = {
      client_setting_id: currentSetting.id,
      client_partner_id: currentSetting.client_partner_id,
      ps_tier_id: newPsTierId,
      ps_tier: newTier,
      ps_fee_rate_override: psFeeRateOverride,
      fx_mode: fxMode,
      fixed_fx_rate: fixedFxRate,
      effective_from_gmt7: effectiveFromGmt7,
      effective_from_broker: effectiveFromBroker,
      ticket_apply_rule: ticketApplyRule,
    }

    const { data: request, error: requestError } =
      await adminClient
        .from('ts_setting_change_requests')
        .insert({
          request_code: requestCode,
          setting_scope: 'CLIENT_PS_SETTING',
          target_entity_type: 'ts_ps_client_settings',
          target_entity_id: String(currentSetting.id),
          target_partner_id: currentSetting.client_partner_id,
          target_display_name: clientPartner.display_name,

          requested_by_user_id: user.id,
          requested_by_partner_id: adminPartner?.id || null,
          requested_by_role: adminPartner?.role || 'admin',
          requested_by_display_name:
            adminPartner?.display_name || userEmail || 'Admin',

          approval_required: true,
          approval_status: 'scheduled',

          effective_from: effectiveFromGmt7,
          effective_policy: 'NEXT_PERIOD_OR_SELECTED_DATE',
          affects_current_period: false,

          old_value_summary: oldSummaryParts.join(' | '),
          new_value_summary: newSummaryParts.join(' | '),
          old_data: oldData,
          new_data: newData,

          note:
            note ||
            'Request perubahan PS client dibuat dari Admin PS Settings.',
          requires_broker_window: true,
          ticket_apply_rule: ticketApplyRule,
          updated_by: user.id,
        })
        .select('*')
        .single()

    if (requestError) {
      return json(res, 500, {
        ok: false,
        error: requestError.message,
      })
    }

    const brokerWindows = []
    const brokerWindowErrors = []

    for (const account of accounts || []) {
      const { data: windowId, error: windowError } =
        await adminClient.rpc('ts_add_setting_change_broker_window', {
          p_setting_change_id: request.id,
          p_account_id: account.id,
          p_effective_from_gmt7: effectiveFromGmt7,
          p_effective_from_broker: effectiveFromBroker,
          p_effective_until_gmt7: null,
          p_effective_until_broker: null,
          p_applies_to_ticket_rule: ticketApplyRule,
          p_status: 'scheduled',
          p_note:
            note ||
            'Broker window dibuat otomatis dari request perubahan PS.',
          p_actor_user_id: user.id,
        })

      if (windowError) {
        brokerWindowErrors.push({
          account_id: account.id,
          broker_server: account.broker_server,
          account_number: account.account_number,
          error: windowError.message,
        })
      } else {
        brokerWindows.push({
          id: windowId,
          account_id: account.id,
          broker_name: account.broker_name,
          broker_server: account.broker_server,
          account_number: account.account_number,
        })
      }
    }

    if (!accounts || accounts.length === 0) {
      await adminClient
        .from('ts_setting_change_requests')
        .update({
          broker_effective_summary:
            'Belum ada PS account aktif. Broker window belum dibuat.',
          broker_window_count: 0,
          updated_by: user.id,
        })
        .eq('id', request.id)
    }

    await adminClient
      .from('ts_activity_logs')
      .insert({
        activity_key: `PS_SETTING_CHANGE_REQUEST:${request.id}`,
        activity_type: 'SETTING_CHANGE',
        severity: brokerWindowErrors.length > 0 ? 'warning' : 'success',

        actor_user_id: user.id,
        actor_partner_id: adminPartner?.id || null,
        actor_display_name:
          adminPartner?.display_name || userEmail || 'Admin',
        actor_role: adminPartner?.role || 'admin',

        target_entity_type: 'setting_change_request',
        target_entity_id: request.id,
        target_partner_id: currentSetting.client_partner_id,
        target_display_name: clientPartner.display_name,

        action: 'PS_SETTING_CHANGE_REQUESTED',
        title: 'Request perubahan PS dibuat',
        message:
          `Request perubahan PS untuk ${clientPartner.display_name} dibuat. ` +
          `Setting baru berlaku berdasarkan broker time.`,

        old_value_summary: oldSummaryParts.join(' | '),
        new_value_summary: newSummaryParts.join(' | '),
        old_data: oldData,
        new_data: {
          ...newData,
          broker_windows: brokerWindows,
          broker_window_errors: brokerWindowErrors,
        },

        approval_status: 'scheduled',
        gmt7_time: new Date().toISOString(),
        metadata: {
          source: 'admin-ps-settings',
          request_id: request.id,
          broker_window_count: brokerWindows.length,
          broker_window_error_count: brokerWindowErrors.length,
        },
      })

    return json(res, 200, {
      ok: true,
      request,
      broker_windows: brokerWindows,
      broker_window_errors: brokerWindowErrors,
      message:
        brokerWindowErrors.length > 0
          ? 'Request dibuat, tapi ada broker window yang gagal dibuat.'
          : 'Request perubahan PS berhasil dibuat.',
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
