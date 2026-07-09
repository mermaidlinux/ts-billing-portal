import { useEffect, useMemo, useState } from 'react'

function readJsonResponse(response) {
  return response.text().then((text) => {
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      return {
        ok: false,
        error: text || 'Respons server tidak valid.',
      }
    }
  })
}

function roleLabel(role) {
  switch (role) {
    case 'admin':
      return 'Admin TS'
    case 'master':
      return 'Master'
    case 'agent':
      return 'Agent'
    case 'client':
      return 'Client'
    default:
      return role || '-'
  }
}

function buildIndentedRows(nodes, depth = 0) {
  const rows = []

  for (const node of nodes || []) {
    rows.push({
      ...node,
      visualDepth: depth,
    })

    rows.push(...buildIndentedRows(node.children || [], depth + 1))
  }

  return rows
}

export default function AdminNetwork({ session }) {
  const [loading, setLoading] = useState(false)
  const [networkError, setNetworkError] = useState('')
  const [networkMessage, setNetworkMessage] = useState('')
  const [summary, setSummary] = useState(null)
  const [partners, setPartners] = useState([])
  const [tree, setTree] = useState([])
  const [unlinkedClients, setUnlinkedClients] = useState([])

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    role: 'master',
    parentId: '',
    displayName: '',
    email: '',
    whatsapp: '',
    linkedClientId: '',
    isClient: false,
  })

  const visibleRows = useMemo(() => {
    return buildIndentedRows(tree)
  }, [tree])

  const parentOptions = useMemo(() => {
    return partners.filter((partner) => partner.status !== 'archived')
  }, [partners])

  async function loadNetwork() {
    if (!session?.access_token) return

    setLoading(true)
    setNetworkError('')
    setNetworkMessage('')

    try {
      const response = await fetch('/api/admin-network', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const result = await readJsonResponse(response)

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || 'Gagal memuat jaringan partner.'
        )
      }

      setSummary(result.summary || null)
      setPartners(result.partners || [])
      setTree(result.tree || [])
      setUnlinkedClients(result.unlinkedClients || [])

      if (!form.parentId && result.partners?.[0]?.id) {
        setForm((current) => ({
          ...current,
          parentId: result.partners[0].id,
        }))
      }
    } catch (error) {
      setNetworkError(
        error.message || 'Gagal memuat jaringan partner.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNetwork()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token])

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleCreatePartner(event) {
    event.preventDefault()

    if (!session?.access_token) {
      setNetworkError('Sesi admin tidak tersedia.')
      return
    }

    if (!form.parentId) {
      setNetworkError('Pilih parent/upline terlebih dahulu.')
      return
    }

    if (!form.displayName.trim()) {
      setNetworkError('Nama partner wajib diisi.')
      return
    }

    setCreating(true)
    setNetworkError('')
    setNetworkMessage('')

    try {
      const response = await fetch('/api/admin-partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'create',
          role: form.role,
          parentId: form.parentId,
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          whatsapp: form.whatsapp.trim(),
          linkedClientId: form.linkedClientId || null,
          isClient: form.role === 'client' ? true : form.isClient,
        }),
      })

      const result = await readJsonResponse(response)

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || 'Gagal membuat partner.'
        )
      }

      setNetworkMessage(
        `${roleLabel(form.role)} "${form.displayName}" berhasil dibuat.`
      )

      setForm((current) => ({
        ...current,
        displayName: '',
        email: '',
        whatsapp: '',
        linkedClientId: '',
        isClient: false,
      }))

      await loadNetwork()
    } catch (error) {
      setNetworkError(
        error.message || 'Gagal membuat partner.'
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 20,
        border: '1px solid rgba(255, 211, 105, 0.25)',
        borderRadius: 18,
        background: 'rgba(6, 22, 39, 0.75)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: '#ffd369',
              fontWeight: 800,
              letterSpacing: 1,
              fontSize: 12,
            }}
          >
            TERNAKSUKSES ECOSYSTEM
          </p>
          <h2 style={{ margin: '6px 0 0' }}>
            Jaringan Master / Agent / Client
          </h2>
        </div>

        <button
          type="button"
          className="adminSecondaryButton"
          onClick={loadNetwork}
          disabled={loading}
        >
          {loading ? 'Memuat...' : '↻ Refresh Jaringan'}
        </button>
      </div>

      {networkError && (
        <div className="adminAlert error">{networkError}</div>
      )}

      {networkMessage && (
        <div className="adminAlert success">{networkMessage}</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div className="adminSummary">
          <div>
            <span>Total Partner</span>
            <strong>{summary?.total || 0}</strong>
          </div>
        </div>

        <div className="adminSummary">
          <div>
            <span>Master</span>
            <strong>{summary?.roles?.master || 0}</strong>
          </div>
        </div>

        <div className="adminSummary">
          <div>
            <span>Agent</span>
            <strong>{summary?.roles?.agent || 0}</strong>
          </div>
        </div>

        <div className="adminSummary">
          <div>
            <span>Client Belum Link</span>
            <strong>{summary?.unlinkedClients || 0}</strong>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleCreatePartner}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 22,
          padding: 16,
          border: '1px dashed rgba(255, 255, 255, 0.18)',
          borderRadius: 14,
        }}
      >
        <label>
          Role
          <select
            value={form.role}
            onChange={(event) => updateForm('role', event.target.value)}
            disabled={creating}
          >
            <option value="master">Master</option>
            <option value="agent">Agent</option>
            <option value="client">Client</option>
          </select>
        </label>

        <label>
          Parent / Upline
          <select
            value={form.parentId}
            onChange={(event) =>
              updateForm('parentId', event.target.value)
            }
            disabled={creating}
            required
          >
            <option value="">Pilih parent</option>
            {parentOptions.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {'—'.repeat(Number(partner.hierarchy_depth || 0))}{' '}
                {partner.display_name} ({roleLabel(partner.role)})
              </option>
            ))}
          </select>
        </label>

        <label>
          Nama
          <input
            value={form.displayName}
            onChange={(event) =>
              updateForm('displayName', event.target.value)
            }
            placeholder="Contoh: Master Will"
            disabled={creating}
            required
          />
        </label>

        <label>
          WhatsApp
          <input
            value={form.whatsapp}
            onChange={(event) =>
              updateForm('whatsapp', event.target.value)
            }
            placeholder="628xxxx"
            disabled={creating}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateForm('email', event.target.value)}
            placeholder="opsional"
            disabled={creating}
          />
        </label>

        <label>
          Link ke Client Lama
          <select
            value={form.linkedClientId}
            onChange={(event) =>
              updateForm('linkedClientId', event.target.value)
            }
            disabled={creating}
          >
            <option value="">Tidak di-link dulu</option>
            {unlinkedClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.client_name ||
                  client.name ||
                  client.email ||
                  client.whatsapp ||
                  client.id}
              </option>
            ))}
          </select>
        </label>

        {form.role !== 'client' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 20,
            }}
          >
            <input
              type="checkbox"
              checked={form.isClient}
              onChange={(event) =>
                updateForm('isClient', event.target.checked)
              }
              disabled={creating}
            />
            Partner ini juga client layanan
          </label>
        )}

        <button
          type="submit"
          className="adminPrimaryButton"
          disabled={creating}
          style={{ alignSelf: 'end' }}
        >
          {creating ? 'Menyimpan...' : 'Tambah Partner'}
        </button>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 760,
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 10 }}>Nama</th>
              <th style={{ textAlign: 'left', padding: 10 }}>Role</th>
              <th style={{ textAlign: 'left', padding: 10 }}>
                Parent
              </th>
              <th style={{ textAlign: 'left', padding: 10 }}>
                Root Master
              </th>
              <th style={{ textAlign: 'left', padding: 10 }}>
                Client?
              </th>
              <th style={{ textAlign: 'left', padding: 10 }}>
                Downline
              </th>
              <th style={{ textAlign: 'left', padding: 10 }}>
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((partner) => (
              <tr
                key={partner.id}
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <td style={{ padding: 10 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      paddingLeft: partner.visualDepth * 22,
                    }}
                  >
                    {partner.visualDepth > 0 ? '↳ ' : ''}
                    <strong>{partner.display_name}</strong>
                  </span>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {partner.email || partner.whatsapp || '-'}
                  </div>
                </td>

                <td style={{ padding: 10 }}>
                  {roleLabel(partner.role)}
                </td>

                <td style={{ padding: 10 }}>
                  {partner.parent_name || '-'}
                </td>

                <td style={{ padding: 10 }}>
                  {partner.root_master_name || '-'}
                </td>

                <td style={{ padding: 10 }}>
                  {partner.is_client ? 'Ya' : 'Tidak'}
                </td>

                <td style={{ padding: 10 }}>
                  {partner.total_descendants_count || 0}
                </td>

                <td style={{ padding: 10 }}>
                  {partner.status}
                </td>
              </tr>
            ))}

            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: 18 }}>
                  Belum ada data jaringan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
