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

function buildTree(partners) {
  const nodeMap = new Map(
    partners.map((partner) => [
      partner.id,
      {
        ...partner,
        children: [],
      },
    ])
  )

  const roots = []

  for (const partner of partners) {
    const node = nodeMap.get(partner.id)

    if (partner.parent_id && nodeMap.has(partner.parent_id)) {
      nodeMap.get(partner.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      const depthCompare =
        Number(a.hierarchy_depth || 0) -
        Number(b.hierarchy_depth || 0)

      if (depthCompare !== 0) return depthCompare

      return String(a.display_name || '').localeCompare(
        String(b.display_name || ''),
        'id-ID'
      )
    })

    for (const node of nodes) {
      sortNodes(node.children)
    }
  }

  sortNodes(roots)

  return roots
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Only GET requests are allowed.',
    })
  }

  try {
    await verifyAdmin(req)

    const includeInactive =
      String(req.query?.includeInactive || '').toLowerCase() === 'true'

    let partnerQuery = supabaseAdmin
      .from('ts_partner_network_view')
      .select('*')
      .order('hierarchy_depth', { ascending: true })
      .order('display_name', { ascending: true })

    if (!includeInactive) {
      partnerQuery = partnerQuery.neq('status', 'archived')
    }

    const { data: partners, error: partnerError } = await partnerQuery

    if (partnerError) {
      throw partnerError
    }

    const linkedClientIds = new Set(
      (partners || [])
        .map((partner) => partner.linked_client_id)
        .filter((value) => value !== null && value !== undefined)
        .map(String)
    )

    const { data: clients, error: clientError } = await supabaseAdmin
      .from('ts_clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (clientError) {
      throw clientError
    }

    const unlinkedClients = (clients || []).filter(
      (client) => !linkedClientIds.has(String(client.id))
    )

    const roleCounts = (partners || []).reduce((result, partner) => {
      const role = String(partner.role || 'unknown')
      result[role] = (result[role] || 0) + 1
      return result
    }, {})

    return res.status(200).json({
      ok: true,
      summary: {
        total: (partners || []).length,
        active: (partners || []).filter(
          (partner) => partner.status === 'active'
        ).length,
        inactive: (partners || []).filter(
          (partner) => partner.status !== 'active'
        ).length,
        roles: roleCounts,
        unlinkedClients: unlinkedClients.length,
      },
      partners: partners || [],
      tree: buildTree(partners || []),
      unlinkedClients,
    })
  } catch (error) {
    console.error('ADMIN_NETWORK_ERROR:', error)

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

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        'Gagal memuat struktur jaringan TERNAKSUKSES.',
    })
  }
}
