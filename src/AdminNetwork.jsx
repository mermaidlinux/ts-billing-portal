import { useEffect, useMemo, useState } from 'react'

const panelStyle = {
  marginTop: 24,
  padding: 22,
  border: '1px solid rgba(255, 211, 105, 0.22)',
  borderRadius: 22,
  background:
    'linear-gradient(145deg, rgba(6, 22, 39, 0.96), rgba(7, 31, 52, 0.86))',
  boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
}

const cardStyle = {
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 18,
  background: 'rgba(255, 255, 255, 0.045)',
  padding: 16,
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  color: '#b9d7ff',
  fontSize: 13,
  fontWeight: 700,
}

const inputStyle = {
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(2, 12, 24, 0.82)',
  color: '#ffffff',
  padding: '0 12px',
  outline: 'none',
  fontSize: 14,
  boxSizing: 'border-box',
}

const primaryButtonStyle = {
  minHeight: 46,
  border: 0,
  borderRadius: 14,
  background: 'linear-gradient(135deg, #ffd369, #f3a712)',
  color: '#07111f',
  fontWeight: 900,
  cursor: 'pointer',
  padding: '0 18px',
  boxShadow: '0 12px 30px rgba(255, 211, 105, 0.18)',
}

const secondaryButtonStyle = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255, 211, 105, 0.45)',
  background: 'rgba(255, 211, 105, 0.08)',
  color: '#ffd369',
  fontWeight: 800,
  cursor: 'pointer',
  padding: '0 16px',
}

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

function roleBadgeStyle(role) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 74,
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
  }

  if (role === 'admin') {
    return {
      ...base,
      color: '#07111f',
      background: '#ffd369',
    }
  }

  if (role === 'master') {
    return {
      ...base,
      color: '#ffffff',
      background: 'rgba(46, 204, 113, 0.22)',
      border: '1px solid rgba(46, 204, 113, 0.42)',
    }
  }

  if (role === 'agent') {
    return {
      ...base,
      color: '#ffffff',
      background: 'rgba(52, 152, 219, 0.22)',
      border: '1px solid rgba(52, 152, 219, 0.42)',
    }
  }

  return {
    ...base,
    color: '#ffffff',
    background: 'rgba(155, 89, 182, 0.22)',
    border: '1px solid rgba(155, 89, 182, 0.42)',
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

function getClientDisplayName(client) {
  return (
    client.client_name ||
    client.name ||
    client.email ||
    client.whatsapp ||
    client.id
  )
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
        throw new Error(result.error || 'Gagal memuat jaringan partner.')
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
      setNetworkError(error.message || 'Gagal memuat jaringan partner.')
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
        throw new Error(result.error || 'Gagal membuat partner.')
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
      setNetworkError(error.message || 'Gagal membuat partner.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              color: '#ffd369',
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: 1.4,
              marginBottom: 8,
            }}
          >
            TERNAKSUKSES ECOSYSTEM
          </div>

          <h2
            style={{
              margin: 0,
              color: '#ffffff',
              fontSize: 24,
              lineHeight: 1.15,
            }}
          >
            Jaringan Master / Agent / Client
          </h2>

          <p
            style={{
              margin: '8px 0 0',
              color: '#9fb9d8',
              maxWidth: 620,
              lineHeight: 1.55,
              fontSize: 14,
            }}
          >
            Atur struktur upline, downline, client lama, dan partner yang juga
            memakai layanan. Fondasi ini nanti dipakai untuk VPS, PS, invoice,
            dan distribusi komisi.
          </p>
        </div>

        <button
          type="button"
          style={{
            ...secondaryButtonStyle,
            opacity: loading ? 0.65 : 1,
          }}
          onClick={loadNetwork}
          disabled={loading}
        >
          {loading ? 'Memuat...' : '↻ Refresh'}
        </button>
      </div>

      {networkError && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 14,
            color: '#ffb4b4',
            background: 'rgba(255, 75, 75, 0.12)',
            border: '1px solid rgba(255, 75, 75, 0.25)',
            fontWeight: 700,
          }}
        >
          {networkError}
        </div>
      )}

      {networkMessage && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 14,
            color: '#b7ffcf',
            background: 'rgba(46, 204, 113, 0.12)',
            border: '1px solid rgba(46, 204, 113, 0.25)',
            fontWeight: 700,
          }}
        >
          {networkMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          ['Total Partner', summary?.total || 0],
          ['Master', summary?.roles?.master || 0],
          ['Agent', summary?.roles?.agent || 0],
          ['Client Belum Link', summary?.unlinkedClients || 0],
        ].map(([label, value]) => (
          <div key={label} style={cardStyle}>
            <div
              style={{
                color: '#9fb9d8',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              {label}
            </div>
            <div
              style={{
                color: '#ffd369',
                fontSize: 26,
                fontWeight: 900,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
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
            <h3
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: 18,
              }}
            >
              Tambah Partner Baru
            </h3>
            <p
              style={{
                margin: '6px 0 0',
                color: '#9fb9d8',
                fontSize: 13,
              }}
            >
              Master, Agent, dan Client dapat dibuat dari sini. Client juga
              bisa punya downline bila permission diaktifkan nanti.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreatePartner}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            <label style={labelStyle}>
              Role
              <select
                style={inputStyle}
                value={form.role}
                onChange={(event) => updateForm('role', event.target.value)}
                disabled={creating}
              >
                <option value="master">Master</option>
                <option value="agent">Agent</option>
                <option value="client">Client</option>
              </select>
            </label>

            <label style={labelStyle}>
              Parent / Upline
              <select
                style={inputStyle}
                value={form.parentId}
                onChange={(event) => updateForm('parentId', event.target.value)}
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

            <label style={labelStyle}>
              Nama Partner
              <input
                style={inputStyle}
                value={form.displayName}
                onChange={(event) =>
                  updateForm('displayName', event.target.value)
                }
                placeholder="Contoh: Master Will"
                disabled={creating}
                required
              />
            </label>

            <label style={labelStyle}>
              WhatsApp
              <input
                style={inputStyle}
                value={form.whatsapp}
                onChange={(event) => updateForm('whatsapp', event.target.value)}
                placeholder="628xxxx"
                disabled={creating}
              />
            </label>

            <label style={labelStyle}>
              Email
              <input
                style={inputStyle}
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                placeholder="opsional"
                disabled={creating}
              />
            </label>

            <label style={labelStyle}>
              Link ke Client Lama
              <select
                style={inputStyle}
                value={form.linkedClientId}
                onChange={(event) =>
                  updateForm('linkedClientId', event.target.value)
                }
                disabled={creating}
              >
                <option value="">Tidak di-link dulu</option>
                {unlinkedClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {getClientDisplayName(client)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
              marginTop: 18,
            }}
          >
            {form.role !== 'client' ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: '#d6e8ff',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.isClient}
                  onChange={(event) =>
                    updateForm('isClient', event.target.checked)
                  }
                  disabled={creating}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: '#ffd369',
                  }}
                />
                Partner ini juga client layanan
              </label>
            ) : (
              <div
                style={{
                  color: '#9fb9d8',
                  fontSize: 13,
                }}
              >
                Role client otomatis dianggap sebagai pengguna layanan.
              </div>
            )}

            <button
              type="submit"
              style={{
                ...primaryButtonStyle,
                opacity: creating ? 0.65 : 1,
              }}
              disabled={creating}
            >
              {creating ? 'Menyimpan...' : '+ Tambah Partner'}
            </button>
          </div>
        </form>
      </div>

      <div
        style={{
          ...cardStyle,
          marginTop: 16,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: '#ffffff', fontSize: 18 }}>
              Struktur Jaringan
            </h3>
            <p
              style={{
                margin: '6px 0 0',
                color: '#9fb9d8',
                fontSize: 13,
              }}
            >
              Tampilan bertingkat berdasarkan parent/upline.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 820,
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'rgba(255, 211, 105, 0.08)',
                  color: '#ffd369',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
              >
                <th style={{ textAlign: 'left', padding: 13 }}>Nama</th>
                <th style={{ textAlign: 'left', padding: 13 }}>Role</th>
                <th style={{ textAlign: 'left', padding: 13 }}>Parent</th>
                <th style={{ textAlign: 'left', padding: 13 }}>
                  Root Master
                </th>
                <th style={{ textAlign: 'left', padding: 13 }}>Client?</th>
                <th style={{ textAlign: 'left', padding: 13 }}>Downline</th>
                <th style={{ textAlign: 'left', padding: 13 }}>Status</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((partner) => (
                <tr
                  key={partner.id}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <td style={{ padding: 13 }}>
                    <div
                      style={{
                        paddingLeft: partner.visualDepth * 24,
                        color: '#ffffff',
                        fontWeight: 850,
                      }}
                    >
                      {partner.visualDepth > 0 ? '↳ ' : ''}
                      {partner.display_name}
                    </div>

                    <div
                      style={{
                        paddingLeft: partner.visualDepth * 24,
                        color: '#8faac8',
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {partner.email || partner.whatsapp || '-'}
                    </div>
                  </td>

                  <td style={{ padding: 13 }}>
                    <span style={roleBadgeStyle(partner.role)}>
                      {roleLabel(partner.role)}
                    </span>
                  </td>

                  <td style={{ padding: 13, color: '#d6e8ff' }}>
                    {partner.parent_name || '-'}
                  </td>

                  <td style={{ padding: 13, color: '#d6e8ff' }}>
                    {partner.root_master_name || '-'}
                  </td>

                  <td style={{ padding: 13, color: '#d6e8ff' }}>
                    {partner.is_client ? 'Ya' : 'Tidak'}
                  </td>

                  <td style={{ padding: 13, color: '#d6e8ff' }}>
                    {partner.total_descendants_count || 0}
                  </td>

                  <td style={{ padding: 13 }}>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: '6px 10px',
                        color:
                          partner.status === 'active'
                            ? '#b7ffcf'
                            : '#ffd369',
                        background:
                          partner.status === 'active'
                            ? 'rgba(46, 204, 113, 0.12)'
                            : 'rgba(255, 211, 105, 0.12)',
                        border:
                          partner.status === 'active'
                            ? '1px solid rgba(46, 204, 113, 0.28)'
                            : '1px solid rgba(255, 211, 105, 0.28)',
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      {partner.status}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td
                    colSpan="7"
                    style={{
                      padding: 22,
                      color: '#9fb9d8',
                      textAlign: 'center',
                    }}
                  >
                    Belum ada data jaringan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
