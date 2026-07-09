import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)

const ALLOWED_ROLES = new Set([
  'master',
  'agent',
  'client',
])

const ALLOWED_STATUSES = new Set([
  'active',
  'inactive',
  'suspended',
  'archived',
])

const BOOLEAN_PERMISSION_FIELDS = [
  'can_create_agent',
  'can_create_client',
  'can_set_vps_price',
  'can_set_ps_rules',
  'can_issue_invoice',
  'can_view_downline_finance',
]

function getAllowedAdminEmails() {
  return String(process.env.BILLING_ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

async function verifyAdmin(req) {
  const authorization = String(req.headers.authorization || '')

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED')
  }

  const accessToken = authorization.slice(7).trim()

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (error || !user?.email) {
    throw new Error('UNAUTHORIZED')
  }

  const allowedEmails = getAllowedAdminEmails()

  if (!allowedEmails.includes(user.email.toLowerCase())) {
    throw new Error('FORBIDDEN')
  }

  return user
}

function normalizeNullable(value) {
  if (value === null || value === undefined) return null

  const normalized = String(value).trim()
  return normalized || null
}

function normalizeEmail(value) {
  const normalized = normalizeNullable(value)
  return normalized ? normalized.toLowerCase() : null
}

function requireValue(value, message) {
  const normalized = normalizeNullable(value)

  if (!normalized) {
    const error = new Error(message)
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  return normalized
}

async function getPartner(partnerId) {
  const { data, error } = await supabaseAdmin
    .from('ts_partner_network_view')
    .select('*')
    .eq('id', partnerId)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    const notFoundError = new Error('Partner tidak ditemukan.')
    notFoundError.code = 'NOT_FOUND'
    throw notFoundError
  }

  return data
}

async function createPartner(body, adminUser) {
  const role = requireValue(
    body.role,
    'Role partner wajib dipilih.'
  ).toLowerCase()

  if (!ALLOWED_ROLES.has(role)) {
    const error = new Error(
      'Role baru hanya boleh master, agent, atau client.'
    )
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  const parentId = requireValue(
    body.parentId,
    'Parent/upline wajib dipilih.'
  )

  const displayName = requireValue(
    body.displayName,
    'Nama partner wajib diisi.'
  )

  const payload = {
    role,
    parent_id: parentId,
    display_name: displayName,
    email: normalizeEmail(body.email),
    whatsapp: normalizeNullable(body.whatsapp),
    auth_user_id: normalizeNullable(body.authUserId),
    linked_client_id: normalizeNullable(body.linkedClientId),
    is_client:
      role === 'client'
        ? true
        : Boolean(body.isClient || body.is_client),
    status: ALLOWED_STATUSES.has(
      String(body.status || '').toLowerCase()
    )
      ? String(body.status).toLowerCase()
      : 'active',
    metadata:
      body.metadata &&
      typeof body.metadata === 'object' &&
      !Array.isArray(body.metadata)
        ? body.metadata
        : {},
    created_by: adminUser.id,
    updated_by: adminUser.id,
  }

  const { data: partner, error } = await supabaseAdmin
    .from('ts_partner_profiles')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error

  if (
    body.permissions &&
    typeof body.permissions === 'object' &&
    !Array.isArray(body.permissions)
  ) {
    await updatePermissions(
      {
        partnerId: partner.id,
        permissions: body.permissions,
      },
      adminUser
    )
  }

  return getPartner(partner.id)
}

async function updateProfile(body, adminUser) {
  const partnerId = requireValue(
    body.partnerId,
    'Partner ID belum tersedia.'
  )

  const existing = await getPartner(partnerId)

  if (existing.role === 'admin') {
    const error = new Error(
      'Profil admin utama tidak diubah melalui endpoint partner.'
    )
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  const updatePayload = {
    updated_by: adminUser.id,
  }

  if (Object.hasOwn(body, 'displayName')) {
    updatePayload.display_name = requireValue(
      body.displayName,
      'Nama partner tidak boleh kosong.'
    )
  }

  if (Object.hasOwn(body, 'email')) {
    updatePayload.email = normalizeEmail(body.email)
  }

  if (Object.hasOwn(body, 'whatsapp')) {
    updatePayload.whatsapp = normalizeNullable(body.whatsapp)
  }

  if (Object.hasOwn(body, 'authUserId')) {
    updatePayload.auth_user_id = normalizeNullable(body.authUserId)
  }

  if (Object.hasOwn(body, 'linkedClientId')) {
    updatePayload.linked_client_id = normalizeNullable(body.linkedClientId)
  }

  if (Object.hasOwn(body, 'isClient')) {
    updatePayload.is_client =
      existing.role === 'client'
        ? true
        : Boolean(body.isClient)
  }

  if (Object.hasOwn(body, 'is_client')) {
    updatePayload.is_client =
      existing.role === 'client'
        ? true
        : Boolean(body.is_client)
  }

  if (Object.hasOwn(body, 'status')) {
    const status = String(body.status || '').toLowerCase()

    if (!ALLOWED_STATUSES.has(status)) {
      const error = new Error('Status partner tidak valid.')
      error.code = 'VALIDATION_ERROR'
      throw error
    }

    updatePayload.status = status
  }

  if (Object.hasOwn(body, 'metadata')) {
    if (
      !body.metadata ||
      typeof body.metadata !== 'object' ||
      Array.isArray(body.metadata)
    ) {
      const error = new Error(
        'Metadata partner harus berupa object JSON.'
      )
      error.code = 'VALIDATION_ERROR'
      throw error
    }

    updatePayload.metadata = body.metadata
  }

  const { error } = await supabaseAdmin
    .from('ts_partner_profiles')
    .update(updatePayload)
    .eq('id', partnerId)

  if (error) throw error

  return getPartner(partnerId)
}

async function movePartner(body, adminUser) {
  const partnerId = requireValue(
    body.partnerId,
    'Partner ID belum tersedia.'
  )

  const newParentId = requireValue(
    body.newParentId,
    'Parent/upline baru wajib dipilih.'
  )

  const existing = await getPartner(partnerId)

  if (existing.role === 'admin') {
    const error = new Error(
      'Admin TERNAKSUKSES tidak dapat dipindahkan.'
    )
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  const { error } = await supabaseAdmin
    .from('ts_partner_profiles')
    .update({
      parent_id: newParentId,
      updated_by: adminUser.id,
    })
    .eq('id', partnerId)

  if (error) throw error

  const movedPartner = await getPartner(partnerId)

  await supabaseAdmin.from('ts_audit_logs').insert({
    entity_type: 'partner_move_note',
    entity_id: partnerId,
    partner_id: partnerId,
    action: 'MOVE',
    actor_user_id: adminUser.id,
    note:
      normalizeNullable(body.note) ||
      `Partner dipindahkan ke parent ${newParentId}.`,
    new_data: {
      old_parent_id: existing.parent_id,
      new_parent_id: newParentId,
    },
  })

  return movedPartner
}

async function updatePermissions(body, adminUser) {
  const partnerId = requireValue(
    body.partnerId,
    'Partner ID belum tersedia.'
  )

  await getPartner(partnerId)

  const permissions =
    body.permissions &&
    typeof body.permissions === 'object' &&
    !Array.isArray(body.permissions)
      ? body.permissions
      : body

  const updatePayload = {
    partner_id: partnerId,
    updated_by: adminUser.id,
  }

  for (const field of BOOLEAN_PERMISSION_FIELDS) {
    if (Object.hasOwn(permissions, field)) {
      updatePayload[field] = Boolean(permissions[field])
    }
  }

  if (Object.hasOwn(permissions, 'max_commission_depth')) {
    const depth = Number(permissions.max_commission_depth)

    if (!Number.isInteger(depth) || depth < 1 || depth > 5) {
      const error = new Error(
        'Max commission depth harus angka 1 sampai 5.'
      )
      error.code = 'VALIDATION_ERROR'
      throw error
    }

    updatePayload.max_commission_depth = depth
  }

  if (Object.hasOwn(permissions, 'extra_permissions')) {
    if (
      !permissions.extra_permissions ||
      typeof permissions.extra_permissions !== 'object' ||
      Array.isArray(permissions.extra_permissions)
    ) {
      const error = new Error(
        'Extra permissions harus berupa object JSON.'
      )
      error.code = 'VALIDATION_ERROR'
      throw error
    }

    updatePayload.extra_permissions = permissions.extra_permissions
  }

  const { data: existingPermission, error: readError } =
    await supabaseAdmin
      .from('ts_partner_permissions')
      .select('id')
      .eq('partner_id', partnerId)
      .maybeSingle()

  if (readError) throw readError

  if (existingPermission) {
    const { error } = await supabaseAdmin
      .from('ts_partner_permissions')
      .update(updatePayload)
      .eq('partner_id', partnerId)

    if (error) throw error
  } else {
    updatePayload.created_by = adminUser.id

    const { error } = await supabaseAdmin
      .from('ts_partner_permissions')
      .insert(updatePayload)

    if (error) throw error
  }

  return getPartner(partnerId)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Only POST requests are allowed.',
    })
  }

  try {
    const adminUser = await verifyAdmin(req)
    const body = req.body || {}
    const action = String(body.action || '').toLowerCase()

    let partner = null

    switch (action) {
      case 'create':
        partner = await createPartner(body, adminUser)
        break

      case 'update':
        partner = await updateProfile(body, adminUser)
        break

      case 'move':
        partner = await movePartner(body, adminUser)
        break

      case 'permissions':
        partner = await updatePermissions(body, adminUser)
        break

      default: {
        const error = new Error(
          'Action harus create, update, move, atau permissions.'
        )
        error.code = 'VALIDATION_ERROR'
        throw error
      }
    }

    return res.status(200).json({
      ok: true,
      action,
      partner,
    })
  } catch (error) {
    console.error('ADMIN_PARTNERS_ERROR:', error)

    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({
        ok: false,
        error: 'Silakan login sebagai admin.',
      })
    }

    if (error.message === 'FORBIDDEN') {
      return res.status(403).json({
        ok: false,
        error: 'Akun ini tidak memiliki akses admin.',
      })
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        error: error.message,
      })
    }

    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        ok: false,
        error: error.message,
      })
    }

    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        error:
          'Data duplikat. Auth user atau client tersebut sudah terhubung ke partner lain.',
      })
    }

    if (error.code === '23503') {
      return res.status(400).json({
        ok: false,
        error:
          'Data parent, auth user, atau client yang dipilih tidak ditemukan.',
      })
    }

    if (error.code === '23514') {
      return res.status(400).json({
        ok: false,
        error:
          error.message ||
          'Data partner tidak memenuhi aturan hierarchy.',
      })
    }

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        'Gagal memproses partner TERNAKSUKSES.',
    })
  }
}
