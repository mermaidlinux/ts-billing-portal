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

function sortByNumberOrDate(rows, numberKey, dateKey) {
  return [...(rows || [])].sort((a, b) => {
    const aNumber = Number(a?.[numberKey])
    const bNumber = Number(b?.[numberKey])

    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber
    }

    const aDate = new Date(a?.[dateKey] || a?.created_at || 0).getTime()
    const bDate = new Date(b?.[dateKey] || b?.created_at || 0).getTime()

    return aDate - bDate
  })
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

    const [
      tiersResult,
      masterSplitsResult,
      distributionRulesResult,
      distributionItemsResult,
      clientSettingsResult,
      fxSnapshotsResult,
      partnersResult,
    ] = await Promise.all([
      adminClient.from('ts_ps_tiers').select('*'),
      adminClient.from('ts_ps_master_split_settings').select('*'),
      adminClient.from('ts_ps_distribution_rules').select('*'),
      adminClient.from('ts_ps_distribution_rule_items').select('*'),
      adminClient.from('ts_ps_client_settings').select('*'),
      adminClient.from('ts_fx_rate_snapshots').select('*'),
      adminClient
        .from('ts_partner_profiles')
        .select('id, role, display_name, parent_id, root_master_id, is_client, status'),
    ])

    const results = [
      tiersResult,
      masterSplitsResult,
      distributionRulesResult,
      distributionItemsResult,
      clientSettingsResult,
      fxSnapshotsResult,
      partnersResult,
    ]

    const firstError = results.find((item) => item.error)?.error

    if (firstError) {
      return json(res, 500, {
        ok: false,
        error: firstError.message,
      })
    }

    const tiers = sortByNumberOrDate(
      tiersResult.data || [],
      'sort_order',
      'created_at'
    )

    const masterSplits = sortByNumberOrDate(
      masterSplitsResult.data || [],
      'sort_order',
      'effective_from'
    )

    const distributionRules = sortByNumberOrDate(
      distributionRulesResult.data || [],
      'sort_order',
      'created_at'
    )

    const distributionItems = sortByNumberOrDate(
      distributionItemsResult.data || [],
      'upline_level',
      'created_at'
    )

    const clientSettings = sortByNumberOrDate(
      clientSettingsResult.data || [],
      'sort_order',
      'effective_from'
    )

    const fxSnapshots = sortByNumberOrDate(
      fxSnapshotsResult.data || [],
      'sort_order',
      'source_date'
    )

    const partners = partnersResult.data || []

    const partnerMap = {}

    for (const partner of partners) {
      partnerMap[partner.id] = partner
    }

    const summary = {
      tiers: tiers.length,
      master_splits: masterSplits.length,
      distribution_rules: distributionRules.length,
      distribution_items: distributionItems.length,
      client_settings: clientSettings.length,
      fx_snapshots: fxSnapshots.length,
      partners: partners.length,
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
      summary,
      data: {
        tiers,
        master_splits: masterSplits,
        distribution_rules: distributionRules,
        distribution_items: distributionItems,
        client_settings: clientSettings,
        fx_snapshots: fxSnapshots,
        partners,
        partner_map: partnerMap,
      },
    })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Unexpected error',
    })
  }
}
